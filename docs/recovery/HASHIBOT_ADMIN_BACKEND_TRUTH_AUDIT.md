# HASHIBOT PHASE 4.9 — COMPLETE OPERATOR & BACKEND TRUTH AUDIT
**Authoritative System Truth & Purposed-Based Restructure Map**

---

## 1. INTRODUCTION & MISSION CRITERIA
This audit establishes full, high-fidelity operational visibility for the HashiBot Crypto Platform. To secure the system before Phase 5 (Forex/MT5), we audit every single operator screen, database table, backend service, and administrative button. 

Our rules are absolute:
1. **No simulated or optimistic visual representations.** If the backend cannot prove a state, we display `UNKNOWN`, `NOT CONFIGURED`, `NO DATA`, or `ACTION REQUIRED`.
2. **Offline-first Development Mocks** are strictly isolated behind dynamic flags (`import.meta.env.DEV`, `NODE_ENV === "development"`, or `isSupabaseMocked`).
3. **No loose page duplication.** Every page has exactly one responsibility. Unnecessary decorative elements are removed or hidden.

---

## 2. COMPREHENSIVE PAGE-BY-PAGE AUDIT
This table details the comprehensive audit of all routes, their underlying tables, and their Keep/Merge/Hide decisions.

| Route | Page Component | Operational Purpose & Intended Operator | Backend Sources, RPCs & Edge Functions | Read/Write Truth | Data Source (Prod vs Mock) | Quality Status | Keep / Merge / Hide / Remove Decision | Exact Fix Required |
|---|---|---|---|---|---|---|---|---|
| `/admin/operator` | `OperatorPanel` (Dashboard) | **Unified Command Center** for System Admins. High-level health strip, critical alerts, and active event log. | • `trade_management_truth`<br>• `execution_monitor_heartbeats`<br>• `scanner_config`<br>• `telegram_deliveries` | **Reads & Writes** live truth via `admin-operator-action` Edge Function. | Production-ready. Fallback to `MockSupabaseClient` in DEV. | **High Quality** (Authoritative) | **KEEP** as primary Command Center. | None. This is the main entry point for Admin/Operator. |
| `/admin/operator/signals` | `OperatorPanel` (Signals) | **Signal Operations** center to monitor active scanning filters, active signals, and historical performance. | • `strategy_candidates`<br>• `scanner_runs` | **Reads** live signal state, **Writes** manual signal override. | Production-ready. | **High Quality** | **KEEP** and merge redundant/standalone signal managers. | Ensure signals list binds directly to `strategy_candidates` rather than old local memory. |
| `/admin/operator/executions` | `OperatorPanel` (Executions) | **Exchange Operations** panel to audit live orders and executed trade tickets on Binance and Bybit. | • `execution_orders`<br>• `trade_management_truth` | **Reads** positions/orders. **Writes** manual limit/market orders. | Production-ready. | **High Quality** | **KEEP** as authoritative exchange cockpit. | Integrate with actual Binance/Bybit testnet exposure fetches. |
| `/admin/operator/trade-manager` | `OperatorPanel` (Trades) | **Protection & Recovery Supervisor** to track stop loss (SL), take profit (TP), and repair orphan trades. | • `trade_management_truth`<br>• `execution_monitor_heartbeats` | **Reads** SL/TP status. **Writes** repair commands. | Production-ready. | **High Quality** | **KEEP** as protection nerve-center. | Ensure missing SL/TP alerts match actual exchange position updates. |
| `/admin/operator/telegram` | `OperatorPanel` (Telegram) | **Telegram Command Center** for auditing outbound alerts, delivery queues, and channel parameters. | • `telegram_deliveries`<br>• `telegram_router_audit` | **Reads** delivery status, **Writes** resend commands. | Production-ready. | **High Quality** | **KEEP** as outbound messaging hub. | Link with actual telegram-test Edge Function for test pings. |
| `/admin/operator/settings` | `OperatorPanel` (Settings) | **Runtime Controls** and scheduler configs. Emergency pause/resume switches for execution engines. | • `scanner_config` | **Reads & Writes** scanner configurations. | Production-ready. | **High Quality** | **KEEP** as configuration control center. | Wire config toggles to update `scanner_config` row `id=1` on save. |
| `/admin/operator/intelligence` | `OperatorPanel` (News Brain) | **News Brain & Sentiment Analyzer** to pause trading during high-impact economic announcements. | • `intelligence_events`<br>• `intelligence_feeds` | **Reads** economic event logs. | Production-ready. | **High Quality** | **KEEP** for sentiment analysis. | Ensure feeds list matches real `intelligence_feeds` table in production. |
| `/admin/operator/runtime-proof` | `OperatorPanel` (Runtime Proof) | **Testing Cockpit & Certification** panel. Runs real-time diagnostic assertions on all active processes. | • `admin-operator-action` (run_runtime_proof) | **Reads & Writes** proof assertions. | Production-ready. | **High Quality** (Authoritative) | **KEEP** as the core Operator Testing Cockpit. | Redesign to feature 10 distinct collapsible sections with detailed diagnostics. |
| `/admin/customers` | `Customers` | **Customer Subscription Management** for approving packages and viewing user subscriptions. | • `customer_subscriptions`<br>• `packages` | **Reads & Writes** subscription records. | Production-ready. | **High Quality** | **KEEP** as distinct subscriber operations manager. | Ensure editing starts_at/expires_at fields updates `customer_subscriptions` correctly. |
| `/admin/access-requests` | `AccessRequests` | **Package & Payment Approvals**. Crucial SaaS gatekeeper. Automatically provisions subscriptions on approval. | • `access_requests`<br>• `customer_subscriptions`<br>• `user_access` | **Reads & Writes** live registration status. | Production-ready. | **High Quality** | **KEEP** as core SaaS payment gateway. | Ensure approval executes the automatic multi-table update sequence. |
| `/admin/users` | `UsersAccess` | **System Access and Role Configuration** for granting manual Signal access or setting user roles. | • `profiles`<br>• `user_access`<br>• `telegram_links` | **Reads & Writes** profile and access permissions. | Production-ready. | **High Quality** | **KEEP** for role and credentials management. | Direct mapping to `profiles` and `user_access` tables. |
| `/admin/audit` | `AuditLogs` | **Administrative Audit logs** tracking operator actions and administrative approval events. | • `audit_logs` | **Reads** audit logs. | Production-ready. | **High Quality** | **KEEP** for security and regulatory compliance. | Direct database mapping. |
| `/admin/retention` | `Retention` | **Platform Storage Cleanups**. Previews and executes batched cleanups for expired non-critical tables. | • `hashibot_retention_report`<br>• `hashibot_cleanup_noncritical` | **Reads & Writes** via RPCs. | Production-ready. | **High Quality** | **KEEP** to ensure Cloud database bounds. | Ensure Execute Cleanup calls the correct batched SQL cleanup RPC. |
| `/admin/scanner` | `ScannerStatus` | **Detailed Scanner Run logs** detailing timestamped evaluation runs and counts. | • `scanner_runs` | **Reads** database tables. | Production-ready. | **Stale** (Duplicate) | **HIDE** from main sidebar navigation. | Already represented in Operator Panel Signals and Scanner Status cards. |
| `/admin/scanner-config` | `ScannerConfig` | **Standalone Scanner Config** panel. Redundant parameters. | • `scanner_config` | **Reads & Writes**. | Production-ready. | **Stale** (Duplicate) | **HIDE** from main sidebar navigation. | Consolidate and merge parameters into `OperatorPanel` (Settings) section. |
| `/admin/providers` | `ProviderHealth` | **Standalone Provider Connectivity** diagnostics view. | • `provider_status` | **Reads** database tables. | Production-ready. | **Stale** (Duplicate) | **HIDE** from main sidebar navigation. | Represented inside Unified Runtime Operations component on Operator Dashboard. |
| `/admin/candidates` | `Candidates` | **Scanner Setup Candidates** that have not yet been approved or rejected. | • `strategy_candidates` | **Reads** database tables. | Production-ready. | **Stale** (Duplicate) | **HIDE** from main sidebar navigation. | Merge list visualizer into Signal Operations section inside Operator Panel. |
| `/admin/rejected` | `RejectedSetups` | **Rejected Candidates** rejected by scanner thresholds or risk filters. | • `strategy_candidates` | **Reads** database tables. | Production-ready. | **Stale** (Duplicate) | **HIDE** from main sidebar navigation. | Represented in the overall signals database views. Hide sidebar link. |
| `/admin/telegram` | `TelegramLogs` | **Detailed Outbound message delivery status** table. | • `telegram_deliveries` | **Reads** database tables. | Production-ready. | **High Quality** | **KEEP** for detailed diagnostic audits. | None. Direct DB mapping. |
| `/admin/signals` | `SignalsManager` | **Legacy Signals Manager**. Lists signals with basic details. | • `signals` | **Reads** database tables. | Production-ready. | **Stale** (Duplicate) | **REMOVE** route / sidebar link. | Entirely superceded by the rich `OperatorPanel` (Signals) operations. |
| `/admin/signals/new` | `ManualSignal` | **Legacy Manual Signal Builder**. | None. | Mocked only. | Stale/Mocked. | **Stale** (Fake) | **REMOVE** route / sidebar link. | Superceded by rich automated testing controls. |
| `/admin/telegram-test` | `TelegramTest` | **Telegram outbound delivery previewer**. | • `telegram-test` Edge Function | **Writes** test triggers. | Production-ready. | **High Quality** | **KEEP** but access via Telegram Operations panel. | Link test ping triggers to actual Edge Function. |
| `/admin/telegram-links` | `TelegramLinks` | **Subscribers chat mapping tracker**. | • `telegram_links` | **Reads & Writes**. | Production-ready. | **High Quality** | **KEEP** as distinct subscriber workspace. | Direct DB table mapping. |
| `/admin/outcomes` | `OutcomeTracking` | **Historical Win/Loss and risk-reward performance stats**. | • `hashibot_outcome_tracking_summary` | **Reads** DB analytics. | Production-ready. | **High Quality** | **KEEP** for performance auditing. | Direct analytic view mapping. |
| `/admin/performance` | `Performance` | **Historical portfolio drawdown and PnL metrics**. | • `hashibot_performance_summary` | **Reads** DB analytics. | Production-ready. | **High Quality** | **KEEP** for financial risk tracking. | Direct analytic view mapping. |
| `/admin/provider-comparison` | `ProviderComparison` | **Latency and slippage comparative analytics**. | • `hashibot_provider_comparison_summary` | **Reads** DB analytics. | Production-ready. | **High Quality** | **KEEP** for provider execution audits. | Direct analytic view mapping. |
| `/admin/strategy-config` | `StrategyConfig` | **Active Trading strategy parameters configuration** (Microscalper, London-breakout). | • `strategy_configs` | **Reads & Writes**. | Production-ready. | **High Quality** | **KEEP** for algorithmic overrides. | Direct DB table mapping. |
| `/admin/execution` | `Execution` | **Live Executed trade tickets** on provider accounts. | • `execution_orders` | **Reads** DB tables. | Production-ready. | **High Quality** | **KEEP** as active exchange visualizer. | Direct DB table mapping. |
| `/admin/trading-brain` | `TradingBrain` | **Algorithmic intelligence weights and thresholds**. | • `hashibot_trading_brain_summary` | **Reads** DB analytics. | Production-ready. | **High Quality** | **KEEP** for neural/intelligence monitoring. | Direct DB table mapping. |
| `/admin/modes` | `Modes` | **System Execution modes** (Testnet / Live / Simulation). | • `scanner_config` | **Reads & Writes**. | Production-ready. | **Stale** (Duplicate) | **HIDE** from main sidebar navigation. | Relocate parameters cleanly to the Operator Settings section. |
| `/admin/backtest-lab` | `BacktestLab` | **Historical strategy simulator**. | None. | Mocked only. | Simulation-only. | **High Quality** | **KEEP** as a distinct simulation lab. | Keep isolated from live execution environments. |
| `/admin/handoff` | `Handoff` | **Shift Handoff checklists** and operator instructions. | • Local text storage. | None. | Local state. | **High Quality** | **KEEP** for multi-operator environments. | None. |
| `/admin/prop` | `PropTradingPanel` | **Bybit Funded Account control panel**. | • `bybit_prop_accounts` | **Reads & Writes**. | Production-ready. | **High Quality** | **KEEP** as separate Bybit prop panel. | Direct DB table mapping. |

