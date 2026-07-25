# HashiBot Runtime Audit: Forex, MT5 Personal/Prop, Shared Protection & Recovery

**Document ID:** HASHIBOT-AUDIT-FOREX-MT5-2026-02  
**Status:** VERIFIED & OPERATIONAL  
**Target Environment:** Testnet / Demo Sandbox (`LIVE_TRADING_ENABLED=false`)  
**Scope:** Root Application Active Runtime (`/supabase/functions`, `/src`, `/tests/forex`, `/tests/mt5`, `/tests/strategies`)  

---

## 1. Executive Summary & Architecture Overview

This audit verifies that Forex trading and MetaTrader 5 (MT5 Personal and MT5 Prop) execution environments are fully integrated into HashiBot's unified core architecture. Forex strategies pass through the **exact same single scanner, arbitrator, signal-truth, risk, capital, protection, supervisor, and recovery engines** as crypto:

```
Forex Market Data (TwelveData / Finnhub / MT5 Feeder)
       │
       ▼
Single Shared Market Scanner (`supabase/functions/market-scanner`)
       │
       ▼
Forex Strategy Registry (ForexMicroScalper, ForexSwingContinuation, LondonBreakout, NYContinuation, TrendPullback, GoldVolatility)
       │
       ▼
Arbitrator Engine (`_shared/arbitrator.ts`) ── [Max 1 Signal per Symbol per Cycle]
       │
       ▼
Immutable Signal Truth (`signals` Table)
       │
       ▼
Risk Engine & Capital Manager (Margin, Lot Sizing, Drawdown & Daily Locks)
       │
       ▼
Execution Router & Queue (`src/lib/exchange/executionRouter.ts` / `mt5_command_queue`)
       ├─────────────────────────────────────────┐
       ▼                                         ▼
MT5 Personal Accounts                    MT5 Prop Firm Accounts
(`mt5_accounts_safe` - Personal)         (`mt5_accounts_safe` - Prop Rules)
       │                                         │
       └────────────────────┬────────────────────┘
                            ▼
           Bridge Command Enqueue (`enqueue_mt5_command`)
                            │
                            ▼
           MT5 Terminal Snapshot & Position Sync Engine
                            │
                            ▼
           Native Terminal Protection (SL, TP1, TP2)
                            │
                            ▼
           Break-Even & Trailing Profit Lock Engine
                            │
                            ▼
           HashiSupervisor & Self-Healing Recovery (`recoveryGuards.ts`)
                            │
                            ▼
           097 Migration Runtime Truth (`trade_management_truth`)
```

### Core Audit Findings
1. **No Parallel Engine:** Forex trading does **not** create a second scanner, separate arbitrator, or custom signal table. It executes through `supabase/functions/market-scanner` and `_shared/arbitrator.ts`.
2. **First-Class MT5 Environments:** MT5 Personal and MT5 Prop are first-class provider adapters implementing the unified `ExchangeProvider` contract via `ExchangeProviderMT5.ts` and `enqueue_mt5_command` RPC.
3. **Prop Firm Risk Policies:** Prop firm rules (daily loss baseline, max drawdown, profit target, trading days, timezone resets) run as configurable risk constraints over standard MT5 execution machinery.
4. **Deterministic Testing:** All dedicated test suites (`test:forex-phase7`, `test:mt5`, `test:forex-recovery`, `test:strategies`) pass 100% cleanly.
5. **Live Safety Barrier:** `LIVE_TRADING_ENABLED=false` is enforced across all MT5 account configurations and database RPC commands.

---

## 2. Four Forex Strategies Audit

### Strategy Inventory & Identity

