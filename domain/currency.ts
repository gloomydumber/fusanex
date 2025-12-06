export type FiatCurrencyCode = 'USD' | 'KRW' | 'JPY' | 'EUR' | 'CNY' | 'VND';

export type StableCurrencyCode = 'USDT' | 'USDC';

export const STABLE_ASSETS: StableCurrencyCode[] = ['USDT', 'USDC'];

/**
 * Returns true if the given currency code is a Stable Token currency
 * (i.e. a stablecoin like USDT/USDC).
 */
export function isStableCurrencyCode(value: string): value is StableCurrencyCode {
  return (STABLE_ASSETS as string[]).includes(value);
}

/**
 * Returns true if the given currency code is a fiat currency
 * (i.e. not a stablecoin like USDT/USDC).
 */
export function isFiatCurrencyCode(
  value: FiatCurrencyCode | StableCurrencyCode,
): value is FiatCurrencyCode {
  return !(STABLE_ASSETS as string[]).includes(value as string);
}


export type CurrencyCode = FiatCurrencyCode | StableCurrencyCode;

