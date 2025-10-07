import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';
import { ClasificacionCliente, FrecuenciaCobro } from '../interfaces';

@Schema({
   versionKey: false,
   collection: 'creditos'
})
export class Credito extends Document {

   @Prop({
      type: Boolean,
      default: true
   })
   status: boolean;

   @Prop({
      type: Number,
      required: true
   })
   valor_credito: number;
   
   @Prop({
      type: Number,
      required: true
   })
   interes: number;

   @Prop({
      type: Number,
      required: true
   })
   total_cuotas: number

   @Prop({
      type: Number,
      required: true
   })
   total_pagar: number;

   @Prop({
      type: Number,
      required: true
   })
   valor_cuota: number;

   @Prop({
      type: Date,
   })
   fecha_inicio: Date;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente'
   })
   cliente: Types.ObjectId;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ruta'
   })
   ruta: Types.ObjectId; 
   
   @Prop({
      type: Date,
   })
   ultimo_pago: Date;

   @Prop({
      type: String
   })
   observaciones: string;

   // Turno hace referencia al orden en el que se paga el credito, es decir el turno de la ruta
   @Prop({
      type: Number,
      default: 1,
   })
   turno: number;
   
   @Prop({
      type: String,
      enum: FrecuenciaCobro,
      default: FrecuenciaCobro.DIARIO
   })
   frecuencia_cobro: string;

   // hace referencia a la morosidad del cliente
   @Prop({
      type: String,
      enum: ClasificacionCliente,
      default: ClasificacionCliente.BUENO
   })
   state: string;

   // fecha limite de pago
   // este campo es calculado
   @Prop({
      type: Date,
      required: true,
      index: true
   })
   dueDate: Date;
}

export const CreditoSchema = SchemaFactory.createForClass(Credito);

CreditoSchema.index({ cliente: 1, status: 1 });
CreditoSchema.index({ ruta: 1, payment_status: 1 });
CreditoSchema.index({ dueDate: 1, payment_status: 1 });
