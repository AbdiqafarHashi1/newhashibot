# HashiBot Phase 2A: Core Operations Backend Truth Wiring Report

## Executive Summary
This report documents the completion of Phase 2A Core Operations Backend Truth Wiring for HashiBot. All fictional mock data, Math.random metrics, hardcoded state arrays, and simulated button actions have been systematically eliminated across the six primary management pages.

Every page is now wired directly to active Supabase tables, Edge Functions, views, and RPCs. Where backend features or tables do not currently exist, the UI renders explicit, clean `UNSUPPORTED`, `NOT_CONFIGURED`, or `NO_DATA` states rather than fabricating operational telemetry.

---

## Page-by-Page Truth Wiring Audit

### 1. Execution Management (`/admin/execution`)
- **Former State:** `MOCK_EXECUTORS` array containing hardcoded Binance, Bybit, and MT5 instances.
- **Backend Truth Sources:** `execution_provider_controls`, `execution_monitor_heartbeats`, `trade_management_truth`, `loadOperatorTruth()`.
- **Wired Telemetry:**
  - Active provider controls & enable flags (`execution_provider_controls`)
  - Heartbeat freshness and error states (`execution_monitor_heartbeats`)
  - Real position/order counts derived per provider from `trade_management_truth`
- **Wired Actions:**
  - Synchronize Exchange State: Triggers `admin-operator-action` with `refresh_exchange`
  - Global Start/Stop: Invokes `admin-operator-action` controls (`resume_supervisor` / `pause_supervisor`)
  - Provider-specific Start/Stop: Invokes `admin-operator-action` or displays explicit unsupported notice if fine-grained lifecycle mutation is unavailable.
- **Empty/Unconfigured State:** Renders explicit `NO_DATA` status badge when provider controls or heartbeats are absent.

---

### 2. Positions Center (`/admin/positions`)
- **Former State:** `MOCK_POSITIONS` with hardcoded BTCUSDT, ETHUSDT, XAUUSD, EURUSD trades.
- **Backend Truth Source:** `trade_management_truth` table.
- **Wired Telemetry:**
  - Real synchronized positions across Binance, Bybit, and MT5
  - Symbol, side, entry price, mark price, unrealized PnL, stop-loss, take-profit
  - Protection status (`protected_native`, `protected_managed`, `missing_sl`, etc.)
- **Wired Actions:**
  - Sync Exchange Positions: Invokes `admin-operator-action` (`refresh_exchange`)
  - Attach SL / Repair Protection: Invokes `admin-operator-action` (`repair_protection_now`)
  - Close Market: Checks server capability or displays explicit `UNSUPPORTED` state banner ("Close market backend action not implemented").
- **Empty/Unconfigured State:** Renders clean empty state when `trade_management_truth` contains no active open positions.

---

### 3. Protection Center (`/admin/protection`)
- **Former State:** `MOCK_PROTECTIONS` with hardcoded SL/TP order IDs and fake verification intervals.
- **Backend Truth Source:** `trade_management_truth` table.
- **Wired Telemetry:**
  - Native exchange order IDs (`sl_order_id`, `tp_order_id`) from DB ledger
  - Verification status derived from `protection_status` (`protected_native` vs `protection_failed` / `pending_protection`)
  - Verification timestamp (`latest_sync_at`)
- **Wired Actions:**
  - Auto-Repair Unprotected: Calls `admin-operator-action` (`repair_protection_now`)
  - Individual Attach SL: Calls `admin-operator-action` (`repair_protection_now` for target provider/symbol)
- **Empty/Unconfigured State:** Displays "No active position protection records in database ledger" when DB table is empty.

---

### 4. Recovery Center (`/admin/recovery`)
- **Former State:** `MOCK_INCIDENTS` array with fake incident IDs and simulated repair timeouts.
- **Backend Truth Sources:** `operator_runtime_events` (where `result = 'FAILED'`), `execution_monitor_heartbeats` (where `success = false`), `trade_management_truth` (where `latest_error IS NOT NULL`), `telegram_deliveries` (where `status = 'failed'`).
- **Wired Telemetry:**
  - Real runtime failures, error messages, subsystem tags, and error timestamps
- **Wired Actions:**
  - Scan All Subsystems: Re-queries live database failure records and executes `admin-operator-action` health check (`run_supervisor_now`)
  - Execute Repair: Calls `admin-operator-action` (`repair_protection_now` / `retry_verification`)
  - Mark Resolved: Updates runtime event state or displays explicit notice if persistent manual resolution override table is absent.
- **Empty/Unconfigured State:** Displays "No active subsystem incidents or failures detected" when all telemetry is healthy.

---

### 5. MT5 & Prop Accounts (`/admin/prop-provider` or `/admin/prop`)
- **Former State:** `INITIAL_ACCOUNTS` with hardcoded MetaQuotes, IC Markets, and FTMO balances.
- **Backend Truth Sources:** `mt5_accounts_safe` database view via `listMT5Accounts()`.
- **Wired Telemetry:**
  - Masked account numbers, broker, server, leverage, connection status, execution mode, last sync
- **Wired Actions:**
  - Sync Account / Test Connection: Calls `testMT5Connection` Edge Function action (`mt5-accounts`)
  - Toggle Executor: Calls `setMT5Execution` Edge Function action (`mt5-accounts`)
  - Add MT5 Account: Fully integrated dialog invoking `connectMT5Account` (`mt5-accounts` Edge Function). Passwords are never exposed or saved in frontend state.
- **Empty/Unconfigured State:** Displays clean empty state ("No MT5 or Prop Firm accounts registered in the database") when `mt5_accounts_safe` contains no rows.

---

### 6. Risk Engine (`/admin/risk`)
- **Former State:** `INITIAL_PROFILES` array with fake risk limits and mock update buttons.
- **Backend Truth Sources:** `risk_profiles` table, `scanner_config` table, `execution_provider_controls`.
- **Wired Telemetry:**
  - DB risk profile rows (if present) or active system risk limits from `scanner_config` / `trade_management_truth`
- **Wired Actions:**
  - Update Risk Configuration: Saves to `risk_profiles` or `scanner_config` if permitted; displays explicit "Server-authorized risk configuration mutation not implemented" when write access is restricted.
- **Empty/Unconfigured State:** Displays explicit `NOT_CONFIGURED` status badge when no custom risk profile rows exist.

---

## Verification & Compliance
- **RLS Compliance:** All data fetches use standard Supabase client with authenticated user credentials.
- **Zero Mock Fallbacks:** `Math.random()`, fake `setTimeout` state mutations, and fabricated IDs have been completely removed.
- **Visual Continuity:** Layout, dark institutional design language, top tabs, and sidebar styling were strictly preserved.
