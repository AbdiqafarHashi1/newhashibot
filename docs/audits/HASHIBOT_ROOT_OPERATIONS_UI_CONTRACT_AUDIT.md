# HashiBot Root Operations & Product UI Contract Audit

**Phase:** Phase 1 — Root Operations UI and Backend Contract Audit  
**Date:** July 23, 2026  
**Status:** Certified Audit & Specification  
**Target Architecture:** Active Root Application (`/src`, `/supabase`, `/tests`)  
**Scope:** Active Root Application / Runtime ONLY (v2/ inspected as historical reference only)

---

## 1. Executive Summary & Architecture Boundary

HashiBot is a unified, real-time trading signal intelligence and auto-execution platform. This audit inspects the **active root codebase** to establish the contract map for Phase 2 Operations and Product UI consolidation.

### Critical Repository Boundary Rule
- All operational interfaces, runtime logic, and customer components must be implemented strictly within the **active root directory** (`/src`, `/supabase`).
- The `/v2` folder represents an abandoned standalone prototype and is strictly treated as historical reference. No code shall be added or edited inside `/v2`.

### Locked Single-Runtime Architecture
HashiBot enforces a unified pipeline across all markets (Crypto & Forex):

```
                     ┌─────────────────────────────────────────┐
                     │          ONE SCANNER RUNTIME            │
                     │      (scheduled-market-scanner)         │
                     └────────────────────┬────────────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     │            market-scanner               │
                     │  ┌───────────────────┬───────────────┐  │
                     │  │ Crypto Adapter    │ Forex Adapter │  │
                     │  │ (Binance Candles) │ (Twelve Data) │  │
                     │  └───────────────────┴───────────────┘  │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │             ONE ARBITRATOR              │
                     │      (_shared/arbitrator.ts)            │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │       ONE IMMUTABLE SIGNAL TRUTH        │
                     │            (signals table)              │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │            EXECUTION ROUTER             │
                     │  (by Customer / Account / Provider)     │
                     │  ┌─────────────┬────────────┬────────┐  │
                     │  │ Binance     │ Bybit      │ MT5    │  │
                     │  │ Testnet     │ Prop       │ Bridge │  │
                     │  └─────────────┴────────────┴────────┘  │
                     └─────────────────────────────────────────┘
```

**Forex Proof**: Forex is **not** a separate scanner process. It is a market adapter module integrated directly inside `supabase/functions/market-scanner/index.ts` running sequentially alongside Crypto during the same scan lifecycle.

---

## 2. Route Inventory & Page Classification

### 2.1 Public & Customer Routes
| Route | Component File | Description | Action |
| :--- | :--- | :--- | :--- |
| `/` | `src/pages/public/Home.tsx` | Landing page | Keep |
| `/signal-mode` | `src/pages/public/SignalMode.tsx` | Signal mode overview | Keep |
| `/personal-ea` | `src/pages/public/PersonalEA.tsx` | Personal EA product info | Keep |
| `/prop-ea` | `src/pages/public/PropEA.tsx` | Prop EA product info | Keep |
| `/pricing` | `src/pages/public/Pricing.tsx` | Subscription pricing | Keep |
| `/results` | `src/pages/public/Results.tsx` | Public performance proof | Keep |
| `/faq` | `src/pages/public/FAQ.tsx` | Frequently asked questions | Keep |
| `/login` | `src/pages/auth/Login.tsx` | User login | Keep |
| `/register` | `src/pages/auth/Register.tsx` | User registration | Keep |
| `/admin/setup` | `src/pages/auth/AdminSetup.tsx` | Admin bootstrap setup | Keep |
| `/app/dashboard` | `src/pages/app/Dashboard.tsx` | Customer Signal Portal | Extend |
| `/app/signals` | `src/pages/app/ActiveSignals.tsx` | Active signals feed | Extend |
| `/app/signals/:id` | `src/pages/app/SignalDetail.tsx` | Signal detailed view | Extend |
| `/app/telegram` | `src/pages/app/TelegramSetup.tsx` | Customer Telegram setup | Extend |
| `/app/package-request` | `src/pages/app/PackageRequest.tsx` | Purchase package flow | Extend |
| `/app/watchlist` | `src/pages/app/Watchlist.tsx` | User watchlist | Extend |
| `/app/account` | `src/pages/app/Account.tsx` | Account & API settings | Extend |

