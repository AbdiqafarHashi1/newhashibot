# Product Routing + Binance Monitor Stability Fix

## 1. What was working and preserved
- Intelligence engine/orchestrator routing was not refactored. Existing Free/VIP intelligence event routing remains in `supabase/functions/_shared/telegram-router.ts` and intelligence generation remains in `supabase/functions/_shared/intelligence-engine.ts`.
- Scheduled scanner and Binance testnet execution entry placement logic were not changed. This patch only touches monitor lifecycle cleanup/truth handling and Execution UI truth display.
- Cron auth and scanner auth were preserved; no changes were made to `_shared/internal-auth.ts` or scanner routing.

## 2. Admin alert proof
- Existing admin routing sends failure/critical/cleanup/provider/cron-like event types to admin via `routeTelegramEvent`.
- Monitor now records duplicate cleanup warnings and profit-lock replacement degradation warnings into monitor warnings/event logs, allowing admin-facing delivery/digest surfaces to report actionable monitor problems without optional provider spam.

## 3. Admin digest proof
- No digest scheduler was refactored in this patch. The report documents the monitor fields the digest can safely consume: `latest_monitor_status`, `latest_monitor_result`, `open_binance_positions`, `open_binance_orders`, stale cleanup count, warnings, row errors, critical errors, and account fetch timestamp.

## 4. Free signal selector proof
- Free/VIP intelligence routing was preserved and not broadened. `free_selected_signal` remains routed to Free only while intelligence posts continue to route Free+VIP where already allowed.

## 5. VIP unchanged proof
- VIP receives intelligence and existing approved/lifecycle signal routing because the Telegram router and scanner delivery paths were not changed.

## 6. Binance monitor 1-minute proof
- Existing migrations include `hashibot_binance_testnet_monitor_1m` scheduled at `*/1 * * * *`.
- UI now derives health from the latest monitor run timestamp and status instead of displaying the stored status as healthy unconditionally.
- The monitor writes `latest_monitor_run_at`, `latest_monitor_status`, `latest_monitor_result`, and now also `latest_account_state_at` during every account refresh.

## 7. Profit lock failure root cause
- Root cause in code: after TP1, replacement SL placement required immediate Binance verification. If `/fapi/v1/algoOrder` did not confirm the new algo order, the monitor threw `replacement_sl_not_verified`, which became `profit_lock_replacement_failed`.
- Previous behavior could mark the row `unprotected_failed` even when the original SL still existed.
- Fix: if an original SL id exists and the replacement fails, the monitor preserves the existing SL, marks protection as degraded, records exact error text, disables `profit_lock_sl_active`, and retries later instead of silently marking safe.
- If no original SL exists, the error remains critical.

## 8. Conditional order cleanup proof
- The native protection watchdog now verifies the expected protection set first, then cancels duplicate/stale conditionals that conflict with the verified current protection set.
- Cleanup is guarded so the monitor does not cancel conditionals unless at least one expected live protection order is verified, and it never cancels the only known valid SL for an open position.
- Closed/no-position orphan cleanup path remains in place and cancels leftover Binance conditionals when there is no Binance position.

## 9. DOGE/AVAX stale/duplicate order explanation
- DOGE/AVAX duplicate conditionals are explained by old unmanaged or previously replaced TP/SL algo orders remaining open after TP1/profit-lock or previous lifecycle transitions.
- This patch makes the monitor classify such extras as duplicate/stale only after current SL/TP protection is verified, then cancels the older conflicting extra conditionals safely.
- If Binance testnet state cannot prove the current protection set, DOGE/AVAX duplicates are left untouched and marked for retry/manual observation instead of risking the only SL.

## 10. TP1/BE/+0.3R proof
- TP1 detection exists for native algo fills and managed fallback mark-price detection.
- +0.3R profit-lock price is calculated from entry and original SL.
- Priority is TP1 first: on TP1 fill, the monitor attempts replacement SL at +0.3R for the runner; only after verified replacement does it cancel the old SL.
- If replacement is not verified, the old SL is preserved and UI/monitor status show degraded protection rather than healthy.

## 11. UI truth changes
- Execution UI now shows `HEALTHY` only when the latest monitor run is recent, not critical/degraded, and has no monitor/sync error.
- It shows `UNHEALTHY` when there is no invocation, the run is older than 180 seconds, latest status is `critical_error`/`degraded`, or monitor/sync errors are present.
- UI includes an explicit red truth-guard explanation when unhealthy.

## 12. Remaining risks
- Admin digest 60-minute trigger and safe test trigger need live Supabase/Telegram verification in the target environment.
- DOGE/AVAX cleanup needs observation against current Binance testnet orders to prove which order ids were cancelled vs retained.
- Live Edge Function invocation recency and latest cron response must be verified from Supabase logs after deployment; local tests prove code shape only.
- Optional unavailable feeds should continue to be treated as warning/unavailable, not emergency alerts.

## 13. READY FOR OBSERVATION: YES
- Ready for testnet observation after deployment. The patch is intentionally monitor/UI scoped and avoids scanner strategy, intelligence, Forex, MT5, capital allocation, and Binance entry placement refactors.
