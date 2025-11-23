/**
 * Provider IDs are what end users see in config.
 * Internally, you map these to concrete adapters.
 *
 * For now, only Upbit (KRW) and Binance (USD-like) are actually implemented.
 * Others are reserved for future adapters.
 */

export type KRWProviderId = 'Upbit' | 'Bithumb';

export type USDProviderId = 'Binance' | 'Coinbase';

export type EURProviderId = 'Kraken';

export type JPYProviderId = 'Bitflyer';

/**
 * ProviderMap:
 *   - Keys are fiat currencies
 *   - Values are provider IDs for that fiat
 *
 * Example:
 *   {
 *     KRW: 'Bithumb',
 *     USD: 'Coinbase',
 *   }
 */
export interface ProviderMap {
  KRW?: KRWProviderId;
  USD?: USDProviderId;
  EUR?: EURProviderId;
  JPY?: JPYProviderId;
}
