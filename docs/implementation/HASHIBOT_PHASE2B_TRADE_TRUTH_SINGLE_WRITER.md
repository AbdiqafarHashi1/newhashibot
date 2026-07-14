# HashiBot Phase 2B Trade Truth Single-Writer Implementation

Status: implementation  
Date: 2026-07-14  
Scope: canonical application-level TradeTruthService, validation, compatibility mapping, repository abstraction, focused tests, and writer migration proof  
Non-scope: production SQL, database migrations, deployment, Edge Function invocation, cron changes, strategy logic, risk logic, signal qualification, customer packages, page redesigns

---

## 1. Canonical TradeTruthRecord

`TradeTruthRecord` is defined in `src/lib/runtime/tradeTruth/types.ts` and uses Phase 2A canonical contracts for:

- `trade_lifecycle_state`
- `execution_status`
- `protection_status`
- `monitoring_status`
- `recovery_status`
- `reporting_status`
- `position_side`
- `signal_direction`
- `exchange_order_side`
- `provider_id`
- `environment_id`
- `account_id`
- `trade_id`

The model rejects missing required identity, NULL canonical statuses, malformed side/direction, side/direction mismatch, and protection states being used as execution status.

---

## 2. TradeTruthService API

The canonical service lives in `src/lib/runtime/tradeTruth/TradeTruthService.ts`.

Public methods:

| Method | Purpose |
|---|---|
| `createTradeTruth` | Create canonical truth from validated identity/status/side fields |
| `recordQualified` | Advance signal-created truth to qualified |
| `recordPositionSized` | Advance qualified truth to position sized |
| `recordOrderSubmitted` | Advance to order submitted and set execution status `submitted` |
| `recordOrderAccepted` | Advance to order accepted and set execution status `accepted` |
| `recordFill` | Advance to filled and set execution status `filled` |
| `recordProtectionPending` | Advance to protection pending and set protection status `pending` |
| `recordProtectionVerified` | Advance to protection verified and set protection status `verified` |
| `recordTp1` | Advance to TP1 |
| `recordBreakEven` | Advance to break even |
| `recordTp2` | Advance to TP2 |
| `recordClosed` | Advance to closed and preserve close reason/timestamp |
| `recordArchived` | Advance to archived and preserve archive reason |
| `recordMonitorObservation` | Record monitoring status without lifecycle invention |
| `recordRecoveryStatus` | Record recovery status only |
| `recordReportingStatus` | Record reporting status only |

No unrestricted public update method is exposed.

---

## 3. Repository abstraction

`TradeTruthRepository` isolates persistence from lifecycle validation.

Supported repository methods:

- `getByTradeId`
- `getActiveByProviderAccountSymbol`
- `create`
- `updateWithVersion`
- `upsertCompatibilityRecord`
- `appendAuditEvent`

`InMemoryTradeTruthRepository` is included for focused service tests and local validation. It implements optimistic version checks with the in-memory `version` field. No production schema changes were made.

---

## 4. Transition rules

Implemented lifecycle transition table:

| Current | Allowed next states |
|---|---|
| `signal_created` | `signal_created`, `qualified` |
| `qualified` | `qualified`, `position_sized` |
| `position_sized` | `position_sized`, `order_submitted` |
| `order_submitted` | `order_submitted`, `order_accepted` |
| `order_accepted` | `order_accepted`, `filled` |
| `filled` | `filled`, `protection_pending`, `closed` |
| `protection_pending` | `protection_pending`, `protection_verified`, `closed` |
| `protection_verified` | `protection_verified`, `tp1`, `tp2`, `closed` |
| `tp1` | `tp1`, `break_even`, `tp2`, `closed` |
| `break_even` | `break_even`, `tp2`, `closed` |
| `tp2` | `tp2`, `closed` |
| `closed` | `closed`, `archived` |
| `archived` | `archived` |

Explicitly rejected examples:

- archived back to active
- closed back to filled
- protection verified before filled/protection pending
- TP1 before protection verified
- break even before TP1
- TP2 before fill/protection
- protection state written as execution status

---

## 5. Idempotency model

Every mutation accepts an optional `idempotency_key`. If omitted, the service derives a stable key from `trade_id:event_type`.

Covered events:

- order submitted
- fill
- protection verified
- TP1
- break even
- TP2
- close
- archive
- monitor observation
- recovery status

Phase 2B stores idempotency in the service instance to prove the contract without requiring a database migration. Later database work should persist idempotency keys in an audit/event table with uniqueness on `trade_id + event_type + idempotency_key`.

---

## 6. Error classification

Structured errors include:

- `code`
- `message`
- `retryable`
- `trade_id`
- `current_state`
- `attempted_state`
- `writer`
- `details`

Non-retryable contract failures:

- NULL required status
- invalid runtime status
- invalid lifecycle transition
- protection status as execution status
- side/direction mismatch
- missing provider/environment/account identity
- malformed legacy truth
- immutable identity mutation

Repository failures are retryable only when the message indicates timeout, connection, network, or temporary dependency failure.

---

## 7. Legacy compatibility mapping

`mapLegacyTradeTruthRow` maps existing `trade_management_truth`-shaped rows and payloads to `TradeTruthRecord`.

Handled legacy fields:

