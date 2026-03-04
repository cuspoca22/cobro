import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { ClientSession, Model, PipelineStage, Types } from 'mongoose';

import { Caja } from './schemas/caja.schema';
import { Credito } from '../credito/schemas/credito.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { SubTipo, TipoMovimiento } from 'src/movimientoCaja/interfaces';
import { MovimientoCaja } from 'src/movimientoCaja/schemas/caja-movimiento.schemas';
import { CajaEntity } from './entities/caja.entity';
import { Ruta } from '../ruta/schema/ruta.schema';
import { CreateCajaDto } from './dto';
import { CurrencyService } from '../currency/currency.service';


@Injectable()
export class CajaService {

  private readonly logger = new Logger(CajaService.name);

  constructor(
    @InjectModel(Caja.name)
    private readonly cajaModel: Model<Caja>,

    @InjectModel(Credito.name)
    private readonly creditoModel: Model<Credito>,

    @InjectModel(Ruta.name)
    private readonly rutaModel: Model<Ruta>,

    private readonly dateFnsAdapter: DateFnsAdapter,

    @InjectModel(MovimientoCaja.name)
    private readonly cajaMovimientoModel: Model<MovimientoCaja>,

    private readonly currencyService: CurrencyService,
  ) { }

  /**
   * Obtiene la última caja registrada para una ruta específica.
   * @param rutaId ID de la ruta.
   * @param session Sesión de Mongoose para transacciones.
   */
  async getUltimaCaja(rutaId: string, session: ClientSession) {

    const ultimaCaja = await this.cajaModel
      .findOne({ ruta: rutaId })
      .sort({ fecha: -1 })
      .session(session);

    return {
      hayUltimaCaja: !!ultimaCaja,
      ultimaCaja: ultimaCaja ? CajaEntity.fromObject(ultimaCaja) : null
    };
  }

  /**
   * Crea una nueva caja a partir de un DTO y calcula métricas iniciales.
   * @param createCajaDto Datos de transferencia para crear la caja.
   * @param session Sesión de Mongoose opcional para transacciones.
   * @returns Entidad de la caja creada.
   */
  async create(createCajaDto: CreateCajaDto, session?: ClientSession): Promise<CajaEntity> {

    const { rutaId, fecha, base = 0 } = createCajaDto;

    // Obtener resumen de créditos activos para calcular el monto pretendido y total de clientes
    const { pretendido, totalClientes } = await this.getCreditSummary(rutaId);

    try {

      const existingCaja = await this.cajaModel.findOne({
        ruta: new Types.ObjectId(rutaId),
        fecha: fecha
      }).session(session);

      if (existingCaja) {
        throw new BadRequestException({ code: 11000, message: "Ya existe esta Caja" });
      }

      const newCaja = new this.cajaModel({
        ruta: new Types.ObjectId(rutaId),
        fecha: fecha,
        base,
        pretendido,
        total_clientes: totalClientes,
        clientes_pendientes: totalClientes,
        caja_final: base,
      });

      await newCaja.save({ session });

      return CajaEntity.fromObject(newCaja);

    } catch (error) {
      this.handleExceptions(error);
    }
  }

  /**
   * Calcula el número de clientes pendientes y renovaciones para una ruta y fecha dadas.
   */
  async getClientesPendientesYRenovados(rutaId: string, startOfDayUtc: Date, session?: ClientSession, endOfDayUtc?: Date) {
    const rutaObjectId = new mongoose.Types.ObjectId(rutaId);

    if (!endOfDayUtc) {
      endOfDayUtc = this.dateFnsAdapter.addDays(startOfDayUtc, 1);
    }

    // 1. Clientes renovados hoy
    const clientesRenovados = await this.cajaMovimientoModel.aggregate([
      {
        $match: {
          ruta: rutaObjectId,
          subTipo: SubTipo.PRESTAMO,
          fecha: { $gte: startOfDayUtc, $lt: endOfDayUtc }
        }
      },
      { $group: { _id: '$cliente' } }
    ]).session(session || null);

    const clientesRenovadosIds = clientesRenovados.map(c => c._id.toString());
    const renovaciones = clientesRenovadosIds.length;

    // 2. Clientes con créditos activos al inicio del día (clientes iniciales)
    const clientesIniciales = await this.creditoModel.aggregate([
      {
        $match: {
          ruta: rutaObjectId,
          status: true,
          fecha_inicio: { $lt: startOfDayUtc }
        }
      },
      { $group: { _id: '$cliente' } }
    ]).session(session || null);
    const clientesInicialesIds = clientesIniciales.map(c => c._id.toString());

    // 3. Clientes que han pagado hoy
    const clientesQuePagaronHoy = await this.cajaMovimientoModel.aggregate([
      {
        $match: {
          ruta: rutaObjectId,
          tipoMovimiento: TipoMovimiento.INGRESO,
          subTipo: SubTipo.PAGOCREDITO,
          fecha: { $gte: startOfDayUtc, $lt: endOfDayUtc }
        }
      },
      { $group: { _id: '$cliente' } },
    ]).session(session || null);

    const clientesQuePagaronHoyIds = clientesQuePagaronHoy
      .filter(c => c._id != null)
      .map(c => c._id.toString());

    // 4. Filtrar renovaciones y pagos que corresponden a clientes iniciales
    const renovacionesIniciales = clientesRenovadosIds.filter(id => clientesInicialesIds.includes(id));
    const pagosIniciales = clientesQuePagaronHoyIds.filter(id => clientesInicialesIds.includes(id));

    // 5. Calcular pendientes: clientes iniciales que no hayan pagado ni renovado hoy
    const pendientes = clientesInicialesIds.filter(id =>
      !pagosIniciales.includes(id) && !renovacionesIniciales.includes(id)
    );

    return {
      clientesPendientes: pendientes.length,
      renovaciones,
    };
  }

