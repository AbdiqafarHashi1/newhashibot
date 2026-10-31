import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bybitMonitor = readFileSync('supabase/functions/bybit-testnet-monitor/index.ts', 'utf8');
const binanceMonitor = readFileSync('supabase/functions/binance-testnet-monitor/index.ts', 'utf8');
const admin = readFileSync('supabase/functions/admin-operator-action/index.ts', 'utf8');
const providerWorkspace = readFileSync('src/pages/admin/ProviderOperationsWorkspace.tsx', 'utf8');
const performance = readFileSync('src/pages/admin/Performance.tsx', 'utf8');
const propTrading = readFileSync('src/pages/admin/PropTradingPanel.tsx', 'utf8');

function includesAll(source: string, markers: string[], name: string) {
  for (const marker of markers) assert.ok(source.includes(marker), `${name} missing ${marker}`);
}

includesAll(bybitMonitor, [
  'MONITOR_TIMEOUT_MS = 25000',
  'MONITOR_ROW_LIMIT = 25',
  'MONITOR_CANCEL_LIMIT = 25',
  'MONITOR_REPAIR_LIMIT = 30',
  'assertMonitorBudget',
  'withStage(stageTimings, "provider_snapshot"',
  'stage_timings: stageTimings',
  'bounded_limits',
], 'Bybit bounded monitor contract');

includesAll(bybitMonitor, [
  'acquireBybitMonitorLease',
  'MONITOR_ALREADY_RUNNING',
  'releaseBybitMonitorLease',
  'bybit_monitor_lease',
  'execution_monitor_heartbeats',
], 'Bybit overlap rejection contract');

includesAll(bybitMonitor, [
  'order("updated_at", { ascending: true }).limit(MONITOR_ROW_LIMIT)',
  'symbolOrders.slice(0, cancelBudget)',
  'repairBudget > 0',
  'verificationOrderList = repairAttempted',
  '/v5/order/realtime",{category:"linear",symbol:row.symbol,openOnly:0,limit:50',
], 'Bybit duplicate reconciliation and bounded repair contract');

for (const source of [bybitMonitor, binanceMonitor]) {
  includesAll(source, ['authorizeInternalOrAdmin', 'upsertTradeManagementTruth', 'execution_monitor_heartbeats'], 'shared provider monitor lifecycle');
}

includesAll(admin, [
  'run_bybit_monitor_now',
  'run_supervisor_now',
  'repair_protection_now',
  'retry_protection',
  'retry_verification',
  'refresh_exchange',
  'operator_runtime_events',
  'idempotencyKey',
], 'operator action certification contract');

includesAll(providerWorkspace, [
  'active_trade_management_truth',
  'getMonitorTruth(monitorState)',
  'monitorTruth.label',
  'latest_recovery_run_at',
], 'dashboard truth contract');
includesAll(propTrading, ['Historical Bybit Prop account records', 'not verified firm results'], 'Bybit dashboard truth contract');

includesAll(performance, [
  'System safety truth from execution rows plus monitor-synced Binance positions and orders.',
  'Monitor critical status',
  'Monitor warnings',
  'Row errors',
], 'performance truth contract');

console.log('phase1 runtime certification static tests passed');
