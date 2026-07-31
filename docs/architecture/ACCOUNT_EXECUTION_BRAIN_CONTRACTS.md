# HashiBot Account Execution Brain — Architectural Contracts Specification

**Document Version:** 1.0.0  
**Phase:** Phase 1A — Contract Layer Architecture  
**Author:** HashiBot Core Engineering  
**Module Location:** `supabase/functions/_shared/account-execution-brain/`  
**Status:** Architectural Specification Complete & Verified  

---

## 1. Overview & Responsibilities

The **Account Execution Brain** is the central decision-making layer of HashiBot, responsible for evaluating whether an approved trading signal should be executed on a specific trading account.

In previous architectures, account policy checks, risk envelope calculations, lot sizing, and provider order placement were dispersed across individual Edge Functions and monitor scripts. The **Account Execution Brain** introduces a unified, deterministic contract layer that encapsulates account intelligence.

### Key Responsibilities
1. **Context Evaluation:** Aggregates real-time balance, equity, margin, active exposure, daily loss, drawdown, session timing, and news windows into an immutable `AccountExecutionContext`.
2. **Policy Enforcement:** Enforces composable `AccountPolicy` rules tailored for Personal Binance/Bybit accounts, MT5 Personal accounts, and MT5 Prop Firm Challenge/Funded accounts.
3. **Deterministic Decision Making:** Evaluates signals without side effects, outputting a clear `ExecutionDecision` (`EXECUTE`, `SKIP`, `REDUCE_RISK`, or `LOCK_ACCOUNT`).
4. **Position Planning:** Produces an immutable `PositionPlan` specifying risk parameters, lot bounds, and leverage for Capital Manager sizing.
5. **Trade Management Planning:** Formulates a `TradeManagementPlan` outlining TP1, TP2, break-even, trailing, and holding timeout policies.
6. **Account Protection & Locking:** Automatically issues an `AccountLock` when drawdown caps, daily loss limits, or prop firm rules are breached.

---

## 2. Lifecycle of an Execution Decision

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               1. SIGNAL APPROVAL                                │
│  Arbitrator selects winning signal -> Status: APPROVED                          │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           2. ACCOUNT CONTEXT BUILD                              │
│  AccountExecutionBrain fetches immutable AccountExecutionContext                │
│  (Balance, Equity, Exposure, Daily Drawdown, Session, News, Health)              │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             3. POLICY EVALUATION                                │
│  Brain evaluates signal against composable AccountPolicy                        │
│  (Max Risk %, Daily Loss Cap, Symbol Position Limits, News Window)               │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           4. DETERMINISTIC DECISION                             │
│  Returns ExecutionDecision: EXECUTE | SKIP | REDUCE_RISK | LOCK_ACCOUNT          │
└────────────┬───────────────────────────┬───────────────────────────┬────────────┘
             │                           │                           │
    [ EXECUTE / REDUCE_RISK ]         [ SKIP ]               [ LOCK_ACCOUNT ]
             │                           │                           │
             ▼                           ▼                           ▼
┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
│ 5. POSITION & TM PLAN  │  │ Log Rule Violations &  │  │ Issue AccountLock &    │
│ Capital Manager Sizing │  │ Skip Trade Execution   │  │ Halt Future Signals    │
└────────────┬───────────┘  └────────────────────────┘  └────────────────────────┘
             │
             ▼
