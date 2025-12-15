// domain/route-hop.ts
import type { CurrencyCode } from './currency';
import type { MarketKind, ExchangeRate } from './exchange-rate';

export interface RouteHop {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;

  providerId?: string;
  providerLabel?: string;
  marketKind?: MarketKind;
  marketSymbol?: string;

  inverted?: boolean;
  /**
   * The original market quote used to build this hop.
   * This is exactly what the adapter returned (base, quote, price, meta).
   */
  exchangeRate?: ExchangeRate;
}

export interface FxPath {
  hops: RouteHop[];
  totalRate: number;
  asOf: number;
}
