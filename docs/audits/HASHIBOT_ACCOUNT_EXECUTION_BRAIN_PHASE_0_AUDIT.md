# HashiBot Phase 0 — Account Execution Brain Architecture Audit

**Repository Audit Date:** July 31, 2026  
**Auditor:** HashiBot Core Architecture Engineering  
**Scope:** Root Runtime Architecture, Signal Lifecycle, Execution Engines (Binance USDM Testnet, Bybit V5 Demo, MT5 Personal/Prop Bridge), Risk & Capital Management, Protection, Supervision, and Trade Truth  
**Status:** Audit Completed — Static Analysis & Code Evidence Established  

---

## 1. Executive Summary

HashiBot has evolved into a multi-asset trading engine capable of scanning markets, generating high-conviction strategies, arbitrating multi-strategy candidates, verifying risk envelopes, executing trades on crypto exchanges and forex MT5 terminals, and enforcing protection and continuous trade management.

However, as HashiBot prepares for multi-account, multi-tier deployment (spanning Personal Binance/Bybit accounts, MT5 Personal accounts, and MT5 Prop Firm accounts with strict daily/max drawdown limits), the execution architecture exhibits fragmentation across ownership layers:
1. **Execution Logic Fragmentation:** Trade execution, sizing, protection placement, and monitoring are currently distributed between Edge Functions (`binance-testnet-execution`, `bybit-demo-execution`, `binance-testnet-monitor`, `bybit-testnet-monitor`, `mt5-bridge`) and shared modules (`_shared/certified-runtime.ts`, `_shared/professional-capital-allocation.ts`, `_shared/professional-execution-planning.ts`, `_shared/trade-truth/index.ts`).
2. **Account Policy Ambiguity:** Account rules (such as max daily drawdown, maximum news holding restrictions, weekend holding blocks, and prop-firm specific loss limits) are partially implemented in `_shared/professional-execution-adoption.ts` and `_shared/professional-risk-engine.ts`, but lack an autonomous, unified **Account Execution Brain** layer that evaluates account state, policy limits, and position plans holistically before placing orders.
3. **Dual State Truth:** State truth currently exists across `execution_orders`, `trade_management_truth`, `trade_truth_unified`, `mt5_commands`, and `mt5_account_snapshots`. Reconciliation is executed periodically by monitor functions and truth adapters, but direct concurrent writers create potential race conditions.

This Phase 0 Audit maps the entire active codebase, establishing exact function signatures, file paths, database tables, RPCs, and state transitions to serve as the blueprint for introducing the **Account Execution Brain** architecture.

---

## 2. Architecture Overview

### Current Signal-to-Execution Pipeline

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                 MARKET SCANNER                                   │
│  supabase/functions/market-scanner/index.ts                                      │
│  - Fetches Candles (Binance / Bybit / MT5 Data)                                  │
│  - Evaluates 10 Professional Strategies                                          │
│  - Inserts strategy_candidates with granular score_breakdown                     │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                   ARBITRATOR                                     │
│  supabase/functions/_shared/arbitrator.ts                                        │
│  - Filters candidates via Market Regime & Distance Guards                        │
│  - Selects Top Candidate per Symbol & Timeframe                                  │
│  - Inserts into signals (Status: APPROVED)                                        │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               SIGNAL PUBLISHER                                   │
│  supabase/functions/market-scanner/index.ts -> tryAutoExecuteTestnet             │
│  - Routes execution based on provider & market type                              │
└───────────────────┬────────────────────┬────────────────────┬────────────────────┘
                    │                    │                    │
                    ▼                    ▼                    ▼
┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│ BINANCE EXECUTION ENGINE│  │ BYBIT DEMO EXECUTION    │  │    MT5 BRIDGE ENGINE    │
│ binance-testnet-execution│ │ bybit-demo-execution    │  │ mt5-bridge / index.ts   │
│ - USDM Futures Testnet  │  │ - V5 Linear Demo API    │  │ - RPC claim_mt5_command │
│ - POST /fapi/v1/order   │  │ - POST /v5/order/create │  │ - MT5 EA Command Poll   │
└────────────┬────────────┘  └────────────┬────────────┘  └────────────┬────────────┘
             │                            │                            │
             ▼                            ▼                            ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          CONTINUOUS TRADE SUPERVISOR                             │
│  binance-testnet-monitor / bybit-testnet-monitor / mt5-bridge (sync_state)       │
│  - Tracks FILLED -> PROTECTED -> TP1 -> BREAK EVEN -> TP2 -> CLOSED               │
│  - Updates execution_orders, trade_management_truth & trade_truth_unified       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Signal Lifecycle

