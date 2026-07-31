# HashiBot Architecture — Runtime Orchestrator

## Overview

The **Runtime Orchestrator** is the sole canonical coordinator of execution pipeline sequencing in HashiBot Phase 7. It replaces scattered runtime coordination across provider brains with one deterministic, side-effect free pipeline coordinator.

## Sequential Pipeline Flow

The Runtime Orchestrator sequences execution as follows:

```
Approved Signal
      │
      ▼
Execution Brain (Account Eligibility & Constraints)
      │
      ▼
Risk Engine (Risk Authorization & Approval)
      │
      ▼
Capital Manager (Quantity, Leverage & Margin Sizing)
      │
      ▼
Provider Validation (Bridge Terminal & Connection Health)
      │
      ▼
Provider Dispatch Intent (Immutable Dispatch Intent Payload)
      │
      ▼
Unified Trade Management (Protection & Lifecycle Plan)
      │
      ▼
Trade Truth Intent (Immutable Runtime Persistence Event)
      │
      ▼
Recovery (Routed on degraded state or unknown outcome)
```

## Immutable Contracts

The Runtime Orchestrator operates exclusively on immutable contracts:

1. `RuntimeCommand`: Represents a incoming orchestration command containing signal payload, provider, account ID, correlation ID, causation ID, idempotency key, and aggregate version.
2. `RuntimeEvent`: Immutable audit event emitted at every transition of the runtime state machine.
3. `RuntimePipelineContext`: Full runtime context containing account state, account policy, risk evaluation context, capital context, and previous idempotency keys.
4. `RuntimePipelineResult`: Pure, side-effect free result containing pipeline status, selected brain, execution decision, risk decision, capital plan, provider dispatch intent, trade truth intents, and recovery intents.

## Runtime State Machine

The Runtime Orchestrator is driven by a strict runtime state machine separate from the Trade Management lifecycle state machine:

- **Active States**: `RECEIVED`, `ACCOUNT_EVALUATED`, `RISK_APPROVED`, `CAPITAL_ALLOCATED`, `PROVIDER_VALIDATED`, `READY_FOR_DISPATCH`, `LIFECYCLE_INITIALIZED`
- **Terminal States**: `COMPLETED`, `SKIPPED`, `REJECTED`, `LOCKED`, `RECOVERY_REQUIRED`, `FAILED`

## Idempotency and Determinism

- Duplicate commands with previously processed `idempotency_key`s immediately return an idempotent `SKIPPED` result.
- Commands with stale `aggregate_version`s are safely rejected without side effects.
- Unknown provider bridge outcomes or execution exceptions are routed to Recovery (`RECOVERY_REQUIRED`) instead of executing blind retries.
- The Runtime Orchestrator is **100% side-effect free**: it emits intents (dispatch, trade truth, recovery) without directly writing to databases or invoking external provider APIs.
