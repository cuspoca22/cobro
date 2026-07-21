
/**
 * Entidad que representa una Caja.
 * Mapea la estructura de datos para la gestión de cajas, incluyendo ingresos, egresos y métricas.
 */
export class CajaEntity {

  _id?: string;
  id?: string;
  ruta: string | any;
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
  moraCobrada: number;
  moraPorCobrar: number;
  /** Flag de empresa (solo response; no se persiste en schema caja). */
  cobraMora?: boolean;
  status: boolean;

  /**
   * Crea una nueva instancia de CajaEntity.
   * @param data Datos parciales para inicializar la entidad.
   */
  constructor(data?: Partial<CajaEntity>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  /**
   * Crea una instancia de CajaEntity a partir de un objeto genérico (ej. documento de Mongoose).
   * Realiza la conversión de tipos necesaria para asegurar la integridad de la entidad.
   * @param object Objeto con los datos de origen.
   * @returns Nueva instancia de CajaEntity.
   */
  static fromObject(object: { [key: string]: any }): CajaEntity {

    const { _id, id, ...rest } = object;

    const cajaId = (id || _id)?.toString() || null;

    const caja = new CajaEntity({
      id: cajaId,
      _id: _id?.toString(), // Aseguramos que _id también esté disponible si se requiere
      ruta: object.ruta,
      fecha: object.fecha ? new Date(object.fecha) : undefined, // Aseguramos que sea fecha válida
      base: Number(object.base) || 0,
      inversion: Number(object.inversion) || 0,
      retiro: Number(object.retiro) || 0,
      prestamo: Number(object.prestamo) || 0,
      total_clientes: Number(object.total_clientes) || 0,
      renovaciones: Number(object.renovaciones) || 0,
      gasto: Number(object.gasto) || 0,
      caja_final: Number(object.caja_final) || 0,
      cobro: Number(object.cobro) || 0,
      clientes_pendientes: Number(object.clientes_pendientes) || 0,
      pretendido: Number(object.pretendido) || 0,
      moraCobrada: Number(object.moraCobrada) || 0,
      moraPorCobrar: Number(object.moraPorCobrar) || 0,
      cobraMora: object.cobraMora !== undefined ? !!object.cobraMora : undefined,
      status: object.status !== undefined ? object.status : true, // Por defecto true si no viene definido
    });

    return caja;

  }

}