### Step 1: Candle Fetching & Market Context Building
* **File:** `supabase/functions/market-scanner/index.ts` (lines 3050–3250)
* **Function:** `runMarketScanner()`
* **Mechanism:** Fetches 1h/15m OHLCV candles from Binance, Bybit, or `mt5_market_candles` (via `supabase/functions/_shared/mt5-market-data-provider.ts`). Computes ATR, EMA 20/50/200, RSI, ADX, Bollinger Bands, and Market Regime (Chop Level, Trend Strength).

### Step 2: Multi-Strategy Evaluation & Candidate Generation
* **File:** `supabase/functions/_shared/professional-strategies.ts` & `market-scanner/index.ts`
* **Evaluated Strategies:** `MicroScalper`, `CompressionBreakout`, `SwingContinuation`, `QuickScalp`, `ForexMicroScalper`, `ForexSwingContinuation`, `ForexLondonBreakout`, `ForexNewYorkContinuation`, `ForexTrendPullback`, `GoldVolatilityBreakout`.
* **Output:** Inserts records into `strategy_candidates` with `status = "candidate"`, including confidence score, risk-reward ratio, entry range, stop-loss, and take-profit targets.

### Step 3: Arbitrator Selection & Signal Approval
* **File:** `supabase/functions/_shared/arbitrator.ts`
* **Function:** `arbitrateCandidates(candidates, marketContext)`
* **Gate Checks:**
  1. Market Regime Alignment (e.g., rejecting breakout strategies in high chop > 76).
  2. Distance Guards (verifying stop loss and take profit distances against current ATR and minimum spread).
  3. Minimum Confidence Score (0.68) and Minimum RR (1.5).
  4. Deduplication against active signals on the same symbol.
* **Output:** Writes winning signal to `signals` with `status = 'APPROVED'`.

### Step 4: Dispatch & Execution Triggering
* **File:** `supabase/functions/market-scanner/index.ts` (lines 3770–3810)
* **Function:** `tryAutoExecuteTestnet(supabase, signalId, marketType)`
* **Routing:**
  * Crypto Signals -> Invokes `binance-testnet-execution` or dispatches to `bybit-demo-execution`.
  * Forex/Gold Signals -> Routes to `certified-runtime.ts` which inserts certified claims into `certified_runtime_claims` and dispatches commands to `mt5_commands`.

---

## 4. Execution Ownership Matrix

| Database Table | Primary Writer(s) | Reader(s) | Function / Module | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `signals` | `market-scanner` | `binance-testnet-execution`, `bybit-demo-execution`, `telegram-orchestrator` | `arbitrateCandidates()`, `tryAutoExecuteTestnet()` | Canonical record of generated & approved trading signals |
| `strategy_candidates` | `market-scanner` | `arbitrator.ts`, Admin UI | `runMarketScanner()` | Evaluated strategy setups before arbitration |
| `execution_orders` | `binance-testnet-execution`, `bybit-demo-execution`, `binance-testnet-monitor`, `bybit-testnet-monitor` | Admin Dashboard, Capital Manager, Trade Truth | `createExecutionOrder()`, `processMonitorCycle()` | Primary tracking for exchange orders, protection status & management state |
| `trade_management_truth` | `binance-testnet-monitor`, `bybit-testnet-monitor` | Trade Truth Adapter | `syncTradeManagementTruth()` | Records exact TP fill stages, break-even adjustments, and runner status |
| `trade_truth_unified` | `supabase/functions/_shared/trade-truth/index.ts` | Capital Manager, Risk Engine, Analytics | `upsertUnifiedTradeTruth()` | Aggregated single source of truth across exchanges & MT5 bridges |
| `connected_execution_accounts` | `execution-account-onboarding`, `mt5-accounts` | `certified-account-loader.ts`, Capital Manager | `loadCertifiedAccounts()` | Configured trading accounts (Personal & Prop) with API key refs |
| `mt5_bridge_registry` | `mt5-bridge` (`register_bridge`, `heartbeat`) | MT5 Bridge Monitor | `register_mt5_bridge()` RPC | Active MT5 bridge EA instances, leases & connection heartbeats |
| `mt5_accounts` | `mt5-accounts`, `mt5-bridge` | Capital Manager, MT5 Bridge | `sync_state` action in `mt5-bridge` | MT5 account metadata, balances, leverage, operational status |
| `mt5_commands` | `certified-runtime.ts`, `mt5-bridge` | MT5 Terminal EA | `claim_mt5_command()` RPC | Queue for MT5 execution commands (`OPEN_POSITION`, `MODIFY_PROTECTION`, etc.) |
| `mt5_account_snapshots` | `mt5-bridge` (`sync_state`) | Risk Engine, Capital Manager | `mt5-bridge` handler | Periodic balance, equity, margin, and open position snapshots from MT5 |
| `certified_runtime_claims` | `certified-runtime.ts` | `mt5-bridge` (`poll_commands`) | `claimCertifiedExecution()` | Lineage tracking verifying that MT5 commands originate from certified plans |

