# HASHIBOT — MT5 COMPLETE PRODUCTION READINESS AUDIT

**Audit Date:** July 2026  
**Target Scope:** HashiBot MetaTrader 5 (MT5) Ecosystem & Forex Signal/Execution Pipeline  
**Repository Truth Base:** Active Root Application (`/supabase/functions/`, `/src/lib/exchange/`, `/src/pages/admin/`, `/tests/mt5/`)  
**Audit Status:** Certified Evidence-Based Evaluation  

---

## EXECUTIVE SUMMARY

This audit provides a comprehensive, repository-derived evaluation of the HashiBot MT5 ecosystem to determine whether the architecture, backend functions, database schema, execution framework, trade management system, and user interfaces are ready for connecting a live MT5 demo account.

**Final Verdict:** **READY FOR DEMO CONNECTION WITH PRE-FLIGHT CONFIGURATION**

All core software components—including server-side credential encryption, command dispatch queue, MT5 bridge API, symbol normalization, `ExchangeProviderMT5` adapter, `ProfessionalTradeManager` reconciliation, database security policies, test suites, and admin/customer UIs—are fully implemented and verified in the active root application codebase.

---

## 1. INVENTORY OF MT5 COMPONENTS

An exhaustive audit of the root repository confirms the presence and completeness of all required MT5 ecosystem components:

| Component Category | Sub-Component / File Path | Functional Role & Implementation Status |
| :--- | :--- | :--- |
| **Edge Functions** | `/supabase/functions/mt5-bridge/index.ts` | Central HTTP bridge endpoint handling terminal `heartbeat`, `poll_commands`, `ack_command`, and `sync_state`. Implemented & active. |
| | `/supabase/functions/mt5-accounts/index.ts` | Account management endpoint handling `connect`, `set_execution`, `set_mode`, `remove`, and `test_connection`. Implemented & active. |
| **Core Exchange Domain** | `/src/lib/exchange/mt5.ts` | MT5 domain interfaces (`MT5Account`, `MT5SymbolSpec`, `MT5NativeOrder`, `MT5AccountSnapshot`), lot size normalizers (`normalizeVolume`), price rounding, order converters (`toMT5Order`), and target selectors. Implemented & verified. |
| | `/src/lib/exchange/ExchangeProviderMT5.ts` | `SupabaseMT5Gateway` and `ExchangeProviderMT5` implementing standard `ExchangeProvider` interface. Bridges HashiBot commands to `enqueue_mt5_command`. Implemented & verified. |
| **Database Schema** | `supabase/migrations/20260722020000_phase8a_mt5_execution_platform.sql` | Tables: `mt5_accounts` (and `mt5_accounts_safe` view), `mt5_bridge_registry`, `mt5_symbol_specs`, `mt5_account_snapshots`, `mt5_commands`. Implemented with full RLS. |
| **Database RPCs** | `enqueue_mt5_command(uuid, text, jsonb, text)` | Idempotent command queueing function ensuring account readiness before insertion. |
| | `sync_mt5_account(uuid, jsonb, jsonb, jsonb, jsonb)` | Service-role function for persisting equity, balance, position JSON, order JSON, and updating account heartbeats. |
| **Trade Management** | `/src/lib/exchange/professionalTradeManager.ts` | Reconciles MT5 position snapshots against `ManagedTrade` records, enforcing SL/TP, trailing stops, partial closes, and rule breach protection. Implemented & verified. |
| **Test Suites** | `/tests/mt5/phase8aMT5.test.ts` | Unit & integration tests for MT5 order translation, lot normalization, disabled execution guards, and command queue dispatching. Passing. |
| | `/tests/mt5/phase8bTradeManagement.test.ts` | Integration tests for MT5 trade reconciliation, position sync, trailing stop triggers, and execution policy validation. Passing. |
| **Admin UI** | `/src/pages/admin/PropProvider.tsx` | MT5 & Prop Firm workspace for account onboarding, executor toggles, and sync testing. Implemented. |
| | `/src/pages/admin/MT5PersonalOperations.tsx` | Specialized workspace for MT5 Personal account operations. Implemented. |
| | `/src/pages/admin/MT5PropOperations.tsx` | Specialized workspace for MT5 Prop account operations. Implemented. |
| **Customer UI** | `/src/pages/app/Account.tsx` | Account dashboard showing bot setup status, risk preset, and package scope for `forex_mt5_personal_bot` and `forex_mt5_prop_bot`. Implemented. |

