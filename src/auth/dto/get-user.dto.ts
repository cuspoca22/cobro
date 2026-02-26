import { Exclude, Expose, Transform } from "class-transformer";

export class GetUserDto {

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
  username: string;

  @Expose()
  @Transform(({ obj }) => obj.ruta ? obj.ruta.toString() : null) // Convierte el ObjectId de USER a string
  ruta: string;

  @Expose()
  estado: boolean;

  @Expose()
  rol: string

  @Expose()
  @Transform(({ obj }) => obj.empresa ? obj.empresa.toString() : null) // Convierte el ObjectId de EMPRESA a string
  empresa: string;

  @Expose()
  nombre: string;

  @Exclude()
  password: string;

  @Exclude()
  rutas: string[];

  @Exclude()
  _id: string;

  @Exclude()
  __v: number;

}