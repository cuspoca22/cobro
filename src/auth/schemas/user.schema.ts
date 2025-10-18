import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose, {Document, Types} from "mongoose";
import { Ruta } from "src/ruta/schema/ruta.schema";

@Schema({
   versionKey: false,
   collection: 'users'
})
export class User extends Document {
   
   @Prop({
      type: String,
      index: true,
      required: true,
      uppercase: true,
      trim: true
   })
   nombre: string;

   @Prop({
      type: Boolean,
      required: true,
      default: true
   })
   estado: boolean;

   @Prop({
      type: String,
      index: true,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
   })
   username: string;

   @Prop({
      type: String,
      required: true,
   })
   password: string;

   @Prop({
      type: String,
      enum: ['ADMIN', 'SUPERADMIN', 'COBRADOR', 'SUPERVISOR', 'CLIENTE'],
      default: 'COBRADOR'
   })
   rol: string;
   
   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ruta"
   })
   ruta: Ruta;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa"
   })
   empresa: Types.ObjectId;

}

export const UserSchema = SchemaFactory.createForClass(User);
