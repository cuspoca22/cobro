import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { AnnouncementService } from './announcement.service';
import {
  AppEventBus,
  SUBSCRIPTION_PAYMENT_CLEARED,
  SUBSCRIPTION_PAYMENT_DUE,
  SubscriptionPaymentClearedPayload,
  SubscriptionPaymentDuePayload,
} from 'src/common/events/events.module';

/**
 * Escucha eventos de suscripción y crea/limpia avisos.
 * Desacoplado de EmpresaModule (sin import circular).
 */
@Injectable()
export class AnnouncementSubscriptionListener
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AnnouncementSubscriptionListener.name);

  private readonly onDue = (payload: SubscriptionPaymentDuePayload) => {
    void this.handleDue(payload);
  };

  private readonly onCleared = (payload: SubscriptionPaymentClearedPayload) => {
    void this.handleCleared(payload);
  };

  constructor(
    private readonly events: AppEventBus,
    private readonly announcements: AnnouncementService,
  ) {}

  onModuleInit(): void {
    this.events.on<SubscriptionPaymentDuePayload>(
      SUBSCRIPTION_PAYMENT_DUE,
      this.onDue,
    );
    this.events.on<SubscriptionPaymentClearedPayload>(
      SUBSCRIPTION_PAYMENT_CLEARED,
      this.onCleared,
    );
  }

  onModuleDestroy(): void {
    this.events.off(SUBSCRIPTION_PAYMENT_DUE, this.onDue);
    this.events.off(SUBSCRIPTION_PAYMENT_CLEARED, this.onCleared);
  }

  private async handleDue(payload: SubscriptionPaymentDuePayload): Promise<void> {
    try {
      await this.announcements.notifyPaymentDue(
        payload.empresaId,
        payload.actorId,
        {
          dayOfPay: payload.dayOfPay,
          empresaName: payload.empresaName,
        },
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo crear aviso de pago (${payload.empresaId}): ${(error as Error).message}`,
      );
    }
  }

  private async handleCleared(
    payload: SubscriptionPaymentClearedPayload,
  ): Promise<void> {
    try {
      await this.announcements.clearPaymentDue(payload.empresaId);
    } catch (error) {
      this.logger.warn(
        `No se pudieron limpiar avisos de pago (${payload.empresaId}): ${(error as Error).message}`,
      );
    }
  }
}
