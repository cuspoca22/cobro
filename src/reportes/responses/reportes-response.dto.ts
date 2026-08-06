import { ApiProperty } from '@nestjs/swagger';

export class PeriodoDto {
  @ApiProperty({ example: '2026-06-01' })
  fechaInicio: string;

  @ApiProperty({ example: '2026-06-30' })
  fechaFin: string;
}

export class MovimientoDetalleDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id: string;

  @ApiProperty({ example: 150.5 })
  monto: number;

  @ApiProperty({ example: 'Gasolina ruta norte' })
  concepto: string;

  @ApiProperty({ example: 'Tanque lleno' })
  comentario: string;

  @ApiProperty({ example: 'gasolina', required: false })
  categoriaGasto?: string;

  @ApiProperty({ example: '2026-06-15T18:30:00.000Z' })
  fecha: Date;
}

export class GrupoMovimientoDto {
  @ApiProperty({ example: 2500 })
  total: number;

  @ApiProperty({ type: [MovimientoDetalleDto] })
  movimientos: MovimientoDetalleDto[];
}

export class GrupoGastosDto extends GrupoMovimientoDto {
  @ApiProperty({
    example: { gasolina: 800, 'sueldo cobrador': 1200 },
    description: 'Desglose de gastos por categoría',
  })
  porCategoria: Record<string, number>;
}

export class ReporteOficinaRutaDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  rutaId: string;

  @ApiProperty({ example: 'RUTA NORTE' })
  nombre: string;

  @ApiProperty({ example: 'America/Guatemala' })
  timeZone: string;

  @ApiProperty({ example: 'GTQ' })
  currency: string;

  @ApiProperty({ type: GrupoGastosDto })
  gastos: GrupoGastosDto;

  @ApiProperty({ type: GrupoMovimientoDto })
  retiros: GrupoMovimientoDto;

  @ApiProperty({ type: GrupoMovimientoDto })
  inversiones: GrupoMovimientoDto;
}

export class TotalesOficinaEmpresaDto {
  @ApiProperty({ example: 3200 })
  gastos: number;

  @ApiProperty({ example: 1500 })
  retiros: number;

  @ApiProperty({ example: 5000 })
  inversiones: number;

  @ApiProperty({ example: 3500, description: 'inversiones - retiros' })
  netoCapital: number;
}

export class ReporteOficinaResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  empresaId: string;

  @ApiProperty({ example: 'Mi Empresa S.A.' })
  nombre: string;

  @ApiProperty({ type: PeriodoDto })
  periodo: PeriodoDto;

  @ApiProperty({ type: TotalesOficinaEmpresaDto })
  totalesEmpresa: TotalesOficinaEmpresaDto;

  @ApiProperty({
    example: { gasolina: 800, transporte: 400 },
    description: 'Gastos consolidados por categoría a nivel empresa',
  })
  gastosPorCategoria: Record<string, number>;

  @ApiProperty({ type: [ReporteOficinaRutaDto] })
  rutas: ReporteOficinaRutaDto[];
}

export class TotalesFinancieroEmpresaDto {
  @ApiProperty({ example: 45000, description: 'Total cobrado (pago_credito)' })
  cobros: number;

  @ApiProperty({ example: 30000, description: 'Total prestado (prestamo_otorgado)' })
  prestamosOtorgados: number;

  @ApiProperty({
    example: 8500,
    description:
      'Interés cobrado en el periodo (prorrateo sobre montoAbono, sin mora). ' +
      'Difiere de interesContractual/gananciaPotencial en cartera.',
  })
  interesCobrado: number;

  @ApiProperty({ example: 3200 })
  gastos: number;

  @ApiProperty({ example: 1500 })
  retiros: number;

  @ApiProperty({ example: 5000 })
  inversiones: number;

  @ApiProperty({
    example: 5300,
    description: 'Resultado del periodo: interesCobrado - gastos',
  })
  resultadoPeriodo: number;
}

export class SerieDiariaFinancieroDto {
  @ApiProperty({ example: '2026-06-15' })
  fecha: string;