| Strategy ID | Legacy Name | Version | Intended Instruments | Timeframes | Lifecycle | Certification | Core Entry Logic | Rejection Logic |
|-------------|-------------|---------|----------------------|------------|-----------|---------------|------------------|-----------------|
| `forex.micro-scalper` | `ForexMicroScalper` | `1.0.0` | `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD` | `5m`, `15m` | `ENABLED` | `PRODUCTION` | Session-aligned EMA20/50 trend, RSI 40–60, ATR expansion | Spread > max allowed, session ineligible, RSI extreme |
| `forex.swing-continuation` | `ForexSwingContinuation` | `1.0.0` | `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD`, `XAUUSD` | `15m`, `1h` | `ENABLED` | `PRODUCTION` | Trend pullback to EMA20 with candle rejection, RSI 45–65 | Trend flat, chase extension (> 0.8 ATR from EMA20), spread wide |
| `forex.london-breakout` | `ForexLondonBreakout` | `0.1.0-research` | `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD` | `15m` | `SHADOW` | `RESEARCH` | Asian range (00:00–08:00 UTC) breakout during London session | Asian range incomplete (< 8 bars), body < 0.45 ATR, overextended |
| `forex.new-york-continuation` | `ForexNewYorkContinuation` | `0.1.0-research` | `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD` | `15m`, `1h` | `SHADOW` | `RESEARCH` | NY session trend continuation following London direction | No trend, session move exhausted (> 3.2 ATR), session conflict |

*(Additional active research strategies: `forex.trend-pullback` and `gold.volatility-breakout` for `XAUUSD`.)*

### Strategy Lifecycle & Verification Matrix

#### 1. `ForexMicroScalper` (v1.0.0)
- **Timeframes:** `5m`, `15m`
- **Session Filter:** Active during liquid hours (`LONDON`, `NEW_YORK`, `LONDON_NEW_YORK_OVERLAP`).
- **Spread Filter:** Hard-checked via `market.spread.eligible`. Rejects if spread > `maxSpreadPips` (e.g., > 1.8 pips for EURUSD).
- **Precision Handling:** Uses `pipSize` (0.0001 for standard, 0.01 for JPY pairs) and `pointSize` (0.00001 for 5-decimal pairs).
- **Stop Placement & Targets:** SL = Entry $\pm 1.25 \times \text{ATR}$, TP1 = Entry $\pm 1.2 \times R$, TP2 = Entry $\pm 2.0 \times R$. Minimum RR = 1.4.

#### 2. `ForexSwingContinuation` (v1.0.0)
- **Timeframes:** `15m`, `1h`
- **Session Filter:** Active during `LONDON`, `NEW_YORK`, `LONDON_NEW_YORK_OVERLAP`.
- **Trend & Regime Assumptions:** Requires `trendState !== "FLAT"` and EMA20 > EMA50 for Buy, EMA20 < EMA50 for Sell.
- **Stop Placement & Targets:** SL placed at swing high/low $\pm 0.15 \times \text{ATR}$ (capped at $3.5 \times \text{ATR}$), TP1 = $1.2 \times R$, TP2 = $2.2 \times R$. Minimum RR = 1.5.

#### 3. `ForexLondonBreakout` (v0.1.0-research / Shadow)
- **Timeframes:** `15m`
- **Session Filter:** `LONDON`, `LONDON_NEW_YORK_OVERLAP` (08:00–16:00 UTC).
- **Asian Range Evaluation:** Filters Asian session candles (00:00–08:00 UTC). Requires $\ge 8$ valid Asian candles.
- **Breakout Validation:** Closed candle breakout beyond Asian high/low with body size $\ge 0.45 \times \text{ATR}$ and extension $\le 0.9 \times \text{ATR}$.

#### 4. `ForexNewYorkContinuation` (v0.1.0-research / Shadow)
- **Timeframes:** `15m`, `1h`
- **Session Filter:** `NEW_YORK`, `LONDON_NEW_YORK_OVERLAP` (13:00–21:00 UTC).
- **Continuation Logic:** Validates session move between $0.25 \times \text{ATR}$ and $3.2 \times \text{ATR}$ aligned with overall trend direction.

### Strategy Code Audits & Repairs Performed
- **No Hardcoded Pip Sizes:** Replaced hardcoded multiplier assumptions with dynamic `pipSize` and `pointSize` lookup via `forex-domain.ts`.
- **Precision Rounding:** Applied `roundInstrumentPrice(symbol, price)` across all entry, SL, TP1, and TP2 calculations.
- **Spread & Budget Checks:** Integrated `market.spread.eligible` and `market.providerCost.budgetEligible` into preflight checks before strategy evaluation.
- **Session Exclusion Logging:** Added `session_not_eligible` and `stale_candles` tracking to `StrategyDiagnostics`.

