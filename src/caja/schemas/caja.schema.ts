import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';

export type CajaDocument = HydratedDocument<Caja>;

@Schema({
   versionKey: false,
   collection: 'cajas',
   timestamps: true
})
export class Caja {

   @Prop({
      type: Number,
      default: 0,
   })
   base: number;

   @Prop({
      type: Date,
      required: true
   })
   fecha: Date;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   inversion: number;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   retiro: number;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   gasto: number;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   cobro: number;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   prestamo: number;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   total_clientes: number;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   clientes_pendientes: number;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   renovaciones: number;

   @Prop({
      type: Number,
      default: 0,
   })
   caja_final: number;

   @Prop({
      type: Number,
      default: 0,
      min: 0
   })
   pretendido: number;

   /** Mora cobrada en el día (desglose; no forma parte del pretendido). */
   @Prop({
      type: Number,
      default: 0,
      min: 0,
   })
   moraCobrada: number;

   /** Mora pendiente de cobro en créditos activos de la ruta (snapshot). */
   @Prop({
      type: Number,
      default: 0,
      min: 0,
   })
   moraPorCobrar: number;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ruta',
      required: true
   })
   ruta: Types.ObjectId;

   // Este estatus hace referencia a si la ruta esta abierta o cerrada
   // status: true -> abierta
   // status: false -> cerrada
   @Prop({
      type: Boolean,
      default: true
   })
   status: boolean;

}


export const CajaSchema = SchemaFactory.createForClass(Caja);

CajaSchema.index({ ruta: 1, fecha: -1 }, { unique: true });
CajaSchema.index({ status: 1 });
CajaSchema.index({ fecha: 1 });

