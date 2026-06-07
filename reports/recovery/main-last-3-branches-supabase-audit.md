# HASHIBOT Recovery Audit — main vs last 3 merged branches + Supabase functions/migrations

Date: 2026-06-07 UTC

## Scope and method

Audited current `HEAD` (`5c6a1de`, branch `work`, equivalent to current main history in this checkout) against the last three first-parent merge commits:

1. PR #54 — `5c6a1de` — `codex/cleanup-binance-execution-and-fix-protections` — "Binance testnet monitor, truth-first execution cleanup, DB constraint repairs, admin UI and tests".
2. PR #53 — `d2e67e1` — `codex/check-microscalper-live-signal-generation` — "Fix MicroScalper timeframe config migration".
3. PR #52 — `bd857b3` — `codex/fix-binance-bracket-order-execution` — "Binance testnet: auto-execution, capital/risk sizing, bracket protection & governor (B2→B3)".

Also audited the non-merge commit between PR #53 and PR #54:

- `4547933` — "Updated package.json". This commit is the main source of disappeared B2/B3 UI, functions, migrations, reports, and strategy/scanner parity changes.

Commands used included:

- `git log --merges --first-parent --oneline -n 10`
- `git log --oneline --graph --decorate --all -n 80`
- `git diff --stat 56c2d8d..bd857b3`
- `git diff --stat bd857b3..d2e67e1`
- `git diff --stat d2e67e1..4547933`
- `git diff --stat 4547933..5c6a1de`
- `git diff --name-status d2e67e1..HEAD -- <audit-scope>`
- `git diff --unified=0 d2e67e1..HEAD -- <audit-scope>`
- `rg` checks for `execution_settings`, `execution_event_logs`, `execution_order_id`, `execution_id`, cron, Telegram, Binance, scanner, and strategy config references.

## Executive summary

Current main is not merely "PR #54 on top of PR #53/#52". Between PR #53 and PR #54, commit `4547933` replaced or reverted large parts of the repo to an older state. PR #54 then added B4/B4.1 monitor/truth-first files on top of that older state, but it did **not** restore the B2/B3 Binance execution connector, B2/B3 admin execution UI, B2/B3 migrations, or prior scanner/backtest parity changes.

Key audit findings:

- B2/B3 execution UI disappeared from `src/pages/admin/Execution.tsx`.
- `supabase/functions/binance-testnet-execution/index.ts` was deleted and no replacement implements the same actions.
- B2/B3 migrations `040`-`043` were deleted.
- B2/B3 reports were deleted.
- MicroScalper/strategy parity migrations `038`, `039`, and `040` from PR #50/#53 were deleted.
- `src/lib/types.ts` lost `BinanceExecutionOrder`, `ExecutionSettings`, and `ExecutionEventLog` interfaces from B2/B3.
- Current B4.1 migration creates `execution_event_logs.execution_order_id`, while the B2 connector wrote `execution_event_logs.execution_id`.
- Current B4.1 migration creates `execution_settings` with a narrower schema and omits many B2/B3 columns.
- Migration numbering is now conflicting/non-monotonic: the old `038`/`039`/`040` files were deleted, and current `038`/`039` are unrelated B4/B4.1 files.
- Current B4/B4.1 code assumes B2/B3 columns exist on `execution_orders`, but some B2/B3 columns are only added by deleted migrations.
- Current scanner no longer auto-calls Binance testnet execution and has reverted several strategy expiry/stat/parity changes.

## Files changed per reviewed branch/PR

### PR #52 — `bd857b3` / `codex/fix-binance-bracket-order-execution`

Changed files:

- `reports/execution/binance-testnet-auto-execution-capital-risk-bracket-orders.md` — added.
- `reports/execution/binance-testnet-bracket-protection-risk-cap.md` — added.
- `reports/execution/binance-testnet-risk-governor-pnl-brain.md` — added.
- `scripts/execution/binance-testnet-connector-selftest.mjs` — modified.
- `src/lib/types.ts` — modified.
- `src/pages/admin/Execution.tsx` — modified.
- `supabase/functions/binance-testnet-execution/index.ts` — modified/extended from PR #51.
- `supabase/migrations/20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql` — added.
- `supabase/migrations/20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql` — added.
- `supabase/migrations/20260606100000_043_binance_testnet_bracket_be_risk_cap.sql` — added.

