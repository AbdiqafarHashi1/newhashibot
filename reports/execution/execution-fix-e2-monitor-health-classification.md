# Execution Fix E2 — Monitor Health Classification + Partial Error Repair

Date: 2026-06-10

## 1. Why the UI showed monitor error while Supabase returned HTTP 200

The monitor function could complete its invocation and return HTTP 200, but `execution_settings.latest_monitor_status` was still being driven by coarse error strings. Before this repair:

- Row-level exceptions were collected in `stats.row_errors`.
- The last row exception was copied into `stats.latest_monitor_error` and `stats.latest_sync_error`.
- After account refresh, the function overwrote `latest_monitor_status` with `completed_with_row_errors` when any row error existed.
- If account refresh threw, the function wrote `completed_with_sync_error` and populated monitor/sync error fields even though the HTTP response stayed 200.
- The Performance Bot Health UI displayed the persisted monitor status and mixed HTTP/server failures with row/sync errors in one “Monitor errors” card.

That meant a recoverable stale-order lookup could make Bot Health look unhealthy even when the monitor invocation, account fetch, stale cleanup, and protection SLA were otherwise succeeding.

## 2. Binance API call that failed

The observed failure was a Binance order-history/order-lookup failure:

```text
Binance GET /fapi/v1/allOrders failed (400)
code: -2013
msg: Order does not exist
```

In the current monitor code path, equivalent old-order lookups are performed for stored entry/algo order IDs through Binance order endpoints. E2 treats Binance `-2013` / `Order does not exist` from historical or stale order lookup as stale/missing order evidence rather than a global monitor outage.

## 3. Critical or warning?

This is a warning when all of the following remain true:

- The monitor authenticated and started normally.
- Account/position fetch did not fail completely.
- The affected lookup is for a stale, old, cancelled, or missing historical order.
- Binance truth shows no unsafe unprotected position requiring emergency handling.
- The row can still be safely stale-closed, closed-synced, protected, or processed by the existing recovery logic.

It remains critical if the failure prevents verification or recovery of an open position, if a safety close fails, if account/position fetch fails completely, if DB access fails, or if the monitor crashes before row processing.

## 4. New monitor status classification

The monitor now writes these levels to `execution_settings.latest_monitor_status`:

- `healthy`
  - Full monitor pass with no warnings, no row errors, no unsafe positions, and account sync success.
- `completed_with_warnings`
  - Monitor completed and safety is intact, but recoverable warnings exist, such as stale order lookup `-2013`.
- `partial_sync_warning`
  - Core account/position sync succeeded but a non-critical optional sync component, such as open algo-order sync, warned and continued.
- `row_errors_only`
  - One or more row-level recoverable processing errors occurred, but no monitor-wide critical failure was detected.
- `degraded`
  - Monitor had to perform a safety/protective action such as safety-closing an unprotected position. This is not hidden as healthy.
- `critical_error`
  - Authentication/DB/startup crash, complete account/position fetch failure, unprotected open position that could not be made safe, safety close failure, or another monitor-wide safety failure.

The persisted `latest_monitor_result` now includes:

- `monitor_status`
- `warnings_count`
- `row_errors_count`
- `critical_errors_count`
- `unsafe_positions_count`
- `http_status`
- `warnings[]`
- `row_errors[]`
- `critical_errors[]`

## 5. How Binance -2013 order-not-found is handled

For Binance `code=-2013` / `Order does not exist` during stale order lookup:

1. The monitor records a row warning.
2. The monitor does not mark the whole run as `critical_error`.
3. Row processing continues.
4. If Binance truth has no position and no open orders, the row can still be marked stale/closed by the existing stale cleanup path.
5. If a position exists, protection verification/recovery remains strict and must still succeed or safety-close.

## 6. Protection safety remains strict

E2 does not weaken protection safety:

- Unprotected open positions still trigger recovery.
- Native protection failure still falls back to managed protection where possible.
- If protection recovery cannot be established, the monitor still attempts a reduce-only safety close.
- If that safety close fails, the run is classified as `critical_error` and `unsafe_positions_count` is incremented.
- Account/position fetch failure remains `critical_error` because Binance truth cannot be trusted.
- Monitor startup crashes still return HTTP 500 and persist `critical_error` when possible.

## 7. Files changed

- `supabase/functions/binance-testnet-monitor/index.ts`
  - Added monitor severity levels, warning tracking, critical error tracking, and `latest_monitor_result` counters.
  - Downgraded Binance `-2013` stale order lookup failures to row warnings.
  - Preserved strict critical handling for account/position sync failure and safety-close failure.
  - Persisted classified monitor health statuses instead of generic row/sync error statuses.
- `src/pages/admin/Performance.tsx`
  - Split Bot Health into separate HTTP status, monitor critical status, warnings count, row errors count, unsafe positions, and protection SLA cards.
- `reports/execution/execution-fix-e2-monitor-health-classification.md`
  - Added this audit and validation report.

## Confirmation of untouched areas

No strategies, scanner logic, arbitrator behavior, signal generation, Binance entry placement, TP/SL engine, Telegram formatting/delivery, customer/public pages, or live-trading controls were changed.
