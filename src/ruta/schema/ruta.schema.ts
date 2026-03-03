import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from "mongoose";
import { Currency } from 'src/currency/interfaces/currency.enum';

@Schema({
   versionKey: false,
   collection: 'rutas'
})
export class Ruta extends Document {

   @Prop({
      type: String,
      required: true,
      index: true,
      trim: true,
      uppercase: true
   })
   nombre: string

   @Prop({
      type: String,
      required: true,
   })
   ciudad: string;

   @Prop({
      type: Boolean,
      default: false
   })
   status: boolean

   @Prop({
      type: Boolean,
      default: false
   })
   isLocked: boolean;

   @Prop({
      type: String
   })
   pais: string;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Empresa'
   })
   empresa: Types.ObjectId;

   @Prop({ type: Boolean, required: true })
   autoOpen: boolean;

   @Prop({
      type: String,
   })
   timeZone: string;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Caja'
   })
   ultima_caja: Types.ObjectId;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Caja'
   })
   caja_actual: Types.ObjectId;

   @Prop({
      type: String,
      required: true,
      enum: Currency
   })
   currency: string;
}

export const RutaSchema = SchemaFactory.createForClass(Ruta);
