# HashiBot Phase 1 Runtime Consolidation Blueprint

Status: architecture only  
Date: 2026-07-13  
Scope: runtime ownership, contracts, pages, auth, monitoring, reporting, and certification gates  
Non-scope: migrations, production changes, SQL execution, Edge Function invocation, cron changes, environment changes, trading strategy changes, and risk calculation changes

---

## 1 Executive Summary

Phase 1 consolidates HashiBot runtime ownership into a deterministic architecture where every responsibility has one canonical owner and all other modules are consumers. The core architectural decision is:

> `trade_management_truth` is the single runtime truth, but it must not be directly written by scanners, executors, monitors, pages, Telegram components, or ad hoc recovery paths. Every write must pass through one canonical Trade Truth service.

The future runtime is organized around canonical modules:

1. `ScannerRuntime`
2. `SignalArbitrator`
3. `SignalLifecycleService`
4. `PositionSizingService`
5. `ExecutionService`
6. `ProtectionService`
7. `TradeTruthService`
8. `RuntimeMonitor`
9. `RecoveryService`
10. `OutcomeEvaluationService`
11. `ReportingPipeline`
12. `TelegramPipeline`
13. `HeartbeatService`
14. `SchedulerOrchestrator`
15. `RuntimeProofService`

The most important consolidation rule is that provider-specific functions may adapt provider APIs, but they may not own lifecycle state. Lifecycle ownership belongs to canonical services only.

---

## 2 Current Architecture Problems

### 2.1 Duplicate runtime ownership

Current repository structure shows overlapping ownership across Edge Functions, frontend libraries, admin pages, and migrations:

- Scanner ownership appears in `market-scanner`, `scheduled-market-scanner`, admin scanner pages, and live admin polling.
- Execution ownership appears in `binance-testnet-execution`, exchange provider libraries, execution router/supervisor modules, and admin execution pages.
- Monitoring ownership appears in `binance-testnet-monitor`, `bybit-testnet-monitor`, `RuntimeSupervisor`, `ExecutionSupervisor`, `HashiSupervisor`, provider monitors, and operations pages.
- Telegram ownership appears in `telegram-orchestrator`, `telegram-send`, shared `telegram-router`, Telegram admin pages, and scanner outcome delivery paths.
- Runtime truth ownership appears in `tradeManagement`, `tradeManagementCore`, `runtimeTruth`, monitor truth utilities, operator truth utilities, and direct table access.

### 2.2 `trade_management_truth` writer inconsistency

The current migration describes `trade_management_truth.status` as mirroring `execution_orders.status`, which couples runtime truth to execution order status and makes lifecycle drift likely. Direct upsert RPC language also says it is called by monitors, meaning monitors are currently treated as truth writers rather than verifiers.

### 2.3 `execution_orders.status` contract drift

Current monitor logic uses execution order status for entry, protection, partial close, closure, timeout, recovery, and outcome semantics. Examples include statuses such as `entry_filled`, `pending_protection`, `protected_native`, `protected_managed`, `partially_closed`, `closed_tp2`, `closed_sl`, `closed_profit_lock`, `closed_expired`, `entry_missing_no_position`, and `entry_timeout_cancelled`. This overload makes it impossible to know whether a status describes broker execution, protection state, monitoring state, or trade outcome.

### 2.4 `side` vs `direction` inconsistency

Current code and data use multiple concepts:

- Signal-style direction: `BUY` / `SELL` or `buy` / `sell`
- Position side: `long` / `short`
- Exchange order side: `BUY` / `SELL`
- Truth table migration field: `direction`
- Mock/runtime rows that use `side`

Phase 1 standardizes these meanings and prohibits cross-use.

### 2.5 Admin pages perform heavy runtime reads

The live admin state hook performs many parallel data loads and also calls the `market-scanner` Edge Function for runtime configuration debug data. Pages should not invoke operational runtime paths merely by opening.

### 2.6 Auth degradation can look like logout or role downgrade

The current auth flow stores `lastKnownProfile`, but temporary profile fetch failures can still surface as missing profile behavior, and explicit session invalidation is not cleanly separated from transient profile failure. Phase 1 requires an auth session state machine.

---

## 3 Future Runtime Architecture

### 3.1 Architectural principles

