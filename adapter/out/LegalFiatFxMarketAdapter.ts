import type { MarketPort } from '../../application/port/out/MarketPort';
import type { ExchangeRate } from '../../domain/exchange-rate';
import type { CurrencyCode } from '../../domain/currency';
import type {
  NormalizedFiatFxRates,
  FiatFxTransform,
} from '../../domain/fiat-fx';
import { FxProviderError } from '../../domain/fx-result';
import { createSmartFetch, type FetchLike, parseRetryAfterMs } from '../../util/http';

export const STOCKPLUS_FIAT_FX_ENDPOINT =
  'https://mweb-api.stockplus.com/api/assets.json?ids=' +
  [
    'FOREX-KRWUSD',
    'FOREX-KRWJPY',
    'FOREX-KRWCNY',
    'FOREX-KRWEUR',
    'FOREX-KRWGBP',
    'FOREX-KRWCHF',
    'FOREX-KRWCAD',
    'FOREX-KRWNZD',
    'FOREX-KRWHKD',
    'FOREX-KRWBRL',
    'FOREX-KRWMXN',
    'FOREX-KRWAED',
    'FOREX-KRWKWD',
    'FOREX-KRWBHD',
    'FOREX-KRWINR',
    'FOREX-KRWSAR',
    'FOREX-KRWNOK',
    'FOREX-KRWDKK',
    'FOREX-KRWMYR',
    'FOREX-KRWBDT',
    'FOREX-KRWPKR',
    'FOREX-KRWIDR',
    'FOREX-KRWTWD',
    'FOREX-KRWPHP',
    'FOREX-KRWSEK',
    'FOREX-KRWAUD',
    'FOREX-KRWSGD',
    'FOREX-KRWTHB',
    'FOREX-KRWEGP',
    'FOREX-KRWBND',
    'FOREX-KRWILS',
    'FOREX-KRWJOD',
    'FOREX-KRWVND',
    'FOREX-KRWRUB',
    'FOREX-KRWHUF',
    'FOREX-KRWPLN',
    'FOREX-KRWZAR',
    'FOREX-KRWMNT',
    'FOREX-KRWCZK',
    'FOREX-KRWKZT',
    'FOREX-KRWQAR',
    'FOREX-KRWTRY',
  ].join('%2C');

export const stockplusFiatFxTransform: FiatFxTransform = (
  raw: unknown,
): NormalizedFiatFxRates => {
  const BASE: CurrencyCode = 'KRW';
  const QUOTES: Record<CurrencyCode, number> = {} as Record<CurrencyCode, number>;

  if (!raw || typeof raw !== 'object') {
    return { base: BASE, quotes: QUOTES };
  }

  const assets = (raw as any).assets;
  if (!Array.isArray(assets)) {
    return { base: BASE, quotes: QUOTES };
  }

  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') continue;

    const code = (asset as any).currencyCode as CurrencyCode | undefined;
    const basePrice = (asset as any).basePrice as number | undefined;
    const currencyUnit = (asset as any).currencyUnit as number | undefined;

    if (!code || typeof basePrice !== 'number') continue;

    const unit = typeof currencyUnit === 'number' && currencyUnit > 0 ? currencyUnit : 1;
    QUOTES[code] = basePrice / unit;
  }

  return { base: BASE, quotes: QUOTES };
};

export interface LegalFiatFxAdapterConfig {
  endpoint: string;
  transform: FiatFxTransform;
  ttlMs?: number;
  fetchImpl?: FetchLike;
}

const DEFAULT_LEGAL_FIAT_FETCH: FetchLike = createSmartFetch(fetch, {
  key: 'legal-fiat',
  // Unknown provider policy → very conservative pacing (also has TTL cache).
  rateLimit: { minTimeMs: 300 },
  retry: {
    maxRetries: 3,
    baseBackoffMs: 500,
    maxBackoffMs: 10_000,
    retryOnStatuses: [429, 500, 502, 503, 504],
  },
});


