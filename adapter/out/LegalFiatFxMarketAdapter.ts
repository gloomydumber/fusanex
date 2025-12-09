import type { MarketPort } from '../../application/port/out/MarketPort';
import type { ExchangeRate } from '../../domain/exchange-rate';
import type { CurrencyCode } from '../../domain/currency';
import type {
  NormalizedFiatFxRates,
  FiatFxTransform,
} from '../../domain/fiat-fx';

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
 *
 * Raw (shortened) example:
 * {
 *   "assets": [
 *     {
 *       "id": "FOREX-KRWUSD",
 *       "currencyCode": "USD",
 *       "basePrice": 1472.0,
 *       ...
 *     },
 *     ...
 *   ]
 * }
 *
 * We normalize it as:
 *   {
 *     base: 'KRW',
 *     quotes: {
 *       USD: 1472.0, // 1 USD = 1472 KRW
 *       JPY:  10.3,
 *       ...
 *     }
 *   }
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
 *
 * It works on normalized FX data:
 *   base: CurrencyCode
 *   quotes[code]: base per 1 code
 *
 * For any two fiat currencies FROM and TO in {base} ∪ keys(quotes),
 * we derive FROM/TO as:
 *
 * - If FROM === TO:
 *     price = 1
 * - If FROM === base, TO in quotes:
 *     1 FROM (base) = ? TO
 *     quotes[TO] = base per 1 TO
 *     1 TO = quotes[TO] * base
 *     => 1 base = 1 / quotes[TO] TO
 * - If TO === base, FROM in quotes:
 *     quotes[FROM] = base per 1 FROM
 *     => 1 FROM = quotes[FROM] base
 * - If both FROM and TO are in quotes:
 *     quotes[FROM] = base per FROM
 *     quotes[TO]   = base per TO
 *     => 1 FROM = quotes[FROM] base = (quotes[FROM] / quotes[TO]) TO
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

    const res = await fetch(this.config.endpoint);
    const raw = await res.json();
    const normalized = this.config.transform(raw);

    this.cache = normalized;
    this.lastFetchedAt = NOW;

    return normalized;
  }

  async getPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ExchangeRate | null> {
    // caller must only pass fiat codes; base assets are not supported.
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
      };
    }

    const BASE = base;
    const Q_FROM = quotes[FROM];
    const Q_TO = quotes[TO];

    // FROM === BASE, TO in quotes
    if (FROM === BASE && Q_TO != null) {
      // quotes[TO] = BASE per 1 TO
      // 1 BASE = 1 / quotes[TO] TO
      const PRICE = 1 / Q_TO;
      if (!Number.isFinite(PRICE) || PRICE <= 0) return null;

      return {
        base: FROM,
        quote: TO,
        price: PRICE,
      };
    }

    // TO === BASE, FROM in quotes
    if (TO === BASE && Q_FROM != null) {
      // quotes[FROM] = BASE per 1 FROM
      // 1 FROM = quotes[FROM] BASE
      const PRICE = Q_FROM;
      if (!Number.isFinite(PRICE) || PRICE <= 0) return null;

      return {
        base: FROM,
        quote: TO,
        price: PRICE,
      };
    }

    // Both FROM and TO are not BASE, but both exist in quotes:
    // quotes[FROM] = BASE per 1 FROM
    // quotes[TO]   = BASE per 1 TO
    // 1 FROM = quotes[FROM] BASE = (quotes[FROM] / quotes[TO]) TO
    if (Q_FROM != null && Q_TO != null) {
      const PRICE = Q_FROM / Q_TO;
      if (!Number.isFinite(PRICE) || PRICE <= 0) return null;

      return {
        base: FROM,
        quote: TO,
        price: PRICE,
      };
    }

    return null;
  }
}