1. One owner per runtime responsibility.
2. Provider adapters are stateless translators, not lifecycle owners.
3. `trade_management_truth` is written only by `TradeTruthService`.
4. `execution_orders` represents execution lifecycle only.
5. Monitoring verifies and requests repair; it does not invent trade lifecycle states.
6. Telegram, dashboard, reporting, and admin pages are consumers of canonical truth.
7. Pages never perform runtime work on mount.
8. Scheduler triggers canonical jobs only; it does not contain business logic.
9. Heartbeats are runtime proof, not operational authority.
10. All state transitions are idempotent and auditable.

### 3.2 Future runtime modules

| Module | Purpose | Allowed writes | Forbidden writes |
|---|---|---|---|
| `ScannerRuntime` | Fetch market data and create raw candidates | scanner runs, candidate records | execution orders, trade truth, Telegram delivery |
| `SignalArbitrator` | Choose eligible candidate/signals | arbitration decisions | execution orders, trade truth |
| `SignalLifecycleService` | Advance signal lifecycle through approved/qualified states | signal lifecycle fields and audit | execution/protection truth |
| `PositionSizingService` | Compute position size from existing strategy/risk inputs | sizing proof fields | strategy logic, risk formulas |
| `ExecutionService` | Submit/cancel execution orders through provider adapters | `execution_orders` execution fields | protection lifecycle, monitoring lifecycle |
| `ProtectionService` | Place and verify SL/TP intent with provider adapters | protection status via `TradeTruthService` | execution order lifecycle status |
| `TradeTruthService` | Sole writer of `trade_management_truth` | `trade_management_truth`, truth audit | provider API calls directly |
| `RuntimeMonitor` | Verify exchange/order/position/protection/truth consistency | monitor observations, repair requests | direct lifecycle inventions |
| `RecoveryService` | Execute approved repairs requested by monitor | recovery status via `TradeTruthService`, repair audit | scanner/execution initial submission |
| `OutcomeEvaluationService` | Evaluate TP/SL/close outcomes after truth confirms closure | outcome records, reporting events | execution/protection writes |
| `ReportingPipeline` | Produce dashboard/provider/customer/reporting read models | reporting read models | trade truth source fields |
| `TelegramPipeline` | Route and dedupe Telegram messages | Telegram delivery/audit tables | trade lifecycle truth |
| `HeartbeatService` | Emit module liveness and freshness proof | heartbeat tables | lifecycle data |
| `SchedulerOrchestrator` | Trigger canonical jobs by schedule | scheduler run/audit proof | business state transitions |
| `RuntimeProofService` | Certification and consistency checks | proof/check result tables | runtime state transitions |

---

## 4 Runtime Ownership Matrix

| Responsibility | Future canonical owner | Consumers only | Duplicate owners to remove later |
|---|---|---|---|
| Scanner | `ScannerRuntime` | Admin scanner pages, reports | `scheduled-market-scanner` business logic, scanner admin page actions |
| Arbitrator | `SignalArbitrator` | Scanner, signal manager | ad hoc candidate approval paths |
| Signal lifecycle | `SignalLifecycleService` | Dashboard, Telegram, reports | pages or scanner paths that directly set signal statuses |
| Execution | `ExecutionService` | Monitor, reports, admin execution page | provider monitors, supervisors, operation pages |
| Position synchronization | `RuntimeMonitor` | Execution service, reports | provider-specific monitor functions as independent owners |
| Protection | `ProtectionService` | Monitor, Recovery, reports | execution status strings, provider supervisors |
| Recovery | `RecoveryService` | Monitor, admin proof pages | monitor functions that directly repair and own lifecycle |
| Runtime truth | `TradeTruthService` | all modules | direct writes/upserts from monitors, UI libraries, mock handlers |
| Reporting | `ReportingPipeline` | dashboard, provider pages, Telegram | page-local aggregation and provider-specific reporting logic |
| Telegram | `TelegramPipeline` | scanner, outcomes, admin Telegram pages | scanner direct send, outcome direct send, test pages as runtime senders |
| Outcome evaluation | `OutcomeEvaluationService` | reports, Telegram | scanner outcome updates, monitor outcome classification |
| Heartbeats | `HeartbeatService` | admin pages, proof service | per-module bespoke heartbeat fields |
| Scheduler | `SchedulerOrchestrator` | admin scheduler page | pg_cron jobs embedding business behavior |
| Monitoring | `RuntimeMonitor` | admin provider pages, recovery | Binance monitor, Bybit monitor, supervisors as separate owners |

Duplicate ownership count identified for Phase 1 planning: **14 responsibility areas currently have or risk duplicate ownership**.

