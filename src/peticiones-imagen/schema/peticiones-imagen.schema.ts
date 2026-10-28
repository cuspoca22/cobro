import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class FotoSolicitada {
  @Prop({ type: String, default: '' })
  anterior: string;

  @Prop({ type: String, required: true })
  nueva: string;
}

const FotoSolicitadaSchema = SchemaFactory.createForClass(FotoSolicitada);

@Schema({
  versionKey: false,
  collection: 'PeticionesImagen',
})
export class PeticionesImagen extends Document {
  @Prop({ type: FotoSolicitadaSchema })
  document_image?: FotoSolicitada;

  @Prop({ type: FotoSolicitadaSchema })
  business_image?: FotoSolicitada;

  @Prop({ type: FotoSolicitadaSchema })
  house_image?: FotoSolicitada;

  @Prop({
    required: true,
    type: String,
    enum: ['pendiente', 'aceptada', 'rechazada'],
    default: 'pendiente',
  })
  estado: string;

  @Prop({
    required: true,
    type: Date,
    default: Date.now,
  })
  fecha_solicitud: Date;

  @Prop({
    required: true,
    type: Date,
    default: Date.now,
  })
  fecha_actualizacion: Date;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  })
  id_usuario: Types.ObjectId;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
  })
  id_cliente: Types.ObjectId;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ruta',
  })
  id_ruta: Types.ObjectId;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Empresa',
  })
  id_empresa: Types.ObjectId;
}

export const PeticionesImagenSchema = SchemaFactory.createForClass(PeticionesImagen);

PeticionesImagenSchema.index(
  { id_cliente: 1 },
  { unique: true, partialFilterExpression: { estado: 'pendiente' } },
);
PeticionesImagenSchema.index({ id_empresa: 1, estado: 1, fecha_solicitud: -1 });
