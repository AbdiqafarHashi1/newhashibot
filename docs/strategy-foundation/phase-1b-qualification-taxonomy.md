# Phase 1B Qualification Ledger and Rejection Taxonomy

## Contract

Every invoked strategy evaluation now produces an immutable `StrategyPlan` with an ordered `qualification_ledger`. A gate contains a stable ID, category, status, human-readable reason, observed/required values where available, and its evidence source. Statuses are:

- `PASS`: the required condition passed.
- `FAIL`: the condition rejected the current evaluation.
- `UNKNOWN`: the strategy did not receive authoritative context. Unknown is visible and is never silently converted to pass.
- `NOT_APPLICABLE`: optional/alternate-path evidence was false but the evaluator accepted through another existing path.

The common ledger always records closed-candle boundary, candle integrity, symbol/timeframe eligibility, valid ATR, liquidity availability, news availability, RR, confidence, and the final evaluator decision. Existing boolean confirmation/readiness evidence is appended without changing evaluator decisions. The final evaluator gate is authoritative during parity migration.

## Rejection categories

| Category | Representative reasons | Ownership |
|---|---|---|
| `DATA` | insufficient, invalid, malformed or stale candles; provider budget | Market data / preflight |
| `ELIGIBILITY` | unsupported symbol or timeframe | Registry/configuration |
| `TREND` | trend filter, no trend, HTF conflict | Strategy |
| `MOMENTUM` | RSI, momentum or candle confirmation failure | Strategy |
| `VOLATILITY` | invalid ATR, ATR too low/high, unstable volatility | Strategy/context |
| `STRUCTURE` | compression, breakout, pullback or reclaim failure | Strategy |
| `LIQUIDITY` | spread too wide; otherwise explicitly unknown | Context/provider |
| `NEWS` | currently unknown because no authoritative input is provided | Future context service |
| `RISK_REWARD` | proposed RR below configured requirement | Strategy qualification |
| `CONFIDENCE` | score/confidence below requirement | Strategy qualification |
| `EVALUATOR` | runtime failure or final evaluator decision | Registry/evaluator |
| `STRATEGY_SPECIFIC` | a preserved legacy reason not yet in the common map | Strategy; visible, never dropped |

## Determinism rules

1. Ledger construction is pure and reads only the definition, evaluation context and legacy result.
2. Config fingerprinting canonicalizes object keys before generating the stable FNV-1a-64 provenance fingerprint.
3. Unknown liquidity/news remain unknown; Phase 1B does not fabricate feeds or introduce gates.
4. A candidate is qualified only when the existing evaluator returned `candidate`; the ledger cannot promote a rejection.
5. A rejection yields `NO_TRADE`, null entry/stop/targets, an evaluator `FAIL`, and a non-empty rejection category.
6. Alternate strategy paths remain visible without reinterpreting an accepted legacy decision as failed.

## Known certification boundary

Registry-level market mismatch, symbol/timeframe ineligibility, disabled configuration and lifecycle exclusion still prevent evaluator invocation exactly as before. They remain registry diagnostics/skips, not fabricated strategy evaluations. Phase 1C may model those pre-evaluation decisions in a separate eligibility report without changing which strategies execute.

