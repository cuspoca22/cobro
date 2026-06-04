import { Injectable } from '@nestjs/common';
import {
  startOfDay,
  addDays,
  differenceInDays,
  addWeeks,
  addMonths,
  isBefore,
  isSunday,
  endOfDay,
  isEqual,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

@Injectable()
export class DateFnsAdapter {
  /**
   * Convierte un Date objeto (que internamente es UTC) a su representación lógica
   * en la zona horaria especificada.
   * Útil para adaptar una fecha UTC para operaciones (como startOfDay)
   * o para mostrarla en un formato local.
   */
  public convertUtcToZonedTime(date: Date, timeZone: string): Date {
    return toZonedTime(date, timeZone);
  }

  /**
   * Convierte un Date objeto que representa un instante en una zona horaria específica
   * a su equivalente UTC.
   * Útil para tomar una fecha local (ej. de un formulario) y guardarla correctamente en UTC en la DB.
   * @param date Una Date objeto que se asume que representa un tiempo en `timeZone`
   * @param timeZone La zona horaria IANA que `date` pretende representar
   * @returns Un Date objeto que es el equivalente UTC de `date` en `timeZone`.
   */
  public convertZonedTimeToUtc(date: Date, timeZone: string): Date {
    // fromZonedTime toma un Date y la TZ en la que fue concebida, y la convierte
    // a una Date con su equivalente UTC.
    return fromZonedTime(date, timeZone);
  }

  /**
   * Calcula el inicio del "día de hoy" en la zona horaria especificada y devuelve su equivalente UTC.
   * @param timeZone La zona horaria IANA (ej. 'America/Guatemala')
   * @returns Un Date objeto que es el inicio del día local en UTC (ej. 2025-07-04T06:00:00.000Z para Guatemala)
   */
  public getStartOfTodayInTimeZone(timeZone: string): Date {
    const now = this.nowUtc(); // Usar nowUtc para consistencia
    const dateInZone = this.convertUtcToZonedTime(now, timeZone); // Convertir para operar en el contexto de la TZ
    const startOfLocalDay = startOfDay(dateInZone);
    return this.convertZonedTimeToUtc(startOfLocalDay, timeZone); // Convertir ese inicio de día local a UTC para la DB
  }

  /**
   * Calcula el fin del "día de hoy" en la zona horaria especificada y devuelve su equivalente UTC.
   * @param timeZone La zona horaria IANA (ej. 'America/Guatemala')
   * @returns Un Date objeto que es el fin del día local en UTC (ej. 2025-07-05T05:59:59.999Z para Guatemala)
   */
  public getEndOfTodayInTimeZone(timeZone: string): Date {
    const now = this.nowUtc();
    const dateInZone = this.convertUtcToZonedTime(now, timeZone);
    const endOfLocalDay = endOfDay(dateInZone); // Obtener fin del día en esa TZ
    return this.convertZonedTimeToUtc(endOfLocalDay, timeZone); // Convertir ese fin de día local a UTC para la DB
  }

  public nowUtc(): Date {
    return new Date();
  }

  public startOfDayUtc(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  public isPast(date: Date | string | number): boolean {
    const dateObject = new Date(date);
    // Usamos this.nowUtc() para comparar contra "ahora", permitiendo mockear "ahora" en tests si extendemos la clase
    return isBefore(dateObject, this.nowUtc());
  }

  public differenceInDays(
    dateLeft: Date | string | number,
    dateRight: Date | string | number,
  ): number {
    // Convierte ambas entradas a objetos Date.
    // Esto asegura que, independientemente de si la entrada fue string/number/Date,
    // se maneje como un instante UTC para la comparación.
    const dateLeftObject = new Date(dateLeft);
    const dateRightObject = new Date(dateRight);

    // differenceInDays de date-fns compara directamente los instantes UTC de los Date objects.
    return differenceInDays(dateLeftObject, dateRightObject);
  }

  public addDays(date: Date | string | number, days: number): Date {
    // Convierte la entrada a un objeto Date (que es internamente UTC).
    const dateObject = new Date(date);
    // addDays opera directamente sobre el valor UTC del Date object.
    return addDays(dateObject, days);
  }

  public addWeeks(date: Date | string | number, weeks: number): Date {
    const dateObject = new Date(date);
    return addWeeks(dateObject, weeks);
  }

  public addMonths(date: Date | string | number, months: number): Date {
    const dateObject = new Date(date);
    return addMonths(dateObject, months);
  }

  public isBefore(
    dateLeft: Date | string | number,
    dateRight: Date | string | number,
  ): boolean {
    // Convierte ambas entradas a objetos Date.
    // Esto asegura que, independientemente de si la entrada fue string/number/Date,
    // se maneje como un instante UTC para la comparación.
    const dateLeftObject = new Date(dateLeft);
    const dateRightObject = new Date(dateRight);

    // isBefore de date-fns compara directamente los instantes UTC de los objetos Date.
    return isBefore(dateLeftObject, dateRightObject);
  }

  public isSunday(date: Date | string | number, timeZone: string): boolean {
    // 1. Convertir la entrada a un objeto Date (que es internamente UTC).
    const dateObject = new Date(date);

    // 2. Convertir ese instante UTC a la fecha/hora local de la zona horaria especificada.
    // toZonedTime devuelve un Date object cuyo _valor interno UTC_ es ajustado
    // de tal manera que, cuando sus componentes de fecha/hora LOCALES son accedidos,
    // corresponden a la fecha/hora en la timeZone especificada.
    const zonedDate = toZonedTime(dateObject, timeZone);

    // 3. Ahora, podemos usar isSunday de date-fns, que operará sobre los componentes
    // de fecha/hora LOCALES de 'zonedDate', los cuales ya reflejan la zona horaria deseada.
    return isSunday(zonedDate);
  }

  public isEqual(
    dateLeft: Date | string | number,
    dateRight: Date | string | number,
  ): boolean {
    const dateLeftObject = new Date(dateLeft);
    const dateRightObject = new Date(dateRight);

    return isEqual(dateLeftObject, dateRightObject);
  }

  /**
   * Cuenta los días entre dateLeft y dateRight excluyendo los domingos (días no hábiles).
   * Solo cuenta días hacia adelante (dateLeft debe ser anterior a dateRight).
   * @returns Número de días hábiles entre las dos fechas.
   */
  public countBusinessDays(
    dateLeft: Date | string | number,
    dateRight: Date | string | number,
    timeZone: string,
  ): number {
    const dateLeftObject = new Date(dateLeft);
    const dateRightObject = new Date(dateRight);

    let count = 0;
    // Empezamos desde el día siguiente a dateLeft (paidUntilDate),
    // porque dateLeft es el último día pagado y no debe contar como atraso.
    let current = addDays(dateLeftObject, 1);

    while (isBefore(current, dateRightObject)) {
      if (!this.isSunday(current, timeZone)) {
        count++;
      }
      current = addDays(current, 1);
    }

    return count;
  }
}
