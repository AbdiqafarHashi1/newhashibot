# HASHIBOT B6.2 — Separate Performance History Reset and Testnet Governor Controls

## Scope

B6.2 separates two previously mixed controls:

1. **Performance / trading-history reset** on Admin → Performance only.
2. **Binance USD-M Testnet governor reset** on Admin → Execution only.

No strategy tuning, scanner/arbitrator tuning, Binance TP/SL behavior change, live-trading enablement, or forex/MT5 logic changes were made.

## Part A — Performance History Reset

### UI location

- Admin → Performance only.
- Confirmation text is now `RESET PERFORMANCE HISTORY`.
- Button label is `Reset Performance History`.

### Database behavior

`public.admin_reset_trading_history_batch()` was replaced with a B6.2 history-only implementation that:

- Deletes in dependency-safe batches.
- Disables statement timeout locally for the reset transaction and uses a short lock timeout.
- Returns per-table deleted counts and statuses in `deleted_counts`.
- Skips optional/missing tables safely.
- Deletes `execution_orders` only where `signal_id IS NOT NULL`, so it removes DB history rows linked to old signals without touching unlinked execution setting/account state.
- Deletes `execution_event_logs` linked directly to signals or to signal-linked execution rows before execution rows/signals.

### Cleared history tables

The reset covers these history tables where present:

- `telegram_deliveries`
- `execution_event_logs`
- `paper_execution_intents`
- `execution_orders` linked to old signals only
- `signal_updates`
- `signal_outcomes`
- `outcomes`
- `signals`
- `strategy_candidates`
- `scanner_candidates`
- `rejected_setups`
- `scanner_runs`

### Preserved state

The reset explicitly preserves:

- `scanner_config`
- `strategy_configs`
- `execution_settings`
- customers/packages/subscriptions/profiles
- Telegram configuration/setup rows
- bot setup records
- Binance credentials/secrets
- Binance account balance snapshots
- real Binance positions/orders

### Explicit non-actions

Performance reset does **not**:

- close Binance positions
- cancel Binance orders
- reset governor state
- disable scanner
- change strategy/scanner/execution configuration

## Part B — Binance Testnet Governor Controls

### UI location

- Admin → Execution only.
- The Risk Governor / PnL Brain panel now exposes the requested state fields and actions.

### Exposed governor state

The Execution page now displays:

- `governor_enabled`
- `governor_state`
- `governor_reason`
- `execution_allowed`
- `current_equity`
- `daily_start_equity`
- `daily_realized_pnl`
- `daily_unrealized_pnl`
- `daily_pnl_pct`
- `max_daily_loss_pct`
- `max_unrealized_drawdown_pct`
- `failed_execution_streak`
- `closed_sl_streak`
- `last_governor_checked_at`

### New action

The Edge Function now supports:

- `reset_testnet_governor`

The Execution page exposes this as:

- `Reset Testnet Governor / Start New Test Day`

### Governor reset behavior

The governor reset:

- asserts live trading remains impossible
- keeps `live_trading_enabled=false`
- resets daily testnet PnL baseline to the current testnet equity when available
- resets daily realized PnL to `0`
- resets daily PnL percent to `0`
- resets `failed_execution_streak` to `0`
- resets `closed_sl_streak` to `0`
- sets governor state back to normal only under the live-trading-disabled guard
- re-evaluates governor state immediately afterward
- returns `execution_allowed`

### Explicit non-actions

Governor reset does **not**:

- delete signals
- delete scanner runs
- clear performance history
- close Binance positions
- cancel Binance orders
- enable live trading
- alter strategy/scanner settings

## Part C — UI Separation

- Performance page contains only the performance/history reset control.
- Execution page contains the governor state panel, governor re-evaluation, and testnet governor reset control.
- No governor reset was added to Performance.
- No performance reset was added to Execution.

## Part D — Verification Notes

Implemented checks ensure:

- performance reset remains dependency-safe and batch-safe
- performance reset returns per-table deleted counts
- performance reset documents governor/scanner/Binance non-actions
- persisted governor streak counters survive deletion of old DB execution history until the governor reset action clears them
- governor reset action is testnet-only and re-evaluates execution allowance
