import { BadRequestException, Injectable } from '@nestjs/common';
import { DateFnsAdapter } from 'src/common/wrappers/date-fns.adapter';
import { CurrencyService } from 'src/currency/currency.service';
import Decimal from 'decimal.js';
import { FrecuenciaCobro } from '../interfaces/frecuencia-cobro.enum';
import { ClasificacionCliente } from '../interfaces';

/** Resultado del cálculo financiero cuando se parte del interés */
export interface ResultadoCalculoInteres {
  totalPagar: number;
  valorCuota: number;
}

/** Resultado del cálculo financiero cuando se parte del valor de cuota */
export interface ResultadoCalculoCuota {
  totalPagar: number;
  interes: number;
}

@Injectable()
export class CreditCalculatorService {

  constructor(
    private readonly dateFnsAdapter: DateFnsAdapter,
    private readonly currencyService: CurrencyService,
  ) { }

  // ──────────────────────────────────────────────
  //  Cálculos Financieros
  // ──────────────────────────────────────────────

  /**
   * Calcula el total a pagar y el valor de la cuota
   * dado el capital, porcentaje de interés y número de cuotas.
   */
  calculateFromInterest(
    valorCredito: number,
    interes: number,
    totalCuotas: number,
    currencyCode: string,
  ): ResultadoCalculoInteres {
    const interesDecimal = new Decimal(interes).div(100);
    const totalPagar = new Decimal(valorCredito).times(new Decimal(1).plus(interesDecimal));
    const valorCuota = totalPagar.div(totalCuotas);

    return {
      totalPagar: this.currencyService.round(totalPagar.toNumber(), currencyCode),
      valorCuota: this.currencyService.round(valorCuota.toNumber(), currencyCode),
    };
  }

  /**
   * Calcula el total a pagar y el interés implícito
   * dado el capital, valor de cuota y número de cuotas.
   */
  calculateFromCuota(
    valorCredito: number,
    valorCuota: number,
    totalCuotas: number,
    currencyCode: string,
  ): ResultadoCalculoCuota {
    const totalPagar = new Decimal(valorCuota).times(totalCuotas);
    const interes = totalPagar.minus(valorCredito).div(valorCredito).times(100);

    return {
      totalPagar: this.currencyService.round(totalPagar.toNumber(), currencyCode),
      interes: this.roundToTwo(interes.toNumber()),
    };
  }

  // ──────────────────────────────────────────────
  //  Cálculos de Fechas
  // ──────────────────────────────────────────────

  /**
   * Calcula la fecha hasta la cual el crédito ha sido cubierto,
   * avanzando períodos según las cuotas pagadas con los abonos acumulados.
   */
  calculatePaidUntilDate(
    fechaInicio: Date,
    frecuenciaCobro: FrecuenciaCobro,
    valorCuota: number,
    abonos: number,
  ): Date {
    // Si no hay cuota válida o no hay abonos, se adeuda desde el inicio
    if (!valorCuota || valorCuota === 0 || abonos === 0) {
      return new Date(fechaInicio);
    }

    const cuotasPagadas = Math.floor(abonos / valorCuota);
    let nextDueDate = new Date(fechaInicio);

    for (let i = 0; i < cuotasPagadas; i++) {
      nextDueDate = this.addPeriod(nextDueDate, frecuenciaCobro);
    }

    return nextDueDate;
  }

  /**
   * Calcula la fecha límite de pago final del crédito
   * según la frecuencia, fecha de inicio y número de cuotas.
   */
  getDueDate(
    frecuenciaCobro: FrecuenciaCobro,
    startDate: Date,
    totalCuotas: number,
    timeZone: string,
  ): Date {
    // Cobro diario excluye domingos, requiere lógica especial
    if (frecuenciaCobro === FrecuenciaCobro.DIARIO) {
      return this.calcularDueDateDiario(startDate, totalCuotas, timeZone);
    }

    // Semanal y mensual: avanzar N períodos directamente
    let dueDate = new Date(startDate);
    for (let i = 0; i < totalCuotas; i++) {
      dueDate = this.addPeriod(dueDate, frecuenciaCobro);
    }
    return dueDate;
  }

  /**
   * Clasifica al cliente según sus días de atraso.
   * - 0 días → BUENO
   * - 1 a 7 días → REGULAR
   * - Más de 7 días → MALO
   */
  classifyClient(daysOverdue: number): ClasificacionCliente {
    if (daysOverdue === 0) return ClasificacionCliente.BUENO;
    if (daysOverdue <= 7) return ClasificacionCliente.REGULAR;
    return ClasificacionCliente.MALO;
  }

  // ──────────────────────────────────────────────
  //  Métodos Privados
  // ──────────────────────────────────────────────

  /**
   * Avanza una fecha un período según la frecuencia de cobro.
   * Centraliza la lógica de avance para evitar switches duplicados.
   */
  private addPeriod(date: Date, frecuencia: FrecuenciaCobro): Date {
    switch (frecuencia) {
      case FrecuenciaCobro.DIARIO:
        return this.dateFnsAdapter.addDays(date, 1);
      case FrecuenciaCobro.SEMANAL:
        return this.dateFnsAdapter.addWeeks(date, 1);
      case FrecuenciaCobro.MENSUAL:
        return this.dateFnsAdapter.addMonths(date, 1);
      default:
        throw new BadRequestException(
          `Frecuencia de cobro no soportada: ${frecuencia}`,
        );
    }
  }

  /**
   * Calcula la fecha límite para créditos diarios excluyendo domingos.
   * Avanza día a día y solo cuenta días hábiles (lunes a sábado).
   */
  private calcularDueDateDiario(
    startDate: Date,
    totalDias: number,
    timeZone: string,
  ): Date {
    let dueDate = new Date(startDate);
    let diasContados = 0;

    while (diasContados < totalDias) {
      dueDate = this.dateFnsAdapter.addDays(dueDate, 1);
      if (!this.dateFnsAdapter.isSunday(dueDate, timeZone)) {
        diasContados++;
      }
    }

    return this.dateFnsAdapter.startOfDayUtc(dueDate);
  }

  /** Redondea un número a dos decimales */
  private roundToTwo(value: number): number {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }
}