### 2.2 Operator & Admin Routes (Audit & Classification)
| Route | Component | Current State | Classification | Phase 2 Action |
| :--- | :--- | :--- | :--- | :--- |
| `/admin/operator` | `OperatorPanel.tsx` | Active tabbed Operator Command Center | **Keep & Extend** | Primary unified operator UI |
| `/admin/control-room` | Redirect | Alias to Operator Panel | Consolidate | Redirect to `/admin/operator` |
| `/admin/scanner` | `ScannerStatus.tsx` | Standalone legacy status page | Consolidate | Merge into Operator Panel -> Scanner tab |
| `/admin/scanner-config`| `ScannerConfig.tsx` | Standalone scanner parameters | Consolidate | Merge into Operator Panel -> Settings tab |
| `/admin/providers` | `ProviderHealth.tsx` | Standalone provider monitor | Consolidate | Merge into Operator Panel -> Provider Health |
| `/admin/candidates` | `Candidates.tsx` | Scanner candidate log | Consolidate | Merge into Operator Panel -> Scanner tab |
| `/admin/rejected` | `RejectedSetups.tsx` | Rejection log | Consolidate | Merge into Operator Panel -> Scanner tab |
| `/admin/signals` | `SignalsManager.tsx` | Standalone signals manager | Consolidate | Merge into Operator Panel -> Signals tab |
| `/admin/signals/new` | `ManualSignal.tsx` | Manual signal creator | Keep | Modal/Subview accessible from Signals tab |
| `/admin/telegram-test` | `TelegramTest.tsx` | Standalone Telegram tester | Consolidate | Merge into Operator Panel -> Telegram tab |
| `/admin/telegram` | `TelegramLogs.tsx` | Telegram delivery logs | Consolidate | Merge into Operator Panel -> Telegram tab |
| `/admin/telegram-links`| `TelegramLinks.tsx` | Telegram channel mapping | Consolidate | Merge into Operator Panel -> Telegram tab |
| `/admin/users` | `UsersAccess.tsx` | User permissions | Keep | Retain as Admin User Management |
| `/admin/customers` | `Customers.tsx` | Customer subscriptions | Keep | Retain as Customer Management |
| `/admin/access-requests`| `AccessRequests.tsx`| Subscription approval queue | Keep | Retain under Customer Management |
| `/admin/audit` | `AuditLogs.tsx` | Audit log table | Consolidate | Merge into Operator Panel -> Audit tab |
| `/admin/scheduler` | `SchedulerGuide.tsx` | Cron scheduler verification | Consolidate | Merge into Operator Panel -> Runtime Proof |
| `/admin/outcomes` | `OutcomeTracking.tsx` | Signal outcome tracking | Consolidate | Merge into Operator Panel -> Signals tab |
| `/admin/performance` | `Performance.tsx` | Analytics & PnL tracking | Keep | Retain as Reporting / Performance |
| `/admin/retention` | `Retention.tsx` | Data retention policy controls | Keep | Retain as System Maintenance |
| `/admin/strategy-config`| `StrategyConfig.tsx`| Strategy parameter matrix | Keep | Retain / Embed in Operator Settings |
| `/admin/execution` | `Execution.tsx` | Standalone execution ledger | Consolidate | Merge into Operator Panel -> Executions tab |
| `/admin/trading-brain` | `TradingBrain.tsx` | Intelligence & news brain | Consolidate | Merge into Operator Panel -> Intelligence |
| `/admin/modes` | `Modes.tsx` | Risk modes & profiles | Keep | Retain in Settings / Risk Engine |
| `/admin/backtest` | `BacktestLab.tsx` | Strategy backtester | Keep | Retain as Lab / Research tool |
| `/admin/prop` | `PropTradingPanel.tsx`| Prop firm rules & monitoring | Keep | Retain in Risk & Execution |

---

