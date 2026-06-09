# HASHIBOT B6.5 Final Performance Reset Fix

## 1. Exact reset RPC originally called

`src/pages/admin/Performance.tsx` already used the intended reset button handler, `handleResetTradingHistory()`, for the **Reset Performance History** button. Before this fix, the click path called:

```ts
supabase.rpc('admin_reset_trading_history_batch', {
  p_batch_size: 25,
  p_until_empty: false,
});
```

So the original UI RPC name was `public.admin_reset_trading_history_batch(p_batch_size integer, p_until_empty boolean)`. The remaining problem was not Binance-related; it was the implementation and completion criteria for the reset RPC.

## 2. FK map referencing `public.signals(id)`

The FK discovery query required for production verification is:

```sql
SELECT
  con.conname AS constraint_name,
  con.conrelid::regclass AS child_table,
  array_agg(att.attname ORDER BY ord.ordinality) AS child_columns,
  con.confrelid::regclass AS parent_table,
  array_agg(parent_att.attname ORDER BY ord.ordinality) AS parent_columns,
  con.confdeltype AS on_delete_code
FROM pg_constraint con
JOIN unnest(con.conkey) WITH ORDINALITY AS ord(attnum, ordinality) ON true
JOIN pg_attribute att
  ON att.attrelid = con.conrelid
 AND att.attnum = ord.attnum
JOIN unnest(con.confkey) WITH ORDINALITY AS parent_ord(attnum, ordinality)
  ON parent_ord.ordinality = ord.ordinality
JOIN pg_attribute parent_att
  ON parent_att.attrelid = con.confrelid
 AND parent_att.attnum = parent_ord.attnum
WHERE con.contype = 'f'
  AND con.confrelid = 'public.signals'::regclass
GROUP BY con.conname, con.conrelid, con.confrelid, con.confdeltype
ORDER BY child_table::text, constraint_name;
```

Schema/migration audit shows these current or legacy/optional signal children that must be cleared before signal deletion:

| Child table | Child column | Referenced parent | Delete behavior seen in schema history |
|---|---:|---|---|
| `public.telegram_deliveries` | `signal_id` | `public.signals(id)` | no explicit `ON DELETE`, effectively `NO ACTION` / restrict-at-check |
| `public.execution_event_logs` | `signal_id` | `public.signals(id)` | `ON DELETE SET NULL` in recovered execution schema |
| `public.execution_orders` | `signal_id` | `public.signals(id)` | `ON DELETE SET NULL` |
| `public.paper_execution_intents` | `signal_id` | `public.signals(id)` | `ON DELETE SET NULL` legacy/optional |
| `public.signal_updates` | `signal_id` | `public.signals(id)` | `ON DELETE CASCADE` |
| `public.signal_outcomes` | `signal_id` | `public.signals(id)` | optional B-series table |
| `public.outcomes` | `signal_id` | `public.signals(id)` | optional legacy table |

The new RPC also reports signal-linked counts for the tables it clears so the UI can continue batching until no signal-linked child rows remain.

## 3. Exact root cause of FK failure

The FK failure was caused by attempting to delete from `public.signals` while child rows still existed in `public.telegram_deliveries` for those same signal IDs. `telegram_deliveries_signal_id_fkey` does not cascade, so any remaining linked delivery row can reject the signal delete.

The previous hotfix made the signal batch delete remove Telegram deliveries for the chosen signal batch, but it still violated the required global reset order because it could enter the signal-delete phase before every signal child table was empty. It also deleted `signal_outcomes` after `signals`, which is unsafe if that optional table exists with a restrict/no-action FK.

The final RPC performs the hard guard before deleting any signal batch:

```sql
SELECT count(*)
FROM public.telegram_deliveries td
WHERE td.signal_id IS NOT NULL
AND EXISTS (
  SELECT 1
  FROM public.signals s
  WHERE s.id = td.signal_id
);
```

That count must be zero before `DELETE FROM public.signals` is attempted.

## 4. Exact root cause of timeout