- `status`
- `protection_status`
- `monitor_status`
- `monitoring_status`
- `recovery_status`
- `reporting_status`
- `side`
- `direction`
- `provider`
- `environment`
- `symbol`
- `entry_price`
- `sl_price` / `stop_loss`
- `tp1_price` / `tp1`
- `tp2_price` / `tp2`
- `signal_id`
- `execution_order_id`
- `entry_order_id`
- provider position/order references

The mapper does not silently repair NULL legacy status. NULL status is classified as `unrecoverable_malformed_truth` with a non-retryable `missing_runtime_status` error.

---

## 8. Writers migrated

| Source file | Previous write method | New write method | Migrated now? | Reason | Risk |
|---|---|---|---|---|---|
| `src/lib/exchange/tradeManagementCore.ts` | Direct `store.upsertTradeTruth(row)` from sync, repair, recovery, and profit-lock helpers | `upsertTradeTruthThroughCompatibility(store, row)` validates through `mapLegacyTradeTruthRow` before preserving existing store write | Yes | Shared app-level writer with bounded compatibility validation | Low: preserves existing store write after validation |
| `src/lib/exchange/ProtectionEngine.ts` | Direct `this.store.upsertTradeTruth(updatedRow/escalationRow)` | `upsertTradeTruthThroughCompatibility(this.store, row)` | Yes | Straightforward application-level protection writer | Low/medium: malformed rows now fail as non-retryable contract errors |
| `src/lib/exchange/RecoveryEngine.ts` | Direct `this.store.upsertTradeTruth(escalatedRow/updatedRow)` | `upsertTradeTruthThroughCompatibility(this.store, row)` | Yes | Straightforward application-level recovery writer | Low/medium: malformed rows now fail as non-retryable contract errors |

---

## 9. Writers still direct

| Source file | Previous write method | New write method | Migrated now or deferred | Reason | Risk |
|---|---|---|---|---|---|
| `supabase/functions/binance-testnet-execution/index.ts` | Multiple `rpc("upsert_trade_management_truth")`, direct `from("trade_management_truth").upsert`, direct `update` | Deferred | Deferred | Large Edge Function with exchange execution behavior; risky full rewrite in Phase 2B | High |
| `supabase/functions/binance-testnet-monitor/index.ts` | Multiple `rpc("upsert_trade_management_truth")` calls | Deferred | Deferred | Edge monitor runtime path needs Edge-compatible adapter in Phase 2C/2D | High |
| `supabase/functions/bybit-testnet-monitor/index.ts` | `rpc("upsert_trade_management_truth")` calls | Deferred | Deferred | Provider-specific Edge monitor; needs adapter parity after Binance proof | High |
| `src/lib/exchange/CryptoCertification.ts` | Test/certification mock `store.upsertTradeTruth` calls | Deferred | Deferred | Certification harness/mocks; no production table write by itself | Low |
| `src/lib/edgeFunctionStatus.ts` | Mock in-memory `supabase.tables['trade_management_truth']` mutation | Deferred | Deferred | Mock fallback utility, not canonical runtime service | Low |
| `src/lib/operatorTruth.ts` | Read-only `trade_management_truth` query | Not a writer | N/A | Consumer only | Low |
| `src/lib/supabase.ts` | Mock table seed data | Deferred | Deferred | Local/mock Supabase shim data, not production writer | Low |

---

## 10. Why deferred writers were not changed

Supabase Edge Functions contain exchange execution and monitor behavior. Phase 2B intentionally avoids risky behavior changes to execution, provider calls, and Edge runtime paths. Those writers need an Edge-compatible single-writer adapter and provider-by-provider proof in Phase 2C/2D.

---

## 11. Required later database migration

Later database work should add or verify:

- non-null canonical status columns
- canonical `trade_id`, `provider_id`, `environment_id`, `account_id`
- separated execution/protection/monitoring/recovery/reporting statuses
- version column for optimistic concurrency
- audit/event table
- idempotency unique constraint on `trade_id + event_type + idempotency_key`
- compatibility read model for old `provider/environment/symbol/side` identity

No migration was written in Phase 2B.

---

## 12. Rollback instructions

Rollback is repository-only:

1. Revert the Phase 2B commit.
2. Remove `test:trade-truth` from `package.json` if reverting manually.
3. Remove `src/lib/runtime/tradeTruth/`.
4. Restore direct `store.upsertTradeTruth` calls in `tradeManagementCore`, `ProtectionEngine`, and `RecoveryEngine` if reverting manually.
5. Remove this report and `tests/runtime/tradeTruthService.test.ts`.

No database, cron, environment, or deployment rollback is required because none were changed.

---

## 13. Phase 2C dependencies

- Build an Edge Function-compatible Trade Truth adapter.
- Migrate Binance Edge execution writes behind the adapter.
- Migrate Binance monitor writes behind the adapter.
- Migrate Bybit monitor writes behind the adapter.
- Add persistent audit/idempotency storage after database migration approval.
- Add SQL constraints only after compatibility proof.

---

## TypeScript baseline comparison

Repository-wide typecheck had pre-existing failures before Phase 2B. Baseline and post-change comparison both reported 34 `src/...` error lines, and the diff between baseline and post-change error lines was empty. Phase 2B introduced no additional repository-wide typecheck errors.
