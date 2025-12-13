import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';
import type { FxResult, FxSuccess, FxFailure } from '../domain/fx-result';

function assertSuccess(result: FxResult): FxSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected ok=true but got failure: ${JSON.stringify(result.error)}`);
  }
  return result;
}

function assertFailure(result: FxResult): FxFailure {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error(`Expected ok=false but got success: ${JSON.stringify(result)}`);
  }
  return result;
}

describe('Crypto Markets (Direct & Crypto-only)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('directRate: returns USDT/KRW direct rate from Upbit as FxSuccess', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('api.upbit.com') && url.includes('markets=KRW-USDT')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ trade_price: 1300 }],
        };
      }

      // Any other call: no useful market
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result = await fx.directRate('USDT', 'KRW');

    const ok = assertSuccess(result);
    expect(ok.rate).toBe(1300);
    expect(ok.from).toBe('USDT');
    expect(ok.to).toBe('KRW');
    expect(ok.path.hops).toHaveLength(1);
    expect(ok.path.hops[0]).toMatchObject({
      from: 'USDT',
      to: 'KRW',
      providerLabel: 'Upbit',
      marketKind: 'CRYPTO',
    });
  });

  it('cryptoRate: prefers direct crypto rate over cross rate', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      // Direct USDT/KRW from Upbit
      if (url.includes('api.upbit.com') && url.includes('markets=KRW-USDT')) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ trade_price: 1300 }],
        };
      }

      // Everything else: no useful data
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result = await fx.cryptoRate('USDT', 'KRW');

    const ok = assertSuccess(result);
    expect(ok.rate).toBe(1300);
    // It should be a single-hop direct path, not a cross via BTC.
    expect(ok.path.hops).toHaveLength(1);
    expect(ok.path.hops[0].inverted).toBe(false);
  });

  it('cryptoRate: returns FxFailure with PAIR_NOT_SUPPORTED when pair is unsupported', async () => {
    // No crypto markets support this pair
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }));
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result = await fx.cryptoRate('USDT', 'EUR');

    const fail = assertFailure(result);
    expect(fail.error.code).toBe('PAIR_NOT_SUPPORTED');
    expect(fail.error.message).toMatch(/not supported/i);
  });

  it('cryptoRate: maps provider HTTP 429 to RATE_LIMITED FxFailure', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('api.upbit.com') && url.includes('markets=KRW-USDT')) {
        // Upbit returns rate-limit error
        return {
          ok: false,
          status: 429,
          json: async () => ({}),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result = await fx.cryptoRate('USDT', 'KRW');

    const fail = assertFailure(result);
    expect(fail.error.code).toBe('RATE_LIMITED');
    expect(fail.error.message).toMatch(/rate limit/i);
    expect(fail.error.context).toMatchObject({
      providerId: 'upbit-krw',
      status: 429,
    });
  });

  it('cryptoRate: maps low-level network error to NETWORK_ERROR FxFailure', async () => {
    const mockFetch = vi.fn(async () => {
      // Simulate fetch-level failure (DNS/timeout etc)
      throw new Error('network is down');
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result = await fx.cryptoRate('USDT', 'KRW');

    const fail = assertFailure(result);
    expect(fail.error.code).toBe('NETWORK_ERROR');
    expect(fail.error.message).toMatch(/network error/i);
  });
});
