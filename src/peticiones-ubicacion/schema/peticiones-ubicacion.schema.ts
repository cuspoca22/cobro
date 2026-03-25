import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose, { Document, Types } from "mongoose";

@Schema({
  versionKey: false,
  collection: 'Peticiones'
})
export class PeticionesUbicacion extends Document {

  @Prop({
    type: [Number],
  })
  old_ubicacion?: number[];

  @Prop({
    required: true,
    type: [Number],
  })
  new_ubicacion: number[];

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
    ref: 'User'
  })
  id_usuario: Types.ObjectId;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente'
  })
  id_cliente: Types.ObjectId;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ruta'
  })
  id_ruta: Types.ObjectId;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Empresa'
  })
  id_empresa: Types.ObjectId;
}

export const PeticionesUbicacionSchema = SchemaFactory.createForClass(PeticionesUbicacion);