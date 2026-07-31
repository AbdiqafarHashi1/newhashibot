# HashiBot Architecture — Phase 3: MT5 Prop Account Execution Brain

## 1. Executive Overview

The `Mt5PropBrain` is a production-grade, side-effect-free decision engine created under the Phase 1A Account Execution Brain Contracts. It governs execution permissions for **MT5 Prop Firm** trading accounts, supporting both **Challenge / Evaluation (`PROP_EVALUATION`)** and **Funded (`PROP_FUNDED`)** account stages.

The core philosophy of the MT5 Prop Brain is **capital preservation and strict rule compliance** above raw account growth. It guarantees that no signal is executed if doing so would risk breaching prop-firm drawdown rules, news window restrictions, weekend holding rules, or exposure caps.

---

## 2. Core Responsibilities & Non-Goals

### Responsibilities
- **Account Policy Evaluation**: Evaluates incoming signals against real-time account context (`AccountExecutionContext`) and prop-firm policy (`AccountPolicy`).
- **Account Lock Enforcement**: Continuously checks for hard daily loss breaches, trailing/total drawdown breaches, floating loss buffer limits, or prop firm `BREACHED` statuses via `checkAccountLock`.
- **Prop Constraint Enforcement**:
  - Daily loss limit & trailing/total drawdown cap.
  - Open floating loss buffer safety ceiling.
  - High-impact economic news windows (`news_restriction`).
  - Weekend holding restrictions (`weekend_restriction`).
  - Maximum simultaneous positions (`max_open_positions_total`).
  - Single active position per symbol (`max_open_positions_per_symbol`).
  - Maximum leverage limits (`max_leverage_allowed`).
- **Deterministic Decision Generation**: Emits `ExecutionDecision` (`EXECUTE`, `SKIP`, `REDUCE_RISK`, `LOCK_ACCOUNT`) with complete structured `RuleViolation` evidence.
- **Position Plan Creation**: Emits `PositionPlan` outputs using the unified `createMt5PositionPlan` contract helper when execution is allowed.
- **Lifecycle Trade Management**: Emits `TradeManagementPlan` specifying TP1/TP2 ratios, break-even offsets, ATR trailing, and a strict 24-hour holding time cap for prop trades.

### Non-Goals & Strict Boundaries
- **Does NOT generate trading signals**: Signals originate exclusively from Scanner and Strategy Framework modules.
- **Does NOT place MT5 orders directly**: Orders are dispatched via the MT5 Bridge & Provider layer.
- **Does NOT duplicate Capital Manager sizing**: Position plan sizing math is owned by the shared Phase 1A contract layer (`createMt5PositionPlan`).
- **Does NOT mutate external databases or network state**: Operates as a pure, deterministic, side-effect-free function.

---

## 3. Challenge (`PROP_EVALUATION`) vs Funded (`PROP_FUNDED`) Policy Composition

`Mt5PropBrain` uses a single class architecture where behavior adapts seamlessly based on the `AccountPolicy` supplied in the context:

| Metric / Rule | Challenge Policy (`DEFAULT_MT5_PROP_EVALUATION_POLICY`) | Funded Policy (`DEFAULT_MT5_PROP_FUNDED_POLICY`) |
| :--- | :--- | :--- |
| **Account Type** | `PROP_EVALUATION` | `PROP_FUNDED` |
| **Max Risk Per Trade** | 0.5% | 0.5% |
| **Max Portfolio Risk** | 1.5% | 1.5% |
| **Max Daily Drawdown** | 4.5% | 4.0% (Tighter preservation cap) |
| **Max Total/Trailing Drawdown** | 9.0% | 8.0% (Tighter capital protection) |
| **News Restriction** | `BLOCK_ENTRY` (5 min buffer) | `MANDATORY_CLOSE` (3 min buffer) |
| **Weekend Restriction** | `MANDATORY_CLOSE` (20:00:00 UTC) | `MANDATORY_CLOSE` (19:30:00 UTC) |
| **Allowed Symbols** | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, XAUUSD | Same 7 Major/Precious Pairs |
| **Max Leverage** | 100:1 | 100:1 |