---

## 5. Runtime Trigger Inventory

1. **Scheduled Market Scanner Edge Function:**
   * **Path:** `supabase/functions/scheduled-market-scanner/index.ts`
   * **Trigger:** Scheduled Cron (e.g., every 5 minutes).
   * **Action:** Calls `market-scanner` Edge Function via HTTP POST using `SUPABASE_SERVICE_ROLE_KEY`.

2. **Market Scanner Direct Invocation:**
   * **Path:** `supabase/functions/market-scanner/index.ts`
   * **Trigger:** Admin UI "Scan Now" button or `scheduled-market-scanner`.
   * **Action:** Runs analysis, writes candidates, arbitrates signals, and invokes `tryAutoExecuteTestnet`.

3. **Binance Testnet Execution Endpoint:**
   * **Path:** `supabase/functions/binance-testnet-execution/index.ts`
   * **Trigger:** Called by `tryAutoExecuteTestnet` or Admin Operator Action (`force_execute`).
   * **Action:** Calculates risk, verifies account governor, places Binance futures order, places native SL/TP algo orders, and updates `execution_orders`.

4. **Bybit Demo Execution Endpoint:**
   * **Path:** `supabase/functions/bybit-demo-execution/index.ts`
   * **Trigger:** Called by `tryAutoExecuteTestnet` for Bybit-routed signals.
   * **Action:** Leverages Bybit V5 REST API to create linear USDT perp market orders with attached SL/TP.

5. **Binance Testnet Monitor Cron:**
   * **Path:** `supabase/functions/binance-testnet-monitor/index.ts`
   * **Trigger:** Cron schedule (every 1 minute) or inline trigger post-execution.
   * **Action:** Polls open positions & algo orders from Binance, manages TP1/TP2/Break-even transitions, repairs missing protection, updates `execution_orders` and `trade_truth_unified`.

6. **Bybit Testnet Monitor Cron:**
   * **Path:** `supabase/functions/bybit-testnet-monitor/index.ts`
   * **Trigger:** Cron schedule (every 1 minute).
   * **Action:** Polls Bybit V5 position and order endpoints, handles trailing/break-even logic, updates trade truth.

7. **MT5 Bridge Gateway:**
   * **Path:** `supabase/functions/mt5-bridge/index.ts`
   * **Trigger:** Inbound HTTP requests from external MT5 Terminal EAs.
   * **Actions:** `register_bridge`, `assign_account`, `heartbeat`, `poll_commands`, `ack_command`, `sync_state`.

8. **Admin Operator Actions:**
   * **Path:** `supabase/functions/admin-operator-action/index.ts`
   * **Trigger:** Admin UI controls.
   * **Actions:** Emergency panic close all positions, toggle execution mode, trigger manual reconciliation, update strategy thresholds.

---

## 6. Risk Engine Audit

### Current Implementation
* **Primary File:** `supabase/functions/_shared/professional-risk-engine.ts`
* **Key Types & Functions:**
  * `RiskDecision`, `AuthorizedEnvelope`, `RiskParameters`.
  * `evaluateProfessionalRisk(request)`: Evaluates risk parameters against global execution settings and account status.
* **Checks Implemented:**
  1. **Governor State Check:** Verifies `testnet_governor_mode` (`ENABLED`, `STRESS_OVERRIDE`, `PAUSED`).
  2. **Max Position Risk Limit:** Ensures signal risk % does not exceed account max risk limit (e.g., 1.0% per trade).
  3. **Max Open Portfolio Risk:** Sums active risk from `execution_orders` in state `entry_filled` or `protected_native`. Blocks execution if combined open risk exceeds portfolio cap (e.g., 3.0%).
  4. **Max Daily Drawdown Guard:** Reads equity/balance from `execution_settings` or `mt5_account_snapshots` to check against `max_daily_drawdown_pct`.
  5. **Leverage Scaling:** Restricts leverage based on market volatility and symbol class (e.g., 10x for crypto, 20x for forex, 50x max for gold).

