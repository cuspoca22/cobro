import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { RutaService } from './ruta.service';
import { RutaController } from './ruta.controller';
import { Ruta, RutaSchema } from './schema/ruta.schema';
import { AuthModule } from 'src/auth/auth.module';
import { Credito, CreditoSchema } from '../credito/schemas/credito.schema';
import { Cliente, ClienteSchema } from '../cliente/schema/cliente.schema';
import { Caja, CajaSchema } from '../caja/schemas/caja.schema';
import { MessageModule } from 'src/message/message.module';
import { CajaModule } from '../caja/caja.module';
import { dateFnsAdapter } from 'src/common/wrappers/date-fns.adapter';

@Module({
  imports: [
    ConfigModule,
    CajaModule,
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([
      {
        name: Ruta.name,
        schema: RutaSchema
      },
      {
        name: Credito.name,
        schema: CreditoSchema
      },
      {
        name: Cliente.name,
        schema: ClienteSchema
      },
      {
        name: Caja.name,
        schema: CajaSchema
      }
    ]),
    MessageModule,
  ],
  controllers: [RutaController],
  providers: [RutaService, dateFnsAdapter],
  exports: [RutaService, MongooseModule]
})
export class RutaModule {}
