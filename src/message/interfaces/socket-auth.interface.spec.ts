import {
  isAdminSocketRole,
  isSupervisorRole,
  isSuperAdminRole,
  empresaRoom,
  adminRoom,
  rutaRoom,
} from './socket-auth.interface';

describe('socket-auth.interface', () => {
  it('incluye SUPERVISOR en roles admin de socket', () => {
    expect(isAdminSocketRole('SUPERVISOR')).toBe(true);
    expect(isAdminSocketRole('ADMIN')).toBe(true);
    expect(isAdminSocketRole('COBRADOR')).toBe(false);
  });

  it('detecta SUPERVISOR y SUPERADMIN', () => {
    expect(isSupervisorRole('SUPERVISOR')).toBe(true);
    expect(isSupervisorRole('ADMIN')).toBe(false);
    expect(isSuperAdminRole('SUPERADMIN')).toBe(true);
  });

  it('arma rooms de empresa, admin y ruta', () => {
    expect(empresaRoom('abc')).toBe('empresa:abc');
    expect(adminRoom('abc')).toBe('admin:abc');
    expect(rutaRoom('r1')).toBe('ruta:r1');
  });
});
