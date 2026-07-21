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

  /**
   * Normaliza un valor de frecuencia de cobro a su forma canónica (minúsculas).
   * @param frecuencia Valor de frecuencia (ej. "DIARIO", "diario", "Diario")
   * @returns El valor normalizado compatible con el enum FrecuenciaCobro
   * @throws BadRequestException si el valor no es reconocido
   */
  private normalizeFrecuenciaCobro(frecuencia: string): FrecuenciaCobro {
    const normalized = frecuencia.toLowerCase();
    if (normalized === 'diario') return FrecuenciaCobro.DIARIO;
    if (normalized === 'semanal') return FrecuenciaCobro.SEMANAL;
    if (normalized === 'mensual') return FrecuenciaCobro.MENSUAL;
    throw new BadRequestException(`Frecuencia de cobro no soportada: ${frecuencia}`);
  }

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
    frecuenciaCobro: string,
    valorCuota: number,
    abonos: number,
    timeZone?: string,
  ): Date {
    // Si no hay cuota válida o no hay abonos, se adeuda desde el inicio
    if (!valorCuota || valorCuota === 0 || abonos === 0) {
      return new Date(fechaInicio);
    }

    const cuotasPagadas = Math.floor(abonos / valorCuota);
    let nextDueDate = new Date(fechaInicio);

    if (
      this.normalizeFrecuenciaCobro(frecuenciaCobro) === FrecuenciaCobro.DIARIO &&
      timeZone
    ) {
      // Para frecuencia diaria, avanzamos saltando domingos
      for (let i = 0; i < cuotasPagadas; i++) {
        do {
          nextDueDate = this.dateFnsAdapter.addDays(nextDueDate, 1);
        } while (this.dateFnsAdapter.isSunday(nextDueDate, timeZone));
      }
    } else {
      for (let i = 0; i < cuotasPagadas; i++) {
        nextDueDate = this.addPeriod(nextDueDate, frecuenciaCobro);
      }
    }

    return nextDueDate;
  }

  /**
   * Calcula la fecha límite de pago final del crédito
   * según la frecuencia, fecha de inicio y número de cuotas.
   */
  getDueDate(
    frecuenciaCobro: string,
    startDate: Date,
    totalCuotas: number,
    timeZone: string,
  ): Date {
    // Cobro diario excluye domingos, requiere lógica especial
    if (this.normalizeFrecuenciaCobro(frecuenciaCobro) === FrecuenciaCobro.DIARIO) {
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
   * - 0 a 3 días → BUENO
   * - 4 a 6 días → REGULAR
   * - 7 o más días → MALO
   */
  classifyClient(daysOverdue: number): ClasificacionCliente {
    if (daysOverdue <= 3) return ClasificacionCliente.BUENO;
    if (daysOverdue < 7) return ClasificacionCliente.REGULAR;
    return ClasificacionCliente.MALO;
  }

  /**
   * Obtiene la fecha de vencimiento de la siguiente cuota
   * a partir de la fecha hasta la cual el crédito está cubierto.
   */
  getNextDueDate(
    paidUntilDate: Date,
    frecuenciaCobro: string,
    timeZone: string,
  ): Date {
    if (this.normalizeFrecuenciaCobro(frecuenciaCobro) === FrecuenciaCobro.DIARIO) {
      let nextDue = this.dateFnsAdapter.addDays(paidUntilDate, 1);
      while (this.dateFnsAdapter.isSunday(nextDue, timeZone)) {
        nextDue = this.dateFnsAdapter.addDays(nextDue, 1);
      }
      return nextDue;
    }

    return this.addPeriod(paidUntilDate, frecuenciaCobro);
  }

  /**
   * Calcula los días de atraso respecto a la siguiente cuota vencida.
   * Por defecto el día de vencimiento cuenta como 0 y hoy no se incluye
   * (el día aún no concluyó). Con `includeToday` (p. ej. tras un no pago)
   * se cuenta también el día actual si la cuota ya venció o vence hoy.
   */
  calculateDaysOverdue(
    paidUntilDate: Date,
    frecuenciaCobro: string,
    today: Date,
    timeZone: string,
    includeToday = false,
  ): number {
    const nextDueDate = this.getNextDueDate(paidUntilDate, frecuenciaCobro, timeZone);

    // Aún no llega el vencimiento
    if (this.dateFnsAdapter.isBefore(today, nextDueDate)) {
      return 0;
    }

    // Día de vencimiento sin no pago: no cuenta atraso todavía
    if (
      this.dateFnsAdapter.isEqual(today, nextDueDate) &&
      !includeToday
    ) {
      return 0;
    }

    // countBusinessDays trata dateLeft como último día cubierto y empieza al día siguiente.
    // Usamos el día previo al vencimiento. Si includeToday, endDate = today+1 para incluir hoy.
    const lastCoveredBeforeDue = this.dateFnsAdapter.addDays(nextDueDate, -1);
    const endDate = includeToday
      ? this.dateFnsAdapter.addDays(today, 1)
      : today;

    const daysOverdue = this.dateFnsAdapter.countBusinessDays(
      lastCoveredBeforeDue,
      endDate,
      timeZone,
    );

    return daysOverdue < 0 ? 0 : daysOverdue;
  }

  // ──────────────────────────────────────────────
  //  Métodos Privados
  // ──────────────────────────────────────────────

  /**
   * Avanza una fecha un período según la frecuencia de cobro.
   * Centraliza la lógica de avance para evitar switches duplicados.
   */
  private addPeriod(date: Date, frecuencia: string): Date {
    const normalized = this.normalizeFrecuenciaCobro(frecuencia);
    switch (normalized) {
      case FrecuenciaCobro.DIARIO:
        return this.dateFnsAdapter.addDays(date, 1);
      case FrecuenciaCobro.SEMANAL:
        return this.dateFnsAdapter.addWeeks(date, 1);
      case FrecuenciaCobro.MENSUAL:
        return this.dateFnsAdapter.addMonths(date, 1);
      default:
        // Este caso no debería ocurrir porque normalizeFrecuenciaCobro ya valida
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

  // ──────────────────────────────────────────────
  //  Mora
  // ──────────────────────────────────────────────

  /**
   * Calcula la mora sugerida según config de empresa y datos del crédito.
   * Si la empresa no cobra mora o el % es 0, retorna 0.
   */
  calcularMoraSugerida(params: {
    cobraMora: boolean;
    porcentajeMora: number;
    baseCalculoMora: string;
    valorCuota: number;
    saldo: number;
    valorCredito: number;
  }): number {
    const {
      cobraMora,
      porcentajeMora,
      baseCalculoMora,
      valorCuota,
      saldo,
      valorCredito,
    } = params;

    if (!cobraMora || !porcentajeMora || porcentajeMora <= 0) {
      return 0;
    }

    let base = 0;
    switch (baseCalculoMora) {
      case 'SALDO':
        base = saldo;
        break;
      case 'VALOR_CREDITO':
        base = valorCredito;
        break;
      case 'VALOR_CUOTA':
      default:
        base = valorCuota;
        break;
    }

    if (base <= 0) return 0;

    return this.roundToTwo(
      new Decimal(base).times(porcentajeMora).div(100).toNumber(),
    );
  }

  /**
   * Máximo de mora que el cobrador puede cobrar según flags de empresa.
   * - Sin cobraMora → 0
   * - Con voluntad → sin tope práctico (Infinity)
   * - Sin voluntad → max(moraAdeudada, moraSugerida)
   */
  maxMoraPermitida(params: {
    cobraMora: boolean;
    permiteMoraVoluntaria: boolean;
    moraAdeudada: number;
    moraSugerida: number;
  }): number {
    if (!params.cobraMora) return 0;
    if (params.permiteMoraVoluntaria) return Number.POSITIVE_INFINITY;
    return this.roundToTwo(
      Math.max(params.moraAdeudada || 0, params.moraSugerida || 0),
    );
  }

  /**
   * Reparte un pago: primero abono al crédito, luego mora.
   * Si `montoMora` viene explícito, se respeta ese desglose.
   * Si no, el resto tras el abono se aplica a mora hasta el máximo permitido.
   */
  repartirPago(params: {
    monto: number;
    montoMora?: number;
    saldo: number;
    moraAdeudada: number;
    maxMoraPermitida: number;
  }): { montoAbono: number; montoMora: number; moraAAplicar: number } {
    const monto = this.roundToTwo(params.monto);
    const saldo = this.roundToTwo(params.saldo);
    const moraAdeudada = this.roundToTwo(params.moraAdeudada || 0);
    const maxMora = Number.isFinite(params.maxMoraPermitida)
      ? this.roundToTwo(params.maxMoraPermitida)
      : params.maxMoraPermitida;

    if (monto < 0) {
      throw new BadRequestException('El monto del pago no puede ser negativo');
    }

    if (params.montoMora !== undefined && params.montoMora !== null) {
      const montoMora = this.roundToTwo(params.montoMora);
      if (montoMora < 0) {
        throw new BadRequestException('El monto de mora no puede ser negativo');
      }
      if (montoMora > monto) {
        throw new BadRequestException(
          `El monto de mora (${montoMora}) no puede superar el monto total del pago (${monto}).`,
        );
      }
      if (montoMora > maxMora + 0.005) {
        throw new BadRequestException(
          `El monto de mora (${montoMora}) excede el máximo permitido (${Number.isFinite(maxMora) ? maxMora : 'voluntaria'}).`,
        );
      }

      const montoAbono = this.roundToTwo(monto - montoMora);
      if (montoAbono > saldo + 0.005) {
        throw new BadRequestException(
          `El abono (${montoAbono}) excede el saldo pendiente del crédito (${saldo}).`,
        );
      }

      const moraAAplicar = this.roundToTwo(Math.max(0, montoMora - moraAdeudada));
      return { montoAbono, montoMora, moraAAplicar };
    }

    // Auto: abono primero, resto a mora
    const montoAbono = this.roundToTwo(Math.min(monto, saldo));
    const resto = this.roundToTwo(monto - montoAbono);
    const montoMora = this.roundToTwo(
      Math.min(resto, Number.isFinite(maxMora) ? maxMora : resto),
    );

    if (resto > montoMora + 0.005) {
      throw new BadRequestException(
        `El monto del pago (${monto}) excede el saldo (${saldo}) más la mora permitida (${Number.isFinite(maxMora) ? maxMora : resto}).`,
      );
    }

    const moraAAplicar = this.roundToTwo(Math.max(0, montoMora - moraAdeudada));
    return { montoAbono, montoMora, moraAAplicar };
  }
}