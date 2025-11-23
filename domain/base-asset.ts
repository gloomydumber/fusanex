export type BaseAsset = 'BTC' | 'ETH' | 'XRP' | 'BNB' | 'SOL';

export const BASE_ASSETS: BaseAsset[] = ['BTC', 'ETH', 'XRP', 'BNB', 'SOL'];

export function isBaseAsset(value: string): value is BaseAsset {
  return (BASE_ASSETS as string[]).includes(value);
}
