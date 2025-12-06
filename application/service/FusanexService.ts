import type { FusanexPort } from '../port/in/FusanexPort';
import type { MarketPort } from '../port/out/MarketPort';
import type { BaseAsset } from '../../domain/base-asset';
import type { ExchangeRate } from '../../domain/exchange-rate';
import { type CurrencyCode, isFiatCurrencyCode } from '../../domain/currency';
import { computeCrossRate } from '../../domain/cross-rate';

export interface FusanexServiceConfig {
  baseAsset: BaseAsset; // e.g. 'BTC'
}

/**
 * FusanexService:
 *
 * - Unified resolution (crypto + fiat):
 *     - rate()       : tries direct crypto, then crypto cross via baseAsset,
 *                      then fiat FX if both are fiat,
 *                      and finally mixed crypto↔fiat multi-leg routing.
 * 
 * - Crypto resolution (uses cryptoMarkets only):
 *     - directRate() : only direct crypto markets
 *     - crossRate()  : only crypto cross via baseAsset
 *
 * - Fiat resolution (uses fiatMarkets only):
 *     - fiatRate()   : only legal fiat FX provider(s), no crypto
 *
 */
export class FusanexService implements FusanexPort {
  constructor(
    private readonly cryptoMarkets: MarketPort[],
    private readonly fiatMarkets: MarketPort[],
    private readonly config: FusanexServiceConfig,
  ) { }

  // --------- CRYPTO METHODS ---------

  async cryptoRate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
    if (from === to) return 1;

    const DIRECT_PAIR = await this.resolveCryptoPair(from, to);
    if (DIRECT_PAIR) {
      return DIRECT_PAIR.price;
    }

    const CROSS_RATE = await this.computeCryptoCrossViaBase(from, to);
    if (CROSS_RATE !== null) {
      return CROSS_RATE;
    }