---

## 5 Runtime State Machine

### 5.1 Canonical trade lifecycle

Every trade must follow this exact lifecycle:

```text
Signal Created
  -> Qualified
  -> Position Sized
  -> Order Submitted
  -> Order Accepted
  -> Filled
  -> Protection Pending
  -> Protection Verified
  -> TP1
  -> Break Even
  -> TP2
  -> Closed
  -> Archived
```

### 5.2 Transition owners

| Transition | Owner | Notes |
|---|---|---|
| Signal Created | `ScannerRuntime` or manual signal intake through `SignalLifecycleService` | Raw signal creation only |
| Qualified | `SignalArbitrator` | Must record qualification proof |
| Position Sized | `PositionSizingService` | Must preserve sizing inputs and output |
| Order Submitted | `ExecutionService` | Provider request created |
| Order Accepted | `ExecutionService` | Provider acknowledged order |
| Filled | `ExecutionService` confirmed by `RuntimeMonitor` | Fill must include provider execution identity |
| Protection Pending | `ProtectionService` | SL/TP placement intent exists |
| Protection Verified | `ProtectionService` confirmed by `RuntimeMonitor` | SL/TP presence verified |
| TP1 | `RuntimeMonitor` observes, `TradeTruthService` records | Partial close only, not execution status overload |
| Break Even | `ProtectionService` owns protection transition | May be represented in protection status, not execution status |
| TP2 | `RuntimeMonitor` observes, `TradeTruthService` records | Outcome pending until close confirmed |
| Closed | `RuntimeMonitor` confirms no remaining position exposure | Closure reason recorded separately |
| Archived | `OutcomeEvaluationService` | Immutable reporting state |

### 5.3 No invented lifecycle states

No component may add new lifecycle states unless all are true:

1. The state cannot be represented as execution/protection/monitoring/reporting status.
2. The state has a canonical owner.
3. The transition is idempotent.
4. The transition is documented in this blueprint or a future architecture decision record.
5. Certification checks are updated.

### 5.4 Separate status dimensions

| Dimension | Field family | Owner | Examples |
|---|---|---|---|
| Trade lifecycle | `trade_lifecycle_state` | `TradeTruthService` | `Filled`, `Protection Verified`, `Closed` |
| Execution status | `execution_status` | `ExecutionService` | `created`, `submitted`, `accepted`, `partially_filled`, `filled`, `cancelled`, `rejected`, `expired` |
| Protection status | `protection_status` | `ProtectionService` | `not_required`, `pending`, `verified`, `missing_sl`, `missing_tp`, `repair_requested`, `repairing`, `failed` |
| Monitoring status | `monitoring_status` | `RuntimeMonitor` | `unchecked`, `in_sync`, `drift_detected`, `repair_requested`, `stale` |
| Recovery status | `recovery_status` | `RecoveryService` | `none`, `requested`, `in_progress`, `succeeded`, `failed`, `manual_required` |
| Reporting status | `reporting_status` | `ReportingPipeline` | `not_published`, `queued`, `published`, `suppressed`, `failed` |

`execution_orders.status` must not contain protection, monitoring, recovery, or outcome lifecycle names.

---

## 6 Trade Truth Contract

### 6.1 Canonical table role

`trade_management_truth` is the single runtime truth for active and recently closed trades. It is not a reporting table and not an execution-order table. It records the canonical trade state and cross-provider truth snapshot required for runtime decisions.

### 6.2 Sole writer

Only `TradeTruthService` may write `trade_management_truth`. All other modules must call service methods such as:

- `createTradeTruthFromQualifiedSignal`
- `recordPositionSized`
- `recordOrderSubmitted`
- `recordOrderAccepted`
- `recordFill`
- `recordProtectionPending`
- `recordProtectionVerified`
- `recordTp1`
- `recordBreakEven`
- `recordTp2`
- `recordClosed`
- `recordArchived`
- `recordMonitorObservation`
- `recordRecoveryStatus`

### 6.3 Unique identity

Canonical unique identity must be:

```text
environment_id + provider_id + account_id + trade_id
```

Where:

- `trade_id` is HashiBot canonical trade UUID.
- `signal_id` is source signal lineage, not runtime identity.
- `execution_order_id` is execution lineage, not runtime identity.
- Provider order IDs are external references only.

### 6.4 Required fields

Future required fields:

