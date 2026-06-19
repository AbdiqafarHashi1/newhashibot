import { supabase } from './supabase';

export type RuntimeRow = Record<string, unknown>;

export interface OperatorTruthBundle {
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
}

async function rows(table: string, order = 'created_at', limit = 100) {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []) as RuntimeRow[];
}

export async function loadOperatorTruth(): Promise<OperatorTruthBundle> {
  const [truth, hb, controls, cfg, sig, deliveryRows, updates, routerAudit, events, executionOrders, intelligenceEvents, intelligenceFeeds] = await Promise.all([
    rows('trade_management_truth', 'latest_sync_at', 250),
    rows('execution_monitor_heartbeats', 'started_at', 75),
    rows('execution_provider_controls', 'updated_at', 50),
    supabase.from('scanner_config').select('*').eq('id', 1).maybeSingle(),
    rows('signals', 'created_at', 250),
    rows('telegram_deliveries', 'created_at', 150),
    rows('signal_updates', 'created_at', 150),
    rows('telegram_router_audit', 'created_at', 150),
    rows('operator_runtime_events', 'created_at', 150),
    rows('execution_orders', 'created_at', 250),
    rows('intelligence_events', 'created_at', 150),
    rows('intelligence_feed_results', 'created_at', 150),
  ]);
  return {
    tradeTruth: truth,
    heartbeats: hb,
    providerControls: controls,
    scannerConfig: (cfg.data as RuntimeRow) ?? null,
    signals: sig,
    telegramDeliveries: deliveryRows,
    signalUpdates: updates,
    telegramRouterAudit: routerAudit,
    runtimeEvents: events,
    executionOrders,
    intelligenceEvents,
    intelligenceFeeds,
  };
}

export async function writeOperatorRuntimeEvent(event: RuntimeRow): Promise<string | null> {
  const { data, error } = await supabase.from('operator_runtime_events').insert(event).select('id').maybeSingle();
  if (error) return null;
  return String((data as RuntimeRow | null)?.id ?? '');
}
