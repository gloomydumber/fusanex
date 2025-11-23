import type { CurrencyCode } from './currency';

/**
 * Normalized fiat FX rate table.
 *
 * - `base` is the anchor fiat currency (e.g. 'KRW', 'USD', 'EUR').
 * - `quotes[code]` is "base per 1 code".
 *
 * Example (Stockplus-style, base = 'KRW'):
 *   {
 *     base: 'KRW',
 *     quotes: {
 *       USD: 1472.0, // 1 USD = 1472 KRW
 *       JPY:   10.3, // 1 JPY = 10.3 KRW
 *       EUR: 1600.0, // 1 EUR = 1600 KRW
 *     }
 *   }
 */
export interface NormalizedFiatFxRates {
  base: CurrencyCode;
  quotes: Record<CurrencyCode, number>;
}

/**
 * A transform function that trims / normalizes a raw FX API response
 * into a NormalizedFiatFxRates structure.
 *
 * The implementer is responsible for choosing the base currency and
 * producing quotes as "base per 1 code".
 */
export type FiatFxTransform = (raw: unknown) => NormalizedFiatFxRates;