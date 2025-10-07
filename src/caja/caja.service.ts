import { Injectable, Logger, InternalServerErrorException, NotFoundException, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { ClientSession, Model, Types } from 'mongoose';

import { Caja } from './schemas/caja.schema';
import { Credito } from '../credito/schemas/credito.schema';
import { AuthService } from '../auth/auth.service';
import { CierreCaja } from './schemas/cierre_caja.schema';
import { dateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { OpenRutaOptions } from 'src/interfaces/open-ruta-options.interface';
import { SubTipo, TipoMovimiento } from 'src/movimientoCaja/interfaces';
import { MovimientoCaja } from 'src/movimientoCaja/schemas/caja-movimiento.schemas';
import { CajaEntity } from './entities/caja.entity';
import { Ruta } from '../ruta/schema/ruta.schema';


@Injectable()
export class CajaService {

  private logger = new Logger("CajaService");

  constructor(
    @InjectModel(Caja.name)
    private readonly cajaModel: Model<Caja>,

    @InjectModel(Credito.name)
    private readonly creditoModel: Model<Credito>,

    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,

    @InjectModel(CierreCaja.name)
    private CcModel: Model<CierreCaja>,

    @InjectModel(Ruta.name)
    private rutaModel: Model<Ruta>,

    // @Inject(forwardRef(() => RutaService))
    // private rutaSvc: RutaService,
    private dateFnsAdapter: dateFnsAdapter,

    @InjectModel(MovimientoCaja.name)
    private readonly cajaMovimientoModel: Model<MovimientoCaja>,
  ) { }

  // getUltimaCaja devuelve un objeto que luce asi { hayUltimaCaja: boolean, ultimaCaja: Caja | null }
  async getUltimaCaja(rutaId: string, session: ClientSession) {

    const ultimaCaja = await this.cajaModel
      .findOne({ ruta: rutaId, status: true })
      .sort({ fecha: -1 })
      .session(session);
    if (!ultimaCaja) {
      return {
        hayUltimaCaja: false,
        ultimaCaja: null
      }
    }

    return {
      hayUltimaCaja: true,
      ultimaCaja: CajaEntity.fromObject(ultimaCaja)
    }
  }

  async create(openRutaOptions: OpenRutaOptions): Promise<CajaEntity> {

    const { rutaId, fecha, session, base = 0 } = openRutaOptions;
    const { pretendido, totalClientes } = await this.getCreditSummary(rutaId);

    try {

      const newCaja = new this.cajaModel({
        ruta: rutaId,
        fecha,
        base,
        pretendido,
        total_clientes: totalClientes,
        clientes_pendientes: totalClientes,
        caja_final: base
      }, session);

      await newCaja.save({ session });

      return CajaEntity.fromObject(newCaja);

    } catch (error) {

      this.handleExceptions(error)

    }


  }

  async getClientesPendientesYRenovados(rutaId: string, startOfDayUtc: Date, session?: ClientSession) {
    const rutaObjectId = new mongoose.Types.ObjectId(rutaId);
    
    // 1. Obtener la lista de clientes que se renovaron hoy
    const clientesRenovados = await this.cajaMovimientoModel.aggregate([
      {
        $match: {
          ruta: rutaObjectId,
          subTipo: SubTipo.PRESTAMO,
          fecha: { $gte: startOfDayUtc }
        }
      },
      { $group: { _id: '$cliente' } }
    ]);

    const clientesRenovadosIds = clientesRenovados.map(c => c._id.toString());
    const renovaciones = clientesRenovadosIds.length; // El número de renovaciones es el tamaño de este array.

    // 2. Obtener la lista de todos los clientes con créditos activos
    const clientesActivos = await this.creditoModel.aggregate([
      { $match: { ruta: rutaObjectId, status: true } },
      { $group: { _id: '$cliente' } }
    ]);
    const clientesActivosIds = clientesActivos.map(c => c._id.toString());

    // 3. Obtener la lista de clientes que han pagado hoy
    const clientesQuePagaronHoy = await this.cajaMovimientoModel.aggregate([
      {
        $match: {
          ruta: rutaObjectId,
          tipoMovimiento: TipoMovimiento.INGRESO,
          subTipo: SubTipo.PAGOCREDITO,
          fecha: { $gte: startOfDayUtc }
        }
      },
      { $group: { _id: '$cliente' } },
    ]);
    console.log(clientesQuePagaronHoy)
    const clientesQuePagaronHoyIds = clientesQuePagaronHoy
      .filter(c => c._id != null) // Filtra documentos con _id nulo o indefinido
      .map(c => c._id.toString());
    // 4. Calcular los clientes pendientes:
    //    - Clientes activos...
    //    - ... que NO hayan pagado hoy...
    //    - ... Y que NO hayan sido renovados hoy.
    const pendientes = clientesActivosIds.filter(id =>
      !clientesQuePagaronHoyIds.includes(id) && !clientesRenovadosIds.includes(id)
    );

    const clientesPendientes = pendientes.length;

    return {
      clientesPendientes,
      renovaciones,
    };
  }

  /**
   * Obtiene un resumen de créditos activos, incluyendo la suma total de las cuotas y el recuento de créditos,
   * para una ruta específica.
   *
   * @param rutaId El ObjectId de la ruta a la que pertenecen los créditos.
   * @returns Un objeto con la suma total de las cuotas y el número de créditos.
   */
  async getCreditSummary(rutaId: string) {

    const result = await this.creditoModel.aggregate(
      [
        {
          $match: {
            status: true,
            ruta: new Types.ObjectId(rutaId)
          }
        },
        {
          $group: {
            _id: null,
            pretendido: { $sum: '$valor_cuota' },
            totalClientes: { $sum: 1 }
          }
        }
      ]
    )

    if (result.length > 0) {
      return {
        pretendido: result[0].pretendido,
        totalClientes: result[0].totalClientes,
        clientesPendietes: result[0].totalClientes,
      }
    }

    return {
      pretendido: 0,
      totalClientes: 0,
      clientesPendietes: 0,
    }

  }

  /**
   * Obtiene un resumen de los movimientos de caja para una ruta y caja específicas.
   *
   * @param cajaId El ObjectId de la caja a la que pertenecen los movimientos.
   * @param rutaId El ObjectId de la ruta a la que pertenecen los movimientos.
   * @param session (Opcional) La sesión de Mongoose para operaciones transaccionales.
   * @returns Un objeto que resume los montos de cobros, préstamos, inversiones, gastos y retiros.
   */
  async getMovimientosResumen(rutaId: string, session?: ClientSession) {

    const ruta = await this.rutaModel.findById(rutaId).session(session);
    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const caja = await this.cajaModel.findById(ruta.caja_actual).session(session);
    if (!caja) throw new NotFoundException(`Caja con el id ${ruta.caja_actual} no existe`);

    const startOfDayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);

    const {clientesPendientes, renovaciones} = await this.getClientesPendientesYRenovados(rutaId, startOfDayUtc, session);
    const result = await this.cajaMovimientoModel.aggregate(
      [
        // Etapa 1: Filtrar documentos por caja y ruta
        {
          $match: {
            caja: new Types.ObjectId(caja._id),
            ruta: new Types.ObjectId(rutaId),
            fecha: { $gte: startOfDayUtc }
          },
        },
        // Etapa 2: Agrupar y sumar condicionalmente
        {
          $group: {
            _id: null,
            cobro: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$tipoMovimiento', TipoMovimiento.INGRESO] },
                      { $eq: ['$subTipo', SubTipo.PAGOCREDITO] },
                    ],
                  },
                  '$monto',
                  0,
                ],
              },
            },
            prestamos: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$tipoMovimiento', TipoMovimiento.EGRESO] },
                      { $eq: ['$subTipo', SubTipo.PRESTAMO] },
                    ],
                  },
                  '$monto',
                  0,
                ],
              },
            },
            inversiones: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$tipoMovimiento', TipoMovimiento.INGRESO] },
                      { $eq: ['$subTipo', SubTipo.INVERSION] },
                    ],
                  },
                  '$monto',
                  0,
                ],
              },
            },
            gastos: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$tipoMovimiento', TipoMovimiento.EGRESO] },
                      { $eq: ['$subTipo', SubTipo.GASTO] },
                    ],
                  },
                  '$monto',
                  0,
                ],
              },
            },
            retiros: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$tipoMovimiento', TipoMovimiento.EGRESO] },
                      { $eq: ['$subTipo', SubTipo.RETIRO] },
                    ],
                  },
                  '$monto',
                  0,
                ],
              },
            },
          },
        },
      ],
      { session },
    );


    const {
      cobro = 0,
      prestamos = 0,
      inversiones = 0,
      gastos = 0,
      retiros = 0
    } = result[0] || {};

    caja.cobro = cobro;
    caja.prestamo = prestamos;
    caja.inversion = inversiones;
    caja.gasto = gastos;
    caja.retiro = retiros;
    caja.clientes_pendientes = clientesPendientes;
    caja.renovaciones = renovaciones;
    caja.caja_final = caja.base + caja.cobro + caja.inversion - caja.prestamo - caja.gasto - caja.retiro;
    
    await caja.save({ session });

    return CajaEntity.fromObject(caja);

  }

  async currentCaja(rutaId: string) {

    return await this.getMovimientosResumen(rutaId);

  }

  async findAll(ruta: string, fecha: string,) {

    const caja = await this.cajaModel.findOne({
      ruta,
      fecha
    })

    if (!caja) {
      throw new NotFoundException('No se encontraron registro de este dia')
    }

    return caja;

  }

  private handleExceptions(error: any) {
    if (error.code === 11000) {
      throw ({ code: 11000, message: "Ya existe esta Caja" });
    }

    this.logger.error(error);
    throw new InternalServerErrorException("Por favor revisa los logs")
  }
}
