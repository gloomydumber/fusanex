import { describe, it, expect } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';

describe('end-user usage example', () => {
  it('user can use rate, directRate, crossRate, and fiatRate', async () => {
    // Global fetch is stubbed in test/setup.ts as vi.stubGlobal('fetch', vi.fn()).
    // Here we provide a concrete implementation for all endpoints that
    // Fusanex will call under the hood:
    //
    // - Upbit KRW market (crypto):
    //     * KRW-USDT  → direct USDT/KRW
    //     * KRW-BTC   → BTC/KRW leg for crossRate()
    // - Binance USD-like market (crypto):
    //     * BTCUSDT   → BTC/USDT leg for crossRate()
    // - Custom fiat FX endpoint:
    //     * returns normalized FX where 1 USD = 1300 KRW

    (fetch as any).mockImplementation((url: string) => {
      // --- Upbit KRW spot markets (crypto) ---
      if (url.startsWith('https://api.upbit.com')) {
        // Direct USDT/KRW market: KRW-USDT
        if (url.includes('markets=KRW-USDT')) {
          return Promise.resolve({
            json: async () => [
              {
                // 1 USDT = 1300 KRW (direct market)
                trade_price: 1300,
              },
            ],
          } as any);
        }

        // BTC/KRW market for cross-rate: KRW-BTC
        if (url.includes('markets=KRW-BTC')) {
          return Promise.resolve({
            json: async () => [
              {
                // Arbitrary but consistent with cross-rate math below:
                // 1 BTC = 65,000,000 KRW
                trade_price: 65_000_000,
              },
            ],
          } as any);
        }

        throw new Error(`Unexpected Upbit URL in test: ${url}`);
      }

      // --- Binance USD-like market (crypto) ---
      if (url.startsWith('https://api.binance.com')) {
        // BTC/USDT market: BTCUSDT
        if (url.includes('symbol=BTCUSDT')) {
          return Promise.resolve({
            json: async () => ({
              // 1 BTC = 50,000 USDT
              price: 50000,
            }),
          } as any);
        }

        throw new Error(`Unexpected Binance URL in test: ${url}`);
      }

      // --- Custom fiat FX endpoint ---
      if (url.startsWith('https://fiat.example')) {
        // We will ignore the raw payload in our transform, so content is irrelevant.
        return Promise.resolve({
          json: async () => ({
            ok: true,
          }),
        } as any);
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const fx = createFusanex({
      // Enable fiat FX with a simple custom transform:
      // - base: 'KRW'
      // - quotes.USD = 1300  (1 USD = 1300 KRW)
      fiatFx: {
        endpoint: 'https://fiat.example',
        transform: () => ({
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
        }),
      },
    });

    // ---- 1) directRate: direct USDT/KRW from Upbit ----
    const direct = await fx.directRate('USDT', 'KRW');
    expect(direct).toBe(1300);

    // ---- 2) rate: smart crypto rate (picks direct USDT/KRW) ----
    const smart = await fx.rate('USDT', 'KRW');
    // Because a direct USDT/KRW market exists on Upbit, rate() will use it.
    expect(smart).toBe(1300);

    // ---- 3) crossRate: crypto cross via base asset (BTC) ----
    //
    // Internally, this does:
    //   BASE = 'BTC'
    //   BASE_FROM = BTC/USDT  (Binance)
    //   BASE_TO   = BTC/KRW   (Upbit)
    //
    // With our mocks:
    //   BTC/USDT = 1300
    //   BTC/KRW  = 1
    //
    // crossRate('USDT', 'KRW') = 1300 / 1 = 1300
    const cross = await fx.crossRate('USDT', 'KRW');
    expect(cross).toBe(1300);

    // ---- 4) fiatRate: legal FX USD/KRW (no crypto) ----
    //
    // Using the fiatFx transform above:
    //   base  = 'KRW'
    //   quotes.USD = 1300  (1 USD = 1300 KRW)
    //
    // For USD → KRW, LegalFiatFxMarketAdapter returns price = 1300.
    const fiat = await fx.fiatRate('USD', 'KRW');
    expect(fiat).toBe(1300);
  });
});
