import { Exclude, Expose, Transform } from "class-transformer";

export class GetClienteDto {

  @Expose()
  // @Transform(({ obj }) => {
  //   if (obj._id) {
  //     return obj._id.toString();
  //   }
  //   if (obj.id) {
  //     return obj.id.toString();
  //   }
  //   return null;
  // })  
  id: string;

  @Expose()
  status: boolean;

  @Expose()
  dpi: string;

  @Expose()
  nombre: string;

  @Expose()
  alias: string;

  @Expose()
  ciudad: string;

  @Expose()
  direccion: string;

  @Expose()
  ubication: number[];

  @Expose()
  telefono: string;

  @Expose()
  img: string;

  @Expose()
  @Transform(({ obj }) => obj.ruta ? obj.ruta.toString() : null)
  ruta: string;

  @Expose()
  document_image: string;

  @Expose()
  business_image: string;
  
  @Expose()
  house_image: string;

  // @Exclude()
  // _id: string;

  @Exclude()
  __v: number;

  // Constructor opcional para inicializar propiedades (útil para fromObject)
  constructor(data?: Partial<GetClienteDto>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  // Método estático para construir una instancia desde un objeto plano
  static fromObject = (object: { [key: string]: any }): GetClienteDto => {
    // Si el objeto es nulo o indefinido, retornar null para mantener la consistencia
    if (!object) {
      return null;
    }

    const { 
      _id, // Puede venir como _id desde el DB raw
      id,  // O ya como id si tu $project lo renombró
      status, dpi, nombre, alias, ciudad, direccion, ubication, 
      telefono, img, ruta, document_image, business_image, house_image 
    } = object;

    // Asegurarse de que el ID se tome de _id o id y siempre sea un string
    const clientId = (id || _id)?.toString() || null; // Maneja null/undefined de forma segura

    // Crear la nueva instancia de GetClienteDto
    const clienteDto = new GetClienteDto({
      id: clientId,
      status: status ?? null, // Usar ?? null para manejar undefined
      dpi: dpi ?? null,
      nombre: nombre ?? null,
      alias: alias ?? null,
      ciudad: ciudad ?? null,
      direccion: direccion ?? null,
      ubication: ubication ?? null,
      telefono: telefono ?? null,
      img: img ?? null,
      ruta: ruta ? ruta.toString() : null, // Convertir ObjectId a string si 'ruta' es una referencia
      document_image: document_image ?? null,
      business_image: business_image ?? null,
      house_image: house_image ?? null,
      // __v no necesita ser asignado si está Excluido
    });

    return clienteDto;
  }

}