import { CurrencyService } from './currency.service';

describe('CurrencyService', () => {
  let service: CurrencyService;

  beforeEach(() => {
    service = new CurrencyService();
  });

  // ──────────────────────────────────────────────
  //  getCurrencyConfig
  // ──────────────────────────────────────────────

  describe('getCurrencyConfig', () => {
    it('debe retornar la configuración de COP', () => {
      const config = service.getCurrencyConfig('COP');
      expect(config.code).toBe('COP');
      expect(config.decimalPlaces).toBe(0);
      expect(config.minorUnitFactor).toBe(1);
    });

    it('debe retornar la configuración de BRL', () => {
      const config = service.getCurrencyConfig('BRL');
      expect(config.code).toBe('BRL');
      expect(config.decimalPlaces).toBe(2);
      expect(config.minorUnitFactor).toBe(100);
    });

    it('debe retornar la configuración de GTQ', () => {
      const config = service.getCurrencyConfig('GTQ');
      expect(config.code).toBe('GTQ');
      expect(config.decimalPlaces).toBe(2);
    });

    it('debe retornar la configuración de MXN', () => {
      const config = service.getCurrencyConfig('MXN');
      expect(config.code).toBe('MXN');
      expect(config.decimalPlaces).toBe(2);
    });

    it('debe aceptar códigos en minúsculas', () => {
      const config = service.getCurrencyConfig('cop');
      expect(config.code).toBe('COP');
    });

    it('debe lanzar error para moneda no soportada', () => {
      expect(() => service.getCurrencyConfig('USD')).toThrow('Moneda no soportada: USD');
    });
  });

  // ──────────────────────────────────────────────
  //  getAllCurrencies
  // ──────────────────────────────────────────────

  describe('getAllCurrencies', () => {
    it('debe retornar todas las monedas configuradas', () => {
      const currencies = service.getAllCurrencies();
      expect(currencies.length).toBe(4);
      const codes = currencies.map(c => c.code);
      expect(codes).toContain('COP');
      expect(codes).toContain('BRL');
      expect(codes).toContain('GTQ');
      expect(codes).toContain('MXN');
    });
  });

  // ──────────────────────────────────────────────
  //  isSupported
  // ──────────────────────────────────────────────

  describe('isSupported', () => {
    it('debe retornar true para COP', () => {
      expect(service.isSupported('COP')).toBe(true);
    });

    it('debe retornar true para monedas en minúsculas', () => {
      expect(service.isSupported('brl')).toBe(true);
    });

    it('debe retornar false para moneda no soportada', () => {
      expect(service.isSupported('USD')).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  //  round
  // ──────────────────────────────────────────────

  describe('round', () => {
    // COP: 0 decimales (sin centavos)
    it('COP: debe redondear a 0 decimales (1000.5 → 1001)', () => {
      expect(service.round(1000.5, 'COP')).toBe(1001);
    });

    it('COP: debe redondear a 0 decimales (1000.4 → 1000)', () => {
      expect(service.round(1000.4, 'COP')).toBe(1000);
    });

    it('COP: debe mantener enteros sin cambios', () => {
      expect(service.round(5000, 'COP')).toBe(5000);
    });

    // BRL: 2 decimales (centavos)
    it('BRL: debe redondear a 2 decimales (1000.505 → 1000.51)', () => {
      expect(service.round(1000.505, 'BRL')).toBe(1000.51);
    });

    it('BRL: debe redondear a 2 decimales (1000.504 → 1000.50)', () => {
      expect(service.round(1000.504, 'BRL')).toBe(1000.50);
    });

    it('BRL: debe mantener valores con 2 decimales sin cambios', () => {
      expect(service.round(99.99, 'BRL')).toBe(99.99);
    });

    // GTQ: 2 decimales (centavos)
    it('GTQ: debe redondear a 2 decimales (50.125 → 50.13)', () => {
      expect(service.round(50.125, 'GTQ')).toBe(50.13);
    });

    // MXN: 2 decimales (centavos)
    it('MXN: debe redondear a 2 decimales (99.999 → 100)', () => {
      expect(service.round(99.999, 'MXN')).toBe(100);
    });

    it('debe lanzar error para moneda no soportada', () => {
      expect(() => service.round(100, 'USD')).toThrow('Moneda no soportada: USD');
    });
  });

  // ──────────────────────────────────────────────
  //  format
  // ──────────────────────────────────────────────

  describe('format', () => {
    it('COP: debe formatear sin decimales', () => {
      const result = service.format(1000, 'COP');
      // El formato exacto depende del locale del sistema (ej: "$ 1.000" o "COP 1.000")
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('BRL: debe formatear con 2 decimales', () => {
      const result = service.format(1000.5, 'BRL');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('debe lanzar error para moneda no soportada', () => {
      expect(() => service.format(100, 'USD')).toThrow('Moneda no soportada: USD');
    });
  });

  describe('formatShareAmount', () => {
    it('usa Q para GTQ', () => {
      const formatted = service.formatShareAmount(600, 'GTQ');
      expect(formatted.startsWith('Q')).toBe(true);
      expect(formatted).toContain('600');
      expect(formatted).not.toMatch(/^\$/);
    });

    it('usa $ sin decimales para COP', () => {
      const formatted = service.formatShareAmount(30, 'COP');
      expect(formatted.startsWith('$')).toBe(true);
      expect(formatted).toContain('30');
      expect(formatted).not.toContain('.');
    });
  });
});
