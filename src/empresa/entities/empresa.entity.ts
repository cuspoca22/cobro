import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';
import { User } from 'src/auth/schemas/user.schema';

@Schema({
   versionKey: false,
   collection: 'empresas'
})
export class Empresa extends Document {

   @Prop({
      type: String,
      index: true,
      trim: true,
      uppercase: true
   })
   name: string;

   @Prop({
      type: String,
      trim: true
   })
   email: string;

   @Prop({ type: String })
   phone: string;

   @Prop({
      type: Number,
      default: 19
   })
   dayOfPay: number;

   @Prop({
      type: String,
      required: true,
      index: true
   })
   country: string;

   @Prop({
      type: Boolean,
      default: true
   })
   isSubscriptionPaid: boolean;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
   })
   owner: User;

   @Prop({
      type: [{
         type: mongoose.Schema.Types.ObjectId,
         ref: 'User'
      }]
   })
   employes: Types.ObjectId[];

   @Prop({
      type: [{
         type: mongoose.Schema.Types.ObjectId,
         ref: "Ruta"
      }]
   })
   rutas: Types.ObjectId[];

}

export const EmpresaSchema = SchemaFactory.createForClass(Empresa);
