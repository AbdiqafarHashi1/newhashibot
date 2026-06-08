# HASHIBOT B6.3 — Restore Working Performance Reset

Date: 2026-06-08

## Root cause

The original working `admin_reset_trading_history()` was a narrow, dependency-ordered reset for the tables that fed Admin → Performance. It deleted signal-linked `telegram_deliveries`, then `signal_updates`, then `signals`, then `strategy_candidates`.

The current reset drifted from that behavior in two ways:

1. **The reset became one large RPC transaction that loops over large tables.** Supabase applies statement timeouts to the RPC call as a whole, so a reset with many rows can hit `canceling statement due to statement timeout` before all performance rows are removed.
2. **The current schema has more signal-linked child history than the original reset knew about.** Later execution and optional outcome tables can reference `signals` or signal-linked execution orders. Those child rows must be removed before deleting `signals`; otherwise the reset either fails on FK dependencies or leaves rows that keep the reset from reaching the parent signal delete safely.

Because Admin → Performance reads from `signal_analytics_view`, and that view is rooted in `signals`, any surviving `signals` rows continue to show as Total/Open/Closed signals even when candidate counts have already reached zero.

## Performance data sources

Admin → Performance loads signal rows from `signal_analytics_view` with `data_source = 'REAL DATA'` and excludes `CANCELLED` outcomes. The view itself selects from `signals` and left-joins close status from `signal_updates`.

Control Room candidate count reads `strategy_candidates` directly. Rejected setup pages also read rejected rows from `strategy_candidates` where `status = 'rejected'`.

## Old vs. current schema comparison

### Original reset delete scope

The original working reset deleted:

1. `telegram_deliveries` rows with `signal_id`
2. `signal_updates`
3. `signals`
4. `strategy_candidates`

It intentionally preserved `scanner_runs`; Performance was derived from `signals`/`signal_updates`, so old scanner runs did not repopulate stats.

### Current/newer signal-linked tables accounted for

The B6.3 reset now accounts for tables that exist in the current migration history or may exist in deployed databases:

- `telegram_deliveries`
- `signal_updates`
- optional `signal_outcomes`
- optional `outcomes`
- `execution_event_logs`
- `execution_orders`
- `paper_execution_intents`
- optional `rejected_setups`
- `signals`
- `strategy_candidates`
- optional `scanner_candidates`

## FK dependency chain

Observed migration FK chain:

- `signal_updates.signal_id → signals.id ON DELETE CASCADE`
- `telegram_deliveries.signal_id → signals.id` with no cascade in the base schema
- `signals.candidate_id → strategy_candidates.id`
- `execution_orders.signal_id → signals.id ON DELETE SET NULL`
- `paper_execution_intents.signal_id → signals.id ON DELETE SET NULL`
- `execution_event_logs.execution_id → execution_orders.id ON DELETE CASCADE` in older execution migrations
- `execution_event_logs.execution_order_id → execution_orders.id ON DELETE SET NULL` and `execution_event_logs.signal_id → signals.id ON DELETE SET NULL` in later monitor migrations

The non-cascading signal-linked child that historically blocked direct signal deletes is `telegram_deliveries.signal_id`. The newer execution/event/outcome tables must be cleaned first as current-schema child history so the reset can restore the old “Performance becomes empty” behavior without depending on FK side effects.

## Timeout root cause and fix

The previous B6.2 implementation looped through all rows inside a single RPC call using batch deletes. Although each internal delete used a batch, the entire RPC was still one statement from the platform perspective, so large history tables could still exceed the platform statement timeout.

B6.3 changes `admin_reset_trading_history_batch(p_batch_size)` to perform one bounded pass per table with a batch size clamped to 25–100 rows. The UI now repeatedly calls that bounded RPC with `p_batch_size = 50` until the returned `has_more` flag is false. This keeps each network/RPC statement small and prevents giant reset statements.

## Delete order used

