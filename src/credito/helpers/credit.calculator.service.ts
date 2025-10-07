// credit-calculator.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { dateFnsAdapter } from 'src/common/wrappers/date-fns.adapter';
import { FrecuenciaCobro } from '../interfaces/frecuencia-cobro.enum';
import { ClasificacionCliente } from '../interfaces';

@Injectable()
export class CreditCalculatorService {

  constructor(private dateFnsAdapter: dateFnsAdapter) { }

  // --- Funciones de Cálculo Financiero (las que ya habíamos definido) ---

  /**
   * Calcula el total a pagar y el valor de la cuota dado el capital, interés y número de cuotas.
   */
  calculateFromInterest(valorCredito: number, interes: number, totalCuotas: number) {
    const interesDecimal = interes / 100;
    const totalPagar = valorCredito * (1 + interesDecimal);
    const valorCuota = totalPagar / totalCuotas;
    return {
      totalPagar: parseFloat(totalPagar.toFixed(2)),
      valorCuota: parseFloat(valorCuota.toFixed(2))
    };
  }

  /**
   * Calcula el total a pagar y el interés dado el capital, valor de la cuota y número de cuotas.
   */
  calculateFromCuota(valorCredito: number, valorCuota: number, totalCuotas: number) {
    const totalPagar = valorCuota * totalCuotas;
    const interes = ((totalPagar - valorCredito) / valorCredito) * 100;
    return {
      totalPagar: parseFloat(totalPagar.toFixed(2)),
      interes: parseFloat(interes.toFixed(2))
    };
  }

  // --- Funciones de Cálculo de Fechas (Nuevas o actualizadas para 3 frecuencias) ---

  /**
   * Calcula la fecha hasta la cual un crédito ha sido pagado, basado en los abonos.
   * Adaptado de tu lógica existente.
   */
  calculatePaidUntilDate(
    fechaInicio: Date,
    frecuenciaCobro: FrecuenciaCobro,
    valorCuota: number,
    abonos: number
  ): Date {
    // Si no hay valorCuota o es 0, o no hay abonos, el primer pago adeudado es la fecha de inicio.
    if (!valorCuota || valorCuota === 0 || abonos === 0) {
      return this.dateFnsAdapter.startOfDayUtc(new Date(fechaInicio));
    }

    const cuotasPagadasFloat = abonos / valorCuota;
    const cuotasPagadasEnteras = Math.floor(cuotasPagadasFloat);
  
    // `nextDueDate` será la fecha de inicio del período que está pendiente.
    let nextDueDate = this.dateFnsAdapter.startOfDayUtc(new Date(fechaInicio)); // Usar startOfDayUtc
    for (let i = 0; i < cuotasPagadasEnteras; i++) {
      switch (frecuenciaCobro) {
        case FrecuenciaCobro.DIARIO:
          nextDueDate = this.dateFnsAdapter.addDays(nextDueDate, 1);
          break;
        case FrecuenciaCobro.SEMANAL:
          nextDueDate = this.dateFnsAdapter.addWeeks(nextDueDate, 1);
          break;
        case FrecuenciaCobro.MENSUAL:
          nextDueDate = this.dateFnsAdapter.addMonths(nextDueDate, 1);
          break;
        default:
          throw new BadRequestException(`Frecuencia de cobro desconocida o no soportada: ${frecuenciaCobro}`);
      }
    }
    return nextDueDate; // Esta es la fecha del siguiente pago adeudado
  }


  /**
   * Clasifica el estado del cliente según los días de atraso.
   * Manteniendo tu lógica actual.
   */
  classifyClient(daysOverdue: number): string {
    if (daysOverdue === 0) {
      return ClasificacionCliente.BUENO;
    } else if (daysOverdue >= 1 && daysOverdue <= 7) {
      return ClasificacionCliente.REGULAR;
    } else {
      return ClasificacionCliente.MALO;
    }
  }

  public getDueDate(frecuenciaCobro: FrecuenciaCobro, startDate: Date, numberOfPeriods: number, timeZone: string): Date {
    switch (frecuenciaCobro) {
      case FrecuenciaCobro.DIARIO:
        return this.calculateDailyDueDateFns(startDate, numberOfPeriods, timeZone);
      case FrecuenciaCobro.SEMANAL:
        return this.calculateWeeklyDueDateFns(startDate, numberOfPeriods);
      case FrecuenciaCobro.MENSUAL:
        return this.calculateMonthlyDueDateFns(startDate, numberOfPeriods);
      default:
        throw new BadRequestException(`Frecuencia de cobro desconocida o no soportada: ${frecuenciaCobro}`);
    }
  }

  /**
   * Calcula la fecha límite de pago para créditos diarios usando date-fns.
   * Excluye domingos.
   * @param startDate La fecha de inicio del crédito (objeto Date).
   * @param numberOfDays El número de días hábiles.
   * @returns La fecha límite de pago.
   */
  public calculateDailyDueDateFns(startDate: Date, numberOfDays: number, timeZone: string): Date {
    let dueDate = new Date(startDate); // Clona para no mutar el original
    let daysCounted = 0;

    while (daysCounted < numberOfDays) {
      dueDate = this.dateFnsAdapter.addDays(dueDate, 1); // Añade un día
      if (!this.dateFnsAdapter.isSunday(dueDate, timeZone)) { // Si no es domingo
        daysCounted++;
      }
    }
    return this.dateFnsAdapter.startOfDayUtc(dueDate);
  }

  /**
   * Calcula la fecha límite de pago para créditos semanales usando date-fns.
   * @param startDate La fecha de inicio del crédito (objeto Date).
   * @param numberOfWeeks El número de semanas.
   * @returns La fecha límite de pago.
   */
  public calculateWeeklyDueDateFns(startDate: Date, numberOfWeeks: number): Date {
    return this.dateFnsAdapter.addWeeks(new Date(startDate), numberOfWeeks); // Clona y añade semanas
  }

  public calculateMonthlyDueDateFns(startDate: Date, numberOfMonths: number): Date {
    return this.dateFnsAdapter.addMonths(new Date(startDate), numberOfMonths); // Clona y añade meses
  }
}