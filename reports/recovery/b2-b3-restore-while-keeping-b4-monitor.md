# HASHIBOT Recovery Patch — Restore B2/B3 while keeping B4 monitor

Date: 2026-06-07 UTC

## Summary

This patch restores the deleted B2/B3 Binance USD-M testnet execution work from `d2e67e1` and keeps the B4/B4.1 truth-first monitor and cleanup work already present on current main.

The patch does **not** full-revert PR #54. The B4 monitor function, B4 monitor library, B4 truth-first cleanup library, B4 reports, and admin stale-cleanup action remain in place.

## Files restored from `d2e67e1`

### Supabase Edge Function

- `supabase/functions/binance-testnet-execution/index.ts`
  - Restores B2/B3 testnet-only Binance USD-M execution actions:
    - `status`
    - `test_connection`
    - `validate_symbol`
    - `dry_run`
    - `execute_signal`
    - `positions`
    - `cancel_orders`
    - `sync_execution`
    - `update_settings`
    - `refresh_account_state`
    - `evaluate_governor`
  - Added compatibility writes so B2/B3 order IDs are also copied into B4 `binance_*_order_id` columns and execution logs write both `execution_id` and `execution_order_id`.

### Reports

- `reports/execution/binance-usdm-testnet-connector.md`
- `reports/execution/binance-testnet-auto-execution-capital-risk-bracket-orders.md`
- `reports/execution/binance-testnet-risk-governor-pnl-brain.md`
- `reports/execution/binance-testnet-bracket-protection-risk-cap.md`
- `reports/backtests/end-to-end-strategy-scanner-parity-repair.md`
- `reports/backtests/microscalper-scanner-parity-verification.md`

### Migrations restored for reproducible history

- `supabase/migrations/20260605093000_038_end_to_end_strategy_scanner_parity_repair.sql`
- `supabase/migrations/20260605103000_039_microscalper_scanner_parity.sql`
- `supabase/migrations/20260605123000_040_binance_usdm_testnet_execution.sql`
- `supabase/migrations/20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql`
- `supabase/migrations/20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql`
- `supabase/migrations/20260606004500_040_microscalper_live_config_routing_guard.sql`
- `supabase/migrations/20260606100000_043_binance_testnet_bracket_be_risk_cap.sql`

### Scanner parity / auto-execution handoff

- `supabase/functions/market-scanner/index.ts`
  - Restored from `d2e67e1` to recover the exact scanner parity and optional Binance testnet execution handoff behavior that was deleted.
  - No strategy tuning was performed.
  - No arbitrator logic was intentionally changed beyond restoring the exact previous file state from `d2e67e1`.

## Files merged

### `src/pages/admin/Execution.tsx`

Merged the restored B2/B3 Binance USD-M Testnet Execution UI with the existing B4/B4.1 monitor panel.

Final page now includes both:

- **Binance USD-M Testnet Execution controls**:
  - status cards
  - Risk Governor / PnL Brain
  - Refresh Binance Account State
  - Re-evaluate Governor
  - Testnet Guards
  - Capital Basis
  - Risk / Leverage
  - Manual Test Actions
  - Latest Testnet Executions
  - Failed/Skipped execution lists
- **Binance Testnet Monitor / cleanup controls**:
  - latest monitor status
  - last monitor run
  - open positions/orders snapshot
  - unrealized PnL / wallet snapshot
  - stale rows cleaned
  - clean stale testnet executions button calling `admin-scheduler-action`

### `src/lib/types.ts`

Merged B2/B3 execution types back into the current type surface:

- Restored `BinanceExecutionOrder`.
- Restored `ExecutionSettings`.
- Restored `ExecutionEventLog`.
- Kept existing paper/MT5 `ExecutionOrder` fields.
- Added B4/B4.1 monitor and truth-first fields:
  - `binance_entry_order_id`
  - `binance_sl_order_id`
  - `binance_tp1_order_id`
  - `binance_tp2_order_id`
  - `stale_checked_at`
  - `stale_cleanup_reason`
  - monitor/account snapshot fields on `ExecutionSettings`
  - both `execution_id` and `execution_order_id` on `ExecutionEventLog`

### `supabase/migrations/20260607123000_039_binance_monitor_cron_and_constraints.sql`

Kept the B4.1 migration but made it safe when B2/B3 migrations create `execution_settings` or `execution_event_logs` first:

- Adds B4 monitor fields to `execution_settings` with `ADD COLUMN IF NOT EXISTS`.
- Adds B4 event-log fields to `execution_event_logs` with `ADD COLUMN IF NOT EXISTS` before creating B4 monitor indexes.
- Keeps the B4 Binance monitor cron and cleanup constraints intact.