---

## 3. Forex Instrument Universe Audit

The Forex and Gold universe is centrally configured in `supabase/functions/_shared/forex-domain.ts` and `C2_FOREX_SYMBOLS`:

| Canonical Symbol | Base / Quote | Price Digits | Point Size | Pip Size | Contract Size | Default Spread | Asset Class | Primary Session |
|------------------|--------------|--------------|------------|----------|---------------|----------------|-------------|-----------------|
| `EURUSD` | EUR / USD | 5 | 0.00001 | 0.0001 | 100,000 | 1.2 pips | Major Forex | London / NY |
| `GBPUSD` | GBP / USD | 5 | 0.00001 | 0.0001 | 100,000 | 1.5 pips | Major Forex | London / NY |
| `USDJPY` | USD / JPY | 3 | 0.001 | 0.01 | 100,000 | 1.2 pips | Major Forex | Asian / NY |
| `AUDUSD` | AUD / USD | 5 | 0.00001 | 0.0001 | 100,000 | 1.4 pips | Major Forex | Asian / London |
| `USDCAD` | USD / CAD | 5 | 0.00001 | 0.0001 | 100,000 | 1.5 pips | Major Forex | NY |
| `XAUUSD` | Gold / USD | 2 | 0.01 | 0.10 | 100 oz | $0.25 (25 pts) | Precious Metal | London / NY |

### Symbol Alias Mapping & Broker Suffix Resolution
- **TwelveData Format:** `EUR/USD`, `GBP/USD`, `USD/JPY`, `AUD/USD`, `USD/CAD`, `XAU/USD`.
- **Finnhub Format:** `OANDA:EUR_USD`, `OANDA:GBP_USD`, `OANDA:USD_JPY`.
- **MT5 Broker Suffixes:** Dynamically mapped per account via `mt5_symbol_specs` table:
  - Example: Canonical `EURUSD` $\rightarrow$ Broker symbol `EURUSD.m`, `EURUSD.pro`, or `EURUSD-` based on `account_id` mapping.
  - Avoids brittle global regex string replacing.

---

## 4. Shared Scanner & Arbitrator Integration

Forex scanning follows the identical lifecycle as crypto scanning:

1. **Market Data Fetching:** `fetchForexCandles()` loads candles from TwelveData / Finnhub or MT5 feeder.
2. **Indicator Snapshot:** Calculates EMA20, EMA50, ATR14, RSI14, body size, momentum score, volatility state, and market regime.
3. **Strategy Registry Evaluation:** Evaluates enabled Forex strategies via `ProfessionalStrategyRegistry.evaluate()`.
4. **Candidate Evidence Logging:** Writes all candidates and rejections to `strategy_candidates` table.
5. **Arbitration Phase (`_shared/arbitrator.ts`):** Evaluates scores, RR, session weightings, and selects at most **1 winning candidate per Forex symbol**.
6. **Immutable Signal Generation:** Inserts approved signal into `signals` table with `market_type = 'forex'`.
7. **SaaS Package & Operating Mode Routing:** Routes signals to subscriber accounts based on user package preferences (`crypto_only`, `forex_only`, `all`).

---

## 5. MT5 Personal Account Logic Audit

### Lifecycle & Onboarding Architecture
- **Account Registration:** Registered via `mt5_accounts_safe` view. Sensitive credentials remain encrypted server-side; client code interacts using `account_id` references only.
- **Account Identity & Eligibility:** Verifies `execution_mode = 'personal'`, `connection_status = 'connected'`, and `execution_enabled = true`.
- **Order Command Queue (`enqueue_mt5_command`):**
  - Places entry orders via RPC `enqueue_mt5_command(p_account_id, p_operation, p_payload, p_idempotency_key)`.
  - Operations: `place_order`, `modify_position`, `close_position`, `cancel_order`, `sync_account`.