## 3. Existing Backend Contracts & Data Models

### 3.1 Primary Database Tables
- **`scanner_config`**: Singleton configuration row (`id = 1`) governing global controls (`is_enabled`, `supervisor_enabled`, `operator_telegram_enabled`, `operator_news_brain_enabled`, `operator_auto_repair_enabled`, `schedule_enabled`, `scan_interval_minutes`, `scan_crypto_enabled`, `scan_forex_enabled`).
- **`scanner_runs`**: Ledger of every manual and scheduled scan (`run_type`, `triggered_by`, `symbols_scanned`, `crypto_symbols_scanned`, `forex_symbols_scanned`, `signals_created`, `telegram_sent_count`, `error_message`, `started_at`, `finished_at`).
- **`signals`**: Immutable single truth for generated signals (`symbol`, `market_type`, `timeframe`, `direction`, `entry_low`, `entry_high`, `stop_loss`, `tp1`, `tp2`, `confidence_score`, `signal_grade`, `status`, `data_source`, `score_breakdown`, `created_at`).
- **`signal_updates`**: Immutable log of signal status transitions (`signal_id`, `old_status`, `new_status`, `reason`, `message`, `created_at`).
- **`candidates`**: Scanner evaluation candidates evaluated by arbitrator.
- **`rejected_setups`**: Log of candidates failing strategy, distance, or risk filters.
- **`execution_orders`**: Individual order submission attempts per provider/account (`signal_id`, `execution_provider`, `execution_mode`, `symbol`, `direction`, `status`, `provider_order_id`, `entry_price`, `stop_loss`, `tp1`, `tp2`, `error_message`, `created_at`).
- **`trade_management_truth`**: Real-time position tracking and protection state (`provider`, `environment`, `symbol`, `side`, `position_size`, `entry_price`, `protection_status`, `sl_order_id`, `tp_order_id`, `latest_error`, `latest_sync_at`).
- **`execution_provider_controls`**: Operational flags for exchange adapters (`provider_name`, `status`, `monitor_enabled`, `last_error`, `updated_at`).
- **`execution_monitor_heartbeats`**: Supervisor execution cycles (`provider`, `environment`, `started_at`, `completed_at`, `success`, `positions_seen`, `orders_seen`, `protections_created`, `stale_orders_cleaned`, `errors`).
- **`operator_runtime_events`**: Audit trail of manual operator actions (`source`, `action`, `result`, `summary`, `provider`, `symbols_affected`, `route`, `function_name`, `blocker`, `error`, `raw`, `actor_user_id`, `started_at`, `finished_at`, `duration_ms`).
- **`intelligence_events`**: AI News & Sentiment digests (`event_type`, `title`, `status`, `confidence`, `data_sources`, `created_at`).
- **`intelligence_feed_results`**: External feed health and quality scores.
- **`telegram_deliveries`**: Delivery attempts to Telegram channels (`destination_channel`, `delivery_type`, `status`, `error_message`, `retry_count`, `created_at`).
- **`customer_subscriptions` / `access_requests`**: Customer packages and onboarding approvals.

### 3.2 Primary Database Views
- **`runtime_proof_view`**: Consolidated state verification across scanner, supervisor, and telegram.
- **`scheduler_truth_view`**: Cron schedule freshness and health metrics.
- **`provider_100_trade_readiness_view`**: Execution readiness scores per provider.
- **`telegram_delivery_health`**: Aggregated delivery metrics per channel.
- **`intelligence_event_health`** & **`intelligence_feed_health`**: News engine telemetry.

### 3.3 Active Edge Functions
- **`market-scanner`**: Core scanner execution function (Crypto + Forex evaluation, arbitration, signal creation).
- **`scheduled-market-scanner`**: Cron wrapper function for automated execution.
- **`admin-operator-action`**: Central dispatcher for operator actions (`run_scanner_now`, `run_supervisor_now`, `repair_protection_now`, `pause_scanner`, `resume_scanner`, `run_runtime_proof`, etc.).
- **`admin-scheduler-action`**: Cron and scheduler management endpoint.
- **`binance-testnet-execution`**: Binance position sync, order execution, and protection repair.
- **`binance-testnet-monitor`**: Binance supervisor poll.
- **`bybit-testnet-monitor`**: Bybit supervisor poll.
- **`evaluate-signal-outcomes`**: Automated signal TP/SL outcome resolution.
- **`intelligence-engine`**: Market news & sentiment processor.
- **`telegram-orchestrator` / `telegram-send` / `telegram-test`**: Telegram message dispatch.
- **`mt5-accounts` / `mt5-bridge`**: MT5 terminal account management and bridge communication.

