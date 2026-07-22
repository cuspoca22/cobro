import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
import { User, UserSchema } from 'src/auth/schemas/user.schema';
import { RutaModule } from 'src/ruta/ruta.module';
import { TrackingModule } from 'src/tracking/tracking.module';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';

@Module({
  imports: [
    // Auth↔Empresa↔Message: AuthModule puede estar incompleto al evaluar este archivo
    forwardRef(() => AuthModule),
    forwardRef(() => RutaModule),
    forwardRef(() => TrackingModule),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  providers: [MessageGateway, MessageService],
  exports: [MessageService, MessageGateway],
})
export class MessageModule {}
