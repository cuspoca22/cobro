import { Types } from "mongoose";

export interface RenovacionDetalle {
  id: Types.ObjectId;
  nombre: string;
  alias?: string;
  monto: number;
  fecha: Date;
}

export interface RutaReport {
  rutaId: Types.ObjectId;
  nombre: string;
  renovaciones: RenovacionDetalle[];
  totalMonto: number;
  cantidad: number;
}

export interface EmpresaReport {
  empresaId: Types.ObjectId;
  nombre: string;
  rutas: RutaReport[];
  totalEmpresa: number;
  cantidadEmpresa: number;
}
