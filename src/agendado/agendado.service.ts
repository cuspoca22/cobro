import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { GetUserDto } from 'src/auth/dto';
import { ValidRoles } from 'src/auth/interfaces';
import { AuthService } from 'src/auth/auth.service';
import { ClienteService } from 'src/cliente/cliente.service';
import { getScopedRutaIds, normalizeId } from 'src/common/helpers';
import {
  CreditoEliminadoPayload,
  RenovacionCreadaPayload,
} from 'src/common/events/events.module';
import { MessageGateway } from 'src/message/message.gateway';
import { MovimientoCajaService } from 'src/movimientoCaja/movimiento-caja.service';
import { SubTipo } from 'src/movimientoCaja/interfaces';
import { RutaService } from 'src/ruta/ruta.service';
import { AgendaClock } from './agenda-clock';
import {
  FALLBACK_RUTA_TZ,
  compararVisitas,
  faseDeVisita,
  hayPrestamoPosterior,
  isFechaCalendario,
  PrestamoRef,
  prestamoQueCumple,
  recordarEnUtc,
  recordatorioEstado,
} from './agenda-time';
import { CondicionesAgendadoDto } from './dto/condiciones-agendado.dto';
import { CreateAgendadoDto } from './dto/create-agendado.dto';
import { GetAgendadosDto } from './dto/get-agendados.dto';
import { UpdateAgendadoDto } from './dto/update-agendado.dto';
import { AgendadoListItem } from './interfaces/agendado-list-item';
import { Agendado } from './schemas/agendado.schema';
import { PUSH_DISPATCHER, PushDispatcher } from './push/push-dispatcher';

type AgendadoDoc = Agendado & { _id: Types.ObjectId; createdAt: Date };

@Injectable()
export class AgendadoService {
  private readonly logger = new Logger(AgendadoService.name);

  constructor(
    @InjectModel(Agendado.name)
    private readonly agendadoModel: Model<Agendado>,
    private readonly clock: AgendaClock,
    private readonly clienteService: ClienteService,
    private readonly rutaService: RutaService,
    private readonly authService: AuthService,
    private readonly movimientoCajaService: MovimientoCajaService,
    private readonly messageGateway: MessageGateway,
    @Inject(PUSH_DISPATCHER)
    private readonly pushDispatcher: PushDispatcher,
  ) {}

  async create(user: GetUserDto, dto: CreateAgendadoDto): Promise<AgendadoListItem> {
    this.assertCobrador(user);
    const cliente = await this.clienteDeRuta(dto.clienteId, dto.rutaId);
    const rutaId = dto.rutaId || cliente.ruta;
    if (!rutaId) throw new BadRequestException('El cliente no tiene ruta');
    const { timeZone, empresaId } = await this.rutaDeTrabajo(rutaId, user);
    const now = this.clock.now();
    this.assertFechaVisita(dto.fechaVisita, timeZone, now);
    this.assertCondiciones(dto.condiciones);

    const recordarEn = recordarEnUtc(dto.fechaVisita, dto.horaRecordatorio, timeZone);
    const recEstado = recordatorioEstado(recordarEn, now);
    const _id = new Types.ObjectId();
    const alias = cliente.alias || cliente.nombre;
    const doc: AgendadoDoc = {
      _id,
      cliente: new Types.ObjectId(dto.clienteId),
      ruta: new Types.ObjectId(rutaId),
      empresa: new Types.ObjectId(empresaId),
      creadoPor: new Types.ObjectId(user.id),
      fechaVisita: dto.fechaVisita,
      horaRecordatorio: dto.horaRecordatorio,
      recordarEn,
      condiciones: dto.condiciones,
      estado: 'pendiente',
      recordatorio: {
        estado: recEstado,
        canal: 'local',
        payload: {
          title: 'Renovación agendada',
          body: `${alias} · ${dto.fechaVisita} ${dto.horaRecordatorio}`,
          agendadoId: _id.toString(),
          clienteId: dto.clienteId,
        },
        intentos: 0,
      },
      createdAt: now,
    } as AgendadoDoc;

    try {
      await this.agendadoModel.create(doc);
    } catch (error) {
      if (error?.code === 11000) {
        throw new ConflictException('Este cliente ya tiene una renovación agendada');
      }
      throw error;
    }

    const [item] = await this.toListItems([doc]);
    this.publish(item.id, item.rutaId, item.empresaId, item.estado);
    return item;
  }

