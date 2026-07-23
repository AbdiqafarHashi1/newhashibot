# HashiBot Phase 2D: Runtime Mission Control Audit Document

## Overview & Mission Objective
The **HashiCore Mission Control** dashboard (`/admin/mission-control` and `/admin/mission`) serves as the NOC (Network Operations Center) for HashiBot. It is designed to remain open 24/7 by administrators to give absolute, real-time visibility into all 15 operational subsystems based on verified backend truth.

---

## 1. Subsystem Architecture (15 Verified Domains)
Mission Control displays live health, last heartbeat, last successful cycle, error messages, and freshness for 15 core subsystems:

1. **Runtime Engine**: Overall master runtime status derived from `scanner_config` and supervisor heartbeats.
2. **Scanner Engine**: Market scanner status, execution interval, and `scheduler_truth_view` execution records.
3. **Arbitrator Engine**: Candidate evaluation state and signal qualification metrics.
4. **Execution Engine**: Order submission router, fill status, and execution error tracking.
5. **Protection Engine**: Exchange watchdog attachment for native Stop-Loss & Take-Profit orders.
6. **Recovery Engine**: Quarantined symbol auto-repair and recovery worker tracking.
7. **Supervisor**: Trade supervisor configuration and account margin/drawdown monitor.
8. **Risk Engine**: Quarantine risk limits and circuit breaker status.
9. **Capital Manager**: Capital allocation and margin utilization.
10. **Provider Health**: Live Binance & Bybit exchange interface connection status.
11. **Telegram Gateway**: Telegram bot dispatch router and delivery status.
12. **MT5 Bridge**: Personal & Prop account MT5 bridge connector status (`UNSUPPORTED` fallback when direct connector is absent).
13. **Database Ledger**: Supabase database connectivity and audit event ledger.
14. **Scheduler / Cron**: `pg_cron` / edge scheduler execution tracking.
15. **Active Environment**: Live environment identification (LIVE / TESTNET / DEMO).

---

## 2. Continuously Updating Runtime Activity Timeline
The live event stream aggregates real-time records from multiple backend tables:
- `operator_runtime_events`
- `audit_logs`
- `telegram_deliveries`
- `execution_monitor_heartbeats`
- `trade_management_truth`
- `signals`
- `execution_orders`

### Controls & Features
- **Search**: Text search across message, symbol, provider, and subsystem.
- **Severity Filter**: Filter by `ALL`, `INFO`, `SUCCESS`, `WARNING`, `ERROR`, `CRITICAL`.
- **Subsystem Filter**: Filter by `SCANNER`, `EXECUTION`, `PROTECTION`, `SUPERVISOR`, `TELEGRAM`.
- **Provider Filter**: Filter by `BINANCE`, `BYBIT`, `TELEGRAM`, `WATCHDOG`, `SYSTEM`.
- **Auto-Scroll Toggle**: Pause or resume auto-scroll to inspect historical records.
- **Drill-Down Links**: Every event includes an `Inspect` link routing directly to the affected page (`/admin/signals`, `/admin/positions`, `/admin/telegram`, `/admin/audit`, `/admin/execution`).

---

## 3. Active Runtime Workers
Each worker process is monitored independently:
- **Market Scanner**: Interval, scanner mode, and last scan execution time.
- **Execution Worker**: Order fill queue, pending submissions, and execution latency.
- **Protection Monitor**: SL/TP native attachment watchdog.
- **Recovery Worker**: Auto-repair quarantine watcher.
- **Supervisor**: Trade supervisor account balance & limit monitoring.
- **Risk Worker**: Quarantine risk circuit breaker.
- **Telegram Dispatcher**: Delivery queue and delivery success count.
- **Provider Sync**: Exchange position & order ledger sync.

Every worker tile includes a direct **Restart / Run Worker** button that invokes the corresponding backend edge function action.

---

## 4. Live Runtime Counters (17 Metrics)
1. **Signals Scanned**: Candle/symbol count fetched during market scans.
2. **Signals Qualified**: Count of approved or active signals.
3. **Signals Rejected**: Count of rejected setup candidates.
4. **Orders Submitted**: Count of execution order requests.
5. **Orders Filled**: Count of filled execution orders.
6. **Open Positions**: Active exchange trade truth records.
7. **Protected Positions**: Trades with active native SL/TP protection.
8. **Unprotected Positions**: Trades missing protection or flagged as protection failed.
9. **Monitor Cycles**: Count of watchdog heartbeat cycles.
10. **Recovery Jobs**: Quarantined symbols or auto-repair records.
11. **Supervisor Runs**: Count of supervisor executions.
12. **Provider Errors**: Active provider interface errors.
13. **Execution Errors**: Failed execution orders.
14. **Protection Failures**: Unprotected position count.
15. **Telegram Messages**: Successfully delivered Telegram notifications.
16. **Pending Commands**: Count of active/running operator commands.
17. **Failed Commands**: Count of failed actions or deliveries.

---

## 5. Centralized Backend Control Bar
Command buttons execute real backend edge function actions via `admin-operator-action`:
- `Run Scanner` (`run_scanner_now`)
- `Run Monitor` (`run_supervisor_now`)
- `Run Supervisor` (`run_supervisor_now`)
- `Verify Protection` (`repair_protection_now`)
- `Run Recovery` (`run_recovery_now`)
- `Sync Providers` (`refresh_exchange`)
- `Runtime Proof` (`run_runtime_proof`)
- `Reconcile` (`reconcile_runtime`)
- `Resume Bot` (`resume_scanner`)
- `Pause Entries` (`pause_scanner`)
- `EMERGENCY STOP RUNTIME` (`pause_scanner` + `pause_supervisor`)

All commands render an interactive `ActionResult` receipt component showing execution duration, started/finished timestamps, status summary, and route information.

---

## 6. Auto-Refresh & Resource Management
- **Visibility-Aware Polling**: Uses `document.hidden` to pause polling when the browser tab is backgrounded.
- **Selectable Refresh Rate**: Configurable interval (3s, 5s, 10s, 30s, or Manual Pause).
- **Manual Refresh**: Dedicated manual refresh trigger with timestamp tracking.

---

## 7. Verification & Compliance
- **Zero Mock Data**: All metrics are calculated directly from `loadOperatorTruth()` DB queries.
- **Graceful Fallbacks**: Displays `NO_DATA`, `UNSUPPORTED`, or `OFFLINE` when backend data is absent rather than inventing fake state.
- **Lint & Build Verification**: Verified clean via `lint_applet` and `compile_applet`.