| Field | Meaning |
|---|---|
| `trade_id` | Canonical HashiBot trade UUID |
| `signal_id` | Source signal UUID |
| `environment_id` | `demo`, `testnet`, `paper`, `live`, or named environment |
| `provider_id` | `binance`, `bybit`, `mt5_personal`, `mt5_prop`, etc. |
| `account_id` | Canonical HashiBot account or connector identity |
| `symbol` | Canonical symbol |
| `market_type` | `crypto`, `forex`, etc. |
| `position_side` | `long` or `short` only |
| `trade_lifecycle_state` | Canonical lifecycle state |
| `execution_status` | Execution dimension status |
| `protection_status` | Protection dimension status |
| `monitoring_status` | Monitoring dimension status |
| `recovery_status` | Recovery dimension status |
| `reporting_status` | Reporting dimension status |
| `quantity_initial` | Initial filled quantity or intended quantity before fill |
| `quantity_remaining` | Remaining open quantity |
| `entry_price_intended` | Intended entry |
| `entry_price_filled` | Average filled entry, nullable until filled |
| `sl_price_intended` | Intended stop loss |
| `tp1_price_intended` | Intended first target |
| `tp2_price_intended` | Intended second target |
| `created_at` | Creation timestamp |
| `updated_at` | Last truth update |
| `latest_sync_at` | Last monitor/provider reconciliation timestamp |
| `version` | Optimistic concurrency version |

### 6.5 Optional fields

Optional fields should include provider and lifecycle details without becoming owners:

- `provider_position_id`
- `provider_entry_order_id`
- `provider_sl_order_id`
- `provider_tp1_order_id`
- `provider_tp2_order_id`
- `provider_raw_snapshot`
- `sizing_proof_id`
- `arbitration_proof_id`
- `monitor_run_id`
- `last_monitor_observation_id`
- `last_recovery_action_id`
- `closed_at`
- `close_reason`
- `archive_reason`
- `last_error_code`
- `last_error_message`

### 6.6 Side usage

Canonical usage:

| Concept | Field | Values | Used by |
|---|---|---|---|
| Trade position side | `position_side` | `long`, `short` | truth, dashboards, reports |
| Signal direction | `signal_direction` | `buy`, `sell` | signal lifecycle only |
| Exchange order side | `exchange_order_side` | provider-native `BUY`, `SELL`, etc. | execution/protection adapters only |

Do not use `direction` in trade truth. Do not store exchange order side as trade side.

### 6.7 Current writers to remove later

Current or likely writer paths that should become consumers or service callers in Phase 2:

- Direct monitor RPC/upsert calls into `trade_management_truth`.
- Mock action handlers that mutate `trade_management_truth` for admin actions.
- Provider-specific monitors that update protection/runtime fields directly.
- Exchange provider/supervisor modules that write trade state.
- Admin/operator utilities that fetch and mutate truth outside the service.
- Any page action that writes execution, protection, recovery, or trade lifecycle fields directly.

---

## 7 Execution Orders Contract

### 7.1 Table role

`execution_orders` represents execution lifecycle only. It records provider order request/acknowledgement/fill/cancel/reject/expire data. It does not represent protection verification, trade monitoring, recovery, Telegram delivery, or outcome reporting.

### 7.2 Future required fields

| Field | Meaning |
|---|---|
| `execution_order_id` | HashiBot execution order UUID |
| `trade_id` | Canonical trade UUID |
| `signal_id` | Source signal UUID |
| `environment_id` | Runtime environment |
| `provider_id` | Execution provider |
| `account_id` | Provider account/connector identity |
| `order_role` | `entry`, `exit`, `stop_loss`, `take_profit_1`, `take_profit_2`, `break_even_stop`, `repair_exit` |
| `execution_status` | Execution-only status |
| `symbol` | Canonical symbol |
| `exchange_order_side` | Provider order side |
| `order_type` | Provider/order type |
| `quantity_requested` | Requested quantity |
| `quantity_accepted` | Accepted quantity if different |
| `quantity_filled` | Filled quantity |
| `price_requested` | Limit/trigger/market reference price if applicable |
| `price_average_filled` | Average fill price |
| `provider_order_id` | Provider order reference |
| `provider_status` | Raw provider status |
| `submitted_at` | Submission timestamp |
| `accepted_at` | Acceptance timestamp |
| `filled_at` | Full fill timestamp |
| `cancelled_at` | Cancellation timestamp |
| `rejected_at` | Rejection timestamp |
| `expired_at` | Expiry timestamp |
| `last_provider_sync_at` | Last provider reconciliation |
| `idempotency_key` | Deduplication key |

