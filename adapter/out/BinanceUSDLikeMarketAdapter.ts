import type { MarketPort } from '../../application/port/out/MarketPort';
import type { CurrencyCode } from '../../domain/currency';
import { isCrypto, isStable } from '../../domain/currency';
import type { ExchangeRate } from '../../domain/exchange-rate';
import { FxProviderError } from '../../domain/fx-result';
import { createSmartFetch, type FetchLike, parseRetryAfterMs } from '../../util/http';

const DEFAULT_BINANCE_FETCH: FetchLike = createSmartFetch(fetch, {
  key: 'binance',
  // Binance uses request-weight limits; keep a conservative default throttle.
  // https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits
  rateLimit: { minTimeMs: 100 }, // 10 req/sec (safe margin)
  retry: {
    maxRetries: 4,
    baseBackoffMs: 300,
    maxBackoffMs: 6000,
    retryOnStatuses: [429, 418, 500, 502, 503, 504],
  },
});

export class BinanceUSDLikeMarketAdapter implements MarketPort {
  constructor(
    private readonly apiUrl: string,
    private readonly fetchImpl: FetchLike = DEFAULT_BINANCE_FETCH,
  ) { }

  async getPair(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null> {
    if (!isStable(to)) return null;
    if (!isCrypto(from)) return null;

    const symbol = `${from}${to}`;
    const url = `${this.apiUrl}?symbol=${symbol}`;

    let res: Response;
    try {
      res = await this.fetchImpl(url);
    } catch (e) {
      throw new FxProviderError('NETWORK_ERROR', `Binance network error`, {
        providerId: 'binance-usd-like',
        url,
        error: String(e),
      });
    }

    let body: any = undefined;
    try {
      body = await res.json();
    } catch { }

    if (!res.ok) {
      if (res.status === 429 || res.status === 418) {
        throw new FxProviderError('RATE_LIMITED', `Binance rate limited`, {
          providerId: 'binance-usd-like',
          url,
          status: res.status,
          retryAfterMs: parseRetryAfterMs(res),
        });
      }

      const isNoMarket =
        body &&
        typeof body === 'object' &&
        body.code === -1121 &&
        typeof body.msg === 'string' &&
        body.msg.includes('Invalid symbol');

      if (isNoMarket) {
        throw new FxProviderError('NO_MARKET', `Binance: no such market ${symbol}`, {
          providerId: 'binance-usd-like',
          url,
          body,
        });
      }

      throw new FxProviderError(
        'PROVIDER_ERROR',
        `Binance HTTP error ${res.status} for ${symbol}`,
        { providerId: 'binance-usd-like', url, status: res.status, body },
      );
    }

    if (!body || typeof body.price === 'undefined') return null;

    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      base: from,
      quote: to,
      price,
      meta: {
        providerId: 'binance-usd-like',
        providerLabel: 'Binance',
        marketKind: 'CRYPTO',
        marketSymbol: symbol,
      },
    };
  }
}
