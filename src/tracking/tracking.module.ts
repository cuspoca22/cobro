import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
import { RutaModule } from 'src/ruta/ruta.module';
import {
  CobradorTracking,
  CobradorTrackingSchema,
} from './schemas/cobrador-tracking.schema';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

/**
 * V4b: solo registra CobradorTracking. User/Ruta vía AuthService/RutaService.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => RutaModule),
    MongooseModule.forFeature([
      { name: CobradorTracking.name, schema: CobradorTrackingSchema },
    ]),
  ],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService, MongooseModule],
})
export class TrackingModule {}
