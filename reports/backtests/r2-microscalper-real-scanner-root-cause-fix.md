# R2 MicroScalper Real Scanner Root-Cause Fix

**Phase:** R2  
**Date:** 2026-06-03  
**Scope:** Supabase Edge Function scanner path only, focused on `supabase/functions/market-scanner/index.ts`.

---

## 1. Files changed

- `supabase/functions/market-scanner/index.ts`
- `reports/backtests/r2-microscalper-real-scanner-root-cause-fix.md`

No app worker code was used or changed.

---

## 2. Whether MicroScalper 5m is evaluated

Yes, when all of these are true in the real scanner path:

1. The symbol is active and `market_type='crypto'`.
2. Crypto scanning is enabled by scanner config and env.
3. `scanner_config.active_timeframes` includes `5m`.
4. `strategy_configs.MicroScalper.enabled` is not false.
5. `strategy_configs.MicroScalper.allowed_timeframes` is empty or includes `5m`.

R2 now records MicroScalper candidate `score_breakdown` proof for the 5m path, including:

- `strategy_config_loaded`
- `timeframe_allowed`
- `evaluator_called`
- `raw_evaluator_status`
- `distance_guard`
- `arbitration`
- `duplicate_guard`
- `signal_insert`
- `telegram_eligibility`

---

## 3. Whether MicroScalper 15m is evaluated

Yes, under the same scanner conditions as above, with `scanner_config.active_timeframes` and strategy allowed timeframes including `15m`.

R2 records the same proof fields for 15m MicroScalper candidate/rejection rows.

---

## 4. Exact effective params found / enforced

### MicroScalper 15m calibrated scanner params

R2 makes the scanner fallback/runtime diagnostics expose the calibrated 15m values:

- `min_score=72`
- `min_rr=1.2`
- `stop_atr_mult=1.4`
- `tp1_r=1.2`
- `tp2_r=1.8`
- `min_body_atr=0.30`
- `rsi_buy_min=52`
- `rsi_sell_max=48`
- `max_bars_in_trade=24`
- `momentum_lookback=3`
- `min_atr_pct=0.10`
- `max_atr_pct=3.0`
- `crypto_behavior_tuning=true`

### MicroScalper 5m calibrated scanner params

R2 adds runtime 5m calibration because the DB has one MicroScalper row and cannot otherwise represent the requested 5m-specific values:

- `min_score=72` unless DB explicitly sets `min_score`
- `min_rr=1.2` unless DB explicitly sets `min_rr`
- `stop_atr_mult=1.45`
- `tp1_r=1.2`
- `tp2_r=1.8`
- `min_body_atr=0.30`
- `rsi_buy_min=54`
- `rsi_sell_max=46`
- `max_bars_in_trade=30`
- `momentum_lookback=3`
- `min_atr_pct=0.10`
- `max_atr_pct=3.0`
- `crypto_behavior_tuning=true`

Every MicroScalper candidate/rejection now records these effective params plus:

- `config_source`
- `base_config_source`
- `runtime_overrides`

---

## 5. Exact root cause of 0 MicroScalper rows

The code-level root cause proven in R2 is that the live scanner could not prove or consistently apply the calibrated MicroScalper scanner surface:

1. The generic crypto fallback used `min_score=75` and empty params when the DB row was missing or incomplete, while the calibrated MicroScalper balanced scanner requires `min_score=72` and explicit ATR/RSI/body/target params.
2. The scanner had only one MicroScalper DB config surface, so the required 5m-specific calibration (`rsi_buy_min=54`, `rsi_sell_max=46`, `stop_atr_mult=1.45`, `max_bars_in_trade=30`) was not represented in the runtime evaluator path.
3. MicroScalper candidate rows did not expose the exact layer where rows disappeared: raw evaluator, score/RR, distance guard, arbitration, duplicate guard, signal insert, or Telegram eligibility.

Because live database rows are not available inside this authoring environment, R2 does not claim that all production zero-row causes are exhausted. It fixes the proven scanner-code blocker and adds the diagnostics needed to prove the next live blocker after deploy without changing other strategy behavior.

---

## 6. Exact fix made

R2 made a MicroScalper-only Edge Function fix:

1. Added `config_source` to scanner strategy config objects.
2. Changed MicroScalper fallback defaults from generic crypto defaults to calibrated MicroScalper defaults.
3. Added `microScalperRuntimeParams()` to build effective MicroScalper params per timeframe.
4. Added 5m runtime calibration for the parameters requested in R2 while preserving explicit DB `min_score` and `min_rr`.
5. Added `withMicroScalperDiagnostics()` to persist effective params and raw/normalized rejection proof into `score_breakdown`.
6. Added MicroScalper diagnostics for raw evaluator result, score gate, RR gate, distance guard, arbitration loss/selection, duplicate blocking signal id/status/age, signal insert, and Telegram eligibility.

No fake signals were added. RR, distance, arbitration, duplicate, grade, provider, Telegram, and outcome gates remain active.

---

## 7. Confirmation SwingContinuation unchanged

Confirmed. R2 did not edit `evalSwingContinuation()` logic, SwingContinuation params, SwingContinuation strategy config defaults, or SwingContinuation arbitration scoring. SwingContinuation continues to use the existing evaluator and scanner path.

---

## 8. Confirmation CompressionBreakout unchanged

Confirmed. R2 did not edit `evalCompressionBreakout()` logic, CompressionBreakout params, CompressionBreakout strategy config defaults, or CompressionBreakout arbitration scoring. CompressionBreakout continues to use the existing evaluator and scanner path.

---

## 9. Confirmation Forex unchanged

Confirmed. R2 did not edit ForexMicroScalper, ForexSwingContinuation, TwelveData provider routing, forex throttling, forex budget, forex symbols, or forex timeframe planning.

---

## 10. Confirmation no provider/Telegram/outcome/execution changes

Confirmed.

- Provider logic unchanged.
- Telegram infrastructure unchanged.
- Outcome tracking unchanged.
- Execution/testnet/MT5 untouched.

R2 only records Telegram eligibility outcome returned by the existing scanner auto-send function for MicroScalper candidate diagnostics.

---

## 11. Confirmation RR/distance/duplicate guards remain

Confirmed.

- RR gates remain in the evaluator, distance guard, and mode/risk checks.
- Distance guards remain in `checkDistanceGuards()` and are not removed or bypassed.
- Duplicate/one-active-symbol protection remains active and now records the blocking signal id/status/age in MicroScalper diagnostics.
- Arbitration remains fair: MicroScalper can lose to SwingContinuation or CompressionBreakout; R2 records why but does not force MicroScalper to win.

---

## 12. Manual verification steps after deploy

1. Deploy `market-scanner` Edge Function.
2. Run scanner manually.
3. Open Rejected Setups and filter `MicroScalper`.
4. Confirm MicroScalper 5m/15m rows appear for scanned crypto symbols where those timeframes are active.
5. Open candidate `score_breakdown` and confirm effective params are visible.
6. Confirm `raw_rejection_reason`, `normalized_rejection_reason`, and `primary_failed_gate` identify the exact rejection layer.
7. Confirm candidates that pass raw evaluation show distance guard status.
8. Confirm candidates that pass distance guard show arbitration selected/lost diagnostics.
9. Confirm duplicate blocks show blocking signal id/status/age.
10. Confirm if MicroScalper is selected and passes guards, it can create a real signal.
11. Confirm Telegram eligibility is visible for inserted MicroScalper signals.
12. Do not reset history yet.

---

## 13. Testing results

Testing commands requested for R2:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
- Supabase function check if Deno is available

Results are recorded in the final response for this commit.
