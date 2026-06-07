# MicroScalper scanner parity verification

Date: 2026-06-05

## Scope

MicroScalper only. CompressionBreakout and SwingContinuation evaluator logic and params were not changed in this follow-up. No provider, Telegram, outcome tracking, customer, testnet, MT5, or forex validation logic was changed.

## Findings

| Check | Finding | Fix |
|---|---|---|
| Same scanner params as successful 5m CSV/backtest path? | No. The Backtest Lab/live-like CSV path uses MicroScalper balanced values (`rsi_buy_min=52`, `rsi_sell_max=48`, `stop_atr_mult=1.4`, `max_bars_in_trade=24`), but scanner 5m runtime could use hidden 5m overrides (`54/46`, `1.45`, `30`) unless DB provided explicit timeframe keys. | Align scanner 5m runtime with balanced CSV path and add migration 039 to remove hidden 5m override keys if present. |
| Evaluated on both 5m and 15m? | Yes. MicroScalper fallback/config path allows `['5m','15m']`, and scanner evaluates MicroScalper for crypto when the timeframe is allowed. | No change required. |
| Losing at evaluator/score/RR/distance/duplicate/arbitration? | Code path already records candidate-level reasons. This follow-up adds explicit scanner-run counters for evaluator pass, score pass, RR pass, distance pass, duplicate pass, arbitration entered/won, and signals created so future live runs show the exact MicroScalper leakage point in `scanner_runs.strategy_evaluation_summary.MicroScalper`. | Diagnostic-only scanner summary expansion. |
| One-active-symbol blocking? | Possible and now measurable. Duplicate rejection records `duplicate_active_signal` and blocking signal metadata at candidate level; scanner-run summary now also exposes `duplicate_pass` vs `duplicate_active_signal`. | No duplicate policy change made. |
| Arbitration unfairly favoring SwingContinuation? | Possible on 15m when both pass. The scanner already stores `arbitration_candidates` and marks MicroScalper losers as `arbitration_blocked`. This follow-up adds run-level `arbitration_entered` and `arbitration_won` counters. | No arbitration weighting change made because SwingContinuation is currently working and should not be weakened. |
| Expiry/max bars correct? | Not for scanner 5m parity: previous runtime default could be 30 bars (150 minutes), while the successful CSV/backtest balanced path uses 24 bars. | Scanner 5m now defaults to 24 bars unless DB explicitly configures timeframe-specific keys; migration 039 removes hidden 5m override keys. |
| Trade management/outcome matching backtest? | Outcome logic was not changed. MicroScalper backtest and scanner both use TP1/TP2/SL/expiry outcome semantics, but live outcome aggregation can differ because scanner stores signals and outcome tracking evaluates real candles after signal creation. | No outcome/trade-management code changed per instruction. |

## MicroScalper-only pipeline table

The repo cannot safely query the live Supabase project from this environment, so live gate counts cannot be filled from production rows here. The code now produces this exact table for every scanner run under `scanner_runs.strategy_evaluation_summary.MicroScalper`:

| Field | Meaning | Source |
|---|---|---|
| evaluated | MicroScalper evaluator calls | Scanner run summary |
| evaluator_pass | Evaluator returned candidate instead of rejected | Scanner run summary |
| score_pass | `confidence_score >= min_score` | Scanner run summary |
| rr_pass | `risk_reward >= min_rr` | Scanner run summary |
| distance_pass | Passed SL/TP/RR distance guard | Scanner run summary |
| duplicate_pass | Selected candidate was not blocked by one-active-symbol duplicate guard | Scanner run summary |
| arbitration_entered | Passed distance guard and entered arbitration | Scanner run summary |
| arbitration_won | Won arbitration for its symbol/timeframe | Scanner run summary |
| signals_created | Inserted live scanner signal rows | Scanner run summary |
| wins | Closed MicroScalper wins | Existing signal performance analytics |
| losses | Closed MicroScalper losses | Existing signal performance analytics |
| expired | Expired MicroScalper signals | Existing signal performance analytics |
| total_R | Sum of MicroScalper closed/expired R | Existing signal performance analytics |

Given the live aggregate supplied in the prompt, the currently known MicroScalper performance row is:

| evaluated | evaluator_pass | score_pass | rr_pass | distance_pass | duplicate_pass | arbitration_entered | arbitration_won | signals_created | wins | losses | expired | total_R |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| available after next scanner run | available after next scanner run | available after next scanner run | available after next scanner run | available after next scanner run | available after next scanner run | available after next scanner run | available after next scanner run | not supplied | not supplied | not supplied | not supplied | -0.62 |

The prompt-supplied aggregate states MicroScalper currently has 12 trades, PF 0.91, and -0.62R; it did not include the live scanner gate counts or the wins/losses/expired split needed to fill the remaining columns without querying production.

## MicroScalper-only fix applied

1. Scanner 5m runtime params now match the successful CSV/backtest balanced surface unless DB explicitly overrides them.
2. Migration 039 removes hidden MicroScalper 5m override keys and pins `allowed_timeframes=['5m','15m']`, `min_score=72`, `min_rr=1.2`, and `max_bars_in_trade=24`.
3. Scanner run summaries now expose the exact MicroScalper leakage table requested for future live verification.

## Confirmation

- SwingContinuation untouched in this follow-up.
- CompressionBreakout untouched in this follow-up.
- Provider/Telegram/outcome/customer/testnet/MT5/forex validation untouched.
