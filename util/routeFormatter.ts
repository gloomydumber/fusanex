import type { RouteHop } from '../domain/route-hop';

export interface RouteFormatOptions {
  includeRates?: boolean;
  maxDecimals?: number;

  /**
   * If true (default), show the underlying market quote's rate
   * (e.g., BTCUSDT @ 60000 even when the hop is USDT -> BTC).
   *
   * If false, show the "leg" rate (to per from), which is less intuitive
   * for humans when the hop is inverted.
   */
  showUnderlyingRate?: boolean;

  /**
   * If true (default), append "(inverted)" when the hop uses an inverted
   * market quote.
   */
  showInvertedFlag?: boolean;
}

/**
 * Format a sequence of hops into a readable inline string.
 *
 * Example (underlying rate mode):
 *   USDT -[Binance BTCUSDT @ 60000 (inverted)]-> BTC
 *   ==> BTC -[Upbit KRW-BTC @ 134777000]-> KRW
 */
export function formatHopsInline(
  hops: RouteHop[],
  options: RouteFormatOptions = {},
): string {
  if (!hops || hops.length === 0) {
    return '(no hops)';
  }

  const {
    includeRates = false,
    maxDecimals = 8,
    showUnderlyingRate = true,
    showInvertedFlag = true,
  } = options;

  const parts: string[] = [];
  let prevProvider: string | null = null;

  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];

    const provider =
      hop.providerLabel ??
      hop.providerId ??
      'unknown';

    const providerKey = hop.providerId ?? provider;
    const isSameProvider =
      prevProvider !== null && prevProvider === providerKey;

    // Same provider: " -> "
    // Different provider: " ==> "
    const connector =
      i === 0
        ? ''
        : isSameProvider
          ? ' -> '
          : ' ==> ';

    // Decide which numeric rate to show:
    // - underlying market quote (e.g., BTCUSDT @ 60000)
    // - or leg rate (USDT -> BTC @ 1/60000)
    const rateToShow = showUnderlyingRate && hop.inverted
      ? (hop.rate !== 0 ? 1 / hop.rate : Infinity)
      : hop.rate;

    // Base label: provider + optional symbol
    let providerSegment = provider;
    if (hop.marketSymbol) {
      providerSegment = `${provider} ${hop.marketSymbol}`;
    }

    // Add rate if requested
    if (includeRates) {
      const rateStr = formatRate(rateToShow, maxDecimals);
      providerSegment += ` @ ${rateStr}`;
    }

    // Mark inverted if we used an inverted market quote
    if (showInvertedFlag && hop.inverted) {
      providerSegment += ' (inverted)';
    }

    const segment = `${hop.from} -[${providerSegment}]-> ${hop.to}`;

    parts.push(connector + segment);
    prevProvider = providerKey;
  }

  return parts.join('');
}

function formatRate(rate: number, maxDecimals: number): string {
  if (!Number.isFinite(rate)) return 'NaN';
  const fixed = rate.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, '');
}