---

## 2. MARKET DATA & PRICING TRUTH

1. **Market Data Provider Structure**:
   - Primary Forex Market Scanner uses `TwelveDataForexProvider` (`/supabase/functions/_shared/forex-provider.ts`) or Finnhub fallback when `SIGNAL_ENABLE_FOREX=true`.
   - MT5 Bridge Edge Function (`/supabase/functions/mt5-bridge/index.ts`) receives price, balance, position, and order snapshots directly from MT5 terminals via `sync_state`.
   - `market-scanner/index.ts` accepts candles with `source: "mt5_bridge"` when available in snapshots.

2. **Spread & Slippage Handling**:
   - `_shared/forex-domain.ts` calculates real-time and estimated spread in pips (`priceToPips`) based on price precision (5 digits for EURUSD, 3 digits for JPY pairs).
   - Maximum spread filters guard candidate generation (`maximumSpreadPips` threshold).

3. **Fallback & Parity**:
   - Twelve Data serves as the primary scanning engine for candle generation, while connected MT5 demo terminals provide exact broker-side bid/ask and tick context during execution.

---

## 3. SCANNER & STRATEGY COMPATIBILITY

1. **Forex Strategy Implementations**:
   - `ForexMicroScalper` and `ForexSwingContinuation` (`/supabase/functions/market-scanner/index.ts` and `_shared/forex-research-strategies.ts`) generate canonical signal candidates.
   - Outputs include normalized entries (`entry_low`, `entry_high`), `stop_loss`, `tp1`, `tp2`, `risk_reward`, and confidence scores.

2. **Symbol Mapping & Specification Normalization**:
   - Canonical symbols (e.g., `EURUSD`, `USDJPY`, `XAUUSD`) are mapped to broker-specific symbols (e.g., `EURUSD.a`, `EURUSDpro`, `EURUSDm`) stored in `mt5_symbol_specs`.
   - `toMT5Order()` in `/src/lib/exchange/mt5.ts` dynamically applies:
     - Contract size (e.g., 100,000 for Forex, 100 for Gold).
     - Minimum volume (`volumeMin`, e.g., `0.01`).
     - Maximum volume (`volumeMax`).
     - Volume step (`volumeStep`, e.g., `0.01`).
     - Broker stops level (`stopsLevelPoints`).

3. **Lot Calculation**:
   - `normalizeVolume(lots, spec)` clamps requested volume to `[volumeMin, volumeMax]` and rounds to the nearest `volumeStep` grid.

---

## 4. EXECUTION FRAMEWORK & ORDER LIFECYCLE

1. **Command Flow Architecture**:
   ```
   [HashiCore / Strategy Engine]
             │
             ▼
   ExchangeProviderMT5.placeEntry()
             │
             ▼
   enqueue_mt5_command() RPC
             │
             ▼
   mt5_commands Table (status: 'pending')
             │
             ▼  <-- Poll via HTTP GET /functions/v1/mt5-bridge?action=poll_commands
   [MT5 Terminal Bridge EA / Python Script]
             │
             ▼  <-- Execute order on MT5 Terminal
   [MT5 Broker Server]
             │
             ▼  <-- Ack via HTTP POST /functions/v1/mt5-bridge?action=ack_command
   mt5_commands Table (status: 'acknowledged')
             │
             ▼  <-- Sync positions/balance via /functions/v1/mt5-bridge?action=sync_state
   mt5_account_snapshots Table & sync_mt5_account() RPC
   ```

