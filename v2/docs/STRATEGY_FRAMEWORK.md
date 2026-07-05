# STRATEGY_FRAMEWORK

V2 strategies are candidate producers only. They consume `CandleCache` candles and `IndicatorCache` snapshots via `StrategyContextBuilder`, then return either a typed `StrategyCandidate` or `NO_TRADE`.

Lifecycle status is `RESEARCH_READY`. Production certification requires Research Lab historical replay, walk-forward tests, shadow mode, and performance review.

Framework components:
- `StrategyRegistry`: registers strategy definitions and rejects duplicate IDs.
- `StrategyRunner`: runs all registered strategies suitable for a context market/timeframe.
- `StrategyContextBuilder`: builds contexts from shared runtime caches only.
- Candidate factory helpers: create entry, SL, TP, score, confidence, RR, reasons, invalidation rules, required indicators, and market features.
- Validation helpers: warmup, missing indicators, market/timeframe, risk/reward, session/spread/volatility guards.

No strategies fetch data, calculate indicators, place trades, write Supabase rows, or import exchange adapters.
