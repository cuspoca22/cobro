import { FaseAgendado } from '../agenda-time';

export interface CondicionesAgendadoView {
  valor_credito: number;
  total_cuotas: number;
  frecuencia_cobro: string;
  modo: string;
  interes?: number;
  valor_cuota?: number;
  observaciones?: string;
}

export interface AgendadoListItem {
  id: string;
  clienteId: string;
  alias: string;
  nombre: string;
  rutaId: string;
  rutaNombre: string;
  empresaId: string;
  creadoPorId: string;
  creadoPorNombre: string;
  fechaVisita: string;
  horaRecordatorio: string;
  recordarEn: string;
  fase: FaseAgendado;
  puedeRenovar: boolean;
  estado: string;
  condiciones: CondicionesAgendadoView;
  recordatorioEstado: string;
}
