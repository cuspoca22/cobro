import { UseInterceptors, applyDecorators } from '@nestjs/common';
import { RutaAbiertaInterceptor } from '../interceptors/ruta-abierta.interceptor';

/**
 * Aplica RutaAbiertaInterceptor: exige ruta abierta/no bloqueada.
 * FIX [P2]: la validación es liviana (status/isLocked), no calcula cartera.
 */
export function RutaAbierta() {
  return applyDecorators(
    UseInterceptors(RutaAbiertaInterceptor)
  );
}