Main effect:

- Extended B2 Binance USD-M testnet execution into B3 auto execution, account/capital/risk sizing, bracket protection, governor/PnL brain, risk caps, and admin controls.

### PR #53 — `d2e67e1` / `codex/check-microscalper-live-signal-generation`

Changed files relative to PR #52:

- `supabase/migrations/20260605103000_039_microscalper_scanner_parity.sql` — modified.
- `supabase/migrations/20260606004500_040_microscalper_live_config_routing_guard.sql` — added.

Main effect:

- Fixed MicroScalper scanner/timeframe config routing only. No B2/B3 execution files should have changed in this PR relative to PR #52.

### PR #54 — `5c6a1de` / `codex/cleanup-binance-execution-and-fix-protections`

Changed files relative to its immediate parent `4547933`:

- `package.json` — modified.
- `reports/execution/binance-testnet-monitor-cron-and-constraints.md` — added.
- `reports/execution/binance-truth-first-execution-cleanup.md` — added.
- `src/lib/binanceTestnetMonitor.ts` — added.
- `src/lib/binanceTruthExecution.ts` — added.
- `src/lib/types.ts` — modified.
- `src/pages/admin/Execution.tsx` — modified.
- `supabase/functions/admin-scheduler-action/index.ts` — modified.
- `supabase/functions/binance-testnet-monitor/index.ts` — added.
- `supabase/migrations/20260607120000_038_binance_truth_first_execution_cleanup.sql` — added.
- `supabase/migrations/20260607123000_039_binance_monitor_cron_and_constraints.sql` — added.
- `tests/execution/binanceTestnetMonitor.test.ts` — added.
- `tests/execution/binanceTruthExecution.test.ts` — added.
- `tests/execution/sqlConstraints.test.ts` — added.

Main effect:

- Added B4/B4.1 truth-first cleanup and Binance monitor tooling, but on top of the already reverted/deleted state introduced by `4547933`.

## Non-merge commit that overwrote prior work

### `4547933` — "Updated package.json"

This commit occurred after PR #53 and before PR #54. Its diff from PR #53 is large and destructive:

- 26 files changed.
- 283 insertions.
- 185,444 deletions.

Within audit scope, it deleted or reverted:

