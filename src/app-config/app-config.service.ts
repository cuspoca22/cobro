import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { UpdateAppConfigDto } from './dto';
import { AppConfig } from './schemas/app-config.schema';

const DEFAULT_PLATFORM = 'android';
const DEFAULT_STORE_URL =
  'https://play.google.com/store/apps/details?id=lat.nathyappv2.cobrador';
const DEFAULT_MESSAGE = 'Debes actualizar la aplicación para continuar.';

export type AppConfigPublic = {
  platform: string;
  minVersionCode: number;
  latestVersionCode: number;
  forceUpdate: boolean;
  storeUrl: string;
  message: string;
};

@Injectable()
export class AppConfigService {
  constructor(
    @InjectModel(AppConfig.name)
    private readonly appConfigModel: Model<AppConfig>,
  ) {}

  async getOrCreate(platform = DEFAULT_PLATFORM): Promise<AppConfigPublic> {
    let doc = await this.appConfigModel.findOne({ platform }).lean();

    if (!doc) {
      doc = (
        await this.appConfigModel.create({
          platform,
          minVersionCode: 24,
          latestVersionCode: 24,
          forceUpdate: true,
          storeUrl: DEFAULT_STORE_URL,
          message: DEFAULT_MESSAGE,
        })
      ).toObject();
    }

    return this.toPublic(doc);
  }

  async update(
    dto: UpdateAppConfigDto,
    platform = DEFAULT_PLATFORM,
  ): Promise<AppConfigPublic> {
    await this.getOrCreate(platform);

    const updated = await this.appConfigModel
      .findOneAndUpdate(
        { platform },
        { $set: dto },
        { returnDocument: 'after' },
      )
      .lean();

    return this.toPublic(updated);
  }

  /**
   * true si el cliente debe forzar actualización.
   * Sin header o valor inválido → no bloquea (evita romper clientes admin/web).
   */
  async shouldForceUpdate(versionCodeHeader?: string): Promise<{
    force: boolean;
    config: AppConfigPublic;
  }> {
    const config = await this.getOrCreate();
    const versionCode = Number.parseInt(versionCodeHeader ?? '', 10);

    if (!Number.isFinite(versionCode) || versionCode < 1) {
      return { force: false, config };
    }

    const force =
      config.forceUpdate === true && versionCode < config.minVersionCode;

    return { force, config };
  }

  private toPublic(doc: any): AppConfigPublic {
    return {
      platform: doc.platform,
      minVersionCode: doc.minVersionCode,
      latestVersionCode: doc.latestVersionCode,
      forceUpdate: doc.forceUpdate,
      storeUrl: doc.storeUrl,
      message: doc.message,
    };
  }
}
