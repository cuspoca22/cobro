import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum WsAuthFailureReason {
  NO_TOKEN = 'NO_TOKEN',
  NO_SID = 'NO_SID',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_INACTIVE = 'USER_INACTIVE',
  NO_ACTIVE_SESSION = 'NO_ACTIVE_SESSION',
  SESSION_MISMATCH = 'SESSION_MISMATCH',
  NO_EMPRESA = 'NO_EMPRESA',
  JWT_EXPIRED = 'JWT_EXPIRED',
  JWT_INVALID = 'JWT_INVALID',
}

@Schema({
  versionKey: false,
  collection: 'ws_auth_events',
  timestamps: { createdAt: true, updatedAt: false },
})
export class WsAuthEvent extends Document {
  @Prop({
    type: String,
    enum: WsAuthFailureReason,
    required: true,
    index: true,
  })
  reason: WsAuthFailureReason;

  @Prop({ type: String, required: true, trim: true })
  message: string;

  @Prop({ type: String, required: false, index: true })
  userId?: string;

  @Prop({ type: String, required: false, trim: true })
  username?: string;

  @Prop({ type: String, required: false, trim: true })
  userNombre?: string;

  @Prop({ type: String, required: false })
  userRol?: string;

  @Prop({ type: String, required: false, index: true })
  empresaId?: string;

  @Prop({ type: Boolean, required: false })
  userEstado?: boolean;

  @Prop({ type: String, required: false })
  tokenSid?: string;

  @Prop({ type: Boolean, required: false })
  hasActiveSession?: boolean;

  @Prop({ type: Date, required: false })
  activeSessionExpiresAt?: Date;

  @Prop({ type: String, required: false })
  socketId?: string;

  @Prop({ type: String, required: false, trim: true })
  ipAddress?: string;

  @Prop({ type: String, required: false, trim: true })
  userAgent?: string;
}

export const WsAuthEventSchema = SchemaFactory.createForClass(WsAuthEvent);

WsAuthEventSchema.index({ createdAt: -1 });
WsAuthEventSchema.index({ reason: 1, createdAt: -1 });
/** Retención ~30 días para no crecer sin límite. */
WsAuthEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 },
);