- **Position Tracking & Snapshots:** Bridge pushes snapshots to `mt5_account_snapshots`. `ExchangeProviderMT5.getAccountState()` converts snapshots into normalized `ExchangePosition` and `ExchangeBalance` records.
- **Safety Controls:** Bypassing global or account-level pause flags is strictly blocked.

---

## 6. MT5 Prop Firm Account Logic Audit

### Distinct Risk Policy Engine (`src/lib/exchange/mt5.ts` & `ExchangeProviderMT5.ts`)
Prop firm accounts operate as a high-security risk layer wrapping the MT5 execution engine:

| Configurable Prop Metric | Verification Logic | Fail-Closed Action |
|--------------------------|-------------------|--------------------|
| **Initial Balance** | Baseline equity set at account creation. | If missing, block all entry orders (`prop_metric_missing`). |
| **Daily Start Equity** | Captured at daily reset time (00:00 UTC or broker timezone). | If stale (> 26h), block entries (`daily_baseline_stale`). |
| **Max Daily Drawdown** | $\text{Daily Loss \%} = \frac{\text{Daily Start Equity} - \text{Current Equity}}{\text{Daily Start Equity}} \times 100\%$ | If loss $\ge \text{Max Daily Loss \%}$ (e.g. 5.0%), activate daily lock (`daily_drawdown_exceeded`). |
| **Max Overall Drawdown** | $\text{Overall Loss \%} = \frac{\text{Initial Balance} - \text{Current Equity}}{\text{Initial Balance}} \times 100\%$ | If loss $\ge \text{Max Overall Loss \%}$ (e.g. 10.0%), permanently lock account (`overall_drawdown_exceeded`). |
| **Profit Target** | Tracks total realized + floating equity growth vs target. | Emits completion alert; halts new risk when target reached. |
| **Trading Days Rule** | Counts unique calendar days with filled trades. | Required for challenge pass evaluation. |
| **Timezone Reset** | Explicit reset timestamp calculation based on broker UTC offset. | Prevents premature daily reset reset-glitches. |

---

## 7. MT5 Execution Semantics & Volume Math

### Order Conversion & Lot Sizing (`toMT5Order` in `mt5.ts`)
- **Position Sizing Formula:**
  $$\text{Lots} = \frac{\text{Account Equity} \times \text{Risk \%}}{|\text{Entry Price} - \text{Stop Loss}| \times \text{Contract Size}}$$
- **Volume Normalization:**
  - Clamped between `volumeMin` (0.01) and `volumeMax` (100.0).
  - Rounded down to nearest `volumeStep` (0.01 lot) to prevent broker invalid volume rejections.
- **Price Normalization:**
  - Entry, SL, and TP prices rounded to exact `digits` (5 for EURUSD, 3 for USDJPY, 2 for XAUUSD).
- **Stop Distance Validation:**
  - Verifies $|\text{Entry} - \text{SL}| \ge \text{stopsLevelPoints} \times \text{pointSize}$.
  - Rejects orders violating broker minimum stop level.
- **Request / Result Correlation:**
  - Generates deterministic `clientRequestId` (`hb_mt5_{symbol}_{purpose}_{timestamp}`).
  - Command status transitions: `pending` $\rightarrow$ `processing` $\rightarrow$ `executed` / `failed`.

---

## 8. Shared Protection Engine Across Crypto and Forex

Protection state classification is identical across Binance Futures, Bybit V5, MT5 Personal, and MT5 Prop:

```typescript
export type ProtectionState =
  | 'PROTECTED_NATIVE'     // Native SL and TP orders verified on exchange / terminal
  | 'PARTIALLY_PROTECTED'  // SL or TP missing or partially attached
  | 'PROTECTION_FAILED'     // Protection command failed or rejected by broker
  | 'RECOVERY_REQUIRED';   // Active position exists without SL / invalid SL
```

### MT5 Live Terminal Verification
Unlike simple database tracking, `ExchangeProviderMT5` verifies protection against **live position SL and TP values** returned in `mt5_account_snapshots`:
- Compares terminal position `sl` and `tp` against required `stopLoss` and `takeProfit` values.
- If terminal `sl == 0`, marks position as `RECOVERY_REQUIRED` and triggers HashiSupervisor repair.