┌────────────────────────┐
│ 6. PROVIDER EXECUTION  │
│ Order Placement & SL/TP│
└────────────────────────┘
```

---

## 3. Ownership Boundaries Matrix

To prevent race conditions, conflicting order states, and schema drift, HashiBot enforces a strict **Single-Owner Policy**. No responsibility is shared or duplicated between components.

| Responsibility | Single Owner Component | Canonical File / Module | Output Product | Prohibition |
| :--- | :--- | :--- | :--- | :--- |
| **Signal Generation** | Market Scanner | `market-scanner/index.ts` | `strategy_candidates` | No other module may scan price action or generate setups. |
| **Signal Approval** | Arbitrator | `_shared/arbitrator.ts` | `signals (APPROVED)` | No other module may approve or rank setups. |
| **Execution Decision** | Account Execution Brain | `_shared/account-execution-brain/` | `ExecutionDecision` | No provider or cron script may decide whether to execute independently. |
| **Position Sizing** | Capital Manager | `_shared/professional-capital-allocation.ts` | `PositionPlan` | No exchange adapter or MT5 bridge script may calculate lot sizes. |
| **Risk Validation** | Risk Engine | `_shared/professional-risk-engine.ts` | `AuthorizedEnvelope` | No provider script may bypass risk envelope verification. |
| **Order Placement** | Provider Adapters | `binance-testnet-execution`, `bybit-demo-execution`, `mt5-bridge` | Exchange Order IDs / Fills | No strategy or scanner code may call exchange APIs directly. |
| **Protection Verification** | Protection Engine | `_shared/professional-protection-verification.ts` | `Protection Report` | No trade is marked complete without Protection Engine verification. |
| **Trade Lifecycle** | Trade Management Supervisors | `binance-testnet-monitor`, `bybit-testnet-monitor`, `mt5-bridge` | Trade Transitions | No scanner or UI code may directly execute partial closes or BE adjustments. |
| **Persistent State** | Trade Truth Unified | `_shared/trade-truth/index.ts` | `trade_truth_unified` | No direct writes to trade truth tables without canonical adapters. |

---

## 4. Core Contract Specifications

All contracts are defined in `supabase/functions/_shared/account-execution-brain/types.ts` as immutable TypeScript interfaces.

### 4.1 `AccountExecutionContext`
An immutable snapshot of the account's operational state:
```typescript
export interface AccountExecutionContext {
  readonly account_id: string;
  readonly user_id: string | null;
  readonly provider: "BINANCE" | "BYBIT" | "MT5_PERSONAL" | "MT5_PROP";
  readonly account_type: "PERSONAL" | "PROP_EVALUATION" | "PROP_FUNDED";
  readonly environment: "DEMO" | "TESTNET" | "LIVE";
  readonly balance: number;
  readonly equity: number;
  readonly free_margin: number;
  readonly used_margin: number;
  readonly leverage: number;
  readonly open_positions: ReadonlyArray<OpenPositionSummary>;
  readonly exposure: PortfolioExposure;
  readonly daily_drawdown: DailyDrawdownState;
  readonly total_drawdown: TotalDrawdownState;
  readonly risk_profile: AccountRiskProfile;
  readonly prop_rules: PropRulesState | null;
  readonly session_state: SessionState;
  readonly news_state: NewsState;
  readonly runtime_health: RuntimeHealthState;
  readonly updated_at: string;
}
```

### 4.2 `AccountPolicy`
Composable policy restrictions for Personal and Prop accounts:
```typescript
export interface AccountPolicy {
  readonly policy_id: string;
  readonly policy_version: string;
  readonly provider: BrainProvider;
  readonly account_type: BrainAccountType;
  readonly max_risk_per_trade_pct: number;
  readonly max_portfolio_risk_pct: number;
  readonly max_daily_drawdown_pct: number;
  readonly max_total_drawdown_pct: number;
  readonly max_open_positions_total: number;
  readonly max_open_positions_per_symbol: number;
  readonly news_restriction: NewsPolicyRestriction;
  readonly weekend_restriction: WeekendPolicyRestriction;
  readonly allowed_symbols: ReadonlyArray<string> | null;
  readonly max_leverage_allowed: number;
  readonly require_certified_claim: boolean;
}
```

### 4.3 `ExecutionDecision`
A deterministic evaluation result:
```typescript
export interface ExecutionDecision {
  readonly decision: "EXECUTE" | "SKIP" | "REDUCE_RISK" | "LOCK_ACCOUNT";
  readonly decision_code: ExecutionDecisionCode;
  readonly reason: string;
  readonly account_id: string;
  readonly signal_id: string;
  readonly authorized_risk_pct: number;
  readonly rule_violations: ReadonlyArray<RuleViolation>;
  readonly lock_details: AccountLock | null;
  readonly timestamp: string;
}
```

### 4.4 `RuleViolation`
Structured reasoning explaining rejected or restricted executions:
```typescript
export interface RuleViolation {
  readonly rule_id: string;
  readonly rule_category: RuleViolationCategory;
  readonly severity: RuleViolationSeverity;
  readonly message: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly recommended_action: RuleRecommendedAction;
}
```

### 4.5 `PositionPlan`
The sizing blueprint output passed to Capital Manager:
```typescript
export interface PositionPlan {
  readonly plan_id: string;
  readonly signal_id: string;
  readonly account_id: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly order_type: "MARKET" | "LIMIT" | "STOP";
  readonly entry_price: number;
  readonly stop_loss: number;
  readonly take_profit_1: number;
  readonly take_profit_2: number | null;
  readonly quantity: number;
  readonly leverage: number;
  readonly required_margin: number;
  readonly expected_risk_amount: number;
  readonly expected_risk_pct: number;
  readonly expected_notional: number;
  readonly contract_size: number;
  readonly time_in_force: "GTC" | "IOC" | "FOK";
  readonly reduce_only: boolean;
  readonly idempotency_key: string;
}
```

### 4.6 `TradeManagementPlan`
Specification for trade lifecycle supervision:
```typescript
export interface TradeManagementPlan {
  readonly management_plan_id: string;
  readonly signal_id: string;
  readonly account_id: string;
  readonly tp1_policy: Readonly<{ ratio: number; exit_pct: number; move_sl_to_be: boolean; profit_lock_offset: number }>;
  readonly tp2_policy: Readonly<{ ratio: number; exit_pct: number; enable_trailing: boolean }>;
  readonly breakeven_policy: Readonly<{ trigger_rr: number; lock_offset_price: number }>;
  readonly trailing_policy: Readonly<{ type: "ATR_TRAILING" | "PERCENT_TRAILING" | "STEP_TRAILING"; distance: number }>;
  readonly timeout_policy: Readonly<{ max_holding_hours: number; action_on_timeout: "CLOSE_MARKET" | "CANCEL_PENDING" | "NOTIFY_ONLY" }>;
}
```

### 4.7 `AccountLock`
Contract issued when an account breaches policy limits:
```typescript
export interface AccountLock {
  readonly lock_id: string;
  readonly account_id: string;
  readonly reason: AccountLockReason;
  readonly is_locked: boolean;
  readonly locked_at: string;
  readonly locked_by: string;
  readonly release_conditions: string;
  readonly violations: ReadonlyArray<RuleViolation>;
}
```

---

## 5. Common Brain Interface (`AccountExecutionBrain`)

Every provider-specific brain implementation in Phase 1B will adhere to this contract:

```typescript
export interface AccountExecutionBrain {
  readonly provider: BrainProvider;
  readonly brain_version: string;