  async update(
    user: GetUserDto,
    id: string,
    dto: UpdateAgendadoDto,
  ): Promise<AgendadoListItem> {
    this.assertCobrador(user);
    if (!dto.fechaVisita && !dto.horaRecordatorio && !dto.condiciones) {
      throw new BadRequestException('No hay cambios para guardar');
    }

    const ag = await this.pendienteDelCobrador(user, id);
    const rutaId = ag.ruta.toString();
    const { timeZone } = await this.rutaDeTrabajo(rutaId, user);
    const now = this.clock.now();
    const fecha = dto.fechaVisita ?? ag.fechaVisita;
    const hora = dto.horaRecordatorio ?? ag.horaRecordatorio;
    const cambiaCita = fecha !== ag.fechaVisita || hora !== ag.horaRecordatorio;
    if (fecha !== ag.fechaVisita) this.assertFechaVisita(fecha, timeZone, now);
    if (dto.condiciones) this.assertCondiciones(dto.condiciones);

    const cliente = await this.clienteService.findByIdLean(ag.cliente.toString());
    const alias = cliente?.alias || cliente?.nombre || 'Cliente';
    const recordarEn = recordarEnUtc(fecha, hora, timeZone);
    const condiciones = dto.condiciones ?? ag.condiciones;

    const cambios: Record<string, unknown> = {
      fechaVisita: fecha,
      horaRecordatorio: hora,
      recordarEn,
      condiciones,
      'recordatorio.payload.body': `${alias} · ${fecha} ${hora}`,
    };
    if (cambiaCita) {
      cambios['recordatorio.estado'] = recordatorioEstado(recordarEn, now);
    }

    const updated = await this.agendadoModel.findOneAndUpdate(
      { _id: ag._id, estado: 'pendiente' },
      { $set: cambios },
      { new: true },
    ).lean();

    if (!updated) {
      throw new NotFoundException('El agendado ya no está pendiente');
    }

    const [item] = await this.toListItems([updated as AgendadoDoc]);
    this.publish(item.id, item.rutaId, item.empresaId, item.estado);
    return item;
  }

  async cancelar(user: GetUserDto, id: string): Promise<{ ok: true }> {
    this.assertCobrador(user);
    const ag = await this.pendienteDelCobrador(user, id);
    const now = this.clock.now();
    const set: Record<string, unknown> = {
      estado: 'cancelado',
      canceladoEn: now,
    };
    if (ag.recordatorio?.estado === 'programado') {
      set['recordatorio.estado'] = 'omitido';
    }

    const updated = await this.agendadoModel.findOneAndUpdate(
      { _id: ag._id, estado: 'pendiente' },
      { $set: set },
      { new: true },
    ).lean();

    if (!updated) {
      throw new NotFoundException('El agendado ya no está pendiente');
    }

    this.publish(
      updated._id.toString(),
      updated.ruta.toString(),
      updated.empresa.toString(),
      updated.estado,
    );
    return { ok: true };
  }

  async list(user: GetUserDto, query: GetAgendadosDto): Promise<AgendadoListItem[]> {
    const filter = this.filtroLista(user, query);
    if (!filter) return [];

    const docs = await this.agendadoModel.find(filter).lean();
    const cumplidos = await this.reconcilePendientes(docs as AgendadoDoc[]);
    const vigentes = (docs as AgendadoDoc[]).filter(
      (doc) => !cumplidos.has(doc._id.toString()),
    );
    return this.toListItems(vigentes);
  }

