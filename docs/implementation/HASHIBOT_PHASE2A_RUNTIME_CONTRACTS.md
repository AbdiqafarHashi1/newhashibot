# HashiBot Phase 2A Runtime Contracts

Status: implementation contract consolidation  
Date: 2026-07-14  
Scope: canonical shared runtime contracts, compatibility adapters, validation helpers, and legacy usage inventory  
Non-scope: runtime service refactors, strategy changes, risk calculation changes, database migrations, production SQL, deployment, cron changes, and Edge Function invocation

---

## 1. Canonical contracts

The shared runtime contract library lives in `src/lib/runtimeContracts/` and is the single frontend/shared TypeScript dependency for runtime vocabulary.

Created files:

- `src/lib/runtimeContracts/types.ts` — canonical statuses, identities, side semantics, and runtime status contract interfaces.
- `src/lib/runtimeContracts/validation.ts` — runtime type guards and status contract validation.
- `src/lib/runtimeContracts/compatibility.ts` — Phase 2A legacy adapters and deprecated aliases.
- `src/lib/runtimeContracts/index.ts` — public export barrel.

The library is intentionally business-logic free. It defines vocabulary only, so later phases can refactor execution, monitoring, protection, reporting, trade truth, recovery, Telegram, and provider adapters without redefining contracts.

---

## 2. Status definitions

### Trade lifecycle

Canonical type: `TradeLifecycleState`

Allowed values:

```text
signal_created
qualified
position_sized
order_submitted
order_accepted
filled
protection_pending
protection_verified
tp1
break_even
tp2
closed
archived
```

Owner: `TradeTruthService` in future Phase 2 service refactors.

### Execution status

Canonical type: `ExecutionStatus`

Allowed values:

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

Owner: `ExecutionService` in future Phase 2 service refactors.

Forbidden in execution status:

- protection statuses such as `protected_native`, `pending_protection`, `protection_failed`
- monitoring statuses such as `monitor_synced`
- recovery statuses such as `repair_succeeded`
- reporting/Telegram statuses
- outcome shorthand such as `closed_tp2`, `closed_sl`, `closed_profit_lock`

### Protection status

Canonical type: `ProtectionStatus`

Allowed values:

```text
not_required
pending
verified
missing_sl
missing_tp
missing_sl_tp
partially_protected
repair_requested
repairing
failed
unknown
```

Owner: `ProtectionService` in future Phase 2 service refactors.

### Monitoring status

Canonical type: `MonitoringStatus`

Allowed values:

```text
unchecked
in_sync
drift_detected
repair_requested
stale
failed
```

Owner: `RuntimeMonitor` in future Phase 2 service refactors.

### Recovery status

Canonical type: `RecoveryStatus`

Allowed values:

```text
none
requested
in_progress
succeeded
failed
manual_required
```

Owner: `RecoveryService` in future Phase 2 service refactors.

### Reporting status

Canonical type: `ReportingStatus`

Allowed values:

```text
not_published
queued
published
suppressed
failed
```

Owner: `ReportingPipeline` in future Phase 2 service refactors.

---

## 3. Identity definitions

Canonical runtime identity fields:

| Field | Type | Meaning |
|---|---|---|
| `trade_id` | `TradeId` | HashiBot canonical runtime trade identity |
| `signal_id` | `SignalId` | Source signal identity; not runtime truth identity |
| `execution_order_id` | `ExecutionOrderId` | HashiBot execution order identity |
| `provider_order_id` | `ProviderOrderId` | External provider order reference |
| `provider_position_id` | `ProviderPositionId` | External provider position reference where available |
| `environment_id` | `EnvironmentId` | Runtime environment identity |
| `provider_id` | `ProviderId` | Provider identity |
| `account_id` | `AccountId` | HashiBot/provider account connector identity |

Canonical known providers:

```text
binance
binance_testnet
bybit
bybit_testnet
mt5
mt5_personal
mt5_prop
```

Canonical known environments:

```text
demo
testnet
paper
live
staging
development
```

The known provider/environment lists are intentionally open for compatibility with existing string-based provider and environment values. Validation helpers distinguish known values, while type aliases still allow branded strings to avoid breaking existing code.

---

## 4. Side semantics

Phase 2A standardizes three separate concepts:

