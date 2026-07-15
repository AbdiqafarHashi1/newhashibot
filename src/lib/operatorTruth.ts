import { supabase } from './supabase';
import { governedRequest } from './requestGovernance';

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
  runtimeProof: RuntimeRow | null;
  schedulerTruth: RuntimeRow[];
  quarantine: RuntimeRow[];
  readiness: RuntimeRow[];
  customerSubscriptions: RuntimeRow[];
  accessRequests: RuntimeRow[];
  unavailableSources: Record<string, string>;
}

const unavailableSources: Record<string, string> = {};

async function rows(table: string, order = 'created_at', limit = 100) {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false }).limit(limit);
  if (error) {
    unavailableSources[table] = error.message;
    return [];
  }
  delete unavailableSources[table];
  return (data ?? []) as RuntimeRow[];
}

async function maybeSingle(table: string, select = '*', filter?: (query: ReturnType<typeof supabase.from>) => unknown) {
  const base = supabase.from(table).select(select);
  const query = filter ? filter(base as never) : base;
  const { data, error } = await (query as { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> }).maybeSingle();
  if (error) {
    unavailableSources[table] = error.message;
    return null;
  }
  delete unavailableSources[table];
  return (data as RuntimeRow | null) ?? null;
}

export async function loadOperatorTruth(): Promise<OperatorTruthBundle> {
  return governedRequest({ key: 'operator-truth:canonical', className: 'summary' }, async () => {
    const [
      truth, controls, cfg, sig, deliveryRows, updates, events,
      executionOrders, intelligenceEvents, intelligenceFeeds, overview,
      quarantine, readiness, customerSubscriptions, accessRequests
    ] = await Promise.all([
      rows('admin_active_trade_truth_read_model', 'latest_sync_at', 250),
      rows('execution_provider_controls', 'updated_at', 50),
      maybeSingle('scanner_config', '*', (q) => (q as ReturnType<typeof supabase.from>).eq('id', 1)),
      rows('signals', 'created_at', 250),
      rows('admin_telegram_delivery_health_read_model', 'last_delivery_at', 150),
      rows('signal_updates', 'created_at', 150),
      rows('operator_runtime_events', 'created_at', 150),
      rows('admin_execution_orders_read_model', 'created_at', 250),
      rows('intelligence_events', 'created_at', 150),
      rows('intelligence_feed_results', 'created_at', 150),
      maybeSingle('admin_runtime_overview_read_model'),
      rows('problem_symbol_quarantine', 'last_seen', 100),
      rows('provider_100_trade_readiness_view', 'provider', 10),
      rows('customer_subscriptions', 'created_at', 150),
      rows('access_requests', 'created_at', 100),
    ]);
    return {
      tradeTruth: truth,
      heartbeats: [],
      providerControls: controls,
      scannerConfig: cfg,
      signals: sig,
      telegramDeliveries: deliveryRows,
      signalUpdates: updates,
      telegramRouterAudit: [],
      runtimeEvents: events,
      executionOrders,
      intelligenceEvents,
      intelligenceFeeds,
      runtimeProof: overview,
      schedulerTruth: overview ? [overview] : [],
      quarantine,
      readiness,
      customerSubscriptions,
      accessRequests,
      unavailableSources: { ...unavailableSources },
    };
  });
}

export async function writeOperatorRuntimeEvent(event: RuntimeRow): Promise<string | null> {
  const { data, error } = await supabase.from('operator_runtime_events').insert(event).select('id').maybeSingle();
  if (error) return null;
  return String((data as RuntimeRow | null)?.id ?? '');
}
