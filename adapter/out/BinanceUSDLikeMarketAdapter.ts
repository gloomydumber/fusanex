import type { MarketPort } from '../../application/port/out/MarketPort';
import type { CurrencyCode } from '../../domain/currency';
import { isStable, isCrypto } from '../../domain/currency';
import type { ExchangeRate } from '../../domain/exchange-rate';
import { FxProviderError } from '../../domain/fx-result';

/**
 * BinanceUSDLikeMarketAdapter
 * Supports: CRYPTO -> STABLE (USDT, USDC, etc.)
 */
export class BinanceUSDLikeMarketAdapter implements MarketPort {
  constructor(private readonly apiUrl: string) { }

  async getPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ExchangeRate | null> {
    // Adapter Rule 1: Quote must be Stable (USDT, USDC, etc.)
    if (!isStable(to)) return null;

    // Adapter Rule 2: Base must be Crypto (BTC, ETH...)
    if (!isCrypto(from)) return null;

    const SYMBOL = `${from}${to}`; // e.g. BTCUSDT
    const url = `${this.apiUrl}?symbol=${SYMBOL}`;

    try {
      const res = await fetch(url).catch((e) => {
        // Low-level network error (DNS, timeout, etc.)
        throw new FxProviderError(
          'NETWORK_ERROR',
          `Network error while calling Binance for ${SYMBOL}`,
          {
            providerId: 'binance-usd-like',
            url,
            error: String(e),
          },
        );
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new FxProviderError(
            'RATE_LIMITED',
            `Binance rate limit while fetching ${SYMBOL}`,
            {
              providerId: 'binance-usd-like',
              url,
              status: res.status,
            },
          );
        }

        throw new FxProviderError(
          'PROVIDER_ERROR',
          `Binance HTTP error ${res.status} for ${SYMBOL}`,
          {
            providerId: 'binance-usd-like',
            url,
            status: res.status,
          },
        );
      }

      const data = await res.json();

      if (!data || typeof (data as any).price === 'undefined') {
        // No usable quote → treat as "no market"
        return null;
      }

      const price = Number((data as any).price);
      if (!Number.isFinite(price) || price <= 0) {
        // Weird price → treat as "no market"
        return null;
      }

      return {
        base: from,
        quote: to,
        price,
        meta: {
          providerId: 'binance-usd-like',
          providerLabel: 'Binance',
          marketKind: 'CRYPTO',
          marketSymbol: SYMBOL,
        },
      };
    } catch (e) {
      if (e instanceof FxProviderError) {
        throw e;
      }

      throw new FxProviderError(
        'PROVIDER_ERROR',
        `Unexpected error while parsing Binance response for ${SYMBOL}`,
        {
          providerId: 'binance-usd-like',
          symbol: SYMBOL,
          error: String(e),
        },
      );
    }
  }
}