  async cumplirPorRenovacion(payload: RenovacionCreadaPayload): Promise<void> {
    const createdAt = new Date(payload.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !payload.clienteId) return;

    const ag = await this.agendadoModel.findOne({
      cliente: payload.clienteId,
      estado: 'pendiente',
      createdAt: { $lt: createdAt },
    });
    if (!ag) return;

    const set: Record<string, unknown> = {
      estado: 'cumplido',
      creditoId: new Types.ObjectId(payload.creditoId),
      movimientoId: new Types.ObjectId(payload.movimientoId),
      cumplidoEn: this.clock.now(),
    };
    if (ag.recordatorio?.estado === 'programado') {
      set['recordatorio.estado'] = 'omitido';
    }

    const updated = await this.agendadoModel.findOneAndUpdate(
      { _id: ag._id, estado: 'pendiente' },
      { $set: set },
      { new: true },
    ).lean();
    if (!updated) return;

    this.publish(
      updated._id.toString(),
      updated.ruta.toString(),
      updated.empresa?.toString() ?? payload.empresaId ?? '',
      updated.estado,
    );
  }

  async reabrirPorCreditoEliminado(payload: CreditoEliminadoPayload): Promise<void> {
    if (payload.subTipo !== SubTipo.PRESTAMO || !payload.creditoId) return;

    const ag = await this.agendadoModel.findOne({
      creditoId: payload.creditoId,
      estado: 'cumplido',
    });
    if (!ag?.createdAt) return;

    const prestamos = await this.movimientoCajaService.findPrestamosPorClientes([
      payload.clienteId || ag.cliente.toString(),
    ]);
    if (hayPrestamoPosterior(ag.createdAt, prestamos)) return;

    const estadoRecordatorio = recordatorioEstado(ag.recordarEn, this.clock.now());
    const updated = await this.agendadoModel.findOneAndUpdate(
      { _id: ag._id, estado: 'cumplido', creditoId: ag.creditoId },
      {
        $set: {
          estado: 'pendiente',
          'recordatorio.estado': estadoRecordatorio,
        },
        $unset: { creditoId: '', movimientoId: '', cumplidoEn: '' },
      },
      { new: true },
    ).lean();
    if (!updated) return;

    this.publish(
      updated._id.toString(),
      updated.ruta.toString(),
      updated.empresa?.toString() ?? payload.empresaId ?? '',
      updated.estado,
    );
  }

  /**
   * Corre solo con PUSH_ENABLED=true. Si Firebase no está configurado,
   * el recordatorio sigue en `programado` para el día en que sí lo esté.
   */
  async despacharPushPendientes(): Promise<void> {
    const due = await this.agendadoModel
      .find({
        estado: 'pendiente',
        'recordatorio.estado': 'programado',
        recordarEn: { $lte: this.clock.now() },
      })
      .limit(50);

    for (const ag of due) {
      const userId = await this.authService.findCobradorActivoPorRuta(ag.ruta.toString());
      if (!userId) continue;

      const result = await this.pushDispatcher.dispatch({
        userId,
        title: ag.recordatorio.payload.title,
        body: ag.recordatorio.payload.body,
        data: {
          tipo: 'agendado_recordatorio',
          agendadoId: ag._id.toString(),
          clienteId: ag.cliente.toString(),
        },
      });

      if (result.delivered === false) {
        if (result.reason === 'not_configured') return;
        await this.agendadoModel.updateOne(
          { _id: ag._id },
          { $inc: { 'recordatorio.intentos': 1 } },
        );
        continue;
      }

      await this.agendadoModel.updateOne(
        { _id: ag._id, 'recordatorio.estado': 'programado' },
        {
          $set: {
            'recordatorio.estado': 'enviado',
            'recordatorio.canal': 'push',
            'recordatorio.despachadoEn': this.clock.now(),
          },
          $inc: { 'recordatorio.intentos': 1 },
        },
      );
    }
  }

