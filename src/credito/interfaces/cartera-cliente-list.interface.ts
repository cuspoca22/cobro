import { ClasificacionCliente } from './clasificacion-cliente.enum';

/** Item lean para drill-down de cartera (reportes admin). */
export interface CarteraClienteListItem {
  creditoId: string;
  clienteId: string;
  nombre: string;
  alias?: string;
  telefono?: string;
  dpi?: string;
  rutaId: string;
  rutaNombre: string;
  state: ClasificacionCliente;
  daysOverdue: number;
  saldo: number;
  valorCuota: number;
  currency: string;
}

export interface CarteraClienteListRutaInput {
  rutaId: string;
  nombre: string;
  timeZone: string;
  currency: string;
}
