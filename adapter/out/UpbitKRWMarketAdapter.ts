import type { MarketPort } from '../../application/port/out/MarketPort';
import type { CurrencyCode } from '../../domain/currency';
import type { ExchangeRate } from '../../domain/exchange-rate';
import { FxProviderError } from '../../domain/fx-result';
import { createSmartFetch, type FetchLike, parseRetryAfterMs } from '../../util/http';

const DEFAULT_UPBIT_FETCH: FetchLike = createSmartFetch(fetch, {
  key: 'upbit',
  // Upbit ticker: max 10 req/sec → add margin for real environment
  // https://docs.upbit.com/kr/reference/rate-limits
  rateLimit: { minTimeMs: 150 }, // ~6.7 req/sec
  retry: {
    maxRetries: 4,
    baseBackoffMs: 400,
    maxBackoffMs: 8000,
    retryOnStatuses: [429, 500, 502, 503, 504],
  },
});


export class UpbitKRWMarketAdapter implements MarketPort {
  constructor(
    private readonly apiUrl: string,
    private readonly fetchImpl: FetchLike = DEFAULT_UPBIT_FETCH,
  ) { }

  async getPair(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate | null> {
    if (to !== 'KRW') return null;

    const marketSymbol = `KRW-${from}`;
    const url = `${this.apiUrl}?markets=${marketSymbol}`;

    let res: Response;
    try {
      res = await this.fetchImpl(url);
    } catch (e) {
      throw new FxProviderError('NETWORK_ERROR', `Upbit network error`, {
        providerId: 'upbit-krw',
        url,
        error: String(e),
      });
    }

    let body: any = undefined;
    try {
      body = await res.json();
    } catch {
      // ok
    }

    if (!res.ok) {
      if (res.status === 429) {
        throw new FxProviderError('RATE_LIMITED', `Upbit rate limited`, {
          providerId: 'upbit-krw',
          url,
          status: res.status,
          retryAfterMs: parseRetryAfterMs(res),
        });
      }

      const isNoMarket =
        res.status === 404 &&
        body &&
        typeof body === 'object' &&
        body.error &&
        typeof body.error === 'object' &&
        body.error.name === 404 &&
        typeof body.error.message === 'string' &&
        body.error.message.includes('Code not found');

      if (isNoMarket) {
        throw new FxProviderError('NO_MARKET', `Upbit: no such market ${marketSymbol}`, {
          providerId: 'upbit-krw',
          url,
          body,
        });
      }

      throw new FxProviderError(
        'PROVIDER_ERROR',
        `Upbit HTTP error ${res.status} for ${marketSymbol}`,
        { providerId: 'upbit-krw', url, status: res.status, body },
      );
    }

    if (!Array.isArray(body) || body.length === 0 || typeof body[0].trade_price !== 'number') {
      return null;
    }

    const price = body[0].trade_price;

    return {
      base: from,
      quote: 'KRW',
      price,
      meta: {
        providerId: 'upbit-krw',
        providerLabel: 'Upbit',
        marketKind: 'CRYPTO',
        marketSymbol,
      },
    };
  }
}
