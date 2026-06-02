# Phase 1G-C Active Signal Cleanup

## 1. Scope and Safety
- Scope: cleanup/correction on top of the current unmerged Phase 1G-B branch.
- Kept calibration work, runtime effective params, diagnostics, arbitration improvements, duplicate protection, and expiry diagnostics.
- Simplified signal-mode terminology to only `active_signal` and `blocked_signal`.
- No execution, crypto testnet, MT5, providers, Telegram infrastructure, outcome tracking, customer/package/Bot setup, scanner schedule, symbol universe, DB `strategy_config`, or trading-history reset changes were made.

## 2. Files Changed
- `supabase/functions/market-scanner/index.ts`: simplified strategy signal modes, kept all calibrated crypto strategy/timeframe pairs active, kept forex blocked, and retained arbitration/duplicate/expiry diagnostics.
- `scripts/backtest-optimizer.mjs`: removed older non-active wording from Phase 1F/Phase 1G planning text.
- `reports/backtests/phase-1g-a-microscalper-15m-scanner-port.md`: replaced with a short superseded note using the current terminology.
- `reports/backtests/phase-1g-b-multi-strategy-crypto-signal-mode.md`: replaced with a short superseded note using the current terminology.
- `reports/backtests/phase-1g-c-active-signal-cleanup.md`: this cleanup report.
- `reports/backtests/phase-1f-full-strategy-calibration.md`: regenerated after the wording cleanup.

## 3. Exact Places Old Signal-Mode Wording Was Removed
- Scanner `StrategySignalMode` now contains only `active_signal | blocked_signal`.
- `phase1GStrategySignalMode()` now returns `active_signal` for all calibrated crypto strategy/timeframe pairs and `blocked_signal` for forex/unsupported pairs.
- `phase1GConfigDiagnostics()` now emits `active_signal`, `blocked_signal`, and customer-signal eligibility from those two modes only.
- Candidate blocking logic now checks only `blocked_signal`; crypto active strategies are not excluded before arbitration.
- Historical reports for 1G-A and 1G-B were replaced with superseded notes that use only current signal-mode terminology.
- Phase 1F report generation no longer emits older non-active wording in the Phase 1G decision text.

## 4. Final Strategy Table
| Strategy | Timeframe | Final mode |
| --- | --- | --- |
| MicroScalper | 15m | `active_signal` |
| MicroScalper | 5m | `active_signal` |
| CompressionBreakout | 15m | `active_signal` |
| CompressionBreakout | 1h | `active_signal` |
| SwingContinuation | 15m | `active_signal` |
| SwingContinuation | 1h | `active_signal` |
| ForexMicroScalper | 15m/1h | `blocked_signal` |
| ForexSwingContinuation | 15m/1h | `blocked_signal` |

## 5. Calibrated Runtime Params Preserved
- MicroScalper 15m keeps the Phase 1F baseline: `min_score=72`, `min_rr=1.2`, `stop_atr_mult=1.4`, `tp1_r=1.2`, `tp2_r=1.8`, `min_body_atr=0.30`, `rsi_buy_min=52`, `rsi_sell_max=48`, `max_bars_in_trade=24`.
- MicroScalper 5m keeps the noise-reduction params: `max_bars_in_trade=30`, `rsi_buy_min=54`, `rsi_sell_max=46`, `stop_atr_mult=1.45`.
- CompressionBreakout 15m keeps: `min_score=76`, `breakout_buffer_atr=0.16`, `tp1_r=1.05`, `tp2_r=2.6`.
- CompressionBreakout 1h keeps the current strict calibrated parameters from 1G-B.
- SwingContinuation 15m keeps the current calibrated 15m candidate from 1G-B.
- SwingContinuation 1h keeps the current calibrated 1h candidate from 1G-B.

## 6. Active Crypto Confirmation
All calibrated crypto strategies can now:
- evaluate,
- enter arbitration,
- win arbitration,
- create customer-facing signals.

They still must pass score gates, RR gates, distance guards, duplicate protection, one-active-symbol protection, arbitration, grade requirements, and real-data requirements.

## 7. Forex Confirmation
- ForexMicroScalper remains `blocked_signal`.
- ForexSwingContinuation remains `blocked_signal`.
- Blocking reason remains `forex_not_calibrated` because no real forex CSV validation exists.
- No forex profitability is faked from crypto data.

## 8. Arbitration Diagnostics Preserved
Arbitration continues to expose:
- `selected_strategy`,
- `selected_timeframe`,
- `selected_arbitration_score`,
- `candidate_arbitration_score`,
- `arbitration_loss_reason`,
- competing candidates with candidate signal mode and timeframe.

Strategy order does not select the winner; candidates are sorted by arbitration score, identity fit as tie-breaker, then RR.

## 9. Duplicate/Stale Active Signal Diagnostics Preserved
Duplicate and one-active-symbol protections remain in place. Duplicate blocks continue exposing:
- `active_symbol_blocked_by_existing_signal`,
- `existing_signal_strategy`,
- `existing_signal_timeframe`,
- `existing_signal_age`,
- `stale_active_signal_possible`,
- `duplicate_protection_preserved`.

## 10. SwingContinuation Expiry Diagnostics Preserved
No expiry behavior was changed. Diagnostics continue exposing:
- `expected_hold_profile`,
- `configured_time_stop_bars`,
- `scanner_expiry_hours`,
- `expiry_window_may_be_too_short`,
- `strategy_timeframe_hold_mismatch`.

## 11. Confirmed Unchanged Areas
- No provider changes.
- No Telegram changes.
- No outcome tracking changes.
- No customer/Bot changes.
- No execution/testnet/MT5 changes.
- No scanner schedule changes.
- No symbol universe changes.
- No DB `strategy_config` writes.
- No trading-history reset.
- No fake signals.

## 12. Testing Results
- `npm run typecheck` — passed.
- `npm run lint` — passed with existing Fast Refresh warnings in `src/components/ui/Badge.tsx` and `src/contexts/AuthContext.tsx`.
- `npm run build` — passed with the existing Vite chunk-size warning.
- `npm run backtest:calibrate` — passed.
- `git diff --check` — passed.
- `deno --version` — unavailable in this container (`deno: command not found`), so Supabase Edge Function Deno type-checking was not run locally.

## 13. Manual Verification Checklist
1. Do not auto-reset trading history.
2. Run scanner manually.
3. Confirm MicroScalper 15m evaluates, enters arbitration, and can create signals when gates pass.
4. Confirm MicroScalper 5m evaluates, enters arbitration, and can create signals when gates pass.
5. Confirm CompressionBreakout 15m evaluates, enters arbitration, and can create signals when gates pass.
6. Confirm CompressionBreakout 1h evaluates, enters arbitration, and can create signals when gates pass.
7. Confirm SwingContinuation 15m evaluates, enters arbitration, and can create signals when gates pass.
8. Confirm SwingContinuation 1h evaluates, enters arbitration, and can create signals when gates pass.
9. Confirm ForexMicroScalper and ForexSwingContinuation remain `blocked_signal` with reason `forex_not_calibrated`.
10. Confirm rejected candidates are visible for all crypto strategy/timeframe pairs.
11. Confirm customer-facing signals are not fake.
12. Confirm provider, Telegram, outcome, customer/Bot, execution/testnet/MT5, schedule, symbol universe, and DB strategy_config behavior did not change.
