# HASHIBOT B6.5 Reset True Small-Batch Hotfix

## Scope

This hotfix changes only the Performance reset path:

- `public.admin_reset_trading_history_batch(integer, boolean)`
- the Performance page reset loop and progress text

No Binance, scanner logic, strategies, arbitrator, Telegram delivery logic, governor, execution engine, or UI redesign work was changed.

## Reset RPC behavior

`admin_reset_trading_history_batch` is now a true single-step batch RPC:

- clamps each call to a maximum batch size of `25`
- deletes from only one dependency group per call
- returns immediately after that one bounded delete attempt
- does not loop inside SQL until empty
- does not delete `scanner_runs`
- avoids heavy global `COUNT(*)` scans by using bounded remaining probes capped at `batch_size + 1`

## Delete order

The RPC advances through this order:

1. `telegram_deliveries` linked to signals
2. `execution_event_logs` linked to signals or signal-linked execution orders
3. `execution_orders` where `signal_id IS NOT NULL`
4. `signal_updates` linked to signals
5. `signal_outcomes` linked to signals
6. `signals`
7. `strategy_candidates`
8. `rejected_setups`

## Return shape

Each call returns a JSON payload with:

- `success`
- `has_more`
- `step`
- `deleted_count`
- `remaining_counts.signals`
- `remaining_counts.telegram_deliveries_linked_to_signals`
- `remaining_counts.execution_orders`
- `remaining_counts.signal_updates`
- `remaining_counts.signal_outcomes`
- `remaining_counts.strategy_candidates`
- `remaining_counts.rejected_setups`

The payload also includes `execution_event_logs_linked` so the UI can show why the RPC is still continuing while signal-linked execution logs are being drained.

## Performance page behavior

The Performance page now calls the RPC repeatedly with `p_batch_size: 25` and `p_until_empty: false`, waits for each response, updates progress text after each batch, and continues only while `has_more` is true. The reset stops successfully only when the RPC returns `success: true`, then refreshes Performance data.

After success, Performance is signal-based and should show:

- Total signals: `0`
- Closed signals: `0`
- Open signals: `0`
- Total R: `0`
- Win rate: `N/A` or `0`
- Profit factor: `N/A` or `0`
- Empty tables

## Preserved data

The reset does not delete or alter:

- `scanner_runs`
- `scanner_config`
- `strategy_configs`
- `execution_settings`
- `candles`
- `symbols`
- Binance credentials
- Binance positions/orders
- customers/packages/subscriptions/profiles
- Telegram config
