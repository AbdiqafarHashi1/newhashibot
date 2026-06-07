# Binance Testnet Monitor Cron and Constraints — B4.1

## 1. Exact constraints changed

`execution_orders` now has repaired B4.1 CHECK constraints:

- `execution_orders_status_b4_1_check` allows `pending`, `entry_submitted`, `entry_filled`, `protected`, `pending_protection`, `partially_closed`, `closed_tp`, `closed_sl`, `cancelled`, `failed`, `skipped`, `stale_closed`, `sent_to_bridge`, `accepted`, `rejected`, `filled`, `protected_managed`, and `pending_managed_protection`.
- `execution_orders_protection_status_b4_1_check` allows `unprotected`, `protected`, `protected_managed`, `pending_protection`, `pending_managed_protection`, and `unprotected_failed`.
- `execution_orders_bracket_mode_b4_1_check` allows empty string, `exchange_native`, `managed_exit_fallback`, and `failed`.

The migration drops prior conflicting `execution_orders` CHECK constraints that mention `status`, `protection_status`, or `bracket_mode` before recreating the B4.1 checks.

## 2. Why B4 needed constraint correction

B4 introduced new execution statuses and protection modes. Without repaired database CHECK constraints, runtime updates such as `protected_managed`, `pending_managed_protection`, `stale_closed`, `closed_tp`, and `closed_sl` could be rejected by Postgres even though the TypeScript logic considered them valid.

## 3. Monitor function created/updated

Created Supabase Edge Function:

- `supabase/functions/binance-testnet-monitor/index.ts`

It runs as a Binance USD-M Futures Testnet supervisor: syncs positions/orders/mark price, detects entry and bracket fills, manages fallback TP/SL reduce-only exits, cancels leftover orders, writes event logs, sends Telegram updates, refreshes execution/account state, and cleans stale DB rows when Binance truth says nothing is open.

## 4. pg_cron job name and schedule

Added pg_cron job:

- Name: `hashibot_binance_testnet_monitor_1m`
- Schedule: `*/1 * * * *` (every 1 minute)
- Target: `/functions/v1/binance-testnet-monitor`
- Auth: dynamic `Authorization: Bearer <scanner_config.cron_pg_token>`

## 5. Exact monitor gates

The monitor only runs when all gates pass:

- `EXECUTION_MODE=testnet`
- `TESTNET_ENABLED=true`
- `LIVE_TRADING_ENABLED=false`
- `execution_settings.execution_mode='testnet'`
- `execution_settings.testnet_enabled=true`
- `execution_settings.kill_switch_enabled=false`
- `execution_settings.live_trading_enabled=false`

If live trading is enabled by environment or DB setting, the monitor aborts immediately.

## 6. How entry fills are detected

For active rows with `binance_entry_order_id`, the monitor calls Binance `/fapi/v1/order` and checks the entry order status:

- `FILLED`: update execution to `entry_filled` or `protected` depending on protection state, save average fill price when Binance returns one, log `entry_filled`, and send Telegram.
- `CANCELED` or `EXPIRED`: update execution to `cancelled`, log, and send Telegram.
- `REJECTED`: update execution to `failed`, log, and send Telegram.

## 7. How native TP1/TP2/SL are detected

For `bracket_mode='exchange_native'`, the monitor fetches SL, TP1, and TP2 order statuses:

- TP1 `FILLED`: status becomes `partially_closed`, `tp1_closed_at` is set, `sl_moved_to_be=true`, event log and Telegram update are emitted.
- TP2 `FILLED`: status becomes `closed_tp`, `tp2_closed_at` is set, leftover SL is cancelled when present, event log and Telegram update are emitted.
- SL `FILLED`: status becomes `closed_sl`, `sl_closed_at` is set, leftover TP orders are cancelled when present, event log and Telegram update are emitted.

## 8. How managed fallback TP1/TP2/SL works

For `bracket_mode='managed_exit_fallback'` or `protection_status='protected_managed'`, the monitor compares Binance mark price with intended TP/SL fields:

- Long/BUY: TP1 when mark >= TP1, TP2 when mark >= TP2, SL when mark <= active SL.
- Short/SELL: TP1 when mark <= TP1, TP2 when mark <= TP2, SL when mark >= active SL.

The monitor only sends reduce-only `MARKET` orders to close current exposure. It never averages down, never increases position size, and never opens a new trade.

## 9. How SL moves to BE after TP1

