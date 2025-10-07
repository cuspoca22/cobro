import { Exclude, Expose, Transform } from "class-transformer";

export class GetCajaDto {
  @Expose()
   @Transform(({ obj }) => {
    // Si obj._id existe, lo convierte a string.
    if (obj._id) {
      return obj._id.toString();
    }
    // Si obj._id no existe, pero obj.id sí, lo usa.
    if (obj.id) {
      return obj.id.toString(); // Asegura que sea string
    }
    // Si ni _id ni id existen, devuelve null o undefined.
    return null; 
  })
  id: string;

  @Expose()
  @Transform(({obj}) => obj.ruta ? obj.ruta.toString() : null)
  ruta: string;
  
  @Expose()
  fecha: Date;
  
  @Expose()
  base: number;
  
  @Expose()
  inversion: number;
  
  @Expose()
  retiro: number;

  @Expose()
  prestamo: number;

  @Expose()
  total_clientes: number;

  @Expose()
  renovaciones: number;
  
  @Expose()
  gasto: number;

  @Expose()
  caja_final: number;
  
  @Expose()
  cobro: number;

  @Expose()
  extra: number;

  @Expose()
  clientes_pendientes: number;

  @Expose()
  pretendido: number;

  @Exclude()
  __v: number;

  @Exclude()
  _id: number;
}