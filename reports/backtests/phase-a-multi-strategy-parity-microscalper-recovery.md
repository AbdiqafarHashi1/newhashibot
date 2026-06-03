# Phase A — Multi-Strategy Parity + MicroScalper Recovery
**Date:** 2026-06-03  
**Scope:** Crypto signal mode only. No changes to forex, Telegram, MT5, customer flows, or UI.

---

## Pipeline Count (all-time, actual DB at audit date)

| Strategy | Market | Candidates Inserted | Rejected | Signals Created | Signal Outcomes |
|---|---|---|---|---|---|
| MicroScalper | crypto | 186 | 108 (duplicate_active_signal) | 30 | 2W / 12L / 13 expired / 3 demo |
| CompressionBreakout | crypto | 0 | 0 | 0 | — |
| SwingContinuation | crypto | 0 | 0 | 0 | — |
| MicroScalper | forex | 48 | 31 | 6 (demo only) | 0W / 0L / 6 expired |

---

## Root Cause Analysis

### RC-1 — Scanner cron completely stopped (PRIMARY CAUSE)

`cron.job` table was **empty** at audit time. `scanner_config.last_scheduled_scan_at = 2026-05-29 13:46:43` — the cron has not fired in 5+ days. Zero new signals from any strategy since May 29. The user-reported "MicroScalper death" (3 trades, 0 wins, -3R) is a view artifact from the earliest active period; the actual DB shows 30 MicroScalper crypto signals.

**Evidence:** `SELECT * FROM cron.job → 0 rows`. `last_scheduled_scan_at` frozen.

### RC-2 — evaluate-signal-outcomes never had a cron job

The outcome evaluator Edge Function is deployed and functional, but no pg_cron job existed to call it on a schedule. Result: open signals could only expire/resolve when something called the function manually. This explains the high expiry count and misleading performance statistics. MicroScalper 5m signals with `max_bars_in_trade=30` should expire after 150 minutes; the DB shows avg 23.8h open before expiry — only possible with infrequent manual evaluation.

### RC-3 — CompressionBreakout: zero candidates, structural market-condition issue

CB is evaluated every scan on 15m and 1h for all 10 crypto symbols (confirmed via per-run `strategy_evaluations_count`). It always fails the `compression_not_ready` primary gate.

`strictCompressionReady` requires `barsInside >= 14` where a bar "inside" must have `high ≤ boxHigh × 1.0015 AND low ≥ boxLow × 0.9985` across a 50-bar lookback. During the active May 26–29 scan period BTC/ETH were in directional moves — very few bars satisfy this tight range requirement.

The `nearCompressionReady` fallback (requires `compressionScore >= 45` AND `breakoutConfirmed`) is also rarely met when bars are not inside the box.

**This is not a code bug.** The evaluator correctly withholds candidates until genuine range compression exists. No gate was changed.

### RC-4 — SwingContinuation: zero candidates, gate requires EMA pullback structure

SC evaluates on 15m, 1h, and 4h (BTC/ETH/SOL only). Always fails `pullback_not_ready`: requires `pullbackLow <= emaFast + atr * 0.75` (buy) — i.e. the 5-bar low must have touched within 0.75 ATR of EMA20. In momentum-driven trending markets without a retracement, this never triggers.

The `reclaimByQuality` override (requires `pullbackScore >= 68 AND momentumScore >= 45 AND priceVsEma > -0.05`) provides a softened path but needs high pullback quality.

**Not a code bug.** Strategy requires genuine trend + EMA-touch structure.

### RC-5 — strategyIdentityFit() missing explicit MicroScalper branch (FIXED)

`strategyIdentityFit()` had explicit branches for `CompressionBreakout`, `SwingContinuation`, and `ForexMicroScalper`, but **`MicroScalper` fell through to the default branch**. The default:

```
trend * 0.25 + momentum * 0.25 + rsi * 0.18 + candle_body * 0.14 + rr * 0.18
```

