import type { CurrencyCode } from '../../../domain/currency';
import type { BaseAsset } from '../../../domain/base-asset';
import type { ExchangeRate } from '../../../domain/exchange-rate';

export interface MarketPort {
  /**
   * Returns a direct market rate for `from/to` if this adapter supports it.
   * Otherwise returns null.
   */
  getPair(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset,
  ): Promise<ExchangeRate | null>;
}
