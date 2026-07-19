# HashiBot Phase 4 Forex Certification

## Certification scope

The repository certifies the locked six-symbol universe, four Phase 4A strategies, Twelve Data error/cache/credit behavior, unified manual scanner, existing arbitrator integration, immutable signal attribution, deterministic paper lifecycle, Telegram idempotency, and reporting truth. Fixture results certify behavior, not profitability.

## Required gates

1. `cd v2 && npm test` passes, including existing Binance and Bybit regression suites.
2. The active default registry contains exactly `forex.session-momentum`, `forex.session-breakout`, `forex.trend-pullback-v2`, and `forex.gold-volatility` for Forex. Legacy London Breakout and New York Continuation exports are not registered.
3. A repeated `(provider,symbol,timeframe)` request consumes one upstream request before the candle closes; concurrent consumers share one promise.
4. Closed, stale, malformed, rate-limited, or credit-stopped data cannot publish a signal.
5. Arbitrator output permits one winner per symbol and active truth prevents a duplicate signal/paper trade.
6. Expired-unfilled signals do not affect entered trade counts, win rate, or realised R.
7. Telegram uses only existing channels and repeated lifecycle versions do not create another delivery.
8. Cron remains disabled and no production SQL or deployment operation occurs.

## Evidence and status

Phase 4A's clean baseline suite passed before Phase 4B changes. The Phase 4B signal-mode tests exercise scanner isolation/deduplication, lifecycle, estimated pricing, Telegram, reporting and Admin diagnostics. Final certification status is conditional on the final full-suite command and manual shadow verification described in the runbook.
