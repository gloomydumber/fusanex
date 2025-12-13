import type { FusanexPort } from '../port/in/FusanexPort';
import type { MarketPort } from '../port/out/MarketPort';
import type { ExchangeRate } from '../../domain/exchange-rate';
import { type CurrencyCode, isFiat } from '../../domain/currency';
import { computeCrossRate } from '../../domain/cross-rate';
import type { RouteHop } from '../../domain/route-hop';
import {
  type FxResult,
  type FxErrorCode,
  FxProviderError,
} from '../../domain/fx-result';

export interface FusanexServiceConfig {
  baseAsset: CurrencyCode;
}

interface LegWithPath {
  rate: number;
  hops: RouteHop[];
}

/**
 * Internal representation when resolving a crypto pair:
 * - `pair` is always normalized to (from -> to)
 * - `invertedFromProvider` tells us if we had to invert the provider's market
 */
interface ResolvedCryptoPair {
  pair: ExchangeRate;
  invertedFromProvider: boolean;
}

function makeSuccess(
  from: CurrencyCode,
  to: CurrencyCode,
  rate: number,
  hops: RouteHop[],
  asOf: number,
): FxResult {
  return {
    ok: true,
    from,
    to,
    rate,
    path: {
      asOf,
      totalRate: rate,
      hops,
    },
  };
}

function makeFailure(
  code: FxErrorCode,
  message: string,
  context?: Record<string, unknown>,
): FxResult {
  return {
    ok: false,
    error: { code, message, context },
  };
}

export class FusanexService implements FusanexPort {
  constructor(
    private readonly cryptoMarkets: MarketPort[],
    private readonly fiatMarkets: MarketPort[],
    private readonly config: FusanexServiceConfig,
  ) { }

  // --------- CRYPTO METHODS ---------

  async cryptoRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();

    if (from === to) {
      return makeSuccess(from, to, 1, [], AS_OF);
    }

