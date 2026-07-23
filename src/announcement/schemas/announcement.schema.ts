import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

export enum AnnouncementType {
  UPDATE = 'UPDATE',
  PAYMENT_REMINDER = 'PAYMENT_REMINDER',
  WARNING = 'WARNING',
  INFO = 'INFO',
}

export enum AnnouncementSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum AnnouncementScope {
  GLOBAL = 'GLOBAL',
  EMPRESA = 'EMPRESA',
  MULTI = 'MULTI',
}

export enum AnnouncementAudience {
  ADMIN = 'ADMIN',
  SUPERVISOR = 'SUPERVISOR',
}

@Schema({
  versionKey: false,
  collection: 'announcements',
  timestamps: true,
})
export class Announcement extends Document {
  @Prop({ type: String, required: true, trim: true })
  title: string;

  @Prop({ type: String, required: true, trim: true })
  body: string;

  @Prop({
    type: String,
    enum: AnnouncementType,
    default: AnnouncementType.INFO,
  })
  type: AnnouncementType;

  @Prop({
    type: String,
    enum: AnnouncementSeverity,
    default: AnnouncementSeverity.INFO,
  })
  severity: AnnouncementSeverity;

  @Prop({
    type: String,
    enum: AnnouncementScope,
    default: AnnouncementScope.GLOBAL,
  })
  scope: AnnouncementScope;

  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Empresa' }],
    default: [],
  })
  empresaIds: Types.ObjectId[];

  @Prop({
    type: [String],
    enum: AnnouncementAudience,
    default: [AnnouncementAudience.ADMIN, AnnouncementAudience.SUPERVISOR],
  })
  audience: AnnouncementAudience[];

  @Prop({ type: Date, default: () => new Date() })
  startsAt: Date;

  @Prop({ type: Date, required: false })
  endsAt?: Date;

  @Prop({ type: Boolean, default: true })
  dismissible: boolean;

  @Prop({ type: Boolean, default: false })
  requiresAck: boolean;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy: Types.ObjectId;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
AnnouncementSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
AnnouncementSchema.index({ empresaIds: 1, isActive: 1 });