- `reports/execution/end-to-end-strategy-scanner-parity-repair.md`
- `reports/execution/microscalper-scanner-parity-verification.md`
- `reports/execution/binance-testnet-auto-execution-capital-risk-bracket-orders.md`
- `reports/execution/binance-testnet-bracket-protection-risk-cap.md`
- `reports/execution/binance-testnet-risk-governor-pnl-brain.md`
- `reports/execution/binance-usdm-testnet-connector.md`
- `scripts/execution/binance-testnet-connector-selftest.mjs`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/migrations/20260605093000_038_end_to_end_strategy_scanner_parity_repair.sql`
- `supabase/migrations/20260605103000_039_microscalper_scanner_parity.sql`
- `supabase/migrations/20260605123000_040_binance_usdm_testnet_execution.sql`
- `supabase/migrations/20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql`
- `supabase/migrations/20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql`
- `supabase/migrations/20260606004500_040_microscalper_live_config_routing_guard.sql`
- `supabase/migrations/20260606100000_043_binance_testnet_bracket_be_risk_cap.sql`

It also reverted/changed:

- `src/pages/admin/Execution.tsx` from B2/B3 Binance testnet UI back to an older MT5/paper bridge UI.
- `src/pages/admin/BacktestLab.tsx` strategy/backtest calibration defaults and evaluator behavior.
- `src/lib/types.ts` by removing B2/B3 execution types.
- `supabase/functions/market-scanner/index.ts` by removing scanner execution handoff and several strategy parity/stat/expiry changes.

## Current state vs PR #53/B3 state

Compared to `d2e67e1` (PR #53 merged state), current `HEAD` has the following audit-scope net changes:

- Deleted: `reports/execution/binance-testnet-auto-execution-capital-risk-bracket-orders.md`
- Deleted: `reports/execution/binance-testnet-bracket-protection-risk-cap.md`
- Added: `reports/execution/binance-testnet-monitor-cron-and-constraints.md`
- Deleted: `reports/execution/binance-testnet-risk-governor-pnl-brain.md`
- Added: `reports/execution/binance-truth-first-execution-cleanup.md`
- Deleted: `reports/execution/binance-usdm-testnet-connector.md`
- Added: `src/lib/binanceTestnetMonitor.ts`
- Added: `src/lib/binanceTruthExecution.ts`
- Modified: `src/lib/types.ts`
- Modified: `src/pages/admin/BacktestLab.tsx`
- Modified: `src/pages/admin/Execution.tsx`
- Modified: `supabase/functions/admin-scheduler-action/index.ts`
- Deleted: `supabase/functions/binance-testnet-execution/index.ts`
- Added: `supabase/functions/binance-testnet-monitor/index.ts`
- Modified: `supabase/functions/market-scanner/index.ts`
- Deleted: `supabase/migrations/20260605093000_038_end_to_end_strategy_scanner_parity_repair.sql`
- Deleted: `supabase/migrations/20260605103000_039_microscalper_scanner_parity.sql`
- Deleted: `supabase/migrations/20260605123000_040_binance_usdm_testnet_execution.sql`
- Deleted: `supabase/migrations/20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql`
- Deleted: `supabase/migrations/20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql`
- Deleted: `supabase/migrations/20260606004500_040_microscalper_live_config_routing_guard.sql`
- Deleted: `supabase/migrations/20260606100000_043_binance_testnet_bracket_be_risk_cap.sql`
- Added: `supabase/migrations/20260607120000_038_binance_truth_first_execution_cleanup.sql`
- Added: `supabase/migrations/20260607123000_039_binance_monitor_cron_and_constraints.sql`

## What disappeared

### Admin execution UI sections removed

The PR #52/#53 version of `src/pages/admin/Execution.tsx` was titled **"Binance USD-M Testnet Execution"** and contained:

- Binance USD-M testnet execution status cards.
- Risk Governor / PnL Brain panel.
- Refresh Binance Account State action.
- Re-evaluate Governor action.
- Testnet Guards panel.
- Capital Basis selector and live capital proof rows.
- Risk / Leverage settings/proof rows.
- Manual Test Actions:
  - Test Binance Connection.
  - Validate Symbol.
  - Dry-run Selected Signal.
  - Execute Selected Signal.
  - Fetch Open Positions.
  - Cancel Symbol Orders.
- Recent signal selector.
- Connection Status panel for Binance testnet API/env state.
- Latest Testnet Executions table with symbol, side, leverage, quantity, status, protection, orders, capital, sync.
- Per-row Sync action.
- Failed Executions mini-list.
- Skipped Executions mini-list.

Current `HEAD` is titled **"MT5 Execution Bridge"** and has an older paper/MT5 bridge orientation plus only a B4.1 Binance Testnet Monitor card. It does not expose the B2/B3 connector actions or B3 risk/governor/capital controls.

Conclusion: Previous UI sections did disappear. This is not caused by PR #54 alone; they were removed by `4547933`, and PR #54 only added the monitor panel to the older UI.

### Supabase Edge Function removed

`supabase/functions/binance-testnet-execution/index.ts` is absent in current `HEAD`. In PR #52/#53, it implemented actions including:

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

Current `supabase/functions/binance-testnet-monitor/index.ts` is a monitor/sync function, not a replacement for the execution connector. It does not implement dry-run/manual execution/settings/governor action routing.

Conclusion: A Supabase Edge Function was replaced/deleted rather than extended. The B4 monitor should have extended/coexisted with the B2/B3 execution function, not replaced it.

### Reports removed

The following B2/B3 execution reports are gone from current `HEAD`:

- `reports/execution/binance-usdm-testnet-connector.md`
- `reports/execution/binance-testnet-auto-execution-capital-risk-bracket-orders.md`
- `reports/execution/binance-testnet-risk-governor-pnl-brain.md`
- `reports/execution/binance-testnet-bracket-protection-risk-cap.md`

The following scanner/parity reports are also gone:

- `reports/execution/end-to-end-strategy-scanner-parity-repair.md`
- `reports/execution/microscalper-scanner-parity-verification.md`

Current B4 reports are additive and should remain, but they do not replace the deleted B2/B3 documentation.

## What was overwritten

### `src/pages/admin/Execution.tsx`

Overwritten from B2/B3 Binance execution UI to older MT5/paper bridge UI. PR #54 then added a Binance Testnet Monitor block to that older UI.

Risk:

- Admins cannot operate or inspect B2/B3 Binance testnet execution from the UI.
- Current UI no longer calls `binance-testnet-execution` because that function is deleted.
- Current UI reads `execution_settings` monitor fields only and never surfaces B2/B3 settings such as `auto_execute_testnet`, capital basis, governor thresholds, risk caps, or open-risk controls.

Recommended recovery:

- Patch, do not full-revert PR #54.
- Restore the B2/B3 Execution UI from `d2e67e1`, then merge in the B4/B4.1 monitor card and clean-stale action from current `HEAD`.
- Do not touch strategy logic while doing this UI recovery.

### `src/pages/admin/BacktestLab.tsx`

Changed from PR #53 state back toward older strategy/default behavior:

- CompressionBreakout balanced defaults changed away from B3/parity values.
- SwingContinuation balanced/aggressive defaults changed away from B3/parity values.
- CompressionBreakout evaluator regained a `compression_drift_too_flat` reject path that PR #53 state had removed.
- CompressionBreakout/SwingContinuation targets changed from risk-based targets back to ATR-based targets.
- SwingContinuation pullback and stop behavior changed.

Risk:

- Backtest Lab no longer matches scanner parity assumptions from the deleted/reverted work.

Recommended recovery:

- Patch from `d2e67e1` for BacktestLab parity-specific changes only if approved.
- Do not tune strategies during recovery; restore prior known state only.

### `src/pages/admin/Performance.tsx`

No net change in current `HEAD` vs PR #53 for this file. It was not part of the overwrite event in the last-three-branch audit.

### `src/lib/types.ts`

`4547933` removed B2/B3 interfaces:

- `BinanceExecutionOrder`
- `ExecutionEventLog`
- `ExecutionSettings`

Current `HEAD` has `ExecutionOrder` plus optional B4 Binance order-id fields, but not the B2/B3 shape needed by the prior execution UI/function.

Risk:

- Restoring the B2/B3 UI/function will require restoring/merging these types, including B4 monitor additions.

Recommended recovery:

- Patch, not revert.
- Reintroduce B2/B3 execution interfaces and add B4/B4.1 fields in a merged type surface.

### `supabase/functions/market-scanner/index.ts`

Current `HEAD` differs from PR #53 in ways unrelated to B4 monitor:

- Removed `tryAutoExecuteTestnet(signalId)`.
- Removed scanner handoff to `/functions/v1/binance-testnet-execution` after signal creation.
- Removed execution result metadata from scanner run output.
- Removed strategy evaluation counters (`evaluator_pass`, `score_pass`, `rr_pass`, `distance_pass`, `duplicate_pass`, `arbitration_entered`, `arbitration_won`, `signals_created`).
- Reverted timeframe parsing to a narrower map.
- Reverted signal expiry source behavior from strategy effective bars to older config behavior.
- Changed MicroScalper runtime params/comments from PR #53 state.
- Changed CompressionBreakout/SwingContinuation defaults and max-bars propagation.

Risk:

- Scanner, strategy configs, and execution are currently inconsistent with PR #50/#53 parity and PR #52/#53 auto-execution assumptions.

Recommended recovery:

- Do not edit scanner/execution strategy logic until approved.
- When approved, restore scanner parity and auto-execution handoff from `d2e67e1`, then adapt the handoff to coexist with B4 truth-first safeguards.

## Risky migrations and broken schema assumptions

### Deleted migrations that current code still implicitly needs

Current B4/B4.1 migrations assume an `execution_orders` table with B2/B3 Binance columns. However, the migrations that originally added many of those columns were deleted:

- `20260605123000_040_binance_usdm_testnet_execution.sql`
- `20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql`
- `20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql`
- `20260606100000_043_binance_testnet_bracket_be_risk_cap.sql`

Examples of missing or at-risk columns if a database is rebuilt from current migrations only:

`execution_orders` columns from deleted B2/B3 migrations:

- `exchange`
- `environment`
- `side`
- `leverage`
- `quantity`
- `entry_order_id`
- `sl_order_id`
- `tp1_order_id`
- `tp2_order_id`
- `raw_exchange_response`
- `testnet_enabled_at`
- `last_exchange_error`
- `capital_basis`
- `raw_total_margin_balance`
- `raw_total_wallet_balance`
- `raw_available_usdt`
- `raw_available_usdc`
- `selected_capital_used`
- `max_capital_cap_applied`
- `risk_pct`
- `risk_amount`
- `notional`
- `leverage_source`
- `governor_state`
- `governor_reason`
- `risk_multiplier`
- `adjusted_risk_pct`
- `adjusted_max_leverage`
- `breakeven_sl_order_id`
- `tp1_filled`
- `be_stop_level`
- `latest_protection_error`
- `total_open_risk_after_trade`

Current B4/B4.1 adds some new fields (`binance_entry_order_id`, `binance_sl_order_id`, etc.), but it does not recreate the full B2/B3 schema.

### `execution_settings` recreated/overwritten with missing columns

Current B4.1 migration `20260607123000_039_binance_monitor_cron_and_constraints.sql` uses `CREATE TABLE IF NOT EXISTS public.execution_settings` with a narrow B4 monitor/gate schema:

- `id`
- `execution_mode` (`disabled`/`testnet` only)
- `testnet_enabled`
- `kill_switch_enabled`
- `live_trading_enabled`
- monitor snapshot fields (`latest_monitor_run_at`, `open_binance_positions`, etc.)
- some account snapshot fields

The deleted B2/B3 migrations had added many settings columns that are now missing from current migrations:

- `exchange`
- `auto_execute_testnet`
- `max_open_testnet_positions`
- `max_open_testnet_positions_allowed_max`
- `max_total_open_risk_pct`
- `one_active_execution_per_symbol`
- `testnet_enabled_at`
- `fallback_account_balance`
- `capital_basis`
- `testnet_capital_override_usdt`
- `max_capital_used_usdt`
- `testnet_risk_a`
- `testnet_risk_a_plus`
- `max_testnet_risk_pct`
- `testnet_leverage_a`
- `testnet_leverage_a_plus`
- `testnet_max_leverage`
- `governor_enabled`
- `governor_state`
- `daily_start_equity`
- `current_equity`
- `daily_realized_pnl`
- `daily_unrealized_pnl`
- `daily_pnl_pct`
- `max_daily_loss_pct`
- `max_unrealized_drawdown_pct`
- `aggressive_allowed_profit_pct`
- `defensive_loss_pct`
- `max_consecutive_failed_executions`
- `max_consecutive_closed_sl`
- `last_governor_reason`
- `last_governor_checked_at`
- `latest_account_state`
- `latest_account_state_at`
- `account_available_balance`
- `account_available_usdt`
- `account_available_usdc`
- `account_unrealized_pnl`
- `account_open_positions`
- `account_margin_ratio`
- `account_open_order_count`

Conclusion: `execution_settings` was not safely extended. In a DB where B2/B3 migrations already ran, `CREATE TABLE IF NOT EXISTS` will not drop old columns, but in any rebuild/new environment current migrations produce a broken, incomplete execution schema. If manual SQL recreated `execution_settings`, the previous B2/B3 columns could have been lost.

### `execution_event_logs`: `execution_order_id` vs `execution_id`

PR #51/B2 migration `20260605123000_040_binance_usdm_testnet_execution.sql` created:

- `execution_event_logs.execution_id uuid REFERENCES public.execution_orders(id) ON DELETE CASCADE`
- index `execution_event_logs_execution_created_idx` on `(execution_id, created_at DESC)`

The B2/B3 execution function wrote logs with:

- `{ execution_id: executionId, event_type, message, metadata }`

Current B4.1 migration creates:

- `execution_event_logs.execution_order_id uuid REFERENCES public.execution_orders(id) ON DELETE SET NULL`
- index `execution_event_logs_execution_order_id_idx` on `(execution_order_id, created_at DESC)`

Current B4 monitor writes logs with:

- `{ execution_order_id: row.id, signal_id, symbol, event_type, message, metadata, telegram_sent }`

Conclusion: schema assumptions are broken across branches. If both B2/B3 and B4 function surfaces coexist, either the table must support both columns during transition, or B2 logging must be patched to use the new column. A repair migration is required.

Recommended resolution:

- Prefer a repair migration that adds both columns safely if absent and backfills both directions:
  - add `execution_id uuid` if missing;
  - add `execution_order_id uuid` if missing;
  - backfill `execution_order_id = execution_id` where missing;
  - backfill `execution_id = execution_order_id` where missing;
  - create both indexes if missing;
  - then update restored functions to write one canonical field plus compatibility if needed.
- Do not drop either column until runtime code is unified and historical logs are migrated.

### Migration numbering conflicts

Current migration list ends with:

- `20260607120000_038_binance_truth_first_execution_cleanup.sql`
- `20260607123000_039_binance_monitor_cron_and_constraints.sql`

But PR #50/#53 had already introduced:

- `20260605093000_038_end_to_end_strategy_scanner_parity_repair.sql`
- `20260605103000_039_microscalper_scanner_parity.sql`
- `20260605123000_040_binance_usdm_testnet_execution.sql`
- `20260606004500_040_microscalper_live_config_routing_guard.sql`
- `20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql`
- `20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql`
- `20260606100000_043_binance_testnet_bracket_be_risk_cap.sql`

Problems:

- The logical sequence numbers `038` and `039` were reused for unrelated B4 files after deleting older `038`/`039`.
- There were two old `040` files with different timestamps and topics (`binance_usdm_testnet_execution` and `microscalper_live_config_routing_guard`). They were both deleted.
- Supabase migration ordering is timestamp-driven, so the numeric suffix is descriptive only, but duplicate/reused suffixes are still operationally risky and confusing for manual recovery.
- Existing Supabase environments may have already recorded deleted migration versions. Current repo no longer contains those files, so local history and remote migration history can diverge.

Recommended resolution:

- Do not rename already-applied migrations unless coordinated with Supabase migration history.
- Add a new repair migration with a fresh timestamp after current files, e.g. `2026060713xxxx_040_recover_b2_b3_execution_schema.sql` or later.
- The repair migration should be additive/idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$` constraint guards) and should not drop data.
- Restore deleted migration files in git if they need to remain part of reproducible history. If remote Supabase already applied them, restoring them is safer than pretending they never existed.

