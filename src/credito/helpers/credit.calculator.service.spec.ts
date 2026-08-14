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

    it('debe ser 1 el día del primer vencimiento (20/07)', () => {
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
      ).toBe(1);
    });

    it('debe ser 2 el día siguiente al primer vencimiento (21/07)', () => {
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
      ).toBe(2);
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

  describe('calculateDaysOverdue - diario', () => {
    it('con 0 abonos, el día del vencimiento (14/07) debe ser 1', () => {
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
      ).toBe(1);
    });

    it('con 0 abonos, el 15/07 debe tener 2 días de atraso (vencimiento 14/07)', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicio,
        FrecuenciaCobro.DIARIO,
        valorCuota,
        0,
        timeZone,
      );
      const today = new Date('2026-07-15T06:00:00.000Z');

      expect(
        service.calculateDaysOverdue(paidUntil, FrecuenciaCobro.DIARIO, today, timeZone),
      ).toBe(2);
    });

    it('atraso multi-día incluye hoy sin depender de no-pago', () => {
      // Cubierto hasta 11/07 → nextDue salta domingo 12 → 13/07
      // Hoy 16/07 → cuenta 13,14,15,16 = 4
      const paidUntil = new Date('2026-07-11T06:00:00.000Z');
      const today = new Date('2026-07-16T06:00:00.000Z');

      expect(
        service.calculateDaysOverdue(
          paidUntil,
          FrecuenciaCobro.DIARIO,
          today,
          timeZone,
        ),
      ).toBe(4);
    });

    it('pago que deja nextDue mañana → 0', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicio,
        FrecuenciaCobro.DIARIO,
        valorCuota,
        valorCuota, // 1 cuota → paidUntil 14/07
        timeZone,
      );
      const today = new Date('2026-07-14T06:00:00.000Z');

      expect(
        service.calculateDaysOverdue(paidUntil, FrecuenciaCobro.DIARIO, today, timeZone),
      ).toBe(0);
    });
  });

  /**
   * Fixture producción: LUIS LAZO — 13/8/2026
   * Inicio 31/7, diario, cuota 150, 10 abonos → nextDue = hoy → daysOverdue = 1
   * @see docs/adr/001-days-overdue.md
   */
  describe('calculateDaysOverdue - fixture Luis Lazo', () => {
    const fechaInicioLuis = new Date('2026-07-31T06:00:00.000Z');
    const cuotaLuis = 150;
    const abonosLuis = 1500; // 10 cuotas
    const todayLuis = new Date('2026-08-13T06:00:00.000Z');

    const expectedScheduleLabels = [
      '01/08',
      '03/08',
      '04/08',
      '05/08',
      '06/08',
      '07/08',
      '08/08',
      '10/08',
      '11/08',
      '12/08',
      '13/08',
    ];

    function formatDdMm(date: Date): string {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
      }).formatToParts(date);
      const day = parts.find((p) => p.type === 'day')?.value;
      const month = parts.find((p) => p.type === 'month')?.value;
      return `${day}/${month}`;
    }

    it('paidUntil tras 10 cuotas es 12/08 y nextDue es 13/08', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicioLuis,
        FrecuenciaCobro.DIARIO,
        cuotaLuis,
        abonosLuis,
        timeZone,
      );
      const nextDue = service.getNextDueDate(
        paidUntil,
        FrecuenciaCobro.DIARIO,
        timeZone,
      );

      expect(formatDdMm(paidUntil)).toBe('12/08');
      expect(formatDdMm(nextDue)).toBe('13/08');
    });

    it('el 13/08 con 10 pagos y cuota de hoy descubierta → daysOverdue = 1', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicioLuis,
        FrecuenciaCobro.DIARIO,
        cuotaLuis,
        abonosLuis,
        timeZone,
      );

      expect(
        service.calculateDaysOverdue(
          paidUntil,
          FrecuenciaCobro.DIARIO,
          todayLuis,
          timeZone,
        ),
      ).toBe(1);
    });

    it('cronograma de primeras 11 cuotas coincide con tarjeta (omite domingos)', () => {
      const labels: string[] = [];
      let cursor = new Date(fechaInicioLuis);

      for (let i = 0; i < 11; i++) {
        cursor = service.getNextDueDate(cursor, FrecuenciaCobro.DIARIO, timeZone);
        labels.push(formatDdMm(cursor));
      }

      expect(labels).toEqual(expectedScheduleLabels);
    });

    it('con 11 pagos el 13/08 → al día (daysOverdue = 0)', () => {
      const paidUntil = service.calculatePaidUntilDate(
        fechaInicioLuis,
        FrecuenciaCobro.DIARIO,
        cuotaLuis,
        cuotaLuis * 11,
        timeZone,
      );

      expect(formatDdMm(paidUntil)).toBe('13/08');
      expect(
        service.calculateDaysOverdue(
          paidUntil,
          FrecuenciaCobro.DIARIO,
          todayLuis,
          timeZone,
        ),
      ).toBe(0);
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
          daysOverdue: 3,
        }),
      ).toBe(0);
    });

    it('VALOR_CUOTA con 0 días de atraso → 0', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 10,
          baseCalculoMora: 'VALOR_CUOTA',
          valorCuota: 100,
          saldo: 500,
          valorCredito: 1000,
          daysOverdue: 0,
        }),
      ).toBe(0);
    });

    it('VALOR_CUOTA el día de vencimiento con 1 atraso → mora > 0', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 10,
          baseCalculoMora: 'VALOR_CUOTA',
          valorCuota: 150,
          saldo: 1500,
          valorCredito: 2500,
          daysOverdue: 1,
        }),
      ).toBe(15);
    });

    it('VALOR_CUOTA acumula por días de atraso', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 10,
          baseCalculoMora: 'VALOR_CUOTA',
          valorCuota: 100,
          saldo: 500,
          valorCredito: 1000,
          daysOverdue: 1,
        }),
      ).toBe(10);

      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 10,
          baseCalculoMora: 'VALOR_CUOTA',
          valorCuota: 100,
          saldo: 500,
          valorCredito: 1000,
          daysOverdue: 5,
        }),
      ).toBe(50);
    });

    it('calcula sobre saldo sin factor días', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 5,
          baseCalculoMora: 'SALDO',
          valorCuota: 100,
          saldo: 200,
          valorCredito: 1000,
          daysOverdue: 5,
        }),
      ).toBe(10);
    });

    it('calcula sobre valor crédito sin factor días', () => {
      expect(
        service.calcularMoraSugerida({
          cobraMora: true,
          porcentajeMora: 2,
          baseCalculoMora: 'VALOR_CREDITO',
          valorCuota: 100,
          saldo: 500,
          valorCredito: 1000,
          daysOverdue: 5,
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
