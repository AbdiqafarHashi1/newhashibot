# Hashibot Strategy Phase A.5C — Pre-Merge Confirmation

Date: 2026-06-10

## 1. Candidate independence confirmation

Confirmed.

- The scanner computes market context after candles/indicators are available, but before candidate arbitration.
- The scanner then builds `allEvals` and calls `evaluateStrategy()` independently for each strategy.
- For crypto symbols, `MicroScalper`, `CompressionBreakout`, and `SwingContinuation` are each evaluated before arbitration begins.
- Candidate rows are inserted for every strategy evaluation before distance guard and arbitration processing.
- `passingEntries` is populated only after each candidate row exists and passes distance guards.
- Arbitration starts only after the evaluator loop completes.
- Losing candidates are retained with `arbitration_blocked`, `arbitration_loss_reason`, selected strategy/score, and the full `arbitration_candidates` snapshot.
- Mixed/no-trade arbitration also runs only after candidates have been recorded.
- No hardcoded daily signal cap or per-strategy frequency quota was found in the strategy/arbitration changes. Existing `max_trades_per_day` fields are risk-profile/governor controls, not Phase A/A.5 strategy frequency caps.

No candidate-independence wiring bug was found.

## 2. MicroScalper confirmation

Confirmed.

- MicroScalper still runs through `evaluateStrategy("MicroScalper", ...)` independently and is not blocked by arbitration before evaluation.
- MicroScalper freshness is active in `strategyFreshnessScore()` through EMA extension, chase risk, and market momentum.
- Overextension/chase protection remains active through `chase_risk`, `price_extension_atr`, and the existing `overextensionPenalty()` path.
- MicroScalper can win short-term momentum regimes because `marketRoleFit()` rewards momentum strength, low overextension, volatility expansion, and lower chop for MicroScalper.
- No MicroScalper evaluator gate was loosened in Phase A.5C.
- No hard MicroScalper quota, daily cap, or forced-frequency rule was added.

No MicroScalper wiring bug was found.

## 3. CompressionBreakout confirmation

Confirmed.

- CompressionBreakout still runs through `evaluateStrategy("CompressionBreakout", ...)` independently and can still produce candidates before arbitration.
- Breakout freshness is active through `breakout_freshness_score`.
- Stale/late breakout scoring is active through `late_breakout_penalty`.
- Exhausted late breakouts are rejected only when the breakout is late and momentum/expansion are insufficient via `late_breakout_exhausted`.
- The repair is conditional, so CompressionBreakout was not accidentally killed; strong late breakouts with enough momentum/expansion can still pass.
- Backtest Lab mirrors the late-breakout exhausted rejection and score penalty.

No CompressionBreakout wiring bug was found.

## 4. SwingContinuation confirmation

Confirmed.

- SwingContinuation still runs through `evaluateStrategy("SwingContinuation", ...)` independently and can still produce candidates before arbitration.
- `strict_reclaim_required_for_A` is active for quality-only reclaim setups that are not strong enough for A+.
- `chop_continuation_risk` is active for sub-A+ continuation candidates in high chop.
- Weak A-grade continuation approximations are tightened through stronger `trendQualityPass`, stricter `reclaimByQuality`, and the continuation chop score.
- SwingContinuation can still win in clean trend pullback/reclaim regimes because strict reclaim, trend strength, pullback state, reclaim state, grade, and role fit remain rewarded by arbitration.
- SwingContinuation is penalized in mixed/choppy markets by both strategy-level chop rejection and arbitration-level non-A+ SwingContinuation chop penalty.
- Backtest Lab mirrors the high-chop sub-A+ rejection.

No SwingContinuation wiring bug was found.

## 5. Arbitration semantics confirmation

Confirmed.

Arbitration uses:

- market regime fit via `MarketContext` and `preferred_strategy`
- strategy role fit via `marketRoleFit()`
- grade via `gradePct`
- score via `confidence_score`
- RR via `risk_reward`
- freshness via `strategyFreshnessScore()`
- distance margin via distance-guard margins
- overextension/chase risk via `overextensionPenalty()`
- mixed-market penalty via `mixedMarketPenalty`
- expected-value aggregation via `arbitrationScore()`

Additional confirmations:

- A+ candidates receive grade advantage, but a weaker A can still win only if market role fit, freshness, RR, distance margin, and preferred-regime fit clearly overcome the grade gap.
- Mixed/choppy markets can return no trade via `arbitrationNoTradeReason()` after candidates are recorded.
- Winning candidates keep the original strategy `reason`, selected strategy/score, market context, winner-regime match flag, and arbitration candidate snapshot.
- Rejected arbitration losers include explicit loss reasons from `arbitrationLossReason()`.
- Candidate generation happens first; arbitration then selects one winner or no trade.

No arbitration wiring bug was found.

## 6. Backtest/scanner parity confirmation

Confirmed for Phase A.5 repairs.

- Live scanner and Backtest Lab both include CompressionBreakout late-breakout exhaustion handling.
- Live scanner and Backtest Lab both include CompressionBreakout late-breakout score penalty.
- Live scanner and Backtest Lab both include SwingContinuation high-chop sub-A+ rejection.
- Phase A expiry classification remains present in both live outcome evaluation and Backtest Lab simulated trade metrics.
- Strategy reports document the same Phase A/A.5 behavior.

Known limitation: Backtest Lab remains a browser approximation and does not import Supabase Edge Function code directly. No parity-blocking wiring bug was found.

## 7. Wiring bugs found and fixed

None.

Phase A.5C was confirmation-only. No strategy logic, scoring rules, arbitration weights, filters, diagnostics, or UI work were added.

## 8. Files inspected

- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/evaluate-signal-outcomes/index.ts`
- `src/pages/admin/BacktestLab.tsx`
- `reports/strategies/strategy-phase-a-unified-optimization.md`
- `reports/strategies/strategy-phase-a5-complete-repair.md`
- `package.json`
- `tests/execution/binanceTruthExecution.test.ts`
- `tests/execution/binanceTestnetMonitor.test.ts`
- `tests/execution/sqlConstraints.test.ts`

## 9. Confirmation no new strategy optimization was added

Confirmed. Phase A.5C added only this confirmation report. No strategy code was changed in this confirmation pass.

## 10. Confirmation protected systems were untouched

Confirmed untouched:

- Binance execution
- monitor
- TP/SL engine
- Telegram
- reset logic
- public pages
- customer pages
- live trading