vs MicroScalper's actual score formula:

```
trend * 0.24 + momentum * 0.22 + rsi * 0.18 + body * 0.12 + volatility * 0.12 + rr * 0.12
```

The default branch: (1) ignores `volatility_score` entirely — 12% of actual score; (2) over-weights `rr_score` by 50% (0.18 vs 0.12); (3) slightly over-weights `momentum` (0.25 vs 0.22). When MicroScalper competed against another strategy in arbitration, its identity score did not reflect what the evaluator actually valued.

---

## Scanner / Backtest Parity Table

| Dimension | Scanner Actual | Expected / Target |
|---|---|---|
| MicroScalper timeframes | 5m, 15m (correct) | 5m, 15m |
| CB timeframes | 15m, 1h (correct) | 15m, 1h |
| SC timeframes | 15m, 1h, 4h (BTC/ETH/SOL) | 15m, 1h |
| Cron firing | STOPPED since May 29 | Every 5 min |
| Outcome evaluation cron | MISSING | Every 5 min |
| MicroScalper identity fit in arbitration | Default branch (wrong weights) | Explicit branch matching evaluator |
| CB candidate generation | Zero — market conditions | Fires when compression structure exists |
| SC candidate generation | Zero — market conditions | Fires when EMA pullback exists |

---

## Fixes Applied

### Fix 1 — Cron jobs restarted (migration 035)

`supabase/migrations/20260603_035_repair_cron_jobs_and_restart_scheduler.sql`

- Cleared stale `cron.job` entries
- Re-registered `hashibot_scheduled_market_scanner_5m` (every 5 min)
- **Registered `hashibot_evaluate_signal_outcomes_5m` (every 5 min) — new**
- Updated `scanner_config.cron_job_active = true`

Verified: `SELECT jobname, active FROM cron.job` → 2 active rows.

### Fix 2 — MicroScalper explicit arbitration branch

`supabase/functions/market-scanner/index.ts` — `strategyIdentityFit()` ~line 1162

Added explicit `MicroScalper` case with weights matching the evaluator's scoring formula:

```typescript
if (e.name === "MicroScalper") {
  return clampScore(
    scoreBreakdownNumber(b, "trend_score")       * 0.24 +
    scoreBreakdownNumber(b, "momentum_score")    * 0.22 +
    scoreBreakdownNumber(b, "rsi_score")         * 0.18 +
    scoreBreakdownNumber(b, "candle_body_score") * 0.12 +
    scoreBreakdownNumber(b, "volatility_score")  * 0.12 +
    scoreBreakdownNumber(b, "rr_score")          * 0.12,
  );
}
```

`market-scanner` Edge Function redeployed.

---

## What Was NOT Changed

- No changes to MicroScalper entry/stop/TP logic or gate thresholds
- No changes to CompressionBreakout or SwingContinuation evaluators
- No changes to distance guard thresholds
- No changes to any scoring formula
- No changes to Telegram, outcome evaluation TP/SL logic, customer flows, payment, MT5, forex validation, or UI
- No strategy config loosening

---

## Deferred Items

| Item | Reason |
|---|---|
| CB gate relaxation (e.g. lower `min_box_bars`) | Requires live data post-cron-restart to confirm gate is genuinely too strict vs market conditions. May 26–29 was trending — not representative. |
| SC gate relaxation (e.g. widen pullback zone) | Same. Need 2+ weeks of scan data with continuous outcome evaluation before concluding the gate needs tuning. |
| MicroScalper 5m `max_bars_in_trade` review | The 13 expired signals are artifacts of outcome evaluator not running. Re-evaluate after 48h of live data with the new cron active. |
| CB/SC identity fit review | Defer until candidates exist in DB to validate. |

---

## Build & Type Check

```
npm run typecheck  → 0 errors
npm run build      → success (0 errors, 918 kB bundle)
```
