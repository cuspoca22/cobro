import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { CajaController } from './caja.controller';
import { CajaService } from './caja.service';
import { Caja, CajaSchema } from './schemas/caja.schema';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { AuthModule } from '../auth/auth.module';
import { OwnershipModule } from 'src/common/ownership/ownership.module';
import { CreditoModule } from '../credito/credito.module';
import { CurrencyModule } from '../currency/currency.module';
import { MovimientoCajaModule } from '../movimientoCaja/movimiento-caja.module';
import { RutaModule } from '../ruta/ruta.module';

/**
 * V4b: solo registra Caja. Ruta vía RutaModule (findOperacionContextById).
 * Ownership/Auth con forwardRef por ciclo Auth↔Caja↔Ownership↔Credito.
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    forwardRef(() => OwnershipModule),
    CurrencyModule,
    forwardRef(() => CreditoModule),
    forwardRef(() => MovimientoCajaModule),
    forwardRef(() => RutaModule),
    MongooseModule.forFeature([
      {
        name: Caja.name,
        schema: CajaSchema
      },
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
