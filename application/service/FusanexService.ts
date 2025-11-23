import type { FusanexPort } from '../port/in/FusanexPort';
import type { MarketPort } from '../port/out/MarketPort';
import type { BaseAsset } from '../../domain/base-asset';
import type { CurrencyCode } from '../../domain/currency';
import type { ExchangeRate } from '../../domain/exchange-rate';
import { computeCrossRate } from '../../domain/cross-rate';

export interface FusanexServiceConfig {
  baseAsset: BaseAsset; // e.g. 'BTC'
}

/**
 * FusanexService:
 * - Crypto methods use cryptoMarkets only:
 *     - rate()       : prefers direct crypto markets, then crypto cross via baseAsset
 *     - directRate() : only direct crypto markets
 *     - crossRate()  : only crypto cross via baseAsset
 *
 * - Fiat methods use fiatMarkets only:
 *     - fiatRate()   : only legal fiat FX provider(s), no crypto
 */
export class FusanexService implements FusanexPort {
  constructor(
    private readonly cryptoMarkets: MarketPort[],
    private readonly fiatMarkets: MarketPort[],
    private readonly config: FusanexServiceConfig,
  ) { }

  // --------- CRYPTO METHODS ---------

  async rate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
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
}
