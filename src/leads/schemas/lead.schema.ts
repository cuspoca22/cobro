import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  CONVERTED = 'CONVERTED',
  REJECTED = 'REJECTED',
}

@Schema({
  versionKey: false,
  collection: 'leads',
  timestamps: true,
})
export class Lead extends Document {
  @Prop({ type: String, required: true, trim: true })
  nombre: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ type: String, required: true, trim: true })
  phone: string;

  @Prop({ type: String, required: true, trim: true })
  empresaNombre: string;

  @Prop({ type: String, default: 'landing', trim: true })
  origen: string;

  @Prop({
    type: String,
    enum: LeadStatus,
    default: LeadStatus.NEW,
    index: true,
  })
  status: LeadStatus;

  @Prop({ type: String, required: false, trim: true })
  notas?: string;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Empresa',
    required: false,
  })
  empresaId?: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  })
  userId?: Types.ObjectId;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

LeadSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [LeadStatus.NEW, LeadStatus.CONTACTED] },
    },
  },
);

LeadSchema.index({ status: 1, createdAt: -1 });