### Audit Assessment & Identified Gaps
* **Production Readiness:** **PARTIAL**
* **Strengths:** Clean typescript contracts for `AuthorizedEnvelope` with cryptographic signature tracking and risk parameter caps.
* **Gaps:**
  * **Per-Account Custom Limits:** Global execution settings (`execution_settings` id=1) are heavily relied upon rather than individual account policy limits from `connected_execution_accounts` or `mt5_accounts`.
  * **News Risk Awareness:** News holding restrictions are checked in adoption adapters, but not dynamically integrated into the primary risk engine calculation.
  * **Prop Firm Drawdown Multi-Tiering:** Prop firm specific high-water mark trailing drawdown calculations are currently handled in memory during `sync_state` instead of being an immutable policy evaluated before position planning.

---

## 7. Capital Manager Audit

### Sizing Logic & Allocation
* **Primary File:** `supabase/functions/_shared/professional-capital-allocation.ts`
* **Function:** `allocateCapital(envelope, spec, marketPrice, stopLoss)`
* **Gate Sequence (Gates 0 through 9):**
  * **Gate 0 — Envelope Verification:** Validates signature and authorization timestamp.
  * **Gate 1 — Contract Specification Validation:** Ensures tick size, point size, lot step, and contract size are finite positive numbers.
  * **Gate 2 — Price & Distance Validation:** Computes absolute distance between entry and stop loss. Rejects if distance <= 0.
  * **Gate 3 — Raw Position Sizing Calculation:**
    $$\text{Risk Amount} = \text{Account Balance} \times \text{Authorized Risk \%}$$
    $$\text{Quantity} = \frac{\text{Risk Amount}}{\text{Stop Loss Distance in Price} \times \text{Contract Size}}$$
  * **Gate 4 — Step Size & Rounding:** Rounds down quantity to nearest lot step / step size (e.g., 0.01 lots for MT5, 0.001 for BTC).
  * **Gate 5 — Minimum / Maximum Lot Limits:** Enforces `min_quantity` and `max_quantity`.
  * **Gate 6 — Notional Value Check:** Verifies position notional ($Q \times P$) meets exchange minimum notional requirement (e.g., $5.00 on Binance).
  * **Gate 7 — Available Margin & Free Balance Guard:** Ensures required margin ($Q \times P / \text{Leverage}$) does not exceed free margin.
  * **Gate 8 — Max Open Exposure Guard:** Ensures total position notional does not violate account maximum exposure.
  * **Gate 9 — Final Sizing Certificate:** Generates `PositionPlan` containing exact quantity, leverage, required margin, and risk amount.

### Multi-Asset Contract Differences

| Parameter | Crypto Futures (Binance/Bybit) | Forex / Metal (MT5) |
| :--- | :--- | :--- |
| **Contract Size** | `1.0` (1 BTC = 1 BTC) | `100,000` (1 Lot EURUSD = 100,000 units), `100` for Gold |
| **Step Size / Lot Step** | `0.001` to `1.0` | `0.01` Lots |
| **Price Precision** | Variable (2 to 5 decimals) | 3 or 5 decimals (Point = 0.00001 or 0.001) |
| **Min Notional** | $5.00 USD | 0.01 Lots |

---

## 8. Binance Audit (USDM Futures Testnet)

### Complete Execution & Supervision Flow
```
1. Signal APPROVED
   ↓
2. binance-testnet-execution called
   ↓
3. Check Dual-Side Position Mode via GET /fapi/v1/positionSide/dual
   ↓
4. Verify & Set Margin Type via POST /fapi/v1/marginType (CROSSED / ISOLATED)
   ↓
5. Verify & Set Leverage via POST /fapi/v1/leverage
   ↓
6. Place Market Entry Order via POST /fapi/v1/order
   ↓
7. Parse Fill Price & Executed Quantity from Exchange Response
   ↓
8. Place Stop Loss Algo Order via POST /fapi/v1/algoOrder (STOP_MARKET, closePosition=true)
   ↓
9. Place Take Profit Algo Orders via POST /fapi/v1/algoOrder (TAKE_PROFIT_MARKET, reduceOnly=true)
   ↓
10. Insert record into execution_orders (Status: protected_native)
   ↓
11. binance-testnet-monitor runs every 60s:
    a. Queries GET /fapi/v1/openAlgoOrders and GET /fapi/v2/positionRisk
    b. Detects TP1 trigger -> Cancels old SL -> Places Break-Even SL -> Updates status to tp1_filled / profit_lock
    c. Detects Position Closed -> Computes Realized PnL -> Marks status as closed
```

