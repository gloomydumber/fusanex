import type { CurrencyCode } from '../../../domain/currency';

export interface FusanexPort {
  /**
   * Universal rate (smart router):
   * 1. Crypto world (direct & cross & inversion).
   * 2. Fiat world (legal FX).
   * 3. Mixed / bridged paths.
   */
  rate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;

  /**
   * Crypto rate (smart mode):
   * - Returns direct crypto market rate (or inverted) if available.
   * - Otherwise, attempts to compute a cross rate via baseAsset.
   */
  cryptoRate(from: CurrencyCode, to: CurrencyCode): Promise<number>;

  /**
   * Crypto rate (direct only):
   * - Returns the direct crypto market rate if available.
   * - Handles inversion automatically (e.g., if market has BTC/USDT, directRate('USDT', 'BTC') works).
   */
  directRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;

  /**
   * Crypto rate (cross only):
   * - Computes a cross rate via baseAsset.
   */
  crossRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;

  /**
   * Legal fiat FX rate.
   */
  fiatRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;
}
