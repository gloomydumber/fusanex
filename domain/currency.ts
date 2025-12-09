export type FiatCurrency = 'USD' | 'KRW' | 'JPY' | 'EUR' | 'CNY' | 'VND';
export type StableCurrency = 'USDT' | 'USDC';
export type CryptoCurrency = 'BTC' | 'ETH' | 'XRP' | 'BNB' | 'SOL';

// Unified Type
export type CurrencyCode = FiatCurrency | StableCurrency | CryptoCurrency;

// Runtime Arrays
export const FIAT_ASSETS: FiatCurrency[] = ['USD', 'KRW', 'JPY', 'EUR', 'CNY', 'VND'];
export const STABLE_ASSETS: StableCurrency[] = ['USDT', 'USDC'];
export const CRYPTO_ASSETS: CryptoCurrency[] = ['BTC', 'ETH', 'XRP', 'BNB', 'SOL'];

// Type Guards
export function isFiat(code: string): code is FiatCurrency {
  return FIAT_ASSETS.includes(code as FiatCurrency);
}

export function isStable(code: string): code is StableCurrency {
  return STABLE_ASSETS.includes(code as StableCurrency);
}

export function isCrypto(code: string): code is CryptoCurrency {
  return CRYPTO_ASSETS.includes(code as CryptoCurrency);
}

export function isFiatOrStable(code: string): boolean {
  return isFiat(code) || isStable(code);
}