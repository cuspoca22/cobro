import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';

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
    MXN: {
      code: 'MXN',
      name: 'Peso mexicano',
      symbol: '$',
      decimalPlaces: 2,
      minorUnitFactor: 100,
      roundingRule: 'half-up',
      locale: 'es-MX',
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

  /**
   * Redondea un valor monetario respetando los decimales de la moneda.
   * Usa redondeo 'half-up' (Math.round).
   * Ejemplo: COP (0 dec) → 1000.5 → 1001 | BRL (2 dec) → 1000.505 → 1000.51
   * @param value - Valor numérico a redondear
   * @param currencyCode - Código ISO de la moneda (COP, BRL, GTQ, MXN)
   */
  round(value: number, currencyCode: string): number {
    const config = this.getCurrencyConfig(currencyCode);
    const decimal = new Decimal(value);
    const rounded = decimal.toDecimalPlaces(config.decimalPlaces, Decimal.ROUND_HALF_UP);
    return rounded.toNumber();
  }

  /**
   * Formatea un valor monetario según el locale y símbolo de la moneda.
   * @param value - Valor numérico a formatear
   * @param currencyCode - Código ISO de la moneda
   */
  format(value: number, currencyCode: string): string {
    const config = this.getCurrencyConfig(currencyCode);
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: config.decimalPlaces,
      maximumFractionDigits: config.decimalPlaces,
    }).format(value);
  }
}