| Concept | Canonical type | Allowed values | Meaning |
|---|---|---|---|
| Position side | `PositionSide` | `long`, `short` | Runtime trade exposure direction |
| Signal direction | `SignalDirection` | `buy`, `sell` | Scanner/signal intent direction |
| Exchange order side | `ExchangeOrderSide` | `BUY`, `SELL` | Provider order side |

Compatibility helpers:

- `toPositionSide(value)` converts legacy `buy`/`sell`/`long`/`short` to `long`/`short`.
- `toSignalDirection(value)` converts legacy `long`/`short`/`buy`/`sell` to `buy`/`sell`.
- `toExchangeOrderSide(value)` converts legacy case variants to `BUY`/`SELL`.
- `positionSideFromSignalDirection(direction)` maps `buy -> long`, `sell -> short`.
- `signalDirectionFromPositionSide(side)` maps `long -> buy`, `short -> sell`.
- `closeExchangeOrderSideForPosition(side)` maps `long -> SELL`, `short -> BUY` for reduce-only exits.

No current runtime behavior was changed. Existing modules can import these adapters while they are migrated away from ambiguous `direction` and `side` fields.

---

## 5. Compatibility layer

The compatibility layer exists to prevent a compile/runtime break while old modules still use legacy strings.

Deprecated aliases:

- `LegacyDirection`
- `LegacyExecutionStatus`
- `LegacyProtectionStatus`

Legacy normalization helpers:

- `normalizeExecutionStatus(value)` maps known legacy execution/status-overloaded strings into canonical `ExecutionStatus` values.
- `normalizeProtectionStatus(value)` maps known legacy protection strings into canonical `ProtectionStatus` values.

Examples:

| Legacy value | Canonical target |
|---|---|
| `entry_submitted` | `submitted` execution status |
| `entry_filled` | `filled` execution status |
| `entry_timeout_cancelled` | `cancelled` execution status |
| `pending_protection` | `pending` protection status |
| `protected_native` | `verified` protection status |
| `protection_failed` | `failed` protection status |

Compatibility aliases were connected to existing shared code in Phase 2A without changing behavior:

- `src/lib/types.ts` now imports `SignalDirection` for signal direction typing.
- `src/lib/binanceTestnetMonitor.ts` now aliases monitor `Direction` to canonical `SignalDirection`.
- `src/lib/exchange/exchangeProvider.ts` now aliases provider side/provider identity to canonical contract types.

---

## 6. Files using legacy contracts

This is an inventory only. These files were not rewritten in Phase 2A except for compatibility connections listed above.

### Files still using `direction`

- `src/lib/binanceTestnetMonitor.ts`
- `src/lib/binanceTruthExecution.ts`
- `src/lib/exchange/CanonicalApprovedSignal.ts`
- `src/lib/exchange/CryptoCertification.ts`
- `src/lib/exchange/ExchangeProviderBinance.ts`
- `src/lib/exchange/ExecutionSupervisor.ts`
- `src/lib/exchange/tradeManagementCore.ts`
- `src/lib/hashibotBackend.ts`
- `src/lib/prop/propRulesEngine.ts`
- `src/lib/prop/signalCompetition.ts`
- `src/lib/supabase.ts`
- `src/lib/types.ts`
- `src/pages/admin/BacktestLab.tsx`
- `src/pages/admin/Candidates.tsx`
- `src/pages/admin/ManualSignal.tsx`
- `src/pages/admin/OutcomeTracking.tsx`
- `src/pages/admin/Performance.tsx`
- `src/pages/admin/PropTradingPanel.tsx`
- `src/pages/admin/ProviderComparison.tsx`
- `src/pages/admin/ProviderOperationsWorkspace.tsx`
- `src/pages/admin/RejectedSetups.tsx`
- `src/pages/admin/SignalsManager.tsx`
- `src/pages/admin/TradingBrain.tsx`
- `src/pages/admin/operator/OperatorPanel.tsx`
- `src/pages/app/ActiveSignals.tsx`
- `src/pages/app/Dashboard.tsx`
- `src/pages/app/SignalDetail.tsx`
- `src/pages/app/SignalHistory.tsx`
- `src/pages/public/SignalMode.tsx`
- `supabase/functions/_shared/intelligence-engine.ts`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/functions/bybit-testnet-monitor/index.ts`
- `supabase/functions/evaluate-signal-outcomes/index.ts`
- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/telegram-send/index.ts`

### Files still using ambiguous `side`

