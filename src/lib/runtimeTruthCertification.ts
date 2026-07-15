import type { RuntimeTruthStatus } from './operatorRuntime';

export type RuntimeCertificationRow = Record<string, unknown>;

export type WarningClass = 'Expected' | 'Configuration' | 'Provider' | 'Runtime' | 'Unavailable' | 'Adapter Pending' | 'Historical' | 'False Warning';
export type DashboardState = 'unavailable' | 'stale' | 'healthy' | 'adapter_pending' | 'failed';

export const EXECUTION_LIFECYCLE_STAGES = ['Created','Qualified','Submitted','Filled','Protected','TP1','Break-even','TP2','Stopped','Expired','Cancelled','Recovered','Closed'] as const;
export const PROTECTION_STAGES = ['SL','TP1','TP2','Missing protection','Verification','Repair','Recovery','Duplicate cleanup','Orphan cleanup'] as const;

export const RUNTIME_WIDGET_CANONICAL_OWNERS = {
  runtimeProof: 'Runtime & Proofs',
  tradeTruthAuditor: 'Runtime & Proofs',
  overallHealth: 'Command Center',
  providerHealthSummary: 'Prop Providers',
  protectionSummary: 'Protection & Recovery',
  runtimeEventSummary: 'Runtime & Proofs',
  executionSummary: 'Execution Engine',
  scannerSummary: 'Signals & Scanner',
  telegramSummary: 'Telegram Brain',
} as const;

export const OPERATOR_PAGE_RESPONSIBILITY = {
  'Command Center': 'Mission control, critical alerts, shortcuts, and overview only.',
  'Runtime & Proofs': 'Single canonical source for runtime proof, trade truth, health certification, and runtime events.',
  'Testing Cockpit': 'Manual diagnostics, certification, provider tests, recovery tests, and chaos tests.',
  'Signals & Scanner': 'Scanner configuration, diagnostics, history, signal generation, and outcome summaries.',
  'Execution Engine': 'Orders, positions, execution workers, lifecycle, and execution state.',
  'Protection & Recovery': 'SL, TP1, TP2, verification, repair, recovery, duplicate cleanup, orphan cleanup, and protection certification.',
  'Prop Providers': 'Binance, Bybit, MT5 adapters, future providers, connectivity, latency, health, and diagnostics.',
  'Access Requests': 'Pending approvals, package assignment, and customer onboarding.',
  'Customer Management': 'Customers, executors, subscriptions, risk profiles, and provider assignment.',
  'Telegram Links': 'Invitation links, membership verification, VIP onboarding.',
  'Telegram Brain': 'Delivery engine, queue, templates, rich messages, images, channel health, and delivery analytics.',
  'Market Intelligence': 'News, research, AI analysis, and market summaries.',
  'Performance Analytics': 'Signal, execution, provider, and customer performance.',
  'Outcome Tracking': 'Signal outcomes, trade outcomes, expiry, TP, SL, and break-even.',
  'Retention & Storage': 'Cleanup, rotation, storage, and retention.',
  'Audit Trail': 'Operator actions, recovery actions, runtime events, repairs, and certification history.',
  'Settings & Secrets': 'Environment configuration, secrets, providers, security, and runtime settings.',
  'Scheduler Guide': 'Manual mode, automatic mode, scheduler certification; disabled cron displays Manual Mode, never Failed.',
} as const;

export const DASHBOARD_TRUTH_INVENTORY = [
  { value: 'Runtime Proof', source: 'runtime_proof_view(scope=runtime)', refresh: 'runtime proof action or monitor certification write', failure: 'failed', unavailable: 'unavailable', stale: 'stale', healthy: 'healthy', adapterPending: 'adapter_pending' },
  { value: 'Trade Truth', source: 'execution_orders joined to trade_management_truth by execution_order_id/trade_id', refresh: 'execution writer and monitor reconciliation', failure: 'desynchronized', unavailable: 'unavailable', stale: 'stale', healthy: 'healthy', adapterPending: 'adapter_pending' },
  { value: 'Protection', source: 'trade_management_truth protection_status plus execution_orders protection fields', refresh: 'provider monitor verification/repair', failure: 'failed', unavailable: 'unavailable', stale: 'stale', healthy: 'healthy', adapterPending: 'adapter_pending' },
  { value: 'Scheduler', source: 'scanner_runs automatic proof when enabled; scanner_config when manual', refresh: 'manual scan or pg_cron only when enabled', failure: 'failed only when configured automatic proof query fails', unavailable: 'manual mode', stale: 'stale', healthy: 'healthy', adapterPending: 'adapter_pending' },
] as const;