  private async reconcilePendientes(docs: AgendadoDoc[]): Promise<Set<string>> {
    const cumplidos = new Set<string>();
    if (!docs.length) return cumplidos;

    const clienteIds = [...new Set(docs.map((doc) => doc.cliente.toString()))];
    const prestamos = await this.movimientoCajaService.findPrestamosPorClientes(clienteIds);
    const porCliente = new Map<string, PrestamoRef[]>();
    for (const prestamo of prestamos) {
      const lista = porCliente.get(prestamo.clienteId) ?? [];
      lista.push(prestamo);
      porCliente.set(prestamo.clienteId, lista);
    }

    for (const doc of docs) {
      if (!doc.createdAt) continue;
      const match = prestamoQueCumple(
        doc.createdAt,
        porCliente.get(doc.cliente.toString()) ?? [],
      );
      if (!match) continue;

      const set: Record<string, unknown> = {
        estado: 'cumplido',
        creditoId: new Types.ObjectId(match.creditoId),
        movimientoId: new Types.ObjectId(match.movimientoId),
        cumplidoEn: this.clock.now(),
      };
      if (doc.recordatorio?.estado === 'programado') {
        set['recordatorio.estado'] = 'omitido';
      }

      const updated = await this.agendadoModel.findOneAndUpdate(
        { _id: doc._id, estado: 'pendiente' },
        { $set: set },
        { new: true },
      ).lean();
      if (!updated) continue;

      cumplidos.add(doc._id.toString());
      this.publish(
        updated._id.toString(),
        updated.ruta.toString(),
        updated.empresa?.toString() ?? '',
        updated.estado,
      );
    }

    return cumplidos;
  }

  private filtroLista(
    user: GetUserDto,
    query: GetAgendadosDto,
  ): Record<string, unknown> | null {
    const scoped = getScopedRutaIds(user);
    if (query.rutaId && Array.isArray(scoped) && !scoped.includes(query.rutaId)) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
    }
    if (Array.isArray(scoped) && scoped.length === 0) return null;

    const empresa = normalizeId(user.empresa);
    if (!empresa && user.rol !== ValidRoles.superAdmin) {
      throw new ForbiddenException('El usuario no tiene una empresa asignada');
    }

    const filter: Record<string, unknown> = { estado: 'pendiente' };
    if (empresa) {
      filter.empresa = new Types.ObjectId(empresa);
    }

