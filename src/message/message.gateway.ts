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
import { RutaService } from 'src/ruta/ruta.service';
import { TrackingService } from 'src/tracking/tracking.service';
import {
  SocketUserData,
  WsCommandAck,
  adminRoom,
  empresaRoom,
  isAdminSocketRole,
  isSuperAdminRole,
  isSupervisorRole,
  superAdminRoom,
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
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers?.authorization?.replace(
          /^Bearer\s+/i,
          '',
        ) as string | undefined);

      if (!token) {
        this.logger.warn('WS rechazado: sin token');
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token);
      const user = await this.authService.findActiveEntityById(payload.id);

      if (!user) {
        this.logger.warn('WS rechazado: usuario inactivo o inexistente');
        client.disconnect(true);
        return;
      }

      const isSuperAdmin = isSuperAdminRole(user.rol);
      if (!user.empresa && !isSuperAdmin) {
        this.logger.warn(
          `WS rechazado: usuario ${user.id} (${user.rol}) sin empresa`,
        );
        client.disconnect(true);
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

      if (isSuperAdmin) {
        await client.join(superAdminRoom());
      }

      if (empresaId) {
        await client.join(empresaRoom(empresaId));
        if (isAdminSocketRole(user.rol)) {
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
        this.wss.to(adminRoom(empresaId)).emit('cobrador:presence', {
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
          this.wss.to(adminRoom(empresaId)).emit('cobrador:location', {
            cobradorId: data.userId,
            nombre: data.nombre,
            rutaId: data.rutaId ?? ultima.rutaId,
            lng: ultima.lng,
            lat: ultima.lat,
            at: new Date(ultima.at).toISOString(),
          });
        }
      }
    } catch (error) {
      this.logger.warn(`WS auth fallida: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const data = client.data?.user as SocketUserData | undefined;
    if (!data || data.rol !== 'COBRADOR' || !data.empresaId) return;

    const wentOffline = this.trackingService.unregisterCobradorSocket(
      data.userId,
      client.id,
    );
    if (!wentOffline) return;

    this.wss.to(adminRoom(String(data.empresaId))).emit('cobrador:presence', {
      cobradorId: data.userId,
      nombre: data.nombre,
      rutaId: data.rutaId,
      online: false,
      at: new Date().toISOString(),
    });
  }

  private async sendTrackingSnapshot(client: Socket, empresaId: string) {
    const onlineIds = this.trackingService.getOnlineCobradorIds(empresaId);
    const cobradores = await this.trackingService.getEmpresaHoy(
      empresaId,
      onlineIds,
    );
    client.emit('tracking:snapshot', { empresaId, cobradores });
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
  }

  emitCloseCaja(rutaId: string, empresaId: string): void {
    if (!empresaId) {
      this.logger.warn(`emitCloseCaja omitido: ruta=${rutaId} sin empresa`);
      return;
    }
    this.wss.to(empresaRoom(empresaId)).emit('close-caja', { ruta: rutaId });
  }

  emitOpenCaja(rutaId: string, empresaId: string): void {
    if (!empresaId) {
      this.logger.warn(`emitOpenCaja omitido: ruta=${rutaId} sin empresa`);
      return;
    }
    this.wss.to(empresaRoom(empresaId)).emit('open-caja', { ruta: rutaId });
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
    this.wss.to(adminRoom(empresaId)).emit('subscription:updated', {
      empresaId,
      ...payload,
    });
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
      this.wss.to(adminRoom(data.empresaId)).emit('cobrador:presence', {
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

    this.wss.to(adminRoom(data.empresaId)).emit('cobrador:location', {
      cobradorId: saved.cobradorId,
      nombre: saved.nombre,
      rutaId: saved.rutaId,
      lng: saved.lng,
      lat: saved.lat,
      at: saved.at.toISOString(),
    });
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
    await this.sendTrackingSnapshot(client, data.empresaId);
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

    if (!(await this.rutaBelongsToEmpresa(ruta, admin))) {
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
   * SUPERADMIN: cualquier ruta.
   * ADMIN: misma empresa.
   * SUPERVISOR: misma empresa + ruta en user.rutas.
   */
  private async rutaBelongsToEmpresa(
    rutaId: string,
    admin: SocketUserData,
  ): Promise<boolean> {
    if (isSuperAdminRole(admin.rol)) return true;
    if (!admin.empresaId) return false;

    const info = await this.rutaService.getEmpresaIdByRutaId(rutaId);
    if (!info.exists || info.empresaId !== admin.empresaId) {
      return false;
    }

    if (isSupervisorRole(admin.rol)) {
      const assigned = admin.rutaIds ?? [];
      return assigned.includes(rutaId);
    }

    return true;
  }
}
