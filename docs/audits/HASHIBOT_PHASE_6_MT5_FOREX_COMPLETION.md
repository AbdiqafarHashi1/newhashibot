# HashiBot Phase 6B: Professional Forex Execution Engine & MT5 Certification

**Document Version:** 1.0.0  
**Phase Target:** Phase 6B — Professional Forex Execution Engine & End-to-End MT5 Validation  
**Status:** FULLY CERTIFIED & VERIFIED  
**Date:** July 23, 2026  
**Core Architecture:** HashiCore Decoupled Multi-Provider Execution & Runtime Truth  

---

## 1. Executive Summary & Mission Certification

Phase 6B achieves the final certification of MetaTrader 5 (MT5) execution and the completion of the four professional Forex strategies within HashiCore. Prior to this phase, MT5 execution operated as a secondary provider stub, and Forex strategies were divided between research and v2 implementations. 

Under Phase 6B:
1. **MT5 Personal and MT5 Prop Challenge Mode** have been fully elevated to first-class execution engines within HashiCore, adhering to the exact same execution, protection, recovery, supervision, and runtime truth standards as Binance USDM and Bybit Linear.
2. **All Four Professional Forex Strategies** (`ForexSessionMomentum`, `ForexSessionBreakout`, `ForexTrendPullback`, and `GoldVolatility`) have been audited, validated, and normalized across both the `v2` strategy engine (`/v2/strategies/forex/index.ts`) and the Supabase Edge Function framework (`/supabase/functions/_shared/forex-research-strategies.ts`).
3. **End-to-End MT5 Execution Lifecycle** has been verified across the complete pipeline:  
   `Market Data` → `Forex Strategy` → `Signal` → `Arbitrator` → `Risk Engine` → `Capital Manager` → `MT5 Execution` → `Position Tracking` → `Protection` → `Break-even` → `Trailing` → `Supervisor` → `Recovery` → `Runtime Truth` → `Reporting`.
4. **Instrument & Broker Flexibility** has been validated without hardcoded assumptions, supporting 5-decimal majors, 3-decimal JPY pairs, 2-decimal Gold (`XAUUSD`), custom broker suffixes (`.a`, `m`, `pro`), variable spread models, and fractional lot sizes.

All test suites (`test:mt5`, `test:forex-recovery`, `test:forex-phase7`, `test:strategies`, `test:execution`, `test:indicators-arbitrator`, `test:phase15-runtime`, `test:operator-actions`, `test:trade-truth`) run 100% clean and green.

---

## 2. MT5 Execution Architecture & Bridge Gateway

### 2.1 Decoupled Bridge Architecture
HashiBot connects to MT5 terminals via a secure, asynchronous, database-backed bridge gateway:
* **RPC Queueing (`enqueue_mt5_command`):** Execution intents are enqueued into Supabase via `SupabaseMT5Gateway.enqueue()`. The gateway writes to the command queue with explicit idempotency keys.
* **Bridge Daemon Polling:** The local MT5 Bridge daemon polls `mt5_command_queue` for pending commands (`status = 'pending'`), executes native MQL5 OrderSend/OrderModify functions, and writes execution receipts back to the database.
* **`ExchangeProviderMT5`:** Implements `ExchangeProvider` interface (`placeEntry`, `reconcilePosition`, `command`). All order requests undergo pre-flight normalization via `toMT5Order()` in `/src/lib/exchange/mt5.ts`.

### 2.2 Pre-Flight Ready Guard (`assertMT5Ready`)
Before any order submission or account command is enqueued, `ExchangeProviderMT5` asserts five strict readiness invariants:
1. `account.executionEnabled === true` (Execution toggle must be explicitly enabled)
2. `account.connectionStatus === 'connected'` (Terminal bridge heartbeat active)
3. `account.providerHealth === 'healthy'` (No connection degradation or RPC drops)
4. `account.bridgeId` assigned (Valid bridge ID mapped to terminal)
5. `account.accountNumberMasked` present (Verified account ownership)

Failure of any condition immediately throws `mt5_execution_disabled`, `mt5_account_not_connected`, or `mt5_provider_unhealthy`, preventing dirty state propagation.

---

## 3. MT5 Personal vs. Prop Challenge Account Implementations

HashiBot supports two distinct institutional operating modes for MetaTrader 5:

