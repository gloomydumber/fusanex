import type { CurrencyCode } from './currency';

export interface PusanexDomainConfig {
  // We can loosely type this as CurrencyCode now, or keep a stricter CryptoCurrency type if desired.
  // Generally, the base asset for cross-rates is a high-liquidity crypto.
  baseAsset: CurrencyCode;
}