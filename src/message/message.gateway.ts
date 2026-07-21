import { forwardRef, Inject } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { MessageService } from './message.service';
import { Socket, Server } from 'socket.io';
import { RutaService } from 'src/ruta/ruta.service';

export type RutaLockStatePayload = {
  ruta: string;
  isLocked: boolean;
};

export type MoraActualizadaTipo = 'APLICAR' | 'PERDONAR';

export type MoraActualizadaPayload = {
  ruta: string;
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

@WebSocketGateway({ cors: true })
export class MessageGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() wss: Server;

  constructor(
    private readonly messageService: MessageService,
    @Inject(forwardRef(() => RutaService))
    private readonly rutaService: RutaService,
  ) {}

  async handleConnection(client: Socket) {}

  handleDisconnect(client: Socket) {}

  /** Normaliza payload objeto o array legacy `[{ ruta }]`. */
  private extractRutaId(
    payload: { ruta: string } | Array<{ ruta: string }>,
  ): string | undefined {
    if (Array.isArray(payload)) {
      return payload[0]?.ruta;
    }
    return payload?.ruta;
  }

  /**
   * Emite al frontend el estado de bloqueo tras persistir en DB.
   * `block-caja` | `unblock-caja`
   */
  emitRutaLockState(payload: RutaLockStatePayload): void {
    const event = payload.isLocked ? 'block-caja' : 'unblock-caja';
    this.wss.emit(event, payload);
  }

  /** Emite cierre de ruta/caja al frontend tras persistir en DB. */
  emitCloseCaja(rutaId: string): void {
    this.wss.emit('close-caja', { ruta: rutaId });
  }

  /** Emite apertura de ruta/caja al frontend tras persistir en DB. */
  emitOpenCaja(rutaId: string): void {
    this.wss.emit('open-caja', { ruta: rutaId });
  }

  /** Emite mora aplicada/perdonada para que el cobrador actualice en vivo. */
  emitMoraActualizada(payload: MoraActualizadaPayload): void {
    this.wss.emit('mora-actualizada', payload);
  }

  /** Emite cambio de config de mora de la empresa (activar/desactivar, %, base). */
  emitMoraConfigActualizada(payload: MoraConfigActualizadaPayload): void {
    this.wss.emit('mora-config-actualizada', payload);
  }

  @SubscribeMessage('admin-close-caja')
  async handleCloseRuta(
    client: Socket,
    payload: { ruta: string } | Array<{ ruta: string }>,
  ) {
    const ruta = this.extractRutaId(payload);
    if (!ruta) return;
    // Persiste cierre + emite close-caja desde RutaService
    await this.rutaService.closeRuta(ruta);
  }

  @SubscribeMessage('admin-block-caja')
  async handleBlockRuta(
    client: Socket,
    payload: { ruta: string } | Array<{ ruta: string }>,
  ) {
    const ruta = this.extractRutaId(payload);
    if (!ruta) return;
    // Persiste isLocked + emite block-caja desde RutaService
    await this.rutaService.lockRuta(ruta);
  }

  @SubscribeMessage('admin-unblock-caja')
  async handleUnblockRuta(
    client: Socket,
    payload: { ruta: string } | Array<{ ruta: string }>,
  ) {
    const ruta = this.extractRutaId(payload);
    if (!ruta) return;
    await this.rutaService.unlockRuta(ruta);
  }
}
