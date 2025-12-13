import type { CurrencyCode } from '../../../domain/currency';
import type { FxResult } from '../../../domain/fx-result';

/**
 * Public API surface for Fusanex.
 *
 * All methods return FxResult:
 *  - ok: true  => success, with rate + full hops/path
 *  - ok: false => failure, with error code/message/context
 */
export interface FusanexPort {
  /**
   * Universal rate (smart router):
   * 1. Crypto world (direct & cross & inversion).
   * 2. Fiat world (legal FX).
   * 3. Mixed / bridged paths.
   */
  rate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult>;

  /**
   * Crypto rate (smart mode):
   * - Returns direct crypto market rate (or inverted) if available.
   * - Otherwise, attempts to compute a cross rate via baseAsset.
   * - Does NOT use legal FX.
   */
  cryptoRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult>;

  /**
   * Crypto rate (direct only):
   * - Returns the direct crypto market rate if available.
   * - Handles inversion automatically (e.g., if market has BTC/USDT,
   *   directRate('USDT', 'BTC') still works).
   */
  directRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult>;

  /**
   * Crypto rate (cross only):
   * - Computes a cross rate via baseAsset.
   */
  crossRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult>;

  /**
   * Legal fiat FX rate (fiat↔fiat only).
   */
  fiatRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult>;
}