## Supabase Edge Functions audit

### `binance-testnet-execution`

Status: deleted in current `HEAD`.

Impact:

- Admin UI B2/B3 actions cannot run.
- Scanner auto-execution handoff has also been removed, so new signals cannot auto-submit to Binance testnet through the previous path.
- B2/B3 risk/governor/settings code is gone from runtime.

Recovery recommendation:

- Restore the function from `d2e67e1` and then patch it to coexist with B4/B4.1 fields and the monitor.
- Do not replace `binance-testnet-monitor`; keep both functions.

### `binance-testnet-monitor`

Status: added by PR #54.

Impact:

- Useful B4.1 monitor/supervisor function.
- Writes `execution_event_logs.execution_order_id`.
- Uses B4 `binance_*_order_id` fields.
- Updates monitor snapshots in `execution_settings`.

Recovery recommendation:

- Keep this function.
- Patch schema compatibility around event logs and `execution_settings` after approval.
- Confirm whether it should read old B2 order-id columns (`entry_order_id`, `sl_order_id`, `tp1_order_id`, `tp2_order_id`) during transition or only the new `binance_*` fields.

### `admin-scheduler-action`

Status: modified by PR #54.

Impact:

- Adds `clean_stale_testnet_executions` action.
- Calls `mark_stale_testnet_execution_orders` after checking Binance truth.

