import { describe, it, expect } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';

describe('crypto directRate', () => {
  it('returns USDT/KRW direct rate from Upbit', async () => {
    // Mock Upbit ticker response for USDT/KRW
    (fetch as any).mockResolvedValueOnce({
      json: async () => [
        {
          trade_price: 1300, // 1 USDT = 1300 KRW (example)
        },
      ],
    });

    const fx = createFusanex();

    const result = await fx.directRate('USDT', 'KRW');

    expect(result).toBe(1300);
  });
});