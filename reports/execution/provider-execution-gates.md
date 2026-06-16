# Provider execution gates

## Global gates

- `auto_execute_testnet`: blocks non-manual execution when false.
- `testnet_enabled`: must be true.
- `live_trading_enabled`: must remain false; env and DB guards throw if true.
- `parallel_mode_enabled`: controls whether router selects all healthy providers or only primary provider.
- `bot_paused`: blocks entries.
- `kill_switch_enabled`: blocks entries.
- `emergency_stop`: represented by paused/global stop UI state; entries remain blocked while active.

## Provider gates

- `enabled`: provider must be enabled.
- `entry_enabled`: provider entry must be enabled.
- `monitor_enabled`: visible independently; does not silently enable entries.
- `status`: must be `connected` for entry.
- `provider_kill_switch` / `kill_switch`: blocks that provider.
- `read_only`: blocks entries.
- connected/healthy: Bybit health updates status from real testnet V5 wallet/position/order checks.
- duplicate active signal, one-active-signal-per-symbol, max open positions, max daily/risk/capital gates: enforced by execution function before submission.

## Signal gates

- Grade must be A/A+ for scanner-created auto-execution intent.
- Entry, SL, TP1, TP2 must produce a valid execution plan.
- Non-expired and old-signal gates apply to automatic routes.
- `research_only` / VIP/customer gating must not block testnet execution; execution uses provider/global safety controls.
- Strategy, market type, and symbol support remain scanner/provider responsibilities.
