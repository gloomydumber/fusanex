# fusanex

**fusanex** is a crypto-native foreign exchange (FX) library.

It lets you:

- Fetch **crypto/fiat** prices from spot markets (e.g. Upbit KRW, Binance USD-like).
- Compute **cross rates** via a base asset (e.g. USDT/KRW from BTC/KRW and BTC/USDT).
- Query **legal FX rates** (fiat↔fiat) via a pluggable HTTP endpoint.
- Combine **crypto markets + fiat FX** to resolve “any to any” routes where possible.

Internally, it follows a hexagonal architecture:

- **Domain**: assets, currencies, exchange rates, cross-rate logic.
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
  // - Fiat FX: your configured legal FX provider (or default, if wired)
  const fx = fusanex();

  // 1) Smart "universal" rate:
  //    - Uses crypto markets + fiat FX + hybrid routing under the hood.
  const usdtKrw = await fx.rate("USDT", "KRW");
  console.log("USDT/KRW (universal) =", usdtKrw);

  // 2) Crypto-only smart rate:
  //    - Tries direct crypto markets, then cross via baseAsset.
  //    - Does NOT use fiat FX at all.
  const btcEth = await fx.cryptoRate("BTC", "ETH");
  console.log("BTC/ETH (crypto-only) =", btcEth);

  // 3) Direct crypto spot market only:
  //    - No cross, no fiat FX, no routing.
  const btcKrwDirect = await fx.directRate("BTC", "KRW");
  console.log("BTC/KRW (direct spot) =", btcKrwDirect);

  // 4) Legal FX (fiat↔fiat) only:
  const usdKrwFiat = await fx.fiatRate("USD", "KRW");
  console.log("USD/KRW (fiat FX) =", usdKrwFiat);
}

main().catch(console.error);
```

## API overview

The main object you get from `fusanex()` implements FusanexPort:

```ts
interface FusanexPort {
  /**
   * Universal router (crypto + fiat).
   */
  rate(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset
  ): Promise<number | null>;

  /**
   * Crypto-only smart router.
   * - Uses cryptoMarkets only.
   * - Tries direct markets first, then cross via baseAsset.
   * - Does NOT use fiat FX.
   */
  cryptoRate(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset
  ): Promise<number | null>;

  /**
   * Direct crypto rate from spot markets only.
   * - No cross via baseAsset.
   * - No fiat FX.
   */
  directRate(
    from: CurrencyCode | BaseAsset,
    to: CurrencyCode | BaseAsset
  ): Promise<number | null>;

  /**
   * Legal FX (fiat↔fiat) via configured FX provider.
   * - Uses fiatMarkets only.
   */
  fiatRate(from: CurrencyCode, to: CurrencyCode): Promise<number | null>;
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
import fusanex from "fusanex";

const fx = fusanex({
  /**
   * Base asset for crypto cross routing.
   * Example: "BTC" or "ETH".
   */
  baseAsset: "BTC",

  /**
   * Crypto providers configuration.
   * Example: which provider to use for KRW and USD-like markets.
   */
  providers: {
    KRW: "Upbit",
    USD: "Binance",
  },

  /**
   * Optional override for exchange API endpoints.
   */
  binanceApiUrl: "https://api.binance.com",
  upbitApiUrl: "https://api.upbit.com",

  /**
   * Fiat FX configuration (optional).
   * If omitted, a default fiat FX provider may be used by the factory,
   * depending on your internal wiring.
   */
  fiatFx: {
    endpoint: "https://example.com/fiat-fx",
    // Map raw JSON response → { [pair: string]: number }
    transform: (raw: unknown) => {
      // user-defined transform here
      return {
        "USD/KRW": 1350.12,
        "EUR/USD": 1.07,
      };
    },
  },
});
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
