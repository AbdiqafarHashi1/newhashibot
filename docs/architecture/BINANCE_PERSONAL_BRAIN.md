# HashiBot Recovery — Phase 4: Binance Personal Account Execution Brain Architecture

## Overview

The `BinancePersonalBrain` represents the production-grade Account Execution Brain for Binance USDT-margined Futures personal accounts. It adheres strictly to the Phase 1A contracts and single-owner architectural boundaries, acting as a side-effect-free decision engine that determines account eligibility, evaluates risk constraints, and validates provider parameters without placing orders or calling external APIs directly.

---

## Single-Owner Architectural Ownership Model

```
Approved Signal
      │
      ▼
Account Execution Brain (BinancePersonalBrain)
  ├─ Evaluates account eligibility & operational state (evaluateSignal)
  └─ Checks hard drawdown rules (checkAccountLock)
      │
      ▼
Risk Engine
  └─ Authorizes risk envelope & safety thresholds
      │
      ▼
Capital Manager (professional-capital-allocation.ts)
  └─ SOLE OWNER of financial position sizing, quantity, margin, notional & leverage math
      │
      ▼
Account Execution Brain (BinancePersonalBrain)
  ├─ Consumes Capital Manager PositionPlan
  └─ Validates exchange symbol filters (validatePositionPlan)
      │
      ▼
Provider Adapter (binance-testnet-execution / ExchangeProvider)
  └─ Submits exchange orders
```

### Responsibility Matrix Compliance

| Responsibility | Single-Owner Component | Canonical Location | Primary Output |
| :--- | :--- | :--- | :--- |
| **Signal Generation** | Market Scanner | `supabase/functions/market-scanner/` | `strategy_candidates` |
| **Signal Approval** | Arbitrator | `supabase/functions/_shared/arbitrator.ts` | `signals` (status = APPROVED) |
| **Execution Decision** | Account Execution Brain | `supabase/functions/_shared/account-execution-brain/` | `ExecutionDecision` |
| **Position Sizing** | Capital Manager | `supabase/functions/_shared/professional-capital-allocation.ts` | `PositionPlan` |
| **Risk Validation** | Risk Engine | `supabase/functions/_shared/professional-risk-engine.ts` | `AuthorizedEnvelope` |
| **Order Placement** | Provider Adapters | `binance-testnet-execution`, `bybit-demo-execution` | Exchange Order IDs & Fills |
| **Protection Verification**| Protection Engine | `supabase/functions/_shared/professional-protection-verification.ts` | Protection Verification Report |
| **Trade Lifecycle** | Trade Management Supervisors | `binance-testnet-monitor`, `bybit-testnet-monitor` | Trade Management Transitions |
| **Persistent State** | Trade Truth Unified | `supabase/functions/_shared/trade-truth/` | `trade_truth_unified` |

---

## Key Features & Constraints

### 1. Strict Provider Isolation
- **No MT5 Concepts**: Zero references to MT5 lots, broker terminals, forex contract sizes, bridge status, or prop challenge states.
- **Crypto-Native Constructs**: Native handling of USDT futures, step sizes, tick sizes, minimum notionals, isolated/cross margin, and 24/7 market sessions.

### 2. Independent Brain Architecture
- `BinancePersonalBrain` operates independently and does not import or invoke `Mt5PersonalBrain` or `Mt5PropBrain`.
- All brains implement the standardized `AccountExecutionBrain` interface.

### 3. Sizing Ownership Refactoring
- Sizing mathematics (lot/unit calculation, risk amount, margin, notional, leverage allocation) are exclusively owned by `calculateCapitalManagerPositionPlan` in `professional-capital-allocation.ts`.
- `BinancePersonalBrain.createPositionPlan()` delegates sizing calculation to the Capital Manager and returns an immutable, frozen `PositionPlan`.

---

## Decision Pipeline Sequence

