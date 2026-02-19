import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { Caja, CajaSchema } from './schemas/caja.schema';
import { Credito, CreditoSchema } from '../credito/schemas/credito.schema';
import { Cliente, ClienteSchema } from '../cliente/schema/cliente.schema';
import { CierreCaja, CierreCajaSchema } from './schemas/cierre_caja.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { MovimientoCaja, MovimientoCajaSchema } from 'src/movimientoCaja/schemas/caja-movimiento.schemas';
import { Ruta, RutaSchema } from '../ruta/schema/ruta.schema';

@Module({
  imports: [
    ConfigModule,
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
        name: CierreCaja.name,
        schema: CierreCajaSchema
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
