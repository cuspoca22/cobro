import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';

import { Caja } from './schemas/caja.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CajaEntity } from './entities/caja.entity';
import { CreateCajaDto } from './dto';
import { CurrencyService } from '../currency/currency.service';
import { CreditoService } from '../credito/credito.service';
import { MovimientoCajaService } from '../movimientoCaja/movimiento-caja.service';
import { RutaService } from '../ruta/ruta.service';


@Injectable()
export class CajaService {

  private readonly logger = new Logger(CajaService.name);

  constructor(
    @InjectModel(Caja.name)
    private readonly cajaModel: Model<Caja>,

    private readonly dateFnsAdapter: DateFnsAdapter,

    private readonly currencyService: CurrencyService,

    // Vertical 1: consultas de crédito vía CreditoService
    private readonly creditoService: CreditoService,

    // Vertical 2: ledger vía MovimientoCajaService (sin forFeature ajeno)
    @Inject(forwardRef(() => MovimientoCajaService))
    private readonly movimientoCajaService: MovimientoCajaService,

    // V4b: Ruta vía módulo dueño (ciclo Caja ↔ Ruta)
    @Inject(forwardRef(() => RutaService))
    private readonly rutaService: RutaService,
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

  /** Delega al check liviano usado también por Auth.login. */
  async isUltimaCajaDeHoy(rutaId: string, timeZone: string): Promise<boolean> {
    const caja = await this.cajaModel
      .findOne({ ruta: rutaId })
      .sort({ fecha: -1 })
      .lean();

    if (!caja) return false;

    const startOfDayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone);
    return this.dateFnsAdapter.isEqual(caja.fecha, startOfDayUtc);
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
    if (!endOfDayUtc) {
      endOfDayUtc = this.dateFnsAdapter.addDays(startOfDayUtc, 1);
    }

    // 1. Clientes renovados hoy
    const clientesRenovadosIds = await this.movimientoCajaService.getClienteIdsRenovadosEnRango(
      rutaId,
      startOfDayUtc,
      endOfDayUtc,
      session,
    );
    const renovaciones = clientesRenovadosIds.length;

    // 2. Clientes con créditos activos al inicio del día (clientes iniciales)
    const clientesInicialesIds = await this.creditoService.getClienteIdsConCreditoActivoAntesDe(
      rutaId,
      startOfDayUtc,
      session,
    );

    // 3. Clientes que han pagado hoy
    const clientesQuePagaronHoyIds = await this.movimientoCajaService.getClienteIdsQuePagaronEnRango(
      rutaId,
      startOfDayUtc,
      endOfDayUtc,
      session,
    );

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
    return this.creditoService.getCreditSummaryForRuta(rutaId);
  }

  /**
   * FIX [P0 caja-ledger — modelo final]:
   * - Día abierto: la verdad es movimientoCaja (recalcular al consultar; NO persistir en cada pago).
   * - Cierre: se congela un snapshot en el documento Caja para consultas admin históricas.
   *
   * @param persistSnapshot si true, escribe aggregates en Caja (solo usar en closeRuta).
   */
  async getMovimientosResumen(
    rutaId: string,
    session?: ClientSession,
    options: { persistSnapshot?: boolean } = {},
  ) {
    const { persistSnapshot = false } = options;

    const ruta = await this.rutaService.findOperacionContextById(rutaId, session);
    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);
    if (!ruta.caja_actual) {
      throw new NotFoundException(`Ruta ${rutaId} no tiene caja_actual`);
    }

    const caja = await this.cajaModel.findById(ruta.caja_actual).session(session);
    if (!caja) throw new NotFoundException(`Caja con el id ${ruta.caja_actual} no existe`);

    // Caja/ruta ya cerrada: devolver el snapshot oficial sin reescribir
    if (!persistSnapshot && (!ruta.status || caja.status === false)) {
      const moraConfigCerrada = await this.creditoService.resolveMoraConfigForRuta(rutaId);
      return CajaEntity.fromObject({
        ...caja.toObject(),
        cobraMora: !!moraConfigCerrada?.cobraMora,
      });
    }

    const startOfDayUtc = caja.fecha;
    const endOfDayUtc = this.dateFnsAdapter.addDays(startOfDayUtc, 1);

    const { clientesPendientes, renovaciones } = await this.getClientesPendientesYRenovados(
      rutaId,
      startOfDayUtc,
      session,
      endOfDayUtc,
    );

    const {
      cobro = 0,
      prestamos = 0,
      inversiones = 0,
      gastos = 0,
      retiros = 0,
      moraCobrada = 0,
    } = await this.movimientoCajaService.getTotalesLedgerPorRango(
      rutaId,
      startOfDayUtc,
      endOfDayUtc,
      session,
    );

    const { moraPorCobrar = 0 } = await this.creditoService.getCreditSummaryForRuta(rutaId);
    const moraConfig = await this.creditoService.resolveMoraConfigForRuta(rutaId);
    const cobraMora = !!moraConfig?.cobraMora;

    const cobroR = cobro;
    const prestamoR = prestamos;
    const inversionR = inversiones;
    const gastoR = gastos;
    const retiroR = retiros;
    const cajaFinal = this.currencyService.round(
      caja.base + cobroR + inversionR - prestamoR - gastoR - retiroR,
      ruta.currency,
    );

