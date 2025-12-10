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

export interface FusanexConfig {
  baseAsset?: CurrencyCode;
  upbitApiUrl?: string;
  binanceApiUrl?: string;
  providers?: ProviderMap;
  fiatFx?: FiatFxConfig;
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
        markets.push(new UpbitKRWMarketAdapter(UPBIT_API_URL));
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
        markets.push(new BinanceUSDLikeMarketAdapter(BINANCE_API_URL));
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

  return [new LegalFiatFxMarketAdapter({ endpoint, transform, ttlMs })];
}

export function createFusanex(config: FusanexConfig = {}): FusanexPort {
  const BASE_ASSET: CurrencyCode = config.baseAsset ?? 'BTC';
  const CRYPTO_MARKETS: MarketPort[] = buildCryptoMarkets(config);
  const FIAT_MARKETS: MarketPort[] = buildFiatMarkets(config);

  return new FusanexService(CRYPTO_MARKETS, FIAT_MARKETS, {
    baseAsset: BASE_ASSET,
  });
}