import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { Caja, CajaSchema } from './schemas/caja.schema';
import { Credito, CreditoSchema } from '../credito/schemas/credito.schema';
import { Cliente, ClienteSchema } from '../cliente/schema/cliente.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { MovimientoCaja, MovimientoCajaSchema } from 'src/movimientoCaja/schemas/caja-movimiento.schemas';
import { Ruta, RutaSchema } from '../ruta/schema/ruta.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    MongooseModule.forFeature([
      {
        name: Caja.name,
        schema: CajaSchema
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
        name: MovimientoCaja.name,
        schema: MovimientoCajaSchema
      },
      {
        name: Ruta.name,
        schema: RutaSchema
      }
    ])
  ],
  controllers: [CajaController],
  providers: [
    CajaService,
    DateFnsAdapter,
  ],
  exports: [CajaService, MongooseModule]
})
export class CajaModule { }
