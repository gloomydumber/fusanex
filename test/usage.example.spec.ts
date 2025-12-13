import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';
import type { FxResult, FxSuccess } from '../domain/fx-result';

function assertSuccess(result: FxResult, label: string): FxSuccess {
  expect(result.ok, `${label} should succeed`).toBe(true);
  if (!result.ok) {
    throw new Error(
      `${label} expected ok=true but got failure: ${JSON.stringify(result.error)}`,
    );
  }
  return result;
}

describe('end-user usage example', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('demonstrates rate, cryptoRate, crossRate, and fiatRate usage with FxResult', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // 1. Upbit (KRW spot)
        if (url.includes('api.upbit.com')) {
          if (url.includes('markets=KRW-USDT')) {
            return {
              ok: true,
              status: 200,
              json: async () => [{ trade_price: 1300 }],
            };
          }
          if (url.includes('markets=KRW-BTC')) {
            return {
              ok: true,
              status: 200,
              json: async () => [{ trade_price: 65_000_000 }],
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => [],
          };
        }

        // 2. Binance (USD-like, e.g. BTCUSDT)
        if (url.includes('api.binance.com')) {
          if (url.includes('symbol=BTCUSDT')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ price: '50000' }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({}),
          };
        }

        // 3. Fiat FX endpoint
        if (url.includes('fiat.example')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => null,
        };
      }),
    );

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://fiat.example',
        transform: () => ({
          base: 'KRW',
          quotes: {
            USD: 1300,
            KRW: 1,
            JPY: 10,
            EUR: 1400,
            CNY: 180,
            VND: 0.05,
            USDT: 0,
            USDC: 0,
            BTC: 0,
            ETH: 0,
            XRP: 0,
            BNB: 0,
            SOL: 0,
          },
        }),
      },
    });

    // 1) cryptoRate (Direct, prefers USDT/KRW Upbit)
    const cryptoDirect = assertSuccess(
      await fx.cryptoRate('USDT', 'KRW'),
      'cryptoRate USDT/KRW',
    );
    expect(cryptoDirect.rate).toBe(1300);

    // 2) crossRate (Crypto cross via baseAsset BTC, using Upbit + Binance)
    const cross = assertSuccess(
      await fx.crossRate('USDT', 'KRW'),
      'crossRate USDT/KRW',
    );
    expect(cross.rate).toBe(1300);

    // 3) fiatRate (Legal FX USD/KRW)
    const fiat = assertSuccess(
      await fx.fiatRate('USD', 'KRW'),
      'fiatRate USD/KRW',
    );
    expect(fiat.rate).toBe(1300);

    // 4) rate (Universal router USDT/KRW)
    const universal = assertSuccess(
      await fx.rate('USDT', 'KRW'),
      'rate USDT/KRW',
    );
    expect(universal.rate).toBe(1300);
  });
});