### Key Endpoint Dependencies
* `POST /fapi/v1/order` — Entry Market / Limit Order
* `POST /fapi/v1/algoOrder` — Stop Loss & Take Profit Conditional Orders
* `GET /fapi/v1/openAlgoOrders` — Open Conditional Algo Orders
* `GET /fapi/v2/positionRisk` — Real-time Position & PnL Tracking
* `GET /fapi/v2/balance` — Wallet & Free Margin Verification

---

## 9. Bybit Audit (V5 Demo / Linear Perp)

### Comparison with Binance Flow

| Feature / Step | Binance USDM Testnet | Bybit V5 Demo |
| :--- | :--- | :--- |
| **API Architecture** | Separate `/fapi/v1/order` and `/fapi/v1/algoOrder` | Unified `/v5/order/create` for main & conditional orders |
| **Category** | USDM Perpetual Futures | `linear` (USDT Perpetual) |
| **Order Linking ID** | `newClientOrderId` | `orderLinkId` |
| **Stop Loss Direction** | Inferred from Position Side | Explicit `triggerDirection` (1 = Rising, 2 = Falling) |
| **Trigger Price Type** | `MARK_PRICE` or `CONTRACT_PRICE` | `MarkPrice`, `IndexPrice`, or `LastPrice` |
| **Position Close Flag** | `closePosition: true` | `reduceOnly: true` + `closeOnTrigger: true` |

### Bybit Endpoint Mapping
* `POST /v5/order/create` — Entry, SL, and TP orders
* `POST /v5/order/cancel` — Cancel active or conditional orders
* `GET /v5/position/list` — Query open linear positions
* `GET /v5/account/wallet-balance` — Check available USDT balance

---

## 10. MT5 Audit (Personal & Prop Firm Bridge)

### Architecture & Components
* **Edge Functions:** `supabase/functions/mt5-bridge/index.ts`, `supabase/functions/mt5-accounts/index.ts`
* **Shared Modules:** `_shared/certified-runtime.ts`, `_shared/mt5-market-data-provider.ts`
* **Database Tables:** `mt5_bridge_registry`, `mt5_accounts`, `mt5_commands`, `mt5_account_snapshots`, `certified_runtime_claims`
* **Database RPCs:** `register_mt5_bridge`, `assign_mt5_bridge_account`, `claim_mt5_command`

### Personal vs. Prop Account Distinction
* **`MT5_PERSONAL` Mode:**
  * Focuses on account growth, standard balance risk %, and standard trailing stops.
  * Allows overnight & weekend position holding (if broker permits).
  * Evaluated via `Mt5PersonalDemoAdoptionAdapter`.
* **`MT5_PROP` Mode:**
  * Subject to strict Prop Firm Challenge / Funded account rules.
  * Enforces Max Daily Loss (e.g., 4.5% or 5.0% based on initial/starting balance).
  * Enforces Max Total Trailing Drawdown (e.g., 8.0% or 10.0%).
  * Requires mandatory position closure prior to major economic news releases (e.g., 2 mins before NFP/CPI) and weekend market close.
  * Validated via `Mt5PropDemoAdoptionAdapter`.

### MT5 Command Lifecycle
```
1. Signal generated for Forex/Gold symbol
   ↓
2. certified-runtime.ts creates Certified Claim (certified_runtime_claims)
   ↓
3. certified-runtime.ts inserts OPEN_POSITION command into mt5_commands
   ↓
4. External MT5 Terminal EA calls mt5-bridge (action=poll_commands)
   ↓
5. mt5-bridge executes RPC claim_mt5_command(account_id, bridge_id, worker_id)
   ↓
6. RPC validates certified plan lineage and leases command to EA
   ↓
7. MT5 EA executes trade in MetaTrader terminal
   ↓
8. MT5 EA calls mt5-bridge (action=ack_command) with ticket # & fill price
   ↓
9. MT5 EA periodically calls mt5-bridge (action=sync_state) with balance, equity, open positions
```

---

## 11. Protection Audit

### Ownership & Verification Requirements
A trade is **NEVER** considered fully open or safe until Protection Verification passes.

