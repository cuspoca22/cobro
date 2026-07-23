import { UserEntity } from "src/auth/entities/user.entity";
import { RutaEntity } from "src/ruta/entities/ruta.entity";
import { BaseCalculoMora } from "../interfaces";
import {
   computeSubscriptionStatus,
   SubscriptionStatus,
} from "../interfaces/subscription-status";

export class EmpresaEntity {

   id: string;
   name: string;
   email: string;
   phone: string;
   dayOfPay: number;
   country: string;
   isSubscriptionPaid: boolean;
   subscriptionGraceDays: number;
   accessSuspended: boolean;
   accessSuspendedAt?: Date | null;
   accessSuspendedReason?: 'PAYMENT' | 'MANUAL' | null;
   subscriptionStatus: SubscriptionStatus;
   daysPastDue: number;
   cobraMora: boolean;
   permiteMoraVoluntaria: boolean;
   porcentajeMora: number;
   baseCalculoMora: BaseCalculoMora;
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

      const snap = computeSubscriptionStatus({
         dayOfPay: object.dayOfPay,
         isSubscriptionPaid: object.isSubscriptionPaid,
         subscriptionGraceDays: object.subscriptionGraceDays,
         accessSuspended: object.accessSuspended,
      });

      const empresa = new EmpresaEntity({
         id: empresaId,
         name: object.name,
         email: object.email,
         phone: object.phone,
         dayOfPay: snap.dayOfPay,
         country: object.country,
         isSubscriptionPaid: snap.isSubscriptionPaid,
         subscriptionGraceDays: snap.graceDays,
         accessSuspended: snap.accessSuspended,
         accessSuspendedAt: object.accessSuspendedAt ?? null,
         accessSuspendedReason: object.accessSuspendedReason ?? null,
         subscriptionStatus: snap.status,
         daysPastDue: snap.daysPastDue,
         cobraMora: object.cobraMora ?? false,
         permiteMoraVoluntaria: object.permiteMoraVoluntaria ?? false,
         porcentajeMora: object.porcentajeMora ?? 0,
         baseCalculoMora: object.baseCalculoMora ?? BaseCalculoMora.VALOR_CUOTA,
         owner: object.owner ? UserEntity.fromObject(object.owner) : null,
         employes: Array.isArray(object.employes)
            ? object.employes.map(employe => UserEntity.fromObject(employe))
            : [],
         rutas: Array.isArray(object.rutas)
            ? object.rutas.map(ruta => RutaEntity.fromObject(ruta))
            : [],
      });

      return empresa;

   }

}
