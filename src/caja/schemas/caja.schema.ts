import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';

@Schema({
   versionKey: false,
   collection: 'cajas'
})
export class Caja {

   @Prop({
      type: Number,
      default: 0
   })
   base: number;

   @Prop({
      type: Date,
      required: true
   })
   fecha: Date;

   @Prop({
      type: Number,
      default: 0
   })
   inversion: number;

   @Prop({
      type: Number,
      default: 0
   })
   retiro: number;

   @Prop({
      type: Number,
      default: 0
   })
   gasto: number;

   @Prop({
      type: Number,
      default: 0
   })
   cobro: number;

   @Prop({
      type: Number,
      default: 0
   })
   prestamo: number;

   @Prop({
      type: Number,
      default: 0
   })
   total_clientes: number;

   @Prop({
      type: Number,
      default: 0
   })
   clientes_pendientes: number;

   @Prop({
      type: Number,
      default: 0
   })
   renovaciones: number;

   @Prop({
      type: Number,
      default: 0
   })
   caja_final: number;

   @Prop({
      type: Number,
      default: 0
   })
   pretendido: number;

   @Prop({
      type: Number,
      default: 0
   })
   extra: number;

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