B6.3 uses this child-first order and skips optional tables that are not present:

1. `telegram_deliveries`
2. `signal_updates`
3. `signal_outcomes`
4. `outcomes`
5. `execution_event_logs`
6. `execution_orders`
7. `paper_execution_intents`
8. `rejected_setups`
9. `signals`
10. `strategy_candidates`
11. `scanner_candidates`

`signals` are deleted before `strategy_candidates` because `signals.candidate_id` references `strategy_candidates.id`.

## Preserved tables

The reset preserves:

- `scanner_config`
- `strategy_configs`
- `execution_settings`
- provider settings
- Telegram configuration
- `profiles`
- `customers`
- `subscriptions`
- `packages`
- access records
- bot setup records
- `symbols`
- `candles`
- market data
- Binance credentials
- Binance positions
- Binance account state
- `scanner_runs`

## UI verification behavior

After the UI loop finishes, Admin → Performance automatically refreshes. The reset panel now shows:

- `Reset Complete`
- aggregated deleted counts by table
- remaining counts for `signals`, `outcomes`, `telegram_deliveries`, `candidates`, and `rejected_setups`
- any non-zero detailed remaining table as the responsible table

Expected final remaining counts after a completed reset:

- `signals: 0`
- `outcomes: 0`
- `candidates: 0`
- `rejected_setups: 0`

## Deleted counts and remaining counts

Runtime counts are returned by `public.admin_reset_trading_history_batch()` in:

- `deleted_counts`
- `remaining_counts`
- `has_more`
- `dependency_delete_order`

This report cannot include production row counts because the migration was prepared locally and not executed against production in this environment. The UI exposes those counts after the operator runs the reset.

## Screenshots / proof references

No browser session or production Supabase instance was available in this environment, so no live UI screenshots were captured. Code proof references:

- Reset RPC migration: `supabase/migrations/20260608193000_049_b6_3_restore_batched_performance_reset.sql`
- Performance reset UI loop and verification output: `src/pages/admin/Performance.tsx`

## Acceptance checklist

- Before reset: Performance may be populated from surviving `signals` rows.
- Run reset: UI repeatedly calls bounded `admin_reset_trading_history_batch(50)` until `has_more = false`.
- After reset:
  - Performance `Total Signals = 0` because `signal_analytics_view` has no `signals` rows.
  - Closed/Open signals are zero for the same reason.
  - Profit Factor and Total R collapse to empty/zero display because there are no rows to aggregate.
  - Control Room candidates are zero because `strategy_candidates` is empty.
  - Scanner config/scheduling is preserved; the next scanner run can create new candidates/signals normally.

## B6.3 final acceptance guard addendum

B6.3 final adds an explicit reset acceptance guard:

- Admin → Performance calls `admin_reset_trading_history_batch` with `p_batch_size = 50` and `p_until_empty = true`.
- The RPC returns `success = false` while any source-of-truth history count remains above zero.
- The UI keeps calling bounded reset passes and does not render `Reset Complete` until the final response has no remaining source rows.
- `remaining_counts.signals === 0` is the required pass condition for Performance totals to be considered reset.

Final source-of-truth checks returned by the RPC:

- `signals`
- `signal_updates`
- `signal_outcomes`
- `outcomes_table`
- signal-linked `telegram_deliveries`
- `strategy_candidates`
- `scanner_candidates`
- `rejected_setups`
- linked `execution_event_logs`, `execution_orders`, and `paper_execution_intents`

The final proof fields available to the operator after running reset are:

- source tables before reset: measured externally before calling the RPC or visible in Performance/Control Room counts
- `deleted_counts`: accumulated by the Admin UI across reset passes
- `remaining_counts`: returned by the RPC and displayed by the Admin UI
- `signals reached 0`: true only when `remaining_counts.signals === 0`

No production reset was executed from this local environment. The acceptance proof is implemented in code and surfaced in the UI for the production operator to capture after running the reset.