* **Primary Verification Module:** `supabase/functions/_shared/professional-protection-verification.ts`
* **Function:** `verifyProtection(order, exchangePositions, openAlgoOrders)`
* **Verification Checklist:**
  1. **SL Order Presence:** Confirms at least 1 active Stop Loss order exists on the exchange/terminal.
  2. **Correct Side:** SL order side must be opposite to position side (SELL for Long, BUY for Short).
  3. **Quantity Match:** Sum of SL order quantities must equal or exceed position quantity.
  4. **Trigger Price Bounds:** SL trigger price must be below entry price for Longs, above entry price for Shorts.
  5. **Reduce-Only / Close-Position Flag:** Ensures SL order cannot accidentally open an opposing position.
  6. **Take-Profit Orders:** Confirms TP1 (and optionally TP2) orders are active with correct trigger prices and quantities.

### Fallback & Recovery Handling
* If native exchange protection fails to be placed or verified:
  * System updates `protection_status = 'unprotected_failed'`.
  * `binance-testnet-monitor` or `bybit-testnet-monitor` immediately attempts a protection repair retry.
  * If repair retries fail after 3 attempts, the Emergency Supervisor issues a **Market Close Emergency Command** to protect capital.

---

## 12. Trade Management Audit

### State Machine Transitions

```
[ ENTRY SUBMITTED ] 
        │
        ▼ (Fill Confirmed)
[ ENTRY FILLED ] ───► (Protection Order Placed) ───► [ PROTECTED NATIVE ]
                                                             │
                                                             ▼ (Price reaches TP1)
                                                     [ TP1 FILLED ]
                                                             │
                                                             ▼ (Move SL to Break-Even + Lock Profit)
                                                     [ BREAK EVEN / PROFIT LOCK ]
                                                             │
                                                             ▼ (Price reaches TP2 / Runner Trail)
                                                     [ TP2 FILLED / TRAILING ]
                                                             │
                                                             ▼ (Position Quantity = 0)
                                                     [ CLOSED ]
```

### Ownership of Actions
* **TP1 Partial Close:** Managed by exchange conditional order or monitor function upon price trigger. Sells `tp1_quantity` (typically 50% of position).
* **Break-Even Adjustment:** Triggered immediately following TP1 fill. Cancels original SL order and submits a new SL order at `Entry Price + Small Offset (Profit Lock)`.
* **Runner Trailing:** Tracks market price using ATR trailing stop once TP1 is secured.
* **Manual Close / Emergency Exit:** Handled via Admin Operator Actions or `mt5-bridge` `CLOSE_POSITION` command. Updates state directly in `execution_orders` and `trade_truth_unified`.

---

## 13. Account Intelligence Audit

### Capability Matrix

| Account Intelligence Feature | Status in Codebase | Implementation Evidence / Location |
| :--- | :--- | :--- |
| **Personal Account Logic** | **IMPLEMENTED** | `_shared/professional-execution-adapters.ts` (`Mt5PersonalDemoAdoptionAdapter`) |
| **Prop Firm Account Logic** | **IMPLEMENTED** | `_shared/professional-execution-adapters.ts` (`Mt5PropDemoAdoptionAdapter`) |
| **Max Daily Loss Guard** | **IMPLEMENTED** | `_shared/professional-risk-engine.ts` (`max_daily_drawdown_pct` check) |
| **Max Portfolio Exposure Guard**| **IMPLEMENTED** | `_shared/professional-risk-engine.ts` (`max_open_risk_pct` check) |
| **One Position Per Symbol Guard**| **IMPLEMENTED** | `_shared/arbitrator.ts` & `binance-testnet-execution` |
| **News Risk Restrictions** | **PARTIAL** | Flagged in `Mt5PropDemoAdoptionAdapter`, needs automated economic calendar feed |
| **Weekend Holding Lockout** | **PARTIAL** | Defined in Prop policy contracts, enforced manually by monitor routines |
| **Dynamic Risk Scale-Down** | **PARTIAL** | Sizing scales down after consecutive losses in `execution_settings`, needs account-level persistence |
| **Account Lock / Breach Mode** | **PARTIAL** | Status toggles exist in `connected_execution_accounts`, needs explicit event trigger |
| **Unified Account Brain Contract**| **MISSING (Phase 1 Target)**| Required to combine Context, Policy, Decision, and Plan into a single autonomous brain |

---

## 14. Database Contract Audit

### Primary Tables & Schema Health

1. **`signals` Table:**
   * Columns: `id`, `symbol`, `market_type`, `direction`, `timeframe`, `entry_low`, `entry_high`, `stop_loss`, `tp1`, `tp2`, `confidence_score`, `grade`, `regime`, `status`, `created_at`.
   * Integrity: Excellent. Indexed on `symbol`, `status`, `created_at`.

2. **`execution_orders` Table:**
   * Columns: `id`, `signal_id`, `exchange`, `environment`, `symbol`, `side`, `quantity`, `entry_price`, `status`, `protection_status`, `sl_order_id`, `tp1_order_id`, `tp2_order_id`, `risk_pct`, `leverage`, `execution_scope_key`, `created_at`, `updated_at`.
   * Integrity: Serves as the operational backbone for Binance & Bybit executions.

3. **`mt5_accounts` & `mt5_commands` Tables:**
   * `mt5_accounts`: Stores `user_id`, `broker`, `server`, `account_type`, `credential_ref`, `execution_enabled`, `operational`, `bridge_id`.
   * `mt5_commands`: Stores `account_id`, `bridge_id`, `operation`, `payload`, `status`, `idempotency_key`, `claimed_at`, `acknowledged_at`.
   * Integrity: Secured via RLS and RPC constraints (`claim_mt5_command`).

4. **`trade_truth_unified` Table:**
   * Unified single source of truth across all execution platforms. Integrates order fills, protection verification, and outcome tracking.

---

## 15. Runtime Conflict & Race Condition Analysis

1. **Concurrent Monitor Runs:**
   * **Issue:** `binance-testnet-monitor` runs every 60 seconds via cron, while `market-scanner` also triggers inline monitoring after trade placement.
   * **Mitigation:** Database row-level locks or explicit `last_monitor_action` timestamp checks are necessary to prevent double-canceling or duplicate break-even SL submissions.

2. **MT5 Command Claim vs. Execution Retries:**
   * **Issue:** If an MT5 EA polls commands while `certified-runtime.ts` is updating a claim, duplicate commands could theoretically be claimed if idempotency keys are not strictly checked.
   * **Mitigation:** Resolved via RPC `claim_mt5_command` which uses `idempotency_key` and atomic state updates (`status = 'claimed'`).

3. **Dual State Truth Between `execution_orders` and `trade_truth_unified`:**
   * **Issue:** Updating `execution_orders` without immediately updating `trade_truth_unified` causes temporary drift in analytics dashboards.
   * **Mitigation:** Synchronous invocation of `upsertUnifiedTradeTruth()` inside execution adapters.

---

## 16. Reuse / Improve / Replace / Retire Matrix

| Component / File | Audit Classification | Justification & Action Plan |
| :--- | :--- | :--- |
| `market-scanner/index.ts` | **REUSE** | High-performance market scanner and indicator engine. Retain as primary signal generator. |
| `_shared/arbitrator.ts` | **REUSE** | Excellent strategy arbitration and regime filtering. Retain unchanged. |
| `_shared/professional-risk-engine.ts` | **IMPROVE** | Upgrade to evaluate per-account policy limits (Prop/Personal) rather than global settings only. |
| `_shared/professional-capital-allocation.ts` | **REUSE** | Gates 0–9 sizing logic is mathematically sound and production-ready. Retain. |
| `_shared/certified-runtime.ts` | **REUSE** | Secure lineage claims for MT5 execution. Retain as foundation for MT5 Brain. |
| `binance-testnet-execution/index.ts` | **IMPROVE** | Wrap order placement logic inside a standardized `BinancePersonalBrain` module. |
| `bybit-demo-execution/index.ts` | **IMPROVE** | Standardize response mapping and integrate with `BybitPersonalBrain`. |
| `mt5-bridge/index.ts` | **REUSE** | Robust MT5 bridge gateway with secure RPCs, token auth, and state sync. Retain. |
| `_shared/professional-execution-adapters.ts` | **IMPROVE** | Refactor into full **Account Execution Brains** (`Mt5PersonalBrain`, `Mt5PropBrain`, `BinancePersonalBrain`, `BybitPersonalBrain`). |
| Legacy Unused Signal Queues | **RETIRE** | Deprecate uncertified fallback queues that bypass `certified_runtime_claims`. |

---

## 17. Recommended Target Architecture: Account Execution Brain

To achieve full hands-free autonomous capital management, HashiBot will introduce four specialized **Account Execution Brains**:
1. **`BinancePersonalBrain`** (Crypto USDM Futures)
2. **`BybitPersonalBrain`** (Crypto USDT Linear Perpetual)
3. **`Mt5PersonalBrain`** (Forex / Metals Personal Growth Accounts)
4. **`Mt5PropBrain`** (Forex / Metals Prop Firm Challenge & Funded Accounts)

