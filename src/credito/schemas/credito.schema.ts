import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { ClasificacionCliente, FrecuenciaCobro } from '../interfaces';

/** Tipo de documento hidratado de Mongoose para Credito */
export type CreditoDocument = HydratedDocument<Credito>;

@Schema({
   versionKey: false,
   collection: 'creditos'
})
export class Credito {

   /** Indica si el crédito está activo (true) o saldado (false) */
   @Prop({
      type: Boolean,
      default: true
   })
   status: boolean;

   /** Monto original del crédito otorgado */
   @Prop({
      type: Number,
      required: true,
      min: 0
   })
   valor_credito: number;

   /** Porcentaje de interés aplicado al crédito */
   @Prop({
      type: Number,
      required: true,
      min: 0
   })
   interes: number;

   /** Número total de cuotas pactadas para el pago del crédito */
   @Prop({
      type: Number,
      required: true,
      min: 1
   })
   total_cuotas: number;

   /** Monto total a pagar (capital + intereses) */
   @Prop({
      type: Number,
      required: true,
      min: 0
   })
   total_pagar: number;

   /** Valor de cada cuota individual */
   @Prop({
      type: Number,
      required: true,
      min: 0
   })
   valor_cuota: number;

   /** Fecha en la que se otorgó el crédito */
   @Prop({
      type: Date,
      required: true
   })
   fecha_inicio: Date;

   /** Referencia al cliente titular del crédito */
   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente',
      required: true
   })
   cliente: Types.ObjectId;

   /** Referencia a la ruta a la que pertenece el crédito */
   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ruta',
      required: true
   })
   ruta: Types.ObjectId;

   /** Notas u observaciones adicionales sobre el crédito */
   @Prop({
      type: String
   })
   observaciones: string;

   /** Orden de cobro del crédito dentro de la ruta */
   @Prop({
      type: Number,
      default: 1,
   })
   turno: number;

   /** Periodicidad con la que se realiza el cobro */
   @Prop({
      type: String,
      enum: FrecuenciaCobro,
      default: FrecuenciaCobro.DIARIO
   })
   frecuencia_cobro: FrecuenciaCobro;

   /** Clasificación de morosidad del cliente en este crédito */
   @Prop({
      type: String,
      enum: ClasificacionCliente,
      default: ClasificacionCliente.BUENO
   })
   state: ClasificacionCliente;

   /** Fecha del último pago registrado (se actualiza al procesar un abono) */
   @Prop({
      type: Date,
      default: null
   })
   ultimo_pago: Date;

   /** Fecha límite de pago calculada a partir de las cuotas */
   @Prop({
      type: Date,
      required: true,
      index: true
   })
   dueDate: Date;
}

export const CreditoSchema = SchemaFactory.createForClass(Credito);

/** Índice compuesto para consultas de ruta ordenadas por fecha límite */
CreditoSchema.index({ ruta: 1, dueDate: 1 });
/** Índice compuesto para filtrar créditos activos por ruta */
CreditoSchema.index({ ruta: 1, status: 1 });

// FIX [P0 renovación]: como máximo un crédito activo (status:true) por cliente.
// Reemplaza el índice no-único {cliente, status} que no enforceaba la invariante de negocio.
CreditoSchema.index(
  { cliente: 1 },
  {
    unique: true,
    partialFilterExpression: { status: true },
    name: 'unique_credito_activo_por_cliente',
  },
);
