# Binance Testnet End-to-End Truth-First Fix (HASHIBOT B5)

## 1. Why duplicate/same-symbol skipped when Binance had no trade

The prior execution path treated an existing `execution_orders` row as authoritative before proving Binance exchange state. A stale active DB row could therefore return `skipped_duplicate_signal` or `skipped_active_symbol_execution` even when Binance Demo had no real open `positionRisk` amount and no `/fapi/v1/openOrders` for that symbol.

B5 makes Binance truth authoritative before those skips. Active duplicate or same-symbol DB rows are now checked against Binance Demo first; if Binance has no position and no open orders, those DB rows are marked `stale_closed` and execution is allowed to retry.

## 2. Exact DB statuses that can block

Only these active execution statuses can block duplicate/same-symbol execution after B5:

- `pending`
- `entry_submitted`
- `entry_filled`
- `protected`
- `partially_closed`
- `pending_protection`
- `protected_managed`
- `pending_managed_protection`

These statuses are retryable/non-blocking for manual selected signal retry:

- `skipped`
- `failed`
- `cancelled`
- `stale_closed`
- `closed_tp`
- `closed_sl`
- `closed_breakeven`

`sent_to_bridge`, `accepted`, `rejected`, and `filled` remain allowed by the historical execution status check constraint for compatibility, but they are not used as active Binance testnet blockers.

## 3. Exact Binance truth check before blocking

Before returning `skipped_duplicate_signal` or `skipped_active_symbol_execution`, the execution function now calls:

- `GET /fapi/v2/positionRisk` with `symbol`
- `GET /fapi/v1/openOrders` with `symbol`

The execution blocks only if Binance Demo proves either:

- `abs(positionAmt) > 0`, or
- `openOrders.length > 0`

If both are false (`positionAmt = 0` and `openOrders.length = 0`), matching active DB rows are marked `stale_closed` with a Binance-truth cleanup reason and execution continues.

## 4. Whether native SL/TP orders work on Binance Demo

B5 still attempts exchange-native reduce-only protection first:

- SL: `STOP_MARKET`, reduce-only
- TP1: `TAKE_PROFIT_MARKET`, reduce-only, 50% quantity
- TP2: `TAKE_PROFIT_MARKET`, reduce-only, remaining 50% quantity

The function then re-fetches `/fapi/v1/openOrders` for the symbol and verifies that the submitted SL, TP1, and TP2 order IDs are present. If all three are verified, the execution is saved as:

- `bracket_mode = exchange_native`
- `protection_status = protected`
- SL/TP1/TP2 order IDs saved

If Binance Demo rejects, does not support, or does not show verified native orders, B5 does not leave the position unprotected; it enables managed fallback when valid intended SL/TP levels and quantities exist.

## 5. If native SL/TP does not work: exact managed fallback behavior

Managed fallback is now treated as a protected mode, not a failed unprotected state, when the intended levels and quantities are valid:

- Saves `intended_sl`, `intended_tp1`, `intended_tp2`
- Saves `tp1_quantity` as 50%
- Saves `tp2_quantity` as remaining 50%
- Saves `remaining_quantity`
- Sets `bracket_mode = managed_exit_fallback`
- Sets `protection_status = protected_managed`

The monitor checks Binance mark price every cron run:

- TP1 hit: sends reduce-only market close for 50%, records partial close, and logically moves SL to breakeven for remaining quantity.
- TP2 hit: sends reduce-only market close for remaining quantity and closes as `closed_tp`.
- SL hit before TP1: sends reduce-only market close for remaining quantity and closes as `closed_sl`.
- SL hit after TP1: uses entry/breakeven as the active stop for remaining quantity.

If neither native protection nor valid managed fallback can be activated, the row is saved as:

- `status = failed`
- `bracket_mode = failed`
- `protection_status = unprotected_failed`
- `latest_protection_error` explaining why protection failed

## 6. How cron monitor is verified

The migration repairs/registers `hashibot_binance_testnet_monitor_1m` on this schedule:

```cron
*/1 * * * *
```

The cron calls the `binance-testnet-monitor` Edge Function using `scanner_config.cron_pg_token` as its bearer token.

The admin UI displays monitor proof fields from `execution_settings`:

- `latest_monitor_run_at`
- `latest_monitor_status`
- `latest_monitor_result`
- latest Binance account fetch time
- open Binance positions
- open Binance orders
- stale rows cleaned
- last managed TP/SL action

## 7. Manual test steps after deploy

1. Deploy migrations and Edge Functions.
2. Confirm live trading env remains disabled:
   - `LIVE_TRADING_ENABLED=false`
   - `EXECUTION_MODE=testnet`
   - `EXCHANGE=binance_usdm_testnet`
   - `TESTNET_ENABLED=true`
   - `BINANCE_TESTNET_BASE_URL=https://demo-fapi.binance.com`
3. Open Admin → Binance USD-M Testnet Execution.
4. Select a recent crypto signal.
5. Click **Clean Stale Rows Now** for the symbol.
6. Click **Dry-run Selected Signal** and verify sizing/levels.
7. Click **Execute Selected Signal** or **Run E2E Test Flow**.
8. Click **Fetch Open Positions** and verify Binance truth.
9. Click **Sync** on the execution row.
10. Confirm the result fields:
    - entry order status
    - position status
    - SL order/protection status
    - TP1 status
    - TP2 status
    - bracket mode
    - protection status

## 8. SQL migration/function deploy required

Deploy this migration:

- `supabase/migrations/20260607133000_044_binance_truth_first_end_to_end.sql`

It adds/repairs:

- `execution_settings.last_managed_exit_action`
- execution status/protection/bracket check constraints
- `mark_stale_testnet_execution_orders(...)`
- one-minute Binance monitor cron `hashibot_binance_testnet_monitor_1m`
- scanner-config cron proof fields

Deploy these Edge Functions after migration:

- `binance-testnet-execution`
- `binance-testnet-monitor`
- `admin-scheduler-action`

## 9. Confirmation live trading remains impossible

Live trading remains blocked in all layers:

- Execution asserts `LIVE_TRADING_ENABLED` is false.
- Execution requires `EXECUTION_MODE=testnet`.
- Execution requires `EXCHANGE=binance_usdm_testnet`.
- Execution requires the Binance Demo base URL (`https://demo-fapi.binance.com`).
- Settings updates force `live_trading_enabled = false`.
- The migration re-updates any non-false DB setting back to false.
- No live exchange base URL is introduced.