export const OPERATOR_NAVIGATION_CERTIFICATION = {
  HASHICORE: ['Command Center', 'Runtime & Proofs', 'Testing Cockpit'],
  OPERATIONS: ['Signals & Scanner', 'Execution Engine', 'Protection & Recovery', 'Prop Providers'],
  CUSTOMERS: ['Access Requests', 'Customer Management', 'Telegram Links'],
  INTELLIGENCE: ['Telegram Brain', 'Market Intelligence', 'Performance Analytics'],
  PLATFORM: ['Outcome Tracking', 'Retention & Storage', 'Audit Trail', 'Settings & Secrets', 'Scheduler Guide'],
} as const;

export const WARNING_CLASSIFICATION = {
  schedulerCronOff: { classification: 'Expected', operatorText: 'Cron is OFF by design; scheduler displays Manual Mode, never Failed.' },
  telegramPrePhase2: { classification: 'Expected', operatorText: 'Telegram remains expected/pending until Phase 2 end-to-end certification.' },
  mt5PreAdapter: { classification: 'Adapter Pending', operatorText: 'MT5 is a future adapter and must not appear as a runtime failure.' },
  futureProviders: { classification: 'Adapter Pending', operatorText: 'Future providers are adapter-pending unless explicitly enabled.' },
  unavailableData: { classification: 'Unavailable', operatorText: 'Unavailable source data remains unavailable and must not be converted to zero.' },
  providerOutage: { classification: 'Provider', operatorText: 'Provider-specific connectivity or latency failure.' },
  realRuntimeFailure: { classification: 'Runtime', operatorText: 'Only real runtime failures may be Runtime warnings.' },
} as const satisfies Record<string, { classification: WarningClass; operatorText: string }>;

export const TELEGRAM_READINESS_DEPENDENCIES = [
  { dependency: 'Telegram Brain', readiness: 'ready_for_phase2_certification', implementation: 'not_started' },
  { dependency: 'Telegram Links', readiness: 'ready_for_phase2_certification', implementation: 'not_started' },
  { dependency: 'Signal Delivery', readiness: 'requires_phase2_end_to_end_delivery_certification', implementation: 'not_started' },
  { dependency: 'Membership Verification', readiness: 'requires_phase2_link_and_membership_certification', implementation: 'not_started' },
  { dependency: 'VIP Channels', readiness: 'requires_phase2_channel_entitlement_certification', implementation: 'not_started' },
  { dependency: 'Execution Notifications', readiness: 'requires_phase2_notification_mapping', implementation: 'not_started' },
  { dependency: 'Recovery Notifications', readiness: 'requires_phase2_recovery_alert_mapping', implementation: 'not_started' },
  { dependency: 'Message Queue', readiness: 'requires_phase2_queue_certification', implementation: 'not_started' },
  { dependency: 'Deduplication', readiness: 'requires_phase2_delivery_dedupe_certification', implementation: 'not_started' },
  { dependency: 'Rich Messages', readiness: 'requires_phase2_template_certification', implementation: 'not_started' },
  { dependency: 'Images', readiness: 'requires_phase2_asset_delivery_certification', implementation: 'not_started' },
  { dependency: 'Human-style messaging', readiness: 'requires_phase2_copy_and_throttle_certification', implementation: 'not_started' },
] as const;

export const DEAD_CODE_AUDIT_FINDINGS = [
  { finding: 'src/pages/admin/Handoff.tsx contains an explicit placeholder/TODO label', disposition: 'retained_future_placeholder_not_runtime_dead_code' },
  { finding: 'Mock Supabase helpers remain test/dev support', disposition: 'retained_non_production_support' },
  { finding: 'Legacy runtime status names remain in historical docs and compatibility contracts', disposition: 'retained_historical_or_compatibility_context' },
] as const;

const ACTIVE_EXECUTION_STATUSES = new Set(['created','qualified','entry_submitted','submitted','entry_filled','protected_native','protected_managed','protection_failed','partially_closed','tp1','tp2','recovered']);
const CLOSED_TRUTH_STATUSES = new Set(['closed','cancelled','expired','stopped','archived']);