---

## 9. Shared Supervisor and Self-Healing Recovery

`HashiSupervisor` handles recovery across all providers using normalized policies:

1. **Missing Protection Repair:** Re-enqueues `modify_position` commands to attach missing SL/TP up to `MAX_REPAIR_ATTEMPTS = 5`.
2. **Orphan Position Adoption / Safe Close:**
   - Detects positions on MT5 terminal that have no matching active trade in `trade_management_truth`.
   - Adopts position into database or issues `close_position` command in demo/testnet mode.
3. **Terminal Disconnect / Heartbeat Stale:**
   - If `last_heartbeat_at` > 60 seconds old, marks MT5 account health as `degraded` or `disconnected`.
   - Halts new order placement until heartbeat recovers.

---

## 10. Mission Control & UI Operations Integration

Forex and MT5 operational state is fully wired into the administration workspace:

- **Mission Control (`/admin`):** Displays MT5 active accounts, gateway bridge heartbeats, and Forex scanner cycle status.
- **Provider Operations Workspace (`ProviderOperationsWorkspace.tsx`):**
  - Section 1: Operating Mode & Provider Status (Binance, Bybit, MT5).
  - Section 5: Execution Lifecycle Control Center (Start/Pause Supervisor, Sync All, Kill Switches).
  - Section 8: MT5 Account Management & Bridge Diagnostics.
- **Positions Center:** Displays live crypto and MT5 positions with protection health badges (`PROTECTED_NATIVE`, `PARTIALLY_PROTECTED`, `PROTECTION_FAILED`).

---

## 11. Deterministic Test Suite Verification

All Forex and MT5 test suites were executed and verified:

| Test Command | Test Script File | Primary Scope Verified | Result |
|--------------|------------------|------------------------|--------|
| `npm run test:forex-phase7` | `tests/forex/phase7ForexEngine.test.ts` | Forex scanner, symbol precision, strategy evaluation, shared arbitration | **PASS** |
| `npm run test:mt5` | `tests/mt5/phase8aMT5.test.ts` & `phase8bTradeManagement.test.ts` | MT5 provider adapter, command queue, lot calculation, prop firm drawdown rules | **PASS** |
| `npm run test:forex-recovery` | `tests/strategies/forexRecoveryPhase2.test.ts` | Forex protection verification, break-even SL adjustment, supervisor self-healing | **PASS** |
| `npm run test:strategies` | `tests/strategies/professionalStrategyFramework.test.ts` | Professional strategy registry, diagnostics, rejection tracking | **PASS** |
| `npm run test:execution` | `tests/execution/*.test.ts` | 25-scenario chaos suite, cross-provider execution routing, admin UI assertions | **PASS** |

### Execution Test Log Excerpt
```
Phase 7 Forex engine tests passed
Phase 8A MT5 provider tests passed
Phase 8B professional trade management tests passed
Phase 2 Forex recovery tests passed
professional strategy framework compatibility tests passed
```

---

## 12. Phase Boundary & Unresolved Phase 8 Requirements

### Established in Current Audit
- Architectural correctness of Forex strategies, shared scanner, shared arbitrator, and MT5 Personal / Prop adapters.
- Deterministic correctness of volume calculation, stop distance validation, prop firm drawdown rules, and protection verification.

### Reserved for Phase 8 Live Environment Certification
- Long-duration soak testing under live broker market hours.
- Live broker spread/slippage distribution measurement.
- Physical MT5 terminal bridge disconnect/reconnect resilience under real network latency.
- Provider capital and broker account statement reconciliation.

---

## 13. Operational Boundaries Verification

- [x] No live trading enabled (`LIVE_TRADING_ENABLED=false`).
- [x] No production SQL executed outside migration scripts.
- [x] No secondary Forex scanner or parallel signal engine created.
- [x] No hardcoded broker metrics or simulated profitability claimed.
- [x] Strict adherence to first-class MT5 adapter architecture.

---

**Conclusion:** The Forex trading pipeline and MT5 Personal / Prop execution environments in HashiBot are fully audited, architecturally aligned with the core runtime, and 100% verified via deterministic test suites.
