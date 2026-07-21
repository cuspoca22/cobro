import { Test, TestingModule } from '@nestjs/testing';
import { CreditCalculatorService } from './credit.calculator.service';
import { DateFnsAdapter } from 'src/common/wrappers/date-fns.adapter';
import { CurrencyService } from 'src/currency/currency.service';
import { FrecuenciaCobro } from '../interfaces/frecuencia-cobro.enum';

describe('CreditCalculatorService', () => {
  let service: CreditCalculatorService;
  let dateFnsAdapter: DateFnsAdapter;

  const timeZone = 'America/Guatemala';
  const fechaInicio = new Date('2026-07-13T06:00:00.000Z'); // 13/07/2026 inicio del día en Guatemala
  const valorCuota = 100;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditCalculatorService,
        DateFnsAdapter,
        { provide: CurrencyService, useValue: { round: (v: number) => v } },
      ],
    }).compile();

    service = module.get(CreditCalculatorService);
    dateFnsAdapter = module.get(DateFnsAdapter);
  });

  describe('calculateDaysOverdue - semanal', () => {
    it('debe ser 0 antes del primer vencimiento (16/07 con inicio 13/07)', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicio,
        FrecuenciaCobro.SEMANAL,
        valorCuota,
        0,
        timeZone,
      );
      const today = new Date('2026-07-16T06:00:00.000Z');

      expect(
        service.calculateDaysOverdue(paidUntil, FrecuenciaCobro.SEMANAL, today, timeZone),
      ).toBe(0);
    });

    it('debe ser 0 el día del primer vencimiento (20/07)', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicio,
        FrecuenciaCobro.SEMANAL,
        valorCuota,
        0,
        timeZone,
      );
      const today = new Date('2026-07-20T06:00:00.000Z');

      expect(
        service.calculateDaysOverdue(paidUntil, FrecuenciaCobro.SEMANAL, today, timeZone),
      ).toBe(0);
    });

    it('debe ser 1 el día siguiente al primer vencimiento (21/07)', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicio,
        FrecuenciaCobro.SEMANAL,
        valorCuota,
        0,
        timeZone,
      );
      const today = new Date('2026-07-21T06:00:00.000Z');

      expect(
        service.calculateDaysOverdue(paidUntil, FrecuenciaCobro.SEMANAL, today, timeZone),
      ).toBe(1);
    });

    it('con 1 cuota pagada, el 21/07 aún no tiene atraso (siguiente vencimiento 27/07)', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicio,
        FrecuenciaCobro.SEMANAL,
        valorCuota,
        valorCuota,
        timeZone,
      );
      const today = new Date('2026-07-21T06:00:00.000Z');

      expect(paidUntil.toISOString()).toBe(
        dateFnsAdapter.addWeeks(fechaInicio, 1).toISOString(),
      );
      expect(
        service.calculateDaysOverdue(paidUntil, FrecuenciaCobro.SEMANAL, today, timeZone),
      ).toBe(0);
    });
  });

  describe('calculateDaysOverdue - diario (regresión)', () => {
    it('con 0 abonos, el 15/07 debe tener 1 día de atraso (vencimiento 14/07)', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicio,
        FrecuenciaCobro.DIARIO,
        valorCuota,
        0,
        timeZone,
      );
      const today = new Date('2026-07-15T06:00:00.000Z');

      // Semántica previa: countBusinessDays(fechaInicio, 15/07) = 1 (cuenta el 14)
      expect(
        dateFnsAdapter.countBusinessDays(paidUntil, today, timeZone),
      ).toBe(1);
      expect(
        service.calculateDaysOverdue(paidUntil, FrecuenciaCobro.DIARIO, today, timeZone),
      ).toBe(1);
    });

    it('con 0 abonos, el día del vencimiento (14/07) debe ser 0', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicio,
        FrecuenciaCobro.DIARIO,
        valorCuota,
        0,
        timeZone,
      );
      const today = new Date('2026-07-14T06:00:00.000Z');

      expect(
        service.calculateDaysOverdue(paidUntil, FrecuenciaCobro.DIARIO, today, timeZone),
      ).toBe(0);
    });
  });

  describe('calculateDaysOverdue - diario con includeToday (no pago)', () => {
    // Cubierto hasta 11/07 → nextDue salta domingo 12 → 13/07
    // Sin includeToday: cuenta 13,14,15 = 3; con includeToday: +16 = 4
    const paidUntil = new Date('2026-07-11T06:00:00.000Z');
    const today = new Date('2026-07-16T06:00:00.000Z');

    it('sin no pago: 3 días de atraso (excluye hoy)', () => {
      expect(
        service.calculateDaysOverdue(
          paidUntil,
          FrecuenciaCobro.DIARIO,
          today,
          timeZone,
          false,
        ),
      ).toBe(3);
    });

    it('con no pago: 4 días de atraso (incluye hoy)', () => {
      expect(
        service.calculateDaysOverdue(
          paidUntil,
          FrecuenciaCobro.DIARIO,
          today,
          timeZone,
          true,
        ),
      ).toBe(4);
    });

    it('día de vencimiento sin no pago: 0', () => {
      const dueToday = new Date('2026-07-14T06:00:00.000Z');
      expect(
        service.calculateDaysOverdue(
          fechaInicio,
          FrecuenciaCobro.DIARIO,
          dueToday,
          timeZone,
          false,
        ),
      ).toBe(0);
    });

    it('día de vencimiento con no pago: 1', () => {
      const dueToday = new Date('2026-07-14T06:00:00.000Z');
      expect(
        service.calculateDaysOverdue(
          fechaInicio,
          FrecuenciaCobro.DIARIO,
          dueToday,
          timeZone,
          true,
        ),
      ).toBe(1);
    });
  });

  describe('getNextDueDate', () => {
    it('semanal avanza una semana desde paidUntil', () => {
      const nextDue = service.getNextDueDate(
        fechaInicio,
        FrecuenciaCobro.SEMANAL,
        timeZone,
      );
      expect(nextDue.toISOString()).toBe(
        dateFnsAdapter.addWeeks(fechaInicio, 1).toISOString(),
      );
    });

    it('diario avanza un día hábil desde paidUntil', () => {
      const nextDue = service.getNextDueDate(
        fechaInicio,
        FrecuenciaCobro.DIARIO,
        timeZone,
      );
      expect(nextDue.toISOString()).toBe(
        dateFnsAdapter.addDays(fechaInicio, 1).toISOString(),
      );
    });
  });

  describe('classifyClient', () => {
    it('0 a 3 días → BUENO', () => {
      expect(service.classifyClient(0)).toBe('BUENO');
      expect(service.classifyClient(3)).toBe('BUENO');
    });

    it('4 a 6 días → REGULAR', () => {
      expect(service.classifyClient(4)).toBe('REGULAR');
      expect(service.classifyClient(6)).toBe('REGULAR');
    });

    it('7 o más días → MALO', () => {
      expect(service.classifyClient(7)).toBe('MALO');
      expect(service.classifyClient(8)).toBe('MALO');
    });
  });

  describe('calcularMoraSugerida', () => {
    it('retorna 0 si la empresa no cobra mora', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: false,
          porcentajeMora: 10,
          baseCalculoMora: 'VALOR_CUOTA',
          valorCuota: 100,
          saldo: 500,
          valorCredito: 1000,
        }),
      ).toBe(0);
    });

    it('calcula sobre valor cuota', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 10,
          baseCalculoMora: 'VALOR_CUOTA',
          valorCuota: 100,
          saldo: 500,
          valorCredito: 1000,
        }),
      ).toBe(10);
    });

    it('calcula sobre saldo', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 5,
          baseCalculoMora: 'SALDO',
          valorCuota: 100,
          saldo: 200,
          valorCredito: 1000,
        }),
      ).toBe(10);
    });

    it('calcula sobre valor crédito', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 2,
          baseCalculoMora: 'VALOR_CREDITO',
          valorCuota: 100,
          saldo: 500,
          valorCredito: 1000,
        }),
      ).toBe(20);
    });
  });

  describe('repartirPago (abono primero)', () => {
    it('con montoMora explícito reparte abono y mora', () => {
      expect(
        service.repartirPago({
          monto: 120,
          montoMora: 20,
          saldo: 100,
          moraAdeudada: 20,
          maxMoraPermitida: 50,
        }),
      ).toEqual({ montoAbono: 100, montoMora: 20, moraAAplicar: 0 });
    });

    it('auto: abono primero y resto a mora', () => {
      expect(
        service.repartirPago({
          monto: 120,
          saldo: 100,
          moraAdeudada: 50,
          maxMoraPermitida: 50,
        }),
      ).toEqual({ montoAbono: 100, montoMora: 20, moraAAplicar: 0 });
    });

    it('aplica mora extra si se cobra más de la adeudada', () => {
      expect(
        service.repartirPago({
          monto: 110,
          montoMora: 10,
          saldo: 100,
          moraAdeudada: 0,
          maxMoraPermitida: 20,
        }),
      ).toEqual({ montoAbono: 100, montoMora: 10, moraAAplicar: 10 });
    });

    it('rechaza si abono excede saldo', () => {
      expect(() =>
        service.repartirPago({
          monto: 150,
          montoMora: 10,
          saldo: 100,
          moraAdeudada: 0,
          maxMoraPermitida: 50,
        }),
      ).toThrow(/excede el saldo/);
    });

    it('rechaza si montoMora excede maxMoraPermitida', () => {
      expect(() =>
        service.repartirPago({
          monto: 120,
          montoMora: 60,
          saldo: 100,
          moraAdeudada: 0,
          maxMoraPermitida: 50,
        }),
      ).toThrow(/excede el máximo permitido/);
    });

    it('rechaza si montoMora supera monto total', () => {
      expect(() =>
        service.repartirPago({
          monto: 100,
          montoMora: 110,
          saldo: 100,
          moraAdeudada: 0,
          maxMoraPermitida: 50,
        }),
      ).toThrow(/no puede superar el monto total/);
    });

    it('rechaza montos negativos', () => {
      expect(() =>
        service.repartirPago({
          monto: -10,
          saldo: 100,
          moraAdeudada: 0,
          maxMoraPermitida: 50,
        }),
      ).toThrow(/no puede ser negativo/);

      expect(() =>
        service.repartirPago({
          monto: 100,
          montoMora: -5,
          saldo: 100,
          moraAdeudada: 0,
          maxMoraPermitida: 50,
        }),
      ).toThrow(/no puede ser negativo/);
    });

    it('rechaza en modo auto si monto excede saldo + mora permitida', () => {
      expect(() =>
        service.repartirPago({
          monto: 200,
          saldo: 100,
          moraAdeudada: 0,
          maxMoraPermitida: 50,
        }),
      ).toThrow(/excede el saldo.*mora permitida/);
    });
  });

  describe('maxMoraPermitida', () => {
    it('0 si no cobra mora', () => {
      expect(
        service.maxMoraPermitida({
          cobraMora: false,
          permiteMoraVoluntaria: true,
          moraAdeudada: 10,
          moraSugerida: 5,
        }),
      ).toBe(0);
    });

    it('Infinity si permite voluntad', () => {
      expect(
        service.maxMoraPermitida({
          cobraMora: true,
          permiteMoraVoluntaria: true,
          moraAdeudada: 10,
          moraSugerida: 5,
        }),
      ).toBe(Number.POSITIVE_INFINITY);
    });

    it('max entre adeudada y sugerida sin voluntad', () => {
      expect(
        service.maxMoraPermitida({
          cobraMora: true,
          permiteMoraVoluntaria: false,
          moraAdeudada: 10,
          moraSugerida: 15,
        }),
      ).toBe(15);
    });
  });
});
