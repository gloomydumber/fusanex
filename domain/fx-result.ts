// domain/fx-result.ts
import type { CurrencyCode } from './currency';
import type { FxPath } from './route-hop';

/**
 * Domain-level error codes.
 * These are NOT raw HTTP or provider-specific codes; they're normalized.
 */
export type FxErrorCode =
  | 'INVALID_ARGUMENT'
  | 'PAIR_NOT_SUPPORTED'
  | 'NO_ROUTE_FOUND'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'CONFIG_ERROR'
  | 'UNKNOWN';

export interface FxFailure {
  ok: false;
  error: {
    code: FxErrorCode;
    message: string;
    /**
     * Extra details that logs / UIs can inspect.
     * e.g. { providerId: "upbit-krw", httpStatus: 429, retryAfterMs: 1000 }
     */
    context?: Record<string, unknown>;
  };
}

export interface FxSuccess {
  ok: true;
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  path: FxPath;
}

export class FxProviderError extends Error {
  constructor(
    public readonly code: FxErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'FxProviderError';
  }
}

export type FxResult = FxSuccess | FxFailure;