The timeout came from reset implementations that tried to clear too much in a single RPC transaction or used `p_until_empty = true` loops server-side. Supabase can apply a statement timeout to the entire RPC call. A large history table, an FK cascade, or a long dependency chain could keep the transaction open long enough to hit `canceling statement due to statement timeout`.

The final behavior uses `p_batch_size = 25` and `p_until_empty = false` from the UI. Each button reset performs many small RPC calls instead of one large delete.

## 5. Final delete order

The canonical reset order is:

1. `telegram_deliveries` rows linked to existing `signals`
2. `execution_event_logs` linked directly to `signals` or to signal-linked `execution_orders`
3. `execution_orders` rows with `signal_id IS NOT NULL`
4. `paper_execution_intents` rows with `signal_id IS NOT NULL`
5. `signal_updates` linked to existing `signals`
6. `signal_outcomes` linked to existing `signals`
7. legacy optional `outcomes` linked to existing `signals`
8. `signals`, only after linked child counts are zero
9. `strategy_candidates`, only after `signals = 0`
10. `rejected_setups`
11. `scanner_runs`, only after candidates/rejections are gone

Preserved tables include scanner configuration, strategy configuration, execution settings, candles, symbols, Telegram settings, Binance credentials, Binance balances, Binance positions, Binance orders, profiles, customers, packages, and subscriptions.

## 6. Batch behavior

`public.admin_reset_trading_history_batch()` now clamps the effective batch size to a maximum of 25. The Performance page calls it repeatedly with:

```ts
p_batch_size: 25,
p_until_empty: false,
```

Each RPC returns:

- `deleted_counts` for that pass
- `remaining_counts` after that pass
- `has_more`, computed from remaining performance/history rows
- `dependency_delete_order`
- `preserved_tables`

The UI continues calling the canonical RPC until the required remaining counts are zero.

## 7. Remaining counts after each batch

The RPC returns this `remaining_counts` object after every batch:

- `signals`
- `telegram_deliveries_linked_to_signals`
- `telegram_deliveries` (compatibility alias for the linked count)
- `execution_event_logs_linked`
- `execution_orders`
- `paper_execution_intents`
- `signal_updates`
- `signal_outcomes`
- `outcomes`
- `strategy_candidates`
- `rejected_setups`
- `scanner_runs`

The UI aggregates deleted counts across all calls and displays the final remaining counts. During an actual reset, these counts should decrease in batches of up to 25 for whichever dependency is currently being drained. Signals remain blocked until all signal child counts are zero; strategy candidates remain blocked until `signals = 0`; scanner runs remain blocked until candidates/rejections are gone.

## 8. Proof Performance page becomes zero

The Performance page reloads `signal_analytics_view` after the reset loop finishes. Because reset completion now requires `signals = 0` and signal-linked history tables to be empty, the loaded `signals` array becomes empty and the derived page metrics become:

- total signals: `0`
- open signals: `0`
- closed signals: `0`
- total R: `0` / no closed R rows
- strategy stats: empty rows
- symbol stats: empty rows
- trade history: empty rows

## 9. Confirmation scanner still works

This fix does not modify scanner code or scanner configuration. It preserves `scanner_config`, `strategy_configs`, candles, symbols, and market data. Only historical `scanner_runs` are cleared after candidate/rejection rows no longer reference them. New scanner runs can still insert fresh `scanner_runs`, `strategy_candidates`, and `signals` normally.

## 10. Confirmation Signal Mode still works

This fix does not modify Signal Mode logic, strategy logic, signal-generation logic, or subscriber/customer access tables. It only clears old signal/history rows. New scanner-created signals continue to flow into the existing Signal Mode pages and analytics views.

## 11. Confirmation Binance execution logic was untouched

No Binance execution, protection, governor, credential, balance, position, or order logic was changed. The RPC deletes only local execution history rows linked to reset signals: `execution_event_logs` and `execution_orders` rows with a signal relationship. It does not touch exchange credentials, Binance balances, Binance positions, or Binance-native orders.
