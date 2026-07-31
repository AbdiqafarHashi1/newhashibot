# HashiBot MT5 Personal Account Execution Brain — Architecture Specification

**Document Version:** 1.0.0  
**Phase:** Phase 2 — MT5 Personal Account Execution Brain  
**Author:** HashiBot Core Engineering  
**Module Location:** `supabase/functions/_shared/account-execution-brain/mt5-personal-brain.ts`  
**Status:** Implemented & Verified  

---

## 1. Overview & Responsibilities

The `Mt5PersonalBrain` is a deterministic, side-effect-free Account Execution Brain engineered specifically for MT5 Personal growth trading accounts (Forex & Metals).

It implements the common `AccountExecutionBrain` interface from Phase 1A contracts and operates as an isolated decision layer that sits between signal approval and capital allocation/order routing.

### Core Responsibilities
- **Account Context Evaluation:** Evaluates real-time MT5 account balance, equity, free margin, leverage, current active positions, drawdown metrics, session state, and high-impact news windows.
- **Personal Policy Enforcement:** Enforces configurable rules (`AccountPolicy`), including maximum risk per trade, daily loss caps, total drawdown caps, leverage ceilings, max open positions, single-position-per-symbol caps, and allowed symbol lists.
- **Deterministic Decision Making:** Returns one of four deterministic decisions: `EXECUTE`, `SKIP`, `REDUCE_RISK`, or `LOCK_ACCOUNT`, complete with `decision_code` and structured evidence (`RuleViolation`).
- **Position Planning Integration:** Generates an immutable `PositionPlan` containing calculated lot quantities (0.01 lot step size), leverage, required margin, and contract size specifications for Forex (100,000) and Gold/Metals (100).
- **Trade Management Intentions:** Produces a `TradeManagementPlan` outlining lifecycle policies (TP1 partial exit, TP2 runner trailing, break-even lock offset, ATR trailing, and max holding timeout).
- **Account Lock Issuance:** Emits an immutable `AccountLock` object when daily drawdown (6.0% default) or total drawdown (20.0% default) limits are breached.

---

## 2. Decision Lifecycle Sequence

```
Approved Signal (from Arbitrator)
       │
       ▼
1. Load AccountExecutionContext (Balance, Equity, Positions, Drawdown, Health)
       │
       ▼
2. Check Account Lock (Daily Loss / Max Total Drawdown Breach)
       ├── [LOCK_ACCOUNT] ──> Issue AccountLock & Block All Future Signals
       │
       ▼
3. Evaluate Operational & Health Rules (Bridge Health, Session, High-Impact News)
       ├── [SKIP] ──────────> Log RuleViolations (e.g. SKIPPED_PROVIDER_DEGRADED / SKIPPED_NEWS_RESTRICTION)
       │
       ▼
4. Evaluate Symbol & Exposure Rules (Max Total Positions, Duplicate Symbol, Allowed List)
       ├── [SKIP] ──────────> Log RuleViolations (e.g. SKIPPED_MAX_POSITIONS_REACHED / SKIPPED_SYMBOL_POSITION_EXISTS)
       │
       ▼
5. Evaluate Leverage & Margin Limits (Leverage Ceiling, Free Margin Sufficiency)
       ├── [SKIP] ──────────> Log RuleViolations (e.g. Insufficient Free Margin)
       │
       ▼
6. Evaluate Risk Engine & Drawdown Safety Buffers (Portfolio Risk Cap & Drawdown Threshold)
       ├── [REDUCE_RISK] ───> Scale authorized_risk_pct (REDUCED_PORTFOLIO_EXPOSURE_CAP / REDUCED_DRAWDOWN_SAFETY_BUFFER)
       │
       ▼
7. Final Decision (EXECUTE / REDUCE_RISK)
       │
       ├──> Create PositionPlan (Sizing, Lots, Margin, Contract Size)
       └──> Create TradeManagementPlan (TP1, TP2, BE, Trailing, Timeout)
```

---

## 3. Ownership Matrix & Isolation Boundaries

`Mt5PersonalBrain` adheres strictly to HashiBot's Single-Owner Policy:

| Domain | Owner Component | Interaction with Mt5PersonalBrain |
| :--- | :--- | :--- |
| **Signal Generation & Scanning** | Market Scanner (`market-scanner/index.ts`) | `Mt5PersonalBrain` never scans or generates trading setups. |
| **Signal Approval** | Arbitrator (`_shared/arbitrator.ts`) | `Mt5PersonalBrain` receives only `APPROVED` signals. |
| **Execution Decision** | **Mt5PersonalBrain** | **Single Owner.** Computes execution decision & risk authorization. |
| **Position Sizing** | Capital Manager (`_shared/professional-capital-allocation.ts`) | `Mt5PersonalBrain` creates `PositionPlan` requests for Capital Manager without duplicating sizing logic. |
| **Risk Engine** | Risk Engine (`_shared/professional-risk-engine.ts`) | `Mt5PersonalBrain` verifies risk limits against Risk Engine envelopes. |
| **Order Placement** | MT5 Terminal Bridge (`mt5-bridge`) | `Mt5PersonalBrain` **never** calls broker APIs or sends terminal commands directly. |
| **Trade Lifecycle Execution** | Trade Supervisors (`mt5-bridge` / monitors) | `Mt5PersonalBrain` outputs management intentions (`TradeManagementPlan`) but does not execute order modifications. |

---

## 4. Component Interactions

### 4.1 Interaction with Risk Engine
`Mt5PersonalBrain` reads `AccountExecutionContext.risk_profile` and evaluates whether current open portfolio risk (`exposure.total_open_risk_pct`) plus requested trade risk exceeds `max_portfolio_risk_pct`. If open risk is near capacity, `Mt5PersonalBrain` reduces authorized risk percentage or returns `SKIP`.

### 4.2 Interaction with Capital Manager
`Mt5PersonalBrain.createPositionPlan` translates authorized risk percentage into exact MT5 contract-compliant parameters:
- **Contract Size:** 100,000 for Forex (e.g., EURUSD, GBPUSD), 100 for Gold (XAUUSD) / Silver (XAGUSD).
- **Lot Sizing Formula:** `Quantity = (Balance * AuthorizedRiskPct) / (SLDistance * ContractSize)`
- **Lot Step & Bounds:** Floors to 0.01 lot increments, constrained between 0.01 lot minimum and 100.0 lot maximum.
- **Required Margin:** `(Quantity * EntryPrice * ContractSize) / Min(AccountLeverage, PolicyMaxLeverage)`.

### 4.3 Interaction with Trade Management
`Mt5PersonalBrain.createTradeManagementPlan` specifies declarative lifecycle management rules:
- **TP1 Policy:** 50% position exit at TP1 R:R ratio, automatically triggering stop-loss shift to break-even + lock offset (e.g., +2 pips for Forex, +$0.20 for Gold).
- **TP2 Policy:** Remaining 50% exits at TP2 R:R ratio with trailing stop enabled.
- **Trailing Policy:** ATR-based trailing distance (1.5 pips / points).
- **Timeout Policy:** 48-hour maximum holding duration before market exit.

---

## 5. Future Google Cloud / Cloud Run Runtime Role

In upcoming migration phases:
- `Mt5PersonalBrain` can be deployed as a microservice endpoint inside Google Cloud Run or executed inside Edge Functions with zero code changes.
- Because `Mt5PersonalBrain` is purely deterministic and free of environment-specific dependencies (such as direct database calls or network sockets), it can be invoked concurrently across multiple account evaluation queues.