---

## 4. Status Vocabularies & Authorization Model

### 4.1 System Status Vocabularies
- **Signal Status**: `new` | `approved` | `waiting` | `active` | `tp1_hit` | `tp2_hit` | `won` | `lost` | `expired` | `cancelled` | `rejected`
- **Execution Order Status**: `pending` | `submitted` | `entry_submitted` | `entry_filled` | `open` | `protected` | `protected_native` | `closed` | `failed` | `rejected` | `expired`
- **Protection Status**: `unprotected` | `pending_protection` | `protected` | `repairing` | `closing` | `closed` | `error`
- **Runtime Truth Status**: `LIVE` | `STALE` | `FAILED` | `DISABLED`
- **Health Badge Status**: `HEALTHY` | `WARNING` | `CRITICAL` | `OFFLINE`
- **Telegram Delivery Status**: `pending` | `queued` | `sent` | `failed` | `skipped`

### 4.2 Authorization Model
1. **Frontend Role Protection**:
   - `RequireAuth`: Verifies valid Supabase Auth session.
   - `RequireAdmin`: Verifies `profiles.role === 'admin'`. Non-admins are redirected to `/app/dashboard`.
2. **Backend Edge Function Auth**:
   - User-initiated requests pass `Authorization: Bearer <user_access_token>`. Functions invoke `authorizeInternalOrAdmin()`.
   - Internal Edge-to-Edge calls pass headers:
     - `x-hashibot-internal-secret`
     - `x-hashibot-cron-token`
     - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`

---

## 5. Single Scanner Architecture & Forex Proof

### Scanner Execution Proof
Inspection of `supabase/functions/market-scanner/index.ts` confirms:
1. **Single Entry Point**: Both crypto and forex scans are initiated in the same request handler.
2. **Sequential Adapter Execution**:
   - Crypto symbols are fetched from Binance candle endpoint.
   - Forex symbols are fetched from Twelve Data API endpoint.
3. **Shared Arbitration**: Both market types output candidate objects into `arbitrate()` (`supabase/functions/_shared/arbitrator.ts`).
4. **Single Signal Output**: Winning setups are inserted into the single `signals` table with `market_type` set to `'crypto'` or `'forex'`.

```typescript
// Proof snippet from supabase/functions/market-scanner/index.ts
const scanCrypto = cfg.scan_crypto_enabled !== false && marketMode !== "forex_only";
const scanForex = cfg.scan_forex_enabled === true && marketMode !== "crypto_only";

// 1. Evaluate Crypto symbols
if (scanCrypto) {
  for (const symbol of cryptoSymbols) {
    // Evaluate strategies: MicroScalper, QuickScalp, CompressionBreakout, SwingContinuation
  }
}

// 2. Evaluate Forex symbols within the same execution cycle
if (scanForex) {
  for (const symbol of forexSymbols) {
    // Evaluate strategies: ForexMicroScalper, ForexSwingContinuation
  }
}

