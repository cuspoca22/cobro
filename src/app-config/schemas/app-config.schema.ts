import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  versionKey: false,
  collection: 'app_config',
  timestamps: true,
})
export class AppConfig extends Document {
  @Prop({ type: String, required: true, unique: true, default: 'android' })
  platform: string;

  @Prop({ type: Number, required: true, default: 24 })
  minVersionCode: number;

  @Prop({ type: Number, required: true, default: 24 })
  latestVersionCode: number;

  @Prop({ type: Boolean, required: true, default: true })
  forceUpdate: boolean;

  @Prop({
    type: String,
    required: true,
    default:
      'https://play.google.com/store/apps/details?id=lat.nathyappv2.cobrador',
  })
  storeUrl: string;

  @Prop({
    type: String,
    required: true,
    default: 'Debes actualizar la aplicación para continuar.',
  })
  message: string;
}

export const AppConfigSchema = SchemaFactory.createForClass(AppConfig);