### 7.3 Allowed execution statuses

Execution status values:

```text
created
submitted
accepted
partially_filled
filled
cancel_requested
cancelled
rejected
expired
failed
unknown_provider_state
```

Forbidden in `execution_orders.status` or `execution_status`:

- `protected_native`
- `protected_managed`
- `pending_protection`
- `protection_failed`
- `partially_closed` as trade lifecycle shorthand
- `closed_tp2`
- `closed_sl`
- `closed_profit_lock`
- `repair_succeeded`
- `monitor_synced`
- Telegram/reporting statuses

### 7.4 Separated contracts

| Lifecycle | Canonical location | Owner |
|---|---|---|
| Execution | `execution_orders` | `ExecutionService` |
| Protection | `trade_management_truth.protection_status` plus protection audit/read model | `ProtectionService` |
| Monitoring | monitor observations and `trade_management_truth.monitoring_status` | `RuntimeMonitor` via `TradeTruthService` |
| Recovery | recovery audit and `trade_management_truth.recovery_status` | `RecoveryService` via `TradeTruthService` |
| Reporting | reporting events/read models | `ReportingPipeline` |

---

## 8 Monitoring Architecture

### 8.1 One monitor only

`RuntimeMonitor` is the only monitor. Provider-specific monitor functions become adapters or scheduled entrypoints that call the same canonical monitor engine.

### 8.2 Verification duties

For every active trade, the monitor verifies:

1. Exchange entry order state.
2. Exchange position state.
3. Stop-loss existence, side, quantity, and trigger/price.
4. Take-profit existence, side, quantity, and trigger/price.
5. Trade truth consistency.
6. Execution order consistency.
7. Provider identity and account identity consistency.
8. Orphan exchange position/order detection.
9. Stale truth detection.
10. Repair necessity.

### 8.3 Repair model

The monitor may not directly repair unless executing through `RecoveryService`. Flow:

```text
RuntimeMonitor observes drift
  -> records monitor observation
  -> requests repair from RecoveryService
  -> RecoveryService executes idempotent repair through provider adapter
  -> TradeTruthService records recovery status and updated truth
  -> RuntimeMonitor verifies repair result in next cycle
```

### 8.4 No overlapping supervisors

`RuntimeSupervisor`, `ExecutionSupervisor`, `HashiSupervisor`, provider monitor modules, and admin monitor buttons must collapse behind `RuntimeMonitor`. UI may request a monitor run, but ownership remains with `RuntimeMonitor` and the scheduler/action layer.

---

## 9 Reporting Architecture

### 9.1 One reporting pipeline

`ReportingPipeline` is the only reporting owner. It reads from canonical truth and execution contracts and publishes provider-neutral read models.

### 9.2 Supported outputs

| Output | Source |
|---|---|
| Binance report | trade truth + execution orders + provider snapshots |
| Bybit report | trade truth + execution orders + provider snapshots |
| MT5 report | trade truth + execution orders + connector snapshots |
| Telegram | reporting event stream consumed by `TelegramPipeline` |
| Dashboard | reporting read models, not raw operational tables |

### 9.3 Reporting rules

- Reports never write lifecycle truth.
- Reports use immutable event history where possible.
- Telegram receives deduped reporting events, not raw monitor/execution callbacks.
- Dashboard reads cached reporting views/read models for fast loads.

---

## 10 Auth Architecture

### 10.1 Requirements

- No logout on temporary timeout.
- No role downgrade on temporary profile failure.
- No duplicate profile fetch.
- No duplicate auth listener.
- Last known admin profile preserved safely.
- Transient failures retry.
- Only explicit logout or confirmed invalid session ends authentication.

### 10.2 Future auth state machine

```text
Unknown
  -> SessionChecking
  -> AuthenticatedProfileFresh
  -> AuthenticatedProfileStale
  -> AuthenticatedProfileRetrying
  -> AuthenticatedProfileInvalid
  -> LoggedOutExplicit
  -> LoggedOutInvalidSession
```

### 10.3 Canonical ownership

`AuthSessionService` owns session and profile state. React context becomes a consumer/presenter of this service.

### 10.4 Rules

