import { FusanexService } from '../../application/service/FusanexService';
import type { FusanexPort } from '../../application/port/in/FusanexPort';
import type { CurrencyCode } from '../../domain/currency';
import type { MarketPort } from '../../application/port/out/MarketPort';
import { UpbitKRWMarketAdapter } from '../out/UpbitKRWMarketAdapter';
import { BinanceUSDLikeMarketAdapter } from '../out/BinanceUSDLikeMarketAdapter';
import type { ProviderMap, KRWProviderId, USDProviderId } from '../../domain/providers';
import type { FiatFxTransform } from '../../domain/fiat-fx';
import {
  LegalFiatFxMarketAdapter,
  STOCKPLUS_FIAT_FX_ENDPOINT,
  stockplusFiatFxTransform,
} from '../out/LegalFiatFxMarketAdapter';
import type { FetchLike, RateLimitOptions, RetryOptions } from '../../util/http';

const DEFAULT_UPBIT_TICKER_ENDPOINT = 'https://api.upbit.com/v1/ticker';
const DEFAULT_BINANCE_TICKER_ENDPOINT = 'https://api.binance.com/api/v3/ticker/price';

const DEFAULT_PROVIDERS: ProviderMap = {
  KRW: 'Upbit',
  USD: 'Binance',
};

export interface FiatFxConfig {
  endpoint: string;
  transform: FiatFxTransform;
  ttlMs?: number;
}

/**
 * Optional per-exchange fetch overrides.
 * If omitted, each adapter uses its own default (rate-limited + retrying) fetch.
 */
export interface FetchImplsConfig {
  upbit?: FetchLike;
  binance?: FetchLike;
  legalFiat?: FetchLike;
}

/**
 * Optional per-exchange rate limit overrides.
 * Only used if you also provide fetchImpls? No — adapters have defaults already.
 * This is here in case you later want to build fetches here centrally.
 */
export interface RateLimitsConfig {
  upbit?: RateLimitOptions;
  binance?: RateLimitOptions;
  legalFiat?: RateLimitOptions;
}

/**
 * Optional global retry override (applies at service-level RATE_LIMITED retry).
 */
export interface ServiceRetryConfig {
  maxRetries?: number;     // default: 3
  baseBackoffMs?: number;  // default: 400
  maxBackoffMs?: number;   // default: 8000
}

export interface FusanexConfig {
  baseAsset?: CurrencyCode;
  upbitApiUrl?: string;
  binanceApiUrl?: string;
  providers?: ProviderMap;
  fiatFx?: FiatFxConfig;

  /**
   * If provided, adapters will use these instead of their own defaults.
   */
  fetchImpls?: FetchImplsConfig;

  /**
   * Service-level retry policy for RATE_LIMITED (adapter errors).
   */
  serviceRetry?: ServiceRetryConfig;

  /**
   * Reserved for future: you can remove this now if you don't want it yet.
   * (Adapters already set their own defaults.)
   */
  rateLimits?: RateLimitsConfig;
}

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
        const UPBIT_API_URL = config.upbitApiUrl ?? DEFAULT_UPBIT_TICKER_ENDPOINT;
        markets.push(new UpbitKRWMarketAdapter(UPBIT_API_URL, config.fetchImpls?.upbit));
        break;
      }
      case 'Bithumb': {
        throw new Error('KRW provider "Bithumb" is not implemented yet.');
      }
      default: {
        const UNKNOWN = KRW_PROVIDER satisfies never;
        throw new Error(`Unknown KRW provider: ${String(UNKNOWN)}`);
      }
    }
  }

  const USD_PROVIDER: USDProviderId | undefined = providers.USD;
  if (USD_PROVIDER) {
    switch (USD_PROVIDER) {
      case 'Binance': {
        const BINANCE_API_URL = config.binanceApiUrl ?? DEFAULT_BINANCE_TICKER_ENDPOINT;
        markets.push(new BinanceUSDLikeMarketAdapter(BINANCE_API_URL, config.fetchImpls?.binance));
        break;
      }
      case 'Coinbase': {
        throw new Error('USD provider "Coinbase" is not implemented yet.');
      }
      default: {
        const UNKNOWN = USD_PROVIDER satisfies never;
        throw new Error(`Unknown USD provider: ${String(UNKNOWN)}`);
      }
    }
  }

  return markets;
}

function buildFiatMarkets(config: FusanexConfig): MarketPort[] {
  const fiatFx = config.fiatFx ?? {
    endpoint: STOCKPLUS_FIAT_FX_ENDPOINT,
    transform: stockplusFiatFxTransform,
  };
  const { endpoint, transform, ttlMs } = fiatFx;

  if (!endpoint || !transform) {
    throw new Error('fiatFx configuration requires both `endpoint` and `transform`.');
  }

  return [
    new LegalFiatFxMarketAdapter({
      endpoint,
      transform,
      ttlMs,
      fetchImpl: config.fetchImpls?.legalFiat,
    }),
  ];
}

export function createFusanex(config: FusanexConfig = {}): FusanexPort {
  const BASE_ASSET: CurrencyCode = config.baseAsset ?? 'BTC';
  const CRYPTO_MARKETS: MarketPort[] = buildCryptoMarkets(config);
  const FIAT_MARKETS: MarketPort[] = buildFiatMarkets(config);

  return new FusanexService(CRYPTO_MARKETS, FIAT_MARKETS, {
    baseAsset: BASE_ASSET,
    retry: config.serviceRetry,
  });
}
