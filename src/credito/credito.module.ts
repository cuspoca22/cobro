import { Module, forwardRef } from '@nestjs/common';
import { CreditoService } from './credito.service';
import { CreditoController } from './credito.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Credito, CreditoSchema } from './schemas/credito.schema';
import { AuthModule } from '../auth/auth.module';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { OwnershipModule } from 'src/common/ownership';
import { ClienteModule } from '../cliente/cliente.module';
import { RutaModule } from '../ruta/ruta.module';

/**
 * V4b: Cliente/Ruta vía módulos dueños (ya no forFeature ajenos).
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    ConfigModule,
    forwardRef(() => OwnershipModule),
    forwardRef(() => ClienteModule),
    forwardRef(() => RutaModule),
    MongooseModule.forFeature([
      {
        name: Credito.name,
        schema: CreditoSchema
      },
    ])
  ],
  controllers: [CreditoController],
  providers: [
    CreditoService,
    DateFnsAdapter,
    CreditCalculatorService
  ],
  exports: [
    CreditoService,
    MongooseModule,
  ]
})
export class CreditoModule { }