- `src/lib/binanceTestnetMonitor.ts`
- `src/lib/binanceTruthExecution.ts`
- `src/lib/exchange/CryptoCertification.ts`
- `src/lib/exchange/ExchangeProviderBinance.ts`
- `src/lib/exchange/ExchangeProviderBybit.ts`
- `src/lib/exchange/ExchangeProviderMT5.ts`
- `src/lib/exchange/ExecutionSupervisor.ts`
- `src/lib/exchange/ProtectionEngine.ts`
- `src/lib/exchange/exchangeProvider.ts`
- `src/lib/exchange/tradeManagementCore.ts`
- `src/lib/operatorRuntime.ts`
- `src/lib/supabase.ts`
- `src/lib/types.ts`
- `src/pages/admin/BacktestLab.tsx`
- `src/pages/admin/Performance.tsx`
- `src/pages/admin/ProviderOperationsWorkspace.tsx`
- `src/pages/admin/SchedulerGuide.tsx`
- `src/pages/admin/StrategyConfig.tsx`
- `src/pages/admin/TelegramTest.tsx`
- `src/pages/admin/operator/OperatorPanel.tsx`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/functions/bybit-testnet-monitor/index.ts`
- `supabase/functions/market-scanner/index.ts`
- `supabase/functions/mt5-bridge/index.ts`

### Files still using legacy runtime statuses

- `src/lib/binanceTestnetMonitor.ts`
- `src/lib/binanceTruthExecution.ts`
- `src/lib/edgeFunctionStatus.ts`
- `src/lib/exchange/CryptoCertification.ts`
- `src/lib/exchange/ExchangeProviderBinance.ts`
- `src/lib/exchange/ExchangeProviderBybit.ts`
- `src/lib/exchange/ProtectionEngine.ts`
- `src/lib/exchange/RecoveryEngine.ts`
- `src/lib/exchange/tradeManagementCore.ts`
- `src/lib/monitorTruth.ts`
- `src/lib/supabase.ts`
- `src/lib/types.ts`
- `src/pages/admin/Performance.tsx`
- `src/pages/admin/PropTradingPanel.tsx`
- `src/pages/admin/ProviderOperationsWorkspace.tsx`
- `src/pages/admin/operator/OperatorPanel.tsx`
- `supabase/functions/admin-scheduler-action/index.ts`
- `supabase/functions/binance-testnet-execution/index.ts`
- `supabase/functions/binance-testnet-monitor/index.ts`
- `supabase/functions/bybit-testnet-monitor/index.ts`
- `supabase/functions/telegram-test/index.ts`

---

## 7. Migration notes

Phase 2A avoids breaking changes. Later phases should migrate in this order:

1. Replace duplicated literal unions with imports from `src/lib/runtimeContracts`.
2. Rename ambiguous runtime fields in new code to `position_side`, `signal_direction`, and `exchange_order_side`.
3. Replace direct legacy status comparisons with compatibility normalizers.
4. Update `execution_orders` consumers to use execution-only statuses.
5. Update `trade_management_truth` consumers to use separated status dimensions.
6. Move provider adapters to `ProviderId`, `EnvironmentId`, `PositionSide`, and `ExchangeOrderSide` types.
7. Remove deprecated compatibility aliases after all legacy usage is migrated.

No database migrations were added in Phase 2A.

---

## 8. Validation rules

Runtime validation helpers prevent:

- invalid execution status
- invalid trade lifecycle state
- invalid protection status
- invalid monitoring status
- invalid recovery status
- invalid reporting status
- invalid position side
- invalid signal direction
- invalid exchange order side
- NULL or empty runtime status in `validateRuntimeStatusContract`

Provider and environment validation currently supports known-value checks through `isKnownProviderId` and `isKnownEnvironmentId`. The open `ProviderId` and `EnvironmentId` types are retained for compatibility until all provider/environment values are inventoried.

---

## 9. Remaining implementation work

- Replace direct legacy status literals in execution, monitor, protection, recovery, reporting, Telegram, and admin UI files.
- Introduce canonical `TradeTruthService` and route all truth writes through it.
- Introduce canonical `ExecutionService` and migrate `execution_orders` writes to execution-only statuses.
- Convert monitor/supervisor modules to the single `RuntimeMonitor` contract.
- Replace ambiguous persisted `direction`/`side` usage where schema migrations are approved.
- Add contract-level unit tests once a general test runner is available or expand the existing TypeScript test scripts.
- Add database constraints only in a later migration phase after compatibility read models are in place.
