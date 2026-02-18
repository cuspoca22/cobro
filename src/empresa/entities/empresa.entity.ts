import { UserEntity } from "src/auth/entities/user.entity";
import { RutaEntity } from "src/ruta/entities/ruta.entity";

export class EmpresaEntity {

   id: string;
   name: string;
   email: string;
   phone: string;
   dayOfPay: string;
   country: string;
   isSubscriptionPaid: boolean;
   owner: UserEntity;
   employes: UserEntity[];
   rutas: RutaEntity[];

   constructor(data?: Partial<EmpresaEntity>) {
      if (data) {
         Object.assign(this, data);
      }
   }

   static fromObject(object: { [key: string]: any }): EmpresaEntity {

      const { _id, id } = object;
      const empresaId = (id || _id)?.toString() || null;

      const empresa = new EmpresaEntity({
         id: empresaId,
         name: object.name,
         email: object.email,
         phone: object.phone,
         dayOfPay: object.dayOfPay,
         country: object.country,
         isSubscriptionPaid: object.isSubscriptionPaid,
         owner: UserEntity.fromObject(object.owner),
         employes: object.employes.map(employe => UserEntity.fromObject(employe)),
         rutas: object.rutas.map(ruta => RutaEntity.fromObject(ruta))
      });

      return empresa;

   }

}