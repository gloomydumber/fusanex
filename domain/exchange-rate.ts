import { BaseAsset } from './base-asset';
import type { CurrencyCode } from './currency';

export interface ExchangeRate {
  base: CurrencyCode | BaseAsset;   // e.g. 'BTC'
  quote: CurrencyCode | BaseAsset;  // e.g. 'KRW'
  price: number;        // e.g. 100000000.0 (KRW per 1 BTC)
}
