import type { MarketPort } from '../../application/port/out/MarketPort';
import type { CurrencyCode } from '../../domain/currency';
import type { ExchangeRate } from '../../domain/exchange-rate';
import { isStable, isCrypto } from '../../domain/currency';

/**
 * BinanceUSDLikeMarketAdapter
 * Supports: CRYPTO -> STABLE
 */
export class BinanceUSDLikeMarketAdapter implements MarketPort {
  constructor(private readonly apiUrl: string) { }

  async getPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ExchangeRate | null> {
    // Adapter Rule 1: Quote must be Stable (USDT, USDC)
    if (!isStable(to)) return null;

    // Adapter Rule 2: Base must be Crypto (BTC, ETH...)
    if (!isCrypto(from)) return null;

    const SYMBOL = `${from}${to}`; // e.g. BTCUSDT

    try {
      const res = await fetch(`${this.apiUrl}?symbol=${SYMBOL}`);
      const data = await res.json();

      if (!data || typeof data.price === 'undefined') {
        return null;
      }

      const price = Number(data.price);
      if (!Number.isFinite(price)) {
        return null;
      }

      return {
        base: from,
        quote: to,
        price,
      };
    } catch (e) {
      return null;
    }
  }
}