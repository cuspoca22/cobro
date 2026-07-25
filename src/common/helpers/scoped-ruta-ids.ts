import { ValidRoles } from 'src/auth/interfaces';

/**
 * Normaliza cualquier valor (ObjectId, documento populate, string) a string id.
 * Pura: no depende de ningún módulo NestJS.
 */
export function toRutaId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as { _id?: unknown; id?: unknown };
    if (obj._id) return String(obj._id);
    if (obj.id) return String(obj.id);
  }
  return String(value);
}

/** Alias semántico para normalizar IDs de empresa/usuario/cualquier entidad. */
export const normalizeId = toRutaId;

/**
 * Rutas efectivas del usuario para listados agregados.
 * - null = sin restricción de ruta (SUPERADMIN / ADMIN; el caller filtra por empresa).
 * - string[] = ids permitidos (SUPERVISOR / COBRADOR). Vacío = sin acceso.
 *
 * Pura: no depende de ningún módulo NestJS.
 */
export function getScopedRutaIds(user: {
  rol?: string;
  ruta?: unknown;
  rutas?: unknown;
}): string[] | null {
  const rol = user.rol as ValidRoles | undefined;

  if (rol === ValidRoles.superAdmin || rol === ValidRoles.admin) {
    return null;
  }

  if (rol === ValidRoles.supervisor) {
    if (!Array.isArray(user.rutas)) return [];
    return user.rutas
      .map((r) => toRutaId(r))
      .filter((id): id is string => !!id);
  }

  if (rol === ValidRoles.cobrador) {
    const rutaId = toRutaId(user.ruta);
    return rutaId ? [rutaId] : [];
  }

  return [];
}
