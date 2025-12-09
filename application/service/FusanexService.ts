import type { FusanexPort } from '../port/in/FusanexPort';
import type { MarketPort } from '../port/out/MarketPort';
import type { ExchangeRate } from '../../domain/exchange-rate';
import { type CurrencyCode, isFiat } from '../../domain/currency';
import { computeCrossRate } from '../../domain/cross-rate';

export interface FusanexServiceConfig {
  baseAsset: CurrencyCode;
}

export class FusanexService implements FusanexPort {
  constructor(
    private readonly cryptoMarkets: MarketPort[],
    private readonly fiatMarkets: MarketPort[],
    private readonly config: FusanexServiceConfig,
  ) { }

  // --------- CRYPTO METHODS ---------

  async cryptoRate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
    if (from === to) return 1;

    // 1. Try Direct (with inversion)
    const DIRECT_PAIR = await this.resolveCryptoPair(from, to);
    if (DIRECT_PAIR) {
      return DIRECT_PAIR.price;
    }

    // 2. Try Cross via Base
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
    return await this.computeCryptoCrossViaBase(from, to);
  }

  // --------- FIAT METHODS ---------

  async fiatRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null> {
    if (from === to) return 1;

    const FIAT_PAIR = await this.resolveFiatPair(from, to);
    if (!FIAT_PAIR) return null;

    return FIAT_PAIR.price;
  }

  // --------- UNIVERSAL ROUTER ---------

  async rate(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number | null> {
    if (from === to) return 1;

    // 1) Try crypto-only path first
    try {
      const CRYPTO_RATE = await this.cryptoRate(from, to);
      if (CRYPTO_RATE !== null && !Number.isNaN(CRYPTO_RATE)) {
        return CRYPTO_RATE;
      }
    } catch {
      // ignore
    }

    // 2) Try pure fiat FX route
    const FIAT_RATE = await this.fiatRate(from, to);
    if (FIAT_RATE !== null) {
      return FIAT_RATE;
    }

    // 3) Try 2-leg routes via bridge currencies.
    const BRIDGES: CurrencyCode[] = [
      'KRW',
      'USD',
      this.config.baseAsset,
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

    return null;
  }

  // --------- PRIVATE HELPERS ---------

  /**
   * Tries to find a crypto pair.
   * IMPROVED: Tries direct, then tries inverse.
   */
  private async resolveCryptoPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ExchangeRate | null> {
    for (const MARKET of this.cryptoMarkets) {
      // 1. Try Direct: FROM -> TO
      const PAIR = await MARKET.getPair(from, to);
      if (PAIR) return PAIR;

      // 2. Try Inverted: TO -> FROM
      // If we want USDT -> BTC, but market only has BTC -> USDT
      const INVERSE = await MARKET.getPair(to, from);
      if (INVERSE) {
        return {
          base: from,
          quote: to,
          price: 1 / INVERSE.price
        };
      }
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

  private async computeCryptoCrossViaBase(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number | null> {
    if (from === to) return 1;

    const BASE = this.config.baseAsset;

    // We use resolveCryptoPair here so it automatically handles inversion.
    // e.g., if BASE=BTC, from=KRW. 
    // resolveCryptoPair(BTC, KRW) -> Direct BTC/KRW from Upbit.

    const BASE_FROM = await this.resolveCryptoPair(BASE, from);
    const BASE_TO = await this.resolveCryptoPair(BASE, to);

    if (!BASE_FROM || !BASE_TO) {
      return null;
    }

    const TO_PER_FROM = computeCrossRate(BASE_TO, BASE_FROM);
    return TO_PER_FROM.price;
  }

  private async trySingleLeg(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<number | null> {
    if (from === to) return 1;

    // Both fiat: prefer legal FX
    if (isFiat(from) && isFiat(to)) {
      const FIAT = await this.fiatRate(from, to);
      if (FIAT !== null) return FIAT;
    }

    // Try crypto methods (direct, then cross)
    const DIRECT_CRYPTO = await this.directRate(from, to);
    if (DIRECT_CRYPTO !== null) return DIRECT_CRYPTO;

    const CROSS_CRYPTO = await this.crossRate(from, to);
    if (CROSS_CRYPTO !== null) return CROSS_CRYPTO;

    return null;
  }
}