import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';

describe('end-user usage example', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('demonstrates rate, cryptoRate, crossRate, and fiatRate usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      // 1. Upbit
      if (url.includes('api.upbit.com')) {
        if (url.includes('markets=KRW-USDT')) {
          return { json: async () => [{ trade_price: 1300 }] };
        }
        if (url.includes('markets=KRW-BTC')) {
          return { json: async () => [{ trade_price: 65_000_000 }] };
        }
        return { json: async () => [] };
      }

      // 2. Binance
      if (url.includes('api.binance.com')) {
        if (url.includes('symbol=BTCUSDT')) {
          return { json: async () => ({ price: '50000' }) };
        }
        return { json: async () => ({}) };
      }

      // 3. Fiat
      if (url.includes('fiat.example')) {
        return { json: async () => ({ success: true }) };
      }

      return { json: async () => null };
    }));

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://fiat.example',
        transform: () => ({
          base: 'KRW',
          quotes: {
            USD: 1300,
            KRW: 1,
            JPY: 10,
            EUR: 1400, CNY: 180, VND: 0.05, USDT: 0, USDC: 0
          },
        }),
      },
    });

    // 1) cryptoRate (Direct)
    const cryptoDirect = await fx.cryptoRate('USDT', 'KRW');
    expect(cryptoDirect).toBe(1300);

    // 2) crossRate (Crypto Cross)
    const cross = await fx.crossRate('USDT', 'KRW');
    expect(cross).toBe(1300);

    // 3) fiatRate (Legal FX)
    const fiat = await fx.fiatRate('USD', 'KRW');
    expect(fiat).toBe(1300);

    // 4) rate (Universal)
    const universal = await fx.rate('USDT', 'KRW');
    expect(universal).toBe(1300);
  });
});