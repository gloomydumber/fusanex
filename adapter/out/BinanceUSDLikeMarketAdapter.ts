import type { MarketPort } from '../../application/port/out/MarketPort';
import type { BaseAsset } from '../../domain/base-asset';
import { isBaseAsset } from '../../domain/base-asset';
import type { CurrencyCode } from '../../domain/currency';
import type { ExchangeRate } from '../../domain/exchange-rate';

export interface BinanceUSDLikeOptions {
  /**
   * Stable / USD-like quote asset symbol.
   * Examples: 'USDT', 'USDC', 'FDUSD', ...
   *
   * Default: 'USDT'
   */
  stable?: string;
}

/**
 * BinanceUSDLikeMarketAdapter
 *
 * Conceptually: "BaseAsset / Stable" market on Binance.
 *
 * Responsibilities:
 * - Given (from, to), returns a spot price for BaseAsset / STABLE, where:
 *     - `from` must be a BaseAsset (e.g. BTC, ETH, ...)
 *     - `to`     is the configured stable quote (default: 'USDT')
 *
 * - This adapter is used as the "USD-like leg" in crypto cross-rate
 *   calculations (e.g. BTC/USDT, ETH/USDT). It is *not* meant to cover all
 *   possible Binance pairs.
 *
 * Examples:
 *   getPair('BTC', 'USDT')  -> BTCUSDT
 *   getPair('ETH', 'USDT')  -> ETHUSDT
 */
export class BinanceUSDLikeMarketAdapter implements MarketPort {
  private readonly STABLE: string;

  constructor(
    private readonly apiUrl: string, // e.g. 'https://api.binance.com/api/v3/ticker/price'
    options: BinanceUSDLikeOptions = {},
  ) {
    this.STABLE = options.stable ?? 'USDT';
  }

  async getPair(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset,
  ): Promise<ExchangeRate | null> {
    // This adapter only supports BASE/STABLE (default: BASE/USDT).
    if (to !== this.STABLE) return null;

    // TODO: Check this step actually needed or not
    // For cross-rate, we only consider real BaseAssets here (BTC, ETH, ...).
    // if (!isBaseAsset(from)) return null;

    const BASE = from as BaseAsset;
    const SYMBOL = `${BASE}${this.STABLE}`; // e.g. BTCUSDT, ETHUSDT

    const res = await fetch(`${this.apiUrl}?symbol=${SYMBOL}`);
    const data = await res.json();

    // Binance ticker example: { symbol: 'BTCUSDT', price: '100000.00000000' }
    if (!data || typeof data.price === 'undefined') {
      return null;
    }

    const price = Number(data.price);
    if (!Number.isFinite(price)) {
      return null;
    }

    return {
      base: BASE,
      quote: this.STABLE,
      price,
    };
  }
}