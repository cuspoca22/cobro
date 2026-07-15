import { Module } from '@nestjs/common';
import { PruebasService } from './pruebas.service';
import { PruebasController } from './pruebas.controller';
import { ConfigModule } from '@nestjs/config';
import { RutaModule } from '../ruta/ruta.module';
import { CreditCalculatorService } from 'src/credito/helpers/credit.calculator.service';
import { DateFnsAdapter } from '../common/wrappers/date-fns.adapter';

/** Vertical 4: sin forFeature muerto (Credito no se usaba). */
@Module({
  imports: [
    ConfigModule,
    RutaModule,
  ],
  controllers: [PruebasController],
  providers: [PruebasService, CreditCalculatorService, DateFnsAdapter]
})
export class PruebasModule { }
