import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { RutaOwnershipGuard } from './ruta-ownership.guard';

export const RUTA_OWNERSHIP_KEY = 'ruta_ownership';

export type IdSource = {
  /** body | query | params */
  in: 'body' | 'query' | 'params';
  key: string;
};

/**
 * De dónde resolver la ruta a autorizar.
 * Se puede indicar rutaId directo y/o IDs para lookup (crédito/cliente/movimiento).
 */
export type RutaOwnershipOptions = {
  rutaId?: IdSource;
  creditoId?: IdSource;
  clienteId?: IdSource;
  movimientoId?: IdSource;
};

/**
 * FIX [P0 seguridad / ownership]:
 * Exige que la ruta objetivo pertenezca al ámbito del usuario:
 * - COBRADOR → solo user.ruta
 * - ADMIN / SUPERVISOR → rutas de user.empresa
 * - SUPERADMIN → acceso global
 */
export function RutaOwnership(options: RutaOwnershipOptions) {
  return applyDecorators(
    SetMetadata(RUTA_OWNERSHIP_KEY, options),
    UseGuards(RutaOwnershipGuard),
  );
}
