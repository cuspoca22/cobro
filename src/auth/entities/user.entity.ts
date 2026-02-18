enum Roles {
   ADMIN = 'ADMIN',
   SUPERADMIN = 'SUPERADMIN',
   COBRADOR = 'COBRADOR',
   SUPERVISOR = 'SUPERVISOR',
   CLIENTE = 'CLIENTE'
}

export class UserEntity {
   id: string;
   nombre: string;
   username: string;
   rol: Roles;
   empresa: string;
   estado: boolean;
   ruta?: string;

   constructor(data?: Partial<UserEntity>) {
      if (data) {
         Object.assign(this, data);
      }
   }

   static fromObject(object: { [key: string]: any }): UserEntity {
      const { _id, id } = object;
      const userId = (id || _id)?.toString() || null;

      if (object.rol === Roles.COBRADOR && object.ruta) {
         object.ruta = object.ruta._id;
      }
      
      return new UserEntity({
         id: userId,
         nombre: object.nombre,
         username: object.username,
         rol: object.rol,
         empresa: object.empresa,
         estado: object.estado,
         ruta: object.ruta
      });

   }

}
