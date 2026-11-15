import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';

/**
 * Token de dispositivo listo para FCM. Ninguna app lo registra todavía.
 */
@Schema({
  collection: 'device_push_tokens',
  timestamps: true,
  versionKey: false,
})
export class DevicePushToken {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true })
  token: string;

  @Prop({ type: String, required: true, enum: ['android', 'ios', 'web'] })
  platform: string;

  @Prop({ type: String, required: true, enum: ['cobrador', 'admin'] })
  app: string;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;
}

export const DevicePushTokenSchema = SchemaFactory.createForClass(DevicePushToken);
