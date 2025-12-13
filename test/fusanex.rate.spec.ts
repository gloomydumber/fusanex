import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';
import type { NormalizedFiatFxRates } from '../domain/fiat-fx';
import type { FxResult, FxSuccess } from '../domain/fx-result';

function assertSuccess(result: FxResult): FxSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected ok=true but got failure: ${JSON.stringify(result.error)}`);
  }
  return result;
}

describe('FusanexService.rate (Universal Router)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Priority 1: uses crypto direct market (USDT/KRW) when available', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      // Upbit USDT/KRW spot
      if (url.includes('api.upbit.com') && url.includes('markets=KRW-USDT')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ trade_price: 1300 }],
        };
      }

      // Anything else: no usable markets
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result: FxResult = await fx.rate('USDT', 'KRW');

    const ok = assertSuccess(result);
    expect(ok.rate).toBe(1300);
    expect(ok.path.hops).toHaveLength(1);
    expect(ok.path.hops[0]).toMatchObject({
      providerLabel: 'Upbit',
      marketKind: 'CRYPTO',
    });
  });

  it('Priority 2: falls back to Fiat FX when crypto fails (USD/KRW)', async () => {
    const normalizedFiat: NormalizedFiatFxRates = {
      base: 'KRW',
      quotes: {
        USD: 1300,
        KRW: 1,
        JPY: 0,
        EUR: 0,
        CNY: 0,
        VND: 0,
        USDT: 0,
        USDC: 0,
        BTC: 0,
        ETH: 0,
        XRP: 0,
        BNB: 0,
        SOL: 0,
      },
    };

    const mockFetch = vi.fn(async (url: string) => {
      // 1. Upbit: no crypto market available
      if (url.includes('api.upbit.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }

      // 2. Binance: no usable quote
      if (url.includes('api.binance.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        };
      }

      // 3. Fiat endpoint
      if (url.includes('fiat.example')) {
        return {
          ok: true,
          status: 200,
          json: async () => normalizedFiat,
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => null,
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://fiat.example',
        transform: (raw) => raw as NormalizedFiatFxRates,
      },
    });

    const result: FxResult = await fx.rate('USD', 'KRW');

    const ok = assertSuccess(result);
    expect(ok.rate).toBe(1300);
    expect(ok.path.hops).toHaveLength(1);
    expect(ok.path.hops[0]).toMatchObject({
      providerId: 'legal-fiat',
      marketKind: 'FIAT',
      marketSymbol: 'USD/KRW',
    });
  });

  it('Priority 3: bridges Crypto <-> Fiat via KRW (USDT -> KRW -> JPY)', async () => {
    // Legal FX: base KRW, 1 JPY = 10 KRW
    const normalizedFiat: NormalizedFiatFxRates = {
      base: 'KRW',
      quotes: {
        JPY: 10, // 1 JPY = 10 KRW
        KRW: 1,
        USD: 0,
        EUR: 0,
        CNY: 0,
        VND: 0,
        USDT: 0,
        USDC: 0,
        BTC: 0,
        ETH: 0,
        XRP: 0,
        BNB: 0,
        SOL: 0,
      },
    };

    const mockFetch = vi.fn(async (url: string) => {
      // 1. Upbit crypto KRW-USDT
      if (url.includes('api.upbit.com')) {
        if (url.includes('markets=KRW-USDT')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ trade_price: 1300 }],
          };
        }
        // any other KRW-* market not used in this scenario
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }

      // 2. Fiat FX endpoint
      if (url.includes('fiat.example')) {
        return {
          ok: true,
          status: 200,
          json: async () => normalizedFiat,
        };
      }

      // 3. Binance: unused here
      if (url.includes('api.binance.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => null,
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://fiat.example',
        transform: (raw) => raw as NormalizedFiatFxRates,
      },
    });

    const result: FxResult = await fx.rate('USDT', 'JPY');

    const ok = assertSuccess(result);

    // Bridge via KRW:
    //  Leg1: USDT -> KRW (Upbit) @ 1300
    //  Leg2: KRW -> JPY (Legal FX) @ 0.1 (since 1 JPY = 10 KRW)
    //  Total: 1300 * 0.1 = 130
    expect(ok.rate).toBeCloseTo(130, 8);
    expect(ok.path.hops).toHaveLength(2);
    expect(ok.path.hops[0]).toMatchObject({
      from: 'USDT',
      to: 'KRW',
      marketKind: 'CRYPTO',
    });
    expect(ok.path.hops[1]).toMatchObject({
      from: 'KRW',
      to: 'JPY',
      marketKind: 'FIAT',
    });
  });
});
