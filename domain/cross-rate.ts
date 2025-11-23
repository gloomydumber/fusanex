import type { ExchangeRate } from './exchange-rate';

export function computeCrossRate(
  baseToQuoteA: ExchangeRate,   // e.g. BTC/KRW
  baseToQuoteB: ExchangeRate,   // e.g. BTC/USDT
): ExchangeRate {
  if (baseToQuoteA.base !== baseToQuoteB.base) {
    throw new Error('Both rates must share the same base asset');
  }

  // ex:
  //   A: BTC/KRW → quote "KRW"
  //   B: BTC/USDT → quote "USDT"
  const quoteA = baseToQuoteA.quote;   // KRW
  const quoteB = baseToQuoteB.quote;   // USDT

  const price = baseToQuoteA.price / baseToQuoteB.price;

  return {
    base: quoteB,   // USDT
    quote: quoteA,  // KRW
    price,          // USDT/KRW
  };
}
