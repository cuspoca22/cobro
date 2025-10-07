import { Module } from '@nestjs/common';
import { LogAuthService } from './log-auth.service';
import { LogAuthController } from './log-auth.controller';

@Module({
  controllers: [LogAuthController],
  providers: [LogAuthService]
})
export class LogAuthModule {}
