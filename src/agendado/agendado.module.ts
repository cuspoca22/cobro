import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
import { ClienteModule } from 'src/cliente/cliente.module';
import { OwnershipModule } from 'src/common/ownership';
import { MessageModule } from 'src/message/message.module';
import { MovimientoCajaModule } from 'src/movimientoCaja/movimiento-caja.module';
import { RutaModule } from 'src/ruta/ruta.module';
import { AgendaClock } from './agenda-clock';
import { AgendadoController } from './agendado.controller';
import { AgendadoListener } from './agendado.listener';
import { AgendadoPushCron } from './agendado-push.cron';
import { AgendadoService } from './agendado.service';
import { DeviceTokenController } from './device-token.controller';
import { DeviceTokenService } from './device-token.service';
import { NoopPushDispatcher } from './push/noop-push-dispatcher';
import { PUSH_DISPATCHER } from './push/push-dispatcher';
import { Agendado, AgendadoSchema } from './schemas/agendado.schema';
import { DevicePushToken, DevicePushTokenSchema } from './schemas/device-push-token.schema';

/**
 * V4b: solo registra Agendado y DevicePushToken.
 * Cliente, ruta, usuario y movimientos se leen por sus services.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => ClienteModule),
    forwardRef(() => RutaModule),
    forwardRef(() => MovimientoCajaModule),
    forwardRef(() => MessageModule),
    forwardRef(() => OwnershipModule),
    MongooseModule.forFeature([
      { name: Agendado.name, schema: AgendadoSchema },
      { name: DevicePushToken.name, schema: DevicePushTokenSchema },
    ]),
  ],
  controllers: [AgendadoController, DeviceTokenController],
  providers: [
    AgendadoService,
    AgendadoListener,
    AgendadoPushCron,
    DeviceTokenService,
    AgendaClock,
    NoopPushDispatcher,
    { provide: PUSH_DISPATCHER, useExisting: NoopPushDispatcher },
  ],
  exports: [AgendadoService],
})
export class AgendadoModule {}
