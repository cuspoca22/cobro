import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { AgendadoService } from './agendado.service';
import {
  AppEventBus,
  CREDITO_ELIMINADO,
  CreditoEliminadoPayload,
  RENOVACION_CREADA,
  RenovacionCreadaPayload,
} from 'src/common/events/events.module';

/**
 * Cierra o reabre agendados sin entrar en la transacción del dinero.
 * Si el proceso muere entre el commit y este listener, el GET reconcilia.
 */
@Injectable()
export class AgendadoListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgendadoListener.name);

  private readonly onRenovacion = (payload: RenovacionCreadaPayload) => {
    void this.cumplir(payload);
  };

  private readonly onEliminado = (payload: CreditoEliminadoPayload) => {
    void this.reabrir(payload);
  };

  constructor(
    private readonly events: AppEventBus,
    private readonly agendados: AgendadoService,
  ) {}

  onModuleInit(): void {
    this.events.on<RenovacionCreadaPayload>(RENOVACION_CREADA, this.onRenovacion);
    this.events.on<CreditoEliminadoPayload>(CREDITO_ELIMINADO, this.onEliminado);
  }

  onModuleDestroy(): void {
    this.events.off(RENOVACION_CREADA, this.onRenovacion);
    this.events.off(CREDITO_ELIMINADO, this.onEliminado);
  }

  private async cumplir(payload: RenovacionCreadaPayload): Promise<void> {
    try {
      await this.agendados.cumplirPorRenovacion(payload);
    } catch (error) {
      this.logger.error(
        `No se pudo cumplir el agendado del cliente ${payload.clienteId}: ${error?.message ?? error}`,
      );
    }
  }

  private async reabrir(payload: CreditoEliminadoPayload): Promise<void> {
    try {
      await this.agendados.reabrirPorCreditoEliminado(payload);
    } catch (error) {
      this.logger.error(
        `No se pudo reabrir el agendado del crédito ${payload.creditoId}: ${error?.message ?? error}`,
      );
    }
  }
}
