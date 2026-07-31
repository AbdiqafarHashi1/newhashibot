# Operations Center Architecture & Operational Matrix

## 1. Mission & Operational Philosophy

The **HashiBot Operations Center** provides unified, real-time observability, diagnosis, governance, and control across all runtime engines without requiring direct database access or log inspection.

Every completed backend engine—from the Market Scanner and Signal Arbitrator to the Runtime Orchestrator, Account Execution Brains, Risk Engine, Capital Manager, Trade Management Engine, and Recovery System—exposes operational telemetry and action surfaces through canonical backend contracts.

### Core Principles
1. **Preserve Navigation & Identity**: Maintain clean sidebar routing, distinct page responsibilities, and visual hierarchy.
2. **Zero Fake Data**: Render live, canonical database rows and Edge Function receipts exclusively.
3. **Canonical Lineage**: Every order, evaluation, or position retains full operational lineage:
   $$\text{Signal} \longrightarrow \text{Arbitrator} \longrightarrow \text{Risk} \longrightarrow \text{Capital} \longrightarrow \text{Execution} \longrightarrow \text{Trade Management} \longrightarrow \text{Trade Truth} \longrightarrow \text{Recovery} \longrightarrow \text{Closure}$$
4. **Action Transparency**: All operator actions (repair, designate, toggle execution, reset trade truth) pass through authenticated, audit-logged backend endpoints.

---

## 2. Operations Center Navigation & Routing Matrix

| Navigation Item | Route Path | Operational Purpose | Backend Contracts / Data Sources |
| :--- | :--- | :--- | :--- |
| **Mission Control** | `/admin/mission-control` | Executive runtime dashboard providing high-level system readiness, active position summary, provider health, and incident alerts. | `loadOperatorTruth()`, `trade_management_truth`, `execution_monitor_heartbeats` |
| **Command Center** | `/admin/operator` | Operational command workspace with tabular deep dives across scanner, arbitrator, risk, executions, and incidents. | `loadOperatorTruth()`, `operator-admin-action` |
| **Runtime Truth & Receipts** | `/admin/runtime-truth` | Diagnostic trace of Runtime Orchestrator pipeline events, correlation IDs, latency metrics, and execution receipts. | `operator_runtime_events`, `audit_logs`, `telegram_deliveries` |
| **Recovery Center** | `/admin/recovery` | Self-healing incident panel for orphan position reconciliation, failed trade truth reset, and emergency repair dispatch. | `trade_management_truth`, `execution_monitor_heartbeats`, `admin-operator-action` |
| **Execution Management** | `/admin/execution` | Vault credential verification, provider account onboarding, operational account designation, and execution adoption controls. | `execution_accounts_v2`, `vault`, `execution-account-onboarding` |
| **Positions Center** | `/admin/positions` | Live position monitoring across all providers, tracking entry prices, mark prices, unrealized PnL, and exchange sync state. | `trade_management_truth`, `refresh_exchange` |
| **Protection Center** | `/admin/protection` | Native exchange Stop-Loss & Take-Profit verification, attachment audits, and automated protection repair commands. | `trade_management_truth`, `repair_protection_now` |
| **Operating Modes** | `/admin/modes` | System operational mode toggles (Signal Mode, Personal Mode, Prop Mode) and global risk profile parameter editor. | `risk_profiles`, `execution_settings` |
| **Risk Engine** | `/admin/risk` | Account-level risk parameter controls, drawdown ceiling configuration, leverage caps, and rejection log inspection. | `execution_provider_controls` |
| **Capital Allocation** | `/admin/capital` | Sizing limits, margin utilization caps, portfolio exposure rules, and certified runtime artifacts. | `execution_provider_controls`, `certified_runtime_artifacts` |
| **Customer Management** | `/admin/customers` | Customer accounts, package assignments, access status, Telegram invite/join state, and custom bot setups. | `customer_subscriptions`, `profiles`, `customer_bot_setups` |
| **Access Requests** | `/admin/access-requests` | Package subscription approval queue, manual access provisioning, and bot setup status tracking. | `access_requests`, `customer_subscriptions` |
| **Telegram Links** | `/admin/telegram-links` | Telegram router audit, channel mappings, broadcast status, and message delivery log. | `telegram_deliveries`, `scanner_config` |
| **Performance Analytics** | `/admin/performance` | Throughput metrics, execution success rates, protection attachment rates, strategy R-distributions, and provider latency. | `signals`, `execution_orders`, `trade_management_truth` |
| **Provider Health** | `/admin/providers` | Connectivity matrix across Binance, Bybit, MT5 Bridge, Market Data feeds, Telegram, and Supabase. | `provider_status`, Edge Function health checks |
| **Binance Operations** | `/admin/providers/binance` | Dedicated Binance exchange workspace with symbol filters, position tables, and manual dispatch. | `ProviderOperationsWorkspace` (`binance`) |
| **Bybit Operations** | `/admin/providers/bybit` | Dedicated Bybit exchange workspace with contract settings and risk parameters. | `ProviderOperationsWorkspace` (`bybit`) |
| **MT5 Operations Center** | `/admin/providers/mt5` | Comprehensive MT5 multi-account workspace (Personal & Prop) with terminal heartbeats and bridge diagnostics. | `MT5OperationsCenter` |
| **MT5 Personal Ops** | `/admin/providers/mt5-personal` | Filtered MT5 view for Personal trading accounts. | `MT5PersonalOperations` |
| **MT5 Prop Ops** | `/admin/providers/mt5-prop` | Filtered MT5 view for Prop firm challenge accounts with strict drawdown tracking. | `MT5PropOperations` |
| **Audit Trail** | `/admin/audit` | Complete operational traceability tabulating pipeline lineage, operator actions, and system receipts. | `audit_logs`, `trade_management_truth`, `operator_runtime_events` |
| **Settings & Secrets** | `/admin/operator/settings` | Environment configuration, Vault key presence checks, and emergency kill-switch controls. | `execution_settings`, `vault` |

