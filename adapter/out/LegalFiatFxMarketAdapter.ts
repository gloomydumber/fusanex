import type { MarketPort } from '../../application/port/out/MarketPort';
import type { ExchangeRate } from '../../domain/exchange-rate';
import type { CurrencyCode } from '../../domain/currency';
import type {
  NormalizedFiatFxRates,
  FiatFxTransform,
} from '../../domain/fiat-fx';
import { FxProviderError } from '../../domain/fx-result';

/**
 * Example Stockplus FOREX endpoint.
 * This is NOT an official public API; users should opt-in explicitly if they
 * want to rely on it.
 */
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

/**
 * Default transform for the Stockplus endpoint.
 */
export const stockplusFiatFxTransform: FiatFxTransform = (
  raw: unknown,
): NormalizedFiatFxRates => {
  const BASE: CurrencyCode = 'KRW';
  const QUOTES: Record<CurrencyCode, number> = {} as Record<
    CurrencyCode,
    number
  >;

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

    // Stockplus: basePrice is "KRW per `currencyUnit` of code".
    // Fusanex wants: "KRW per 1 code".
    const unit =
      typeof currencyUnit === 'number' && currencyUnit > 0
        ? currencyUnit
        : 1;

    QUOTES[code] = basePrice / unit;
  }

  return { base: BASE, quotes: QUOTES };
};

export interface LegalFiatFxAdapterConfig {
  endpoint: string;
  transform: FiatFxTransform;
  ttlMs?: number;
}

/**
 * LegalFiatFxMarketAdapter:
 *
 * Used ONLY by fiatRate(), not by crypto methods.
 */
export class LegalFiatFxMarketAdapter implements MarketPort {
  private cache: NormalizedFiatFxRates | null = null;
  private lastFetchedAt = 0;
  private readonly ttlMs: number;

  constructor(private readonly config: LegalFiatFxAdapterConfig) {
    this.ttlMs = config.ttlMs ?? 60_000;
  }

  private async loadRates(): Promise<NormalizedFiatFxRates> {
    const NOW = Date.now();

    if (this.cache && NOW - this.lastFetchedAt < this.ttlMs) {
      return this.cache;
    }

    const url = this.config.endpoint;

    try {
      const res = await fetch(url).catch((e) => {
        throw new FxProviderError(
          'NETWORK_ERROR',
          'Network error while fetching legal FX rates',
          {
            providerId: 'legal-fiat',
            url,
            error: String(e),
          },
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
            },
          );
        }

        throw new FxProviderError(
          'PROVIDER_ERROR',
          `Legal FX provider HTTP error ${res.status}`,
          {
            providerId: 'legal-fiat',
            url,
            status: res.status,
          },
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
          {
            providerId: 'legal-fiat',
            url,
            error: String(e),
          },
        );
      }

      this.cache = normalized;
      this.lastFetchedAt = NOW;

      return normalized;
    } catch (e) {
      if (e instanceof FxProviderError) {
        throw e;
      }

      throw new FxProviderError(
        'PROVIDER_ERROR',
        'Unexpected error while loading legal FX rates',
        {
          providerId: 'legal-fiat',
          url,
          error: String(e),
        },
      );
    }
  }

  async getPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ExchangeRate | null> {
    // Caller must only pass fiat codes; base assets not supported here.
    if (typeof from !== 'string' || typeof to !== 'string') {
      return null;
    }

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

    // FROM === BASE, TO in quotes
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

    // TO === BASE, FROM in quotes
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

    // Both FROM and TO are not BASE, but both exist in quotes:
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

    // No usable quote for this pair
    return null;
  }
}