### `supabase/functions/binance-testnet-execution/index.ts`

Kept the restored B2/B3 function behavior and added schema compatibility writes only:

- Event logs now write both `execution_id` and `execution_order_id`.
- Entry order submission writes both `entry_order_id` and `binance_entry_order_id`.
- Bracket orders write both legacy B2/B3 IDs and B4 `binance_*` IDs.
- Breakeven SL updates write both `sl_order_id` and `binance_sl_order_id`.
- Planned order rows persist intended SL/TP and split quantities so the B4 monitor has the state it expects.

## Migration added

Added one new repair migration:

- `supabase/migrations/20260607124500_040_recover_b2_b3_execution_schema_keep_b4_monitor.sql`

## Exact schema compatibility fixes in the repair migration

### `execution_orders`

The repair migration adds missing B2/B3 columns with `ADD COLUMN IF NOT EXISTS`, including:

- exchange/environment/side/leverage/quantity
- legacy Binance order IDs (`entry_order_id`, `sl_order_id`, `tp1_order_id`, `tp2_order_id`)
- exchange response and testnet error fields
- capital/risk/notional/leverage-source fields
- governor fields
- bracket/protection fields
- break-even and TP1 state fields

It also keeps/adds B4/B4.1 columns, including:

- `binance_entry_order_id`
- `binance_sl_order_id`
- `binance_tp1_order_id`
- `binance_tp2_order_id`
- intended SL/TP and quantities
- stale cleanup fields
- monitor/account sync snapshot fields

It backfills B4 `binance_*_order_id` fields from legacy B2/B3 order-id fields where possible.

### `execution_settings`

The repair migration restores B2/B3 settings columns and keeps B4 monitor fields, including:

- B2/B3 controls:
  - `auto_execute_testnet`
  - `max_open_testnet_positions`
  - `max_total_open_risk_pct`
  - `one_active_execution_per_symbol`
  - `capital_basis`
  - risk/leverage settings
  - governor/PnL brain settings
  - account snapshot fields
- B4/B4.1 monitor fields:
  - `latest_monitor_run_at`
  - `latest_monitor_status`
  - `latest_monitor_result`
  - `open_binance_positions`
  - `open_binance_orders`
  - `pnl_snapshot`
  - `stale_rows_cleaned`
  - `latest_sync_time`

### `execution_event_logs`

The repair migration supports both schemas during transition:

- Adds `execution_id` if missing.
- Adds `execution_order_id` if missing.
- Backfills `execution_order_id = execution_id` where needed.
- Backfills `execution_id = execution_order_id` where needed.
- Creates indexes for both columns.
- Adds compatible foreign keys with `NOT VALID` to avoid destructive data changes.

### Constraints and safety

The repair migration safely repairs CHECK constraints by replacing status/protection/bracket checks with versions that allow both B2/B3 and B4/B4.1 states:

- `closed_breakeven`
- `stale_closed`
- `protected_managed`
- `pending_managed_protection`
- legacy bridge states such as `sent_to_bridge`, `accepted`, `rejected`, and `filled`

It also preserves live trading safety:

- `live_trading_enabled` is forced to `false` if manual SQL had changed it.
- A false-only CHECK constraint is added.
- Admin update policy requires `live_trading_enabled = false`.
- No live trading endpoint or live Binance environment was enabled.

## Confirmations

- B4/B4.1 monitor kept: **yes**.
  - `supabase/functions/binance-testnet-monitor/index.ts` remains.
  - `src/lib/binanceTestnetMonitor.ts` remains.
  - `src/lib/binanceTruthExecution.ts` remains.
  - B4 monitor reports/migrations remain.
- B4 admin stale cleanup kept: **yes**.
  - `supabase/functions/admin-scheduler-action/index.ts` remains with `clean_stale_testnet_executions`.
  - `src/pages/admin/Execution.tsx` now exposes the clean-stale button together with B2/B3 controls.
- B2/B3 Binance execution restored: **yes**.
  - `supabase/functions/binance-testnet-execution/index.ts` is restored.
  - B2/B3 Execution UI controls are restored.
  - B2/B3 migrations and reports are restored.
- Scanner parity / auto-execution handoff restored from `d2e67e1`: **yes**.
- Strategy logic tuned: **no**.
- Arbitrator logic intentionally changed/tuned: **no**.
- Live trading enabled: **no**.
- Tables/data dropped: **no**.

## Validation commands

- `npm run test:execution`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
