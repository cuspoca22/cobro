import { ClienteEntity } from "src/cliente/entities/cliente.entity";
import { FrecuenciaCobro } from "../interfaces";
import { CajaMovimientoEntity } from '../../movimientoCaja/entities/caja-movimiento.entity';

export class CreditoEntity {

  cliente: ClienteEntity;
  status: boolean;
  valor_credito: number;
  interes: number;
  total_cuotas: number;
  total_pagar: number;
  valor_cuota: number;
  fecha_inicio: Date;
  ruta: string;
  ultimo_pago: Date;
  observaciones: string;
  turno: number;
  frecuencia_cobro: FrecuenciaCobro;
  state: string;
  dueDate: Date;
  abonos: number;
  saldo: number;
  paidToday: boolean;
  daysOverdue: number;
  paymentsToday: CajaMovimientoEntity | null;
  _id?: string;
  id?: string;

  constructor(data?: Partial<CreditoEntity>) { 
    if (data) {
      Object.assign(this, data);
    }
  }

  static fromObject( object: {[key: string]: any} ): CreditoEntity {

    const { _id, id } = object;

    const creditId = (id || _id)?.toString() || null;

    let paymentsToday = null;
    
    if(object.paymentsToday.length > 0){
      paymentsToday = CajaMovimientoEntity.fromObject(object.paymentsToday[0]);
    }

    const credito = new CreditoEntity({
      id: creditId,
      cliente: ClienteEntity.fromObject(object.cliente),
      status: object.status,
      valor_credito: object.valor_credito,
      interes: object.interes,
      total_cuotas: object.total_cuotas,
      total_pagar: object.total_pagar,
      valor_cuota: object.valor_cuota,
      fecha_inicio: object.fecha_inicio,
      ruta: object.ruta,
      ultimo_pago: object.ultimo_pago,
      observaciones: object.observaciones,
      turno: object.turno,
      frecuencia_cobro: object.frecuencia_cobro,
      state: object.state,
      dueDate: object.dueDate,
      abonos: object.abonos,
      saldo: object.saldo,
      paymentsToday,
      paidToday: object.paidToday,
      daysOverdue: object.daysOverdue,
    });

    return credito;

  }
}