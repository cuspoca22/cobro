import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RegisterDeviceTokenDto, RevokeDeviceTokenDto } from './dto/register-device-token.dto';
import { DevicePushToken } from './schemas/device-push-token.schema';

@Injectable()
export class DeviceTokenService {
  constructor(
    @InjectModel(DevicePushToken.name)
    private readonly tokenModel: Model<DevicePushToken>,
  ) {}

  async register(userId: string, dto: RegisterDeviceTokenDto): Promise<{ ok: true }> {
    await this.tokenModel.updateOne(
      { token: dto.token },
      {
        $set: {
          user: new Types.ObjectId(userId),
          platform: dto.platform,
          app: dto.app,
          revokedAt: null,
        },
        $setOnInsert: { token: dto.token },
      },
      { upsert: true },
    );
    return { ok: true };
  }

  async revoke(userId: string, dto: RevokeDeviceTokenDto): Promise<{ ok: true }> {
    await this.tokenModel.updateOne(
      { token: dto.token, user: new Types.ObjectId(userId) },
      { $set: { revokedAt: new Date() } },
    );
    return { ok: true };
  }
}
