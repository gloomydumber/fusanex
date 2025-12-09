import type { CurrencyCode } from '../../../domain/currency';
import type { ExchangeRate } from '../../../domain/exchange-rate';

export interface MarketPort {
  /**
     * Tries to find a rate for FROM -> TO.
     * Returns null if the adapter does not support this specific direction.
     */
  getPair(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null>;
}
