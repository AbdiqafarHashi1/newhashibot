# HASHIBOT B6.7 — Monitor 500 Fix + Clean Stress Acceptance

## Scope confirmation

B6.7 is execution-engine hardening only. This change does **not** change strategies, scanner logic, arbitrator behavior, signal generation, public pages, customer pages, performance-history reset, live trading, Telegram signal formatting, or market selection logic.

## 1. Exact monitor 500 root cause

The attached Supabase invocation screenshot shows repeated `500` responses for `binance-testnet-monitor` on June 9, 2026. The repo does not contain Supabase dashboard credentials or invocation log payload access, so the exact selected invocation body cannot be fetched from this workspace. The code-level crash path that made those invocations return `500` was exact and reproducible from the deployed monitor structure:

- The monitor loop awaited `monitorRow(...)` directly for each active execution row.
- Any uncaught row-level exception escaped the loop.
- The top-level `catch` then returned HTTP `500` for the entire invocation.

The concrete failure path was a malformed/stale Binance execution row where Binance truth/order cleanup could throw inside row processing, e.g. stale entry/order IDs or stale algo IDs after manual Binance cleanup. Before B6.7, that single row error stopped the whole monitor, which explains repeated once-per-minute `500` invocations.

## 2. Exact row/error that caused crash

The visible admin screenshots show legacy/stale rows after manual cleanup, including rows still displaying pending protection/order state while Binance had no matching position, plus stale Binance order references such as an older pending entry ID. The exact row UUID and stack trace are not visible in the screenshots and cannot be queried from this local repo because no Supabase dashboard/API credentials are present here.

The failure class is now captured in-code as row-isolated telemetry:

- `execution_orders.latest_monitor_error`
- `execution_orders.latest_sync_error`
- `execution_orders.latest_protection_error`
- `execution_orders.last_monitor_action = row_error_continue`
- `execution_settings.latest_monitor_error`
- `execution_settings.latest_sync_error`
- `latest_monitor_result.row_errors[]` with row id, symbol, status, error, stack, and action

After deployment, the next bad row will expose the exact row id, exact exception, and stack in DB/admin state without returning a monitor-wide `500`.

## 3. How row isolation works now

B6.7 wraps every row in its own `try/catch`:

1. Process one execution row.
2. If it succeeds, continue normally.
3. If it throws, save row-level monitor/sync/protection error fields.
4. Append a structured `row_errors[]` entry to the monitor summary.
5. Continue processing the remaining rows.

The monitor returns HTTP `200` when it completes with row errors or Binance sync errors. It only returns `500` for monitor-wide infrastructure failures such as missing required environment configuration or database/auth failures before row processing can run.

Returned summary now includes:

- `checked`
- `updated`
- `protected`
- `managed`
- `stale_closed`
- `closed_synced`
- `safety_closed`
- `row_errors`

## 4. How stale cleanup works

When HashiBot has an active execution row but Binance truth says there is no position and no open orders, the monitor now marks the row closed from exchange truth:

- `closed_synced` for rows that previously represented an entered/protected/partially managed position.
- `stale_closed` for pre-fill/stale rows.

It also clears exposed-state flags:

- `remaining_quantity = 0`
- `protection_status = unprotected`
- `native_protection_verified = false`
- `managed_fallback_active = false`
- `last_monitor_action = closed_synced` or `stale_closed`

This prevents rows from showing pending TP/SL/protection for a position that no longer exists.

## 5. How orphan TP/SL cleanup works

If Binance position size is zero but Binance still reports open regular/algo/conditional orders for that symbol, B6.7 cancels those open orders automatically. This covers:

- SL algo orders
- TP1 algo orders
- TP2 algo orders
- reduce-only conditional orders
- open regular orders for the symbol

After cancellation, the monitor marks the execution `closed_synced` or `stale_closed`, sets `remaining_quantity = 0`, clears native/managed flags, and records `last_monitor_action = orphan_protection_orders_cancelled`.

Acceptance target after manual Binance “Close All Positions”:

- Binance Positions = `0`
- Binance Open Orders = `0`
- HashiBot row = `closed_synced` or `stale_closed`
- No row remains `protected_native` / `protected_managed` with `position_size = 0`

## 6. How the 60-second protection SLA is enforced

The monitor does not wait 60 seconds to act. Once a Binance position exists, an unprotected or pending-protection row is immediately driven to one of:

1. `protected_native` with verified SL/TP algo IDs.
2. `protected_managed` with intended SL/TP levels saved and `managed_fallback_active = true`.
3. `closed_unprotected_safety` after reduce-only safety close if protection cannot be established.

The admin execution page now displays seconds since entry fill and a protection SLA state (`pass`, `pending`, `fail`, or `n/a`) so any row older than 60 seconds without native/managed protection is visible immediately.

## 7. Manual stress-test procedure

Use this sequence after deployment:

1. Confirm `EXECUTION_MODE=testnet`, `TESTNET_ENABLED=true`, and live trading disabled.
2. Run the monitor and confirm HTTP `200` even if `row_errors[]` is non-empty.
3. Manually close all Binance Testnet positions.
4. Run the monitor again.
5. Confirm Binance positions are zero and Binance open orders are zero.
6. Confirm HashiBot rows are `closed_synced` or `stale_closed` with `remaining_quantity = 0`.
7. Submit/allow a fresh testnet signal.
8. Confirm within 60 seconds it becomes `protected_native`, `protected_managed`, or `closed_unprotected_safety`.
9. Hit TP1/TP2/SL/time-stop paths and verify remaining quantity and close states update.
10. Manually cancel native protection orders and verify monitor recovers with managed fallback or safety close.

## 8. Confirmation prohibited areas unchanged

No files under strategy/scanner/arbitrator/public/customer/live-trading/signal-formatting/market-selection logic were intentionally changed. B6.7 edits are limited to:

- Binance Testnet monitor edge function
- local monitor proof helper/tests
- execution/admin visibility fields
- DB migration for monitor error visibility
- execution report

## 9. Evidence expected for fresh trades

B6.7 ensures fresh trades cannot remain exposed indefinitely:

- Native success evidence: `status=protected_native`, `protection_status=protected_native`, `native_protection_verified=true`, and SL/TP1/TP2 algo IDs saved.
- Managed fallback evidence: `status=protected_managed`, `protection_status=protected_managed`, intended SL/TP1/TP2 saved, and `managed_fallback_active=true`.
- Safety close evidence: `status=closed_unprotected_safety`, `remaining_quantity=0`, `latest_protection_error` populated, and reduce-only safety close attempted.

The monitor summary and admin table now expose any exceptions through `row_errors`, `latest_monitor_error`, `latest_sync_error`, `last_monitor_action`, seconds since fill, and protection SLA state.
