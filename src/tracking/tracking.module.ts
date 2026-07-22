import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
import { User, UserSchema } from 'src/auth/schemas/user.schema';
import { Ruta, RutaSchema } from 'src/ruta/schema/ruta.schema';
import {
  CobradorTracking,
  CobradorTrackingSchema,
} from './schemas/cobrador-tracking.schema';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      { name: CobradorTracking.name, schema: CobradorTrackingSchema },
      { name: User.name, schema: UserSchema },
      { name: Ruta.name, schema: RutaSchema },
    ]),
  ],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService, MongooseModule],
})
export class TrackingModule {}
