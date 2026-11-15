import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgendadoService } from './agendado.service';

@Injectable()
export class AgendadoPushCron {
  constructor(private readonly agendados: AgendadoService) {}

  /** Apagado mientras PUSH_ENABLED no sea "true". */
  @Cron('0 * * * * *')
  async despachar(): Promise<void> {
    if (process.env.PUSH_ENABLED !== 'true') return;
    await this.agendados.despacharPushPendientes();
  }
}
