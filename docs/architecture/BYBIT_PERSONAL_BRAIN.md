# HashiBot Recovery — Phase 5: Bybit Personal Account Execution Brain Architecture

## Overview

The `BybitPersonalBrain` represents the production-grade Account Execution Brain for Bybit USDT-margined Futures personal accounts. It adheres strictly to the Phase 1A contracts and single-owner architectural boundaries, acting as a side-effect-free, deterministic decision engine that determines account eligibility, evaluates risk constraints, and validates provider exchange parameters without placing orders or invoking external APIs directly.

---

## Single-Owner Architectural Ownership Model

```
Approved Signal
      │
      ▼
Account Execution Brain (BybitPersonalBrain)
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
Account Execution Brain (BybitPersonalBrain)
  ├─ Consumes Capital Manager PositionPlan
  └─ Validates exchange symbol filters (validatePositionPlan)
      │
      ▼
Provider Adapter (bybit-demo-execution / ExchangeProviderBybit)
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

## Key Features & Architectural Principles

### 1. Provider Isolation & Neutrality
- **No MT5 Concepts**: Zero references to MT5 lots, broker terminals, forex contract sizes, bridge terminals, or prop challenge states.
- **No Binance Specifics**: Free of Binance-specific leverage bracket definitions or filter names.
- **Bybit-Native Crypto Constructs**: Full native support for Bybit USDT perpetual futures, quantity step sizes, price tick sizes, minimum/maximum notionals, isolated/cross margin modes, maintenance margin safety buffers, and reduce-only position checks.
- **Provider-Neutral Terminology**: Connection status and error messages use provider-neutral language ("Bybit exchange connectivity status is...").

### 2. Independent Brain Architecture
- `BybitPersonalBrain` operates as a fully isolated component and does not import or invoke `BinancePersonalBrain`, `Mt5PersonalBrain`, or `Mt5PropBrain`.
- Implements the standardized `AccountExecutionBrain` interface (`brain-interface.ts`).

### 3. Sizing Ownership Boundary
- Sizing mathematics (unit calculation, risk amount, margin, notional, leverage allocation) are exclusively owned by `calculateCapitalManagerPositionPlan` in `professional-capital-allocation.ts`.
- `BybitPersonalBrain.createPositionPlan()` delegates sizing calculations to the Capital Manager and returns an immutable, frozen `PositionPlan`.

### 4. Deterministic Decimal Precision Validation
- `validatePositionPlan()` utilizes deterministic decimal-safe modulo checks (`checkStepAlignment`) to validate exchange quantity step sizes and price tick sizes without floating-point precision glitches.

---

## Decision Pipeline Sequence

```
1. Check Active Account Lock (checkAccountLock)
   ├── Daily Loss Limit Breach  ──> LOCK_ACCOUNT (LOCKED_DAILY_LOSS_BREACH)
   └── Max Drawdown Breach      ──> LOCK_ACCOUNT (LOCKED_MAX_DRAWDOWN_BREACH)

2. Operational State & Account Status
   └── Account Disabled         ──> SKIP (SKIPPED_LOW_CONFIDENCE)

3. Provider Connectivity & Maintenance Mode
   ├── Exchange Disconnected    ──> SKIP (SKIPPED_PROVIDER_DEGRADED)
   └── API Maintenance Mode     ──> SKIP (SKIPPED_PROVIDER_DEGRADED)

4. API Authentication & Futures Permissions
   ├── API Auth Failure         ──> SKIP (SKIPPED_LOW_CONFIDENCE)
   └── Missing Futures Access   ──> SKIP (SKIPPED_LOW_CONFIDENCE)

5. Market Session State
   └── Session Closed           ──> SKIP (SKIPPED_MARKET_CLOSED)

6. High-Impact News Window
   └── News Window Active       ──> SKIP (SKIPPED_NEWS_RESTRICTION)

7. Weekend Trading Restriction
   └── Weekend Entry Restricted ──> SKIP (SKIPPED_WEEKEND_RESTRICTION)

8. Policy Symbol Eligibility
   └── Symbol Not Allowed       ──> SKIP (SKIPPED_LOW_CONFIDENCE)

9. Position Caps & Duplicates
   ├── Total Positions Cap      ──> SKIP (SKIPPED_MAX_POSITIONS_REACHED)
   └── Symbol Position Exists   ──> SKIP (SKIPPED_SYMBOL_POSITION_EXISTS)

10. Account Leverage & Free Margin
    ├── Leverage Exceeds Policy  ──> SKIP (SKIPPED_LOW_CONFIDENCE)
    └── Insufficient Free Margin ──> SKIP (SKIPPED_LOW_CONFIDENCE)

11. Risk Scaling (Portfolio Cap & Drawdown Safety Buffer)
    ├── Portfolio Cap Exceeded   ──> REDUCE_RISK (REDUCED_PORTFOLIO_EXPOSURE_CAP)
    └── 75% Drawdown Threshold   ──> REDUCE_RISK (REDUCED_DRAWDOWN_SAFETY_BUFFER)

12. Final Authorization          ──> EXECUTE (APPROVED_FULL_RISK)
```

---

## Position Plan & Exchange Filter Validation

When `validatePositionPlan()` is invoked against a Bybit `PositionPlan` and a `BybitSymbolFilterSpec`, the brain verifies:

1. **Quantity Step Size**: Ensures position quantity aligns with Bybit `quantity_step`.
2. **Minimum & Maximum Quantity**: Verifies quantity is within `minimum_quantity` and `maximum_quantity` bounds.
3. **Tick Size**: Confirms entry price respects Bybit `tick_size` precision.
4. **Minimum & Maximum Notional**: Verifies trade notional value meets exchange requirements.
5. **Leverage Ceiling**: Verifies requested leverage does not exceed symbol `leverage_ceiling`.
6. **Available Margin**: Verifies `required_margin` does not exceed free margin.
7. **Maintenance Margin Safety Buffer**: Verifies remaining account equity after margin allocation exceeds `maintenance_margin_pct` requirements.
8. **Reduce-Only Compatibility**: Ensures reduce-only plans have an existing open position to reduce.

---

## Default Policy Template

`DEFAULT_BYBIT_PERSONAL_POLICY` (`contracts.ts`):
```typescript
{
  policy_id: "pol_bybit_personal_v1",
  policy_version: "1.0.0",
  provider: "BYBIT",
  account_type: "PERSONAL",
  max_risk_per_trade_pct: 1.0,
  max_portfolio_risk_pct: 3.0,
  max_daily_drawdown_pct: 5.0,
  max_total_drawdown_pct: 15.0,
  max_open_positions_total: 5,
  max_open_positions_per_symbol: 1,
  news_restriction: { mode: "ALLOW", buffer_minutes_before: 0, buffer_minutes_after: 0 },
  weekend_restriction: { mode: "ALLOW", close_cutoff_utc: "23:59:59" },
  allowed_symbols: null,
  max_leverage_allowed: 20,
  require_certified_claim: false,
}
```
