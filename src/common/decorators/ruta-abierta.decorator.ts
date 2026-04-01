import { UseInterceptors, applyDecorators } from '@nestjs/common';
import { RutaAbiertaInterceptor } from '../interceptors/ruta-abierta.interceptor';

/**
 * Decorator that applies the RutaAbiertaInterceptor to ensure the user's route is open
 * before allowing the operation to proceed.
 * 
 * This decorator should be used on endpoints that require the user's assigned route
 * to be in an open state (status: true) and not locked (isLocked: false).
 * 
 * @example
 * ```typescript
 * @RutaAbierta()
 * @Post('cobro')
 * async realizarCobro(@Body() dto: CobroDto) {
 *   // This endpoint will only be accessible if the user's route is open
 * }
 * ```
 */
export function RutaAbierta() {
  return applyDecorators(
    UseInterceptors(RutaAbiertaInterceptor)
  );
}