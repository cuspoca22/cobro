import { CategoriaGasto, SubTipo, TipoMovimiento } from "../interfaces";

export class CajaMovimientoEntity {
  id: string;
  caja: string;
  monto: number;
  tipoMovimiento: TipoMovimiento;
  subTipo: SubTipo;
  ruta: string;
  createdAt: Date;
  updatedAt: Date;
  concepto?: string;
  comentario?: string;
  cliente?: string;
  credito?: string;
  categoriaGasto?: CategoriaGasto;
  _id?: string;

  constructor(data?: Partial<CajaMovimientoEntity>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  static fromObject(object: { [key: string]: any }): CajaMovimientoEntity {

    const { _id, id } = object;

    const creditId = (id || _id)?.toString() || null;

    const cajaMovimiento = new CajaMovimientoEntity({
      id: creditId,
      caja: object.caja,
      monto:  object.monto,
      tipoMovimiento: object.tipoMovimiento,
      subTipo: object.subTipo,
      ruta: object.ruta,
      createdAt: object.createdAt,
      updatedAt: object.updatedAt,
      concepto: object.concepto,
      comentario: object.comentario,
      cliente: object.cliente,
      credito: object.credito,
      categoriaGasto: object.categoriaGasto,
    })
    
    return cajaMovimiento;
  }
}