  /**
   * Obtiene un resumen de créditos activos.
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
    );

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
   * Obtiene un resumen de los movimientos de caja para una ruta.
   */
  async getMovimientosResumen(rutaId: string, session?: ClientSession) {

    const ruta = await this.rutaModel.findById(rutaId).session(session).lean();
    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const caja = await this.cajaModel.findById(ruta.caja_actual).session(session);
    if (!caja) throw new NotFoundException(`Caja con el id ${ruta.caja_actual} no existe`);

    const startOfDayUtc = caja.fecha;
    const endOfDayUtc = this.dateFnsAdapter.addDays(startOfDayUtc, 1);

    const { clientesPendientes, renovaciones } = await this.getClientesPendientesYRenovados(rutaId, startOfDayUtc, session, endOfDayUtc);

    const pipeline = this.getResumenPipeline(rutaId, startOfDayUtc, endOfDayUtc);
    const result = await this.cajaMovimientoModel.aggregate(pipeline).session(session || null);

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
    caja.caja_final = this.currencyService.round(
      caja.base + caja.cobro + caja.inversion - caja.prestamo - caja.gasto - caja.retiro,
      ruta.currency,
    );

    await caja.save({ session });

    return CajaEntity.fromObject(caja);
  }

  /**
   * Obtiene la caja actual (resumen de movimientos) para una ruta.
   */
  async currentCaja(rutaId: string) {
    return await this.getMovimientosResumen(rutaId);
  }

  /**
   * Busca cajas históricas para una ruta en una fecha específica (uso de administración).
   */
  async findAll(rutaId: string, fecha: string) {
    const ruta = await this.rutaModel.findById(rutaId);
    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const baseDate = new Date(fecha);
    const inicioBusqueda = this.dateFnsAdapter.startOfDayUtc(baseDate);
    // Para el fin del día, necesitamos asumir que 'fecha' es una fecha local o UTC sin hora.
    // Si asumimos UTC 00:00, el final es 23:59:59.
    const finBusqueda = new Date(baseDate);
    finBusqueda.setUTCHours(23, 59, 59, 999);

    const caja = await this.cajaModel.aggregate([
      {
        $match: {
          ruta: new Types.ObjectId(rutaId),
          fecha: { $gte: inicioBusqueda, $lte: finBusqueda }
        }
      }
    ]);

    if (caja.length < 1) {
      throw new NotFoundException('No se encontraron registro de este dia');
    }

    return caja[0];
  }

  /**
   * Manejador centralizado de excepciones para el servicio.
   */
  private handleExceptions(error: any) {
    if (error.code === 11000) {
      throw new BadRequestException({ code: 11000, message: "Ya existe esta Caja" });
    }

    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      throw error;
    }

    this.logger.error(`Error no controlado en CajaService: ${error.message}`, error.stack);
    throw new InternalServerErrorException("Error interno en el servidor, por favor revise los logs");
  }

  /**
   * Genera el pipeline de agregación para el resumen de movimientos.
   */
  private getResumenPipeline(rutaId: string, startOfDayUtc: Date, endOfDayUtc: Date): PipelineStage[] {
    return [
      {
        $match: {
          ruta: new Types.ObjectId(rutaId),
          fecha: { $gte: startOfDayUtc, $lt: endOfDayUtc }
        },
      },
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
    ];
  }
}