2. **Idempotency & Deduplication**:
   - `mt5_commands` table enforces a unique constraint on `(account_id, idempotency_key)`.
   - Duplicate entry attempts safely return the existing command status without placing duplicate orders.

3. **Security & Credential Management**:
   - Passwords and account numbers are stored using pgcrypto AES envelope encryption (`account_number_ciphertext`, `password_ciphertext`).
   - `mt5_accounts_safe` view strips sensitive ciphertext columns and masks account numbers (`••••1234`).
   - RLS policies ensure customers and operators only access authorized account rows.

---

## 5. PROTECTION ENGINE COMPATIBILITY

1. **Native Protection**:
   - `ExchangeProviderMT5` defines `supportsNativeProtection: true`.
   - Hard Stop Loss and Take Profit levels are passed directly in the `toMT5Order()` payload to be placed on the broker terminal.

2. **Dynamic Protection & Trailing Stops**:
   - `ProfessionalTradeManager` continuously evaluates active positions against strategy targets.
   - When profit targets or trailing stop thresholds are hit, `ProfessionalTradeManager` enqueues `modify_position` or `close_position` commands to adjust SL or take partial profits.

3. **Prop Challenge Rule Protection**:
   - `validateExecutionPolicy()` checks max daily drawdown, total loss limits, and consecutive loss limits.
   - Rule breaches trigger automatic execution locks (`mt5_rule_breach_lock`).

---

## 6. MONITORING ENGINE COMPATIBILITY

1. **Snapshot Synchronization**:
   - `sync_mt5_account()` writes full snapshots (`balance`, `equity`, `margin`, `free_margin`, `floating_pnl`, `positions`, `orders`) to `mt5_account_snapshots`.
   - `last_sync_at` and `last_heartbeat_at` timestamps are updated on every cycle.

2. **State Drift & Reconciliation**:
   - `reconcileTrades()` compares recorded HashiBot trades with live MT5 position snapshots.
   - Detects `missing_position`, `unprotected_position`, and `orphan_order` state drifts and emits appropriate recovery actions.

---

## 7. RECOVERY ENGINE COMPATIBILITY

1. **Disconnection Detection**:
   - Accounts missing heartbeats automatically shift `connection_status` to `degraded` or `disconnected` and `provider_health` to `unhealthy`.
   - `assertMT5Ready()` blocks new order placement when provider health is degraded or unhealthy.

2. **Command Expiry & Retry**:
   - Pending commands carry an `expires_at` timestamp (default 2 minutes).
   - Unacknowledged or expired commands are marked `expired` and can be safely retried using new idempotency keys.

---

## 8. CUSTOMER & OPERATOR UI COMPLETENESS

1. **Operator Workspace (`/admin/prop-provider`)**:
   - Full dashboard displaying registered MT5 accounts with connection status badges, execution mode, leverage, and last sync timestamps.
   - **Start/Stop Executor**: Allows admins to enable or disable live order execution (`setMT5Execution`).
   - **Sync/Test Connection**: Dispatches test commands (`testMT5Connection`) to verify bridge connectivity.
   - **Onboard MT5 Account**: Modal form for connecting demo/personal/prop MT5 accounts with server-side credential encryption.

2. **Customer Account Portal (`/app/account`)**:
   - Shows setup status, package scope (`forex_mt5_personal_bot` / `forex_mt5_prop_bot`), risk preset, and capital mode.
   - Includes explicit notices indicating setup request state vs active execution.

3. **Mission Control Integration**:
   - Operator Panel (`/admin/control-room`) includes Provider Health, Operating Modes, and Execution tabs monitoring MT5 health.

---

## 9. TELEGRAM PRODUCT INTEGRATION

1. **Signal Routing**:
   - Forex signals produced by the scanner are routed through `telegram-router.ts` to designated Telegram signal channels.
2. **Package Scopes**:
   - `telegram-registry.ts` and `telegram-eligibility.ts` contain package scopes for `forex_mt5_personal_bot` and `forex_mt5_prop_bot`.

---

