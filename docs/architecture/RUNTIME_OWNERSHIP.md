# HashiBot Architecture — Engine Ownership Boundaries

## Absolute Single-Owner Boundaries

In HashiBot Phase 7, strict domain ownership boundaries govern the runtime architecture. No component may encroach on the domain logic owned by another component.

| Component / Engine | Strict Single Ownership Domain | Forbidden Behaviors |
| :--- | :--- | :--- |
| **Execution Brains** (`Mt5PersonalBrain`, `Mt5PropBrain`, `BinancePersonalBrain`, `BybitPersonalBrain`) | Account drawdown evaluation, provider-specific account rules, symbol eligibility, market session restrictions, lock detection. | Must NOT calculate position sizing, calculate lot size/notional, execute lifecycle management, write to Trade Truth, manage recovery, or orchestrate execution sequences. |
| **Risk Engine** (`ProfessionalRiskEngine`) | Risk policy resolution, strategy risk checks, portfolio exposure caps, risk authorization (`ACCEPT` / `REJECT` / `SCALE`). | Must NOT size positions directly or handle provider dispatch. |
| **Capital Manager** (`ProfessionalCapitalManager`) | Position quantity, leverage, lot size, expected notional, required margin, contract step rounding. | Must NOT evaluate account lock rules or manage trade lifecycles. |
| **Unified Trade Management** (`UnifiedTradeManagementEngine`) | Stop loss adjustments, take profit triggers, break-even lock offsets, trailing stops, protection verification, holding timeouts. | No provider brain may contain its own lifecycle algorithm or bypass trade management supervision. |
| **Trade Truth Engine** (`TradeTruth`) | Immutable runtime events, immutable lifecycle events, database projection contracts. | The Runtime Orchestrator and provider adapters only emit persistence intents. They NEVER write directly to the database. |
| **Recovery Engine** (`Recovery`) | Reconciliation, unknown provider outcomes, orphan position repair, protection repair, stale command clearance. | Unknown outcomes must always route to Recovery rather than performing blind retries. |
| **Runtime Orchestrator** (`RuntimeOrchestrator`) | Pipeline sequencing, component registry routing, runtime state machine transitions, intent creation. | Must NOT contain business logic for sizing, risk evaluation, account evaluation, or lifecycle supervision. |

## Explicit Component Registries

All components are referenced via explicit registries without dynamic discovery or provider fallback:

1. `ExecutionBrainRegistry`: Maps `BINANCE`, `BYBIT`, `MT5_PERSONAL`, `MT5_PROP` to their single-owner brain implementations.
2. `RiskEngineRegistry`: Single entry point for `evaluateRisk`.
3. `CapitalManagerRegistry`: Single entry point for `allocateCapital` and `calculateCapitalManagerPositionPlan`.
4. `TradeManagementRegistry`: Single entry point for `evaluateLifecycle` and trade management policies.
5. `RecoveryRegistry`: Single entry point for `createRecoveryRequest`.
