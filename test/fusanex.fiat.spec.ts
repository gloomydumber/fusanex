import { describe, it, expect, vi } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';
import { NormalizedFiatFxRates } from '../domain/fiat-fx';

describe('legal fiat fx', () => {
  it('returns USD/JPY using custom endpoint + transform', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({
        base: 'USD',
        quotes: { JPY: 148.4, KRW: 1330 },
      }),
    } as any);

    const fx = createFusanex({
      fiatFx: {
        endpoint: 'https://paid-forex.com/rates',
        transform: (raw) => raw as NormalizedFiatFxRates,
      },
    });

    const result = await fx.fiatRate('JPY', 'USD');
    console.log(result);

    expect(result).toBeCloseTo(148.4);
  });
});
