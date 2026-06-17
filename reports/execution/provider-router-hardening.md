# X-F.4 provider router hardening

## Shared setup validation
Before provider tasks start, the router validates:
- `execution_settings` id `1`
- `scanner_config` id `1`
- `execution_provider_global_controls` id `1`
- Binance provider control row
- Bybit provider control row
- Requested signal row

If any required row is missing, the router returns `setup_blocked=true` with named blockers instead of starting provider execution.

## Provider isolation
Binance and Bybit tasks are created independently. Symbol-cache misses are returned as per-provider `missing_symbol_cache` results. Rejected provider promises are mapped to named blockers when possible, otherwise to `unknown_null_row` with the original detail.

## Insert hardening
Execution rows are created with `status='pending_submit'` before order submission. Exchange failures update that row to `failed` instead of causing a generic null-row crash.
