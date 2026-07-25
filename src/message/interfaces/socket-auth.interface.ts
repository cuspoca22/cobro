export type SocketUserData = {
  userId: string;
  rol: string;
  /** Ausente en SUPERADMIN sin empresa asignada. */
  empresaId?: string;
  rutaId?: string;
  /** Rutas asignadas (SUPERVISOR); vacías en otros roles si no aplican. */
  rutaIds?: string[];
  nombre: string;
};

export type WsCommandAck = {
  ok: boolean;
  error?: string;
};

export const ADMIN_SOCKET_ROLES = ['ADMIN', 'SUPERADMIN', 'SUPERVISOR'] as const;

export function isAdminSocketRole(rol: string): boolean {
  return (ADMIN_SOCKET_ROLES as readonly string[]).includes(rol);
}

export function isSuperAdminRole(rol: string): boolean {
  return rol === 'SUPERADMIN';
}

export function isSupervisorRole(rol: string): boolean {
  return rol === 'SUPERVISOR';
}

export function empresaRoom(empresaId: string): string {
  return `empresa:${empresaId}`;
}

export function adminRoom(empresaId: string): string {
  return `admin:${empresaId}`;
}

/** Room por ruta: supervisores solo reciben eventos de sus rutas asignadas. */
export function rutaRoom(rutaId: string): string {
  return `ruta:${rutaId}`;
}

/** Room global para SUPERADMIN (sin empresa). */
export function superAdminRoom(): string {
  return 'admin:super';
}