function norm(v: unknown): string { return String(v ?? '').trim().toLowerCase(); }
function orderKey(order: RuntimeCertificationRow): string { return norm(order.id ?? order.execution_order_id ?? order.trade_id); }
function truthExecutionKey(truth: RuntimeCertificationRow): string { return norm(truth.execution_order_id ?? truth.trade_id ?? truth.id); }
function providerSymbolSideKey(row: RuntimeCertificationRow): string { return [row.provider ?? row.execution_provider ?? row.exchange, row.environment, row.symbol, row.side ?? row.position_side ?? row.direction].map(norm).join('|'); }

export interface TradeTruthCertification {
  status: RuntimeTruthStatus;
  summary: string;
  orphanExecutionOrderIds: string[];
  orphanTruthIds: string[];
  duplicateTruthKeys: string[];
  staleTruthIds: string[];
}

export function certifyTradeTruth(executionOrders: RuntimeCertificationRow[], truthRows: RuntimeCertificationRow[]): TradeTruthCertification {
  if (executionOrders.length === 0 && truthRows.length === 0) return { status: 'NO DATA', summary: 'Unavailable: no execution_orders or trade_management_truth rows were returned; no zero fabricated.', orphanExecutionOrderIds: [], orphanTruthIds: [], duplicateTruthKeys: [], staleTruthIds: [] };
  const truthByExecution = new Map<string, RuntimeCertificationRow[]>();
  for (const truth of truthRows) {
    const key = truthExecutionKey(truth) || providerSymbolSideKey(truth);
    truthByExecution.set(key, [...(truthByExecution.get(key) ?? []), truth]);
  }
  const orderKeys = new Set<string>();
  const orphanExecutionOrderIds: string[] = [];
  for (const order of executionOrders) {
    const key = orderKey(order) || providerSymbolSideKey(order);
    orderKeys.add(key);
    const matches = truthByExecution.get(key) ?? truthRows.filter((truth) => providerSymbolSideKey(truth) === providerSymbolSideKey(order));
    if (matches.length !== 1 && ACTIVE_EXECUTION_STATUSES.has(norm(order.status ?? order.lifecycle_state))) orphanExecutionOrderIds.push(String(order.id ?? key));
  }
  const duplicateTruthKeys = [...truthByExecution.entries()].filter(([, rows]) => rows.length > 1).map(([key]) => key);
  const orphanTruthIds = truthRows.filter((truth) => {
    const key = truthExecutionKey(truth) || providerSymbolSideKey(truth);
    return !orderKeys.has(key) && !CLOSED_TRUTH_STATUSES.has(norm(truth.status ?? truth.trade_lifecycle_state ?? truth.protection_status));
  }).map((truth) => String(truth.id ?? truth.trade_id ?? providerSymbolSideKey(truth)));
  const staleTruthIds = truthRows.filter((truth) => norm(truth.monitor_status) === 'stale' || norm(truth.latest_sync_error)).map((truth) => String(truth.id ?? truth.trade_id ?? providerSymbolSideKey(truth)));
  const bad = orphanExecutionOrderIds.length + orphanTruthIds.length + duplicateTruthKeys.length + staleTruthIds.length;
  return { status: bad ? 'FAILED' : 'LIVE', summary: bad ? 'Trade Truth synchronization failed certification; see orphan, duplicate, and stale truth lists.' : 'Trade Truth is synchronized: every active execution order has exactly one truth row and no active orphan truth rows were detected.', orphanExecutionOrderIds, orphanTruthIds, duplicateTruthKeys, staleTruthIds };
}

export function schedulerModeLabel(cronEnabled: boolean): { label: 'Manual Mode' | 'Automatic Mode'; status: RuntimeTruthStatus; warning: WarningClass } {
  return cronEnabled ? { label: 'Automatic Mode', status: 'UNKNOWN', warning: 'Configuration' } : { label: 'Manual Mode', status: 'DISABLED', warning: 'Expected' };
}

export function classifyRuntimeWarning(key: keyof typeof WARNING_CLASSIFICATION): WarningClass {
  return WARNING_CLASSIFICATION[key].classification;
}

export function operatorNavigationPages(): string[] {
  return Object.values(OPERATOR_NAVIGATION_CERTIFICATION).flat();
}