// 3. Pass all candidates into single Arbitrator
const arbitrationResult = arbitrate(allCandidates, riskProfile, activeSignals);
```

There is **zero code duplication** for a separate Forex scanner.

---

## 6. Page-to-Contract Implementation Matrix for Planned UI

| UI Section / View | Primary Read Contracts (Tables / Views / Edge Functions) | Mutation Contracts (RPCs / Edge Functions) | Auth Requirement | Refresh Strategy | Identified Missing Capabilities |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Admin Control Center** | `runtime_proof_view`, `scanner_config`, `execution_monitor_heartbeats`, `operator_runtime_events` | `admin-operator-action` (`run_scanner_now`, `pause_scanner`, `resume_scanner`, `run_runtime_proof`) | Admin Role + Bearer Token | 5s Auto-polling + Manual Refresh | Single-click "Emergency Pause All" backend command |
| **2. Operating Modes & Risk** | `scanner_config`, `risk_profiles`, `modes_config` | `supabase.from('scanner_config').update()`, `admin-operator-action` | Admin Role | 15s Polling | Preset mode selector RPC (`switch_mode`) |
| **3. Shared Scanner** | `scanner_config`, `scanner_runs`, `candidates`, `rejected_setups` | `admin-operator-action` (`run_scanner_now`) | Admin Role | 5s Polling during scans | Filter by market adapter type (Crypto / Forex) |
| **4. Strategies Registry** | `strategy_configs`, `scanner_strategy_evaluation_summary` | `supabase.from('strategy_configs').update()` | Admin Role | 30s Polling | Dynamic strategy parameter schema validator |
| **5. Arbitrator Decisions** | `candidates`, `signals`, `rejected_setups` | N/A (Read-only decision stream) | Admin Role | 10s Polling | View competing candidates per signal |
| **6. Risk Engine** | `risk_profiles`, `problem_symbol_quarantine` | `supabase.from('problem_symbol_quarantine').delete()` | Admin Role | 10s Polling | Real-time exposure heatmap per quote asset |
| **7. Capital Manager** | `capital_allocation_summary`, `customer_subscriptions` | `supabase.from('customer_subscriptions').update()` | Admin Role | 15s Polling | Total AUM vs allocated leverage calculator |
| **8. Execution Accounts** | `execution_provider_controls`, `provider_status`, `mt5_accounts` | `admin-operator-action` (`refresh_exchange`), `mt5-accounts` | Admin Role | 5s Polling | One-click credential test ping endpoint |
| **9. Customer Onboarding** | `access_requests`, `customer_subscriptions`, `profiles` | `admin_approve_package_purchase` RPC | Admin Role | 10s Polling | Automated Telegram invite generation upon approval |
| **10. Customer Dashboard** | `signals`, `customer_subscriptions`, `telegram_links` | `supabase.from('customer_bot_setups').upsert()` | Customer Role | 10s Polling + Postgres Realtime | Live signal status websocket stream |
| **11. Positions & Protection** | `trade_management_truth`, `execution_orders` | `admin-operator-action` (`repair_protection_now`) | Admin Role | 3s Polling for active positions | Force-close position manual action |
| **12. Provider Health** | `provider_status`, `execution_monitor_heartbeats` | `admin-operator-action` (`run_binance_monitor_now`, `run_bybit_monitor_now`) | Admin Role | 5s Polling | Provider response latency history graph |
| **13. Telegram Operations** | `telegram_deliveries`, `telegram_delivery_health`, `telegram_router_audit` | `admin-operator-action` (`run_telegram_test`) | Admin Role | 10s Polling | Manual re-send signal to specific Telegram channel |
| **14. Runtime Truth** | `runtime_proof_view`, `trade_management_truth`, `execution_orders` | `admin-operator-action` (`run_runtime_proof`) | Admin Role | 5s Polling | Automated ledger reconciliation report export |
| **15. Audit History** | `operator_runtime_events`, `audit_logs` | N/A (Read-only ledger) | Admin Role | 15s Polling | Filter events by actor, action type, and status |
| **16. Incidents & Alerts** | `operator_runtime_events` (where `result = 'FAILED'`), `execution_monitor_heartbeats` | `admin-operator-action` (`retry_protection`) | Admin Role | 3s Polling | Global top-bar incident alert banner component |

---

## 7. UI Design System & Component Guidelines

HashiBot enforces a professional, high-density, dark-mode operations design direction.

### Brand Design Tokens
- **Canvas Background**: `#09090b` (Tailwind `bg-zinc-950`)
- **Card Container**: `bg-zinc-900/70` with `border-zinc-800`
- **Primary Text**: `#f4f4f5` (`text-zinc-100`)
- **Muted Text**: `#71717a` (`text-zinc-500`)
- **Accent Blue**: `#3b82f6` (`text-blue-500`)
- **Success / Healthy**: `emerald-500` (`border-emerald-500/30 bg-emerald-500/10 text-emerald-300`)
- **Warning / Stale**: `yellow-500` (`border-yellow-500/30 bg-yellow-500/10 text-yellow-300`)
- **Critical / Failed**: `red-500` (`border-red-500/30 bg-red-500/10 text-red-300`)
- **Disabled / Offline**: `zinc-700` (`border-zinc-700 bg-zinc-900 text-zinc-400`)

