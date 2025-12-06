import type { CurrencyCode } from '../../../domain/currency';

export interface FusanexPort {
  /**
  * Universal rate (smart router):
  *
  * Resolution order:
  * 1. Crypto world:
  *    - Try rate(from, to)      (direct then crypto cross via baseAsset).
  * 2. Fiat world:
  *    - Try fiatRate(from, to)  (pure legal FX).
  * 3. Mixed / bridged paths (2-leg routes):
  *    - Try routes via bridge currencies (e.g. KRW, USD, baseAsset), by:
  *        from → BRIDGE (single leg)
  *        BRIDGE → to   (single leg)
  *      using both crypto and fiat methods.
  *
  * If no route is found, returns null.
  *
  * The result is "how many `to` per 1 `from`".
  */
  rate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;

  /**
   * Crypto rate (smart mode):
   * - Returns direct crypto market rate if available.
   * - Otherwise, attempts to compute a cross rate via baseAsset.
   * - Throws if no crypto rate is available.
   *
   * The result is "how many `to` per 1 `from`".
   */
  cryptoRate(from: CurrencyCode, to: CurrencyCode): Promise<number>;

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
