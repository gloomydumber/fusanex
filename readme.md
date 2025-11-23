# fusanex

**fusanex** is a crypto-native foreign exchange (FX) library.

It lets you:

- Fetch **crypto/fiat** prices from spot markets (Upbit KRW, Binance USD-like).
- Compute **cross rates** via a base asset (e.g. USDT/KRW from BTC/KRW and BTC/USDT).
- Query **legal FX rates** (fiat↔fiat) via a pluggable HTTP endpoint.

Internally, it follows a hexagonal architecture:

- **Domain**: assets, currencies, exchange rates, cross rate logic.
- **Application**: `FusanexService` implementing `FusanexPort`.
- **Adapters**:
  - Outbound: crypto markets (Upbit KRW, Binance USD-like) and legal FX.
  - Inbound: `createFusanex` factory as the main entry point.

---

## Installation

```bash
npm install fusanex
# or
yarn add fusanex
# or
pnpm add fusanex
```

fusanex is written in TypeScript and works well in both TypeScript and JavaScript projects.

## Quick Start

```ts
import fusanex from "fusanex";

async function main() {
  // Create a client with default configuration.
  // - Crypto: Upbit (KRW spot) + Binance (USD-like stable, e.g. USDT)
  // - Fiat FX: Stockplus (if you wired it as default in the factory)
  const fx = fusanex();

  // 1) Smart crypto rate:
  //    - Try direct market (e.g. USDT/KRW)
  //    - If not found, try cross via base asset (e.g. BTC)
  const usdtKrw = await fx.rate("USDT", "KRW");
  console.log("USDT/KRW =", usdtKrw);

  // 2) Direct crypto market only (no cross):
  const btcUsdt = await fx.directRate("BTC", "USDT");
  console.log("BTC/USDT =", btcUsdt);

  // 3) Cross rate via base asset (e.g. BTC):
  //    USDT/KRW = (BTC/KRW) / (BTC/USDT)
  const crossUsdtKrw = await fx.crossRate("USDT", "KRW");
  console.log("USDT/KRW (cross via BTC) =", crossUsdtKrw);

  // 4) Legal FX (fiat↔fiat)
  const usdJpy = await fx.fiatRate("USD", "JPY");
  if (usdJpy) {
    console.log("USD/JPY =", usdJpy);
  } else {
    console.log("USD/JPY not available from fiat FX provider");
  }
}

main().catch(console.error);
```

## API overview

The main object you get from `fusanex()` implements FusanexPort:

```ts
interface FusanexPort {
  /**
   * Smart crypto rate:
   * 1. Try direct crypto market.
   * 2. If not found, try cross via base asset.
   * 3. Throw if no route is available.
   */
  rate(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset
  ): Promise<ExchangeRate>;

  /**
   * Direct crypto market only.
   * Returns null if no direct market exists.
   */
  directRate(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset
  ): Promise<ExchangeRate | null>;

  /**
   * Cross crypto rate via base asset only.
   * Throws if any leg is missing.
   */
  crossRate(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset
  ): Promise<ExchangeRate>;

  /**
   * Legal FX (fiat↔fiat), via configured fiat FX provider.
   * Returns null if the provider cannot price the pair.
   */
  fiatRate(
    from: FiatCurrencyCode,
    to: FiatCurrencyCode
  ): Promise<ExchangeRate | null>;
}
```

Where:

```ts
type BaseAsset = "BTC" | "ETH" | "XRP" | "BNB" | "SOL";

type FiatCurrencyCode = "USD" | "KRW" | "JPY" | "EUR" | "CNY" | "VND";
type StableCurrencyCode = "USDT" | "USDC";

type CurrencyCode = FiatCurrencyCode | StableCurrencyCode;

interface ExchangeRate {
  base: CurrencyCode | BaseAsset;
  quote: CurrencyCode | BaseAsset;
  price: number;
}
```

## Configuration

You can customize the behavior via `FusanexConfig`, passed to `fusanex(config)`.

