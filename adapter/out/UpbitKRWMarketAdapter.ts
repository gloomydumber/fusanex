import type { MarketPort } from '../../application/port/out/MarketPort';
import type { ExchangeRate } from '../../domain/exchange-rate';
import type { CurrencyCode } from '../../domain/currency';

/**
 * UpbitKRWMarketAdaptor
 * Supports: ANY -> KRW
 */
export class UpbitKRWMarketAdaptor implements MarketPort {
  constructor(private readonly apiUrl: string) { }

  async getPair(
    from: CurrencyCode,
    to: CurrencyCode,
  ): Promise<ExchangeRate | null> {
    // Adapter Rule: Quote must be KRW
    if (to !== 'KRW') return null;

    // Upbit uses "KRW-ASSET" for KRW-quoted markets.
    const marketSymbol = `KRW-${from}`;

    try {
      const res = await fetch(`${this.apiUrl}?markets=${marketSymbol}`);
      const data = await res.json();

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
      };
    } catch (e) {
      return null;
    }
  }
}