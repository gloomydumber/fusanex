import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFusanex } from '../adapter/in/createFusanex';

describe('Crypto Markets (Direct & Crypto-only)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('directRate: returns USDT/KRW direct rate from Upbit', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      json: async () => [{ trade_price: 1300 }],
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result = await fx.directRate('USDT', 'KRW');

    expect(result).toBe(1300);
  });

  it('cryptoRate: prefers direct rate over cross rate', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      json: async () => [{ trade_price: 1300 }],
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();
    const result = await fx.cryptoRate('USDT', 'KRW');

    expect(result).toBe(1300);
  });

  it('cryptoRate: throws error if pair is unsupported in crypto world', async () => {
    // Mock return empty for all calls (simulating no markets found)
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => [],
    });
    vi.stubGlobal('fetch', mockFetch);

    const fx = createFusanex();

    // 'EUR' is a valid CurrencyCode but not supported by crypto adapters currently
    await expect(fx.cryptoRate('USDT', 'EUR'))
      .rejects
      .toThrow(/not supported/);
  });
});