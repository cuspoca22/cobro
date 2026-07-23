export interface HistorialCredito {
  id: string;
  ruta: string;
  valor_credito: number;
  interes: number;
  total_pagar: number;
  abonos: number;
  saldo: number;
  valor_cuota: number;
  fecha_inicio: Date;
  dueDate?: Date;
  frecuencia_cobro: string;
  ultimo_pago: Date;
  total_cuotas: number;
  dias_tardados_en_pagar: number;
  state?: string;
  observaciones?: string;
  mora_adeudada?: number;
  mora_cobrada?: number;
}