After managed TP1, the monitor closes 50% reduce-only, sets `tp1_closed_at`, reduces `remaining_quantity`, and sets `sl_moved_to_be=true`. Future SL checks use `entry_price` as the active break-even stop for the remaining quantity.

## 10. How stale DB rows are cleaned

For active execution rows, the monitor fetches Binance position risk and open orders for the symbol. If Binance reports:

- `positionAmt = 0`
- zero open orders

then the monitor updates the row to `stale_closed`, sets `stale_cleanup_reason='binance_truth_no_position_no_orders'`, sets `stale_checked_at`, writes an event log, sends Telegram, and stops the row from blocking future signals.

## 11. Admin UI changes

Admin → Execution now shows a Binance Testnet Monitor card with:

- monitor status
- last monitor run time
- latest sync result
- open Binance positions count
- open Binance orders count
- unrealized PnL snapshot
- wallet balance snapshot
- stale rows cleaned

## 12. Telegram update examples

All monitor Telegram messages start with `BINANCE TESTNET — NOT LIVE`.

Examples:

- `BINANCE TESTNET — NOT LIVE\nBTCUSDT entry filled at 100.5.`
- `BINANCE TESTNET — NOT LIVE\nBTCUSDT TP1 filled; SL moved/confirmed at break-even.`
- `BINANCE TESTNET — NOT LIVE\nBTCUSDT managed TP2 hit; closed remaining reduce-only.`
- `BINANCE TESTNET — NOT LIVE\nBTCUSDT stale execution cleaned: Binance has no position and no open orders.`

## 13. Files changed

- `package.json`
- `src/lib/binanceTruthExecution.ts`
- `src/lib/binanceTestnetMonitor.ts`
- `src/lib/types.ts`
- `src/pages/admin/Execution.tsx`
- `supabase/functions/admin-scheduler-action/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/migrations/20260607120000_038_binance_truth_first_execution_cleanup.sql`
- `supabase/migrations/20260607123000_039_binance_monitor_cron_and_constraints.sql`
- `tests/execution/binanceTruthExecution.test.ts`
- `tests/execution/binanceTestnetMonitor.test.ts`
- `tests/execution/sqlConstraints.test.ts`
- `reports/execution/binance-testnet-monitor-cron-and-constraints.md`

## 14. SQL migration added

Added:

- `supabase/migrations/20260607123000_039_binance_monitor_cron_and_constraints.sql`

The migration repairs constraints, adds `execution_settings`, adds `execution_event_logs`, adds account/position sync columns, and registers the 1-minute pg_cron monitor job.

## 15. Manual test steps

1. Apply migrations 038 and 039.
2. Set Edge Function secrets for Binance USD-M Futures Testnet API key/secret.
3. Confirm `EXECUTION_MODE=testnet`, `TESTNET_ENABLED=true`, and `LIVE_TRADING_ENABLED=false`.
4. Set `execution_settings.testnet_enabled=true` and `kill_switch_enabled=false` for testnet supervision.
5. Create or use a testnet execution row with `binance_entry_order_id`.
6. Let `hashibot_binance_testnet_monitor_1m` run or invoke `binance-testnet-monitor` manually with the cron token/service role.
7. Confirm entry fills update the row and create `execution_event_logs`.
8. Confirm native TP1/TP2/SL order fills update status and cancel leftovers.
9. Confirm managed fallback closes reduce-only and moves SL to BE after TP1.
10. Confirm stale DB rows become `stale_closed` only when Binance has no position and no open orders.
11. Confirm Telegram messages start with `BINANCE TESTNET — NOT LIVE`.

## 16. Auto monitor test steps

Run:

```bash
npm run test:execution
npm run typecheck
npm run lint
npm run build
git diff --check
```

Automated tests cover SQL constraints, live-trading abort, testnet-disabled skip, entry fill detection, native TP1/TP2/SL detection, managed TP1/TP2/SL behavior, break-even SL after TP1, stale cleanup, active Binance exposure preventing cleanup, and Telegram-event emission only on state changes.

## 17. Confirmation scanner/arbitrator untouched

Scanner strategies, scanner tuning, and arbitrator logic were not changed. This work is limited to execution-state constraints, testnet monitoring/sync, admin visibility, event logs, Telegram execution updates, and tests.

## 18. Confirmation live trading remains impossible

The database constrains `execution_settings.live_trading_enabled` to `false`, the monitor aborts if any live-trading flag is true, and managed exits use reduce-only close orders only. No code path in this change opens live trades or enables live trading.
