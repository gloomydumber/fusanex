export type FiatCurrencyCode = 'USD' | 'KRW' | 'JPY' | 'EUR' | 'CNY' | 'VND';

export type StableCurrencyCode = 'USDT' | 'USDC';

export const STABLE_ASSETS: StableCurrencyCode[] = ['USDT', 'USDC'];

export function isStableCurrencyCode(value: string): value is StableCurrencyCode {
  return (STABLE_ASSETS as string[]).includes(value);
}

export type CurrencyCode = FiatCurrencyCode | StableCurrencyCode;

