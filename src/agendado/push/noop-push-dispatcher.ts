import { Injectable, Logger } from '@nestjs/common';
import { PushDispatcher, PushDispatchResult, PushIntent } from './push-dispatcher';

@Injectable()
export class NoopPushDispatcher implements PushDispatcher {
  private readonly logger = new Logger(NoopPushDispatcher.name);
  private warned = false;

  async dispatch(_intent: PushIntent): Promise<PushDispatchResult> {
    if (!this.warned) {
      this.warned = true;
      this.logger.warn('PushDispatcher sin Firebase; el recordatorio sigue programado');
    }
    return { delivered: false, reason: 'not_configured' };
  }
}
