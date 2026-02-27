/**
 * Representa un movimiento individual dentro del resumen de oficina.
 */
export interface MovimientoResumen {
  id: string;
  monto: number;
  concepto: string;
  comentario: string;
  categoriaGasto?: string;
  fecha: Date;
}

/**
 * Grupo de movimientos de un subtipo específico con su total acumulado.
 */
export interface GrupoMovimiento {
  total: number;
  movimientos: MovimientoResumen[];
}

/**
 * Estructura de respuesta del endpoint GET /movimiento-caja/oficina/resumen.
 * Agrupa los movimientos de oficina por categoría (gastos, retiros, inversiones, depósitos).
 */
export interface ResumenOficinaResponse {
  gastos: GrupoMovimiento;
  retiros: GrupoMovimiento;
  inversiones: GrupoMovimiento;
}