  @ApiProperty({ example: 2500 })
  cobros: number;

  @ApiProperty({ example: 1000 })
  prestamosOtorgados: number;

  @ApiProperty({ example: 450 })
  interesCobrado: number;

  @ApiProperty({ example: 200 })
  gastos: number;
}

export class ReporteFinancieroRutaDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  rutaId: string;

  @ApiProperty({ example: 'RUTA NORTE' })
  nombre: string;

  @ApiProperty({ example: 25000 })
  cobros: number;

  @ApiProperty({ example: 15000 })
  prestamosOtorgados: number;

  @ApiProperty({ example: 4200 })
  interesCobrado: number;

  @ApiProperty({ example: 1800 })
  gastos: number;

  @ApiProperty({ example: 800 })
  retiros: number;

  @ApiProperty({ example: 3000 })
  inversiones: number;
}

export class ReporteFinancieroResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  empresaId: string;

  @ApiProperty({ example: 'Mi Empresa S.A.' })
  nombre: string;

  @ApiProperty({ type: PeriodoDto })
  periodo: PeriodoDto;

  @ApiProperty({ type: TotalesFinancieroEmpresaDto })
  totalesEmpresa: TotalesFinancieroEmpresaDto;

  @ApiProperty({ type: [SerieDiariaFinancieroDto] })
  seriesDiarias: SerieDiariaFinancieroDto[];

  @ApiProperty({ type: [ReporteFinancieroRutaDto] })
  rutas: ReporteFinancieroRutaDto[];
}

export class DistribucionEstadoDto {
  @ApiProperty({ example: 30 })
  BUENO: number;

  @ApiProperty({ example: 5 })
  REGULAR: number;

  @ApiProperty({ example: 3 })
  MALO: number;
}

export class TotalesCarteraEmpresaDto {
  @ApiProperty({ example: 125400, description: 'Saldo pendiente total de créditos activos' })
  cartera: number;

  @ApiProperty({ example: 98000, description: 'Capital prestado en créditos activos (valor_credito original)' })
  capitalPrestado: number;

  @ApiProperty({
    example: 27400,
    description:
      'Alias de interesContractual: interés contractual total de créditos activos ' +
      '(total_pagar - valor_credito). No descuenta lo ya cobrado.',
  })
  gananciaPotencial: number;

  @ApiProperty({
    example: 27400,
    description:
      'Interés contractual total de créditos activos (total_pagar - valor_credito). ' +
      'Igual a gananciaPotencial.',
  })
  interesContractual: number;

  @ApiProperty({
    example: 12000,
    description:
      'Interés aún pendiente de cobrar, prorrateado por saldo: ' +
      'interesContractual * (saldo / total_pagar)',
  })
  interesPendiente: number;

  @ApiProperty({
    example: 15400,
    description:
      'Interés ya cobrado en créditos activos (acumulado): ' +
      'interesContractual * (abonos / total_pagar)',
  })
  interesCobradoAcumulado: number;

  @ApiProperty({
    example: 8500,
    description: 'Suma de caja_final actual (última caja conocida) de todas las rutas',
  })
  cajaTotalEmpresa: number;

  @ApiProperty({
    example: 133900,
    description: 'Liquidez operativa: cajaTotalEmpresa + cartera (efectivo en rutas + saldo por cobrar)',
  })
  liquidezOperativa: number;

  @ApiProperty({ example: 45 })
  totalClientes: number;

  @ApiProperty({ example: 38 })
  clientesActivos: number;

  @ApiProperty({
    example: 40,
    description: 'Total de créditos activos (BUENO + REGULAR + MALO)',
  })
  creditosActivos: number;

  @ApiProperty({
    example: 8,
    description: 'Créditos activos con estado REGULAR o MALO (nombre histórico: clientesMorosos)',
  })
  clientesMorosos: number;

  @ApiProperty({
    example: 20,
    description: 'Porcentaje de créditos morosos sobre créditos activos',
  })
  porcentajeMorosidad: number;

  @ApiProperty({ type: DistribucionEstadoDto })
  distribucionEstado: DistribucionEstadoDto;
}

