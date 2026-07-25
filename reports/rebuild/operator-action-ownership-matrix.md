# Command Center operator ownership

All buttons enter `admin-operator-action`, require an authenticated `profiles.role=admin`, create one `operator_runtime_events` receipt, and carry one action id. Provider credentials are resolved only inside the execution owner. Resolution is strictly: (1) explicitly selected connected account, (2) `connected_execution_accounts.is_operational` plus its existing Vault `credential_ref`, (3) existing backend-only Edge Function secrets, then (4) `no_execution_credentials:<provider>:<environment>`. An invalid explicit selection stops immediately and a customer account is never an implicit fallback.

The existing system-secret conventions are `BINANCE_TESTNET_API_KEY` + `BINANCE_TESTNET_API_SECRET`, and for Bybit `BYBIT_TESTNET_API_KEY` + `BYBIT_TESTNET_API_SECRET` with the already-supported `BYBIT_API_KEY` + `BYBIT_API_SECRET` fallback. `BYBIT_ENVIRONMENT`/`BYBIT_MODE` remains authoritative: `demo` uses `api-demo.bybit.com`; otherwise the active non-live value is `testnet`. Secret values are installed only in the async credential context and never serialized.

| Button | Frontend / backend action | Target | Provider / environment / account | Mode and expected writes | Gate | Canonical owner |
|---|---|---|---|---|---|---|
| Run Scanner | `run_scanner_now` | `scheduled-market-scanner` | shared Crypto + Forex adapters; no execution account | signal-only; scanner run and at most one signal truth | scanner lease/idempotency | shared market scanner + arbitrator |
| Run Monitor | `run_monitor_now` | `binance-testnet-monitor`, `bybit-testnet-monitor` | Binance/testnet and Bybit/demo operational accounts | reconciliation/health evidence only; separate results | account scope + monitor lease | provider monitors |
| Run Supervisor | `run_supervisor_now` | `runtime-health-supervisor` | all configured providers; no credential decryption | read-only heartbeat, lease, scanner and control inspection | admin | operator health supervisor |
| Runtime Proof | `run_runtime_proof` | `binance-testnet-execution`, `bybit-demo-execution` | one explicit operational account per provider/environment | strictly read-only wallet, positions, orders and protection inspection | operational account + Vault resolver | shared crypto execution core through provider-specific targets |
| Reconcile | `reconcile_runtime` | `binance-testnet-execution:sync_all_positions_now` | scoped operational accounts | safe truth reconciliation writes; never entries/orders | scope + ownership constraints | crypto truth reconciler |
| Resume Bot | `resume_bot` | `execution-runtime-controls` | optionally explicit provider | entry/intent controls only; monitoring remains active | confirmation + certification mode | execution controls |
| Pause Entries | `pause_entries` | `execution-runtime-controls` | both or explicit provider | disables entries and intent consumption; preserves scanner, protection, monitors and MT5 | admin | execution controls |
| Verify Protection | `verify_protection` | provider proof targets | Binance/testnet and/or Bybit/demo operational account | read-only classification: protected/partial/unsafe/closed/unknown | account scope | provider proof reader |
| Run Recovery | `run_recovery_now` | `binance-testnet-execution:repair_all_protection_now` | explicit provider or both operational scopes | recognized protection repairs only; never entry/MT5 command | confirmation + action id | protection recovery owner |
| Sync Providers | `sync_providers` | `binance-testnet-execution:sync_all_positions_now` | both operational scopes | account metadata/truth sync; no orders/strategy/cron | scope + ownership constraints | crypto truth reconciler |
| Emergency Stop Runtime | `emergency_stop_runtime` | `execution-runtime-controls` | both or explicit provider | blocks entries/intents; event write; leaves protection, monitoring, reconciliation and MT5 active | exact confirmation + admin | execution controls |

Additional buttons in the root admin surfaces use the same gateway: provider-specific monitor cycles, Telegram test, news brain, scanner/supervisor/Telegram/news/auto-repair pause controls, refresh/retry controls, and position/protection/recovery page actions. They remain explicitly enumerated; unsupported labels return `ACTION_NOT_WIRED` rather than silently fanning out.

## Root causes repaired

1. Proof calls reached provider clients without the `AsyncLocalStorage` credential context, although credentials already lived behind the connected-account/Vault resolver.
2. Both proof branches named `binance-testnet-execution`, making the Bybit receipt factually wrong.
3. Several Mission Control labels were wired to different actions: Monitor called Supervisor, Verify called Repair, Pause Entries paused the scanner, and Emergency Stop fired two unawaited requests.
4. High-risk controls had no confirmation contract and HTTP transport success was over-trusted.
