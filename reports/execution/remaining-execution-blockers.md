# X-F.5 remaining execution blockers

The system should now return explicit blockers instead of generic crashes or silent no-row states.

## Setup blockers
- `missing_execution_settings`
- `missing_scanner_config`
- `missing_global_provider_controls`
- `missing_provider_control_binance`
- `missing_provider_control_bybit`
- `missing_signal`

## Provider/symbol blockers
- `missing_symbol_cache`
- `provider_disabled`
- `provider_entry_disabled`
- `provider_kill_switch`
- `provider_read_only`
- `provider_disconnected` / degraded provider status

## Row/order blockers
- `execution_order_insert_failed`
- exchange-specific Binance/Bybit error message stored on `execution_orders.error_message` / `last_exchange_error`

## Customer-observation status
Safe to observe in testnet after deployment because live trading remains disabled and provider failures are isolated into rows/blockers.
