import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from 'src/auth/auth.module';
import { RutaModule } from 'src/ruta/ruta.module';
import { TrackingModule } from 'src/tracking/tracking.module';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';

/**
 * V4b: sin forFeature(User); lectura vía AuthService.
 */
@Module({
  imports: [
    // Auth↔Empresa↔Message: AuthModule puede estar incompleto al evaluar este archivo
    forwardRef(() => AuthModule),
    forwardRef(() => RutaModule),
    forwardRef(() => TrackingModule),
  ],
  providers: [MessageGateway, MessageService],
  exports: [MessageService, MessageGateway],
})
export class MessageModule {}
