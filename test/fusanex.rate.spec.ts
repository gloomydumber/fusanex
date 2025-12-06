// test/fusanex.smartRate.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';
import type { NormalizedFiatFxRates } from '../domain/fiat-fx';

/**
 * NOTE:
 *  - Global `fetch` is stubbed in test/setup.ts via vi.stubGlobal('fetch', vi.fn()).
 *  - Here we just reset and program the mock per test.
 */

const asMockedFetch = () => fetch as unknown as {
  mockResolvedValueOnce: (value: any) => void;
  mockReset?: () => void;
  mockClear?: () => void;
};

beforeEach(() => {
  const mocked = asMockedFetch();
  if (typeof mocked.mockReset === 'function') {
    mocked.mockReset();
  } else if (typeof mocked.mockClear === 'function') {
    mocked.mockClear();
  }
});

describe('FusanexService.smartRate', () => {
  it('uses crypto direct market for USDT/KRW', async () => {
    const mockedFetch = asMockedFetch();

    // 1) Upbit: USDT/KRW ticker
    //    - UpbitKRWMarketAdapter should build something like:
    //      `${upbitApiUrl}?markets=KRW-USDT`
    //    - We only care that trade_price is 1300.
    mockedFetch.mockResolvedValueOnce({
      json: async () => [
        {
          trade_price: 1300,
        },
      ],
    });

    const fx = createFusanex();

    const result = await fx.rate('USDT', 'KRW');

    expect(result).toBe(1300);
  });

  it('uses fiat FX for USD/KRW when no crypto market exists', async () => {
    const mockedFetch = asMockedFetch();

    // This test configures a custom fiat FX endpoint to have full control.
    // The normalized structure is:
    //
    //   base: 'KRW'
    //   quotes: {
    //     USD: 1300,
    //   }
    //
    // Interpretation (intended):
    //   - 1 USD = 1300 KRW  (USD/KRW = 1300)
    //
    // Implementation details inside LegalFiatFxMarketAdapter should match
    // this "base currency" semantics.
    const fiatFxEndpoint = 'https://fiat.example';

    const normalizedFiat: NormalizedFiatFxRates = {
      base: 'KRW',
      quotes: {
        USD: 1300,
        KRW: 1,    // optional but reasonable
        JPY: 0,
        EUR: 0,
        CNY: 0,
        VND: 0,
        USDT: 0,
        USDC: 0,
      },
    };

    // Call order for rate('USD', 'KRW'):
    //
    // 1) rate('USD','KRW') – crypto-only:
    //    - resolveCryptoPair('USD','KRW') → UpbitKRWMarketAdaptor:
    //        fetch #1  → we return [] so adapter returns null.
    //
    //    - computeCryptoCrossViaBase('USD','KRW'):
    //        BASE = 'BTC' (default)
    //        resolveCryptoPair('BTC','USD'):
    //          - Upbit: to !== 'KRW' → no fetch, null
    //          - Binance: quote 'USD' is NOT a stable → no fetch, null
    //
    //        resolveCryptoPair('BTC','KRW'):
    //          - Upbit: to === 'KRW' → fetch #2, but we also return [] so null
    //
    //      => CROSS = null, so rate() throws and smartRate swallows the error.
    //
    // 2) fiatRate('USD','KRW'):
    //    - LegalFiatFxMarketAdapter.loadRates() → fetch #3, returns normalizedFiat.
    //    - Adapter computes 1 USD = 1300 KRW.
    //
    // So we need three fetch stubs in this exact order:
    //
    //   [0] Upbit USD/KRW ticker → []
    //   [1] Upbit BTC/KRW ticker → []
    //   [2] Fiat FX endpoint     → normalizedFiat
    //
    mockedFetch.mockResolvedValueOnce({
      // Upbit USD/KRW ticker: empty array → "pair not supported"
      json: async () => [],
    });

    mockedFetch.mockResolvedValueOnce({
      // Upbit BTC/KRW ticker: also empty → ensures crypto cross fails
      json: async () => [],
    });

    mockedFetch.mockResolvedValueOnce({
      // Fiat FX normalized data
      json: async () => normalizedFiat,
    });


    const fx = createFusanex({
      fiatFx: {
        endpoint: fiatFxEndpoint,
        // Use identity transform: the raw JSON is already normalized.
        transform: (raw: unknown) => raw as NormalizedFiatFxRates,
      },
    });

    const result = await fx.rate('USD', 'KRW');

    // With base='KRW' and quotes.USD = 1300, we expect:
    //   1 USD = 1300 KRW
    expect(result).toBe(1300);
  });

  it('bridges crypto and fiat for USDT/JPY via KRW', async () => {
    const mockedFetch = asMockedFetch();

    const fiatFxEndpoint = 'https://fiat.example';

    // Normalized fiat FX:
    //
    //   base: 'KRW'
    //   quotes: {
    //     USD: 1300,
    //     JPY: 10,
    //   }
    //
    // Intended semantics (example):
    //   - 1 USD = 1300 KRW
    //   - 1 JPY = 10 KRW
    //
    // Then:
    //   KRW/JPY = 1 / 10 = 0.1
    //   USDT/KRW (from Upbit) = 1300
    //   ⇒ USDT/JPY = 1300 * 0.1 = 130
    const normalizedFiat: NormalizedFiatFxRates = {
      base: 'KRW',
      quotes: {
        USD: 1300,
        KRW: 0,    // optional but reasonable
        JPY: 10,
        EUR: 0,
        CNY: 0,
        VND: 0,
        USDT: 0,
        USDC: 0,
      },
    };

    // For smartRate('USDT', 'JPY'), expected call order:
    //
    // 1) rate('USDT','JPY') [crypto-only]:
    //    - resolveCryptoPair('BTC','USDT') via Binance:
    //        fetch(binanceApiUrl + '?symbol=BTCUSDT')
    //    - The cross will fail because there is no BTC/JPY market.
    //
    // 2) fiatRate('USDT','JPY'):
    //    - LegalFiatFxMarketAdapter.loadRates():
    //        fetch(fiatFxEndpoint)
    //
    // 3) Bridging via KRW:
    //    - trySingleLeg('USDT','KRW'):
    //        directRate('USDT','KRW') via Upbit:
    //          fetch(upbitApiUrl + '?markets=KRW-USDT')
    //    - trySingleLeg('KRW','JPY'):
    //        fiatRate('KRW','JPY') using cached normalizedFiat (no new fetch).
    //
    // So we stub 3 fetch calls in this order:
    //
    //   [0] Binance BTC/USDT ticker
    //   [1] Fiat FX endpoint
    //   [2] Upbit USDT/KRW ticker
    //
    mockedFetch.mockResolvedValueOnce({
      // Binance BTC/USDT ticker (dummy value)
      json: async () => ({
        symbol: 'BTCUSDT',
        price: '20000',
      }),
    });

    mockedFetch.mockResolvedValueOnce({
      // Fiat FX normalized data
      json: async () => normalizedFiat,
    });

    mockedFetch.mockResolvedValueOnce({
      // Upbit USDT/KRW ticker
      json: async () => [
        {
          trade_price: 1300,
        },
      ],
    });

    const fx = createFusanex({
      fiatFx: {
        endpoint: fiatFxEndpoint,
        transform: (raw: unknown) => raw as NormalizedFiatFxRates,
      },
    });

    const result = await fx.rate('USDT', 'JPY');

    expect(result).not.toBeNull();

    // As per the comments above:
    //   USDT/KRW = 1300
    //   KRW/JPY  = 0.1
    //   ⇒ USDT/JPY ≈ 130
    expect(result!).toBeCloseTo(130, 10);
  });
});
