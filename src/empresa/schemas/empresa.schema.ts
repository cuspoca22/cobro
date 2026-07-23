import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';
import { User } from 'src/auth/schemas/user.schema';
import { Ruta } from '../../ruta/schema/ruta.schema';
import { BaseCalculoMora } from '../interfaces';

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

   /** Días de gracia después de dayOfPay antes de considerarse vencida. */
   @Prop({
      type: Number,
      default: 3,
      min: 0,
   })
   subscriptionGraceDays: number;

   /** Corte manual de acceso (SUPERADMIN). Bloquea admin + cobrov2. */
   @Prop({
      type: Boolean,
      default: false,
      index: true,
   })
   accessSuspended: boolean;

   @Prop({ type: Date, required: false })
   accessSuspendedAt?: Date;

   @Prop({
      type: String,
      enum: ['PAYMENT', 'MANUAL'],
      required: false,
   })
   accessSuspendedReason?: 'PAYMENT' | 'MANUAL';

   /** Master switch: si false, la empresa no opera con mora. */
   @Prop({
      type: Boolean,
      default: false,
   })
   cobraMora: boolean;

   /** Si true, el cobrador puede decidir un monto de mora a voluntad. */
   @Prop({
      type: Boolean,
      default: false,
   })
   permiteMoraVoluntaria: boolean;

   /** Porcentaje de mora sobre la base configurada. */
   @Prop({
      type: Number,
      default: 0,
      min: 0,
   })
   porcentajeMora: number;

   /** Base sobre la cual se calcula el % de mora. */
   @Prop({
      type: String,
      enum: BaseCalculoMora,
      default: BaseCalculoMora.VALOR_CUOTA,
   })
   baseCalculoMora: BaseCalculoMora;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
   })
   owner: User | Types.ObjectId;

   @Prop({
      type: [{
         type: mongoose.Schema.Types.ObjectId,
         ref: 'User'
      }]
   })
   employes: Types.ObjectId[] | User[];

   @Prop({
      type: [{
         type: mongoose.Schema.Types.ObjectId,
         ref: "Ruta"
      }]
   })
   rutas: Types.ObjectId[] | Ruta[];

}

export const EmpresaSchema = SchemaFactory.createForClass(Empresa);
