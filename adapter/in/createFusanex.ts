import { FusanexService } from '../../application/service/FusanexService';
import type { FusanexPort } from '../../application/port/in/FusanexPort';
import type { BaseAsset } from '../../domain/base-asset';
import type { MarketPort } from '../../application/port/out/MarketPort';

import { UpbitKRWMarketAdaptor } from '../out/UpbitKRWMarketAdapter';
import { BinanceUSDLikeMarketAdapter } from '../out/BinanceUSDLikeMarketAdapter';

import type {
  ProviderMap,
  KRWProviderId,
  USDProviderId,
} from '../../domain/providers';

import type { FiatFxTransform } from '../../domain/fiat-fx';
import {
  LegalFiatFxMarketAdapter,
  STOCKPLUS_FIAT_FX_ENDPOINT,
  stockplusFiatFxTransform,
} from '../out/LegalFiatFxMarketAdapter';

// Default public endpoints for v0 (crypto markets)
const DEFAULT_UPBIT_TICKER_ENDPOINT = 'https://api.upbit.com/v1/ticker';
const DEFAULT_BINANCE_TICKER_ENDPOINT =
  'https://api.binance.com/api/v3/ticker/price';

const DEFAULT_PROVIDERS: ProviderMap = {
  KRW: 'Upbit',
  USD: 'Binance',
};

export interface FiatFxConfig {
  /**
   * Legal FX provider configuration.
   *
   * NOTE:
   * - Presence of this object means "fiat FX is enabled".
   * - `endpoint` and `transform` are REQUIRED when fiatFx is provided.
   * - You can use the exported STOCKPLUS_FIAT_FX_ENDPOINT + stockplusFiatFxTransform
   *   if you want to rely on the Stockplus endpoint.
   */
  endpoint: string;
  transform: FiatFxTransform;
  ttlMs?: number;
}

export interface FusanexConfig {
  baseAsset?: BaseAsset;

  upbitApiUrl?: string;
  binanceApiUrl?: string;

  providers?: ProviderMap;

  /**
   * Optional legal fiat FX configuration.
   *
   * - If omitted: a default Stockplus fiat FX provider will be used automatically.
   * - If provided: a LegalFiatFxMarketAdapter will be created using this configuration.
   */
  fiatFx?: FiatFxConfig;
}

// --- internal builders ---

function buildCryptoMarkets(config: FusanexConfig): MarketPort[] {
  const providers: ProviderMap = {
    ...DEFAULT_PROVIDERS,
    ...(config.providers ?? {}),
  };

  const markets: MarketPort[] = [];

  const KRW_PROVIDER: KRWProviderId | undefined = providers.KRW;
  if (KRW_PROVIDER) {
    switch (KRW_PROVIDER) {
      case 'Upbit': {
        const UPBIT_API_URL =
          config.upbitApiUrl ?? DEFAULT_UPBIT_TICKER_ENDPOINT;
        markets.push(new UpbitKRWMarketAdaptor(UPBIT_API_URL));
        break;
      }
      case 'Bithumb': {
        throw new Error(
          'KRW provider "Bithumb" is not implemented yet in this version of fusanex.',
        );
      }
      default: {
        const UNKNOWN = KRW_PROVIDER satisfies never;
        throw new Error(
          `Unknown KRW provider: ${String(UNKNOWN)} (this should be unreachable)`,
        );
      }
    }
  }

  const USD_PROVIDER: USDProviderId | undefined = providers.USD;
  if (USD_PROVIDER) {
    switch (USD_PROVIDER) {
      case 'Binance': {
        const BINANCE_API_URL =
          config.binanceApiUrl ?? DEFAULT_BINANCE_TICKER_ENDPOINT;
        markets.push(
          new BinanceUSDLikeMarketAdapter(
            BINANCE_API_URL),
        );
        break;
      }
      case 'Coinbase': {
        throw new Error(
          'USD provider "Coinbase" is not implemented yet in this version of fusanex.',
        );
      }
      default: {
        const UNKNOWN = USD_PROVIDER satisfies never;
        throw new Error(
          `Unknown USD provider: ${String(UNKNOWN)} (this should be unreachable)`,
        );
      }
    }
  }

  return markets;
}

function buildFiatMarkets(config: FusanexConfig): MarketPort[] {
  // If user gave custom fiatFx, use it.
  // Otherwise, fall back to Stockplus as the default provider.
  const fiatFx = config.fiatFx ?? {
    endpoint: STOCKPLUS_FIAT_FX_ENDPOINT,
    transform: stockplusFiatFxTransform,
  };

  const { endpoint, transform, ttlMs } = fiatFx;

  if (!endpoint || !transform) {
    throw new Error(
      'fiatFx configuration requires both `endpoint` and `transform`.',
    );
  }

  return [
    new LegalFiatFxMarketAdapter({
      endpoint,
      transform,
      ttlMs,
    }),
  ];
}

/**
 * Factory for creating a FusanexPort implementation.
 *
 * All config fields are optional:
 * - Crypto:
 *     baseAsset: 'BTC' by default
 *     providers: { KRW: 'Upbit', USD: 'Binance' } by default
 * - Fiat FX:
 *     if `fiatFx` is omitted: fiatRate() uses Stockplus by default
 *     if `fiatFx` is provided: LegalFiatFxMarketAdapter is configured with it
 *
 * Example (with Stockplus as convenience):
 *
 *   const fx = fusanex.new({
 *     fiatFx: {
 *       endpoint: STOCKPLUS_FIAT_FX_ENDPOINT,
 *       transform: stockplusFiatFxTransform,
 *     },
 *   });
 */
export function createFusanex(config: FusanexConfig = {}): FusanexPort {
  const BASE_ASSET: BaseAsset = config.baseAsset ?? 'BTC';

  const CRYPTO_MARKETS: MarketPort[] = buildCryptoMarkets(config);
  const FIAT_MARKETS: MarketPort[] = buildFiatMarkets(config);

  return new FusanexService(CRYPTO_MARKETS, FIAT_MARKETS, {
    baseAsset: BASE_ASSET,
  });
}