import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig, AppConfigSchema } from './schemas/app-config.schema';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: AppConfig.name, schema: AppConfigSchema },
    ]),
  ],
  controllers: [AppConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