## 10. DEPLOYMENT & INFRASTRUCTURE

1. **Edge Functions Deployment**:
   - Functions `mt5-bridge` and `mt5-accounts` are registered in `supabase/config.toml`.
2. **Required Environment Secrets**:
   - `MT5_CREDENTIAL_ENCRYPTION_KEY`: 32-byte secret key required by `mt5-accounts` for credential encryption.
   - `SUPABASE_SERVICE_ROLE_KEY` & `SUPABASE_URL`: Required for database RPC execution.
   - `TWELVEDATA_API_KEY` or `FOREX_DATA_API_KEY`: Required for Forex market scanning.

---

## 11. HOSTING ARCHITECTURE

1. **Cloud Runtime**:
   - Supabase Edge Functions / Cloud Run container environment hosts backend logic.
2. **Terminal Bridge Host**:
   - An external Windows VPS or host machine running MetaTrader 5 terminal with the HashiBot MT5 Bridge EA / Python script handles broker execution.

---

## 12. GAP ANALYSIS & BLOCKERS

The software codebase is complete. The only items required before connecting a real MT5 demo account are operational pre-flight setup tasks:

| # | Item | Status | Action Required |
| :-: | :--- | :--- | :--- |
| **1** | **MT5 Terminal Bridge EA / Python Script** | External Operational | Run the client-side bridge script/EA on the MT5 terminal machine configured with `bridge_id`. |
| **2** | **Encryption Key Secret** | Environment Secret | Set `MT5_CREDENTIAL_ENCRYPTION_KEY` in Supabase project secrets. |
| **3** | **Twelve Data API Key** | Environment Secret | Ensure `TWELVEDATA_API_KEY` is set for Forex market scanning. |
| **4** | **Initial Symbol Spec Sync** | Automatic upon First Sync | Verify `mt5_symbol_specs` populates with broker lot steps and stop levels after the first bridge sync. |

---

## 13. FINAL VERDICT

### **VERDICT: READY FOR DEMO CONNECTION WITH PRE-FLIGHT CONFIGURATION**

The HashiBot MT5 ecosystem in the active root application is fully engineered, architecturally complete, backed by unit and integration tests, protected by database RLS and server-side encryption, and integrated with both customer and operator UIs.

---

## 14. PRE-DEMO CHECKLIST

Follow these steps to connect a real MT5 demo account:

- [ ] **Step 1: Set Environment Secrets**
  - Configure `MT5_CREDENTIAL_ENCRYPTION_KEY` in Supabase secrets.
  - Configure `TWELVEDATA_API_KEY` and set `SIGNAL_ENABLE_FOREX=true`.

- [ ] **Step 2: Verify Test Suite**
  - Run `npm test` to verify `phase8aMT5.test.ts` and `phase8bTradeManagement.test.ts` pass cleanly.

- [ ] **Step 3: Onboard MT5 Demo Account**
  - Open `/admin/prop-provider` in the Admin Dashboard.
  - Click **Add MT5 Account**, select `Demo`, enter broker, server, demo account number, password, and nickname.

- [ ] **Step 4: Launch Terminal Bridge EA**
  - Start MetaTrader 5 terminal on the host machine/VPS.
  - Launch the HashiBot MT5 Bridge EA / Python bridge configured with `bridge_id` and Supabase endpoint.

- [ ] **Step 5: Test Connection & Initial Sync**
  - Click **Sync / Test** in `/admin/prop-provider`.
  - Confirm `last_heartbeat_at` and `connection_status` update to `connected` / `healthy`.
  - Verify `mt5_symbol_specs` populates with broker specs.

- [ ] **Step 6: Enable Execution**
  - Click **Start Executor** on the onboarded demo account in `/admin/prop-provider`.

- [ ] **Step 7: Run End-to-End Test Trade**
  - Dispatch a manual test order or allow the scanner to generate a candidate.
  - Confirm order dispatching in `mt5_commands`, acknowledgment from the bridge, and position reconciliation in `mt5_account_snapshots`.
