# Testnet Governor Mode and Expiry Management

## Summary

Implemented Binance USD-M Testnet stress-test controls without changing strategies, scanner, arbitrator, or live-trading guards.

## Governor modes

- `normal`: governor evaluates PnL/risk/streaks and may block new testnet execution.
- `readonly`: governor evaluates and displays PnL/risk/streaks, but does not block Binance Testnet entries.
- `off_for_testing`: governor blocking is bypassed for Binance Testnet entries only; Admin Execution displays a clear `TESTNET GOVERNOR OFF` warning.

Live trading remains blocked by environment and database guards.

## Expiry / time-stop clarity

Binance Futures positions do not expire automatically. GTC TP/SL conditional orders can remain open until triggered or cancelled. HashiBot owns time-stop enforcement through the monitor cron.

Each testnet execution now stores:

- `opened_at`
- `expires_at`
- `max_hold_minutes`
- `expiry_reason`
- `last_monitor_checked_at`

Configured max-hold rules:

| Strategy | Timeframe | Max hold |
| --- | --- | --- |
| MicroScalper | 5m | 120 minutes |
| MicroScalper | 15m | 360 minutes |
| CompressionBreakout | 15m | 720 minutes |
| CompressionBreakout | 1h | 48 hours |
| SwingContinuation | 15m | 1440 minutes |
| SwingContinuation | 1h | 96 hours |

## Monitor behavior

For each open testnet execution, monitor cron refreshes Binance truth and updates `last_monitor_checked_at`. If `now >= expires_at`, the monitor cancels remaining TP/SL algo orders, closes remaining Binance position with a reduce-only market order when exposure remains, marks the execution `closed_timeout`, emits execution events, and sends Telegram/admin updates through the existing execution event path.

## Acceptance status

- Governor `off_for_testing` allows Binance Testnet execution while live trading remains impossible.
- Scanner/arbitrator/strategies were not changed.
- Telegram execution/admin updates still use the existing event-delivery path.
- Monitor protection for existing native and managed positions remains active.
- Expired testnet executions are closed automatically by monitor cron.