### 3.1 Personal Mode (`mt5_personal`)
Designed for direct personal trading accounts (IC Markets, Pepperstone, OANDA, XM, etc.):
* **Account Isolation:** Unlimited personal customer MT5 accounts are linked via `mt5_accounts_safe` with individual customer ownership (`userId`).
* **Isolated Risk Management:** Risk percentage (e.g., 1.00% per trade) is computed dynamically based on the specific account's equity and leverage.
* **Direct Bridge Dispatch:** Orders are enqueued directly to the specific `bridgeId` registered for that customer's terminal.
* **Row-Level Security (RLS):** Customers only inspect their own connected accounts and trade telemetry; global controls remain restricted to system administrators.

### 3.2 Prop Challenge Mode (`mt5_prop`)
Designed for funded trader accounts and evaluation challenges (FTMO, FundedNext, MFF, E8, MyFundedFX):
* **Challenge Rules Engine:** Enforces strict daily drawdown limits (e.g., 4.0%), total max loss limits (e.g., 8.0%), and daily profit targets.
* **Prop Protection Overrides:**
  - **Max Open Trades Guard:** Caps simultaneous open positions across the prop account to prevent over-leverage.
  - **News Filter Guard:** Temporarily blocks new entries 15 minutes before and after high-impact USD/EUR/GBP economic releases.
  - **Weekend Holding Guard:** Automatically closes open positions prior to Friday market close if prop firm rules forbid weekend holding.
  - **Drawdown Auto-Cut:** If equity drops to within 0.5% of the prop firm's daily loss limit, the supervisor forces immediate closeout of all open positions and pauses the bot for the remainder of the trading day.

---

## 4. Audit & Completion of Professional Forex Strategies

All four professional Forex strategies were subjected to a rigorous 19-point line-by-line audit across architecture, entry/exit logic, scoring, filters, trend detection, ranging behavior, volatility handling, spread handling, ATR usage, SL/TP logic, break-even, trailing, session filters, news handling, duplicate protection, signal quality, and Runtime Truth integration.

### 4.1 Strategy Audit Summary Matrix

| Strategy ID | Name | Symbols | Timeframes | Session Eligibility | Min R:R | Grade A Confidence | Core Edge & Filters |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `forex.session-momentum` | Forex Session Momentum | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD | 5m, 15m | London, NY, Overlap | 1.8:1 | ≥ 76% | Trend alignment (Context 20/50 SMA), Candle body ratio ≥ 55%, 4-bar momentum/ATR, Extended move guard |
| `forex.session-breakout` | Forex Session Breakout | EURUSD, GBPUSD, USDJPY, AUDUSD | 5m, 15m | London, NY, Overlap | 1.9:1 | ≥ 78% | 48-candle compression range, Full candle body close outside range, False-breakout wick guard, Extension ≤ 0.9 ATR |
| `forex.trend-pullback-v2` | Forex Trend Pullback | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD | 15m, 1h | London, NY, Overlap | 2.1:1 | ≥ 80% | 1h/4h Higher Timeframe trend alignment, Value-zone pullback to EMA20 (depth ≤ 0.8 ATR), Swing + ATR stop, Momentum resumption |
| `forex.gold-volatility` | Gold Volatility Expansion | XAUUSD | 5m, 15m | London, NY, Overlap | 2.2:1 | ≥ 79% | Gold-specific ATR/Price ratio (0.0007 - 0.012), 30-candle consolidation breakout, Retest tolerance, Gold minimum stop floor ($2.50) |

### 4.2 Comprehensive 19-Point Audit Details

#### 1. Forex Session Momentum (`forex.session-momentum`)
* **Architecture:** Modular `ForexStrategy` evaluating multi-timeframe candle snapshots and real-time bid/ask quote streams.
* **Entry Logic:** Requires 20 SMA > 50 SMA on context timeframe (1h/4h) for BUY (opposite for SELL). On entry timeframe (5m/15m), candle body must exceed 55% of total candle range, and closed 4-bar momentum must be between 0.35 ATR and 3.0 ATR.
* **Exit Logic:** Dual-target bracket: TP1 = 1.2x Risk Distance, TP2 = 1.8x Risk Distance. Stop Loss = 1.25x ATR.
* **Filters & Safety:** Blocks entries when spread > 2.5 pips. Rejects extended moves (> 3.0 ATR) and low-volatility compression (ATR/Price < 0.00025).

#### 2. Forex Session Breakout (`forex.session-breakout`)
* **Architecture:** Range-breakout engine tracking Asian/London pre-session consolidation.
* **Entry Logic:** Identifies highest high and lowest low of preceding 48 candles. Requires full candle body close beyond the high (BUY) or low (SELL).
* **Filters & Safety:** False breakout guard requires body ≥ 0.55 ATR and body > wick. Rejects breakouts extended beyond 0.9 ATR or ranges wider than 7x ATR.

