import { describe, it, expect, vi } from 'vitest';
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

describe('Legal Fiat FX', () => {
  it('fiatRate: returns USD/JPY using custom endpoint + transform as FxSuccess', async () => {
    // Raw provider response: 1 USD = 148.4 JPY, 1 USD = 1330 KRW
    const rawResponse = {
      success: true,
      rates: {
        USD: 1,
        JPY: 148.4,
        KRW: 1330,
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => rawResponse,
      }),
    );

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://paid-forex.com/rates',
        transform: (raw: any): NormalizedFiatFxRates => {
          // Raw: "Quote per Base" (e.g. 148.4 JPY per 1 USD)
          // Domain: "Base per 1 Code" (e.g. X USD per 1 JPY)
          return {
            base: 'USD',
            quotes: {
              USD: 1,
              JPY: 1 / raw.rates.JPY, // 1 JPY = (1/148.4) USD
              KRW: 1 / raw.rates.KRW, // 1 KRW = (1/1330) USD
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
        },
      },
    });

    // Ask for price of JPY in USD: "How many USD per 1 JPY?"
    const result: FxResult = await fx.fiatRate('JPY', 'USD');

    const ok = assertSuccess(result);
    const expected = 1 / 148.4;

    expect(ok.rate).toBeCloseTo(expected, 6);
    expect(ok.from).toBe('JPY');
    expect(ok.to).toBe('USD');
    expect(ok.path.hops).toHaveLength(1);
    expect(ok.path.hops[0]).toMatchObject({
      providerId: 'legal-fiat',
      marketKind: 'FIAT',
      marketSymbol: 'JPY/USD',
    });
  });
});
