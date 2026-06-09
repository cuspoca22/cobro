import { DateFnsAdapter } from '../../common/wrappers/date-fns.adapter';

export interface RangoFechasUtc {
  inicio: Date;
  fin: Date;
}

export function calcularRangoFechas(
  fechaInicio: string,
  fechaFin: string,
  timeZone: string,
  dateFnsAdapter: DateFnsAdapter,
): RangoFechasUtc {
  const inicioBase = new Date(`${fechaInicio}T00:00:00`);
  const finBase = new Date(`${fechaFin}T23:59:59.999`);

  return {
    inicio: dateFnsAdapter.convertZonedTimeToUtc(inicioBase, timeZone),
    fin: dateFnsAdapter.convertZonedTimeToUtc(finBase, timeZone),
  };
}

export function buildRutaFechaOrConditions(
  rutas: { rutaId: import('mongoose').Types.ObjectId; timeZone: string }[],
  fechaInicio: string,
  fechaFin: string,
  dateFnsAdapter: DateFnsAdapter,
): Record<string, unknown>[] {
  return rutas.map((ruta) => {
    const { inicio, fin } = calcularRangoFechas(
      fechaInicio,
      fechaFin,
      ruta.timeZone,
      dateFnsAdapter,
    );
    return {
      ruta: ruta.rutaId,
      fecha: { $gte: inicio, $lte: fin },
    };
  });
}