    if (persistSnapshot) {
      // Snapshot de cierre: única escritura intencional de aggregates en Caja
      caja.cobro = cobroR;
      caja.prestamo = prestamoR;
      caja.inversion = inversionR;
      caja.gasto = gastoR;
      caja.retiro = retiroR;
      caja.clientes_pendientes = clientesPendientes;
      caja.renovaciones = renovaciones;
      caja.caja_final = cajaFinal;
      caja.moraCobrada = moraCobrada;
      caja.moraPorCobrar = moraPorCobrar;
      await caja.save({ session });
      return CajaEntity.fromObject({
        ...caja.toObject(),
        cobraMora,
      });
    }

    // Día abierto: devolver cálculo en vivo sin persistir (evita doble fuente de verdad)
    return CajaEntity.fromObject({
      ...caja.toObject(),
      cobro: cobroR,
      prestamo: prestamoR,
      inversion: inversionR,
      gasto: gastoR,
      retiro: retiroR,
      clientes_pendientes: clientesPendientes,
      renovaciones,
      caja_final: cajaFinal,
      moraCobrada,
      moraPorCobrar,
      cobraMora,
    });
  }

  /**
   * Caja del día en curso: siempre desde movimientoCaja (sin save).
   */
  async currentCaja(rutaId: string) {
    return await this.getMovimientosResumen(rutaId, undefined, { persistSnapshot: false });
  }

  /**
   * Congela el snapshot oficial al cerrar la ruta (persistir aggregates en Caja).
   */
  async congelarSnapshotCierre(rutaId: string, session: ClientSession) {
    return await this.getMovimientosResumen(rutaId, session, { persistSnapshot: true });
  }

  /**
   * Busca cajas históricas para una ruta en una fecha específica (uso de administración).
   * Lee el snapshot persistido en Caja (no recalcula el ledger).
   */
  async findAll(rutaId: string, fecha: string) {
    const ruta = await this.rutaService.findOperacionContextById(rutaId);
    if (!ruta) throw new NotFoundException(`Ruta con el id ${rutaId} no existe`);

    const baseDate = new Date(fecha);
    const inicioBusqueda = this.dateFnsAdapter.startOfDayUtc(baseDate);
    const finBusqueda = new Date(baseDate);
    finBusqueda.setUTCHours(23, 59, 59, 999);

    const caja = await this.cajaModel.aggregate([
      {
        $match: {
          ruta: new Types.ObjectId(rutaId),
          fecha: { $gte: inicioBusqueda, $lte: finBusqueda },
        },
      },
    ]);

    if (caja.length < 1) {
      throw new NotFoundException('No se encontraron registro de este dia');
    }

    const moraConfig = await this.creditoService.resolveMoraConfigForRuta(rutaId);
    return CajaEntity.fromObject({
      ...caja[0],
      cobraMora: !!moraConfig?.cobraMora,
    });
  }

  /** Reportes: lectura lean de cajas históricas. */
  async findLean(
    filter: Record<string, any>,
    options?: { select?: string; sort?: Record<string, 1 | -1> },
  ): Promise<any[]> {
    let query = this.cajaModel.find(filter);
    if (options?.select) query = query.select(options.select);
    if (options?.sort) query = query.sort(options.sort);
    return query.lean();
  }

  /** Hot path MovimientoCaja: caja por id (ruta + _id) con session. */
  async findByIdLean(
    cajaId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ _id: string; ruta: string } | null> {
    const caja = await this.cajaModel
      .findById(cajaId)
      .select('ruta')
      .session(session || null)
      .lean();

    if (!caja) return null;

    return {
      _id: caja._id.toString(),
      ruta: caja.ruta ? caja.ruta.toString() : '',
    };
  }

  /** Cascada delete ruta: borra todas las cajas de la ruta. */
  async deleteManyByRuta(rutaId: string, session: ClientSession): Promise<void> {
    await this.cajaModel.deleteMany({ ruta: rutaId }).session(session);
  }

  /** Busca la caja de una ruta en una fecha exacta (inicio de día UTC/TZ). */
  async findByRutaAndFecha(
    rutaId: string,
    fecha: Date,
    session?: ClientSession,
  ): Promise<CajaEntity | null> {
    const caja = await this.cajaModel
      .findOne({
        ruta: new Types.ObjectId(rutaId),
        fecha,
      })
      .session(session || null);

    return caja ? CajaEntity.fromObject(caja) : null;
  }

  /** closeRuta: marca caja del día como cerrada. */
  async markClosed(
    cajaId: string | Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    const caja = await this.cajaModel.findById(cajaId).session(session);
    if (!caja) {
      throw new NotFoundException(`Caja con el id ${cajaId} no existe`);
    }
    caja.status = false;
    await caja.save({ session });
  }

  /**
   * Reapertura same-day: reactiva la caja existente sin recrearla ni tocar `base`.
   * Los aggregates del snapshot se recalculan en vivo al consultar (ruta/caja abiertas).
   */
  async markOpen(
    cajaId: string | Types.ObjectId,
    session: ClientSession,
  ): Promise<CajaEntity> {
    const caja = await this.cajaModel.findById(cajaId).session(session);
    if (!caja) {
      throw new NotFoundException(`Caja con el id ${cajaId} no existe`);
    }
    caja.status = true;
    await caja.save({ session });
    return CajaEntity.fromObject(caja);
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
}
