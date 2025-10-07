export class CajaEntity {

  ruta: string;
  fecha: Date;
  base: number;
  inversion: number;
  retiro: number;
  prestamo: number;
  total_clientes: number;
  renovaciones: number;
  gasto: number;
  caja_final: number;
  cobro: number;
  clientes_pendientes: number;
  pretendido: number;
  _id?: string;
  id?: string;

  constructor(data?: Partial<CajaEntity>) { 
    if (data) {
      Object.assign(this, data);
    }
  }

  static fromObject( object: {[key: string]: any} ): CajaEntity {

    const { _id, id } = object;

    const cajaId = (id || _id)?.toString() || null;

    const caja = new CajaEntity({
      id: cajaId,
      ruta: object.ruta,
      fecha: object.fecha,
      base: object.base,
      inversion: object.inversion,
      retiro: object.retiro,
      prestamo: object.prestamo,
      total_clientes: object.total_clientes,
      renovaciones: object.renovaciones,
      gasto: object.gasto,
      caja_final: object.caja_final,
      cobro: object.cobro,
      clientes_pendientes: object.clientes_pendientes,
      pretendido: object.pretendido,
    });

    return caja;

  }

}