    const rutas = query.rutaId ? [query.rutaId] : scoped;
    if (Array.isArray(rutas)) {
      filter.ruta = { $in: rutas.map((id) => new Types.ObjectId(id)) };
    }
    return filter;
  }

  private async toListItems(docs: AgendadoDoc[]): Promise<AgendadoListItem[]> {
    if (!docs.length) return [];

    const now = this.clock.now();
    const rutaIds = [...new Set(docs.map((doc) => doc.ruta.toString()))];
    const clienteIds = [...new Set(docs.map((doc) => doc.cliente.toString()))];
    const userIds = [...new Set(docs.map((doc) => doc.creadoPor.toString()))];

    const [rutas, nombres] = await Promise.all([
      this.rutaService.findAgendaContextByIds(rutaIds),
      this.authService.findNombresByIds(userIds),
    ]);
    const clientes = await this.clienteService.findByIdsLean(clienteIds);

    const rutaPorId = new Map(rutas.map((ruta) => [ruta.id, ruta]));
    const nombrePorId = new Map(nombres.map((user) => [user.id, user.nombre]));
    const clientePorId = new Map(
      clientes.filter((cliente) => !!cliente).map((cliente) => [cliente!._id.toString(), cliente!]),
    );

    const items = docs.map((doc) => {
      const ruta = rutaPorId.get(doc.ruta.toString());
      const cliente = clientePorId.get(doc.cliente.toString());
      const timeZone = ruta?.timeZone || FALLBACK_RUTA_TZ;
      const condiciones = doc.condiciones;
      return {
        id: doc._id.toString(),
        clienteId: doc.cliente.toString(),
        alias: cliente?.alias || cliente?.nombre || 'Cliente',
        nombre: cliente?.nombre || '',
        rutaId: doc.ruta.toString(),
        rutaNombre: ruta?.nombre || '',
        empresaId: doc.empresa.toString(),
        creadoPorId: doc.creadoPor.toString(),
        creadoPorNombre: nombrePorId.get(doc.creadoPor.toString()) || '',
        fechaVisita: doc.fechaVisita,
        horaRecordatorio: doc.horaRecordatorio,
        recordarEn: new Date(doc.recordarEn).toISOString(),
        fase: faseDeVisita(doc.fechaVisita, timeZone, now),
        puedeRenovar: cliente ? cliente.status === false : false,
        estado: doc.estado,
        condiciones: {
          valor_credito: condiciones.valor_credito,
          total_cuotas: condiciones.total_cuotas,
          frecuencia_cobro: condiciones.frecuencia_cobro,
          modo: condiciones.modo,
          interes: condiciones.interes,
          valor_cuota: condiciones.valor_cuota,
          observaciones: condiciones.observaciones,
        },
        recordatorioEstado: doc.recordatorio?.estado ?? 'omitido',
      } satisfies AgendadoListItem;
    });

    items.sort(compararVisitas);
    return items;
  }

  private async rutaDeTrabajo(
    rutaId: string,
    user: GetUserDto,
  ): Promise<{ timeZone: string; empresaId: string }> {
    if (user.rol === ValidRoles.cobrador) {
      const propia = normalizeId(user.ruta);
      if (!propia || propia !== rutaId) {
        throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
      }
    }

    const ruta = await this.rutaService.findContextById(rutaId);
    if (!ruta) throw new NotFoundException('La ruta no existe');

    const empresa = await this.rutaService.getEmpresaIdByRutaId(rutaId);
    if (!empresa.exists || !empresa.empresaId) {
      throw new BadRequestException('La ruta no tiene empresa');
    }
    if (user.empresa && user.empresa !== empresa.empresaId && user.rol !== ValidRoles.superAdmin) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
    }

    return {
      timeZone: ruta.timeZone || FALLBACK_RUTA_TZ,
      empresaId: empresa.empresaId,
    };
  }

  private async clienteDeRuta(clienteId: string, rutaId?: string) {
    const cliente = await this.clienteService.findByIdLean(clienteId);
    if (!cliente) throw new NotFoundException('No existe el cliente');
    if (!cliente.state) throw new BadRequestException('Cliente desactivado');
    if (!cliente.ruta) throw new BadRequestException('El cliente no tiene ruta');
    if (rutaId && cliente.ruta !== rutaId) {
      throw new BadRequestException('El cliente no pertenece a esta ruta');
    }
    return cliente;
  }

  private async pendienteDelCobrador(user: GetUserDto, id: string): Promise<AgendadoDoc> {
    const ag = await this.agendadoModel.findById(id);
    if (!ag) throw new NotFoundException('El agendado no existe');
    const rutaUsuario = normalizeId(user.ruta);
    if (!rutaUsuario || rutaUsuario !== ag.ruta.toString()) {
      throw new ForbiddenException('No tienes permiso para operar sobre esta ruta');
    }
    if (ag.estado !== 'pendiente') {
      throw new BadRequestException('Solo se puede modificar un agendado pendiente');
    }
    return ag as AgendadoDoc;
  }

  private assertCobrador(user: GetUserDto): void {
    if (user.rol !== ValidRoles.cobrador) {
      throw new ForbiddenException('Solo el cobrador puede agendar renovaciones');
    }
  }

  private assertFechaVisita(fecha: string, timeZone: string, now: Date): void {
    if (!isFechaCalendario(fecha)) {
      throw new BadRequestException('La fecha de la visita no es válida');
    }
    const today = faseDeVisita(fecha, timeZone, now);
    if (today === 'vencido') {
      throw new BadRequestException('La fecha de la visita no puede ser anterior a hoy');
    }
  }

  private assertCondiciones(condiciones: CondicionesAgendadoDto): void {
    if (condiciones.modo === 'automatico' && (condiciones.interes === undefined || condiciones.interes === null)) {
      throw new BadRequestException('El modo automático requiere el interés');
    }
    if (condiciones.modo === 'manual' && (condiciones.valor_cuota === undefined || condiciones.valor_cuota === null)) {
      throw new BadRequestException('El modo manual requiere el valor de la cuota');
    }
  }

  private publish(id: string, rutaId: string, empresaId: string, estado: string): void {
    if (!id || !rutaId) return;
    try {
      this.messageGateway.emitAgendadoChanged({ id, rutaId, empresaId, estado });
    } catch (error) {
      this.logger.warn(`No se pudo emitir agendado:changed: ${error?.message ?? error}`);
    }
  }
}
