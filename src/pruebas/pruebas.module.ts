import { Module } from '@nestjs/common';
import { PruebasService } from './pruebas.service';
import { PruebasController } from './pruebas.controller';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Credito, CreditoSchema } from 'src/credito/schemas/credito.schema';
import { RutaModule } from '../ruta/ruta.module';
import { CreditCalculatorService } from 'src/credito/helpers/credit.calculator.service';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';
import { MovimientoCaja, MovimientoCajaSchema } from 'src/movimientoCaja/schemas/caja-movimiento.schemas';
import { Caja, CajaSchema } from 'src/caja/schemas/caja.schema';
import { Cliente, ClienteSchema } from 'src/cliente/schema/cliente.schema';

@Module({
  imports: [
    ConfigModule,
    RutaModule,
    MongooseModule.forFeature([
      {
        name: Credito.name,
        schema: CreditoSchema
      },
      {
        name: Caja.name,
        schema: CajaSchema
      },
      {
        name: MovimientoCaja.name,
        schema: MovimientoCajaSchema
      },
      {
        name: Cliente.name,
        schema: ClienteSchema
      }
    ])
  ],
  controllers: [PruebasController],
  providers: [PruebasService, CreditCalculatorService, DateFnsAdapter]
})
export class PruebasModule { }
