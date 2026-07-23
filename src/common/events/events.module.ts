import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';

export const SUBSCRIPTION_PAYMENT_DUE = 'subscription.payment_due';
export const SUBSCRIPTION_PAYMENT_CLEARED = 'subscription.payment_cleared';

export type SubscriptionPaymentDuePayload = {
  empresaId: string;
  actorId: string;
  dayOfPay?: number;
  empresaName?: string;
};

export type SubscriptionPaymentClearedPayload = {
  empresaId: string;
};

/**
 * Bus de eventos in-process (sin paquete extra).
 * Sirve para desacoplar Empresa ↔ Announcement sin ciclos Nest.
 */
@Injectable()
export class AppEventBus implements OnModuleDestroy {
  private readonly ee = new EventEmitter();

  constructor() {
    this.ee.setMaxListeners(50);
  }

  emit(event: string, payload: unknown): boolean {
    return this.ee.emit(event, payload);
  }

  on<T = unknown>(event: string, handler: (payload: T) => void): void {
    this.ee.on(event, handler);
  }

  off<T = unknown>(event: string, handler: (payload: T) => void): void {
    this.ee.off(event, handler);
  }

  onModuleDestroy(): void {
    this.ee.removeAllListeners();
  }
}

@Global()
@Module({
  providers: [AppEventBus],
  exports: [AppEventBus],
})
export class EventsModule {}
