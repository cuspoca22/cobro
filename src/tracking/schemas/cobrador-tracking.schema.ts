import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class TrackingPunto {
  @Prop({ type: [Number], required: true })
  coordinates: number[];

  @Prop({ type: Date, required: true })
  at: Date;

  @Prop({ type: Number })
  accuracy?: number;
}

@Schema({
  versionKey: false,
  collection: 'cobrador_tracking',
})
export class CobradorTracking extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  cobrador: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Empresa',
    required: true,
    index: true,
  })
  empresa: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ruta',
  })
  ruta?: Types.ObjectId;

  /** Día lógico YYYY-MM-DD */
  @Prop({ type: String, required: true, index: true })
  fecha: string;

  @Prop({ type: [TrackingPunto], default: [] })
  puntos: TrackingPunto[];

  @Prop({ type: TrackingPunto })
  ultimaUbicacion?: TrackingPunto;
}

export const CobradorTrackingSchema =
  SchemaFactory.createForClass(CobradorTracking);

CobradorTrackingSchema.index({ cobrador: 1, fecha: 1 }, { unique: true });
CobradorTrackingSchema.index({ empresa: 1, fecha: 1 });
