# HASHIBOT B6.6 — Entry Submitted + Protection Pending Fix

## Scope

This change is limited to the Binance Testnet execution lifecycle monitor and its execution monitor proof tests/migration coverage. It does **not** change strategies, scanner, arbitrator, reset flows, public pages, or live trading.

## Fixes

### Part A — `entry_submitted` cannot stay pending

The Binance Testnet monitor now handles `pending` / `entry_submitted` rows before generic stale cleanup:

- Fetches Binance position truth by symbol.
- Fetches the entry order using `binance_entry_order_id`, falling back to legacy `entry_order_id`.
- Treats a Binance position as proof of entry fill even if the entry order lookup is missing.
- Persists `entry_filled`, fill price, fill time, and remaining quantity, then submits protection immediately.
- If the entry is older than two minutes with no fill, cancels the entry order if it is still open and marks `entry_timeout_cancelled`.
- If the entry order is missing and no Binance position exists, marks `entry_missing_no_position`.

### Part B — protection pending timeout/recovery

For open Binance positions whose DB row is `entry_filled` or otherwise active but not `protected_native` / `protected_managed`, the monitor now:

1. Logs an unprotected recovery attempt.
2. Regenerates fresh short `clientAlgoId` values for native SL/TP attempts.
3. Falls back to `protected_managed` when native SL/TP submission fails but managed levels are usable.
4. Closes reduce-only market and marks `closed_unprotected_safety` if neither native nor managed protection can be established.

### Part C — expired rows

Expired active rows continue to be closed by timeout. The monitor cancels remaining native algo protection orders, closes any open Binance position reduce-only, marks `closed_timeout`, and emits a Telegram/admin event.

### Part D — legacy broken rows

Legacy rows with invalid/old algo IDs no longer block monitor recovery. Algo lookup failures are ignored for recovery purposes; pending/unprotected rows regenerate short native IDs or activate managed fallback, and expired rows close by timeout.

### Part E — schema/test coverage

A B6.6 migration adds the new lifecycle terminal/safety statuses:

- `entry_timeout_cancelled`
- `entry_missing_no_position`
- `closed_unprotected_safety`

Execution tests cover:

- Entry fill by Binance position truth.
- Entry timeout cancellation after two minutes.
- Missing entry order with no Binance position.
- Protection-pending recovery to managed fallback.
- SQL status constraint coverage for the new B6.6 states.

## Acceptance expectation after monitor run

After the monitor processes current rows:

- No `entry_submitted` row older than two minutes should remain pending.
- No `entry_filled` row with an open Binance position should remain protection-pending.
- Open Binance positions should resolve to one of:
  - `protected_native`
  - `protected_managed`
  - `closed_timeout`
  - `closed_unprotected_safety`
