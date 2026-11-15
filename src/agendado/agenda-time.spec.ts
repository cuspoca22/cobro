import { hayPrestamoPosterior, prestamoQueCumple, PrestamoRef } from './agenda-time';
import {
  faseDeVisita,
  isFechaCalendario,
  recordarEnUtc,
  recordatorioEstado,
} from './agenda-time';

describe('agenda-time', () => {
  const creado = new Date('2026-06-15T15:00:00.000Z');

  const prestamo = (createdAt: string, creditoId = 'c1'): PrestamoRef => ({
    clienteId: 'cli',
    creditoId,
    movimientoId: `m-${creditoId}`,
    createdAt: new Date(createdAt),
  });

  it('un préstamo anterior no cumple el agendado', () => {
    expect(
      prestamoQueCumple(creado, [prestamo('2026-06-15T10:00:00.000Z')]),
    ).toBeNull();
  });

  it('un préstamo posterior sí cumple, aunque sea el mismo día', () => {
    const match = prestamoQueCumple(creado, [
      prestamo('2026-06-15T10:00:00.000Z', 'viejo'),
      prestamo('2026-06-15T16:00:00.000Z', 'nuevo'),
    ]);
    expect(match?.creditoId).toBe('nuevo');
  });

  it('reabre solo si no queda otro préstamo posterior', () => {
    expect(hayPrestamoPosterior(creado, [prestamo('2026-06-15T10:00:00.000Z')])).toBe(false);
    expect(hayPrestamoPosterior(creado, [prestamo('2026-06-15T16:00:00.000Z')])).toBe(true);
  });

  it('la hora de pared se guarda en UTC de la zona de la ruta', () => {
    const instant = recordarEnUtc('2026-06-15', '08:00', 'America/Guatemala');
    expect(instant.toISOString()).toBe('2026-06-15T14:00:00.000Z');
  });

  it('una hora ya pasada queda omitida y una futura programada', () => {
    const now = new Date('2026-06-15T18:00:00.000Z');
    expect(recordatorioEstado(new Date('2026-06-15T14:00:00.000Z'), now)).toBe('omitido');
    expect(recordatorioEstado(new Date('2026-06-16T14:00:00.000Z'), now)).toBe('programado');
  });

  it('clasifica la visita contra el día de la ruta', () => {
    const now = new Date('2026-06-15T18:00:00.000Z');
    expect(faseDeVisita('2026-06-14', 'America/Guatemala', now)).toBe('vencido');
    expect(faseDeVisita('2026-06-15', 'America/Guatemala', now)).toBe('hoy');
    expect(faseDeVisita('2026-06-16', 'America/Guatemala', now)).toBe('proximo');
  });

  it('rechaza fechas de calendario imposibles', () => {
    expect(isFechaCalendario('2026-02-31')).toBe(false);
    expect(isFechaCalendario('2026-06-15')).toBe(true);
  });
});
