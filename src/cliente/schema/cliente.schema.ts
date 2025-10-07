import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import mongoose, {Document} from "mongoose";

import { Ruta } from '../../ruta/schema/ruta.schema';

@Schema({
   versionKey: false,
   collection: 'clientes'
})
export class Cliente extends Document {
   @Prop({
      type: Boolean,
      default: false
   })
   status: boolean; 

   @Prop({
      type: Boolean,
      default: true
   })
   state: boolean; 
   
   @Prop({
      type: String,
      required: true,
      trim: true,
      index: true
   })
   dpi: string;

   @Prop({
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
   })
   nombre: string;

   @Prop({
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
   })
   alias: string; 

   @Prop({
      type: String,
      required: true,
      uppercase: true,
      trim: true,
   })
   ciudad: string

   @Prop({
      type: String,
      required: true,
      uppercase: true,
      trim: true,
   })
   direccion: string;

   @Prop({
      type: [Number],
   })
   ubication: number[]

   @Prop({
      type: String,
      required: true,
      trim: true
   })
   telefono: string;
   
   @Prop({
      type: String,
      trim: true
   })
   img: string;
   
   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ruta'
   })
   ruta: Ruta 

   @Prop({
      type: String,
   })
   document_image: string;

   @Prop({
      type: String,
   })
   business_image: string;

   @Prop({
      type: String,
   })
   house_image: string;

   @Prop({
      type: Number,
      default: 0
   })
   turno: number;
}

export const ClienteSchema = SchemaFactory.createForClass(Cliente)