    try {
      const DIRECT = await this.buildCryptoDirectLeg(from, to);
      if (DIRECT) {
        return makeSuccess(from, to, DIRECT.rate, DIRECT.hops, AS_OF);
      }

      const CROSS = await this.buildCryptoCrossLeg(from, to);
      if (CROSS) {
        return makeSuccess(from, to, CROSS.rate, CROSS.hops, AS_OF);
      }

      return makeFailure(
        'PAIR_NOT_SUPPORTED',
        `Crypto pair ${from}/${to} is not supported in current config`,
        { from, to, baseAsset: this.config.baseAsset },
      );
    } catch (e) {
      if (e instanceof FxProviderError) {
        return makeFailure(e.code, e.message, e.context);
      }

      return makeFailure(
        'UNKNOWN',
        `Unexpected error while computing crypto rate for ${from}/${to}`,
        { from, to, error: String(e) },
      );
    }
  }

  async directRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();

    if (from === to) {
      return makeSuccess(from, to, 1, [], AS_OF);
    }

    try {
      const DIRECT = await this.buildCryptoDirectLeg(from, to);
      if (DIRECT) {
        return makeSuccess(from, to, DIRECT.rate, DIRECT.hops, AS_OF);
      }

      return makeFailure(
        'PAIR_NOT_SUPPORTED',
        `Direct crypto market for ${from}/${to} is not available`,
        { from, to },
      );
    } catch (e) {
      if (e instanceof FxProviderError) {
        return makeFailure(e.code, e.message, e.context);
      }

      return makeFailure(
        'UNKNOWN',
        `Unexpected error while computing direct crypto rate for ${from}/${to}`,
        { from, to, error: String(e) },
      );
    }
  }

  async crossRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();

    if (from === to) {
      return makeSuccess(from, to, 1, [], AS_OF);
    }

    try {
      const CROSS = await this.buildCryptoCrossLeg(from, to);
      if (CROSS) {
        return makeSuccess(from, to, CROSS.rate, CROSS.hops, AS_OF);
      }

      return makeFailure(
        'NO_ROUTE_FOUND',
        `Cannot compute crypto cross-rate for ${from}/${to} via base asset`,
        { from, to, baseAsset: this.config.baseAsset },
      );
    } catch (e) {
      if (e instanceof FxProviderError) {
        return makeFailure(e.code, e.message, e.context);
      }

      return makeFailure(
        'UNKNOWN',
        `Unexpected error while computing crypto cross-rate for ${from}/${to}`,
        { from, to, error: String(e) },
      );
    }
  }

  // --------- FIAT METHODS ---------

  async fiatRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();

    if (from === to) {
      return makeSuccess(from, to, 1, [], AS_OF);
    }

    try {
      const LEG = await this.buildFiatLeg(from, to);
      if (LEG) {
        return makeSuccess(from, to, LEG.rate, LEG.hops, AS_OF);
      }

      return makeFailure(
        'NO_ROUTE_FOUND',
        `No fiat FX route from ${from} to ${to}`,
        { from, to },
      );
    } catch (e) {
      if (e instanceof FxProviderError) {
        return makeFailure(e.code, e.message, e.context);
      }

      return makeFailure(
        'UNKNOWN',
        `Unexpected error while computing fiat FX rate for ${from}/${to}`,
        { from, to, error: String(e) },
      );
    }
  }

  // --------- UNIVERSAL ROUTER ---------

  async rate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();

    if (from === to) {
      return makeSuccess(from, to, 1, [], AS_OF);
    }

    try {
      // 1) Crypto-only: direct, then cross
      const DIRECT_CRYPTO = await this.buildCryptoDirectLeg(from, to);
      if (DIRECT_CRYPTO) {
        return makeSuccess(
          from,
          to,
          DIRECT_CRYPTO.rate,
          DIRECT_CRYPTO.hops,
          AS_OF,
        );
      }

      const CROSS_CRYPTO = await this.buildCryptoCrossLeg(from, to);
      if (CROSS_CRYPTO) {
        return makeSuccess(
          from,
          to,
          CROSS_CRYPTO.rate,
          CROSS_CRYPTO.hops,
          AS_OF,
        );
      }

      // 2) Pure fiat FX
      const FIAT_LEG = await this.buildFiatLeg(from, to);
      if (FIAT_LEG) {
        return makeSuccess(from, to, FIAT_LEG.rate, FIAT_LEG.hops, AS_OF);
      }

      // 3) Mixed bridges: from -> BRIDGE -> to
      const BRIDGES: CurrencyCode[] = ['KRW', 'USD', this.config.baseAsset];

      for (const BRIDGE of BRIDGES) {
        if (BRIDGE === from || BRIDGE === to) continue;

        const LEG1 = await this.buildSingleLeg(from, BRIDGE);
        if (!LEG1) continue;

        const LEG2 = await this.buildSingleLeg(BRIDGE, to);
        if (!LEG2) continue;

        const rate = LEG1.rate * LEG2.rate;
        if (!Number.isFinite(rate)) continue;

        const hops = [...LEG1.hops, ...LEG2.hops];

        return makeSuccess(from, to, rate, hops, AS_OF);
      }

      return makeFailure(
        'NO_ROUTE_FOUND',
        `No available route from ${from} to ${to}`,
        { from, to },
      );
    } catch (e) {
      if (e instanceof FxProviderError) {
        return makeFailure(e.code, e.message, e.context);
      }

      return makeFailure(
        'UNKNOWN',
        `Unexpected error while computing route from ${from} to ${to}`,
        { from, to, error: String(e) },
      );
    }
  }

  // --------- PRIVATE HELPERS (HOPS) ---------

  private buildHopFromPair(
    from: CurrencyCode,
    to: CurrencyCode,
    rate: number,
    pair: ExchangeRate,
    inverted: boolean,
  ): RouteHop {
    const meta = pair.meta;
    return {
      from,
      to,
      rate,
      providerId: meta?.providerId,
      providerLabel: meta?.providerLabel,
      marketKind: meta?.marketKind,
      marketSymbol: meta?.marketSymbol,
      inverted,
      exchangeRate: pair,
    };
  }

  // --------- LEG BUILDERS ---------

  private async buildCryptoDirectLeg(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<LegWithPath | null> {
    if (from === to) {
      return { rate: 1, hops: [] };
    }

    const resolved = await this.resolveCryptoPair(from, to);
    if (!resolved) return null;

    const { pair, invertedFromProvider } = resolved;

    const hop = this.buildHopFromPair(
      from,
      to,
      pair.price,
      pair,
      invertedFromProvider,
    );
    return {
      rate: pair.price,
      hops: [hop],
    };
  }

  private async buildCryptoCrossLeg(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<LegWithPath | null> {
    if (from === to) {
      return { rate: 1, hops: [] };
    }

    const BASE = this.config.baseAsset;

    const baseFromResolved = await this.resolveCryptoPair(BASE, from);
    const baseToResolved = await this.resolveCryptoPair(BASE, to);

    if (!baseFromResolved || !baseToResolved) {
      return null;
    }

    const BASE_FROM = baseFromResolved.pair;
    const BASE_TO = baseToResolved.pair;

    const CROSS = computeCrossRate(BASE_TO, BASE_FROM);

    const RATE_FROM_TO_BASE = 1 / BASE_FROM.price; // from -> BASE
    const RATE_BASE_TO_TO = BASE_TO.price; // BASE -> to

    const hop1 = this.buildHopFromPair(
      from,
      BASE,
      RATE_FROM_TO_BASE,
      BASE_FROM,
      true, // from -> BASE is always inverse of BASE -> from
    );
    const hop2 = this.buildHopFromPair(
      BASE,
      to,
      RATE_BASE_TO_TO,
      BASE_TO,
      false, // BASE -> to uses pair in its natural direction
    );

    return {
      rate: CROSS.price,
      hops: [hop1, hop2],
    };
  }

  private async buildFiatLeg(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<LegWithPath | null> {
    if (from === to) {
      return { rate: 1, hops: [] };
    }

    const PAIR = await this.resolveFiatPair(from, to);
    if (!PAIR) return null;

    const hop = this.buildHopFromPair(from, to, PAIR.price, PAIR, false);
    return {
      rate: PAIR.price,
      hops: [hop],
    };
  }

  /**
   * One "leg" in the universal router:
   *  - if both fiat: prefers fiat FX
   *  - otherwise tries crypto (direct, then cross)
   */
  private async buildSingleLeg(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<LegWithPath | null> {
    if (from === to) {
      return { rate: 1, hops: [] };
    }

    if (isFiat(from) && isFiat(to)) {
      const FIAT = await this.buildFiatLeg(from, to);
      if (FIAT) return FIAT;
    }

    const DIRECT_CRYPTO = await this.buildCryptoDirectLeg(from, to);
    if (DIRECT_CRYPTO) return DIRECT_CRYPTO;

    const CROSS_CRYPTO = await this.buildCryptoCrossLeg(from, to);
    if (CROSS_CRYPTO) return CROSS_CRYPTO;

    return null;
  }

  // --------- LOW-LEVEL PAIR RESOLUTION ---------

  private async resolveCryptoPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ResolvedCryptoPair | null> {
    for (const MARKET of this.cryptoMarkets) {
      // Try direct provider pair: from -> to
      const PAIR = await MARKET.getPair(from, to);
      if (PAIR) {
        return {
          pair: PAIR,
          invertedFromProvider: false,
        };
      }

      // Try provider pair: to -> from, then invert it
      const INVERSE = await MARKET.getPair(to, from);
      if (INVERSE) {
        const invertedPair: ExchangeRate = {
          base: from,
          quote: to,
          price: 1 / INVERSE.price,
          meta: INVERSE.meta,
        };
        return {
          pair: invertedPair,
          invertedFromProvider: true,
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
}
