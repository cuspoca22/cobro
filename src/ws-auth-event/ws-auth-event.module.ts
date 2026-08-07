import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
import {
  WsAuthEvent,
  WsAuthEventSchema,
} from './schemas/ws-auth-event.schema';
import { WsAuthEventController } from './ws-auth-event.controller';
import { WsAuthEventService } from './ws-auth-event.service';

/**
 * V4b: solo registra WsAuthEvent.
 * Enriquecimiento de usuario vía AuthService desde MessageGateway (no InjectModel User).
 * forwardRef(Auth): Auth → Message → WsAuthEvent → Auth.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: WsAuthEvent.name, schema: WsAuthEventSchema },
    ]),
  ],
  controllers: [WsAuthEventController],
  providers: [WsAuthEventService],
  exports: [WsAuthEventService],
})
export class WsAuthEventModule {}