1. One `onAuthStateChange` listener at app root.
2. One profile fetch pipeline with dedupe by `user_id + session_access_token_hash`.
3. Profile timeout marks profile as stale, not logged out.
4. Previous admin role remains usable if the same user has a previously verified admin profile and session remains valid.
5. Confirm invalid session through Supabase auth error semantics before ending authentication.
6. Explicit logout immediately clears session and profile.
7. Profile retries use bounded exponential backoff and preserve last-known profile until confirmed invalid.

---

## 11 Admin Page Architecture

### 11.1 Page principles

1. Opening a page must not trigger scanner, execution, monitor, Telegram, recovery, cron, or provider side effects.
2. Pages load read models first, raw diagnostics only on explicit expand/action.
3. Duplicate polling is prohibited; use shared read model subscriptions or one admin data provider.
4. Provider requests are backend-owned and cached; pages never call provider APIs directly.
5. Admin action buttons enqueue canonical service commands; they do not implement runtime logic.

### 11.2 Current admin page audit and recommendations

| Page/route | Recommendation | Reason |
|---|---|---|
| `/admin/operator/*` | Keep as primary command center; split data panes into lazy tabs | Operator panel should be the single admin shell, not duplicate all pages eagerly |
| `/admin/control-room` | Merge into `/admin/operator` | Duplicate command-center responsibility |
| `/admin/scanner` | Keep read-only scanner health | Must not invoke scanner by opening |
| `/admin/scanner-config` | Keep config-only | Separate config from runtime status |
| `/admin/providers` | Merge into Provider Operations overview | Duplicate provider health with provider-specific pages |
| `/admin/providers/binance` | Redesign as provider read model page | No direct monitor/execution ownership |
| `/admin/providers/bybit` | Redesign as provider read model page | Same as Binance |
| `/admin/providers/mt5-personal` | Merge into provider detail pattern | Avoid separate operational runtime owner |
| `/admin/providers/mt5-prop` | Merge into provider detail pattern | Avoid provider-specific admin logic drift |
| `/admin/provider-comparison` | Keep as reporting page | Reads ReportingPipeline only |
| `/admin/execution` | Redesign around `execution_orders` execution-only contract | Must not show protection as execution status |
| `/admin/trading-brain` | Merge runtime ownership sections into operator proof | Avoid separate intelligence/runtime owner |
| `/admin/candidates` | Keep scanner/arbitration read page | No execution writes |
| `/admin/signals` | Keep signal lifecycle management | No execution/protection direct writes |
| `/admin/signals/new` | Keep manual intake only | Must route through SignalLifecycleService |
| `/admin/outcomes` | Keep outcome/reporting page | Reads OutcomeEvaluationService output |
| `/admin/performance` | Keep reporting page | Use reporting read model |
| `/admin/telegram`, `/admin/telegram-test`, `/admin/telegram-links`, `/admin/telegram-requests` | Merge into Telegram workspace with tabs | Duplicate Telegram loads/actions |
| `/admin/scheduler` | Keep scheduler proof/config page | No cron enable/disable by opening |
| `/admin/checklist` | Keep certification checklist | Reads RuntimeProofService |
| `/admin/audit` | Keep audit log page | Read-only |
| `/admin/users`, `/admin/customers`, `/admin/access-requests` | Merge customer access workspace | Duplicate customer/admin access loads |
| `/admin/prop` | Keep business config/reporting only | No runtime execution ownership |
| `/admin/backtest`, `/admin/backtest-lab` | Merge | Duplicate backtest routes |
| `/admin/retention` | Keep data retention page | Non-runtime operational config only |
| `/admin/handoff` | Keep documentation/status page | Read-only |
| `/admin/modes`, `/admin/strategy-config` | Keep config-only | Must not change strategy logic during Phase 1 |

### 11.3 Duplicate data loads to eliminate

- Scanner runs loaded by multiple scanner/operator/scheduler pages.
- Provider status loaded by provider health, provider operations, comparison, and operator pages.
- Telegram deliveries loaded by operator live state and Telegram pages.
- Signal counts loaded by dashboard, scanner, signals, and operator panels.
- Runtime config fetched by invoking scanner debug endpoint from page-level hooks.

### 11.4 Future admin read model

Create one admin read model family for Phase 2:

- `admin_runtime_overview_read_model`
- `admin_provider_health_read_model`
- `admin_trade_truth_read_model`
- `admin_execution_orders_read_model`
- `admin_telegram_read_model`
- `admin_scheduler_proof_read_model`
- `admin_certification_read_model`

---

## 12 Customer Page Architecture

### 12.1 Principles

