import { ValidRoles } from "../interfaces";

export class UserEntity {
   id: string;
   nombre: string;
   username: string;
   rol: ValidRoles;
   empresa: string;
   estado: boolean;
   ruta?: string;
   /** Rutas de SUPERVISOR (ids). */
   rutas?: string[];
   puedeActualizarUbicacion?: boolean;

   constructor(data?: Partial<UserEntity>) {
      if (data) {
         Object.assign(this, data);
      }
   }

   static fromObject(object: { [key: string]: any }): UserEntity {
      const { _id, id } = object;
      const userId = (id || _id)?.toString() || null;

      const rutaRaw = object.ruta?._id ?? object.ruta;
      const empresaRaw = object.empresa?._id ?? object.empresa;

      const rutasRaw = Array.isArray(object.rutas) ? object.rutas : [];
      const rutas = rutasRaw
         .map((r: any) => (r?._id ?? r)?.toString())
         .filter((v: string | undefined): v is string => !!v);

      return new UserEntity({
         id: userId,
         nombre: object.nombre,
         username: object.username,
         rol: object.rol,
         empresa: empresaRaw ? empresaRaw.toString() : undefined,
         estado: object.estado,
         ruta: rutaRaw ? rutaRaw.toString() : undefined,
         rutas,
         puedeActualizarUbicacion: object.puedeActualizarUbicacion ?? false,
      });

   }

}
