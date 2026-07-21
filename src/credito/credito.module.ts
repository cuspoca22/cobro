import { Module, forwardRef } from '@nestjs/common';
import { CreditoService } from './credito.service';
import { CreditoController } from './credito.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Credito, CreditoSchema } from './schemas/credito.schema';
import { MoraAplicacion, MoraAplicacionSchema } from './schemas/mora-aplicacion.schema';
import { AuthModule } from '../auth/auth.module';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { OwnershipModule } from 'src/common/ownership';
import { ClienteModule } from '../cliente/cliente.module';
import { RutaModule } from '../ruta/ruta.module';
import { EmpresaModule } from '../empresa/empresa.module';
import { MessageModule } from '../message/message.module';

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
    forwardRef(() => EmpresaModule),
    forwardRef(() => MessageModule),
    MongooseModule.forFeature([
      {
        name: Credito.name,
        schema: CreditoSchema
      },
      {
        name: MoraAplicacion.name,
        schema: MoraAplicacionSchema,
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
    CreditCalculatorService,
    MongooseModule,
  ]
})
export class CreditoModule { }
