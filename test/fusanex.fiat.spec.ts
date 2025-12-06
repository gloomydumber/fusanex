import { describe, it, expect, vi } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';
import type { NormalizedFiatFxRates } from '../domain/fiat-fx';

describe('Legal Fiat FX', () => {
  it('fiatRate: returns USD/JPY using custom endpoint + transform', async () => {
    // Mock the raw provider response (Scenario: 1 USD = 148.4 JPY)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      json: async () => ({
        success: true,
        rates: {
          USD: 1,
          JPY: 148.4,
          KRW: 1330
        }
      }),
    }));

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://paid-forex.com/rates',
        transform: (raw: any): NormalizedFiatFxRates => {
          // Fix: The raw API returns "Quote per Base" (e.g. 148.4 JPY per 1 USD).
          // The domain requires "Base per 1 Code" (e.g. X USD per 1 JPY).
          // Therefore, we must invert the rates.
          return {
            base: 'USD',
            quotes: {
              USD: 1, // 1 USD = 1 USD
              JPY: 1 / raw.rates.JPY, // 1 JPY = (1/148.4) USD
              KRW: 1 / raw.rates.KRW, // 1 KRW = (1/1330) USD
              // Fill required keys with 0/defaults
              EUR: 0, CNY: 0, VND: 0, USDT: 0, USDC: 0
            },
          };
        },
      },
    });

    // We ask for: Price of JPY in USD terms (How many USD is 1 JPY?)
    const result = await fx.fiatRate('JPY', 'USD');

    // Expected: 1 / 148.4
    const expected = 1 / 148.4;

    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(expected, 6);
  });
});