export class ReporteCarteraRutaDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  rutaId: string;

  @ApiProperty({ example: 'RUTA NORTE' })
  nombre: string;

  @ApiProperty({ example: 65000 })
  cartera: number;

  @ApiProperty({ example: 50000 })
  capitalPrestado: number;

  @ApiProperty({ example: 15000, description: 'Alias de interesContractual' })
  gananciaPotencial: number;

  @ApiProperty({ example: 15000 })
  interesContractual: number;

  @ApiProperty({ example: 7000 })
  interesPendiente: number;

  @ApiProperty({ example: 8000 })
  interesCobradoAcumulado: number;

  @ApiProperty({
    example: 4200,
    description: 'caja_final de la última caja conocida de la ruta',
  })
  cajaActual: number;

  @ApiProperty({
    example: 69200,
    description: 'cajaActual + cartera de la ruta',
  })
  liquidezOperativa: number;

  @ApiProperty({ example: 25 })
  totalClientes: number;

  @ApiProperty({ example: 20 })
  clientesActivos: number;

  @ApiProperty({ example: 22 })
  creditosActivos: number;

  @ApiProperty({ example: 4 })
  clientesMorosos: number;

  @ApiProperty({ type: DistribucionEstadoDto })
  distribucionEstado: DistribucionEstadoDto;
}

export class ReporteCarteraResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  empresaId: string;

  @ApiProperty({ example: 'Mi Empresa S.A.' })
  nombre: string;

  @ApiProperty({ type: TotalesCarteraEmpresaDto })
  totalesEmpresa: TotalesCarteraEmpresaDto;

  @ApiProperty({ type: [ReporteCarteraRutaDto] })
  rutas: ReporteCarteraRutaDto[];
}

export class SerieDiariaCajaDto {
  @ApiProperty({ example: '2026-06-15' })
  fecha: string;

  @ApiProperty({ example: 2500 })
  cobro: number;

  @ApiProperty({ example: 1000 })
  prestamo: number;

  @ApiProperty({ example: 200 })
  gasto: number;

  @ApiProperty({ example: 15000 })
  cajaFinal: number;

  @ApiProperty({ example: 3000 })
  pretendido: number;

  @ApiProperty({ example: 83.33, nullable: true, description: 'cobro/pretendido × 100' })
  eficienciaCobro: number | null;
}

export class TotalesCajaHistoricoEmpresaDto {
  @ApiProperty({ example: 45000 })
  cobro: number;

  @ApiProperty({ example: 30000 })
  prestamo: number;

  @ApiProperty({ example: 3200 })
  gasto: number;

  @ApiProperty({ example: 1500 })
  retiro: number;

  @ApiProperty({ example: 5000 })
  inversion: number;

  @ApiProperty({
    example: 18500,
    description:
      'Suma de caja_final del último día con snapshot en el periodo (por ruta, luego sumadas)',
  })
  cajaFinalUltimoDia: number;

  @ApiProperty({ example: 78.5, description: 'Promedio de eficiencia de cobro en días con pretendido > 0' })
  promedioEficienciaCobro: number;
}

export class ReporteCajaHistoricoRutaDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  rutaId: string;

  @ApiProperty({ example: 'RUTA NORTE' })
  nombre: string;

  @ApiProperty({ type: [SerieDiariaCajaDto] })
  seriesDiarias: SerieDiariaCajaDto[];
}

export class ReporteCajaHistoricoResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  empresaId: string;

  @ApiProperty({ example: 'Mi Empresa S.A.' })
  nombre: string;

  @ApiProperty({ type: PeriodoDto })
  periodo: PeriodoDto;

  @ApiProperty({ type: TotalesCajaHistoricoEmpresaDto })
  totalesEmpresa: TotalesCajaHistoricoEmpresaDto;

  @ApiProperty({ type: [SerieDiariaCajaDto] })
  seriesDiarias: SerieDiariaCajaDto[];

  @ApiProperty({ type: [ReporteCajaHistoricoRutaDto] })
  rutas: ReporteCajaHistoricoRutaDto[];
}
