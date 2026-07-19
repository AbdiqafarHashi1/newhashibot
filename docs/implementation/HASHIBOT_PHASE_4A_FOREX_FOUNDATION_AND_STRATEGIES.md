# HashiBot V2 Phase 4A — Forex Foundation and Strategies

## Delivered

Phase 4A adds a provider-neutral Forex candle contract and a Twelve Data implementation without creating a second scanner, truth model, or execution path. The locked universe is `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD`, and `XAUUSD`; only `5m`, `15m`, `1h`, and `4h` candles are accepted.

The instrument registry owns canonical/provider/broker aliases, asset and currency metadata, precision, pip, point, price-step, tick-size, spread units, and Gold classification. Symbol normalization accepts slash forms, the documented `.a`/`m` suffixes, and `GOLD`. Quote normalization preserves provider bid/ask when supplied. A Twelve Data close price is explicitly represented as a mid with an `estimated` spread model; bid and ask are never invented.

UTC session classification covers Asian, London, New York, the London/New York overlap, and weekend/illiquid closure. Candle validation rejects invalid OHLC, bad duration/order, duplicates, incomplete candles, and stale snapshots, while reporting missing intervals.

`TwelveDataForexProvider` implements environment authentication, enable state, health, typed failures, timeouts, bounded exponential retry, a three-failure retry circuit, HTTP/rate-limit/credit detection, malformed/stale rejection, a daily UTC credit ledger, warning/hard-stop thresholds, candle-close-aware caching, incremental tail refreshes, and in-flight request deduplication. Diagnostics expose requests, credits, failures, cache hits, and deduplicated consumers.

Exactly four active Phase 4A Forex strategy registrations replace the legacy Forex placeholder registrations:

* `forex.session-momentum` (`ForexSessionMomentum`)
* `forex.session-breakout` (`ForexSessionBreakout`)
* `forex.trend-pullback-v2` (`ForexTrendPullback`)
* `forex.gold-volatility` (`GoldVolatility`)

Legacy exports remain readable for historical result compatibility but are not in the default registry. The native Forex strategies produce only `BUY`, `SELL`, or structured `NO_TRADE`; accepted output includes identity/version, timeframes, closed-candle time, UTC session, regime, complete entry/stop/two targets, risk and reward/risk, confidence/grade, expiry/holding time, spread/volatility state, and evidence. Gold has its own symbol gate, volatility bounds, point precision, spread ceiling, stop floor, targets, expiry, holding limit, and exhaustion rules.

## Environment

| Variable | Required | Default | Meaning |
|---|---:|---|---|
| `TWELVE_DATA_API_KEY` | Yes when enabled | none | Twelve Data API key. |
| `TWELVE_DATA_ENABLED` | No | `true` | Set to `false` to disable provider calls. |

Runtime constructor options set the 800-credit daily budget, warning (650), hard stop (780), timeout (8 seconds), retry count (maximum 2), and stale interval tolerance without introducing additional environment state.

## Database migrations

None. Phase 4A is an in-process market-data and strategy foundation. Persistent scanner/truth/reporting integration belongs to Prompt 2.

## Tests

`tests/forex/forex-foundation.test.ts` deterministically covers the locked universe, symbol aliases, pip/point and Gold metadata, sessions/weekends, non-fabricated quotes, candle freshness/completeness, Twelve Data success/cache/deduplication, rate limiting, credit exhaustion, malformed payloads and retry bounds, the exact four-strategy inventory, and Gold's unsupported-symbol rejection. Existing V2 type checking and suites remain the build gate.

## Known limitations

* Twelve Data does not represent a broker-executable spread in time-series responses. Signal Mode therefore labels close-only prices as mid/estimated and spread-sensitive strategy evaluation must receive a recent dependable quote or configured estimated-spread state. Prompt 2 must not treat the estimate as execution truth.
* Session hours are deterministic UTC liquidity windows. Weekend handling is explicit, but country-specific bank holidays and economic-news blackouts require the platform market-intelligence calendar in Prompt 2.
* Credit accounting is process-local and resets at UTC midnight. Prompt 2 should persist/aggregate it if multiple scanner processes are introduced.
* No profitability conclusion is implied by deterministic fixtures.

## Prompt 2 handoff

Instantiate one `TwelveDataForexProvider` per scanner process and request each `(symbol,timeframe)` once. Pass the returned immutable `CandleSnapshot` to all applicable `FOREX_STRATEGIES`; do not call the provider from a strategy. Feed accepted results through the existing arbitrator and signal-truth contracts, retaining `candleTimestamp` as the deduplication boundary. Surface provider health/credit/cache diagnostics and structured `NO_TRADE` reasons in Admin reporting. Telegram and paper trading must use the existing unified pipelines and must preserve the explicitly estimated spread label until an MT5 provider supplies executable bid/ask.
