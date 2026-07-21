import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';

export type MoraAplicacionDocument = HydratedDocument<MoraAplicacion>;

export enum TipoMoraAplicacion {
  APLICAR = 'APLICAR',
  PERDONAR = 'PERDONAR',
}

@Schema({
  versionKey: false,
  timestamps: true,
  collection: 'moraAplicaciones',
})
export class MoraAplicacion {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Credito',
    required: true,
    index: true,
  })
  credito: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  usuario: Types.ObjectId;

  @Prop({
    type: String,
    enum: TipoMoraAplicacion,
    required: true,
  })
  tipo: TipoMoraAplicacion;

  @Prop({
    type: Number,
    required: true,
    min: 0,
  })
  monto: number;

  @Prop({
    type: String,
    trim: true,
  })
  motivo?: string;

  @Prop({
    type: Number,
    required: true,
  })
  mora_adeudada_antes: number;

  @Prop({
    type: Number,
    required: true,
  })
  mora_adeudada_despues: number;
}

export const MoraAplicacionSchema = SchemaFactory.createForClass(MoraAplicacion);

MoraAplicacionSchema.index({ credito: 1, createdAt: -1 });
