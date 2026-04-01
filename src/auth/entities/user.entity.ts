import { ValidRoles } from "../interfaces";

export class UserEntity {
   id: string;
   nombre: string;
   username: string;
   rol: ValidRoles;
   empresa: string;
   estado: boolean;
   ruta?: string;
   puedeActualizarUbicacion?: boolean;

   constructor(data?: Partial<UserEntity>) {
      if (data) {
         Object.assign(this, data);
      }
   }

   static fromObject(object: { [key: string]: any }): UserEntity {
      const { _id, id } = object;
      const userId = (id || _id)?.toString() || null;

      if (object.rol === ValidRoles.cobrador && object.ruta) {
         object.ruta = object.ruta._id;
      }

      return new UserEntity({
         id: userId,
         nombre: object.nombre,
         username: object.username,
         rol: object.rol,
         empresa: object.empresa,
         estado: object.estado,
         ruta: object.ruta,
         puedeActualizarUbicacion: object.puedeActualizarUbicacion
      });

   }

}
