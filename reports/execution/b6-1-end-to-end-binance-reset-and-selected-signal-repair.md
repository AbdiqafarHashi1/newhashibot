# HASHIBOT B6.1 — End-to-End Binance Reset and Selected Signal Repair

Date: 2026-06-08

## 1. Reset FK root cause

`admin_reset_trading_history_batch()` did not delete every child table that can reference `signals.id` before deleting `signals`. The immediate failing FK was `telegram_deliveries_signal_id_fkey`, but the reset also needed to account for execution history, execution event logs, outcome/status rows, optional outcome tables, candidates, rejected setups, and scanner runs.

## 2. Full dependency delete order

The B6.1 reset now deletes in this dependency-safe order:

1. `telegram_deliveries`
2. `execution_event_logs`
3. `execution_orders`
4. `paper_execution_intents`
5. `signal_updates`
6. `signal_outcomes` when present
7. `outcomes` when present
8. `signals`
9. `strategy_candidates`
10. `scanner_candidates` when present
11. `rejected_setups` when present
12. `scanner_runs`

The function uses bounded `ctid` batches and skips optional absent tables via `to_regclass('public.' || t)`, returning a JSON object containing deleted counts for each table.

Preserved tables include customers, packages, subscriptions, profiles/admins, scanner config, strategy configs, execution settings, Telegram setup/config, bot setup records, candles, symbols, and provider config.

## 3. Selected signal null root cause

Manual execution actions assumed a selected signal object was always present and executable. After a reset or signal deletion, the UI could still carry a stale selected value, and the Edge Function treated missing or deleted `signal_id` as a generic thrown error. That created room for null access and vague failures.

B6.1 fixes this by:

- requiring dropdown actions to pass `signal_id` directly;
- validating `signal_id` before dry-run, manual execute, and E2E flow;
- returning clean error codes: `missing_signal_id`, `signal_not_found`, `invalid_selected_signal`, and `stale_signal_not_executable`;
- refreshing the dropdown and clearing stale selections when the selected signal no longer exists.

## 4. Governor paused explanation

The governor is still authoritative. If it evaluates to `paused`, B6.1 returns a structured `governor_paused` response with:

- `governor_state`
- `governor_reason`
- `last_governor_checked_at`
- `execution_allowed: false`
- `admin_action_needed`

The code does **not** silently unpause execution. Admins must review the kill switch, account PnL/drawdown, failed execution streaks, closed-SL streaks, and governor thresholds before changing settings.

## 5. Binance E2E proof fields

`Run E2E Test Flow` now returns proof fields instead of a vague success:

- `entry_submitted`
- `position_detected`
- `native_sl_order_detected`
- `native_tp1_order_detected`
- `native_tp2_order_detected`
- `bracket_mode`
- `protection_status`
- `latest_protection_error`
- `managed_fallback_active`
- `monitor_ready`

The detailed steps also include stale-row cleanup, dry-run sizing plan, execution result, Binance truth fetch, Binance `openOrders`, sync result, and monitor confirmation.

## 6. Files changed

- `supabase/migrations/20260608143000_047_b6_1_reset_signal_fk_chain.sql`
- `supabase/functions/binance-testnet-execution/index.ts`
- `src/pages/admin/Execution.tsx`
- `src/lib/binanceTruthExecution.ts`
- `tests/execution/binanceTruthExecution.test.ts`
- `tests/execution/sqlConstraints.test.ts`
- `reports/execution/b6-1-end-to-end-binance-reset-and-selected-signal-repair.md`

## 7. SQL migration added

Added migration:

`supabase/migrations/20260608143000_047_b6_1_reset_signal_fk_chain.sql`

It replaces `admin_reset_trading_history_batch()` and `admin_reset_trading_history()` with JSON-returning, batch-safe, dependency-ordered reset functions.

## 8. Manual test steps

1. Deploy the B6.1 migration.
2. Open Admin → Performance and run Reset Trading History.
3. Confirm the JSON response reports deleted counts and no FK violation.
4. Open Admin → Execution and refresh.
5. Confirm stale/deleted signals are absent from the dropdown.
6. Click Dry-run Selected Signal without a valid selection and confirm `missing_signal_id` or `invalid_selected_signal` is returned cleanly.
7. Select a fresh crypto signal and run Dry-run Selected Signal.
8. Run Execute Selected Signal only in Binance testnet mode.
9. Run Run E2E Test Flow and confirm the result includes entry, position, TP1, TP2, SL, bracket, fallback, and monitor proof fields.
10. If governor is paused, confirm the UI shows state, reason, last checked time, execution allowed false, and admin action guidance.

## 9. Confirmation scanner/arbitrator untouched

No scanner strategy logic, scanner scoring, arbitrator decision logic, or strategy tuning was changed.

## 10. Confirmation live trading impossible

Live trading remains blocked. The execution function still enforces testnet-only environment checks and rejects live trading. Settings updates still force `live_trading_enabled = false`, and tests continue to assert live trading is forbidden.