1. Customer pages read from reporting and entitlement read models only.
2. Customer pages never query provider status, execution internals, or runtime proof tables directly.
3. Active signals and signal detail pages should not trigger runtime transitions.
4. Telegram setup is onboarding/config only.
5. Account and package pages are customer/account ownership only.

### 12.2 Current customer page recommendations

| Page | Responsibility | Recommendation |
|---|---|---|
| `/app/dashboard` | Customer summary | Read customer dashboard read model only |
| `/app/signals` | Active/available signals | Read signal/reporting read model only |
| `/app/signals/:id` | Signal detail | No execution/protection runtime mutation |
| `/app/telegram` | Telegram onboarding | No direct delivery sending except explicit test routed through TelegramPipeline |
| `/app/package-request` | Package request | Customer access workflow only |
| `/app/watchlist` | Customer preferences | No scanner ownership |
| `/app/account` | Account profile | No runtime ownership |

---

## 13 Module Dependency Diagram

```text
SchedulerOrchestrator
  -> ScannerRuntime
  -> RuntimeMonitor
  -> OutcomeEvaluationService
  -> ReportingPipeline
  -> HeartbeatService
  -> RuntimeProofService

ScannerRuntime
  -> SignalArbitrator
  -> SignalLifecycleService

SignalArbitrator
  -> SignalLifecycleService
  -> PositionSizingService

PositionSizingService
  -> ExecutionService

ExecutionService
  -> ProviderAdapter(Binance|Bybit|MT5)
  -> TradeTruthService
  -> ProtectionService

ProtectionService
  -> ProviderAdapter(Binance|Bybit|MT5)
  -> TradeTruthService

RuntimeMonitor
  -> ProviderAdapter(Binance|Bybit|MT5)
  -> TradeTruthService
  -> RecoveryService

RecoveryService
  -> ProviderAdapter(Binance|Bybit|MT5)
  -> TradeTruthService

OutcomeEvaluationService
  -> TradeTruthService(read)
  -> ReportingPipeline

ReportingPipeline
  -> TelegramPipeline
  -> DashboardReadModels

AdminPages / CustomerPages
  -> ReadModels only
  -> Command API for explicit actions only
```

Dependency rule: no module may depend on an admin/customer page, and provider adapters may not call lifecycle owners except through defined service interfaces.

---

## 14 Runtime Data Flow

### 14.1 Normal trade flow

```text
1. SchedulerOrchestrator triggers ScannerRuntime.
2. ScannerRuntime writes scanner run and candidate data.
3. SignalArbitrator qualifies one canonical signal.
4. SignalLifecycleService records Signal Created -> Qualified.
5. PositionSizingService records Position Sized proof.
6. ExecutionService submits entry order and writes execution order lifecycle.
7. TradeTruthService records Order Submitted and Order Accepted.
8. ExecutionService records fill after provider confirmation.
9. TradeTruthService records Filled.
10. ProtectionService places SL/TP and records Protection Pending.
11. RuntimeMonitor verifies SL/TP and position.
12. TradeTruthService records Protection Verified.
13. RuntimeMonitor observes TP1, BE, TP2, or close events.
14. TradeTruthService records canonical lifecycle progress.
15. OutcomeEvaluationService archives completed trade.
16. ReportingPipeline updates read models.
17. TelegramPipeline sends deduped events.
18. RuntimeProofService validates certification rules.
```

### 14.2 Drift/repair flow

```text
RuntimeMonitor detects drift
  -> monitor observation persisted
  -> TradeTruthService marks monitoring_status = drift_detected
  -> RecoveryService receives idempotent repair request
  -> provider adapter performs repair
  -> TradeTruthService records recovery_status
  -> RuntimeMonitor verifies repair outcome
  -> ReportingPipeline and TelegramPipeline consume final event
```

---

## 15 Certification Checklist

HashiBot cannot enter production until all of these pass.

### 15.1 Ownership certification

- [ ] Every runtime responsibility has exactly one owner.
- [ ] No provider adapter writes lifecycle truth directly.
- [ ] No admin/customer page performs runtime work on mount.
- [ ] No duplicate monitor/supervisor loops are active.
- [ ] Scheduler triggers canonical services only.

### 15.2 Trade truth certification

- [ ] Every active trade has exactly one `trade_management_truth` row per `environment_id + provider_id + account_id + trade_id`.
- [ ] No conflicting runtime truth rows exist.
- [ ] No NULL canonical lifecycle status.
- [ ] No side/direction mismatch.
- [ ] All truth writes are through `TradeTruthService`.
- [ ] `trade_management_truth` does not mirror `execution_orders.status`.

