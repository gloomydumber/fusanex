import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';
import type { NormalizedFiatFxRates } from '../domain/fiat-fx';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('FusanexService.rate (Universal Router)', () => {

  it('Priority 1: Uses crypto direct market (USDT/KRW)', async () => {
    // Setup: Direct crypto market exists
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('upbit')) return { json: async () => [{ trade_price: 1300 }] };
      return { json: async () => [] };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result = await fx.rate('USDT', 'KRW');

    expect(result).toBe(1300);
  });

  it('Priority 2: Uses Fiat FX when crypto fails (USD/KRW)', async () => {
    const normalizedFiat: NormalizedFiatFxRates = {
      base: 'KRW',
      quotes: {
        USD: 1300, KRW: 1,
        JPY: 0, EUR: 0, CNY: 0, VND: 0, USDT: 0, USDC: 0
      },
    };

    // Setup: Crypto fails (returns empty), Fiat succeeds
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      // 1. Upbit returns empty (simulating no pair supported)
      if (url.includes('upbit')) {
        return { json: async () => [] };
      }
      // 2. Binance returns error/empty
      if (url.includes('binance')) {
        return { json: async () => ({}) };
      }
      // 3. Fiat endpoint returns data
      if (url.includes('fiat.example')) {
        return { json: async () => normalizedFiat };
      }
      return { json: async () => null };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://fiat.example',
        transform: (raw) => raw as NormalizedFiatFxRates,
      },
    });

    const result = await fx.rate('USD', 'KRW');
    expect(result).toBe(1300);
  });

  it('Priority 3: Bridges Crypto <-> Fiat via Bridge Asset (USDT -> KRW -> JPY)', async () => {
    const normalizedFiat: NormalizedFiatFxRates = {
      base: 'KRW',
      quotes: {
        JPY: 10, KRW: 1, // 1 JPY = 10 KRW? (Normalized: Base per 1 Code. So 1 JPY = 10 KRW)
        USD: 0, EUR: 0, CNY: 0, VND: 0, USDT: 0, USDC: 0
      },
    };

    // Setup: Specific responses for the bridge path
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      // Binance: BTC/USDT exists (used for checking crypto cross feasibility, though not used in final bridge calculation here)
      if (url.includes('symbol=BTCUSDT')) {
        return { json: async () => ({ price: '50000' }) };
      }
      // Upbit: USDT/KRW exists (The Crypto Leg)
      if (url.includes('markets=KRW-USDT')) {
        return { json: async () => [{ trade_price: 1300 }] };
      }
      // Any other crypto call fails
      if (url.includes('upbit') || url.includes('binance')) {
        return { json: async () => [] };
      }
      // Fiat: Returns valid rates (The Fiat Leg)
      if (url.includes('fiat.example')) {
        return { json: async () => normalizedFiat };
      }
      return { json: async () => null };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://fiat.example',
        transform: (raw) => raw as NormalizedFiatFxRates,
      },
    });

    const result = await fx.rate('USDT', 'JPY');

    // Path:
    // 1. cryptoRate(USDT, JPY) -> Fails (No direct, No cross)
    // 2. fiatRate(USDT, JPY) -> Fails (USDT not in fiat quotes)
    // 3. Bridge via KRW:
    //    Leg 1: trySingleLeg(USDT, KRW) -> Crypto Direct (Upbit) -> 1300
    //    Leg 2: trySingleLeg(KRW, JPY) -> Fiat (Cached) -> 1 JPY = 10 KRW -> Rate = 0.1
    // Result: 1300 * 0.1 = 130

    expect(result).toBeCloseTo(130);
  });
});