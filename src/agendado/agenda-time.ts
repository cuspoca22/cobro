import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

export const FALLBACK_RUTA_TZ = 'America/Mexico_City';

export type FaseAgendado = 'vencido' | 'hoy' | 'proximo';
export type EstadoRecordatorio = 'programado' | 'omitido' | 'enviado';

export type PrestamoRef = {
  clienteId: string;
  creditoId: string;
  movimientoId: string;
  createdAt: Date;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isFechaCalendario(fecha: string): boolean {
  if (!FECHA.test(fecha)) return false;
  const [year, month, day] = fecha.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function isHoraValida(hora: string): boolean {
  return HORA.test(hora);
}

export function todayInZone(timeZone: string, now: Date): string {
  return formatInTimeZone(now, timeZone || FALLBACK_RUTA_TZ, 'yyyy-MM-dd');
}

export function faseDeVisita(
  fechaVisita: string,
  timeZone: string,
  now: Date,
): FaseAgendado {
  const today = todayInZone(timeZone, now);
  if (fechaVisita < today) return 'vencido';
  if (fechaVisita === today) return 'hoy';
  return 'proximo';
}

/** Instante UTC de una hora de pared en la zona de la ruta. */
export function recordarEnUtc(
  fechaVisita: string,
  hora: string,
  timeZone: string,
): Date {
  return fromZonedTime(`${fechaVisita}T${hora}:00`, timeZone || FALLBACK_RUTA_TZ);
}

export function recordatorioEstado(
  recordarEn: Date,
  now: Date,
): EstadoRecordatorio {
  return recordarEn.getTime() > now.getTime() ? 'programado' : 'omitido';
}

/**
 * El préstamo cumple el agendado solo si nació después de agendarlo.
 * `movimiento.fecha` es el inicio del día y no sirve para esto.
 */
export function prestamoQueCumple(
  agendadoCreatedAt: Date,
  prestamos: PrestamoRef[],
): PrestamoRef | null {
  const limite = agendadoCreatedAt.getTime();
  const posteriores = prestamos
    .filter((prestamo) => prestamo.createdAt.getTime() > limite)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return posteriores[0] ?? null;
}

const FASE_ORDEN: Record<FaseAgendado, number> = { vencido: 0, hoy: 1, proximo: 2 };

/** Vencidos primero, luego hoy, luego próximos; dentro de cada fase, fecha y hora. */
export function compararVisitas(
  a: { fase: FaseAgendado; fechaVisita: string; horaRecordatorio: string },
  b: { fase: FaseAgendado; fechaVisita: string; horaRecordatorio: string },
): number {
  const porFase = FASE_ORDEN[a.fase] - FASE_ORDEN[b.fase];
  if (porFase !== 0) return porFase;
  if (a.fechaVisita !== b.fechaVisita) return a.fechaVisita < b.fechaVisita ? -1 : 1;
  return a.horaRecordatorio.localeCompare(b.horaRecordatorio);
}

export function hayPrestamoPosterior(
  agendadoCreatedAt: Date,
  prestamos: PrestamoRef[],
): boolean {
  return prestamoQueCumple(agendadoCreatedAt, prestamos) !== null;
}
