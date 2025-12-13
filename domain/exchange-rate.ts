import type { CurrencyCode } from './currency';

export type MarketKind = 'CRYPTO' | 'FIAT';

/**
 * Optional metadata describing where an ExchangeRate came from.
 */
export interface ExchangeRateMeta {
  providerId?: string;     // e.g. "upbit-krw", "binance-usd-like", "stockplus-fx"
  providerLabel?: string;  // e.g. "Upbit", "Binance", "Stockplus"
  marketKind?: MarketKind; // "CRYPTO" or "FIAT"
  marketSymbol?: string;   // e.g. "BTC/KRW", "BTCUSDT", "USD/JPY"
}

/**
 * Basic exchange rate: 1 base = price quote.
 */
export interface ExchangeRate {
  base: CurrencyCode;
  quote: CurrencyCode;
  price: number;

  // Optional metadata filled by adapters.
  meta?: ExchangeRateMeta;
}