```
1. Check Active Account Lock (checkAccountLock)
   ├── Daily Loss Limit Breach  ──> LOCK_ACCOUNT (LOCKED_DAILY_LOSS_BREACH)
   └── Max Drawdown Breach      ──> LOCK_ACCOUNT (LOCKED_MAX_DRAWDOWN_BREACH)

2. Provider Bridge & Connectivity Health
   └── Disconnected / Degraded  ──> SKIP (SKIPPED_PROVIDER_DEGRADED)

3. Market Session State
   └── Session Closed           ──> SKIP (SKIPPED_MARKET_CLOSED)

4. High-Impact News Window
   └── News Window Active       ──> SKIP (SKIPPED_NEWS_RESTRICTION)

5. Policy Symbol Eligibility
   └── Symbol Not Allowed       ──> SKIP (SKIPPED_LOW_CONFIDENCE)

6. Position Caps & Duplicates
   ├── Total Positions Cap      ──> SKIP (SKIPPED_MAX_POSITIONS_REACHED)
   └── Symbol Position Exists   ──> SKIP (SKIPPED_SYMBOL_POSITION_EXISTS)

7. Account Leverage & Free Margin
   ├── Leverage Exceeds Policy  ──> SKIP (SKIPPED_LOW_CONFIDENCE)
   └── Insufficient Margin      ──> SKIP (SKIPPED_LOW_CONFIDENCE)

8. Risk Scaling (Portfolio Cap & Drawdown Safety Buffer)
   ├── Portfolio Cap Exceeded   ──> REDUCE_RISK (REDUCED_PORTFOLIO_EXPOSURE_CAP)
   └── 75% Drawdown Threshold   ──> REDUCE_RISK (REDUCED_DRAWDOWN_SAFETY_BUFFER)

9. Final Authorization          ──> EXECUTE (APPROVED_FULL_RISK)
```

---

## Trade Management Plan Generation

For approved execution decisions (`EXECUTE` / `REDUCE_RISK`), `createTradeManagementPlan()` creates an immutable `TradeManagementPlan`:

- **TP1 Policy**: 50% exit, automated move-stop-to-breakeven on trigger, profit lock offset.
- **TP2 Policy**: 50% exit with trailing stop enabled.
- **Breakeven Policy**: Triggers at 1.0 R:R with 0.1% price buffer lock offset.
- **Trailing Policy**: `ATR_TRAILING` distance based on entry price percentage.
- **Timeout Policy**: Max holding 72 hours with market close action on timeout.

---

## Symbol Filter Validation (`validatePositionPlan`)

Validates a Capital Manager `PositionPlan` against exchange symbol filters without mutating financial values:

- `quantity_step` & `quantity_precision`
- `minimum_quantity` & `maximum_quantity`
- `minimum_notional` & `maximum_notional`
- `leverage_ceiling`
- `required_margin` vs `free_margin`

---

## Verification & Testing

The implementation is verified by deterministic unit test suites:

- `npm run test:binance-personal-brain`
- `npm run test:all-brains` (runs contract tests, MT5 personal, MT5 prop, and Binance personal suites)

Test coverage includes:
1. Normal signal execution (`EXECUTE` with full risk)
2. Daily drawdown breach -> `LOCK_ACCOUNT`
3. Total drawdown breach -> `LOCK_ACCOUNT`
4. Insufficient available margin -> `SKIP`
5. Duplicate position rule per symbol -> `SKIP`
6. Maximum total open positions cap -> `SKIP`
7. Leverage ceiling violation -> `SKIP`
8. Portfolio risk scaling -> `REDUCE_RISK`
9. Drawdown safety buffer scaling -> `REDUCE_RISK`
10. Symbol filter step size & precision validation
11. Degraded provider bridge -> `SKIP`
12. High-impact news restriction -> `SKIP`
13. Policy-driven behavior verification across distinct policies
14. Capital Manager single-owner sizing ownership verification
15. Singleton instance export & interface compliance