---

## 3. Backend Telemetry & Data Aggregation

The primary data aggregator for the Operations Center is `src/lib/operatorTruth.ts`. It executes structured, parallel queries against the backend database tables to build an `OperatorTruthBundle`.

### Key Data Tables Consumed
- `trade_management_truth`: Active and historical position truth, protection attachment status, unrealized PnL, and provider account identifiers.
- `execution_monitor_heartbeats`: Bridge, provider, and cron service heartbeats with latency, uptime, and last sync timestamps.
- `execution_provider_controls`: Account-specific risk and capital governance parameters.
- `operator_runtime_events`: Runtime Orchestrator pipeline event receipts and error diagnostics.
- `certified_runtime_artifacts`: Immutable hash-verified capital allocation policies and risk profile signatures.
- `signals` & `candidate_signals`: Scanner output and strategy evaluation history.
- `customer_subscriptions` & `access_requests`: Customer account entitlements and bot setup workflows.

---

## 4. Operational Workflows & Self-Healing Actions

### 1. Protection Repair Workflow
When a position in `trade_management_truth` reports `protection_status !== 'PROTECTED'`:
1. Operator navigates to **Protection Center** or **Positions Center**.
2. Clicks **Repair Protection**.
3. Dispatches `admin-operator-action` with action `repair_protection_now`.
4. The Trade Management Engine queries exchange orders, calculates required SL/TP levels, and submits native stop-loss/take-profit trigger orders.
5. Updates `trade_management_truth` with order IDs and transitions status to `PROTECTED`.

### 2. Orphan Position Recovery Workflow
When an exchange reports an open position not matched to an active signal intent:
1. Operator opens **Recovery Center**.
2. Inspects **Unmatched / Orphan Positions**.
3. Clicks **Reconcile Exchange Positions**.
4. Dispatches `admin-operator-action` with action `reconcile_all_positions`.
5. The system reconciles exchange positions against `trade_management_truth`, creating adoption entries or logging recovery audit receipts.

### 3. Execution Account Onboarding & Designation
1. Operator opens **Execution Management**.
2. Selects **Add System Account** or **Add Customer Account**.
3. Enters provider credentials (API Key / Secret) and clicks **Test Connection & Discover Account**.
4. The backend verifies connection, discovers account identity, checks read/write permissions, and stores credentials securely in Vault.
5. Operator clicks **Designate Operational** or toggles **Enable Execution** to safely adopt trading capabilities.

---

## 5. Architectural Compliance & Safety Guardrails

- **No SQL / Schema Changes**: All UI enhancements operate within established database schemas and edge function contracts.
- **No Direct Logic Redesign**: Business logic resides strictly inside the Runtime Orchestrator, Account Execution Brains, and Trade Management Engine.
- **Audit Traceability**: Every write operation initiated by an operator creates an entry in `audit_logs` containing action type, entity ID, operator profile, and request metadata.
