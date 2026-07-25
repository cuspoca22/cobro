import { toRutaId, normalizeId, getScopedRutaIds } from './scoped-ruta-ids';
import { ValidRoles } from 'src/auth/interfaces';

describe('toRutaId', () => {
  it('should return null for null', () => {
    expect(toRutaId(null)).toBeNull();
  });

  it('should return null for undefined', () => {
    expect(toRutaId(undefined)).toBeNull();
  });

  it("should return null for ''", () => {
    expect(toRutaId('')).toBeNull();
  });

  it('should return the same string when a string is passed', () => {
    expect(toRutaId('ruta-123')).toBe('ruta-123');
  });

  it('should return String(_id) when object has _id', () => {
    const doc = { _id: 'abc123' };
    expect(toRutaId(doc)).toBe('abc123');
  });

  it('should return String(id) when object has id but no _id', () => {
    const doc = { id: 'xyz789' };
    expect(toRutaId(doc)).toBe('xyz789');
  });

  it('should prefer _id over id when both are present', () => {
    const doc = { _id: 'preferred', id: 'fallback' };
    expect(toRutaId(doc)).toBe('preferred');
  });

  it('should return String(value) for any other value', () => {
    expect(toRutaId(42)).toBe('42');
    expect(toRutaId(true)).toBe('true');
  });
});

describe('getScopedRutaIds', () => {
  it('should return null for SUPERADMIN', () => {
    const user = { rol: ValidRoles.superAdmin };
    expect(getScopedRutaIds(user)).toBeNull();
  });

  it('should return null for ADMIN', () => {
    const user = { rol: ValidRoles.admin };
    expect(getScopedRutaIds(user)).toBeNull();
  });

  it("should return ['r1','r2'] for SUPERVISOR with rutas=['r1','r2']", () => {
    const user = { rol: ValidRoles.supervisor, rutas: ['r1', 'r2'] };
    expect(getScopedRutaIds(user)).toEqual(['r1', 'r2']);
  });

  it('should return [] for SUPERVISOR with rutas=[]', () => {
    const user = { rol: ValidRoles.supervisor, rutas: [] };
    expect(getScopedRutaIds(user)).toEqual([]);
  });

  it("should return ['r1','r2'] for SUPERVISOR with document objects in rutas", () => {
    const user = {
      rol: ValidRoles.supervisor,
      rutas: [{ _id: 'r1' }, { id: 'r2' }],
    };
    expect(getScopedRutaIds(user)).toEqual(['r1', 'r2']);
  });

  it('should return [] for SUPERVISOR without rutas (undefined)', () => {
    const user = { rol: ValidRoles.supervisor };
    expect(getScopedRutaIds(user)).toEqual([]);
  });

  it("should return ['r1'] for COBRADOR with ruta='r1'", () => {
    const user = { rol: ValidRoles.cobrador, ruta: 'r1' };
    expect(getScopedRutaIds(user)).toEqual(['r1']);
  });

  it("should return ['r1'] for COBRADOR with ruta={_id:'r1'}", () => {
    const user = { rol: ValidRoles.cobrador, ruta: { _id: 'r1' } };
    expect(getScopedRutaIds(user)).toEqual(['r1']);
  });

  it('should return [] for COBRADOR without ruta', () => {
    const user = { rol: ValidRoles.cobrador };
    expect(getScopedRutaIds(user)).toEqual([]);
  });

  it('should return [] for unknown/CLIENTE role', () => {
    const user = { rol: ValidRoles.cliente };
    expect(getScopedRutaIds(user)).toEqual([]);
  });

  it('should return [] when user has undefined rol', () => {
    const user = {};
    expect(getScopedRutaIds(user)).toEqual([]);
  });
});

describe('normalizeId', () => {
  it('should behave the same as toRutaId (null returns null)', () => {
    expect(normalizeId(null)).toBe(toRutaId(null));
  });

  it('should behave the same as toRutaId (object with _id returns string)', () => {
    const doc = { _id: 'test-id' };
    expect(normalizeId(doc)).toBe(toRutaId(doc));
  });
});
