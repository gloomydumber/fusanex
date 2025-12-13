import type { MarketPort } from '../../application/port/out/MarketPort';
import type { ExchangeRate } from '../../domain/exchange-rate';
import type { CurrencyCode } from '../../domain/currency';
import { FxProviderError } from '../../domain/fx-result';

/**
 * UpbitKRWMarketAdaptor
 * Supports: ANY -> KRW
 */
export class UpbitKRWMarketAdapter implements MarketPort {
  constructor(private readonly apiUrl: string) { }

  async getPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ExchangeRate | null> {
    // Adapter Rule: Quote must be KRW
    if (to !== 'KRW') return null;

    const marketSymbol = `KRW-${from}`;

    try {
      const url = `${this.apiUrl}?markets=${marketSymbol}`;
      const res = await fetch(url).catch((e) => {
        // Low-level network error (DNS, timeout, etc.)
        throw new FxProviderError(
          'NETWORK_ERROR',
          `Network error while calling Upbit for ${marketSymbol}`,
          {
            providerId: 'upbit-krw',
            url,
            error: String(e),
          },
        );
      });

      if (!res.ok) {
        // HTTP-level error
        if (res.status === 429) {
          throw new FxProviderError(
            'RATE_LIMITED',
            `Upbit rate limit while fetching ${marketSymbol}`,
            {
              providerId: 'upbit-krw',
              url,
              status: res.status,
            },
          );
        }

        throw new FxProviderError(
          'PROVIDER_ERROR',
          `Upbit HTTP error ${res.status} for ${marketSymbol}`,
          {
            providerId: 'upbit-krw',
            url,
            status: res.status,
          },
        );
      }

      const data = await res.json();

      // "No data" / unexpected shape – treat as "no market"
      if (
        !Array.isArray(data) ||
        data.length === 0 ||
        typeof data[0]?.trade_price !== 'number'
      ) {
        return null;
      }

      const price = data[0].trade_price as number;

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
    } catch (e) {
      // If it's already an FxProviderError, just rethrow
      if (e instanceof FxProviderError) {
        throw e;
      }

      // Any other unexpected error from JSON parsing, etc.
      throw new FxProviderError(
        'PROVIDER_ERROR',
        `Unexpected error while parsing Upbit response for ${marketSymbol}`,
        {
          providerId: 'upbit-krw',
          marketSymbol,
          error: String(e),
        },
      );
    }
  }
}