Recovery recommendation:

- Keep this addition.
- Ensure the recovered execution UI can call it alongside restored B2/B3 actions.

### `market-scanner`

Status: overwritten/reverted relative to PR #53.

Impact:

- No longer auto-calls the Binance execution function.
- Strategy parity/stat/expiry behavior diverges from PR #50/#53.

Recovery recommendation:

- Restore parity and optional auto-execution handoff from `d2e67e1` only after approval.
- Do not tune strategy thresholds as part of recovery.

### `scheduled-market-scanner`, `telegram-send`, `telegram-test`, `evaluate-signal-outcomes`, `admin-bootstrap`

No direct last-three-branch replacement found in this audit. Cron and Telegram consistency risk is indirect via deleted scanner migrations and changed scanner output/metadata, not through direct replacement of these functions.

## Scanner, strategy configs, cron jobs, Telegram, and Binance monitor consistency

### Scanner and strategy configs

Not consistent with PR #53:

- Deleted `20260605103000_039_microscalper_scanner_parity.sql` and `20260606004500_040_microscalper_live_config_routing_guard.sql` remove the DB-side guard/config fixes for MicroScalper live scanner routing.
- `market-scanner/index.ts` has reverted runtime MicroScalper comments/params and several strategy max-bars/expiry behaviors.
- Deleted parity reports make it harder to validate intended scanner/backtest behavior.

