// import { Credito } from './entities/credito.entity';
// import { Pago } from '../pago/entities/pago.entity';
// import { addDays, differenceInDays, getDay } from 'date-fns';
// export class InformeCredito {

//    private credito: Credito;

//    constructor(credito: Credito) {
//       this.credito = credito;
//    }

//    public getLastPay(): Pago {

//       return this.credito.pagos[0];

//    }

//    // public async calcularAtrasos() {

//    //    const credito = this.credito;

//    //    let q = credito.fecha_inicio.split('/');

//    //    let newFecha = `${q[2]}-${q[1]}-${q[0]}`;


//    //    const fechaInicioCredito = new Date(newFecha);
//    //    let fechaInicioPagos = addDays(fechaInicioCredito, 1);
//    //    const fechaActual = new Date();

//    //    const totalDias = differenceInDays(fechaActual, fechaInicioPagos);
//    //    const diasEfectivosPago = this.calcularDiasEfectivosPago(fechaInicioPagos, fechaActual, credito.se_cobran_domingos);

//    //    const intervaloPagos = this.calcularIntervaloPagos(credito.frecuencia_cobro);

//    //    const valorCuota = credito.valor_cuota;
//    //    const totalAbonos = credito.abonos;

//    //    const pagosRealizados = Math.floor(totalAbonos / valorCuota);
//    //    const pagosRequeridos = credito.total_cuotas;

//    //    const atrasos = Math.max(diasEfectivosPago - pagosRealizados, 0);
//    //    const atrasosMaximos = this.calcularAtrasosMaximos(pagosRequeridos, intervaloPagos);

//    //    return Math.min(atrasos, atrasosMaximos);
//    // }

//    private calcularDiasEfectivosPago(fechaInicioPagos: Date, fechaActual: Date, seCobranDomingos: boolean) {
//       let diasEfectivosPago = differenceInDays(fechaActual, fechaInicioPagos);
//       if (!seCobranDomingos) {
//          let fecha = fechaInicioPagos;
//          for (let i = 0; i <= diasEfectivosPago; i++) {
//             if (getDay(fecha) === 0) {
//                diasEfectivosPago--;
//             }
//             fecha = addDays(fecha, 1);
//          }
//       }

//       return diasEfectivosPago;
//    }

//    private calcularIntervaloPagos(frecuenciaCobro: string): number {
//       if (frecuenciaCobro === 'semanal') {
//          return 7;
//       } else {
//          return 1;
//       }
//    }

//    private calcularAtrasosMaximos(pagosRequeridos: number, intervaloPagos: number): number {
//       return (pagosRequeridos - 1) * intervaloPagos;
//    }

//    async getMessage(): Promise<{ message: string; urlMessage: string }> {

//       let cuotasPendientes = this.credito.saldo / this.credito.valor_cuota;
//       let aplicandoFixed = cuotasPendientes.toFixed(2);

//       let cuotasPendientesParse = Number(aplicandoFixed);

//       let txtEncoded: string = `
//          Fecha+Inicio%3a+${this.credito.fecha_inicio.replaceAll(" ", "+")}%0d%0a
//          Cliente%3a+${this.credito.cliente.alias.replaceAll(" ", "+")}%0d%0a
//          Abonos%3a+$${this.credito.abonos}.00%0d%0a
//          Saldo%3a+$${this.credito.saldo}.00%0d%0a
//          Atrasos%3a+${await this.calcularAtrasos()}%0d%0a
//          Cuotas+pendientes%3a+${cuotasPendientesParse}+/+${this.credito.total_cuotas}.00%0d%0a%0d%0a
//          Informacion+ultimo+pago%3a+%0d%0a
//          Valor%3a+$${this.getLastPay().valor}.00%0d%0a
//          Fecha%3a+${this.getLastPay().fecha.replaceAll(" ", "+")}
//       `

//       let txtMessage: string = `
//          Fecha: ${this.credito.fecha_inicio} 
//          Cliente: ${this.credito.cliente.alias} 
//          Abonos: $${this.credito.abonos}.00 
//          Saldo: $${this.credito.saldo}.00 
//          Atrasos: ${await this.calcularAtrasos()} 
//          Cuotas Pendientes: ${cuotasPendientesParse} / ${this.credito.total_cuotas}  
//          Informacion Ultimo Pago 
//          Valor: $${this.getLastPay().valor}.00  
//          Fecha: ${this.getLastPay().fecha}
//       `

//       return {
//          urlMessage: `https://wa.me/${this.credito.cliente.telefono}?text=${txtEncoded}`,
//          message: txtMessage
//       }

//    }

// }