# Provider account normalization and setup runbook

## Proven schema repair decisions

| Runtime reference | Deployed/repository contract before | Classification | Repair and after contract |
|---|---|---|---|
| `mt5_accounts.is_active` | Phase 8A defines `execution_enabled`, `connection_status`, and `last_heartbeat_at`; no `is_active` exists. | **A — obsolete code reference** | The Full System Test reads account existence independently from `execution_enabled`, then evaluates `last_heartbeat_at`. No duplicate column or migration is added. |
| `execution_monitor_heartbeats.error` | The heartbeat migration defines `errors jsonb`; monitor writers already persist `errors`. | **A — obsolete code reference** | Runtime Supervisor reads `errors` and `monitor_status`. No singular `error` column is added. |
| `scanner_config.last_scan_at` | The supervisor migration adds and active scanner writers use `last_run_at`. | **A — obsolete code reference** | Runtime Supervisor reads `last_run_at`. No duplicate timestamp is added. |

The deployed schema evidence supplied with this repair proves the failures; repository migrations establish the intended replacements. Deployment schema introspection was not available from this checkout, so the migration must still be applied and the schema probes rerun in the target project.

Static migration validation confirms that `connected_execution_accounts.account_id` and `credential_ref` are `text`, `risk_profiles.id` is UUID, and `execution_monitor_heartbeats.account_id` is an existing text column. Existing `provider` and `environment` checks already restrict rows to the values used by the normalized contract. The new ownership and health columns are populated with valid `customer` and `unknown` defaults, so existing rows satisfy their checks. Existing ownership uniqueness, operational-scope uniqueness, and heartbeat scope indexes are preserved; the new monitor-selection and account-heartbeat indexes cover distinct query paths.

## Canonical account contract

Crypto execution accounts live in `connected_execution_accounts`; MT5 accounts live in `mt5_accounts` and expose only `mt5_accounts_safe` to clients. Crypto account truth lives in `execution_account_runtime_proof`; MT5 truth lives in `mt5_account_snapshots`. `execution_monitor_heartbeats` is account-scoped when an account identity exists. Provider controls remain in `execution_provider_controls`.

`connected_execution_accounts` resolves a stable ID, customer/system ownership, provider, environment, opaque Vault `credential_ref`, enabled and monitor gates, explicit default-off execution adoption, risk profile reference, health, synchronization, error, and timestamps. Secret values never belong in these rows. `enabled` means the account may be selected; `execution_enabled` alone represents adoption. `risk_profile_id` references the repository's UUID `risk_profiles(id)`. No canonical capital-profile table exists in the root migrations, so this migration intentionally does not add an ungoverned `capital_profile_id`; capital remains resolved by the existing allocation/runtime policy contracts until a canonical relational table exists.

An operator must create or designate Binance Testnet and Bybit Demo accounts through the existing Vault-backed connected-account workflow. Set `is_operational=true` only after ownership and the Vault reference are verified. Keep `execution_enabled=false`. A system secret without that row is only a read-only reachability diagnostic and must skip writes.

## MT5 manual setup

Use the existing agent in `mt5-agent/`; do not create another bridge.

1. On the Windows host with the intended MetaTrader 5 terminals, install Python and the dependencies from `mt5-agent/requirements.txt`.
2. Copy `mt5-agent/.env.example` to `.env`. Set `HASHIBOT_SUPABASE_URL`, `HASHIBOT_SUPABASE_ANON_KEY`, `HASHIBOT_AGENT_TOKEN`, and the bridge identity/interval values documented in `mt5-agent/README.md`.
3. Register/authenticate the existing bridge endpoint securely; never place terminal passwords in account display fields or logs.
4. Use the existing `mt5-accounts` Edge workflow to add the Personal Demo and Prop Demo accounts. Confirm broker, server, terminal account number, type, and mode.
5. Start `mt5-agent/main.py` interactively and verify bridge registration, then install `mt5-agent/install_service.ps1` only after the interactive check passes.
6. Verify the first `mt5_bridge_registry` heartbeat and each account's `last_heartbeat_at`.
7. Verify a new `mt5_account_snapshots` row contains balance, equity, margin, positions, and orders for the correct account ID.
8. Verify `mt5_symbol_specs` maps each canonical symbol to the terminal broker symbol.
9. Enable monitoring separately. Keep `mt5_accounts.execution_enabled=false` through proof testing.

Mission Control must treat Bridge Deployed, Agent Installed, Heartbeat, Account Authenticated, Symbol Map, Monitor Ready, and Execution Adoption as separate evidence.

## Telegram controlled test

Keep broad scanner delivery paused. Confirm the bot token in secure deployment storage and an approved operator destination in the existing Telegram registry/link configuration. Invoke the existing `telegram-test` Edge Function once. Proof requires HTTP success, Telegram API success, a non-empty Telegram message ID, and a matching `telegram_deliveries` row containing destination identity and timestamp. A function-only success is not delivery proof.

## Cron hold and later enablement

No cron is enabled by this repair. After schema probes, manual diagnostics, canonical account creation, and monitor identity checks pass, enable only the consolidated jobs in this order:

1. `hashibot_prod_binance_testnet_monitor_1m`
2. `hashibot_prod_bybit_demo_monitor_1m`
3. `hashibot_prod_scanner_5m`

Do not enable Telegram content jobs until the controlled delivery test passes. MT5 has no cron to enable until its existing bridge is installed and certified.