```ts
interface FusanexConfig {
  /** Base asset used for crypto cross rates. Default: 'BTC'. */
  baseAsset?: BaseAsset;

  /** Upbit API endpoint (root URL). Default: 'https://api.upbit.com/v1'. */
  upbitApiUrl?: string;

  /** Binance API endpoint (root URL). Default: 'https://api.binance.com/api/v3'. */
  binanceApiUrl?: string;

  /** Binance USD-like market options (e.g. which stable to use). */
  binanceUsdLikeOptions?: {
    /** Stablecoin symbol used as quote on Binance. Default: 'USDT'. */
    stable?: StableCurrencyCode;
  };

  /**
   * Which provider to use per fiat currency for crypto markets.
   * Example:
   * { KRW: 'Upbit', USD: 'Binance' }
   */
  providers?: ProviderMap;

  /**
   * Optional configuration for legal FX (fiat↔fiat).
   * If omitted (or disabled in your code), fiatRate() will use no provider.
   * If provided, fusanex will instantiate a LegalFiatFxMarketAdapter.
   */
  fiatFx?: {
    endpoint: string; // HTTP endpoint to fetch FX table from
    transform: FiatFxTransform; // function to normalize provider response
    ttlMs?: number; // optional cache TTL (default around 60s)
  };
}
```

Example: custom base asset

```ts
const fx = fusanex({
  baseAsset: "ETH",
});

const usdtKrw = await fx.crossRate("USDT", "KRW"); // now via ETH instead of BTC
```

## Crypto markets & cross rates

### Direct markets

By default, crypto prices are fetched from:

- UpbitKRWMarketAdapter
  - Supports pairs like `BTC/KRW`, `ETH/KRW`, `USDT/KRW`…
  - Uses: `GET {upbitApiUrl}/ticker?markets=KRW-{ASSET}`.
- BinanceUSDLikeMarketAdapter
  - Supports pairs like `BTC/USDT`, `ETH/USDT`, `XRP/USDT`…
  - Uses: `GET {binanceApiUrl}/ticker/price?symbol={BASE}{STABLE}`.

`directRate` only looks at these direct spot markets:

```ts
const btcKrw = await fx.directRate("BTC", "KRW"); // Upbit
const ethUsdt = await fx.directRate("ETH", "USDT"); // Binance

if (!btcKrw) {
  console.log("BTC/KRW not available");
}
```

### Cross crypto rate via base asset

For cross rates, fusanex uses the base asset (default BTC) as a bridge.

Conceptually:

```ts
USDT/KRW = (BTC/KRW) / (BTC/USDT)
```

Usage:

```ts
const cross = await fx.crossRate("USDT", "KRW");
console.log(cross);
// {
//   base: 'USDT',
//   quote: 'KRW',
//   price: number,
// }
```

Internally:

- It fetches `BTC/KRW` and `BTC/USDT` via `resolveCryptoPair`.
- Uses `computeCrossRate` from the domain layer to produce `USDT/KRW`.

## Legal FX (fiat↔fiat)

### Normalized FX model

Legal FX is based on a normalized table:

```ts
interface NormalizedFiatFxRates {
  base: FiatCurrencyCode; // anchor fiat (e.g. 'KRW')
  quotes: Record<FiatCurrencyCode, number>; // base-per-1-quote
}
```

`LegalFiatFxMarketAdapter`:

1. Fetches raw data from config.endpoint.
2. Normalizes it via config.transform(raw).
3. Caches the normalized object for ttlMs.
4. Computes any fiat↔fiat pair via simple ratios.

### Custom legal FX provider

You can plug in your own legal FX endpoint by providing a custom `transform` function:

```ts
import type { NormalizedFiatFxRates, FiatFxTransform } from "fusanex";

const myFxTransform: FiatFxTransform = (raw: any): NormalizedFiatFxRates => {
  // Convert your provider's JSON shape into:
  // { base: 'USD', quotes: { KRW: 1300, JPY: 150, ... } }
  return {
    base: "USD",
    quotes: {
      KRW: raw.usd_krw,
      JPY: raw.usd_jpy,
      EUR: raw.usd_eur,
      CNY: raw.usd_cny,
      VND: raw.usd_vnd,
    },
  };
};

const fx = fusanex({
  fiatFx: {
    endpoint: "https://my-fx.example.com/latest",
    transform: myFxTransform,
    ttlMs: 60_000,
  },
});
```

## Development notes

- Domain types live under domain/ (assets, currencies, exchange rates).
- Ports and service live under application/.
- External integrations (Upbit, Binance, legal FX provider) live under adapter/out/.
- The main factory createFusanex lives under adapter/in/ and is wrapped by the default export in index.ts.

You can use this structure as a reference if you extend the library with more providers or new assets.
