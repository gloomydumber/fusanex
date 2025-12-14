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

export interface FusanexServiceRetryConfig {
  maxRetries?: number;     // default 3
  baseBackoffMs?: number;  // default 400
  maxBackoffMs?: number;   // default 8000
}

export interface FusanexServiceConfig {
  baseAsset: CurrencyCode;
  retry?: FusanexServiceRetryConfig;
}

interface LegWithPath {
  rate: number;
  hops: RouteHop[];
}

interface ResolvedCryptoPair {
  pair: ExchangeRate;         // normalized (from → to)
  providerPair: ExchangeRate; // raw provider pair
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeSuccess(from: CurrencyCode, to: CurrencyCode, rate: number, hops: RouteHop[], asOf: number): FxResult {
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

function makeFailure(code: FxErrorCode, message: string, context?: Record<string, unknown>): FxResult {
  return { ok: false, error: { code, message, context } };
}

export class FusanexService implements FusanexPort {
  constructor(
    private readonly cryptoMarkets: MarketPort[],
    private readonly fiatMarkets: MarketPort[],
    private readonly config: FusanexServiceConfig
  ) { }

  // ---------- PUBLIC METHODS ----------

  async cryptoRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();
    if (from === to) return makeSuccess(from, to, 1, [], AS_OF);

    try {
      const DIRECT = await this.buildCryptoDirectLeg(from, to);
      if (DIRECT) return makeSuccess(from, to, DIRECT.rate, DIRECT.hops, AS_OF);

      const CROSS = await this.buildCryptoCrossLeg(from, to);
      if (CROSS) return makeSuccess(from, to, CROSS.rate, CROSS.hops, AS_OF);

      return makeFailure('PAIR_NOT_SUPPORTED', `Crypto pair ${from}/${to} not supported`);
    } catch (e) {
      if (e instanceof FxProviderError) return makeFailure(e.code, e.message, e.context);
      return makeFailure('UNKNOWN', `Unexpected error in cryptoRate`, { error: String(e) });
    }
  }

  async directRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();
    if (from === to) return makeSuccess(from, to, 1, [], AS_OF);

    try {
      const DIRECT = await this.buildCryptoDirectLeg(from, to);
      if (DIRECT) return makeSuccess(from, to, DIRECT.rate, DIRECT.hops, AS_OF);

      return makeFailure('PAIR_NOT_SUPPORTED', `Direct market ${from}/${to} not available`);
    } catch (e) {
      if (e instanceof FxProviderError) return makeFailure(e.code, e.message, e.context);
      return makeFailure('UNKNOWN', `Unexpected error in directRate`, { error: String(e) });
    }
  }

  async crossRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();
    if (from === to) return makeSuccess(from, to, 1, [], AS_OF);

