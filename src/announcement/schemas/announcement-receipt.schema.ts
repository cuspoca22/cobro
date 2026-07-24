import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

@Schema({
  versionKey: false,
  collection: 'announcement_receipts',
  timestamps: true,
})
export class AnnouncementReceipt extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Announcement',
    required: true,
    index: true,
  })
  announcementId: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  /** Primera vez que el usuario abrió/vió el aviso. */
  @Prop({ type: Date, required: false })
  readAt?: Date;

  @Prop({ type: Date, required: false })
  dismissedAt?: Date;

  @Prop({ type: Date, required: false })
  acknowledgedAt?: Date;
}

export const AnnouncementReceiptSchema =
  SchemaFactory.createForClass(AnnouncementReceipt);

AnnouncementReceiptSchema.index(
  { announcementId: 1, userId: 1 },
  { unique: true },
);
