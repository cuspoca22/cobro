import { Exclude, Expose, Transform } from "class-transformer";
import { FrecuenciaCobro } from "../interfaces";
import { GetClienteDto } from "src/cliente/dto";

export class GetCreditoResponseDto {
  @Expose() // Asegura que este campo sea expuesto
  // @Transform(({ obj }) => {
  //   // Si obj._id existe, lo convierte a string.
  //   if (obj._id) {
  //     return obj._id.toString();
  //   }
  //   // Si obj._id no existe, pero obj.id sí, lo usa.
  //   if (obj.id) {
  //     return obj.id.toString(); // Asegura que sea string
  //   }
  //   // Si ni _id ni id existen, devuelve null o undefined.
  //   return null; 
  // })
  id: string;

  @Expose()
  cliente: GetClienteDto; // Este ahora será el ID del cliente referenciado

  @Expose()
  fecha_inicio: Date;

  @Expose()
  frecuencia_cobro: FrecuenciaCobro;

  @Expose()
  valor_cuota: number;

  @Expose()
  @Transform(({ obj }) => obj.ruta ? obj.ruta.toString() : null) // Convierte el Array de ObjectId de PAGOS a string
  ruta: string;

  @Expose()
  daysOverdue: number;

  @Expose()
  saldo: number;

  @Expose()
  total_pagar: number;

  @Expose()
  status: boolean;

  @Expose()
  state: string

  @Expose()
  ultimo_pago: Date;

  @Expose()
  abonos: number;

  @Expose()
  paidToday: boolean;

  @Expose()
  total_cuotas: number;

  @Expose()
  valor_credito: number;

  @Exclude()
  __v: number;

  // Constructor opcional para inicializar propiedades
  constructor(data?: Partial<GetCreditoResponseDto>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  // Método estático para construir una instancia desde un objeto plano (de la agregación)
  static fromObject = (object: { [key: string]: any }): GetCreditoResponseDto => {
    if (!object) {
      return null;
    }

    const {
      _id, // ID del crédito
      id,  // O si el crédito mismo tuviera un 'id' ya
      cliente, // El objeto cliente que viene de la agregación
      fecha_inicio, valor_credito, frecuencia_cobro, valor_cuota, ruta,
      saldo, total_pagar, status, ultimo_pago, abonos, paidToday, total_cuotas,
      // daysOverdue y state no estarán aquí directamente, se añaden después.
      // Si la agregación ya proyecta un 'daysOverdue' o 'state', puedes incluirlo.
      daysOverdue, state, 
    } = object;

    // Asegurar que el ID del CRÉDITO se tome de _id o id
    const creditId = (id || _id)?.toString() || null;

    // Usar el fromObject de GetClienteDto para el cliente anidado
    const clientDto = GetClienteDto.fromObject(cliente);

    const creditoDto = new GetCreditoResponseDto({
      id: creditId,
      cliente: clientDto,
      fecha_inicio: fecha_inicio ? new Date(fecha_inicio) : null, // Asegura que las fechas sean objetos Date
      valor_credito: valor_credito ?? null,
      frecuencia_cobro: frecuencia_cobro ?? null,
      valor_cuota: valor_cuota ?? null,
      ruta: ruta ? ruta.toString() : null,
      // Los valores calculados daysOverdue y state pueden estar en el objeto plano
      // si los añadiste al final de tu $project de MongoDB.
      // Si se calculan en TypeScript después, se asignarán más tarde.
      daysOverdue: daysOverdue ?? 0, // Default a 0 o valor apropiado
      state: state ?? null,
      saldo: saldo ?? null,
      total_pagar: total_pagar ?? null,
      status: status ?? null,
      ultimo_pago: ultimo_pago ? new Date(ultimo_pago) : null,
      abonos: abonos ?? null,
      paidToday: paidToday ?? null,
      total_cuotas: total_cuotas ?? null,
    });

    return creditoDto;
  }
  
}