  evaluateSignal(
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): ExecutionDecision;

  createPositionPlan(
    decision: ExecutionDecision,
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): PositionPlan | null;

  createTradeManagementPlan(
    decision: ExecutionDecision,
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): TradeManagementPlan | null;

  checkAccountLock(
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): AccountLock | null;
}
```

---

## 6. Extension Model for Future Brain Implementations

Phase 1B will introduce four concrete brain implementations that consume these contracts:
1. **`BinancePersonalBrain`:** Evaluates USDM Futures testnet/live signals for Binance personal accounts.
2. **`BybitPersonalBrain`:** Evaluates Linear V5 demo/live signals for Bybit personal accounts.
3. **`Mt5PersonalBrain`:** Evaluates Forex/Metal signals for MT5 Personal growth accounts.
4. **`Mt5PropBrain`:** Evaluates Forex/Metal signals for MT5 Prop Firm accounts with strict daily drawdown (4.5%), high-water mark trailing limits, news restrictions, and weekend holding blocks.

---

## 7. Provider Independence & Cloud Compatibility

- **Zero Exchange/Network Dependencies in Contracts:** All contracts in `_shared/account-execution-brain/` are pure, deterministic TypeScript interfaces and functions.
- **Google Cloud / Cloud Run Readiness:** The contracts use standard ECMAScript / Node / Deno compatible structures with no environment-specific globals, enabling seamless execution inside Edge Functions, Cloud Run containers, or background workers.
