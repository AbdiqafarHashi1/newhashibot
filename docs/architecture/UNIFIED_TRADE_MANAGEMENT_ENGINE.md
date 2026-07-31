# HashiBot Recovery — Phase 6: Unified Trade Management Engine Architecture

## Overview & Purpose

The **Unified Trade Management Engine** represents the single, production-grade, side-effect-free lifecycle decision engine for HashiBot across all supported providers:
- **MT5 Personal**
- **MT5 Prop (Evaluation & Funded)**
- **Binance Personal (USDT Futures)**
- **Bybit Personal (USDT Futures)**

It replaces individual provider-brain lifecycle logic with a single, deterministic state machine and policy-driven evaluation engine. It owns trade lifecycle decisions after position creation and execution authorization, emitting immutable `TradeManagementIntent` artifacts and `TradeLifecycleEvent` records without making network/API calls or directly altering database state.

---

## Single-Owner Architectural Ownership Model

```
Approved Signal
      │
      ▼
Account Execution Brain (MT5PersonalBrain / BinancePersonalBrain / BybitPersonalBrain)
  └─ Evaluates account eligibility & operational state (evaluateSignal)
      │
      ▼
Risk Engine
  └─ Authorizes risk envelope & safety thresholds
      │
      ▼
Capital Manager (professional-capital-allocation.ts)
  └─ SOLE OWNER of position sizing, quantity, margin & leverage math
      │
      ▼
Account Execution Brain
  └─ Validates exchange symbol filters & constraints (validatePositionPlan)
      │
      ▼
Provider Adapter / Executor
  └─ Places order on exchange or broker
      │
      ▼
Unified Trade Management Engine (evaluateLifecycle)
  ├─ SOLE OWNER of post-fill trade lifecycle decisions
  ├─ Enforces protection-first verification (verifyProtection)
  ├─ Emits immutable TradeManagementIntent & TradeLifecycleEvent
  └─ Derives updated TradeLifecycleSnapshot
      │
      ▼
Trade Truth Unified (trade-truth/index.ts)
  └─ SOLE PERSISTENCE OWNER of trade state & event audit logs
```

### Responsibility Matrix Compliance

| Stage / Component | Single-Owner Component | Primary Output |
| :--- | :--- | :--- |
| **Signal Generation** | Market Scanner & Strategies | `strategy_candidates` |
| **Signal Approval** | Arbitrator (`arbitrator.ts`) | `signals` (status = APPROVED) |
| **Execution Decision** | Account Execution Brain | `ExecutionDecision` |
| **Risk Authorization** | Risk Engine (`professional-risk-engine.ts`) | `AuthorizedEnvelope` |
| **Position Sizing** | Capital Manager (`professional-capital-allocation.ts`) | `PositionPlan` |
| **Order Placement** | Provider Adapters | Exchange/MT5 Order IDs & Fills |
| **Protection Verification**| Protection Engine (`professional-protection-verification.ts`) | `ProtectionVerification` |
| **Lifecycle Decisions** | **Unified Trade Management Engine** | `TradeManagementIntent` & `TradeLifecycleEvent` |
| **Persistent State** | Trade Truth Unified | `trade_management_truth` table |
| **Recovery Reconciliation**| Recovery Framework | Reconciliation Actions |

---

## Lifecycle State Machine

The engine implements an explicit 25-state deterministic state machine:

```
SIGNAL_CREATED
     │
     ▼
 QUALIFIED
     │
     ▼
POSITION_SIZED
     │
     ▼
ORDER_SUBMITTED
     │
     ▼
  FILLED
     │
     ▼
PROTECTION_PENDING ──(Failed/Missing)──> PROTECTION_FAILED ──> PROTECTION_REPAIR_PENDING
     │                                           │                           │
 (Verified)                                (Unrepairable)               (Repaired)
     │                                           │                           │
     ▼                                           ▼                           │
 PROTECTED <─────────────────────────────────────────────────────────────────┘
     │
     ├──> TP1_ELIGIBLE ──> TP1_EXECUTION_PENDING ──> TP1
     │                                                │
     ├──> BREAK_EVEN_PENDING ──> BREAK_EVEN <─────────┘
     │                             │
     ├──> TP2_ELIGIBLE ──> TP2_EXECUTION_PENDING ──> TP2 ──> RUNNER
     │                                                         │
     └──> CLOSE_PENDING / EXIT_PENDING / EMERGENCY_EXIT_PENDING │
                                   │                           │
                                   ▼                           ▼
                                CLOSED ───────────────────> ARCHIVED
```

