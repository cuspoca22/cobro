import { BadRequestException, forwardRef, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel, InjectConnection } from "@nestjs/mongoose";
import mongoose, { Model, Connection, Types, ClientSession, PipelineStage } from "mongoose";

import { MovimientoCaja } from "./schemas/caja-movimiento.schemas";
import { CreateMovimientoCajaDto, UpdateMovimientoCajaDto } from "./dto";
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditoService } from "src/credito/credito.service";
import { SubTipo, TipoMovimiento, ResumenOficinaResponse, GrupoMovimiento, MovimientoResumen } from "./interfaces";
import { CreateCreditoDto, UpdateCreditoDto } from "src/credito/dto";
import { CajaMovimientoEntity } from "./entities/caja-movimiento.entity";
import { TransactionHelper } from '../common/helpers';
import { RutaService } from "src/ruta/ruta.service";
import { CajaService } from "src/caja/caja.service";

@Injectable()
export class MovimientoCajaService {

  private logger = new Logger("MovimientoCajaService");

  private transactionHelper: TransactionHelper;

  constructor(
    @InjectModel(MovimientoCaja.name)
    private readonly cajaMovimientoModel: Model<MovimientoCaja>,

    @Inject(forwardRef(() => RutaService))
    private readonly rutaService: RutaService,

    @Inject(forwardRef(() => CajaService))
    private readonly cajaService: CajaService,

    private readonly dateFnsAdapter: DateFnsAdapter,
    private readonly creditoService: CreditoService,
    // Ledger-first: durante el día NO se reescribe Caja; el snapshot se congela al cerrar.
    @InjectConnection() private readonly connection: Connection
  ) {
    this.transactionHelper = new TransactionHelper(connection);
  }