### Cron jobs

Partially consistent, but risky:

- Existing scheduled scanner cron repairs (`035`, `036`) remain.
- Current B4.1 adds a Binance monitor cron job named `hashibot_binance_testnet_monitor_1m`.
- Deleted scanner parity migrations may have already been applied remotely but are missing locally.
- Current B4.1 migration hardcodes the Supabase project URL and schedules the monitor with `cron_pg_token` from `scanner_config`, consistent with prior scanner cron style but needing environment-specific verification.

### Telegram

Partially consistent:

- `binance-testnet-monitor` logs Telegram delivery rows for monitor events.
- Deleted B2/B3 execution function had Telegram delivery handling for execution events.
- Without `binance-testnet-execution`, execution-triggered Telegram events are gone.

### Binance monitor

Partially consistent:

- Monitor exists and has tests.
- Monitor expects B4 `binance_*_order_id` fields; these are added by current `038`.
- Monitor does not recover B2/B3 execution connector behavior.

## B4/B4.1 overwrote B2/B3 work?

Directly, PR #54 did not delete the B2/B3 files; `4547933` did. However, B4/B4.1 was merged after the deletion and introduced new B4 migrations numbered `038`/`039`, a narrowed `execution_settings` schema, and `execution_event_logs.execution_order_id`. This makes B4/B4.1 effectively sit on top of and normalize the overwritten state.