---

## Flow Diagrams

### 1. Normal Lifecycle Flow

```
FILLED Position
      │
      ▼
[Engine] evaluateLifecycle()
      ├─ Emit VERIFY_PROTECTION Intent
      └─ State: PROTECTION_PENDING
            │
            ▼ (Protection Verified)
      State: PROTECTED
            │
            ▼ (Price reaches TP1)
      ├─ Emit PARTIAL_CLOSE Intent (TP1)
      └─ State: TP1
            │
            ▼ (Break-Even Triggered)
      ├─ Emit MOVE_STOP_TO_BREAK_EVEN Intent
      └─ State: BREAK_EVEN
            │
            ▼ (Price reaches TP2)
      ├─ Emit PARTIAL_CLOSE Intent (TP2)
      └─ State: TP2 / RUNNER
            │
            ▼ (Position Fully Closed)
      State: CLOSED ──> ARCHIVED
```

### 2. Protection Repair Flow

```
FILLED / PROTECTED Position
      │
      ▼
[Protection Engine] Returns MISSING or DEGRADED
      │
      ▼
[Engine] evaluateLifecycle()
      ├─ State: PROTECTION_FAILED
      ├─ Policy Check: protection_repair_policy.enabled === true
      └─ Emit REPAIR_PROTECTION Intent (State: PROTECTION_REPAIR_PENDING)
            │
      ┌─────┴─────────────────────────────┐
      │ (Repair Successful)               │ (Repair Failed/Max Attempts)
      ▼                                   ▼
State: PROTECTED                   Emit EMERGENCY_CLOSE or MARK_RECOVERY_REQUIRED
                                   State: EMERGENCY_EXIT_PENDING / RECOVERY_REQUIRED
```

### 3. Emergency Exit Flow

```
Active Managed Position
      │
      ├─ Account Hard Lock Active
      ├─ Unrepairable Protection Failure
      ├─ Maximum Holding Duration Timeout
      ├─ Mandatory Weekend Cutoff
      └─ High-Impact News Window (CLOSE_BEFORE_NEWS)
            │
            ▼
[Engine] evaluateLifecycle()
      ├─ Emit EMERGENCY_CLOSE or CLOSE_POSITION Intent
      ├─ State: EMERGENCY_EXIT_PENDING or CLOSE_PENDING
      └─ Reason Code recorded in Intent & Event
            │
            ▼
[Provider Adapter / Executor] Executes Market Exit
      │
      ▼
State: CLOSED
```

### 4. Provider Command Translation Boundary

```
TradeManagementIntent (Provider-Neutral)
      │
      ▼
[Provider Compatibility Adapter]
      │
      ├─ MT5 Adapter ──────> OrderSendAsync() / CTrade Request
      ├─ Binance Adapter ──> POST /fapi/v1/order (reduceOnly)
      └─ Bybit Adapter ────> POST /v5/order/create (reduceOnly)
      │
      ▼
Exchange / Broker Response
      │
      ▼
TradeLifecycleEvent ──> Trade Truth Persistence
```

---

## Core Principles & Guarantees

1. **Pure Determinism**: `evaluateLifecycle()` has zero side effects, no API calls, no database reads/writes, and no clock access. All context and timestamp values are passed explicitly.
2. **Immutable Artifacts**: `TradeManagementPolicy`, `TradeLifecycleSnapshot`, `TradeManagementIntent`, and `TradeLifecycleEvent` are strictly read-only and frozen (`Object.freeze`).
3. **Protection-First**: Positions in `FILLED` or `PROTECTION_PENDING` cannot enter TP or trailing management until protection is verified.
4. **Policy-Driven**: All thresholds (TP1/TP2 %, breakeven trigger/offset, trailing mode, timeout, news/weekend exits) are controlled by policy context.
5. **Idempotency & Versioning**: Every intent carries a deterministic idempotency key and expected position version check to prevent duplicate execution.
