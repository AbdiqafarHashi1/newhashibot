# HashiBot Phase 5B — Account Truth Alignment

## Scanner freshness classification

The failing Runtime Supervisor reference was an **obsolete reference / incorrect field**. `scanner_config` owns enablement, not scanner-run freshness. Scanner-run evidence is recorded as operator runtime events. The supervisor now reads only `scanner_config.is_enabled` and uses the latest canonical scanner action in `operator_runtime_events`. A missing event or unavailable evidence query produces `scanner_status: UNKNOWN`, `scanner_freshness: NO EVIDENCE`, and a warning; it does not fail the supervisor.

No `last_run_at` or `last_scan_at` column was added to `scanner_config`. Cron configuration was not changed.

## Execution-account contract

`connected_execution_accounts` is the canonical identity source for Binance Testnet and Bybit Demo. Account creation may precede credential assignment, so `credential_ref` is nullable, but any assigned value must be an opaque Vault UUID. Plaintext credential material is rejected and never returned. Execution adoption always defaults to `false` and can only be changed with a separate update action.

Provider pages accept the canonical row UUID as `account_id` in the URL. They reject missing identities, cross-provider identities, and environment mismatches rather than selecting another account. All orders, position truth, and monitor heartbeat queries include provider, supported environment, and canonical provider account ID filters.

## Gate semantics

- **API reachable:** the provider credential route reached the provider API. This alone is not configuration.
- **Provider entry gate:** `execution_provider_controls.entry_enabled`; global provider permission only.
- **Canonical execution adoption:** `connected_execution_accounts.execution_enabled`; account-level order permission.
- **Effective permission:** provider entry gate AND canonical account exists AND account selectable AND execution adoption enabled AND opaque credentials assigned AND no kill switch AND no read-only guard.
- **Running:** effective permission plus current account-scoped runtime evidence. Global settings or another provider's heartbeat never establish this state.

Until an account exists, the UI reports `ACCOUNT NOT CONFIGURED`, `EXECUTION DISABLED`, and `WRITE OPERATIONS BLOCKED`, even when it reports `API CONNECTED` from system-secret reachability.

## Deployment and runtime validation

Apply `20260728010000_phase5b_execution_account_manager.sql`, deploy `admin-operator-action`, and deploy the frontend. Runtime certification was not possible from this repository environment because no deployed Supabase operator session or production endpoint credentials were available. After deployment, an authorized operator must run Full System Test, Runtime Supervisor, both Provider Monitor refreshes, Execution Fleet refresh, and inspect Binance Operations, Bybit Operations, and Execution Account Manager responses. Create the two canonical accounts through the manager with execution disabled.

No cron was enabled, no execution adoption was enabled, and no order was placed by this change.