Conclusion:

- The accidental overwrite happened in `4547933`.
- B4/B4.1 then added new files that must be kept, but they need to be integrated with restored B2/B3 files rather than treated as replacements.

## Exact recommended recovery plan

### Phase 0 — Do not touch these yet

Do not touch until a recovery patch is approved:

- Strategy threshold tuning.
- Scanner evaluator logic beyond restoring exact deleted parity behavior.
- Execution sizing/risk/governor algorithms beyond restoring exact B2/B3 behavior.
- Live trading enablement.
- Binance live endpoints.
- Existing customer-facing UI not involved in the overwrite.
- Existing `Performance.tsx`, unless later evidence shows a separate issue.

### Phase 1 — Restore deleted files from the last good merged state (`d2e67e1`)

Patch, not full revert:

1. Restore `supabase/functions/binance-testnet-execution/index.ts` from `d2e67e1`.
2. Restore deleted execution reports:
   - `reports/execution/binance-usdm-testnet-connector.md`
   - `reports/execution/binance-testnet-auto-execution-capital-risk-bracket-orders.md`
   - `reports/execution/binance-testnet-risk-governor-pnl-brain.md`
   - `reports/execution/binance-testnet-bracket-protection-risk-cap.md`
3. Restore deleted scanner/parity reports:
   - `reports/execution/end-to-end-strategy-scanner-parity-repair.md`
   - `reports/execution/microscalper-scanner-parity-verification.md`
4. Restore deleted migrations if they were part of applied history:
   - `20260605093000_038_end_to_end_strategy_scanner_parity_repair.sql`
   - `20260605103000_039_microscalper_scanner_parity.sql`
   - `20260605123000_040_binance_usdm_testnet_execution.sql`
   - `20260605150000_041_binance_testnet_auto_capital_risk_brackets.sql`
   - `20260605170000_042_binance_testnet_risk_governor_pnl_brain.sql`
   - `20260606004500_040_microscalper_live_config_routing_guard.sql`
   - `20260606100000_043_binance_testnet_bracket_be_risk_cap.sql`