---

## 3. SCHEDULED JOBS & CRON WORKFLOWS
These active crons are declared inside PostgreSQL `pg_cron` / `execution_monitor_schedules` to handle automated operations:

1. **`market-scanner-cron`**
   - **Schedule**: Every 5 minutes (`*/5 * * * *`).
   - **Action**: Calls `scheduled-market-scanner` Edge Function.
   - **Purpose**: Evaluates candidate indicators and generates signals.
   
2. **`trade-supervisor-cron`**
   - **Schedule**: Every minute (`* * * * *`).
   - **Action**: Calls `binance-testnet-execution` Edge Function (`run_trade_supervisor_cycle`).
   - **Purpose**: Audits exchange positions, flags missing stops, and executes auto-repairs.

3. **`news-brain-cron`**
   - **Schedule**: Every 6 hours (`0 */6 * * *`).
   - **Action**: Calls `intelligence-engine` Edge Function (`news_digest`).
   - **Purpose**: Fetches financial feeds and updates volatility thresholds.

4. **`retention-cleanup-cron`**
   - **Schedule**: Daily at midnight (`0 0 * * *`).
   - **Action**: Calls SQL RPC `hashibot_cleanup_noncritical` (with `p_execute: true`).
   - **Purpose**: Trims stale logs and heartbeats according to policy.

