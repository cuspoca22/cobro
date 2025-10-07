import { Module } from '@nestjs/common';
import { CreditoService } from './credito.service';
import { CreditoController } from './credito.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Credito, CreditoSchema } from './schemas/credito.schema';
import { Cliente, ClienteSchema } from '../cliente/schema/cliente.schema';
import { CajaModule } from '../caja/caja.module';
import { AuthModule } from '../auth/auth.module';
import { ClienteModule } from '../cliente/cliente.module';
import { RutaSchema, Ruta } from 'src/ruta/schema/ruta.schema';
import { EmpresaModule } from '../empresa/empresa.module';
import { dateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { CreditCalculatorService } from './helpers/credit.calculator.service';
import { MovimientoCajaModule } from 'src/movimientoCaja/movimiento-caja.module';

@Module({
  imports: [
    AuthModule,
    ConfigModule,
    CajaModule,
    ClienteModule,
    EmpresaModule,
    MongooseModule.forFeature([
      {
        name: Credito.name,
        schema: CreditoSchema
      },
      {
        name: Cliente.name,
        schema: ClienteSchema
      },
      {
        name: Ruta.name,
        schema: RutaSchema
      }
    ])
  ],
  controllers: [CreditoController],
  providers: [
    CreditoService, 
    dateFnsAdapter, 
    CreditCalculatorService
  ],
  exports: [
    CreditoService, 
    MongooseModule,
  ]
})
export class CreditoModule {}
