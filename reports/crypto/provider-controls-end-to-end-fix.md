# Provider Controls End-to-End Fix — Phase X-D

## 1. Root Cause

Admin Execution showed a false "Provider controls table not migrated yet" warning because it treated an empty provider controls array as a missing table. It did not distinguish missing table, RLS denial, missing rows, or ordinary query errors. Provider Comparison also hid zero-execution providers because the performance view only returned providers present in `execution_orders`.

## 2. DB Migration Changes

Added migration `20260615170000_073_provider_controls_e2e_repair.sql` to guarantee:

- `execution_provider_controls` exists.
- Compatibility columns `provider`, `recovery_enabled`, and `kill_switch` exist.
- `execution_provider_global_controls` exists with one safe global row.
- `provider_parity_audit` exists with required indexes.
- `provider_execution_performance` returns Binance, Bybit, and MT5 even when a provider has zero executions.

## 3. RLS Policy Changes

Enabled RLS for provider controls, global controls, and parity audit. Added authenticated-admin SELECT/UPDATE policies using the existing `public.is_admin()` helper. Global control updates require `live_trading_enabled is false`.

## 4. Seed Rows Proof

The repair migration upserts these safe defaults:

- Binance: enabled, not read-only, primary, monitor/recovery enabled, parallel off, kill switch off.
- Bybit: disabled, read-only, monitor/recovery/profit-lock off, parallel off, kill switch off.
- MT5: disabled, read-only placeholder, parallel off, kill switch off.
- Global: primary provider `binance`, parallel mode off, live trading disabled.

## 5. UI Fixes

Admin Execution now classifies provider-control failures as missing table, RLS blocked, rows missing, or generic query failed. The false migration warning is removed. Provider controls now render per-provider toggles and global controls for parallel mode and primary provider.

## 6. Provider Comparison Behavior

Provider Comparison now shows all providers with clean empty states. Binance includes legacy rows where `execution_provider` is null via the repaired DB view. Bybit shows "No Bybit executions yet" until real Bybit test executions exist. MT5 is a placeholder. Parity audit says "No parity rows yet because parallel test has not run" when empty.

## 7. Bybit Health Check Readiness

Added Edge Function action `diagnose_bybit_testnet_connection`. It places no orders. It checks key/secret presence, `BYBIT_TESTNET_ENABLED`, testnet base URL, signed auth, balances fetch, positions fetch, open orders fetch, and BTCUSDT/ETHUSDT/SOLUSDT instrument support. Results are written to the Bybit provider-control metadata/status.

## 8. Tests Run

- `npm run typecheck`
- `npm run test:execution`
- `npm run build`
- `git diff --check`

## 9. Final Status

- PROVIDER CONTROLS WORKING: YES
- PROVIDER COMPARISON WORKING: YES
- BYBIT HEALTH CHECK READY: YES
- PARALLEL MODE DEFAULT OFF: YES
- LIVE TRADING STILL DISABLED: YES
