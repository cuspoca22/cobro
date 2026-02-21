import { Global, Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';

/**
 * Módulo de Currency
 * Encapsula la lógica de configuración y manejo de monedas.
 * Exporta el servicio para que otros módulos puedan consumirlo.
 */
@Global()
@Module({
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule { }
