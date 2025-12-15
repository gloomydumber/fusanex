// util/http.ts
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RateLimitOptions {
  /**
   * Minimum spacing between requests for the same key (exchange).
   * e.g. 120 => ~8.3 req/sec
   */
  minTimeMs: number;
}

export interface RetryOptions {
  /**
   * Max retries after the initial attempt.
   * e.g. 4 means total attempts up to 5.
   */
  maxRetries: number;

  /**
   * Base backoff for exponential backoff.
   */
  baseBackoffMs: number;

  /**
   * Cap for backoff.
   */
  maxBackoffMs: number;

  /**
   * Retry for these HTTP statuses. Usually at least 429.
   */
  retryOnStatuses: number[];
}

export interface SmartFetchOptions {
  key: string; // e.g. 'upbit', 'binance', 'legal-fiat'
  rateLimit: RateLimitOptions;
  retry: RetryOptions;
}

/**
 * Parse Retry-After header into ms.
 * - "120" => 120 seconds
 * - HTTP-date => delta to now
 */
export function parseRetryAfterMs(res: Response): number | undefined {
  const ra = res.headers.get('retry-after') ?? res.headers.get('Retry-After');
  if (!ra) return undefined;

  const asNum = Number(ra);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.round(asNum * 1000);

  const asDate = Date.parse(ra);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }

  return undefined;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Per-key FIFO pacing:
 * - For each `key`, ensure calls are at least `minTimeMs` apart.
 */
function createScheduler() {
  const lastAt = new Map<string, number>();
  const chain = new Map<string, Promise<void>>();

  async function waitTurn(key: string, minTimeMs: number) {
    const prev = chain.get(key) ?? Promise.resolve();

    const next = prev.then(async () => {
      const prevAt = lastAt.get(key) ?? 0;
      const now = Date.now();
      const wait = Math.max(0, prevAt + minTimeMs - now);
      if (wait > 0) await sleep(wait);
      lastAt.set(key, Date.now());
    });

    // keep the chain moving even if something throws
    chain.set(key, next.catch(() => { }));

    await prev;
  }

  return { waitTurn };
}

const GLOBAL_SCHEDULER = createScheduler();

/**
 * Wrap a fetch with:
 * - per-exchange rate limiting
 * - retries on certain HTTP statuses and network errors
 */
export function createSmartFetch(baseFetch: FetchLike, opts: SmartFetchOptions): FetchLike {
  const { key, rateLimit, retry } = opts;

  return async (input, init) => {
    let attempt = 0;

    while (true) {
      await GLOBAL_SCHEDULER.waitTurn(key, rateLimit.minTimeMs);

      let res: Response;
      try {
        res = await baseFetch(input, init);
      } catch (e) {
        // network error
        if (attempt >= retry.maxRetries) throw e;

        const backoff = Math.min(
          retry.maxBackoffMs,
          retry.baseBackoffMs * Math.pow(2, attempt),
        );
        const jitter = Math.floor(Math.random() * 150);
        await sleep(backoff + jitter);
        attempt++;
        continue;
      }

      // success or non-retry status
      if (!retry.retryOnStatuses.includes(res.status)) return res;

      // retryable status (e.g. 429)
      if (attempt >= retry.maxRetries) return res;

      const retryAfterMs = parseRetryAfterMs(res);
      const backoff = Math.min(
        retry.maxBackoffMs,
        retry.baseBackoffMs * Math.pow(2, attempt),
      );
      const jitter = Math.floor(Math.random() * 150);

      await sleep((retryAfterMs ?? backoff) + jitter);
      attempt++;
    }
  };
}
