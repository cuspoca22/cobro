import { Injectable, Logger } from '@nestjs/common';

export interface CurrencyConfig {
  code: string;               // Código ISO 4217 (ej. COP)
  name: string;                // Nombre completo
  symbol: string;              // Símbolo monetario (ej. $)
  decimalPlaces: number;       // Número de decimales (0 para COP, 2 para BRL)
  minorUnitFactor: number;     // Factor para convertir a unidad mínima (1 para COP, 100 para BRL)
  roundingRule: 'half-up';     // Regla de redondeo (siempre half-up)
  locale: string;              // Locale para formateo (ej. es-CO)
}

/**
 * Servicio de Currency
 * Centraliza la lógica de formateo, redondeo y consulta
 * de configuración de monedas soportadas por la aplicación.
 */
@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  private readonly currencies: Record<string, CurrencyConfig> = {
    COP: {
      code: 'COP',
      name: 'Peso colombiano',
      symbol: '$',
      decimalPlaces: 0,
      minorUnitFactor: 1,
      roundingRule: 'half-up',
      locale: 'es-CO',
    },
    BRL: {
      code: 'BRL',
      name: 'Real brasileño',
      symbol: 'R$',
      decimalPlaces: 2,
      minorUnitFactor: 100,
      roundingRule: 'half-up',
      locale: 'pt-BR',
    },
    GTQ: {
      code: 'GTQ',
      name: 'Quetzal guatemalteco',
      symbol: 'Q',
      decimalPlaces: 2,
      minorUnitFactor: 100,
      roundingRule: 'half-up',
      locale: 'es-GT',
    },
  };

  /**
   * Obtiene la configuración completa de una moneda por su código.
   * @param code - Código ISO de la moneda (COP, BRL, GTQ)
   * @returns Información de la moneda solicitada
   */
  getCurrencyConfig(currencyCode: string): CurrencyConfig {
    const config = this.currencies[currencyCode.toUpperCase()];
    if (!config) {
      throw new Error(`Moneda no soportada: ${currencyCode}`);
    }
    return config;
  }

  /**
   * Devuelve la lista de todas las monedas soportadas.
   */
  getAllCurrencies(): CurrencyConfig[] {
    return Object.values(this.currencies);
  }

  /**
   * Verifica si una moneda está soportada.
   */
  isSupported(currencyCode: string): boolean {
    return !!this.currencies[currencyCode.toUpperCase()];
  }
}
