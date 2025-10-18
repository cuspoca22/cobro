import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Credito } from './schemas/credito.schema';
import { ClientSession, Connection, Model } from 'mongoose';
import mongoose from 'mongoose';

import { CreateCreditoDto, UpdateCreditoDto } from './dto/';
import { Cliente } from '../cliente/schema/cliente.schema';
// import { CajaService } from '../caja/caja.service';
import { ClienteService } from '../cliente/cliente.service';
import { EmpresaService } from '../empresa/empresa.service';
import { dateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { SubTipo, TipoMovimiento } from 'src/movimientoCaja/interfaces';
import { fromZonedTime } from 'date-fns-tz';
import { Ruta } from 'src/ruta/schema/ruta.schema';
import { CreditoEntity } from './entities/credito.entity';
import { MovimientoCajaService } from 'src/movimientoCaja/movimiento-caja.service';
import { HistorialCredito } from './interfaces';
import { UserEntity } from 'src/auth/entities/user.entity';

@Injectable()
export class CreditoService {

  private logger = new Logger("CreditoService");

  constructor(
    @InjectModel(Credito.name)
    private readonly creditoModel: Model<Credito>,

    @InjectModel(Cliente.name)
    private readonly clienteModel: Model<Cliente>,

    @InjectModel(Ruta.name)
    private readonly rutaModel: Model<Ruta>,

    // private readonly cajaService: CajaService,
    private readonly clienteService: ClienteService,
    private empresaSvc: EmpresaService,
    private dateFnsAdapter: dateFnsAdapter,
    private creditCalculatorSvc: CreditCalculatorService,
    @InjectConnection() private readonly connection: Connection,
  ) { }

  /**
   * Crea un nuevo crédito, manejando los cálculos para modo automático o manual.
   * @param createCreditoDto Los datos de entrada del crédito.
   * @returns El crédito creado en formato DTO.
   */
  async create(createCreditoDto: CreateCreditoDto, session: ClientSession) {

    try {
      const {
        clienteId,
        rutaId,
        valor_credito,
        total_cuotas,
        frecuencia_cobro,
        observaciones,
        interes,
        valor_cuota,
      } = createCreditoDto;

      let calculatedTotalPagar: number;
      let calculatedInteres: number;
      let calculatedValorCuota: number;

      // Obtener la ruta dentro de la transacción
      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) {
        throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);
      }

      // Determinar el modo y realizar cálculos (no necesitan estar en la transacción)
      if (interes !== undefined || interes !== null) {
        const { totalPagar, valorCuota } = this.creditCalculatorSvc.calculateFromInterest(
          valor_credito,
          interes,
          total_cuotas
        );
        calculatedTotalPagar = totalPagar;
        calculatedInteres = interes;
        calculatedValorCuota = valorCuota;
      } else if (valor_cuota !== undefined || valor_cuota !== null) {
        const { totalPagar, interes } = this.creditCalculatorSvc.calculateFromCuota(
          valor_credito,
          valor_cuota,
          total_cuotas
        );
        calculatedTotalPagar = totalPagar;
        calculatedInteres = interes;
        calculatedValorCuota = valor_cuota;
      } else {
        throw new BadRequestException('Debe proporcionar interés o valor_cuota.');
      }

      const fecha_inicio = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);

      // Obtener el dueDate final
      const dueDate = this.creditCalculatorSvc.getDueDate(
        frecuencia_cobro,
        fecha_inicio,
        total_cuotas,
        ruta.timeZone
      );

      // Crear el nuevo documento de crédito dentro de la transacción
      const [newCredito] = await this.creditoModel.create([{
        cliente: clienteId,
        ruta: rutaId,
        valor_credito,
        interes: calculatedInteres,
        total_cuotas,
        total_pagar: calculatedTotalPagar,
        valor_cuota: calculatedValorCuota,
        frecuencia_cobro,
        fecha_inicio,
        observaciones,
        status: true,
        saldo: calculatedTotalPagar,
        dueDate,
      }], { session });

      // Actualizar el estado del cliente dentro de la transacción
      await this.clienteModel.findByIdAndUpdate(
        clienteId,
        { $set: { status: true } },
        { new: true, session }
      );

      // Preparar y retornar el DTO fuera de la transacción para mayor eficiencia
      const createdCreditForDto = {
        ...newCredito.toObject(),
        abonos: 0,
        saldo: calculatedTotalPagar,
        daysOverdue: 0,
        state: this.creditCalculatorSvc.classifyClient(0),
        paidToday: false,
      };

      return createdCreditForDto;
    } catch (error) {
      throw error; // Propaga el error para que sea manejado por NestJS
    }

  }

  async getCreditosByRuta(rutaId?: string): Promise<CreditoEntity[]> {

    const ruta = await this.rutaModel.findById(rutaId).lean();

    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const startOfTodayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);
    const endOfTodayUtc = this.dateFnsAdapter.getEndOfTodayInTimeZone(ruta.timeZone);

    // --- Pipeline de agregación de MongoDB ---
    const creditsWithDetails = await this.creditoModel.aggregate([
      {
        $match: {
          ruta: new mongoose.Types.ObjectId(rutaId),
        },
      },
      // Lookup para obtener todos los pagos de este crédito (para abonos/saldo/ultimo_pago)
      {
        $lookup: {
          from: 'movimientoCaja', // Nombre de la colección de pagos
          localField: '_id',
          foreignField: 'credito',
          as: 'allPayments',
          pipeline: [
            {
              $match: {
                tipoMovimiento: TipoMovimiento.INGRESO,
                subTipo: SubTipo.PAGOCREDITO,
              }
            }
          ]
        },
      },
      // Calcular abonos y saldo
      {
        $addFields: {
          abonos: {
            $reduce: {
              input: "$allPayments",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.monto"] }
            }
          },
          // Asegúrate que `createdAt` exista en tus documentos `movimientoCaja`
          // y que sea de tipo Date en MongoDB.
          ultimo_pago: { $max: "$allPayments.createdAt" }, // Usar 'fecha' en lugar de 'createdAt' si esa es la columna de fecha
        },
      },
      {
        $addFields: {
          saldo: { $subtract: ["$total_pagar", "$abonos"] }
        }
      },
      // --- ¡NUEVO! Lookup para verificar si hay un pago hecho HOY (en la TZ de la ruta) ---
      {
        $lookup: {
          from: 'movimientoCaja',
          let: { creditoId: '$_id' }, // Definir una variable local para el _id del crédito
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$credito', '$$creditoId'] }, // Coincidir con el crédito actual
                    { $eq: ['$tipoMovimiento', TipoMovimiento.INGRESO] }, // Solo ingresos
                    { $eq: ['$subTipo', SubTipo.PAGOCREDITO] }, // Solo pagos de crédito
                    // ¡Aquí usamos las fechas UTC calculadas para esta ruta!
                    { $gte: ['$createdAt', startOfTodayUtc] }, // Pago después o igual al inicio de hoy (UTC)
                    { $lte: ['$createdAt', endOfTodayUtc] }     // Pago antes o igual al fin de hoy (UTC)
                  ]
                }
              }
            },
            { $limit: 1 } // Solo necesitamos saber si existe al menos uno
          ],
          as: 'paymentsToday', // Este array contendrá un pago si se hizo hoy, o estará vacío
        },
      },
      // Añadir el campo 'paidToday'
      {
        $addFields: {
          paidToday: { $gt: [{ $size: '$paymentsToday' }, 0] }, // true si paymentsToday no está vacío
        },
      },
      {
        $match: {
          // Incluir créditos activos O créditos inactivos que pagaron hoy
          $or: [
            { status: true },
            {
              $and: [
                { status: false },
                { paidToday: true }
              ]
            }
          ]
        }
      },
      {
        $lookup: {
          from: 'clientes',
          localField: 'cliente',
          foreignField: '_id',
          as: 'clienteDetail'
        }
      },
      {
        $unwind: {
          path: '$clienteDetail',
          preserveNullAndEmptyArrays: true // Si un crédito no tiene cliente (raro, pero es buena práctica)
        },
      },
      {
        $project: {
          _id: 1,
          cliente: {
            _id: "$clienteDetail._id",
            nombre: "$clienteDetail.nombre",
            alias: "$clienteDetail.alias",
            direccion: "$clienteDetail.direccion",
            telefono: "$clienteDetail.telefono",
            ciudad: "$clienteDetail.ciudad",
            ubication: "$clienteDetail.ubication",
            dpi: "$clienteDetail.dpi",
            turno: "$clienteDetail.turno",
          },
          interes: 1,
          fecha_inicio: 1,
          valor_credito: 1,
          frecuencia_cobro: 1,
          valor_cuota: 1,
          ruta: 1,
          daysOverdue: 1,
          saldo: 1,
          total_pagar: 1,
          status: 1,
          state: 1,
          ultimo_pago: 1,
          abonos: 1,
          paidToday: 1,
          total_cuotas: 1,
          dueDate: 1,
          observaciones: 1,
          paymentsToday: 1
        },
      },
      { $sort: { "cliente.turno": 1 } },
    ]).exec();

    const transformedCredits: CreditoEntity[] = creditsWithDetails.map(
      creditPlainObject => CreditoEntity.fromObject(creditPlainObject));

    // Ahora, para cada crédito, calculamos daysOverdue y el 'state' del cliente
    const finalCredits: CreditoEntity[] = [];
    const currentToday = this.dateFnsAdapter.nowUtc(); // Usar una instancia de fecha consistente

    for (const credit of transformedCredits) {
      let daysOverdue = 0;
      if (credit.status === true) {
        const paidUntilDate = this.creditCalculatorSvc.calculatePaidUntilDate(
          credit.fecha_inicio,
          credit.frecuencia_cobro,
          credit.valor_cuota,
          credit.abonos
        );
        if (this.dateFnsAdapter.isBefore(paidUntilDate, currentToday)) {
          daysOverdue = this.dateFnsAdapter.differenceInDays(currentToday, paidUntilDate);
          if (daysOverdue < 0) daysOverdue = 0;
        }
      }

      const clientState = this.creditCalculatorSvc.classifyClient(daysOverdue);

      const creditForDto = {
        ...credit,
        daysOverdue: daysOverdue,
        state: clientState,
      };

      finalCredits.push(creditForDto);
    }

    return finalCredits;
  }

  /**
 * Obtiene los detalles de un crédito, incluyendo campos calculados como abonos y saldo.
 * Utiliza agregación para una mayor eficiencia al obtener datos derivados.
 */
  async getCreditoById(
    creditId: string,
    rutaId: string,
    session?: ClientSession
  ): Promise<CreditoEntity> {

    const sessionOption = { session: session || null };

    const ruta = await this.rutaModel.findById(rutaId, null, sessionOption);

    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const startOfToday = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone)
    const endOfToday = this.dateFnsAdapter.getEndOfTodayInTimeZone(ruta.timeZone);

    const creditsWithDetails = await this.creditoModel.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(creditId), // Filtrar por ruta
          status: true, // Solo créditos activos
        },
      },
      // Lookup para obtener todos los pagos de este crédito (para abonos/saldo/ultimo_pago)
      {
        $lookup: {
          from: 'movimientoCaja', // Nombre de la colección de pagos
          localField: '_id',
          foreignField: 'credito',
          as: 'allPayments',
          pipeline: [
            {
              $match: {
                tipoMovimiento: TipoMovimiento.INGRESO,
                subTipo: SubTipo.PAGOCREDITO,
              }
            }
          ]
        },
      },
      // Calcular abonos y saldo
      {
        $addFields: {
          abonos: {
            $reduce: {
              input: "$allPayments",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.monto"] }
            }
          },
          // Asegúrate que `createdAt` exista en tus documentos `movimientoCaja`
          // y que sea de tipo Date en MongoDB.
          ultimo_pago: { $max: "$allPayments.createdAt" } // Usar 'fecha' en lugar de 'createdAt' si esa es la columna de fecha
        },
      },
      {
        $addFields: {
          saldo: { $subtract: ["$total_pagar", "$abonos"] }
        }
      },
      // --- ¡NUEVO! Lookup para verificar si hay un pago hecho HOY (en la TZ de la ruta) ---
      {
        $lookup: {
          from: 'movimientoCaja',
          let: { creditoId: '$_id' }, // Definir una variable local para el _id del crédito
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$credito', '$$creditoId'] }, // Coincidir con el crédito actual
                    { $eq: ['$tipoMovimiento', TipoMovimiento.INGRESO] }, // Solo ingresos
                    { $eq: ['$subTipo', SubTipo.PAGOCREDITO] }, // Solo pagos de crédito
                    // ¡Aquí usamos las fechas UTC calculadas para esta ruta!
                    { $gte: ['$createdAt', startOfToday] }, // Pago después o igual al inicio de hoy (UTC)
                    { $lte: ['$createdAt', endOfToday] }     // Pago antes o igual al fin de hoy (UTC)
                  ]
                }
              }
            },
            { $limit: 1 } // Solo necesitamos saber si existe al menos uno
          ],
          as: 'paymentsToday', // Este array contendrá un pago si se hizo hoy, o estará vacío
        },
      },
      // Añadir el campo 'paidToday'
      {
        $addFields: {
          paidToday: { $gt: [{ $size: '$paymentsToday' }, 0] }, // true si paymentsToday no está vacío
        },
      },
      {
        $lookup: {
          from: 'clientes',
          localField: 'cliente',
          foreignField: '_id',
          as: 'clienteDetail'
        }
      },
      {
        $unwind: {
          path: '$clienteDetail',
          preserveNullAndEmptyArrays: true // Si un crédito no tiene cliente (raro, pero es buena práctica)
        },
      },
      {
        $project: {
          // Mantén los campos que necesitas para GetCreditoResponseDto y los cálculos posteriores
          // Asegúrate de incluir todos los campos necesarios para tu DTO
          // allPayments: 0, // Excluir el array completo de pagos para reducir el tamaño de la respuesta
          // paymentsToday: 0, // Excluir el array temporal de pagos de hoy
          _id: 1,
          cliente: {
            _id: "$clienteDetail._id",
            nombre: "$clienteDetail.nombre",
            alias: "$clienteDetail.alias"
          },
          fecha_inicio: 1,
          interes: 1,
          valor_credito: 1,
          frecuencia_cobro: 1,
          valor_cuota: 1,
          ruta: 1,
          daysOverdue: 1,
          saldo: 1,
          total_pagar: 1,
          status: 1,
          state: 1,
          ultimo_pago: 1,
          abonos: 1,
          paidToday: 1,
          total_cuotas: 1,
          paymentsToday: 1
        },
      },
      { $sort: { turno: 1 } }, // Ordenar por turno
    ])
      .session(session || null)
      .exec();

    if (creditsWithDetails.length === 0) {
      throw new NotFoundException('Credit not found');
    }

    const credit: CreditoEntity = creditsWithDetails[0]

    // --- Cálculo de días de atraso y determinación del 'state' del cliente ---
    let daysOverdue = 0;
    const today = this.dateFnsAdapter.nowUtc();

    // Solo calculamos morosidad si el crédito está ACTIVO (status: true)
    if (credit.status === true) {
      const paidUntilDate = this.creditCalculatorSvc.calculatePaidUntilDate(
        credit.fecha_inicio,
        credit.frecuencia_cobro,
        credit.valor_cuota,
        credit.abonos // El campo 'abonos' es calculado por la agregación
      );

      if (this.dateFnsAdapter.isBefore(paidUntilDate, today)) {
        daysOverdue = this.dateFnsAdapter.differenceInDays(today, paidUntilDate);
        if (daysOverdue < 0) daysOverdue = 0;
      }
    }

    // Clasificación del cliente basada en los días de atraso actuales
    const clientState = this.creditCalculatorSvc.classifyClient(daysOverdue);

    credit.daysOverdue = daysOverdue > 0 ? daysOverdue : 0;
    credit.state = clientState;
    return CreditoEntity.fromObject(credit);
  }

  // Este método es invocado después de un pago para actualizar el estado persistente del crédito.
  async handlePaymentMade(creditoId: string, rutaId: string, clienteId: string, session?: ClientSession) {
    // Obtenemos los detalles con los cálculos más recientes.
    // Esto incluye el saldo, días de atraso y el 'state' del cliente calculado.
    const creditDetails = await this.getCreditoById(creditoId, rutaId, session);
    const cliente = await this.clienteModel.findById(clienteId).session(session)
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${clienteId} no encontrado.`);
    }

    const saldoActualizado = creditDetails.saldo;
    let updatedCreditStatus = creditDetails.status; // Tu campo `status` (boolean)
    let updatedClientState = creditDetails.state; // El 'state' (BUENO/REGULAR/MALO) calculado
    let updatedCliente = cliente.status;

    // Lógica para actualizar `status` (boolean)
    if (saldoActualizado <= 0 && updatedCreditStatus === true) { // Si el saldo es 0 o negativo y el crédito aún está activo
      updatedCreditStatus = false;
      updatedCliente = false; // Marcar como inactivo (pagado)
      updatedClientState = 'BUENO'; // Si se salda, el cliente vuelve a ser 'BUENO'
    } else {
      updatedCliente = true;
      updatedCreditStatus = true;
    }
    // } else if (creditDetails.daysOverdue >= 8 && updatedCreditStatus === true) { // Si el cliente es 'MALO' y el crédito está activo
    //     updatedCreditStatus = false; // Podrías querer desactivar el crédito si entra en default severo
    // }

    await this.creditoModel.updateOne(
      { _id: creditoId },
      {
        $set: {
          status: updatedCreditStatus, // Actualiza el campo `status` del documento
          state: updatedClientState, // Actualiza el campo `state` del documento
          ultimo_pago: creditDetails.ultimo_pago // Actualiza la fecha del último pago si es la más reciente
        }
      },
      { session }
    );

    await this.clienteModel.updateOne(
      { _id: clienteId },
      {
        $set: {
          status: updatedCliente
        }
      },
      { session }
    );

    // Cliente: ${creditDetails.cliente.alias.toLocaleUpperCase()} 
    let txtMessage: string = `
      Fecha: ${creditDetails.fecha_inicio.toLocaleDateString()}
      Abonos: $${creditDetails.abonos}.00 
      Saldo: $${creditDetails.saldo}.00 
      Atrasos: ${creditDetails.daysOverdue} 
      Cuotas Pendientes: ${(creditDetails.saldo / creditDetails.valor_cuota).toFixed(2)}  
    `
    return {
      ok: true,
      message: txtMessage
    }
  }

  async findRenovaciones(fecha: string, user: UserEntity) {

    const empresa = await this.empresaSvc.findOne(`${user.empresa}`)
    const rutas = empresa.rutas.map(ruta => ruta._id);
    return await this.creditoModel.find({
      fecha_inicio: fecha,
      ruta: { $in: rutas }
    })
      .populate([
        { path: 'pagos' },
        {
          path: 'cliente',
          populate: {
            path: 'creditos'
          }
        },
        { path: 'ruta' },
      ])

  }

  async findOne(id: string) {
    const credito = await this.creditoModel.findById(id)
      .populate("cliente")
      .populate("pagos")

    if (!credito) {
      throw new NotFoundException(`Credito con el id ${id} no existe`);
    }

    return {
      ...credito.toJSON()
    };
  }

  async update(id: string, updateCreditoDto: UpdateCreditoDto, fecha: string) {
    try {
      const creditoUpdate = await this.creditoModel.findByIdAndUpdate(id, updateCreditoDto, { new: true });

      // if(creditoUpdate.fecha_inicio === this.moment.fecha(fecha, 'DD/MM/YYYY')){
      //   await this.cajaService.currentCaja(`${creditoUpdate.ruta}`, fecha)
      //   return creditoUpdate;
      // }

      // let fechaSplit = creditoUpdate.fecha_inicio.split('/');
      // let newFecha = `${fechaSplit[2]}-${fechaSplit[1]}-${fechaSplit[0]}`;
      // await this.cajaService.currentCaja(`${creditoUpdate.ruta}`, newFecha);
      // await this.cajaService.currentCaja(`${creditoUpdate.ruta}`, fecha);

      return creditoUpdate;

    } catch (error) {
      this.hanldeExceptions(error);
    }
  }

  async updateTurno(id: string, updateCreditoDto: UpdateCreditoDto) {
    try {

      await this.creditoModel.findByIdAndUpdate(id, updateCreditoDto, { new: true });

      return true;

    } catch (error) {
      this.hanldeExceptions(error);
    }
  }

  async getHistorialCreditos(clienteId: string): Promise<HistorialCredito[]> {

    const creditos = await this.creditoModel
      .find({
        cliente: clienteId,
        status: false
      })
      .sort({ fecha_inicio: -1 })
      .limit(5)
      .select('valor_credito interes fecha_inicio frecuencia_cobro total_cuotas ultimo_pago')
      .lean()
      .exec();

    const historial: HistorialCredito[] = creditos.map((credito) => {
      if (!credito.fecha_inicio || !credito.ultimo_pago) {
        return {
          valor_credito: credito.valor_credito,
          interes: credito.interes,
          fecha_inicio: credito.fecha_inicio,
          ultimo_pago: credito.ultimo_pago,
          frecuencia_cobro: credito.frecuencia_cobro,
          total_cuotas: credito.total_cuotas,
          dias_tardados_en_pagar: 0
        }
      }

      const diasTardados = this.dateFnsAdapter.differenceInDays(credito.ultimo_pago, credito.fecha_inicio);

      return {
        valor_credito: credito.valor_credito,
        interes: credito.interes,
        fecha_inicio: credito.fecha_inicio,
        ultimo_pago: credito.ultimo_pago,
        frecuencia_cobro: credito.frecuencia_cobro,
        total_cuotas: credito.total_cuotas,
        dias_tardados_en_pagar: diasTardados
      }
    })

    return historial;

  }

  async getCreditosVerificados(rutaId: string) {

  }


  private hanldeExceptions(error: any) {
    this.logger.error(error);
    throw new InternalServerErrorException("Por favor revisa los logs")
  }
}
