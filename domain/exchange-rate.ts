import type { CurrencyCode } from './currency';

export interface ExchangeRate {
  base: CurrencyCode;
  quote: CurrencyCode;
  price: number;
}