### Brain Architecture Layers
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             ACCOUNT EXECUTION BRAIN                              │
│                                                                                  │
│   1. AccountExecutionContext  --> Fetches Account Metadata, Balance, Equity,     │
│                                   Open Positions, Daily Loss, Drawdown State     │
│                                                                                  │
│   2. AccountPolicy Evaluation --> Enforces Prop/Personal Rules (Daily Loss Cap,   │
│                                   Max Exposure, News Locks, Session Limits)      │
│                                                                                  │
│   3. ExecutionDecision        --> DECISION: EXECUTE | SKIP | REDUCE_RISK | LOCK  │
│                                                                                  │
│   4. PositionPlan & Sizing    --> Capital Allocation Gates 0-9 Sizing           │
│                                                                                  │
│   5. Provider Execution       --> Dispatches Orders (Binance / Bybit / MT5)      │
│                                                                                  │
│   6. Protection Verification  --> Confirms SL/TP Active & Correct on Exchange     │
│                                                                                  │
│   7. Continuous Supervision   --> Manages TP1, Break-Even, Trailing, Closure     │
│                                                                                  │
│   8. Trade Truth & Outcome    --> Syncs to Unified Trade Truth & Analytics        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 18. Phase 1 Implementation Backlog

1. **Task 1: Define Unified Account Brain Contracts** (`_shared/account-execution-brain/types.ts`)
   * Define `AccountExecutionContext`, `AccountPolicy`, `ExecutionDecision`, `RuleViolation`, and `AccountLock`.
2. **Task 2: Build `Mt5PropBrain` & `Mt5PersonalBrain` Modules**
   * Encapsulate Prop firm drawdown calculations, news restrictions, and certified MT5 command dispatch.
3. **Task 3: Build `BinancePersonalBrain` & `BybitPersonalBrain` Modules**
   * Standardize dual-side mode, margin configuration, market order entry, and native protection placement.
4. **Task 4: Implement Account Policy Evaluator**
   * Evaluate real-time daily loss, max open exposure, and symbol position locks before issuing execution authorization.
5. **Task 5: Consolidate Trade Truth Syncing**
   * Ensure single-call atomic updates to `trade_truth_unified` across all execution brains.

---

## 19. Risks & Blockers

* **Live Exchange API Rate Limits:** Frequent polling from monitor crons must strictly respect Binance and Bybit REST weight limits.
* **MT5 EA Connection Latency:** Network drops between local MT5 terminal instances and Edge Functions require robust lease expiration handling in `mt5_bridge_registry`.
* **Prop Firm News Data Feed:** Automated news risk blocking requires a reliable, low-latency economic calendar API source.

---

## 20. Evidence Appendix

### Key File Paths & Primary Exports
* `supabase/functions/market-scanner/index.ts` — `runMarketScanner()`, `tryAutoExecuteTestnet()`
* `supabase/functions/_shared/arbitrator.ts` — `arbitrateCandidates()`
* `supabase/functions/_shared/professional-strategies.ts` — `evaluateProfessionalStrategies()`
* `supabase/functions/_shared/professional-risk-engine.ts` — `evaluateProfessionalRisk()`
* `supabase/functions/_shared/professional-capital-allocation.ts` — `allocateCapital()`
* `supabase/functions/_shared/professional-protection-verification.ts` — `verifyProtection()`
* `supabase/functions/_shared/certified-runtime.ts` — `claimCertifiedExecution()`
* `supabase/functions/binance-testnet-execution/index.ts` — Binance USDM Futures Execution Handler
* `supabase/functions/bybit-demo-execution/index.ts` — Bybit V5 Linear Demo Execution Handler
* `supabase/functions/binance-testnet-monitor/index.ts` — Binance Trade Supervisor Cron
* `supabase/functions/bybit-testnet-monitor/index.ts` — Bybit Trade Supervisor Cron
* `supabase/functions/mt5-bridge/index.ts` — MT5 Gateway Handler (`heartbeat`, `poll_commands`, `ack_command`, `sync_state`)

### Database Tables & RPCs
* **Tables:** `signals`, `strategy_candidates`, `execution_orders`, `trade_management_truth`, `trade_truth_unified`, `connected_execution_accounts`, `mt5_bridge_registry`, `mt5_accounts`, `mt5_commands`, `mt5_account_snapshots`, `certified_runtime_claims`.
* **RPCs:** `register_mt5_bridge`, `assign_mt5_bridge_account`, `claim_mt5_command`.
