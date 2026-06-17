# X-F.4 execution singleton rows

## Migration
Created `supabase/migrations/20260617120000_075_null_id_execution_singletons.sql`.

## Guaranteed rows
- `execution_settings` id `1`
- `scanner_config` id `1`
- `execution_provider_global_controls` id `1`
- `execution_provider_controls` providers `binance`, `bybit`, and `mt5`

## Safe defaults
- `execution_settings.execution_mode='testnet'`
- `testnet_enabled=true`
- `auto_execute_testnet=true`
- `live_trading_enabled=false`
- `kill_switch_enabled=false`
- `bot_paused=false` when that column exists
- Provider global controls keep `live_trading_enabled=false` and set `parallel_mode_enabled=true`
- Primary provider is `bybit` only when the Bybit control row is enabled and connected; otherwise it falls back to `binance`

## Bybit preservation
The migration does not downgrade an already-connected Bybit provider row. It preserves Bybit `status` and only enables entry/read-write flags when the preserved status is `connected`.
