# Phase C — canonical scanner and signal runtime parity

## Audit result and reused authorities

Phase C reuses `trading-domain/market-view.ts` for closed-bar filtering, `indicators.ts` for indicator snapshots, `strategies.ts` for the strategy/version/default registry, and `arbitrator.ts` for deterministic arbitration. `scanner-runtime.ts` is the production entry adapter around those authorities; it is not a second strategy engine. The existing `signals` table remains persistence, the account brains remain downstream, and Telegram continues to receive a persisted signal through `routeTelegramEvent` in `market-scanner`.

The scanner compatibility evaluator now enters `runCanonicalScanner` rather than rebuilding a market view and invoking a strategy itself. The former root arbitrator retains runtime validation gates for compatibility, but delegates ranking and selection to `trading-domain.arbitrateCanonical`; its old priority/RR tie break is obsolete. No qualification policy or Phase-B certification rule changed.

## Exact call paths

* Research: `runCandidatePipelineReplay` → `buildCanonicalMarketView` → `strategyById(...).evaluate` → `arbitrateCanonical` → canonical replay.
* Scanner: `market-scanner` → `FOREX_PRODUCTION_EVALUATORS` → `runCanonicalScanner` → `buildCanonicalMarketView` → `strategyById(...).evaluate` → `arbitrateCanonical` → `materializeCanonicalSignal` → existing `signals` insert → existing account/execution brains and `routeTelegramEvent`.

The immutable signal contains canonical signal and candidate IDs, decision time, symbol/timeframe, exact strategy/version/configuration identity, evidence, and arbitration authority/rejections. Neither execution nor Telegram is accepted as a source of this object.

## Parity and legitimate differences

The fixed-history test independently drives the research primitives and scanner entry point, comparing identities, evaluations (including NO TRADE reasons), candidates, arbitration rejects/decisions, and final signals. It also proves an open candle is excluded and that research-only strategies cannot cross the production boundary.

Only dataset provenance labels, Telegram/delivery metadata, and execution-account state are classified as runtime-only. Strategy decisions, prices, scores, reason codes, candidate IDs, arbitration, and canonical signal fields are semantic differences and may not be hidden. Live provider closure claims, session calendars, database immutability permissions, and end-to-end Telegram delivery still require later real-data operational verification.

## Admin ownership

No dashboard was added. `ScannerConfig` owns scanner enablement, schedule, universe and safety configuration; `ScannerStatus` owns run health and diagnostics; `StrategyConfig` owns editable strategy parameters; `SignalsManager` owns persisted signal lifecycle operations; `ManualSignal` owns explicitly manual signal creation; Backtest Lab remains research-only. These pages must not independently evaluate strategies or arbitrate.

## Safety boundary

Existing scanner publishing flags, real-data checks, duplicate controls, risk gates, and Telegram eligibility remain in place. Phase C does not enable live customer execution and does not perform Phase D work.