    throw new Error(`Crypto pair ${from}/${to} is not supported in current config`);
  }

  async directRate(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number | null> {
    if (from === to) return 1;

    const DIRECT_PAIR = await this.resolveCryptoPair(from, to);
    if (!DIRECT_PAIR) return null;

    return DIRECT_PAIR.price;
  }

  async crossRate(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number | null> {
    if (from === to) return 1;

    const CROSS_RATE = await this.computeCryptoCrossViaBase(from, to);
    return CROSS_RATE;
  }

  // --------- FIAT METHODS ---------

  async fiatRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null> {
    if (from === to) return 1;

    const FIAT_PAIR = await this.resolveFiatPair(from, to);
    if (!FIAT_PAIR) return null;

    return FIAT_PAIR.price;
  }

  // --------- UNIVERSAL ROUTER ---------

  /**
   * Universal rate (smart router):
   *
   * Resolution order:
   * 1. Crypto-only:
   *    - Try rate(from, to) (direct > crypto cross via baseAsset).
   *
   * 2. Fiat-only:
   *    - Try fiatRate(from, to).
   *
   * 3. Mixed / bridged, 2-leg routes via bridge currencies:
   *    - For each BRIDGE in [KRW, USD, baseAsset]:
   *        leg1 = single-leg(from, BRIDGE)
   *        leg2 = single-leg(BRIDGE, to)
   *      If both legs exist, return leg1 * leg2.
   *
   * Returns null if no route is found.
   *
   * The result is "how many `to` per 1 `from`".
   */
  async rate(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number | null> {
    if (from === to) return 1;

    // 1) Try crypto-only path first (same semantics as rate(), but swallow errors)
    try {
      const CRYPTO_RATE = await this.cryptoRate(from, to);
      if (CRYPTO_RATE !== null && !Number.isNaN(CRYPTO_RATE)) {
        return CRYPTO_RATE;
      }
    } catch {
      // ignore, fallback to other strategies
    }

    // 2) Try pure fiat FX route
    const FIAT_RATE = await this.fiatRate(from, to);
    if (FIAT_RATE !== null) {
      return FIAT_RATE;
    }

    // 3) Try 2-leg routes via bridge currencies.
    //    These are "good hubs" that connect both crypto and fiat worlds.
    const BRIDGES: CurrencyCode[] = [
      'KRW', // primary fiat bridge (typical legal tender in your environment)
      'USD', // secondary fiat bridge (global reserve)
      // We also treat baseAsset as a "bridge currency" between cryptos.
      this.config.baseAsset as unknown as CurrencyCode,
    ];

    for (const BRIDGE of BRIDGES) {
      if (BRIDGE === from || BRIDGE === to) continue;

      const LEG1 = await this.trySingleLeg(from, BRIDGE);
      if (LEG1 === null) continue;

      const LEG2 = await this.trySingleLeg(BRIDGE, to);
      if (LEG2 === null) continue;

      const COMBINED = LEG1 * LEG2;
      if (!Number.isNaN(COMBINED)) {
        return COMBINED;
      }
    }

    // No route found.
    return null;
  }

  // --------- PRIVATE HELPERS ---------

  private async resolveCryptoPair(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset,
  ): Promise<ExchangeRate | null> {
    for (const MARKET of this.cryptoMarkets) {
      const PAIR = await MARKET.getPair(from, to);
      if (PAIR) return PAIR;
    }
    return null;
  }

  private async resolveFiatPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ExchangeRate | null> {
    for (const MARKET of this.fiatMarkets) {
      const PAIR = await MARKET.getPair(from, to);
      if (PAIR) return PAIR;
    }
    return null;
  }

  /**
   * Generic crypto cross-rate via base asset.
   *
   * Uses:
   *   BASE/FROM and BASE/TO
   * from cryptoMarkets only, and computeCrossRate(BASE_FROM, BASE_TO)
   * to get TO/FROM.
   *
   * Returns:
   *   number = how many `to` per 1 `from`
   *   or null if it cannot compute (missing crypto markets, etc.)
   */
  private async computeCryptoCrossViaBase(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number | null> {
    if (from === to) return 1;

    const BASE = this.config.baseAsset;

    const BASE_FROM = await this.resolveCryptoPair(BASE, from); // BASE/FROM
    const BASE_TO = await this.resolveCryptoPair(BASE, to); // BASE/TO

    if (!BASE_FROM || !BASE_TO) {
      return null;
    }

    // computeCrossRate(BASE_FROM, BASE_TO):
    //   BASE_FROM: BASE/FROM  (quote = FROM)
    //   BASE_TO  : BASE/TO    (quote = TO)
    //
    // result:
    //   TO/FROM (how many `to` per 1 `from`)
    const TO_PER_FROM = computeCrossRate(BASE_TO, BASE_FROM);

    return TO_PER_FROM.price;
  }

  /**
   * Try a "single-leg" route between two currencies:
   *
   * - If both are fiat:
   *     - Prefer fiatRate(from, to).
   *     - If fiat is not available, fall back to crypto-based methods (if any).
   *
   * - Otherwise (crypto / stable / mixed):
   *     - Try direct crypto markets, then crypto cross via baseAsset.
   *
   * Returns:
   *   number = how many `to` per 1 `from`
   *   or null if no single-leg route exists.
   */
  private async trySingleLeg(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number | null> {
    if (from === to) return 1;

    const FROM_IS_FIAT = isFiatCurrencyCode(from);
    const TO_IS_FIAT = isFiatCurrencyCode(to);

    // Both fiat: prefer the legal FX provider.
    if (FROM_IS_FIAT && TO_IS_FIAT) {
      const FIAT = await this.fiatRate(from, to);
      if (FIAT !== null) {
        return FIAT;
      }
      // Fall through to crypto-based methods if ever needed in future.
    }

    // Try crypto methods (direct, then cross).
    const DIRECT_CRYPTO = await this.directRate(from, to);
    if (DIRECT_CRYPTO !== null) {
      return DIRECT_CRYPTO;
    }

    const CROSS_CRYPTO = await this.crossRate(from, to);
    if (CROSS_CRYPTO !== null) {
      return CROSS_CRYPTO;
    }

    // No second fiatRate() call here: fiat is only tried once above.
    return null;
  }
}