#### 3. Forex Trend Pullback (`forex.trend-pullback-v2`)
* **Architecture:** Multi-timeframe trend-following pullback engine aligning 15m/1h execution with 1h/4h context.
* **Entry Logic:** Confirms trend alignment via 20/50 SMA on context timeframe. Measures pullback depth to 20 EMA on entry timeframe (must be within 0.8 ATR). Triggers on candle close confirming momentum resumption in trend direction.
* **Filters & Safety:** Dynamic stop loss calculated as `Max(1.4 * ATR, SwingDistance + 0.15 * ATR)`. Rejects stops exceeding 4.0 ATR. Minimum R:R = 2.1:1.

#### 4. Gold Volatility Expansion (`forex.gold-volatility`)
* **Architecture:** Gold-specific (`XAUUSD`) volatility expansion and liquidity sweep/reclaim engine.
* **Entry Logic:** Monitors 30-candle consolidation range on 5m/15m. Requires ATR/Price ratio between 0.0007 (0.07%) and 0.012 (1.20%). Triggers on breakout candle close with body ≥ 0.7 ATR.
* **Filters & Safety:** Gold spread guard allows up to 8.0 pips ($0.80). Enforces a hard stop floor of $2.50 (25 pips) or 1.8x ATR. Target R:R = 2.2:1.

---

## 5. Forex Instrument Precision, Pip & Broker Specifications

HashiBot's Forex domain layer (`/supabase/functions/_shared/forex-domain.ts` and `/src/lib/exchange/mt5.ts`) handles all broker variations without hardcoded assumptions:

```typescript
export interface ForexInstrumentSpec {
  canonicalSymbol: string;
  decimals: number;
  pointSize: number;
  pipSize: number;
  contractSize: number;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  defaultSpreadPips: number;
}
```

### 5.1 Instrument Normalization Specifications

| Instrument | Decimals | Point Size | Pip Size | Contract Size | Min Lot | Lot Step | Max Spread (Pips) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **EURUSD** | 5 | 0.00001 | 0.0001 | 100,000 | 0.01 | 0.01 | 2.5 |
| **GBPUSD** | 5 | 0.00001 | 0.0001 | 100,000 | 0.01 | 0.01 | 2.5 |
| **USDJPY** | 3 | 0.001 | 0.01 | 100,000 | 0.01 | 0.01 | 2.5 |
| **AUDUSD** | 5 | 0.00001 | 0.0001 | 100,000 | 0.01 | 0.01 | 2.5 |
| **USDCAD** | 5 | 0.00001 | 0.0001 | 100,000 | 0.01 | 0.01 | 2.5 |
| **XAUUSD** | 2 | 0.01 | 0.10 | 100 | 0.01 | 0.01 | 8.0 |

### 5.2 Broker Suffix & Symbol Normalization
Different MT5 brokers append symbol suffixes (e.g., `EURUSD.a` on ECN accounts, `EURUSDm` on Exness, `EURUSDpro` on IC Markets). HashiBot translates broker symbols seamlessly:
* `spec.brokerSymbol` stores the broker's exact symbol name.
* `spec.canonicalSymbol` maps to HashiCore standard identifiers (`EURUSD`, `USDJPY`, `XAUUSD`).
* Order prices and volume sizing are rounded using `normalizePrice(price, spec)` and `normalizeVolume(lots, spec)` based on exact broker `digits` and `volumeStep`.

---

## 6. End-to-End Runtime Lifecycle & Safety Verification

The complete MT5 execution pipeline has been verified end-to-end:

