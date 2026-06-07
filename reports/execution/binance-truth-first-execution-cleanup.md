# Binance Truth-First Execution Cleanup — Phase B4

## 1. Why old rows blocked execution

Execution blocking was DB-stale-driven: old `execution_orders` rows with active-looking statuses could make the app treat a symbol or signal as already executing even when Binance testnet had no open position and no open order. Skipped rows from auto-execution being disabled and failed rows could also consume a signal permanently when an admin wanted to retry manually.

## 2. Exact statuses that block now

Only truly active execution states block duplicate signal/manual retry checks:

- `pending`
- `entry_submitted`
- `entry_filled`
- `protected`
- `pending_protection`
- `partially_closed`

For same-symbol blocking, even these DB statuses are not enough by themselves. HashiBot must check Binance first and only block if Binance confirms a nonzero position or open orders for that symbol.

## 3. Exact statuses that allow retry

Manual retry is allowed when the existing row status is terminal, retryable, or stale:

- `skipped`
- `failed`
- `cancelled`
- `stale_closed`
- `closed_tp`
- `closed_sl`

Rows with `status = skipped` and `latest_auto_skip_reason = skipped_auto_disabled` explicitly do not permanently consume a signal.

## 4. How Binance position/order truth is checked

The cleanup action reads active-looking `execution_orders` rows, groups by symbol, then calls Binance USDT-M Futures testnet signed endpoints for each symbol:

- `/fapi/v2/positionRisk?symbol=...` for current position amount.
- `/fapi/v1/openOrders?symbol=...` for open orders.

If Binance reports position size `0` and zero open orders, active-looking DB rows for that symbol are marked `stale_closed` with a stale cleanup reason. If Binance reports any position or any open order, those DB rows remain active and continue to block same-symbol execution.

## 5. TP/SL native vs managed fallback behavior

Protection is valid only in one of two modes:

### Exchange-native

HashiBot submits:

- Reduce-only SL order for the full position.
- Reduce-only TP1 order for 50% of quantity.
- Reduce-only TP2 order for the remaining 50%.

When all three native orders are accepted, the row can be stored with:

- `protection_status = protected`
- `bracket_mode = exchange_native`
- Binance SL/TP1/TP2 order IDs saved.

### Managed fallback

If Binance Demo rejects native stop/take-profit protection, HashiBot stores the intended SL/TP1/TP2 and enters managed protection:

- `protection_status = protected_managed`
- `bracket_mode = managed_exit_fallback`
- intended SL/TP1/TP2 and split quantities stored.

Managed monitoring checks mark price:

- TP1 hit: reduce-only market closes 50%, then SL is considered moved to break-even for the remainder.
- TP2 hit: reduce-only market closes remaining quantity.
- SL hit: reduce-only market closes all remaining quantity.

Protection must not be reported as successful unless one of these two modes is active.

## 6. Cleanup button behavior

The admin Execution page now includes **Clean stale testnet executions**. It invokes the admin edge action `clean_stale_testnet_executions`, checks Binance testnet truth per symbol, marks stale active-looking DB rows `stale_closed` only when Binance has no position/orders, and reports how many rows were cleaned.

If Binance testnet API keys are not configured, the action reports that cleanup was skipped rather than guessing from the DB.

## 7. Files changed

- `src/lib/binanceTruthExecution.ts`
- `src/lib/types.ts`
- `src/pages/admin/Execution.tsx`
- `supabase/functions/admin-scheduler-action/index.ts`
- `supabase/migrations/20260607120000_038_binance_truth_first_execution_cleanup.sql`
- `tests/execution/binanceTruthExecution.test.ts`
- `package.json`
- `reports/execution/binance-truth-first-execution-cleanup.md`

## 8. SQL migration added

Added migration:

- `supabase/migrations/20260607120000_038_binance_truth_first_execution_cleanup.sql`

It adds execution metadata columns for Binance order IDs, protection status, bracket mode, intended managed exits, stale cleanup tracking, indexes for signal/symbol status lookup, and the `mark_stale_testnet_execution_orders` RPC used by the admin cleanup action.

## 9. Manual test steps

1. Configure Binance futures testnet API keys in edge-function secrets.
2. Create or locate an `execution_orders` row with an active status such as `protected` for a symbol that has no Binance testnet position/orders.
3. Open Admin → Execution.
4. Click **Clean stale testnet executions**.
5. Confirm the result message reports cleaned rows.
6. Confirm the row status changed to `stale_closed` and no longer blocks manual retry.
7. Open a symbol that really has a Binance testnet position/order.
8. Run cleanup and confirm the row remains active.
9. Submit a protected entry path and confirm native protection creates SL/TP1/TP2 IDs or managed fallback stores intended levels.
10. Confirm no UI or edge action enables live trading.

## 10. Auto test steps

Run:

```bash
npm run test:execution
npm run typecheck
npm run lint
npm run build
git diff --check
```

The execution test covers skipped-auto-disabled retry, failed retry, stale DB active rows with empty Binance truth, real Binance exposure blocking, no-exposure same-symbol allowance, native TP/SL protection, managed fallback, TP1 50% close, TP1 SL-to-BE behavior, TP2 final close, and live-trading prohibition.

## 11. Confirmation scanner/arbitrator untouched

Scanner strategy logic, scanner tuning, and arbitrator logic were not changed. This phase is limited to execution-state truthing, stale cleanup, protection state modelling, tests, admin cleanup UI, and schema support.

## 12. Confirmation live trading impossible

The fresh-signal execution gate rejects any request where `liveTrading` is true with reason `live_trading_forbidden`. The admin page still disables test demo order sending and does not add live-trading controls.
