import { Injectable, NotFoundException, Logger, BadRequestException, InternalServerErrorException, forwardRef, Inject, HttpException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';

import { CreateRutaDto } from './dto/create-ruta.dto';
import { UpdateRutaDto } from './dto/update-ruta.dto';
import { Connection, Model, Types, ClientSession } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { CreditoService } from '../credito/credito.service';
import { ClienteService } from '../cliente/cliente.service';
import { MessageGateway } from 'src/message/message.gateway';
import { CajaService } from '../caja/caja.service';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { Ruta } from './schema/ruta.schema';
import { CajaEntity } from '../caja/entities/caja.entity';
import { RutaEntity } from './entities/ruta.entity';
import { MovimientoCajaService } from '../movimientoCaja/movimiento-caja.service';
import { EmpresaService } from '../empresa/empresa.service';

@Injectable()
export class RutaService {

  private logger = new Logger("RutaService");

  constructor(
    @Inject(forwardRef(() => MessageGateway))
    private socketRuta: MessageGateway,

    @InjectModel(Ruta.name)
    private readonly rutaModel: Model<Ruta>,

    // Vertical 1 P2: Credito/Cliente vía servicios dueños (sin forFeature ajeno)
    @Inject(forwardRef(() => CreditoService))
    private readonly creditoService: CreditoService,

    @Inject(forwardRef(() => ClienteService))
    private readonly clienteService: ClienteService,

    // Vertical 2: MovimientoCaja vía servicio dueño
    @Inject(forwardRef(() => MovimientoCajaService))
    private readonly movimientoCajaService: MovimientoCajaService,

    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,

    @Inject(forwardRef(() => CajaService))
    private cajaSvc: CajaService,

    @Inject(forwardRef(() => EmpresaService))
    private readonly empresaService: EmpresaService,

    @InjectConnection() private readonly connection: Connection,

    private dateFnsAdapter: DateFnsAdapter,
  ) { }

  async create(createRutaDto: CreateRutaDto) {

    try {

      const ruta = await this.rutaModel.create(createRutaDto);

      return ruta;

    } catch (error) {

      this.handleExceptions(error)

    }

  }

  async findAll(): Promise<Ruta[]> {
    return await this.rutaModel.find()
  }

  async findByFilter(filter: any): Promise<Ruta[]> {

    return await this.rutaModel.find(filter)

  }

  /**
   * FIX [P2 interceptor]: lectura mínima para @RutaAbierta.
   * No populates, counts ni aggregation de cartera — solo estado de apertura.
   */
  async getEstadoApertura(id: string): Promise<{
    _id: string;
    status: boolean;
    isLocked: boolean;
    caja_actual?: string | null;
  }> {
    const ruta = await this.rutaModel
      .findById(id)
      .select('status isLocked caja_actual')
      .lean();

    if (!ruta) {
      throw new NotFoundException(`No existe una ruta con el id ${id}`);
    }

    return {
      _id: ruta._id.toString(),
      status: !!ruta.status,
      isLocked: !!ruta.isLocked,
      caja_actual: ruta.caja_actual ? ruta.caja_actual.toString() : null,
    };
  }

  /** Contexto mínimo para CreditoService (timeZone/currency) con sesión opcional. */
  async findContextById(
    rutaId: string,
    session?: ClientSession,
  ): Promise<{ _id: string; timeZone: string; currency: string } | null> {
    const ruta = await this.rutaModel
      .findById(rutaId)
      .select('timeZone currency')
      .session(session || null)
      .lean();

    if (!ruta) return null;

    return {
      _id: ruta._id.toString(),
      timeZone: ruta.timeZone,
      currency: ruta.currency,
    };
  }

  /**
   * Hot path MovimientoCaja/Caja: caja_actual + status + timeZone + currency (con session).
   */
  async findOperacionContextById(
    rutaId: string,
    session?: ClientSession,
  ): Promise<{
    _id: string;
    caja_actual: string | null;
    status: boolean;
    timeZone: string;
    currency: string;
  } | null> {
    const ruta = await this.rutaModel
      .findById(rutaId)
      .select('caja_actual status timeZone currency')
      .session(session || null)
      .lean();

    if (!ruta) return null;

    return {
      _id: ruta._id.toString(),
      caja_actual: ruta.caja_actual ? ruta.caja_actual.toString() : null,
      status: !!ruta.status,
      timeZone: ruta.timeZone || 'UTC',
      currency: ruta.currency || 'MXN',
    };
  }

  /** Ownership: empresa dueña de la ruta. */
  async getEmpresaIdByRutaId(
    rutaId: string,
  ): Promise<{ exists: false } | { exists: true; empresaId: string | null }> {
    const ruta = await this.rutaModel.findById(rutaId).select('empresa').lean();
    if (!ruta) return { exists: false };
    return {
      exists: true,
      empresaId: ruta.empresa ? ruta.empresa.toString() : null,
    };
  }

  /** Reportes: find + select + lean genérico. */
  async findLean(
    filter: Record<string, any>,
    options?: { select?: string; sort?: Record<string, 1 | -1> },
  ): Promise<any[]> {
    let query = this.rutaModel.find(filter);
    if (options?.select) query = query.select(options.select);
    if (options?.sort) query = query.sort(options.sort);
    return query.lean();
  }

  async findOne(id: string): Promise<any> {

    const ruta = await this.rutaModel.findById(id)
      .populate("ultima_caja")
      .populate("caja_actual")
      .lean();

    if (!ruta) {
      throw new NotFoundException(`No existe una ruta con el id ${id}`);
    }

    const [total_clientes, clientes_activos, metrics] = await Promise.all([
      this.clienteService.countByRuta(ruta._id),
      this.clienteService.countByRuta(ruta._id, true),
      this.creditoService.getCarteraYGananciaByRuta(ruta._id),
    ]);

    return RutaEntity.fromObject({
      ...ruta,
      total_clientes,
      clientes_activos,
      cartera: metrics.cartera,
      ganancia_total: metrics.ganancia_total,
    });

  }

  async update(id: string, updateRutaDto: UpdateRutaDto) {

    try {
      const rutaUpdate = await this.rutaModel.findByIdAndUpdate(id, updateRutaDto, { returnDocument: 'after' });
      return rutaUpdate;
    } catch (error) {
      this.handleExceptions(error);
    }

  }

  async setEmpresa(
    rutaId: string,
    empresaId: string,
    session?: ClientSession,
  ): Promise<void> {
    const updated = await this.rutaModel.findByIdAndUpdate(
      rutaId,
      { empresa: new Types.ObjectId(empresaId) },
      { session: session || undefined, new: true },
    );
    if (!updated) {
      throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
    }
  }

  async findAllByEmpresa(empresaId: string): Promise<Ruta[]> {
    return this.rutaModel.find({ empresa: empresaId });
  }

  async delete(id: string): Promise<boolean> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ruta = await this.rutaModel.findById(id).session(session);
      if (!ruta) {
        throw new NotFoundException(`La ruta con el id ${id} no existe`);
      }

      const rutaOid = new Types.ObjectId(id);
      this.logger.log(`Iniciando eliminación en cascada de la ruta ${id}...`);

      // 1. Movimientos de caja
      await this.movimientoCajaService.deleteManyByRuta(id, session);

      // 2. Mora + créditos
      await this.creditoService.deleteManyByRuta(id, session);

      // 3. Clientes
      await this.clienteService.deleteManyByRuta(id, session);

      // 4. Cajas
      await this.cajaSvc.deleteManyByRuta(id, session);

      // 5. Peticiones de ubicación y tracking del cobrador
      await this.connection.collection('Peticiones').deleteMany(
        { id_ruta: rutaOid },
        { session },
      );
      await this.connection.collection('cobrador_tracking').deleteMany(
        { ruta: rutaOid },
        { session },
      );

      // 6. Desasignar cobradores/supervisores (ruta + rutas[])
      await this.authService.clearAssignmentsToRuta(id, session);

      // 7. Quitar de Empresa.rutas
      if (ruta.empresa) {
        await this.empresaService.pullRuta(ruta.empresa, ruta._id, session);
      }

      // 8. Documento ruta
      await this.rutaModel.findByIdAndDelete(id).session(session);

      await session.commitTransaction();
      this.logger.log(`Ruta ${id} eliminada con cascada completa.`);

      return true;

    } catch (error) {
      await session.abortTransaction();
      this.handleExceptions(error);
    } finally {
      session.endSession();
    }
  }

  async closeRuta(rutaId: string): Promise<boolean> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) {
        throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      }

      if (!ruta.caja_actual) {
        throw new BadRequestException(`La ruta no tiene cajas creadas`);
      }

      // Si la ruta ya está cerrada, devolver error
      if (!ruta.status) {
        throw new BadRequestException(`La ruta ya fue cerrada el dia de hoy`);
      }

      const caja = await this.cajaSvc.findByIdLean(ruta.caja_actual, session);
      if (!caja) {
        throw new NotFoundException(`La caja con el id ${ruta.caja_actual} no existe`);
      }

      // Snapshot oficial del día: totals desde movimientoCaja + persistidos en Caja
      this.logger.log(`Cerrando ruta ${ruta._id}, congelando snapshot de caja...`);
      await this.cajaSvc.congelarSnapshotCierre(ruta._id.toString(), session);

      ruta.status = false;
      ruta.ultima_caja = ruta.caja_actual;
      await this.cajaSvc.markClosed(ruta.caja_actual, session);
      await ruta.save({ session });

      // Confirma la transacción. Si esta línea no se ejecuta, NINGÚN cambio se guardará.
      await session.commitTransaction();

      this.socketRuta.emitCloseCaja(
        ruta._id.toString(),
        ruta.empresa?.toString() ?? '',
      );

      return true;

    } catch (error) {
      // Si hay un error, aborta la transacción para revertir todos los cambios
      await session.abortTransaction();
      this.handleExceptions(error);
    } finally {
      session.endSession();
    }
  }

  /**
   * Bloqueo temporal: isLocked=true sin cerrar la ruta (status sigue true).
   * Emite `block-caja` al frontend tras persistir.
   */
  async lockRuta(rutaId: string): Promise<{
    ok: boolean;
    ruta: string;
    isLocked: true;
  }> {
    try {
      const ruta = await this.rutaModel.findById(rutaId);
      if (!ruta) {
        throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      }

      if (!ruta.status) {
        throw new BadRequestException(
          'No se puede bloquear una ruta cerrada. Ábrela primero.',
        );
      }

      if (ruta.isLocked) {
        throw new BadRequestException('La ruta ya se encuentra bloqueada');
      }

      ruta.isLocked = true;
      await ruta.save();

      const payload = {
        ruta: ruta._id.toString(),
        isLocked: true as const,
        empresa: ruta.empresa?.toString() ?? '',
      };

      this.socketRuta.emitRutaLockState(payload);

      return { ok: true, ruta: payload.ruta, isLocked: payload.isLocked };
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  /**
   * Desbloquea la ruta (isLocked=false) sin alterar status/caja.
   * Emite `unblock-caja` al frontend tras persistir.
   */
  async unlockRuta(rutaId: string): Promise<{
    ok: boolean;
    ruta: string;
    isLocked: false;
  }> {
    try {
      const ruta = await this.rutaModel.findById(rutaId);
      if (!ruta) {
        throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      }

      if (!ruta.isLocked) {
        throw new BadRequestException('La ruta no se encuentra bloqueada');
      }

      ruta.isLocked = false;
      await ruta.save();

      const payload = {
        ruta: ruta._id.toString(),
        isLocked: false as const,
        empresa: ruta.empresa?.toString() ?? '',
      };

      this.socketRuta.emitRutaLockState(payload);

      return { ok: true, ruta: payload.ruta, isLocked: payload.isLocked };
    } catch (error) {
      this.handleExceptions(error);
    }
  }

  async openRuta(rutaId: string): Promise<{ ok: boolean; caja: CajaEntity }> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ruta = await this.rutaModel.findById(rutaId).session(session);
      if (!ruta) {
        throw new NotFoundException(`La ruta con el id ${rutaId} no existe`);
      }

      if (ruta.status) {
        throw new BadRequestException(`La ruta ya se encuentra abierta.`);
      }

      // Asegurar timezone valido
      const timeZone = ruta.timeZone || 'America/Mexico_City';
      let startOfDayUtc = this.dateFnsAdapter.getStartOfTodayInTimeZone(timeZone);

      // Fallback si la fecha generada es inválida
      if (!startOfDayUtc || isNaN(startOfDayUtc.getTime())) {
        this.logger.warn(`Fecha inválida generada para timezone ${timeZone}. Usando UTC actual como fallback.`);
        startOfDayUtc = new Date();
        startOfDayUtc.setUTCHours(0, 0, 0, 0);
      }

      // Same-day: reutilizar la caja del día (índice único {ruta, fecha}).
      // Día nuevo: crear caja con base = caja_final de la última.
      const cajaDelDia = await this.cajaSvc.findByRutaAndFecha(
        rutaId,
        startOfDayUtc,
        session,
      );

      let caja: CajaEntity;
      if (cajaDelDia?.id) {
        this.logger.log(
          `Reabriendo caja del día ${cajaDelDia.id} para ruta ${rutaId}`,
        );
        caja = await this.cajaSvc.markOpen(cajaDelDia.id, session);
      } else {
        const { hayUltimaCaja, ultimaCaja } = await this.cajaSvc.getUltimaCaja(
          rutaId,
          session,
        );
        const baseCaja =
          hayUltimaCaja && ultimaCaja ? ultimaCaja.caja_final : 0;

        caja = await this.cajaSvc.create(
          {
            rutaId: rutaId,
            fecha: startOfDayUtc,
            base: baseCaja,
          },
          session,
        );
      }

      ruta.caja_actual = new Types.ObjectId(caja.id);
      ruta.status = true;
      await ruta.save({ session });

      await session.commitTransaction();

      this.socketRuta.emitOpenCaja(
        ruta._id.toString(),
        ruta.empresa?.toString() ?? '',
      );

      return {
        ok: true,
        caja,
      };

    } catch (error) {
      // Si hay un error, aborta la transacción para revertir todos los cambios
      await session.abortTransaction();
      this.handleExceptions(error)
    } finally {
      // Siempre finaliza la sesión
      session.endSession();
    }
  }

  /**
   * FIX [P1 cron multi-TZ]:
   * Antes cerraba/abría todo a las 03:00 / 07:00 America/Sao_Paulo.
   * Ahora un tick cada 5 min evalúa cada ruta en su `timeZone` local
   * (Guatemala, México, Colombia, Brasil, etc.).
   *
   * Ventana: hora objetivo y minute < 5 (coincide con el intervalo del cron),
   * close/open son idempotentes (si ya está cerrada/abierta, se registra y sigue).
   */
  private static readonly CRON_CLOSE_HOUR = 3;
  private static readonly CRON_OPEN_HOUR = 7;
  private static readonly CRON_WINDOW_MINUTES = 5;
  private static readonly DEFAULT_RUTA_TZ = 'America/Mexico_City';

  @Cron('0 */5 * * * *', {
    name: 'syncRutasPorZonaHoraria',
  })
  async syncRutasPorZonaHoraria() {
    const rutas = await this.rutaModel
      .find({})
      .select('_id status autoOpen timeZone nombre')
      .lean()
      .exec();

    for (const ruta of rutas) {
      const rutaId = ruta._id.toString();
      const timeZone = ruta.timeZone || RutaService.DEFAULT_RUTA_TZ;

      let hours: number;
      let minutes: number;
      try {
        ({ hours, minutes } = this.dateFnsAdapter.getLocalTimeParts(timeZone));
      } catch (error) {
        this.logger.error(
          `TZ inválida en ruta ${rutaId} (${timeZone}): ${error.message}`,
        );
        continue;
      }

      const inCloseWindow =
        hours === RutaService.CRON_CLOSE_HOUR &&
        minutes < RutaService.CRON_WINDOW_MINUTES;
      const inOpenWindow =
        hours === RutaService.CRON_OPEN_HOUR &&
        minutes < RutaService.CRON_WINDOW_MINUTES;

      if (inCloseWindow && ruta.status === true) {
        try {
          await this.closeRuta(rutaId);
        } catch (error) {
          this.logger.error(
            `Error cierre auto ruta ${rutaId}: ${error.message}`,
          );
        }
      }

      if (inOpenWindow && ruta.status === false && ruta.autoOpen === true) {
        try {
          await this.openRuta(rutaId);
        } catch (error) {
          this.logger.error(
            `Error apertura auto ruta ${rutaId}: ${error.message}`,
          );
        }
      }
    }
  }

  private handleExceptions(error: any) {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error.code === 11000) {
      throw new BadRequestException(error.message);
    }

    this.logger.error(error);
    throw new InternalServerErrorException("Revisar los logs")
  }


  // ACTUALIZAR RUTA IMPLICA QUE SE DEBE CALCULAR NUEVAMENTE SU CARTERA, GASTOS Y DEMAS
  public async actualizarRuta(idRuta: any): Promise<void> {

    const ruta = await this.rutaModel.findById(idRuta);

    if (!ruta) throw new NotFoundException(`La ruta con el id ${idRuta} no existe`);

    try {

      const [clientes, clientesActivos, allCreditos] =
        await Promise.all([
          this.clienteService.countByRuta(ruta._id),
          this.clienteService.countByRuta(ruta._id, true),
          this.creditoService.findIdsAndValorByRuta(ruta._id.toString()),
        ]);

      // TODO: CALCULAR EL CARTERA, total_cobrado, total_prestado, clientes, clientes_activos
      const totalPrestado = allCreditos.reduce((sum, credito) => sum + credito.valor_credito, 0);

      await ruta.updateOne({
        total_prestado: totalPrestado,
        clientes,
        clientes_activos: clientesActivos,
      }, { returnDocument: 'after' });

    } catch (error) {

      this.handleExceptions(error);

    }

  }

}