---

## 4. Evaluation Sequence

1. **Account Lock Check (`checkAccountLock`)**:
   - Daily loss limit breach check.
   - Trailing/Total drawdown breach check.
   - Floating open loss cap check.
   - Prop firm supervisor `BREACHED` status check.
   - *If breached*: Returns `LOCK_ACCOUNT` with `LOCKED_DAILY_LOSS_BREACH`, `LOCKED_MAX_DRAWDOWN_BREACH`, or `LOCKED_PROP_RULE_VIOLATION`.

2. **Runtime & Bridge Health**:
   - Verifies `context.runtime_health.is_healthy` and `bridge_status === "CONNECTED"`.
   - *If degraded*: Returns `SKIP` with `SKIPPED_PROVIDER_DEGRADED`.

3. **Session & Market Open**:
   - Verifies `context.session_state.is_session_open`.
   - *If closed*: Returns `SKIP` with `SKIPPED_MARKET_CLOSED`.

4. **Weekend Holding Restrictions**:
   - Checks Friday cutoff time or weekend state if policy prohibits weekend holding.
   - *If past cutoff*: Returns `SKIP` with `SKIPPED_WEEKEND_RESTRICTION`.

5. **Economic News Restrictions**:
   - Checks if `in_high_impact_news_window` is true when policy prohibits news trading.
   - *If active*: Returns `SKIP` with `SKIPPED_NEWS_RESTRICTION`.

6. **Symbol & Position Limits**:
   - Checks `allowed_symbols` whitelist.
   - Checks `max_open_positions_total` and `max_open_positions_per_symbol`.
   - *If violated*: Returns `SKIP` with `SKIPPED_MAX_POSITIONS_REACHED` or `SKIPPED_SYMBOL_POSITION_EXISTS`.

7. **Free Margin & Floating Loss Buffer**:
   - Verifies free margin covers required margin.
   - Checks if floating open unrealized loss exceeds 80% of daily drawdown threshold.
   - *If buffer breached*: Returns `SKIP` with `SKIPPED_LOW_CONFIDENCE`.

8. **Risk Scaling & Drawdown Safety Buffer (`REDUCE_RISK`)**:
   - Scales authorized risk down to fit remaining portfolio risk cap (`REDUCED_PORTFOLIO_EXPOSURE_CAP`).
   - Scales risk down by 50% if daily drawdown is >= 70% of max allowed daily cap (`REDUCED_DRAWDOWN_SAFETY_BUFFER`).

---

## 5. Single-Owner Architecture & Sizing Ownership

`Mt5PropBrain` delegates all position lot size math and contract specifications to `createMt5PositionPlan` inside `contracts.ts`.

```
                    ┌───────────────────────────────┐
                    │      Approved Signal          │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      Mt5PropBrain             │
                    │   (Evaluates Prop Rules)      │
                    └───────────────┬───────────────┘
                                    │
                         EXECUTE / REDUCE_RISK
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    createMt5PositionPlan      │
                    │ (Unified Contract Sizing Math)│
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      Capital Manager          │
                    │   (Final Portfolio Allocator) │
                    └───────────────────────────────┘
```

This guarantees no duplicated sizing logic between Personal and Prop brains or Capital Manager.

---

## 6. Verification Suite

The implementation is verified by a deterministic unit test suite:
```bash
npm run test:mt5-prop-brain
```

### Covered Scenarios
1. Challenge Account (`PROP_EVALUATION`) execution.
2. Funded Account (`PROP_FUNDED`) execution.
3. Daily drawdown limit breach.
4. Trailing drawdown limit breach.
5. Prop firm status `BREACHED` lock.
6. Open floating loss protection rejection.
7. Weekend holding restriction cutoff.
8. High-impact economic news restriction window.
9. Duplicate position per symbol rejection.
10. Degraded/Disconnected bridge terminal rejection.
11. Reduced risk scaling (Portfolio cap & Drawdown safety buffer).
12. Exported singleton instance integrity.