    try {
      const CROSS = await this.buildCryptoCrossLeg(from, to);
      if (CROSS) return makeSuccess(from, to, CROSS.rate, CROSS.hops, AS_OF);

      return makeFailure('NO_ROUTE_FOUND', `No cross route via base asset`);
    } catch (e) {
      if (e instanceof FxProviderError) return makeFailure(e.code, e.message, e.context);
      return makeFailure('UNKNOWN', `Unexpected error in crossRate`, { error: String(e) });
    }
  }

  async fiatRate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();
    if (from === to) return makeSuccess(from, to, 1, [], AS_OF);

    try {
      const LEG = await this.buildFiatLeg(from, to);
      if (LEG) return makeSuccess(from, to, LEG.rate, LEG.hops, AS_OF);

      return makeFailure('NO_ROUTE_FOUND', `No fiat FX route ${from}/${to}`);
    } catch (e) {
      if (e instanceof FxProviderError) return makeFailure(e.code, e.message, e.context);
      return makeFailure('UNKNOWN', `Unexpected error in fiatRate`, { error: String(e) });
    }
  }

  async rate(from: CurrencyCode, to: CurrencyCode): Promise<FxResult> {
    const AS_OF = Date.now();
    if (from === to) return makeSuccess(from, to, 1, [], AS_OF);

    try {
      if (isFiat(from) && isFiat(to)) {
        const FIAT = await this.buildFiatLeg(from, to);
        if (FIAT) return makeSuccess(from, to, FIAT.rate, FIAT.hops, AS_OF);
      }

      const DIRECT = await this.buildCryptoDirectLeg(from, to);
      if (DIRECT) return makeSuccess(from, to, DIRECT.rate, DIRECT.hops, AS_OF);

      const CROSS = await this.buildCryptoCrossLeg(from, to);
      if (CROSS) return makeSuccess(from, to, CROSS.rate, CROSS.hops, AS_OF);

      const FIAT = await this.buildFiatLeg(from, to);
      if (FIAT) return makeSuccess(from, to, FIAT.rate, FIAT.hops, AS_OF);

      const BRIDGES: CurrencyCode[] = ['KRW', 'USD', this.config.baseAsset];

      for (const B of BRIDGES) {
        if (B === from || B === to) continue;

        const L1 = await this.buildSingleLeg(from, B);
        if (!L1) continue;
        const L2 = await this.buildSingleLeg(B, to);
        if (!L2) continue;

        const rate = L1.rate * L2.rate;
        return makeSuccess(from, to, rate, [...L1.hops, ...L2.hops], AS_OF);
      }

      return makeFailure('NO_ROUTE_FOUND', `No route for ${from}/${to}`);
    } catch (e) {
      if (e instanceof FxProviderError) return makeFailure(e.code, e.message, e.context);
      return makeFailure('UNKNOWN', `Unexpected error in rate()`, { error: String(e) });
    }
  }

  // ---------- PRIVATE HELPERS ----------

  private buildHop(
    from: CurrencyCode,
    to: CurrencyCode,
    rate: number,
    providerPair: ExchangeRate,
    inverted: boolean
  ): RouteHop {
    const meta = providerPair.meta;
    return {
      from,
      to,
      rate,
      providerId: meta?.providerId,
      providerLabel: meta?.providerLabel,
      marketKind: meta?.marketKind,
      marketSymbol: meta?.marketSymbol,
      inverted,
      exchangeRate: providerPair,
    };
  }

  private computeHopRate(from: CurrencyCode, to: CurrencyCode, pair: ExchangeRate) {
    if (pair.base === from && pair.quote === to) {
      return { rate: pair.price, inverted: false };
    }
    if (pair.base === to && pair.quote === from) {
      return { rate: 1 / pair.price, inverted: true };
    }
    return { rate: NaN, inverted: false };
  }

  private async buildCryptoDirectLeg(from: CurrencyCode, to: CurrencyCode): Promise<LegWithPath | null> {
    const R = await this.resolveCryptoPair(from, to);
    if (!R) return null;

    const { rate, inverted } = this.computeHopRate(from, to, R.providerPair);
    if (!Number.isFinite(rate)) return null;

    return {
      rate,
      hops: [this.buildHop(from, to, rate, R.providerPair, inverted)],
    };
  }

  private async buildCryptoCrossLeg(from: CurrencyCode, to: CurrencyCode): Promise<LegWithPath | null> {
    const BASE = this.config.baseAsset;

    const R1 = await this.resolveCryptoPair(BASE, from);
    const R2 = await this.resolveCryptoPair(BASE, to);
    if (!R1 || !R2) return null;

    const cross = computeCrossRate(R2.pair, R1.pair);

    const hop1 = this.computeHopRate(from, BASE, R1.providerPair);
    const hop2 = this.computeHopRate(BASE, to, R2.providerPair);

    if (!Number.isFinite(hop1.rate) || !Number.isFinite(hop2.rate)) return null;

    return {
      rate: cross.price,
      hops: [
        this.buildHop(from, BASE, hop1.rate, R1.providerPair, hop1.inverted),
        this.buildHop(BASE, to, hop2.rate, R2.providerPair, hop2.inverted),
      ],
    };
  }

  private async buildFiatLeg(from: CurrencyCode, to: CurrencyCode): Promise<LegWithPath | null> {
    const P = await this.resolveFiatPair(from, to);
    if (!P) return null;

    return {
      rate: P.price,
      hops: [this.buildHop(from, to, P.price, P, false)],
    };
  }

  private async buildSingleLeg(from: CurrencyCode, to: CurrencyCode): Promise<LegWithPath | null> {
    if (isFiat(from) && isFiat(to)) {
      const F = await this.buildFiatLeg(from, to);
      if (F) return F;
    }
    const D = await this.buildCryptoDirectLeg(from, to);
    if (D) return D;
    return await this.buildCryptoCrossLeg(from, to);
  }

  // ---------- MARKET RESOLUTION ----------

  private async safeGet(m: MarketPort, a: CurrencyCode, b: CurrencyCode, attempt = 0): Promise<ExchangeRate | null> {
    try {
      return await m.getPair(a, b);
    } catch (e) {
      if (e instanceof FxProviderError) {
        if (e.code === 'NO_MARKET') return null;

        // 🔹 Service-level RATE_LIMITED retry (backs off even if adapter throws RATE_LIMITED)
        if (e.code === 'RATE_LIMITED') {
          const cfg = this.config.retry ?? {};
          const maxRetries = cfg.maxRetries ?? 3;
          const baseBackoffMs = cfg.baseBackoffMs ?? 400;
          const maxBackoffMs = cfg.maxBackoffMs ?? 8000;

          if (attempt < maxRetries) {
            const retryAfterMs = (e.context?.retryAfterMs as number | undefined);
            const backoff = Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, attempt));
            const jitter = Math.floor(Math.random() * 150);
            await sleep((retryAfterMs ?? backoff) + jitter);
            return this.safeGet(m, a, b, attempt + 1);
          }
        }
      }

      throw e;
    }
  }

  private async resolveCryptoPair(from: CurrencyCode, to: CurrencyCode): Promise<ResolvedCryptoPair | null> {
    for (const m of this.cryptoMarkets) {
      const direct = await this.safeGet(m, from, to);
      if (direct) {
        return { pair: direct, providerPair: direct };
      }

      const inverse = await this.safeGet(m, to, from);
      if (inverse) {
        const normalized: ExchangeRate = {
          base: from,
          quote: to,
          price: 1 / inverse.price,
          meta: inverse.meta,
        };
        return { pair: normalized, providerPair: inverse };
      }
    }
    return null;
  }

  private async resolveFiatPair(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null> {
    for (const m of this.fiatMarkets) {
      const P = await m.getPair(from, to);
      if (P) return P;
    }
    return null;
  }
}