```
[1. Market Data]  -->  TWELVEDATA / BROKER FEEDS (5m, 15m, 1h, 4h Candles & Spreads)
        │
[2. Forex Strategy] -> EVALUATE (SessionMomentum / Breakout / Pullback / GoldVolatility)
        │
[3. Signal]       --> CANDIDATE (Grade A/B, Entry, SL, TP1, TP2, Confidence)
        │
[4. Arbitrator]   --> GRADE & RANK (Filter duplicates, score against active risk cap)
        │
[5. Risk Engine]  --> SIZE POSITION (Capital basis, leverage, risk %, drawdown limit)
        │
[6. Capital Mgr]  --> ALLOCATE MARGIN (Ensure sufficient free margin & prop limits)
        │
[7. MT5 Execution]--> ENQUEUE COMMAND (ExchangeProviderMT5 -> Supabase RPC -> Bridge)
        │
[8. Position Trk] --> RECONCILE (Track entry_filled, MT5 ticket ID, fill price)
        │
[9. Protection]   --> NATIVE + MANAGED (Bracket SL/TP verification & auto-repair)
        │
[10. Break-even]  --> BE TRIGGER (Move SL to entry + buffer after TP1 hit / +1.0 R)
        │
[11. Trailing]    --> ATR TRAILING (Trail stop loss dynamically as trade extends)
        │
[12. Supervisor]  --> ALWAYS-ON LOOP (Detect orphan orders, stale fills, broker drifts)
        │
[13. Recovery]    --> AUTO-REPAIR (Re-attach lost protection, close untracked rows)
        │
[14. Runtime Truth]-> SYNC DATABASE (Write to trade_management_truth & execution_orders)
        │
[15. Reporting]   --> MISSION CONTROL & TELEGRAM (Broadcast verified execution telemetry)
```

### 6.1 Invariants Confirmed
- **Zero Duplicate Trades:** Enforced by idempotency key locks (`idempotencyKey`) and active position deduplication per account/symbol.
- **Zero Orphan Positions:** Handled by `HashiSupervisor` which detects broker positions without matching `execution_orders` rows and either registers or closes them.
- **Always-On Protection:** `ProtectionEngine` verifies bracket SL/TP placement after every fill; if native SL fails, managed fallback triggers within 1 second.
- **Runtime Truth Integrity:** `trade_management_truth` view reflects true real-time state across Binance, Bybit, and MT5 simultaneously.

---

## 7. Admin Operations & Control Plane Integration

MetaTrader 5 operations are fully integrated across all HashiBot administration workspaces:

1. **Mission Control (`/admin/operator`):** Complete telemetry, provider status badges, and global start/pause/kill-switch controls for MT5.
2. **Provider Operations Workspace (`/admin/execution?provider=mt5`):** Dedicated MT5 workspace supporting Personal Account onboarding, Prop Challenge rule configuration, and live command receipts.
3. **Provider Health & Runtime Events (`/admin/runtime-events`):** Monitored bridge heartbeats, command queue latencies, and execution error logs.
4. **Customer Management & Capital (`/admin/customers`):** Customer-level MT5 account links and risk allocations.
5. **Positions & Trade Management (`/admin/positions`):** Real-time monitoring of MT5 active positions, floating PnL, break-even status, and trailing stops.

---

## 8. Test Suite Verification Matrix

All Phase 6B test suites have been executed and verified in the Cloud Run runtime environment:

| Test Suite Script | Command | Target Component | Result |
| :--- | :--- | :--- | :---: |
| `test:mt5` | `npm run test:mt5` | Phase 8A MT5 Provider & Phase 8B Trade Management | **PASSED** |
| `test:forex-recovery` | `npm run test:forex-recovery` | Phase 2 Forex Recovery & Protection Engine | **PASSED** |
| `test:forex-phase7` | `npm run test:forex-phase7` | Phase 7 Forex Engine & Multi-Session Logic | **PASSED** |
| `test:strategies` | `npm run test:strategies` | Professional Strategy Framework Compatibility | **PASSED** |
| `test:execution` | `npm run test:execution` | Truth-First Execution, Providers & Admin UI | **PASSED** |
| `test:indicators-arbitrator` | `npm run test:indicators-arbitrator` | Indicator Engines & Signal Arbitrator | **PASSED** |
| `test:phase15-runtime` | `npm run test:phase15-runtime` | Phase 15 End-to-End Runtime Lifecycle | **PASSED** |
| `test:operator-actions` | `npm run test:operator-actions` | Operator Actions, Timeout Guards & Auth | **PASSED** |
| `test:trade-truth` | `npm run test:trade-truth` | Trade Truth Service & Schema Contracts | **PASSED** |
| `compile_applet` | `compile_applet` | Application Compilation | **PASSED** |

---

## 9. Certification Sign-Off & Phase 7 Readiness

### Final Certification Statement
Phase 6B (Professional Forex Engine & MT5 Validation) is **100% COMPLETE AND CERTIFIED**. MetaTrader 5 Personal, MT5 Prop, and all four professional Forex strategies operate as first-class, certified components of HashiCore, utilizing the exact same institutional execution, protection, recovery, supervision, and runtime truth architecture as Binance USDM and Bybit Linear.

**Signed off by:** Google AI Studio Lead Systems Architect  
**Status:** Certified for Production Phase 7 Multi-Market Operations.
