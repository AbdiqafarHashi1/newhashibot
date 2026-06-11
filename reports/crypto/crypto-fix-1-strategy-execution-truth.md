# Crypto Fix 1 — Strategy Distribution + Execution Truth Foundation

## 1. MicroScalper findings and repairs

### Findings
- The live scanner already evaluated `MicroScalper` on 5m and 15m, but rejection diagnostics showed the major blockers were `candle_body_too_small`, `momentum_failed`, `rsi_not_confirmed`, and later arbitration outcomes.
- The prior 5m path treated 5m as a standalone strategy surface; it did not require 15m directional agreement even though 5m should only time entries.
- The prior small-body continuation path still required a body threshold unless a single momentum/body condition passed, so controlled continuation pressure could be rejected before arbitration.

### Repairs
- Added explicit 2–3 candle directional pressure validation and included it in diagnostics.
- Added a quality-only small-body waiver for MicroScalper when trend, volatility, RSI, RR, non-overextension, non-chop, and directional pressure all agree.
- Added 15m trend confirmation for 5m MicroScalper by fetching a 15m candle context during the 5m scan path; if unavailable, 5m fails with `htf_trend_not_confirmed` rather than silently accepting.
- Preserved global thresholds and risk controls; no forced trade balancing or quota logic was introduced.

## 2. CompressionBreakout findings and repairs

### Findings
- The blocker audit showed participation can be suppressed when breakout confirmation only recognizes the current candle close outside the box.
- The existing diagnostics already exposed compression, breakout distance, ATR expansion, late breakout penalty, and expansion scores.

### Repairs
- Added evidence-based retest/hold confirmation: a prior 1–2 candle breakout plus a controlled retest that holds outside the box can satisfy breakout confirmation.
- Retained compression readiness, ATR expansion, momentum, volatility, late-breakout exhaustion, and RR gates.
- Added `retest_hold_confirmed` and `prior_breakout_confirmed` diagnostics so future participation changes remain auditable.

## 3. SwingContinuation findings

- SwingContinuation dominance was not nerfed.
- Arbitration still scores it from trend, pullback, reclaim, momentum, slope, and RR evidence.
- The existing swing chop penalty remains in place for non-A+ swing candidates during choppy conditions.
- No diversity-only penalty or artificial balancing was added.

## 4. Arbitration findings and repairs

### Findings
- Arbitration already recorded candidate scores and selected/lost snapshots, but run-level stats did not expose candidate count, rejection reason counts, arbitration losses, or win percentage.
- Grade value was present but comparatively light in the composite score, making A+ vs A outcomes less transparent.

### Repairs
- Added strategy-level `candidate_count`, `rejection_count`, `rejection_reasons`, `arbitration_losses`, and `arbitration_win_pct` to scanner run summaries.
- Added explicit grade quality lift in the composite arbitration score without strategy-specific hidden bonuses.
- Added selected-vs-candidate arbitration score details to loss reasons.
- Kept no-trade behavior tied to mixed/choppy market quality gates only.

## 5. Scanner/backtest parity findings

- Scanner strategy gates now include the same explicit metadata needed by research/backtest review: MicroScalper HTF confirmation, small-body waiver evidence, directional pressure, CompressionBreakout retest/hold evidence, score components, and arbitration snapshots.
- No separate runnable backtest test suite exists in this repo; available validation is scanner source review plus execution test coverage.
- The scheduled scanner delegates to the market scanner, so scanner parity follows the repaired `market-scanner` evaluator/arbitration path.

## 6. Bot Performance fixes

- Binance Testnet Execution Performance now counts only filled entries as bot trades.
- `stale_closed` rows without an entry fill are excluded from bot trade counts.
- Open trades are excluded from PF, win rate, and Total R until closed.
- TP1 no longer counts as a final win; only closed TP2 / closed TP is a bot win.
- Filled TP1, TP2, SL, Closed Trade Count, Pending Sync Count, Entry Timeout Count, and Protection Unavailable Count are displayed from execution records.
- Profit factor displays infinity when there are realized wins and no realized losses instead of appearing blank.

## 7. Monitor truth fixes

- Binance remains the execution source of truth for monitor decisions.
- The monitor now labels unprotected Binance exposure as `unsafe_untracked_position` in recovery event messages.
- Manual/externally closed positions with leftover conditionals are still synced closed and cleaned.
- Monitor health tests assert unsafe position marking and conditional cleanup coverage.

## 8. Conditional cleanup fixes

- Native TP2 and native SL closures now cancel all remaining known protection conditionals, not only a subset.
- Managed TP2 and managed SL closures queue remaining protection IDs/open conditionals for cleanup.
- Timeout and stale/manual close paths continue to cancel remaining TP/SL/open conditionals and log events.

## 9. Testnet leverage/risk settings

- Testnet-only execution defaults were set to 10x leverage for A and A+.
- Testnet max leverage was raised to 10x.
- Testnet risk per trade was set to 2% for A and A+, with a 2% testnet cap.
- Live trading remains blocked by execution mode/testnet/live trading gates; customer package flow was not changed.

## 10. Files changed

- `supabase/functions/market-scanner/index.ts`
- `src/pages/admin/Performance.tsx`
- `src/lib/binanceTestnetMonitor.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/migrations/20260611120000_059_crypto_fix_1_testnet_risk_leverage_truth.sql`
- `tests/execution/binanceTestnetMonitor.test.ts`
- `tests/execution/sqlConstraints.test.ts`
- `reports/crypto/crypto-fix-1-strategy-execution-truth.md`

## 11. Items intentionally not modified

- Forex, Metals, and MT5 work were not started.
- Customer package flow and Telegram routing architecture were not changed.
- SwingContinuation was not removed or diversity-nerfed.
- No hardcoded equal quotas, random balancing, or fake strategy balancing were added.
- Risk controls, kill switch, daily loss protection, max positions, and one-active-signal-per-symbol protections were preserved.
- TP1 +0.3R profit-lock lifecycle was not implemented.
- TP2 runner lifecycle was not implemented.
- Execution expiry lifecycle beyond existing monitor time-stop handling was not newly implemented.