Important: restoring old migrations is a git/history reproducibility repair, not a new remote DB operation by itself. Whether Supabase will apply them depends on remote migration tracking. A separate repair migration is still needed for environments that already have inconsistent/manual SQL state.

### Phase 2 — Merge UI, do not choose one UI over the other

Patch `src/pages/admin/Execution.tsx` by:

1. Restoring the B2/B3 Binance USD-M Testnet Execution UI from `d2e67e1`.
2. Keeping the current B4.1 Binance Testnet Monitor panel.
3. Keeping the current clean-stale truth-first action.
4. Ensuring UI can call both:
   - `binance-testnet-execution` for execution actions;
   - `admin-scheduler-action` for truth-first stale cleanup.
5. Avoid changing any execution strategy/sizing logic in UI recovery.

### Phase 3 — Merge types

Patch `src/lib/types.ts` by:

1. Reintroducing B2/B3 `BinanceExecutionOrder`, `ExecutionSettings`, and `ExecutionEventLog` interfaces.
2. Adding B4/B4.1 monitor/order-id fields into those interfaces.
3. Keeping existing MT5/paper execution types if still used elsewhere.

### Phase 4 — Add a repair migration, do not rely only on restored old migrations

Add one new idempotent migration after current migrations. It should:

1. Add missing B2/B3 `execution_orders` columns with `IF NOT EXISTS`.
2. Add missing B2/B3 `execution_settings` columns with `IF NOT EXISTS`.
3. Add B4/B4.1 monitor columns if absent.
4. Make `execution_event_logs` compatible:
   - add `execution_id` if missing;
   - add `execution_order_id` if missing;
   - backfill both directions;
   - create both indexes if missing.
5. Repair constraints carefully:
   - preserve live trading disabled constraint;
   - allow both B2/B3 and B4/B4.1 execution statuses, including `closed_breakeven`, `stale_closed`, `protected_managed`, and `pending_managed_protection`.
6. Avoid dropping data, tables, or columns.

### Phase 5 — Restore scanner parity only as exact recovery

If approved, patch `supabase/functions/market-scanner/index.ts` to restore exact PR #53 behavior:

1. Re-add scanner evaluation stats.
2. Re-add robust `timeframeMinutes` parsing.
3. Restore strategy effective max-bars expiry behavior.
4. Restore MicroScalper runtime parity/config handling.
5. Restore optional Binance testnet execution handoff, but gate it exactly as before and ensure it calls the restored `binance-testnet-execution` function.
6. Do not tune strategy parameters.

### Phase 6 — Validate

After approved recovery patch:

- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run execution tests added by PR #54 if still applicable.
- Add/restore tests for the B2/B3 execution function if available.
- Compare Supabase migration history before applying repair migration remotely.

## Revert vs patch vs repair migration

Recommendation: **patch + repair migration**, not a full revert.

Why not full revert:

- PR #54 contains useful B4/B4.1 truth-first cleanup and monitor work that should remain.
- A full revert could remove monitor/cleanup functionality and tests.
- The destructive overwrite was `4547933`, but blindly reverting it could conflict with PR #54 and package/dependency changes.

What to patch:

- Restore deleted B2/B3 function, UI sections, types, reports, and scanner parity files from `d2e67e1`.
- Merge B4/B4.1 monitor additions into the restored state.

What requires repair migration:

- `execution_settings` missing columns.
- `execution_event_logs.execution_id` vs `execution_order_id` compatibility.
- `execution_orders` missing B2/B3 columns in rebuild/manual-SQL environments.
- Status/protection/bracket constraints that need to allow both B2/B3 and B4/B4.1 states.

What not to touch:

- Strategy tuning.
- Scanner algorithmic changes beyond exact recovery.
- Execution sizing/governor algorithmic changes beyond exact recovery.
- Live-trading enablement.
- Binance live endpoints.
- Customer app flows.
- `src/pages/admin/Performance.tsx`, unless separately requested.

## Test/check results for this audit

- `npm run typecheck` — passed.
- `npm run lint` — passed with existing warnings only:
  - `src/components/ui/Badge.tsx` fast-refresh export warnings.
  - `src/contexts/AuthContext.tsx` fast-refresh export warning.
- `npm run build` — passed with Vite chunk-size warning for the main JS chunk.
- `git diff --check` — passed.
