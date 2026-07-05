# STRATEGY_PARAMETERS

Shared parameters are embedded in strategy definitions:
- `minCandles`: warmup threshold before any candidate is considered.
- `minScore`: default 70.
- `minRiskReward`: default 1.4R.
- `atrStopMultiple`: default 1.5 with strategy-specific stop construction.
- `tp1R`, `tp2R`: target assumptions used by candidate factory.
- `maxSpreadPct`: forex spread guard where cached metadata exists.
- `allowedTimeframes`: per-strategy timeframe contract.
- `market`: `crypto` or `forex`.

Scoring is deterministic and rule-based. A candidate must pass data readiness, indicator presence, market/session/volatility suitability, setup-specific validation, score threshold, and RR threshold. Scores and confidence are first-version research priors, not production performance claims.
