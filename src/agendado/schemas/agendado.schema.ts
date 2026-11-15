import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';

@Schema({ _id: false })
export class CondicionesAgendado {
  @Prop({ type: Number, required: true })
  valor_credito: number;

  @Prop({ type: Number, required: true })
  total_cuotas: number;

  @Prop({ type: String, required: true, enum: ['diario', 'semanal'] })
  frecuencia_cobro: string;

  @Prop({ type: String, required: true, enum: ['automatico', 'manual'] })
  modo: string;

  @Prop({ type: Number })
  interes?: number;

  @Prop({ type: Number })
  valor_cuota?: number;

  @Prop({ type: String, trim: true })
  observaciones?: string;
}

export const CondicionesAgendadoSchema = SchemaFactory.createForClass(CondicionesAgendado);

@Schema({ _id: false })
export class RecordatorioPayload {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  body: string;

  @Prop({ type: String, required: true })
  agendadoId: string;

  @Prop({ type: String, required: true })
  clienteId: string;
}

export const RecordatorioPayloadSchema = SchemaFactory.createForClass(RecordatorioPayload);

@Schema({ _id: false })
export class RecordatorioAgendado {
  @Prop({
    type: String,
    required: true,
    enum: ['programado', 'omitido', 'enviado'],
  })
  estado: string;

  /** `local` hoy. Pasa a `push` cuando el dispatcher de Firebase lo entregue. */
  @Prop({ type: String, required: true, default: 'local' })
  canal: string;

  @Prop({ type: RecordatorioPayloadSchema, required: true })
  payload: RecordatorioPayload;

  @Prop({ type: Number, default: 0 })
  intentos: number;

  @Prop({ type: Date })
  despachadoEn?: Date;
}

export const RecordatorioAgendadoSchema = SchemaFactory.createForClass(RecordatorioAgendado);

@Schema({
  collection: 'agendados',
  timestamps: true,
  versionKey: false,
})
export class Agendado {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true })
  cliente: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Ruta', required: true })
  ruta: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true })
  empresa: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  creadoPor: Types.ObjectId;

  /** Día de calendario YYYY-MM-DD en la zona de la ruta. */
  @Prop({ type: String, required: true })
  fechaVisita: string;

  /** Hora de pared HH:mm en la zona de la ruta. */
  @Prop({ type: String, required: true })
  horaRecordatorio: string;

  @Prop({ type: Date, required: true })
  recordarEn: Date;

  @Prop({ type: CondicionesAgendadoSchema, required: true })
  condiciones: CondicionesAgendado;

  @Prop({
    type: String,
    required: true,
    enum: ['pendiente', 'cumplido', 'cancelado'],
    default: 'pendiente',
  })
  estado: string;

  @Prop({ type: Date })
  cumplidoEn?: Date;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  creditoId?: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  movimientoId?: Types.ObjectId;

  @Prop({ type: Date })
  canceladoEn?: Date;

  @Prop({ type: RecordatorioAgendadoSchema, required: true })
  recordatorio: RecordatorioAgendado;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AgendadoSchema = SchemaFactory.createForClass(Agendado);

AgendadoSchema.index(
  { cliente: 1 },
  {
    unique: true,
    partialFilterExpression: { estado: 'pendiente' },
    name: 'unique_agendado_pendiente_por_cliente',
  },
);
AgendadoSchema.index({ ruta: 1, estado: 1, fechaVisita: 1 });
AgendadoSchema.index({ empresa: 1, estado: 1, fechaVisita: 1 });
AgendadoSchema.index({ 'recordatorio.estado': 1, recordarEn: 1 });
AgendadoSchema.index({ creditoId: 1, estado: 1 });