### Typography & Layout Constraints
- **Primary Font**: `Inter`, system-ui, sans-serif
- **Data & Numbers**: Monospaced font (`font-mono`) for prices, order IDs, timestamps, and PnL.
- **Card Padding**: Outer container padding = 16px (`p-4`), inner element spacing = 8-12px (`gap-2` to `gap-3`).
- **Borders & Radii**: Standard card radius capped at 12-16px (`rounded-2xl`).

---

## 8. Refresh & Realtime Strategy

1. **Active Operator Command Center**:
   - Primary state polling: 5,000ms cadence via `useAdminLiveState` and `loadOperatorTruth()`.
   - On-demand refresh immediately triggered following any operator action invocation (`runAction()`).
2. **Customer Signal Dashboard**:
   - Primary state polling: 10,000ms cadence.
   - Postgres Realtime subscription fallback listening on `signals` table updates (`event = 'UPDATE'`).
3. **Background Heartbeat**:
   - `execution_monitor_heartbeats` monitored every 5,000ms for freshness (< 3 minutes threshold).

---

## 9. Security & Performance Risk Analysis

### Security Risks
1. **Service Role Credentials**: Service role key must remain restricted to Edge Functions environment variables (`SUPABASE_SERVICE_ROLE_KEY`) and never exposed in `VITE_` frontend variables.
2. **Operator Authorization**: Admin routes must strictly enforce both frontend (`RequireAdmin`) and backend token validation (`verifyAdmin()` in `admin-operator-action`).

### Performance Risks
1. **Unbounded Queries**: `loadOperatorTruth()` uses `.limit(250)` to prevent unbounded memory spikes. All high-frequency event queries must specify limits.
2. **Polling Overhead**: Parallel `Promise.all` queries are batched. Operator views pause background polling when the browser tab is hidden.

---

## 10. Phase 2 Implementation Roadmap & Target Files

### Recommended Implementation Order for Phase 2
1. **Refactor Route Hierarchy (`src/App.tsx`)**: Redirect legacy standalone admin paths to `/admin/operator?section=...`.
2. **Enhance Unified Operator Command Center (`src/pages/admin/operator/OperatorPanel.tsx`)**:
   - Add tab sections for Scanner, Strategies, Arbitrator, Risk, Execution, Telegram, Intelligence, and Audit.
   - Integrate market adapter split tabs (Crypto vs Forex).
3. **Refactor Customer Signal Portal (`src/pages/app/Dashboard.tsx`)**: Standardize signal presentation, execution connection status, and package status.
4. **Shared Component Extraction**: Create reusable status badges, heartbeat timers, and position cards in `src/components/admin/`.

### Exact Files Targeted for Modification in Phase 2
- `/src/App.tsx` (Route consolidation)
- `/src/pages/admin/operator/OperatorPanel.tsx` (Unified Operator UI expansion)
- `/src/pages/app/Dashboard.tsx` (Customer dashboard polish)
- `/src/pages/app/ActiveSignals.tsx` (Customer signal list)
- `/src/lib/operatorTruth.ts` (Data fetcher expansion)
- `/src/hooks/useAdminLiveState.ts` (Live telemetry hook expansion)
- `/src/components/layout/AdminLayout.tsx` (Navigation sidebar updates)

---

## 11. Validation & Repository Check Results

- **Linter Check (`npm run lint`)**: Passed with 0 errors (5 benign warnings on fast-refresh exports).
- **TypeScript & Applet Compilation (`compile_applet`)**: Passed successfully.

---
*End of Audit Report.*
