# HashiBot V2 Phase 4B — Forex Signal Mode

## Implementation

Phase 4B connects Phase 4A to the existing arbitrator, immutable signal engine, paper-trade engine, Telegram platform, and reporting surfaces through `UnifiedSignalModeScanner`. It is deliberately manual-only: no scheduler or cron registration is included.

The scanner evaluates the configured Forex universe alongside the platform's unchanged Crypto runtime. Within a symbol scan, every timeframe snapshot is memoized and reused by every applicable strategy; the Twelve Data provider provides the second, process-wide cache and in-flight deduplication layer. Symbols are isolated, provider failures are contained, concurrent scans are rejected, active signals suppress another same-symbol scan, and closed sessions never request data.

Scanner diagnostics expose provider health and credits, cache hits/misses, scanned/skipped symbols, evaluations, candidates, structured rejections, winners, published signals, and provider failures. Native Forex candidates are adapted to the existing `StrategyCandidate` contract and sent through the existing `Arbitrator` and `ImmutableSignalEngine`.

`UnifiedSignalTruth` owns no new database or truth table. It links stable signal IDs to exactly one stable paper-trade ID and projects the existing paper lifecycle into the Phase 4 states. Provider, strategy, symbol, and session attribution remain attached. Estimated spread changes the deterministic paper entry and is labelled `estimated_spread`; it is never described as broker execution.

`UnifiedTelegramPublisher` uses only FREE, VIP, and ADMIN_OPS. The VIP template now carries strategy, timeframe, session, RR, confidence, grade, expiry, and signal ID. Lifecycle and Admin alerts use the existing router/templates and the professional ledger's idempotency keys.

Reporting excludes expired-unfilled signals from entered results and supplies strategy, symbol, timeframe and session distributions plus wins/losses, TP1/TP2/stop/time-stop rates and realised R. The Admin snapshot combines this truth with provider, credit, cache, scanner, strategy-participation and runtime-failure diagnostics.

## Configuration and environment

| Variable | Default |
|---|---|
| `FOREX_ENABLED` | `true` |
| `TWELVE_DATA_ENABLED` | `true` |
| `TWELVE_DATA_API_KEY` | required when Twelve Data is enabled |
| `FOREX_SYMBOL_ALLOWLIST` | `EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,XAUUSD` |
| `FOREX_DISABLED_STRATEGIES` | empty comma-separated list |
| `FOREX_MIN_RR` | `1.5` |
| `FOREX_MIN_GRADE` | `C` |
| `TWELVE_DATA_CREDIT_WARNING` | `650` |
| `TWELVE_DATA_CREDIT_STOP` | `780` |
| `TELEGRAM_FREE_CHAT_ID` | deployment-specific |
| `TELEGRAM_VIP_CHAT_ID` | deployment-specific |
| `TELEGRAM_ADMIN_OPS_CHAT_ID` | deployment-specific |

Session rules, per-symbol spread limits, context timeframes, cache policy, and strategy flags live in the single immutable default configuration. Deployments should create the Twelve Data provider with the same warning/stop values parsed by `signalModeConfig`.

## Migrations

None. Phase 4B reuses immutable signal and paper-trade truth contracts and does not add a table.

## Deployment handoff

No deployment was performed. After normal review: configure secrets, instantiate one Twelve Data provider, inject a dependable quote source, expose `scanManual` behind an authenticated Admin action, connect created truth records to the existing persistence adapter, enqueue Telegram deliveries through the existing worker, and keep every cron/scheduled invocation disabled.

## Limitations

Credit/cache counters and active-signal suppression are process-local. A horizontally scaled scanner must coordinate these through the existing runtime store. Twelve Data candle closes do not provide executable bid/ask. Holiday/news closure depends on the existing intelligence calendar. Signal Mode is production-structured but should remain manually supervised until a live shadow certification demonstrates provider freshness and Telegram/persistence wiring in the deployment environment.
