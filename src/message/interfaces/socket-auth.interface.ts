export type SocketUserData = {
  userId: string;
  rol: string;
  empresaId: string;
  rutaId?: string;
  nombre: string;
};

export const ADMIN_SOCKET_ROLES = ['ADMIN', 'SUPERADMIN', 'SUPERVISOR'] as const;

export function isAdminSocketRole(rol: string): boolean {
  return (ADMIN_SOCKET_ROLES as readonly string[]).includes(rol);
}

export function empresaRoom(empresaId: string): string {
  return `empresa:${empresaId}`;
}

export function adminRoom(empresaId: string): string {
  return `admin:${empresaId}`;
}