export class LegalFiatFxMarketAdapter implements MarketPort {
  private cache: NormalizedFiatFxRates | null = null;
  private lastFetchedAt = 0;
  private readonly ttlMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: LegalFiatFxAdapterConfig) {
    this.ttlMs = config.ttlMs ?? 60_000;
    this.fetchImpl = config.fetchImpl ?? DEFAULT_LEGAL_FIAT_FETCH;
  }

  private async loadRates(): Promise<NormalizedFiatFxRates> {
    const NOW = Date.now();

    if (this.cache && NOW - this.lastFetchedAt < this.ttlMs) {
      return this.cache;
    }

    const url = this.config.endpoint;

    try {
      const res = await this.fetchImpl(url).catch((e) => {
        throw new FxProviderError(
          'NETWORK_ERROR',
          'Network error while fetching legal FX rates',
          { providerId: 'legal-fiat', url, error: String(e) },
        );
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new FxProviderError(
            'RATE_LIMITED',
            'Legal FX provider rate limit',
            {
              providerId: 'legal-fiat',
              url,
              status: res.status,
              retryAfterMs: parseRetryAfterMs(res),
            },
          );
        }

        throw new FxProviderError(
          'PROVIDER_ERROR',
          `Legal FX provider HTTP error ${res.status}`,
          { providerId: 'legal-fiat', url, status: res.status },
        );
      }

      const raw = await res.json();

      let normalized: NormalizedFiatFxRates;
      try {
        normalized = this.config.transform(raw);
      } catch (e) {
        throw new FxProviderError(
          'PROVIDER_ERROR',
          'Error while transforming legal FX rates',
          { providerId: 'legal-fiat', url, error: String(e) },
        );
      }

      this.cache = normalized;
      this.lastFetchedAt = NOW;

      return normalized;
    } catch (e) {
      if (e instanceof FxProviderError) throw e;

      throw new FxProviderError(
        'PROVIDER_ERROR',
        'Unexpected error while loading legal FX rates',
        { providerId: 'legal-fiat', url, error: String(e) },
      );
    }
  }

  async getPair(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null> {
    if (typeof from !== 'string' || typeof to !== 'string') return null;

    const FROM = from as CurrencyCode;
    const TO = to as CurrencyCode;

    const { base, quotes } = await this.loadRates();

    if (FROM === TO) {
      return {
        base: FROM,
        quote: TO,
        price: 1,
        meta: {
          providerId: 'legal-fiat',
          providerLabel: 'Legal FX',
          marketKind: 'FIAT',
          marketSymbol: `${FROM}/${TO}`,
        },
      };
    }

    const BASE = base;
    const Q_FROM = quotes[FROM];
    const Q_TO = quotes[TO];

    if (FROM === BASE && Q_TO != null) {
      const PRICE = 1 / Q_TO;
      if (!Number.isFinite(PRICE) || PRICE <= 0) return null;

      return {
        base: FROM,
        quote: TO,
        price: PRICE,
        meta: {
          providerId: 'legal-fiat',
          providerLabel: 'Legal FX',
          marketKind: 'FIAT',
          marketSymbol: `${FROM}/${TO}`,
        },
      };
    }

    if (TO === BASE && Q_FROM != null) {
      const PRICE = Q_FROM;
      if (!Number.isFinite(PRICE) || PRICE <= 0) return null;

      return {
        base: FROM,
        quote: TO,
        price: PRICE,
        meta: {
          providerId: 'legal-fiat',
          providerLabel: 'Legal FX',
          marketKind: 'FIAT',
          marketSymbol: `${FROM}/${TO}`,
        },
      };
    }

    if (Q_FROM != null && Q_TO != null) {
      const PRICE = Q_FROM / Q_TO;
      if (!Number.isFinite(PRICE) || PRICE <= 0) return null;

      return {
        base: FROM,
        quote: TO,
        price: PRICE,
        meta: {
          providerId: 'legal-fiat',
          providerLabel: 'Legal FX',
          marketKind: 'FIAT',
          marketSymbol: `${FROM}/${TO}`,
        },
      };
    }

    return null;
  }
}