  async addPago(createPagoDto: CreateMovimientoCajaDto) {
    return this.transactionHelper.withTransaction(async (session) => {
      const { rutaId, monto, creditoId, clienteId, ...rest } = createPagoDto;

      const ruta = await this.rutaService.findOperacionContextById(rutaId, session);
      if (!ruta) throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      if (!ruta.caja_actual) throw new BadRequestException(`La ruta con el id ${rutaId} no tiene caja asociada`);
      // FIX [P0 TOCTOU]: no aceptar pagos si la ruta ya está cerrada dentro de la txn
      if (!ruta.status) {
        throw new BadRequestException(`La ruta con el id ${rutaId} está cerrada`);
      }

      const caja = await this.cajaService.findByIdLean(ruta.caja_actual, session);
      if (!caja) throw new NotFoundException(`Caja con el id ${rutaId} no existe`);

      const fecha = this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone);

      const credito = await this.creditoService.getCreditoById(creditoId, rutaId, session);
      if (!credito) throw new NotFoundException(`Credito con el id ${creditoId} no existe`);

      // Usar precisión de 2 decimales para validación
      const saldoRedondeado = Math.round(credito.saldo * 100) / 100;
      const montoRedondeado = Math.round(monto * 100) / 100;

      if (montoRedondeado > saldoRedondeado) {
        throw new BadRequestException(
          `El monto del pago (${montoRedondeado}) excede el saldo pendiente del crédito (${saldoRedondeado}).`
        );
      }

      // Verificar si ya existe un pago hoy (manteniendo restricción de un pago por día)
      const pagoExistente = await this.cajaMovimientoModel.findOne({
        credito: credito.id,
        subTipo: SubTipo.PAGOCREDITO,
        fecha: { $gte: fecha }
      }).session(session);

      if (pagoExistente) {
        throw new BadRequestException(`Ya ingresaste este pago, por favor recarga la pagina`);
      }

      // crear el movimiento — el índice unique_pago_credito_por_dia evita doble insert concurrente
      try {
        await this.cajaMovimientoModel.create([{
          caja: caja._id,
          monto,
          tipoMovimiento: TipoMovimiento.INGRESO,
          subTipo: SubTipo.PAGOCREDITO,
          fecha,
          cliente: clienteId,
          credito: creditoId,
          ruta: rutaId,
          ...rest
        }], { session });
      } catch (error: any) {
        // FIX [P0 doble-pago]: race condition → duplicate key del índice único
        if (error?.code === 11000) {
          throw new BadRequestException(`Ya ingresaste este pago, por favor recarga la pagina`);
        }
        throw error;
      }

      // llamamos el handlePaymentMade del credito
      const result = await this.creditoService.handlePaymentMade(creditoId, rutaId, clienteId, session);

      // Ledger-first: no persistir aggregates de Caja aquí; currentCaja calcula en vivo;
      // el snapshot se congela solo en closeRuta.
      return {
        ok: result.ok,
        message: result.message
      };
    }, 'MovimientoCajaService.addPago');
  }

  async addOficinaMovimiento(createMovimientoDto: CreateMovimientoCajaDto) {

    const session = await this.connection.startSession();
    session.startTransaction();

    const { tipoMovimiento, rutaId, monto, ...rest } = createMovimientoDto;

    try {

      const ruta = await this.rutaService.findOperacionContextById(rutaId, session);
      if (!ruta) throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      if (!ruta.caja_actual) throw new BadRequestException(`La ruta con el id ${rutaId} no tiene caja asociada`);

      await this.cajaMovimientoModel.create([{
        caja: ruta.caja_actual,
        monto,
        tipoMovimiento,
        ruta: rutaId,
        fecha: this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone),
        ...rest
      }], { session });

      await session.commitTransaction();

      return true;

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async updateMovimiento(movimientoId: string, updateMovimientoCajaDto: UpdateMovimientoCajaDto) {

    const session = await this.connection.startSession();
    session.startTransaction();

    try {

      const updateMovimiento = await this.cajaMovimientoModel.findByIdAndUpdate(
        movimientoId,
        { $set: updateMovimientoCajaDto },
        { returnDocument: 'after', session }
      );

      if (!updateMovimiento) throw new NotFoundException(`Movimiento con el id ${movimientoId} no existe`);

      await session.commitTransaction();

      return true;

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async updateCredito(creditoId: string, updateCreditoDto: UpdateCreditoDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {

      const updateMovimiento = await this.cajaMovimientoModel.findOneAndUpdate(
        // FIX [P1]: filtrar por préstamo; antes podía machacar un pago_credito del mismo crédito
        { credito: new mongoose.Types.ObjectId(creditoId), subTipo: SubTipo.PRESTAMO },
        { $set: { monto: updateCreditoDto.valor_credito } },
        { returnDocument: 'after', session }
      );

      if (!updateMovimiento) throw new NotFoundException(`Credito con el id ${creditoId} no existe`);

      await this.creditoService.updateCredito(creditoId, updateCreditoDto, session);

      await session.commitTransaction();

      return true;

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }
  }

  async deleteCredito(creditoId: string, movimientoId: string) {
    return this.transactionHelper.withTransaction(async (session) => {

      const deleteMovimiento = await this.cajaMovimientoModel.findByIdAndDelete(movimientoId, { session });
      if (!deleteMovimiento) throw new NotFoundException(`Movimiento con el id ${movimientoId} no existe`);

      await this.creditoService.deleteCredito(creditoId, session);

      return true;

    }, 'MovimientoCajaService.deleteCredito');
  }

  async updatePago(movimientoId: string, updateMovimientoCajaDto: UpdateMovimientoCajaDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const movimiento = await this.cajaMovimientoModel.findById(movimientoId).session(session);
      if (!movimiento) throw new NotFoundException(`Movimiento con el id ${movimientoId} no existe`);

      const caja = await this.cajaService.findByIdLean(movimiento.caja, session);
      if (!caja) throw new NotFoundException(`Caja con el id ${movimiento.caja} no existe`);

      const rutaId = (movimiento.ruta ?? caja.ruta).toString();
      await this.assertPagoEsDeHoy(movimiento.fecha, rutaId, session);

      const credito = await this.creditoService.getCreditoById(movimiento.credito.toString(), caja.ruta, session);

      // Restauramos el saldo del credito (simulando que el pago anterior no existió)
      const saldoCreditoRestaurado = credito.saldo + movimiento.monto;

      // Usar precisión de 2 decimales para validación
      const saldoRedondeado = Math.round(saldoCreditoRestaurado * 100) / 100;
      const montoRedondeado = Math.round(updateMovimientoCajaDto.monto * 100) / 100;

      // volver a verificar si el monto es menor al saldo del credito
      if (montoRedondeado > saldoRedondeado) {
        throw new BadRequestException(`El monto del pago (${montoRedondeado}) excede el saldo pendiente del crédito (${saldoRedondeado}).`);
      }

      movimiento.monto = updateMovimientoCajaDto.monto;
      await movimiento.save({ session });

      await this.creditoService.handlePaymentMade(
        movimiento.credito.toString(),
        caja.ruta,
        movimiento.cliente.toString(),
        session
      );

      await session.commitTransaction();

      return {
        success: true
      };

    } catch (error) {
      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {
      await session.endSession();
    }
  }

  async deletePago(movimientoId: string) {
    return this.transactionHelper.withTransaction(async (session) => {
      const movimiento = await this.cajaMovimientoModel.findById(movimientoId).session(session);
      if (!movimiento) {
        throw new NotFoundException(`Movimiento con el id ${movimientoId} no existe`);
      }

      if (movimiento.subTipo !== SubTipo.PAGOCREDITO) {
        throw new BadRequestException('El movimiento no es un pago de crédito');
      }

      if (!movimiento.credito || !movimiento.cliente) {
        throw new BadRequestException('El pago no tiene crédito o cliente asociado');
      }

      const caja = await this.cajaService.findByIdLean(movimiento.caja, session);
      if (!caja) {
        throw new NotFoundException(`Caja con el id ${movimiento.caja} no existe`);
      }

      const rutaId = (movimiento.ruta ?? caja.ruta).toString();
      await this.assertPagoEsDeHoy(movimiento.fecha, rutaId, session);

      const creditoId = movimiento.credito.toString();
      const clienteId = movimiento.cliente.toString();

      await this.cajaMovimientoModel.findByIdAndDelete(movimientoId, { session });

      // Recalcula saldo/estado del crédito y del cliente con los pagos restantes
      await this.creditoService.handlePaymentMade(creditoId, rutaId, clienteId, session);

      return { success: true };
    }, 'MovimientoCajaService.deletePago');
  }

  /** Solo se pueden mutar pagos cuya fecha es el día actual en la TZ de la ruta. */
  private async assertPagoEsDeHoy(
    fechaPago: Date,
    rutaId: string,
    session?: ClientSession,
  ): Promise<void> {
    const ruta = await this.rutaService.findContextById(rutaId, session);
    if (!ruta) {
      throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
    }

    const timeZone = ruta.timeZone || 'UTC';
    const inicioHoy = this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone);
    const finHoy = this.dateFnsAdapter.getEndOfTodayInTimeZone(timeZone);
    const fecha = new Date(fechaPago);

    if (fecha < inicioHoy || fecha > finHoy) {
      throw new BadRequestException(
        'Solo se pueden modificar o eliminar pagos del día de hoy',
      );
    }
  }

  async addRenovacion(createCreditoDto: CreateCreditoDto) {

    const { rutaId, clienteId, ...rest } = createCreditoDto;

    const session = await this.connection.startSession();
    session.startTransaction();

    try {

      const ruta = await this.rutaService.findOperacionContextById(rutaId, session);
      if (!ruta) throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      if (!ruta.caja_actual) throw new BadRequestException(`La ruta con el id ${rutaId} no tiene caja asociada`);
      if (!ruta.status) {
        throw new BadRequestException(`La ruta con el id ${rutaId} está cerrada`);
      }

      // create() ya rechaza si hay crédito activo (invariante P0 renovación)
      const credito = await this.creditoService.create(createCreditoDto, session);

      const movimiento = new this.cajaMovimientoModel({
        monto: credito.valor_credito,
        subTipo: SubTipo.PRESTAMO,
        tipoMovimiento: TipoMovimiento.EGRESO,
        cliente: credito.cliente,
        credito: credito._id,
        ruta: rutaId,
        caja: ruta.caja_actual,
        fecha: this.dateFnsAdapter.getStartOfTodayInTimeZone(ruta.timeZone),
      })

      await movimiento.save({ session });

      await session.commitTransaction();

      return {
        ok: true,
        movimiento,
        credito
      };

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async getHistorialPagos(rutaId: string, creditoId: string) {

    const session = await this.connection.startSession();
    session.startTransaction();

    try {

      const movimientos = await this.cajaMovimientoModel.find({
        credito: creditoId,
        subTipo: SubTipo.PAGOCREDITO,
        ruta: rutaId,
        tipoMovimiento: TipoMovimiento.INGRESO
      }).session(session);
      await session.commitTransaction();

      return movimientos.map(movimiento => CajaMovimientoEntity.fromObject(movimiento.toObject()));

    } catch (error) {

      await session.abortTransaction();
      this.handleExceptions(error);

    } finally {

      await session.endSession();

    }

  }

  async getResumenDiario(rutaId: string, fecha: string) {
    const ruta = await this.rutaService.findOperacionContextById(rutaId);
    if (!ruta) throw new NotFoundException('La Ruta no existe');
    const baseDate = new Date(fecha);
    baseDate.setUTCHours(0, 0, 0, 0);
    const inicioBusqueda = new Date(baseDate);
    const finBusqueda = new Date(baseDate);
    finBusqueda.setUTCHours(23, 59, 59, 999);
    const pagos = await this.cajaMovimientoModel.aggregate([
      {
        $match: {
          ruta: new Types.ObjectId(rutaId),
          fecha: { $gte: inicioBusqueda, $lte: finBusqueda },
          subTipo: SubTipo.PAGOCREDITO
        }
      },
      {
        $lookup: {
          from: 'clientes',
          localField: 'cliente',
          foreignField: '_id',
          as: 'clienteInfo'
        }
      },
      {
        $unwind: {
          path: '$clienteInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          fecha: 1,
          monto: 1,
          subTipo: 1,
          comentario: 1,
          cliente: {
            id: '$clienteInfo._id',
            nombre: '$clienteInfo.nombre',
            alias: '$clienteInfo.alias'
          }
        }
      }
    ])

    return pagos;

  }

  /**
   * Obtiene el resumen de movimientos de oficina (gastos, retiros, inversiones, depósitos)
   * para una ruta en un día determinado, respetando el timeZone de la ruta.
   * @param rutaId - ID de la ruta
   * @param fecha - Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)
   */
  async getResumenOficina(rutaId: string, fecha?: string): Promise<ResumenOficinaResponse> {
    // Validar que la ruta exista y obtener su timeZone
    const ruta = await this.rutaService.findOperacionContextById(rutaId);
    if (!ruta) throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);

    // Calcular rango del día respetando la timeZone de la ruta
    const { inicioDia, finDia } = this.calcularRangoDia(fecha, ruta.timeZone);

    // Subtipos relevantes para movimientos de oficina
    const subTiposOficina = [
      SubTipo.GASTO,
      SubTipo.RETIRO,
      SubTipo.INVERSION,
    ];

    // Aggregation pipeline: agrupar movimientos por subtipo
    const resultados = await this.cajaMovimientoModel.aggregate<{
      _id: string;
      total: number;
      movimientos: MovimientoResumen[];
    }>([
      {
        $match: {
          ruta: new Types.ObjectId(rutaId),
          fecha: { $gte: inicioDia, $lte: finDia },
          subTipo: { $in: subTiposOficina },
        },
      },
      {
        $group: {
          _id: '$subTipo',
          total: { $sum: '$monto' },
          movimientos: {
            $push: {
              id: '$_id',
              monto: '$monto',
              concepto: '$concepto',
              comentario: '$comentario',
              categoriaGasto: '$categoriaGasto',
              fecha: '$fecha',
            },
          },
        },
      },
    ]);

    // Transformar el resultado del aggregation al formato de respuesta tipado
    return this.mapearResultadosResumen(resultados);
  }

  /**
   * Calcula el inicio y fin de un día en la timeZone dada.
   * Si no se proporciona fecha, usa el día actual.
   */
  private calcularRangoDia(fecha: string | undefined, timeZone: string): { inicioDia: Date; finDia: Date } {
    if (fecha) {
      // Parsear la fecha proporcionada y obtener inicio/fin del día en la timeZone
      const fechaBase = new Date(`${fecha}T00:00:00`);
      const inicioDia = this.dateFnsAdapter.convertZonedTimeToUtc(fechaBase, timeZone);
      const finFecha = new Date(`${fecha}T23:59:59.999`);
      const finDia = this.dateFnsAdapter.convertZonedTimeToUtc(finFecha, timeZone);
      return { inicioDia, finDia };
    }

    // Sin fecha, usar el día actual en la timeZone de la ruta
    return {
      inicioDia: this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone),
      finDia: this.dateFnsAdapter.getEndOfTodayInTimeZone(timeZone),
    };
  }

  /**
   * Mapea los resultados del aggregation al formato tipado de ResumenOficinaResponse.
   * Si un subtipo no tiene movimientos, retorna un grupo vacío.
   */
  private mapearResultadosResumen(
    resultados: { _id: string; total: number; movimientos: MovimientoResumen[] }[],
  ): ResumenOficinaResponse {
    const grupoVacio: GrupoMovimiento = { total: 0, movimientos: [] };

    // Crear un mapa para acceso rápido por subtipo
    const mapa = new Map(
      resultados.map((r) => [r._id, { total: r.total, movimientos: r.movimientos }]),
    );

    return {
      gastos: mapa.get(SubTipo.GASTO) ?? { ...grupoVacio },
      retiros: mapa.get(SubTipo.RETIRO) ?? { ...grupoVacio },
      inversiones: mapa.get(SubTipo.INVERSION) ?? { ...grupoVacio },
    };
  }

  // --- APIs para otros módulos (Vertical 2: sin @InjectModel ajeno de MovimientoCaja) ---

  async getClienteIdsRenovadosEnRango(
    rutaId: string,
    startOfDayUtc: Date,
    endOfDayUtc: Date,
    session?: ClientSession,
  ): Promise<string[]> {
    const result = await this.cajaMovimientoModel
      .aggregate([
        {
          $match: {
            ruta: new mongoose.Types.ObjectId(rutaId),
            subTipo: SubTipo.PRESTAMO,
            fecha: { $gte: startOfDayUtc, $lt: endOfDayUtc },
          },
        },
        { $group: { _id: '$cliente' } },
      ])
      .session(session || null);

    return result.map((c) => c._id.toString());
  }

  async getClienteIdsQuePagaronEnRango(
    rutaId: string,
    startOfDayUtc: Date,
    endOfDayUtc: Date,
    session?: ClientSession,
  ): Promise<string[]> {
    const result = await this.cajaMovimientoModel
      .aggregate([
        {
          $match: {
            ruta: new mongoose.Types.ObjectId(rutaId),
            tipoMovimiento: TipoMovimiento.INGRESO,
            subTipo: SubTipo.PAGOCREDITO,
            fecha: { $gte: startOfDayUtc, $lt: endOfDayUtc },
          },
        },
        { $group: { _id: '$cliente' } },
      ])
      .session(session || null);

    return result
      .filter((c) => c._id != null)
      .map((c) => c._id.toString());
  }

  async getTotalesLedgerPorRango(
    rutaId: string,
    startOfDayUtc: Date,
    endOfDayUtc: Date,
    session?: ClientSession,
  ): Promise<{
    cobro: number;
    prestamos: number;
    inversiones: number;
    gastos: number;
    retiros: number;
  }> {
    const result = await this.cajaMovimientoModel
      .aggregate([
        {
          $match: {
            ruta: new Types.ObjectId(rutaId),
            fecha: { $gte: startOfDayUtc, $lt: endOfDayUtc },
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
      ])
      .session(session || null);

    const row = result[0] || {};
    return {
      cobro: row.cobro ?? 0,
      prestamos: row.prestamos ?? 0,
      inversiones: row.inversiones ?? 0,
      gastos: row.gastos ?? 0,
      retiros: row.retiros ?? 0,
    };
  }

  async deleteManyByRuta(rutaId: string, session: ClientSession): Promise<void> {
    await this.cajaMovimientoModel.deleteMany({ ruta: rutaId }).session(session);
  }

  /** Ownership: resolver ruta a partir de un movimiento. */
  async getRutaByMovimientoId(
    movimientoId: string,
  ): Promise<{ exists: false } | { exists: true; rutaId: string | null }> {
    const mov = await this.cajaMovimientoModel
      .findById(movimientoId)
      .select('ruta')
      .lean();
    if (!mov) return { exists: false };
    return {
      exists: true,
      rutaId: mov.ruta ? mov.ruta.toString() : null,
    };
  }

  /**
   * Vertical 3: reportes / renovaciones ejecutan pipelines propios vía el dueño del model.
   * Evita forFeature(MovimientoCaja) en módulos ajenos.
   */
  async aggregatePipeline<T = any>(pipeline: PipelineStage[]): Promise<T[]> {
    return this.cajaMovimientoModel.aggregate<T>(pipeline);
  }

  async findLean(
    filter: Record<string, any>,
    options?: { select?: string; sort?: Record<string, 1 | -1> },
  ): Promise<any[]> {
    let query = this.cajaMovimientoModel.find(filter);
    if (options?.select) query = query.select(options.select);
    if (options?.sort) query = query.sort(options.sort);
    return query.lean();
  }

  private handleExceptions(error: any) {
    if (error instanceof NotFoundException ||
      error instanceof BadRequestException ||
      error instanceof InternalServerErrorException) { // Añade otros tipos si los usas
      this.logger.warn(`[API] ${error.message}`); // Log nivel WARN para errores controlados
      throw error;
    }

    // Para errores inesperados o no clasificados, loguea el stack trace completo.
    // Esto es crucial para depurar problemas que no esperabas.
    this.logger.error(`[SERVER_ERROR] ${error.message}`, error.stack);

    // Relanza un InternalServerErrorException genérico para errores no controlados.
    // Esto evita exponer detalles internos del servidor al cliente.
    throw new InternalServerErrorException('Error inesperado. Consulte los registros del servidor.');
  }

}