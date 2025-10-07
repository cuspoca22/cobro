export class RutaEntity {
   id: string;
   nombre: string;
   ciudad: string;
   status: boolean;
   isLocked: boolean;
   pais: string;
   empresa: string;
   autoOpen: boolean;
   timeZone: string;
   ultima_caja: string;
   caja_actual: string;
   _id?: string;

   constructor(data?: Partial<RutaEntity>) {
      if (data) {
         Object.assign(this, data);
      }
   }

   static fromObject(object: { [key: string]: any }): RutaEntity {

      const { _id, id } = object;

      const rutaId = (id || _id)?.toString() || null;

      const ruta = new RutaEntity({
         id: rutaId,
         nombre: object.nombre,
         ciudad: object.ciudad,
         status: object.status,
         isLocked: object.isLocked,
         pais: object.pais,
         empresa: object.empresa,
         autoOpen: object.autoOpen,
         timeZone: object.timeZone,
         ultima_caja: object.ultima_caja,
         caja_actual: object.caja_actual,
      });

      return ruta;
   }
}