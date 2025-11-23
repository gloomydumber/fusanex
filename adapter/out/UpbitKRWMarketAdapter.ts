// adapter/out/UpbitKRWMarketAdapter.ts
import type { MarketPort } from '../../application/port/out/MarketPort';
import type { BaseAsset } from '../../domain/base-asset';
import type { ExchangeRate } from '../../domain/exchange-rate';
import type { CurrencyCode } from '../../domain/currency';

/**
 * UpbitKRWMarketAdaptor
 *
 * "KRW spot market on Upbit".
 *
 * Responsibilities:
 * - Given (from, to), returns a spot price for from/to if:
 *     - to === 'KRW'
 *     - and Upbit has a KRW-quoted market for `from` (e.g. BTC/KRW, ETH/KRW, USDT/KRW).
 *
 * - Does NOT try to validate whether `from` is one of BaseAsset, stablecoin, etc.
 *   It simply assumes the caller passes a symbol that Upbit understands and
 *   returns null if the HTTP response is not usable.
 *
 * Examples:
 *   getPair('BTC', 'KRW')   -> KRW-BTC
 *   getPair('USDT', 'KRW')  -> KRW-USDT
 */
export class UpbitKRWMarketAdaptor implements MarketPort {
  constructor(private readonly apiUrl: string) { } // e.g. 'https://api.upbit.com/v1/ticker'

  async getPair(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset,
  ): Promise<ExchangeRate | null> {
    // This adapter only supports {ASSET}/KRW pairs (e.g. BTC/KRW, ETH/KRW, USDT/KRW).
    if (to !== 'KRW') return null;

    // TODO: Check this step actually needed or not
    // For cross-rate, we only consider real BaseAssets here (BTC, ETH, ...).
    // if (!isBaseAsset(from)) return null;

    // Upbit uses "KRW-ASSET" for KRW-quoted markets.
    const base = from;
    const marketSymbol = `KRW-${base}`;

    const res = await fetch(`${this.apiUrl}?markets=${marketSymbol}`);
    const data = await res.json();

    // Upbit ticker example: [{ trade_price: 100000000, ... }]
    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      typeof data[0]?.trade_price !== 'number'
    ) {
      // If the response is not what we expect, treat it as "pair not supported"
      return null;
    }

    const price = data[0].trade_price as number;

    return {
      base,        // e.g. 'BTC', 'ETH', 'USDT'
      quote: 'KRW',
      price,       // e.g. 1300 (KRW per 1 USDT) or 100000000 (KRW per 1 BTC)
    };
  }
}