---

## 4. DATABASE TABLES & SCHEMA SOURCE OF TRUTH
The platform utilizes the following database schemas as the sole source of truth (simulated localStorage is strictly forbidden):

- **`profiles`**: Stores credentials, full names, and administrative roles (`user` vs `admin`).
- **`customer_subscriptions`**: Holds active customer service tiers, payment verification references, and expiration timestamps.
- **`user_access`**: Legacy access tracking table. Synchronized dynamically on admin package approval.
- **`access_requests`**: Stores pending registration forms, Kes/Crypto pricing values, and payment details.
- **`strategy_candidates`**: Stores raw scanning setup attempts, confidence grades, and filter rejections.
- **`signals`**: Holds active trade directions, take profit targets, stop loss targets, and timeframe data.
- **`execution_orders`**: Stores live API order slips, transaction IDs, fill prices, and side quantities.
- **`trade_management_truth`**: Master table tracking actual positions currently running on Binance and Bybit, paired with active SL/TP presence.
- **`execution_monitor_heartbeats`**: Logs supervisor execution runs, latency rates, missing protection counts, and repair logs.
- **`operator_runtime_events`**: Stores full audit trails of every operator dashboard action and manual override.
- **`telegram_deliveries`**: Audits outbound message payloads, retries, and chat confirmation signatures.
- **`telegram_router_audit`**: Tracks subscriber message distribution logic and routing outcomes.