### 15.3 Execution certification

- [ ] No duplicate execution for the same idempotency key.
- [ ] `execution_orders` contains execution statuses only.
- [ ] No protection status is stored as execution status.
- [ ] No monitoring/recovery/outcome status is stored as execution status.
- [ ] Provider order IDs are mapped to exactly one execution order where required.

### 15.4 Protection and monitoring certification

- [ ] No orphan positions.
- [ ] No missing SL after Protection Verified.
- [ ] No missing TP after Protection Verified.
- [ ] Monitor verifies exchange order, exchange position, SL, TP, trade truth, and execution truth.
- [ ] Repair requests are idempotent.
- [ ] Monitor storms cannot occur.

### 15.5 Telegram/reporting certification

- [ ] No duplicate Telegram delivery for one canonical event.
- [ ] Telegram reads from one reporting/event pipeline.
- [ ] Binance, Bybit, MT5, Dashboard, and Telegram reports read from one truth.
- [ ] Reporting does not mutate lifecycle truth.

### 15.6 Page performance certification

- [ ] No heavy page loads.
- [ ] No infinite loading.
- [ ] No duplicate polling for the same data family.
- [ ] No page invokes runtime/provider endpoints on mount for operational work.
- [ ] Admin pages use read models or cached query bundles.

### 15.7 Auth certification

- [ ] No unexpected logout on profile timeout.
- [ ] No role downgrade on transient profile failure.
- [ ] One auth listener only.
- [ ] Profile fetch deduped.
- [ ] Last known admin profile preserved safely.
- [ ] Only explicit logout or confirmed invalid session ends authentication.

---

## 16 Phase 2 Implementation Order

1. Freeze current runtime writers and produce a writer inventory.
2. Introduce canonical enums/types for trade lifecycle, execution status, protection status, monitoring status, recovery status, and reporting status.
3. Create `TradeTruthService` interface and tests without changing live writers.
4. Create execution-order contract tests proving execution-only statuses.
5. Add read-only compatibility layer from current fields to future contract.
6. Refactor provider monitor code to use `RuntimeMonitor` engine behind existing entrypoints.
7. Refactor execution paths to route through `ExecutionService` and `TradeTruthService`.
8. Refactor protection paths to route through `ProtectionService` and `TradeTruthService`.
9. Move recovery behavior into `RecoveryService` and remove direct monitor repair writes.
10. Build reporting read models and route dashboard/Telegram through them.
11. Redesign admin page data loading around shared read models and lazy tabs.
12. Implement auth session state machine and profile fetch dedupe.
13. Add certification checks and fail production readiness if any check fails.
14. Remove deprecated duplicate writers and supervisors.
15. Only after certification, prepare migrations and deployment plan.

---

## Appendix A: Proposed canonical owners

| Domain | Canonical owner |
|---|---|
| Scanner | `ScannerRuntime` |
| Arbitrator | `SignalArbitrator` |
| Signal lifecycle | `SignalLifecycleService` |
| Execution | `ExecutionService` |
| Protection | `ProtectionService` |
| Recovery | `RecoveryService` |
| Monitoring | `RuntimeMonitor` |
| Reporting | `ReportingPipeline` |
| Telegram | `TelegramPipeline` |
| Outcome evaluation | `OutcomeEvaluationService` |
| Runtime proof | `RuntimeProofService` |
| Heartbeats | `HeartbeatService` |
| Scheduler | `SchedulerOrchestrator` |
| Trade truth | `TradeTruthService` |

## Appendix B: Critical contracts requiring unification

1. Trade lifecycle state contract.
2. `trade_management_truth` single-writer contract.
3. `execution_orders` execution-only status contract.
4. `position_side` / `signal_direction` / `exchange_order_side` naming contract.
5. Provider/account/environment identity contract.
6. Monitoring observation and repair request contract.
7. Telegram/reporting event idempotency contract.
8. Auth session/profile state contract.
9. Admin read model contract.

## Appendix C: Highest-risk architectural issue

The highest-risk architectural issue is **state ownership drift between monitors, execution orders, and trade truth**. If monitors, provider supervisors, execution functions, and pages can each write runtime truth or lifecycle statuses, HashiBot can produce duplicate execution, missing protection, duplicate Telegram notifications, and contradictory dashboards even when each component appears locally correct.
