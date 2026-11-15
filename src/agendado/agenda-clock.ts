import { Injectable } from '@nestjs/common';

/** Reloj inyectable para que el estado del recordatorio no dependa del reloj del test. */
@Injectable()
export class AgendaClock {
  now(): Date {
    return new Date();
  }
}
