export interface HistorialCredito {
  valor_credito: number;
  interes: number;
  fecha_inicio: Date;
  frecuencia_cobro: string;
  ultimo_pago: Date;
  total_cuotas: number;
  dias_tardados_en_pagar: number;
}