import type { CurrencyCode } from '../../../domain/currency';

export interface FusanexPort {
  /**
   * Crypto rate (smart mode):
   * - Returns direct crypto market rate if available.
   * - Otherwise, attempts to compute a cross rate via baseAsset.
   * - Throws if no crypto rate is available.
   *
   * The result is "how many `to` per 1 `from`".
   */
  rate(from: CurrencyCode, to: CurrencyCode): Promise<number>;

  /**
   * Crypto rate (direct only):
   * - Returns the direct crypto market rate if available.
   * - Returns null if there is no direct crypto market for this pair.
   */
  directRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;

  /**
   * Crypto rate (cross only):
   * - Computes a cross rate via baseAsset (e.g. BTC) using crypto markets only.
   * - Returns null if the crypto cross rate cannot be computed.
   */
  crossRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;

  /**
   * Legal fiat FX rate:
   * - Uses only the legal fiat FX provider(s) (e.g. Stockplus or custom).
   * - Does NOT use any crypto markets or crypto cross logic.
   * - Returns null if fiat FX provider is not configured or the pair is not supported.
   *
   * The result is "how many `to` per 1 `from`".
   */
  fiatRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;
}
