import { forwardRef, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { AuthService } from 'src/auth/auth.service';
import { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { getScopedRutaIds } from 'src/common/helpers';
import { RutaService } from 'src/ruta/ruta.service';
import { TrackingService } from 'src/tracking/tracking.service';
import {
  WsAuthEventService,
  RecordWsAuthFailureInput,
} from 'src/ws-auth-event/ws-auth-event.service';
import { WsAuthFailureReason } from 'src/ws-auth-event/schemas/ws-auth-event.schema';
import {
  SocketUserData,
  WsCommandAck,
  adminRoom,
  empresaRoom,
  isAdminSocketRole,
  isSuperAdminRole,
  isSupervisorRole,
  rutaRoom,
  superAdminRoom,
  userRoom,
} from './interfaces/socket-auth.interface';
import { MessageService } from './message.service';

export type RutaLockStatePayload = {
  ruta: string;
  isLocked: boolean;
  empresa: string;
};

export type MoraActualizadaTipo = 'APLICAR' | 'PERDONAR';

export type MoraActualizadaPayload = {
  ruta: string;
  empresa: string;
  creditoId: string;
  tipo: MoraActualizadaTipo;
  monto: number;
  mora_adeudada: number;
  clienteNombre?: string;
};

export type MoraConfigActualizadaPayload = {
  empresa: string;
  cobraMora: boolean;
  permiteMoraVoluntaria: boolean;
  porcentajeMora: number;
  baseCalculoMora: string;
};

@WebSocketGateway({
  cors: true,
  // Debe caber bajo nginx proxy_read_timeout (recomendado >= 120s).
  pingInterval: 25_000,
  pingTimeout: 60_000,
})
export class MessageGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() wss: Server;
  private readonly logger = new Logger(MessageGateway.name);

  constructor(
    private readonly messageService: MessageService,
    @Inject(forwardRef(() => RutaService))
    private readonly rutaService: RutaService,
    @Inject(forwardRef(() => TrackingService))
    private readonly trackingService: TrackingService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly wsAuthEventService: WsAuthEventService,
  ) {}

  async handleConnection(client: Socket) {
    const meta = this.extractClientMeta(client);

    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers?.authorization?.replace(
          /^Bearer\s+/i,
          '',
        ) as string | undefined);

      if (!token) {
        this.rejectWs(client, {
          reason: WsAuthFailureReason.NO_TOKEN,
          message: 'WS rechazado: sin token',
          ...meta,
        });
        return;
      }

      let payload: JwtPayload;
      try {
        payload = this.jwtService.verify<JwtPayload>(token);
      } catch (error) {
        const errMsg = (error as Error).message || 'invalid token';
        const decoded = this.safeDecodeJwt(token);
        const isExpired = /jwt expired/i.test(errMsg);
        const reason = isExpired
          ? WsAuthFailureReason.JWT_EXPIRED
          : WsAuthFailureReason.JWT_INVALID;

        let snapshot:
          | Awaited<ReturnType<AuthService['diagnoseWsSession']>>['snapshot']
          | undefined;
        if (decoded?.id) {
          const diagnosis = await this.authService.diagnoseWsSession(
            decoded.id,
            decoded.sid || '',
          );
          snapshot = diagnosis.snapshot;
        }

        this.rejectWs(client, {
          reason,
          message: `WS auth fallida: ${errMsg}`,
          userId: decoded?.id || snapshot?.userId,
          tokenSid: decoded?.sid,
          username: snapshot?.username,
          userNombre: snapshot?.userNombre,
          userRol: snapshot?.userRol,
          empresaId: snapshot?.empresaId,
          userEstado: snapshot?.userEstado,
          hasActiveSession: snapshot?.hasActiveSession,
          activeSessionExpiresAt: snapshot?.activeSessionExpiresAt,
          ...meta,
        });
        return;
      }

      if (!payload?.sid) {
        this.rejectWs(client, {
          reason: WsAuthFailureReason.NO_SID,
          message: 'WS rechazado: token sin sid',
          userId: payload?.id,
          ...meta,
        });
        return;
      }

      const diagnosis = await this.authService.diagnoseWsSession(
        payload.id,
        payload.sid,
      );
      const user = diagnosis.user;
      const snap = diagnosis.snapshot;

      if (!user) {
        const reasonMap: Record<
          Exclude<typeof diagnosis.reason, 'OK'>,
          WsAuthFailureReason
        > = {
          USER_NOT_FOUND: WsAuthFailureReason.USER_NOT_FOUND,
          USER_INACTIVE: WsAuthFailureReason.USER_INACTIVE,
          NO_ACTIVE_SESSION: WsAuthFailureReason.NO_ACTIVE_SESSION,
          SESSION_MISMATCH: WsAuthFailureReason.SESSION_MISMATCH,
        };
        const reason =
          diagnosis.reason === 'OK'
            ? WsAuthFailureReason.USER_NOT_FOUND
            : reasonMap[diagnosis.reason];
        const who =
          snap?.userNombre ||
          snap?.username ||
          payload.id ||
          'desconocido';
        this.rejectWs(client, {
          reason,
          message: `WS rechazado: ${diagnosis.reason} (${who})`,
          userId: snap?.userId || payload.id,
          tokenSid: payload.sid,
          username: snap?.username,
          userNombre: snap?.userNombre,
          userRol: snap?.userRol,
          empresaId: snap?.empresaId,
          userEstado: snap?.userEstado,
          hasActiveSession: snap?.hasActiveSession,
          activeSessionExpiresAt: snap?.activeSessionExpiresAt,
          ...meta,
        });
        return;
      }

      const isSuperAdmin = isSuperAdminRole(user.rol);
      if (!user.empresa && !isSuperAdmin) {
        this.rejectWs(client, {
          reason: WsAuthFailureReason.NO_EMPRESA,
          message: `WS rechazado: usuario ${user.id} (${user.rol}) sin empresa`,
          userId: String(user.id),
          tokenSid: payload.sid,
          username: snap?.username,
          userNombre: user.nombre,
          userRol: user.rol,
          userEstado: true,
          hasActiveSession: true,
          ...meta,
        });
        return;
      }

      const empresaId = user.empresa ? String(user.empresa) : undefined;
      const data: SocketUserData = {
        userId: String(user.id),
        rol: user.rol,
        empresaId,
        rutaId: user.ruta ? String(user.ruta) : undefined,
        rutaIds: Array.isArray(user.rutas) ? user.rutas.map(String) : [],
        nombre: user.nombre,
      };
      client.data.user = data;

      await client.join(userRoom(data.userId));

      if (isSuperAdmin) {
        await client.join(superAdminRoom());
      }

      if (empresaId) {
        await client.join(empresaRoom(empresaId));

        if (isSupervisorRole(user.rol)) {
          for (const rid of data.rutaIds ?? []) {
            if (rid) await client.join(rutaRoom(rid));
          }
          await this.sendTrackingSnapshot(client, empresaId, data.rutaIds);
        } else if (isAdminSocketRole(user.rol)) {
          await client.join(adminRoom(empresaId));
          await this.sendTrackingSnapshot(client, empresaId);
        }
      }

      if (user.rol === 'COBRADOR' && empresaId) {
        this.trackingService.registerCobradorOnline(client.id, {
          userId: data.userId,
          empresaId,
          nombre: data.nombre,
          rutaId: data.rutaId,
        });
        this.emitToAdminAndRuta(empresaId, data.rutaId, 'cobrador:presence', {
          cobradorId: data.userId,
          nombre: data.nombre,
          rutaId: data.rutaId,
          online: true,
          at: new Date().toISOString(),
        });

        const ultima = await this.trackingService.getUltimaUbicacionHoy(
          data.userId,
        );
        if (ultima) {
          this.emitToAdminAndRuta(
            empresaId,
            data.rutaId ?? ultima.rutaId,
            'cobrador:location',
            {
              cobradorId: data.userId,
              nombre: data.nombre,
              rutaId: data.rutaId ?? ultima.rutaId,
              lng: ultima.lng,
              lat: ultima.lat,
              at: new Date(ultima.at).toISOString(),
            },
          );
        }
      }
    } catch (error) {
      this.rejectWs(client, {
        reason: WsAuthFailureReason.JWT_INVALID,
        message: `WS auth fallida: ${(error as Error).message}`,
        ...meta,
      });
    }
  }

  private extractClientMeta(client: Socket): {
    socketId: string;
    ipAddress?: string;
    userAgent?: string;
  } {
    const forwarded = client.handshake.headers?.['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : undefined;
    const ua = client.handshake.headers?.['user-agent'];
    return {
      socketId: client.id,
      ipAddress: forwardedIp || client.handshake.address,
      userAgent: Array.isArray(ua) ? ua[0] : ua,
    };
  }

  private safeDecodeJwt(token: string): JwtPayload | null {
    try {
      const decoded = this.jwtService.decode(token) as JwtPayload | null;
      if (!decoded || typeof decoded !== 'object') return null;
      return decoded;
    } catch {
      return null;
    }
  }

  private rejectWs(
    client: Socket,
    input: RecordWsAuthFailureInput,
  ): void {
    this.logger.warn(input.message);
    void this.wsAuthEventService.recordFailure(input);
    client.disconnect(true);
  }

  handleDisconnect(client: Socket) {
    const data = client.data?.user as SocketUserData | undefined;
    if (!data || data.rol !== 'COBRADOR' || !data.empresaId) return;

    const wentOffline = this.trackingService.unregisterCobradorSocket(
      data.userId,
      client.id,
    );
    if (!wentOffline) return;

    this.emitToAdminAndRuta(
      String(data.empresaId),
      data.rutaId,
      'cobrador:presence',
      {
        cobradorId: data.userId,
        nombre: data.nombre,
        rutaId: data.rutaId,
        online: false,
        at: new Date().toISOString(),
      },
    );
  }

  private async sendTrackingSnapshot(
    client: Socket,
    empresaId: string,
    rutaIds?: string[],
  ) {
    const onlineIds = this.trackingService.getOnlineCobradorIds(empresaId);
    const cobradores = await this.trackingService.getEmpresaHoy(
      empresaId,
      onlineIds,
      rutaIds,
    );
    client.emit('tracking:snapshot', { empresaId, cobradores });
  }

  /** Emite a adminRoom(empresa) y, si hay ruta, también a rutaRoom. */
  private emitToAdminAndRuta(
    empresaId: string,
    rutaId: string | undefined,
    event: string,
    payload: unknown,
  ): void {
    if (empresaId) {
      this.wss.to(adminRoom(empresaId)).emit(event, payload);
    }
    if (rutaId) {
      this.wss.to(rutaRoom(rutaId)).emit(event, payload);
    }
  }

  /** True si hay al menos un socket en la room del usuario (presencia UI; no decide login). */
  hasActiveUserConnection(userId: string): boolean {
    if (!this.wss || !userId) return false;
    const room = this.wss.sockets?.adapter?.rooms?.get(userRoom(userId));
    return !!room && room.size > 0;
  }

  /** Cierra sesión en el cliente (liberación admin / revocación). */
  emitSessionRevoked(
    userId: string,
    payload: { reason?: string } = {},
  ): void {
    if (!this.wss || !userId) return;
    this.wss.to(userRoom(userId)).emit('session-revoked', {
      reason: payload.reason ?? 'SESSION_REVOKED',
      at: new Date().toISOString(),
    });
  }

  /**
   * Notifica a SUPERADMIN y ADMIN de empresa el cambio de sesión de un usuario
   * (login / logout / liberar), para actualizar UI en tiempo real.
   */
  emitSessionState(payload: {
    userId: string;
    hasActiveSession: boolean;
    activeSessionExpiresAt?: string | Date | null;
    empresaId?: string | null;
    reason?: string;
  }): void {
    if (!this.wss || !payload.userId) return;

    const body = {
      userId: payload.userId,
      hasActiveSession: !!payload.hasActiveSession,
      activeSessionExpiresAt: payload.activeSessionExpiresAt
        ? new Date(payload.activeSessionExpiresAt).toISOString()
        : null,
      empresaId: payload.empresaId ? String(payload.empresaId) : null,
      reason: payload.reason ?? 'SESSION_STATE',
      at: new Date().toISOString(),
    };

    // userRoom: respaldo de cierre remoto (cobrador/admin) si se pierde session-revoked.
    this.wss.to(userRoom(payload.userId)).emit('session:state', body);
    this.wss.to(superAdminRoom()).emit('session:state', body);
    if (body.empresaId) {
      this.wss.to(adminRoom(body.empresaId)).emit('session:state', body);
    }
  }

  emitRutaLockState(payload: RutaLockStatePayload): void {
    if (!payload.empresa) {
      this.logger.warn(
        `emitRutaLockState omitido: ruta=${payload.ruta} sin empresa`,
      );
      return;
    }
    const event = payload.isLocked ? 'block-caja' : 'unblock-caja';
    this.wss.to(empresaRoom(payload.empresa)).emit(event, payload);
    if (payload.ruta) {
      this.wss.to(rutaRoom(payload.ruta)).emit(event, payload);
    }
  }

  emitCloseCaja(rutaId: string, empresaId: string): void {
    if (!empresaId) {
      this.logger.warn(`emitCloseCaja omitido: ruta=${rutaId} sin empresa`);
      return;
    }
    const payload = { ruta: rutaId };
    this.wss.to(empresaRoom(empresaId)).emit('close-caja', payload);
    if (rutaId) {
      this.wss.to(rutaRoom(rutaId)).emit('close-caja', payload);
    }
  }

  emitOpenCaja(rutaId: string, empresaId: string): void {
    if (!empresaId) {
      this.logger.warn(`emitOpenCaja omitido: ruta=${rutaId} sin empresa`);
      return;
    }
    const payload = { ruta: rutaId };
    this.wss.to(empresaRoom(empresaId)).emit('open-caja', payload);
    if (rutaId) {
      this.wss.to(rutaRoom(rutaId)).emit('open-caja', payload);
    }
  }

  emitMoraActualizada(payload: MoraActualizadaPayload): void {
    if (!payload.empresa) {
      this.logger.warn(
        `emitMoraActualizada omitido: credito=${payload.creditoId} sin empresa`,
      );
      return;
    }
    this.wss
      .to(empresaRoom(payload.empresa))
      .emit('mora-actualizada', payload);
    if (payload.ruta) {
      this.wss.to(rutaRoom(payload.ruta)).emit('mora-actualizada', payload);
    }
  }

  emitMoraConfigActualizada(payload: MoraConfigActualizadaPayload): void {
    if (!payload.empresa) {
      this.logger.warn('emitMoraConfigActualizada omitido: sin empresa');
      return;
    }
    this.wss
      .to(empresaRoom(payload.empresa))
      .emit('mora-config-actualizada', payload);
  }

  /** Notifica avisos a rooms de admin (o broadcast si es GLOBAL). */
  emitAnnouncement(announcement: {
    id: string;
    scope: string;
    empresaIds?: string[];
    [key: string]: unknown;
  }): void {
    if (!this.wss) return;

    if (announcement.scope === 'GLOBAL') {
      this.wss.emit('announcement:new', announcement);
      return;
    }

    const empresaIds = announcement.empresaIds || [];
    for (const empresaId of empresaIds) {
      if (!empresaId) continue;
      this.wss.to(adminRoom(empresaId)).emit('announcement:new', announcement);
      // Supervisores no están en adminRoom; reciben vía empresaRoom.
      this.wss.to(empresaRoom(empresaId)).emit('announcement:new', announcement);
    }
  }

  emitSubscriptionUpdated(
    empresaId: string,
    payload: {
      isSubscriptionPaid: boolean;
      subscriptionStatus?: string;
      dayOfPay?: number;
    },
  ): void {
    if (!this.wss || !empresaId) return;
    const body = { empresaId, ...payload };
    this.wss.to(adminRoom(empresaId)).emit('subscription:updated', body);
    this.wss.to(empresaRoom(empresaId)).emit('subscription:updated', body);
  }

  private extractRutaId(
    payload: { ruta: string } | Array<{ ruta: string }>,
  ): string | undefined {
    if (Array.isArray(payload)) {
      return payload[0]?.ruta;
    }
    return payload?.ruta;
  }

  private assertAdminClient(client: Socket): SocketUserData | null {
    const data = client.data?.user as SocketUserData | undefined;
    if (!data || !isAdminSocketRole(data.rol)) {
      return null;
    }
    return data;
  }

  private ackFail(error: string): WsCommandAck {
    return { ok: false, error };
  }

  @SubscribeMessage('location:update')
  async handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    raw:
      | { lng?: number; lat?: number; accuracy?: number; at?: string }
      | Array<{ lng?: number; lat?: number; accuracy?: number; at?: string }>,
  ) {
    const data = client.data?.user as SocketUserData | undefined;
    if (!data || data.rol !== 'COBRADOR' || !data.empresaId) {
      this.logger.warn('location:update rechazado: sin sesión cobrador');
      return;
    }

    // Reafirma presencia: tras reinicios/proxy la sesión WS puede vivir
    // mientras el Map en memoria quedó vacío.
    const becameOnline = this.trackingService.registerCobradorOnline(client.id, {
      userId: data.userId,
      empresaId: data.empresaId,
      nombre: data.nombre,
      rutaId: data.rutaId,
    });
    if (becameOnline) {
      this.emitToAdminAndRuta(data.empresaId, data.rutaId, 'cobrador:presence', {
        cobradorId: data.userId,
        nombre: data.nombre,
        rutaId: data.rutaId,
        online: true,
        at: new Date().toISOString(),
      });
    }

    const payload = Array.isArray(raw) ? raw[0] : raw;
    const lng = Number(payload?.lng);
    const lat = Number(payload?.lat);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      this.logger.warn(
        `location:update coords inválidas user=${data.userId} raw=${JSON.stringify(raw)}`,
      );
      return;
    }

    // Timestamp del servidor: evita relojes de dispositivo desfasados / manipulados
    const saved = await this.trackingService.appendLocationIfAllowed({
      cobradorId: data.userId,
      empresaId: data.empresaId,
      rutaId: data.rutaId,
      nombre: data.nombre,
      lng,
      lat,
      accuracy:
        payload?.accuracy != null ? Number(payload.accuracy) : undefined,
      at: new Date(),
    });

    if (!saved) {
      return;
    }

    this.emitToAdminAndRuta(
      data.empresaId,
      saved.rutaId,
      'cobrador:location',
      {
        cobradorId: saved.cobradorId,
        nombre: saved.nombre,
        rutaId: saved.rutaId,
        lng: saved.lng,
        lat: saved.lat,
        at: saved.at.toISOString(),
      },
    );
  }

  @SubscribeMessage('tracking:subscribe')
  async handleTrackingSubscribe(
    @ConnectedSocket() client: Socket,
  ): Promise<WsCommandAck> {
    const data = this.assertAdminClient(client);
    if (!data) {
      this.logger.warn('tracking:subscribe rechazado: sin rol admin');
      return this.ackFail('UNAUTHORIZED');
    }
    if (!data.empresaId) {
      this.logger.warn(
        `tracking:subscribe rechazado: user=${data.userId} sin empresa`,
      );
      return this.ackFail('NO_EMPRESA');
    }
    const scoped = isSupervisorRole(data.rol) ? data.rutaIds : undefined;
    await this.sendTrackingSnapshot(client, data.empresaId, scoped);
    return { ok: true };
  }

  @SubscribeMessage('admin-close-caja')
  async handleCloseRuta(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { ruta: string } | Array<{ ruta: string }>,
  ): Promise<WsCommandAck> {
    return this.runAdminRutaCommand(client, payload, 'close', (ruta) =>
      this.rutaService.closeRuta(ruta),
    );
  }

  @SubscribeMessage('admin-block-caja')
  async handleBlockRuta(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { ruta: string } | Array<{ ruta: string }>,
  ): Promise<WsCommandAck> {
    return this.runAdminRutaCommand(client, payload, 'block', (ruta) =>
      this.rutaService.lockRuta(ruta),
    );
  }

  @SubscribeMessage('admin-unblock-caja')
  async handleUnblockRuta(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { ruta: string } | Array<{ ruta: string }>,
  ): Promise<WsCommandAck> {
    return this.runAdminRutaCommand(client, payload, 'unblock', (ruta) =>
      this.rutaService.unlockRuta(ruta),
    );
  }

  private async runAdminRutaCommand(
    client: Socket,
    payload: { ruta: string } | Array<{ ruta: string }>,
    action: 'close' | 'block' | 'unblock',
    run: (rutaId: string) => Promise<unknown>,
  ): Promise<WsCommandAck> {
    const admin = this.assertAdminClient(client);
    if (!admin) {
      this.logger.warn(`admin-${action}-caja rechazado: sin rol admin`);
      return this.ackFail('UNAUTHORIZED');
    }

    const ruta = this.extractRutaId(payload);
    if (!ruta) {
      this.logger.warn(`admin-${action}-caja rechazado: sin ruta`);
      return this.ackFail('RUTA_REQUIRED');
    }

    if (!(await this.canAccessRuta(admin, ruta))) {
      this.logger.warn(
        `admin-${action}-caja rechazado: user=${admin.userId} ruta=${ruta} ownership`,
      );
      return this.ackFail('FORBIDDEN');
    }

    try {
      await run(ruta);
      return { ok: true };
    } catch (error) {
      this.logger.warn(
        `admin-${action}-caja falló: ${(error as Error).message}`,
      );
      return this.ackFail('ACTION_FAILED');
    }
  }

  /**
   * Verifica ownership de ruta para admin/supervisor/cobrador.
   * SUPERADMIN tiene acceso a todas.
   * Los demás: la ruta debe pertenecer a su empresa y estar en sus rutas asignadas.
   */
  private async canAccessRuta(
    admin: SocketUserData,
    rutaId: string,
  ): Promise<boolean> {
    if (isSuperAdminRole(admin.rol)) return true;

    // Verificar que la ruta pertenece a la empresa del admin
    const [ruta] = await this.rutaService.findLean(
      { _id: rutaId },
      { select: 'empresa' },
    );
    if (!ruta || String(ruta.empresa) !== String(admin.empresaId)) {
      return false;
    }

    // SUPERVISOR / COBRADOR: verificar scope de rutas asignadas
    const scoped = getScopedRutaIds({
      rol: admin.rol,
      ruta: admin.rutaId,
      rutas: admin.rutaIds,
    });
    if (Array.isArray(scoped) && !scoped.includes(rutaId)) {
      return false;
    }

    return true;
  }
}
