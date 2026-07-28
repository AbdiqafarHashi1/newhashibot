import { supabase } from './supabase';

export type RuntimeRow = Record<string, unknown>;

export interface OperatorTruthBundle {
  executionSettings: RuntimeRow | null;
  sourceErrors: Record<string, string>;
  tradeTruth: RuntimeRow[];
  heartbeats: RuntimeRow[];
  providerControls: RuntimeRow[];
  scannerConfig: RuntimeRow | null;
  signals: RuntimeRow[];
  signalUpdates: RuntimeRow[];
  telegramDeliveries: RuntimeRow[];
  telegramRouterAudit: RuntimeRow[];
  runtimeEvents: RuntimeRow[];
  executionOrders: RuntimeRow[];
  intelligenceEvents: RuntimeRow[];
  intelligenceFeeds: RuntimeRow[];
  runtimeProof: RuntimeRow | null;
  schedulerTruth: RuntimeRow[];
  quarantine: RuntimeRow[];
  readiness: RuntimeRow[];
  customerSubscriptions: RuntimeRow[];
  accessRequests: RuntimeRow[];
}

async function rows(table: string, order = 'created_at', limit = 100) {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false }).limit(limit);
  return { data: (data ?? []) as RuntimeRow[], error: error?.message ?? null };
}

export async function loadOperatorTruth(): Promise<OperatorTruthBundle> {
  const [
    truth, hb, controls, cfg, settings, sig, deliveryRows, updates, routerAudit, events,
    executionOrders, intelligenceEvents, intelligenceFeeds, runtimeProof, 
    schedulerTruth, quarantine, readiness, customerSubscriptions, accessRequests
  ] = await Promise.all([
    rows('trade_management_truth', 'latest_sync_at', 250),
    rows('execution_monitor_heartbeats', 'started_at', 75),
    rows('execution_provider_controls', 'updated_at', 50),
    supabase.from('scanner_config').select('*').eq('id', 1).maybeSingle(),
    supabase.from('execution_settings').select('*').eq('id', 1).maybeSingle(),
    rows('signals', 'created_at', 250),
    rows('telegram_deliveries', 'created_at', 150),
    rows('signal_updates', 'created_at', 150),
    rows('telegram_router_audit', 'created_at', 150),
    rows('operator_runtime_events', 'created_at', 150),
    rows('execution_orders', 'created_at', 250),
    rows('intelligence_events', 'created_at', 150),
    rows('intelligence_feed_results', 'created_at', 150),
    supabase.from('runtime_proof_view').select('*').eq('scope', 'runtime').maybeSingle(),
    rows('scheduler_truth_view', 'last_run_at', 100),
    rows('problem_symbol_quarantine', 'last_seen', 100),
    rows('provider_100_trade_readiness_view', 'provider', 10),
    rows('customer_subscriptions', 'created_at', 150),
    rows('access_requests', 'created_at', 100),
  ]);
  const rowSources = { trade_management_truth: truth, execution_monitor_heartbeats: hb, execution_provider_controls: controls,
    signals: sig, telegram_deliveries: deliveryRows, signal_updates: updates, telegram_router_audit: routerAudit,
    operator_runtime_events: events, execution_orders: executionOrders, intelligence_events: intelligenceEvents,
    intelligence_feed_results: intelligenceFeeds, scheduler_truth_view: schedulerTruth, problem_symbol_quarantine: quarantine,
    provider_100_trade_readiness_view: readiness, customer_subscriptions: customerSubscriptions, access_requests: accessRequests };
  const sourceErrors = Object.fromEntries(Object.entries(rowSources).flatMap(([name, result]) => result.error ? [[name, result.error]] : []));
  if (cfg.error) sourceErrors.scanner_config = cfg.error.message;
  if (settings.error) sourceErrors.execution_settings = settings.error.message;
  const proofResult = runtimeProof as { data?: RuntimeRow | null; error?: { message: string } | null };
  if (proofResult.error) sourceErrors.runtime_proof_view = proofResult.error.message;
  return {
    executionSettings: (settings.data as RuntimeRow) ?? null,
    sourceErrors,
    tradeTruth: truth.data,
    heartbeats: hb.data,
    providerControls: controls.data,
    scannerConfig: (cfg.data as RuntimeRow) ?? null,
    signals: sig.data, telegramDeliveries: deliveryRows.data, signalUpdates: updates.data,
    telegramRouterAudit: routerAudit.data, runtimeEvents: events.data, executionOrders: executionOrders.data,
    intelligenceEvents: intelligenceEvents.data, intelligenceFeeds: intelligenceFeeds.data,
    runtimeProof: proofResult.data ?? null, schedulerTruth: schedulerTruth.data, quarantine: quarantine.data,
    readiness: readiness.data, customerSubscriptions: customerSubscriptions.data, accessRequests: accessRequests.data,
  };
}

export async function writeOperatorRuntimeEvent(event: RuntimeRow): Promise<string | null> {
  const { data, error } = await supabase.from('operator_runtime_events').insert(event).select('id').maybeSingle();
  if (error) return null;
  return String((data as RuntimeRow | null)?.id ?? '');
}
