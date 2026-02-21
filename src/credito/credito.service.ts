import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Credito } from './schemas/credito.schema';
import { ClientSession, Connection, Model, PipelineStage } from 'mongoose';
import mongoose from 'mongoose';

import { CreateCreditoDto, UpdateCreditoDto } from './dto/';
import { Cliente } from '../cliente/schema/cliente.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { SubTipo, TipoMovimiento } from 'src/movimientoCaja/interfaces';
import { Ruta } from 'src/ruta/schema/ruta.schema';
import { CreditoEntity } from './entities/credito.entity';
import { HistorialCredito } from './interfaces';

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

    private dateFnsAdapter: DateFnsAdapter,
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
      const ruta = await this.rutaModel.findById(rutaId).session(session).lean();
      if (!ruta) {
        throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);
      }

      // Determinar el modo y realizar cálculos (no necesitan estar en la transacción)
      if (interes !== undefined && interes !== null) {
        const { totalPagar, valorCuota } = this.creditCalculatorSvc.calculateFromInterest(
          valor_credito,
          interes,
          total_cuotas,
          ruta.currency,
        );
        calculatedTotalPagar = totalPagar;
        calculatedInteres = interes;
        calculatedValorCuota = valorCuota;
      } else if (valor_cuota !== undefined && valor_cuota !== null) {
        const { totalPagar, interes } = this.creditCalculatorSvc.calculateFromCuota(
          valor_credito,
          valor_cuota,
          total_cuotas,
          ruta.currency,
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
      const creditos = await this.creditoModel.create([{
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
        dueDate,
      }], { session });

      const newCredito = creditos ? creditos[0] : null;

      if (!newCredito) {
        throw new InternalServerErrorException('No se pudo crear el crédito');
      }

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
      throw error;
    }

  }

  async getCreditosByRuta(rutaId?: string): Promise<CreditoEntity[]> {

    const ruta = await this.rutaModel.findById(rutaId).lean();

    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const startOfTodayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);
    const endOfTodayUtc = this.dateFnsAdapter.getEndOfTodayInTimeZone(ruta.timeZone);

    const pipeline = this.getCommonAggregationPipeline(
      { ruta: new mongoose.Types.ObjectId(rutaId) },
      startOfTodayUtc,
      endOfTodayUtc
    );

    // Filtro adicional especifico para rutas (créditos activos o inactivos pagados hoy)
    pipeline.push({
      $match: {
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
    });

    // Proyeccion y ordenamiento final
    pipeline.push(
      this.getLookupClienteStage(),
      { $unwind: { path: '$clienteDetail', preserveNullAndEmptyArrays: true } },
      this.getFinalProjectStage(),
      { $sort: { "cliente.turno": 1 } }
    );

    const creditsWithDetails = await this.creditoModel.aggregate(pipeline).exec();

    return this.mapToCreditoEntity(creditsWithDetails, ruta.timeZone);
  }

  /**
 * Obtiene los detalles de un crédito, incluyendo campos calculados como abonos y saldo.
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

    const pipeline = this.getCommonAggregationPipeline(
      { _id: new mongoose.Types.ObjectId(creditId), status: true },
      startOfToday,
      endOfToday
    );

    pipeline.push(
      this.getLookupClienteStage(),
      { $unwind: { path: '$clienteDetail', preserveNullAndEmptyArrays: true } },
      this.getFinalProjectStage(),
      { $sort: { turno: 1 } }
    );

    const creditsWithDetails = await this.creditoModel.aggregate(pipeline).session(session || null).exec();

    if (creditsWithDetails.length === 0) {
      throw new NotFoundException('Credit not found');
    }

    const creditPlain = creditsWithDetails[0];
    const creditEntity = CreditoEntity.fromObject(creditPlain);

    return this.calculateOverdueAndState(creditEntity, ruta.timeZone);
  }

  // Este método es invocado después de un pago para actualizar el estado persistente del crédito.
  async handlePaymentMade(creditoId: string, rutaId: string, clienteId: string, session?: ClientSession) {
    const creditDetails = await this.getCreditoById(creditoId, rutaId, session);
    const cliente = await this.clienteModel.findById(clienteId).session(session)
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${clienteId} no encontrado.`);
    }

    const saldoActualizado = creditDetails.saldo;
    let updatedCreditStatus = creditDetails.status;
    let updatedClientState = creditDetails.state;
    let updatedCliente = cliente.status;

    // Lógica para actualizar `status` (boolean)
    if (saldoActualizado <= 0 && updatedCreditStatus === true) {
      updatedCreditStatus = false;
      updatedCliente = false; // Marcar como inactivo (pagado)
      updatedClientState = 'BUENO'; // Si se salda, el cliente vuelve a ser 'BUENO'
    } else {
      updatedCliente = true;
      updatedCreditStatus = true;
    }

    await this.creditoModel.updateOne(
      { _id: creditoId },
      {
        $set: {
          status: updatedCreditStatus,
          state: updatedClientState,
          ultimo_pago: creditDetails.ultimo_pago
        }
      },
      { session }
    );

    await this.clienteModel.updateOne(
      { _id: clienteId },
      { $set: { status: updatedCliente } },
      { session }
    );

    let txtMessage: string = `
      Fecha: ${new Date(creditDetails.fecha_inicio).toLocaleDateString()}
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

  async updateTurno(id: string, updateCreditoDto: UpdateCreditoDto) {
    try {

      await this.creditoModel.findByIdAndUpdate(id, updateCreditoDto, { new: true });

      return true;

    } catch (error) {
      this.handleExceptions(error);
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

  private handleExceptions(error: any) {
    this.logger.error(error);
    throw new InternalServerErrorException("Por favor revisa los logs")
  }

  // Helpers privados para agregacion
  private getCommonAggregationPipeline(matchStage: any, startOfToday: Date, endOfToday: Date): PipelineStage[] {
    return [
      { $match: matchStage },
      // Lookup para obtener todos los pagos
      {
        $lookup: {
          from: 'movimientoCaja',
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
      {
        $addFields: {
          abonos: {
            $reduce: {
              input: "$allPayments",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.monto"] }
            }
          },
          ultimo_pago: { $max: "$allPayments.createdAt" }
        },
      },
      {
        $addFields: {
          saldo: { $subtract: ["$total_pagar", "$abonos"] }
        }
      },
      // Lookup para verificar pago de hoy
      {
        $lookup: {
          from: 'movimientoCaja',
          let: { creditoId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$credito', '$$creditoId'] },
                    { $eq: ['$tipoMovimiento', TipoMovimiento.INGRESO] },
                    { $eq: ['$subTipo', SubTipo.PAGOCREDITO] },
                    { $gte: ['$fecha', startOfToday] },
                    { $lte: ['$fecha', endOfToday] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: 'paymentsToday',
        },
      },
      {
        $addFields: {
          paidToday: { $gt: [{ $size: '$paymentsToday' }, 0] },
        },
      },
    ];
  }

  private getLookupClienteStage(): PipelineStage {
    return {
      $lookup: {
        from: 'clientes',
        localField: 'cliente',
        foreignField: '_id',
        as: 'clienteDetail'
      }
    };
  }

  private getFinalProjectStage(): PipelineStage {
    return {
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
    };
  }

  private calculateOverdueAndState(credit: CreditoEntity, timeZone: string): CreditoEntity {
    let daysOverdue = 0;
    const today = this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone);

    if (credit.status === true) {
      const paidUntilDate = this.creditCalculatorSvc.calculatePaidUntilDate(
        credit.fecha_inicio,
        credit.frecuencia_cobro,
        credit.valor_cuota,
        credit.abonos
      );

      if (this.dateFnsAdapter.isBefore(paidUntilDate, today)) {
        daysOverdue = this.dateFnsAdapter.differenceInDays(today, paidUntilDate);
        if (daysOverdue < 0) daysOverdue = 0;
      }
    }

    const clientState = this.creditCalculatorSvc.classifyClient(daysOverdue);

    credit.daysOverdue = daysOverdue > 0 ? daysOverdue : 0;
    credit.state = clientState;

    return credit;
  }

  private mapToCreditoEntity(credits: any[], timeZone: string): CreditoEntity[] {
    return credits.map(creditPlainObject => {
      const creditEntity = CreditoEntity.fromObject(creditPlainObject);
      return this.calculateOverdueAndState(creditEntity, timeZone);
    });
  }
}
