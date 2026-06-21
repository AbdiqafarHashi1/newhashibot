import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Bell, Clock, Database, Newspaper, PauseCircle, PlayCircle, Radio, RefreshCw, Shield } from 'lucide-react';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminLiveState } from '../../../hooks/useAdminLiveState';
import { callEdgeFunction } from '../../../lib/edgeFunctionStatus';
import { RUNTIME_PROOF_CONTRACT, runtimeTruth, statusClasses, RuntimeTruthStatus } from '../../../lib/operatorRuntime';
import { ActionResult, OperatorActionResult } from '../../../components/admin/ActionResult';
import { loadOperatorTruth as fetchOperatorTruth, RuntimeRow } from '../../../lib/operatorTruth';

type Section = 'dashboard' | 'signals' | 'executions' | 'trade-manager' | 'telegram' | 'settings' | 'intelligence' | 'runtime-proof';
type Health = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
type RuntimeControlKey = 'scanner' | 'supervisor' | 'telegram' | 'news_brain' | 'auto_repair';

const sectionTitles: Record<Section, string> = {
  dashboard: 'Operator Command Center',
  signals: 'Signal Operations',
  executions: 'Exchange Operations',
  'trade-manager': 'Trade Supervisor',
  telegram: 'Telegram Command Center',
  settings: 'Runtime Controls',
  intelligence: 'News Brain',
  'runtime-proof': 'Runtime Proof',
};

const controlLabels: Array<[RuntimeControlKey, string, string]> = [
  ['scanner', 'Scanner', 'Pause or resume scanner runs from scanner_config.'],
  ['telegram', 'Telegram', 'Pause or resume Telegram runtime operations.'],
  ['news_brain', 'News Brain', 'Pause or resume News Brain runtime operations.'],
  ['supervisor', 'Supervisor', 'Pause or resume supervisor/monitor operations.'],
  ['auto_repair', 'Auto Repair', 'Pause or resume protection repair automation.'],
];

const healthClass: Record<Health, string> = {
  HEALTHY: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  WARNING: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-300',
  OFFLINE: 'border-zinc-700 bg-zinc-900 text-zinc-400',
};

function runtimeToHealth(status: RuntimeTruthStatus): Health {
  if (status === 'LIVE') return 'HEALTHY';
  if (status === 'FAILED') return 'CRITICAL';
  if (status === 'STALE') return 'WARNING';
  return 'OFFLINE';
}

function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = '—'): string {
  const raw = String(value ?? '').trim();
  return raw || fallback;
}

function time(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function isToday(value?: string | null): boolean {
  return value ? new Date(value).toDateString() === new Date().toDateString() : false;
}

function latestDate(rows: RuntimeRow[], keys: string[]): string | null {
  return rows.flatMap((row) => keys.map((key) => row[key]).filter(Boolean) as string[]).sort().slice(-1)[0] ?? null;
}

function numericAverage(rows: RuntimeRow[], key: string): string {
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
  if (!values.length) return '—';
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
}

function Pill({ status }: { status: RuntimeTruthStatus }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClasses(status)}`}>{status}</span>;
}

function HealthPill({ value }: { value: Health }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${healthClass[value]}`}>{value}</span>;
}

function Card({ title, children, status, icon: Icon = Activity, className = '' }: { title: string; children: React.ReactNode; status?: RuntimeTruthStatus; icon?: typeof Activity; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-lg shadow-black/10 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} className="shrink-0 text-blue-300" />
          <h2 className="truncate font-semibold text-zinc-100">{title}</h2>
        </div>
        {status && <Pill status={status} />}
      </div>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-zinc-800/70 py-2 text-sm first:border-t-0">
      <span className="min-w-0 text-zinc-400">{k}</span>
      <span className="max-w-[60%] break-words text-right font-mono text-xs text-zinc-100">{v}</span>
    </div>
  );
}

function Stat({ label, value, tone = 'zinc' }: { label: string; value: React.ReactNode; tone?: 'zinc' | 'green' | 'yellow' | 'red' | 'blue' }) {
  const toneClass = {
    zinc: 'border-zinc-800 bg-zinc-950/40 text-zinc-100',
    green: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    yellow: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200',
    red: 'border-red-500/20 bg-red-500/10 text-red-200',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-200',
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-lg font-bold">{value}</div>
    </div>
  );
}

export default function OperatorPanel({ section = 'dashboard' }: { section?: Section }) {
  const { session } = useAuth();
  const { state, refresh } = useAdminLiveState(session);
  const [proofRunning, setProofRunning] = useState(false);
  const [proofRows, setProofRows] = useState(RUNTIME_PROOF_CONTRACT);
  const [truthRows, setTruthRows] = useState<RuntimeRow[]>([]);
  const [heartbeats, setHeartbeats] = useState<RuntimeRow[]>([]);
  const [providerControls, setProviderControls] = useState<RuntimeRow[]>([]);
  const [scannerConfig, setScannerConfig] = useState<RuntimeRow | null>(null);
  const [signals, setSignals] = useState<RuntimeRow[]>([]);
  const [deliveries, setDeliveries] = useState<RuntimeRow[]>([]);
  const [signalUpdates, setSignalUpdates] = useState<RuntimeRow[]>([]);
  const [routerAudit, setRouterAudit] = useState<RuntimeRow[]>([]);
  const [operatorEvents, setOperatorEvents] = useState<RuntimeRow[]>([]);
  const [executionOrders, setExecutionOrders] = useState<RuntimeRow[]>([]);
  const [intelligenceEvents, setIntelligenceEvents] = useState<RuntimeRow[]>([]);
  const [intelligenceFeeds, setIntelligenceFeeds] = useState<RuntimeRow[]>([]);
  const [runtimeProof, setRuntimeProof] = useState<RuntimeRow | null>(null);
  const [schedulerTruth, setSchedulerTruth] = useState<RuntimeRow[]>([]);
  const [quarantineRows, setQuarantineRows] = useState<RuntimeRow[]>([]);
  const [readinessRows, setReadinessRows] = useState<RuntimeRow[]>([]);
  const [actionResult, setActionResult] = useState<OperatorActionResult | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  async function loadOperatorTruth() {
    const bundle = await fetchOperatorTruth();
    setTruthRows(bundle.tradeTruth);
    setHeartbeats(bundle.heartbeats);
    setProviderControls(bundle.providerControls);
    setScannerConfig(bundle.scannerConfig);
    setSignals(bundle.signals);
    setDeliveries(bundle.telegramDeliveries);
    setSignalUpdates(bundle.signalUpdates);
    setRouterAudit(bundle.telegramRouterAudit);
    setOperatorEvents(bundle.runtimeEvents);
    setExecutionOrders(bundle.executionOrders);
    setIntelligenceEvents(bundle.intelligenceEvents);
    setIntelligenceFeeds(bundle.intelligenceFeeds);
    setRuntimeProof(bundle.runtimeProof);
    setSchedulerTruth(bundle.schedulerTruth);
    setQuarantineRows(bundle.quarantine);
    setReadinessRows(bundle.readiness);
  }

  useEffect(() => {
    void refresh();
    void loadOperatorTruth();
    const id = window.setInterval(() => {
      void refresh();
      void loadOperatorTruth();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const latestProviderSync = latestDate(state.providers as unknown as RuntimeRow[], ['last_success_at', 'updated_at']);
  const scannerStatus = runtimeTruth({
    at: state.latestRun?.started_at,
    enabled: Boolean(scannerConfig?.is_enabled ?? state.scannerEnabled),
    error: state.latestRun?.status === 'failed' ? state.latestRun.error_message ?? 'failed' : null,
    staleAfterMs: 10 * 60_000,
  });
  const supervisorStatus = runtimeTruth({
    at: heartbeats[0]?.started_at as string,
    enabled: Boolean(scannerConfig?.supervisor_enabled ?? true),
    error: heartbeats[0]?.success === false ? text(heartbeats[0]?.errors, 'monitor failed') : null,
    staleAfterMs: 3 * 60_000,
  });
  const telegramStatus = runtimeTruth({
    at: state.latestTelegramDelivery?.created_at,
    enabled: Boolean(scannerConfig?.operator_telegram_enabled ?? state.telegramConfigured),
    error: state.latestTelegramDelivery?.status === 'failed' ? state.latestTelegramDelivery.error_message : null,
    staleAfterMs: 60 * 60_000,
  });
  const newsStatus = runtimeTruth({
    at: state.latestIntelligenceEvent?.created_at,
    enabled: Boolean(scannerConfig?.operator_news_brain_enabled ?? true),
    error: state.failedIntelligenceEvents > 0 && !state.latestIntelligenceEvent ? 'intelligence failures' : null,
    staleAfterMs: 6 * 60 * 60_000,
  });
  const schedulerStatus: RuntimeTruthStatus = state.cronProven ? 'LIVE' : state.cronStale ? 'STALE' : state.schedulerQueryError ? 'FAILED' : 'DISABLED';
  const authoritativeRuntimeStatus = String(runtimeProof?.overall_status ?? runtimeProof?.status ?? '').toUpperCase();
  const runtimeTruthPass = authoritativeRuntimeStatus === 'PASS';

  function providerControl(provider: string) {
    return providerControls.find((row) => row.provider_name === provider || row.provider === provider);
  }

  function latestHeartbeat(provider: string) {
    return heartbeats.find((row) => row.provider === provider);
  }

  function providerStatus(provider: string): RuntimeTruthStatus {
    const hb = latestHeartbeat(provider);
    const ctrl = providerControl(provider);
    return runtimeTruth({
      at: (hb?.started_at as string) ?? latestProviderSync,
      enabled: Boolean(ctrl?.monitor_enabled ?? ctrl?.enabled ?? true),
      error: hb?.success === false ? text(hb?.errors, 'monitor failed') : (ctrl?.last_error as string | undefined),
      staleAfterMs: 3 * 60_000,
    });
  }

  function rowsForProvider(provider: string) {
    return truthRows.filter((row) => row.provider === provider && row.protection_status !== 'closed');
  }

  function unsafeRows(provider: string) {
    return rowsForProvider(provider).filter((row) => !['protected', 'closed'].includes(String(row.protection_status)));
  }

  function protectedRows(provider: string) {
    return rowsForProvider(provider).filter((row) => row.protection_status === 'protected');
  }

  function providerRepairAttempts(provider: string) {
    return heartbeats.filter((row) => row.provider === provider).reduce((sum, row) => sum + count(row.protections_created) + count(row.stale_orders_cleaned), 0);
  }

  const statusRows: Array<[string, RuntimeTruthStatus]> = [
    ['Scanner', scannerStatus],
    ['Supervisor', supervisorStatus],
    ['Telegram', telegramStatus],
    ['News Brain', newsStatus],
    ['Scheduler', schedulerStatus],
    ['Binance', providerStatus('binance')],
    ['Bybit', providerStatus('bybit')],
  ];
  const systemHealth: Health = statusRows.some(([, status]) => status === 'FAILED')
    ? 'CRITICAL'
    : statusRows.some(([, status]) => status === 'STALE')
      ? 'WARNING'
      : statusRows.some(([, status]) => status === 'DISABLED')
        ? 'OFFLINE'
        : 'HEALTHY';
  const statusBar: Array<[string, Health]> = [
    ['System Status', systemHealth],
    ...statusRows.map(([label, status]) => [label, runtimeToHealth(status)] as [string, Health]),
  ];

  const todaySignals = signals.filter((row) => isToday(row.created_at as string));
  const pendingSignals = signals.filter((row) => ['new', 'pending', 'approved'].includes(String(row.status)));
  const activeSignals = signals.filter((row) => ['waiting', 'active', 'tp1_hit'].includes(String(row.status)));
  const expiredSignals = signals.filter((row) => row.status === 'expired');
  const wonSignals = signals.filter((row) => ['won', 'tp2_hit'].includes(String(row.status)));
  const lostSignals = signals.filter((row) => row.status === 'lost');
  const failedDeliveries = deliveries.filter((row) => ['failed', 'error'].includes(String(row.status ?? row.delivery_status)));
  const retryDeliveries = deliveries.filter((row) => count(row.retry_count) > 0);
  const pendingDeliveries = deliveries.filter((row) => ['pending', 'queued'].includes(String(row.status ?? row.delivery_status)));

  const runtimeEvents = useMemo(() => [
    ...operatorEvents.map((row) => ({ at: String(row.created_at), type: text(row.source, 'Runtime'), text: `${text(row.action)} · ${text(row.result)} · ${text(row.summary)}${row.error ? ` · ${row.error}` : ''}` })),
    ...state.recentRuns.map((run) => ({ at: run.started_at, type: 'Scanner', text: `${run.status ?? 'run'} · ${run.signals_created ?? 0} signals · ${run.error_message ?? 'ok'}` })),
    ...deliveries.map((row) => ({ at: String(row.created_at), type: 'Telegram', text: `${text(row.destination_channel, 'channel')} · ${text(row.status ?? row.delivery_status, 'unknown')} · ${text(row.error_message, '')}` })),
    ...signalUpdates.map((row) => ({ at: String(row.created_at), type: 'Signal', text: `${text(row.signal_id, 'signal')} → ${text(row.new_status, 'updated')} · ${text(row.reason ?? row.message, '')}` })),
    ...heartbeats.map((row) => ({ at: String(row.started_at), type: 'Supervisor', text: `${text(row.provider)}/${text(row.environment)} · ${text(row.monitor_status)} · ${count(row.protections_missing)} missing protections` })),
    ...truthRows.map((row) => ({ at: String(row.latest_sync_at), type: 'Protection', text: `${text(row.provider)} ${text(row.symbol)} ${text(row.side)} · ${text(row.protection_status)} · ${text(row.latest_error, '')}` })),
    ...(state.latestIntelligenceEvent ? [{ at: state.latestIntelligenceEvent.created_at, type: 'News', text: `${state.latestIntelligenceEvent.status} · ${state.latestIntelligenceEvent.title ?? state.latestIntelligenceEvent.event_type}` }] : []),
  ].filter((event) => event.at && event.at !== 'undefined').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40), [operatorEvents, state.recentRuns, state.latestIntelligenceEvent, deliveries, signalUpdates, heartbeats, truthRows]);

  const controlFieldMap: Record<RuntimeControlKey, string> = {
    scanner: 'is_enabled',
    supervisor: 'supervisor_enabled',
    telegram: 'operator_telegram_enabled',
    news_brain: 'operator_news_brain_enabled',
    auto_repair: 'operator_auto_repair_enabled',
  };

  async function setControl(key: RuntimeControlKey, value: boolean) {
    const action = `${value ? 'resume' : 'pause'}_${key}`;
    await runAction(action);
    setScannerConfig((prev) => ({ ...(prev ?? {}), [controlFieldMap[key]]: value }));
  }

  async function runAction(action: string, provider?: string) {
    if (!session?.access_token) return;
    const started = Date.now();
    const startedAt = new Date().toISOString();
    const route = '/functions/v1/admin-operator-action';
    const functionName = 'admin-operator-action';
    setRunningAction(action);
    setActionResult({ status: 'RUNNING', action, provider, summary: 'Executing backend operator action…', timestamp: startedAt, startedAt, route, functionName });
    try {
      const data = await callEdgeFunction(functionName, { action, provider }, session.access_token) as unknown as Record<string, unknown>;
      const ok = data?.success !== false && !data?.exact_error;
      const raw = (data?.raw && typeof data.raw === 'object' ? data.raw : data) as Record<string, unknown>;
      const symbols = Array.isArray(raw?.affected_symbols) ? (raw.affected_symbols as unknown[]).map(String) : Array.isArray(raw?.symbols) ? (raw.symbols as unknown[]).map(String) : [];
      setActionResult({
        status: ok ? 'SUCCESS' : 'FAILED',
        action,
        provider,
        summary: String(data?.result_summary ?? (ok ? 'Backend action completed.' : 'Backend action failed.')),
        timestamp: startedAt,
        startedAt: String(data?.started_at ?? startedAt),
        finishedAt: String(data?.finished_at ?? new Date().toISOString()),
        durationMs: Number(data?.duration_ms ?? Date.now() - started),
        symbolsAffected: symbols,
        runtimeEventId: data?.runtime_event_id ? String(data.runtime_event_id) : undefined,
        telegramSent: typeof raw?.telegram_sent === 'boolean' ? raw.telegram_sent : undefined,
        blocker: ok ? undefined : String(data?.blocker ?? 'backend returned failure'),
        route: String(data?.route ?? route),
        functionName: String(data?.function_name ?? functionName),
        error: data?.exact_error ? String(data.exact_error) : undefined,
        raw: data,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'unknown error';
      setActionResult({ status: 'FAILED', action, provider, summary: 'Backend operator route failed.', timestamp: startedAt, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - started, blocker: 'ROUTE_OR_NETWORK_ERROR', route, functionName, error, raw: { expected_route: route, expected_function: functionName, error } });
    } finally {
      setRunningAction(null);
      await refresh();
      await loadOperatorTruth();
    }
  }

  async function runProof() {
    setProofRunning(true);
    try {
      await runAction('run_runtime_proof');
      setProofRows(RUNTIME_PROOF_CONTRACT.map((item) => {
        const provider = item.label.toLowerCase().startsWith('binance') ? 'binance' : item.label.toLowerCase().startsWith('bybit') ? 'bybit' : null;
        const providerOk = provider ? providerStatus(provider) === 'LIVE' : false;
        const telegramOk = item.label.toLowerCase().includes('telegram') && telegramStatus === 'LIVE';
        return { ...item, yes: providerOk || telegramOk, blocker: providerOk || telegramOk ? null : 'No current runtime proof in backend truth.' };
      }));
    } finally {
      setProofRunning(false);
    }
  }

  function statusSection() {
    const latestErrorFor = (label: string) => {
      if (label === 'Scanner') return state.latestRun?.error_message;
      if (label === 'Scheduler') return state.schedulerQueryError;
      if (label === 'Telegram') return state.latestTelegramDelivery?.error_message;
      if (label === 'News Brain') return state.latestIntelligenceEvent?.status === 'failed' ? state.latestIntelligenceEvent.title : undefined;
      if (label === 'Binance' || label === 'Bybit') return rowsForProvider(label.toLowerCase()).find((row) => row.latest_error)?.latest_error ?? latestHeartbeat(label.toLowerCase())?.errors;
      if (label === 'Trade Supervisor') return heartbeats.find((row) => row.success === false)?.errors;
      return statusRows.find(([, status]) => status === 'FAILED')?.[0] ?? '—';
    };
    const lastRunFor = (label: string) => {
      if (label === 'Scanner') return state.latestRun?.started_at;
      if (label === 'Scheduler') return state.schedulerProof.latestStartedAt;
      if (label === 'Telegram') return state.latestTelegramDelivery?.created_at;
      if (label === 'News Brain') return state.latestIntelligenceEvent?.created_at;
      if (label === 'Binance' || label === 'Bybit') return latestHeartbeat(label.toLowerCase())?.started_at as string | undefined;
      if (label === 'Trade Supervisor') return heartbeats[0]?.started_at as string | undefined;
      return latestProviderSync;
    };
    const sourceFor = (label: string) => ({
      Scanner: 'scanner_config + scanner_runs',
      Scheduler: 'scheduler runtime tables',
      'Trade Supervisor': 'execution_monitor_heartbeats',
      Binance: 'trade_management_truth',
      Bybit: 'trade_management_truth',
      Telegram: 'telegram_deliveries',
      'News Brain': 'intelligence runtime tables',
      'Overall Health': 'derived backend truth',
    } as Record<string, string>)[label] ?? 'backend truth';
    const detailed = [['Overall Health', systemHealth], ['Scanner', runtimeToHealth(scannerStatus)], ['Scheduler', runtimeToHealth(schedulerStatus)], ['Trade Supervisor', runtimeToHealth(supervisorStatus)], ['Binance', runtimeToHealth(providerStatus('binance'))], ['Bybit', runtimeToHealth(providerStatus('bybit'))], ['Telegram', runtimeToHealth(telegramStatus)], ['News Brain', runtimeToHealth(newsStatus)]] as Array<[string, Health]>;
    return (
      <Card title="System Health Strip" icon={Activity}>
        <div className={`mb-4 rounded-xl border p-3 text-sm ${runtimeProof?.overall_status === 'SAFE_MODE' || runtimeProof?.status === 'SAFE_MODE' ? 'border-blue-500/30 bg-blue-500/10 text-blue-100' : 'border-zinc-800 bg-zinc-950/40 text-zinc-300'}`}>
          <b>Backend runtime_truth:</b> {String(runtimeProof?.overall_status ?? runtimeProof?.status ?? 'FAIL')} · Source: {String(runtimeProof?.source_table_function ?? 'public.runtime_truth')} · Fetched: {time(runtimeProof?.generated_at as string)}
          {(runtimeProof?.overall_status === 'SAFE_MODE' || runtimeProof?.status === 'SAFE_MODE') && <span className="ml-2 font-bold text-blue-200">SAFE MODE — scanner, execution, supervisor, auto repair, and operational Telegram are paused.</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {detailed.map(([label, value]) => {
            const lastRun = lastRunFor(label);
            const age = lastRun ? `${Math.max(0, Math.round((Date.now() - new Date(lastRun).getTime()) / 60000))}m` : '—';
            return (
              <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex items-center justify-between gap-2"><b className="text-sm">{label}</b><HealthPill value={value} /></div>
                <Row k="Last Run" v={time(lastRun)} />
                <Row k="Last Success" v={value === 'CRITICAL' ? '—' : time(lastRun)} />
                <Row k="Latest Error" v={text(latestErrorFor(label))} />
                <Row k="Data Freshness Age" v={age} />
                <Row k="Source Table" v={sourceFor(label)} />
              </div>
            );
          })}
        </div>
        <div className="mt-4"><ActionResult result={actionResult} /></div>
      </Card>
    );
  }

  function controlsSection() {
    return (
      <Card title="Emergency Controls" icon={PauseCircle}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {controlLabels.map(([key, label, description]) => {
            const enabled = Boolean(scannerConfig?.[key]);
            return (
              <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{enabled ? 'Pause' : 'Resume'} {label}</div>
                    <div className="mt-1 text-xs text-zinc-500">{description}</div>
                  </div>
                  <button
                    onClick={() => void setControl(key, !enabled)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${enabled ? 'bg-red-600/80 text-white hover:bg-red-500' : 'bg-emerald-600/80 text-white hover:bg-emerald-500'}`}
                  >
                    {enabled ? 'Pause' : 'Resume'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  function signalSection() {
    return (
      <Card title="Signal Operations" icon={Radio}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Signals today" value={todaySignals.length} tone="blue" />
          <Stat label="Active" value={activeSignals.length} tone="green" />
          <Stat label="Pending" value={pendingSignals.length} tone="yellow" />
          <Stat label="Expired" value={expiredSignals.length} />
          <Stat label="Won" value={wonSignals.length} tone="green" />
          <Stat label="Lost" value={lostSignals.length} tone="red" />
          <Stat label="Average RR" value={numericAverage(signals, 'risk_reward')} />
          <Stat label="Last signal" value={time(signals[0]?.created_at as string)} />
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[520px] divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {signalUpdates.slice(0, 8).map((row, index) => (
              <div key={`${row.created_at}-${index}`} className="grid grid-cols-[160px_1fr_120px] gap-3 p-3 text-sm">
                <span className="text-zinc-500">{time(row.created_at as string)}</span>
                <span className="truncate">{text(row.signal_id, 'signal')} → {text(row.new_status, 'updated')}</span>
                <span className="text-right text-zinc-400">{text(row.reason ?? row.message)}</span>
              </div>
            ))}
            {!signalUpdates.length && <div className="p-3 text-sm text-zinc-500">No signal lifecycle events in backend truth.</div>}
          </div>
        </div>
      </Card>
    );
  }

  function tradeSupervisorSection() {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {['binance', 'bybit'].map((provider) => {
          const rows = rowsForProvider(provider);
          const hb = latestHeartbeat(provider);
          return (
            <Card key={provider} title={`${provider.toUpperCase()} Trade Supervisor`} icon={Shield} status={providerStatus(provider)}>
              <Row k="Open positions" v={rows.length} />
              <Row k="Protected" v={protectedRows(provider).length} />
              <Row k="Unsafe" v={unsafeRows(provider).length} />
              <Row k="Repair actions" v={providerRepairAttempts(provider)} />
              <Row k="Duplicate orders" v={heartbeats.filter((row) => row.provider === provider).reduce((sum, row) => sum + count((row.metadata as RuntimeRow)?.duplicate_orders), 0)} />
              <Row k="Duplicate orders removed" v={heartbeats.filter((row) => row.provider === provider).reduce((sum, row) => sum + count(row.stale_orders_cleaned), 0)} />
              <Row k="Latest run" v={time((hb?.started_at as string) ?? latestDate(rows, ['latest_sync_at']))} />
              <Row k="Latest error" v={text(rows.find((row) => row.latest_error)?.latest_error ?? hb?.errors)} />
            </Card>
          );
        })}
      </div>
    );
  }

  function exchangeSection() {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {['binance', 'bybit'].map((provider) => {
          const rows = rowsForProvider(provider);
          const hb = latestHeartbeat(provider);
          const ctrl = providerControl(provider);
          return (
            <Card key={provider} title={`${provider.toUpperCase()} Exchange Operations`} icon={Database} status={providerStatus(provider)}>
              <Row k="Status" v={text(ctrl?.status ?? (providerStatus(provider) === 'LIVE' ? 'online' : 'not live'))} />
              <Row k="Wallet reachable" v={hb ? (hb.success ? 'YES' : 'NO') : '—'} />
              <Row k="Open positions" v={rows.length} />
              <Row k="Open orders" v={hb ? count(hb.orders_seen) : '—'} />
              <Row k="Protected" v={protectedRows(provider).length} />
              <Row k="Unsafe" v={unsafeRows(provider).length} />
              <Row k="Last sync" v={time(latestDate([...(hb ? [hb] : []), ...rows], ['completed_at', 'started_at', 'latest_sync_at']))} />
              <Row k="Latest error" v={text(ctrl?.last_error ?? rows.find((row) => row.latest_error)?.latest_error ?? hb?.errors)} />
            </Card>
          );
        })}
      </div>
    );
  }

  function telegramSection() {
    const channels = ['admin', 'vip', 'free'];
    return (
      <Card title="Telegram Command Center" icon={Bell} status={telegramStatus}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Last send" value={time(state.latestTelegramDelivery?.created_at)} tone="blue" />
          <Stat label="Queue" value={pendingDeliveries.length} />
          <Stat label="Failures" value={failedDeliveries.length} tone={failedDeliveries.length ? 'red' : 'green'} />
          <Stat label="Retry queue" value={retryDeliveries.length} tone={retryDeliveries.length ? 'yellow' : 'zinc'} />
          <Stat label="Router events" value={routerAudit.length} tone="blue" />
          <Stat label="Router failures" value={routerAudit.filter((row) => String(row.status ?? row.result).toLowerCase().includes('fail')).length} tone={routerAudit.some((row) => String(row.status ?? row.result).toLowerCase().includes('fail')) ? 'red' : 'green'} />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {channels.map((channel) => {
            const health = state.telegramDeliveryHealth.find((row) => row.destination_channel === channel);
            const latest = deliveries.find((row) => row.destination_channel === channel);
            return (
              <div key={channel} className="rounded-xl border border-zinc-800 p-3">
                <h3 className="mb-2 font-bold uppercase">{channel}</h3>
                <Row k="Last send" v={time(health?.last_success_at ?? latest?.created_at as string)} />
                <Row k="Failures" v={health?.failed_count ?? deliveries.filter((row) => row.destination_channel === channel && ['failed', 'error'].includes(String(row.status ?? row.delivery_status))).length} />
                <Row k="Router health" v={state.telegramConfigured ? 'configured' : 'not configured'} />
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  function newsSection() {
    return (
      <Card title="News Brain" icon={Newspaper} status={newsStatus}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Sources enabled" value={state.intelligenceFeedHealth.filter((feed) => feed.status === 'available').length} tone="blue" />
          <Stat label="Articles processed" value={state.intelligenceHealth.reduce((sum, row) => sum + count(row.generated_count), 0)} />
          <Stat label="Sentiment runs" value={state.intelligenceHealth.filter((row) => String(row.event_type).includes('sentiment')).reduce((sum, row) => sum + count(row.generated_count), 0)} />
          <Stat label="Failures" value={state.failedIntelligenceEvents} tone={state.failedIntelligenceEvents ? 'red' : 'green'} />
        </div>
        <Row k="Latest summary" v={text(state.latestIntelligenceEvent?.title)} />
        <Row k="Last run" v={time(state.latestIntelligenceEvent?.created_at)} />
        <Row k="Latest status" v={text(state.latestIntelligenceEvent?.status)} />
        <Row k="Feed quality" v={state.intelligenceFeedHealth.map((feed) => `${feed.feed_type}:${feed.status}`).join(', ') || '—'} />
      </Card>
    );
  }

  function schedulerSection() {
    const failures = state.recentScheduledRuns.filter((run) => run.status === 'failed').length;
    return (
      <Card title="Scheduler" icon={Clock} status={schedulerStatus}>
        <div className="grid gap-x-8 md:grid-cols-2">
          <Row k="Cron status" v={state.cronStatusLabel} />
          <Row k="Last run" v={time(state.schedulerProof.latestStartedAt)} />
          <Row k="Next run" v={state.scanIntervalMinutes ? `~${state.scanIntervalMinutes} min cadence` : '—'} />
          <Row k="Failures" v={failures} />
          <Row k="Missed runs" v={state.cronStale ? 'YES' : 'NO'} />
          <Row k="Supervisor last run" v={time(heartbeats[0]?.started_at as string)} />
          <Row k="Scanner last run" v={time(state.latestRun?.started_at)} />
          <Row k="Telegram last run" v={time(state.latestTelegramDelivery?.created_at)} />
          <Row k="News Brain last run" v={time(state.latestIntelligenceEvent?.created_at)} />
        </div>
      </Card>
    );
  }




  function executionDetailSection() {
    const rejected = executionOrders.filter((row) => ['rejected', 'failed', 'error'].includes(String(row.status).toLowerCase()));
    return (
      <Card title="Execution Ledger" icon={Database}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Execution records" value={executionOrders.length} tone="blue" />
          <Stat label="Rejected / failed" value={rejected.length} tone={rejected.length ? 'red' : 'green'} />
          <Stat label="Open lifecycle" value={executionOrders.filter((row) => ['pending', 'submitted', 'open'].includes(String(row.status).toLowerCase())).length} />
          <Stat label="Latest" value={time(executionOrders[0]?.created_at as string)} />
        </div>
        <div className="grid gap-3">
          {executionOrders.slice(0, 75).map((row, index) => (
            <div key={`${row.id}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{text(row.symbol)}</b><span>{text(row.status)}</span></div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-zinc-300"><span>Signal: {text(row.signal_id)}</span><span>Direction: {text(row.direction)}</span><span>Mode: {text(row.execution_mode)}</span><span>Bridge: {text(row.bridge_order_id)}</span><span>Ticket: {text(row.mt5_ticket)}</span><span>Entry: {text(row.entry_price)}</span><span>SL/TP: {text(row.stop_loss)} / {text(row.tp1)} / {text(row.tp2)}</span><span>Error: {text(row.error_message)}</span></div>
              <details className="mt-2"><summary className="cursor-pointer text-xs text-zinc-400">Exchange/order raw JSON</summary><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs">{JSON.stringify(row, null, 2)}</pre></details>
            </div>
          ))}
          {!executionOrders.length && <div className="text-sm text-zinc-500">No execution orders found.</div>}
        </div>
      </Card>
    );
  }

  function signalPerformanceSection() {
    const grades = signals.reduce<Record<string, number>>((acc, row) => { const grade = text(row.grade ?? row.signal_grade, 'ungraded'); acc[grade] = (acc[grade] ?? 0) + 1; return acc; }, {});
    const strategies = signals.reduce<Record<string, number>>((acc, row) => { const strategy = text(row.strategy_name ?? row.strategy, 'unknown'); acc[strategy] = (acc[strategy] ?? 0) + 1; return acc; }, {});
    return (
      <Card title="Strategy Performance Detail" icon={Radio}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active" value={activeSignals.length} tone="green" /><Stat label="Expired" value={expiredSignals.length} /><Stat label="Won" value={wonSignals.length} tone="green" /><Stat label="Lost" value={lostSignals.length} tone="red" /><Stat label="Average RR" value={numericAverage(signals, 'risk_reward')} /><Stat label="Grades" value={Object.entries(grades).map(([k,v]) => `${k}:${v}`).join(', ') || '—'} /><Stat label="Strategies" value={Object.keys(strategies).length} tone="blue" />
        </div>
        <div className="grid gap-3">
          {signals.slice(0, 80).map((row, index) => <div key={`${row.id}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{text(row.symbol)}</b><span>{text(row.status)}</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-xs text-zinc-300"><span>Grade: {text(row.grade ?? row.signal_grade)}</span><span>RR: {text(row.risk_reward)}</span><span>Strategy: {text(row.strategy_name ?? row.strategy)}</span><span>Created: {time(row.created_at as string)}</span><span>Signal: {text(row.id)}</span></div></div>)}
        </div>
      </Card>
    );
  }

  function telegramDeliveryDeepSection() {
    return (
      <Card title="Telegram Delivery Ledger" icon={Bell}>
        <div className="grid gap-3">
          {deliveries.slice(0, 75).map((row, index) => <div key={`${row.id}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{text(row.event_type ?? row.delivery_type)}</b><span>{text(row.delivery_status ?? row.status)}</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-zinc-300"><span>Channel: {text(row.destination_channel)}</span><span>Signal: {text(row.signal_id)}</span><span>Chat: {text(row.destination_chat_id ?? row.chat_id)}</span><span>Message: {text(row.telegram_message_id ?? row.message_id)}</span><span>Retries: {count(row.retry_count)}</span><span>Error: {text(row.error_message)}</span><span>Created: {time(row.created_at as string)}</span><span>Sent: {time(row.sent_at as string)}</span></div></div>)}
          {!deliveries.length && <div className="text-sm text-zinc-500">No Telegram deliveries found.</div>}
        </div>
      </Card>
    );
  }

  function newsBrainDeepSection() {
    return (
      <Card title="Intelligence Ledger" icon={Newspaper}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Intelligence events" value={intelligenceEvents.length} tone="blue" /><Stat label="Feed records" value={intelligenceFeeds.length} /><Stat label="Failed feeds" value={intelligenceFeeds.filter((row) => row.status === 'failed').length} tone={intelligenceFeeds.some((row) => row.status === 'failed') ? 'red' : 'green'} /><Stat label="Latest" value={time((intelligenceEvents[0]?.created_at ?? intelligenceFeeds[0]?.created_at) as string)} /></div>
        <div className="grid gap-3">
          {([...intelligenceEvents.map((row) => ({ ...row, kind: 'event' })), ...intelligenceFeeds.map((row) => ({ ...row, kind: 'feed' }))] as RuntimeRow[]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 75).map((row, index) => <div key={`${row.id}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{text(row.event_type ?? row.feed_type)}</b><span>{text(row.status ?? row.classification)}</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-zinc-300"><span>Kind: {text(row.kind)}</span><span>Source: {text(row.source)}</span><span>Category: {text(row.classification ?? row.module)}</span><span>Relevance: {text(row.relevance ?? (row.metadata as RuntimeRow)?.relevance)}</span><span>Summary: {text(row.summary ?? row.freshness)}</span><span>Error: {text(row.error_message)}</span><span>Created: {time(row.created_at as string)}</span></div><details className="mt-2"><summary className="cursor-pointer text-xs text-zinc-400">Raw intelligence JSON</summary><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs">{JSON.stringify(row, null, 2)}</pre></details></div>)}
          {!intelligenceEvents.length && !intelligenceFeeds.length && <div className="text-sm text-zinc-500">No intelligence events or feed results found.</div>}
        </div>
      </Card>
    );
  }

  function operatorActionHistorySection() {
    const actions = operatorEvents.filter((row) => text(row.source).includes('Operator')).slice(0, 30);
    return (
      <Card title="Operator Action History" icon={Activity}>
        <div className="grid gap-3">
          {actions.map((row, index) => (
            <div key={`${row.id}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{text(row.action)}</b><span className={String(row.result) === 'SUCCESS' ? 'text-emerald-300' : String(row.result) === 'FAILED' ? 'text-red-300' : 'text-blue-300'}>{text(row.result)}</span></div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-zinc-300">
                <span>User: {text(row.actor_user_id)}</span><span>Provider: {text(row.provider)}</span><span>Started: {time((row.started_at ?? row.created_at) as string)}</span><span>Finished: {time(row.finished_at as string)}</span>
                <span>Duration: {row.duration_ms ? `${Number(row.duration_ms) / 1000}s` : '—'}</span><span>Runtime Event: {text(row.id)}</span><span>Protected: {text((row.raw as RuntimeRow)?.protected)}</span><span>Unsafe: {text((row.raw as RuntimeRow)?.unsafe)}</span>
              </div>
              <p className="mt-2 text-zinc-200">{text(row.summary)}</p>{Boolean(row.error) && <p className="mt-1 text-red-300">{text(row.error)}</p>}
              <details className="mt-2"><summary className="cursor-pointer text-xs text-zinc-400">Raw JSON</summary><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs">{JSON.stringify(row.raw ?? row, null, 2)}</pre></details>
            </div>
          ))}
          {!actions.length && <div className="text-sm text-zinc-500">No operator button clicks recorded in operator_runtime_events.</div>}
        </div>
      </Card>
    );
  }

  function supervisorTimelineSection() {
    return (
      <Card title="Supervisor Timeline" icon={Shield}>
        <div className="grid gap-3">
          {heartbeats.slice(0, 50).map((row, index) => {
            const unsafe = count(row.protections_missing);
            const protectedCount = Math.max(0, count(row.positions_seen) - unsafe);
            return (
              <div key={`${row.run_id}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><b>{time(row.started_at as string)} · {text(row.provider)}</b><span className={row.success ? 'text-emerald-300' : 'text-red-300'}>{row.success ? 'SUCCESS' : 'FAILED'}</span></div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-xs text-zinc-300">
                  <span>Positions: {count(row.positions_seen)}</span><span>Orders: {count(row.orders_seen)}</span><span>Protected: {protectedCount}</span><span>Unsafe: {unsafe}</span><span>Repairs attempted: {count(row.protections_created) + count(row.stale_orders_cleaned)}</span>
                  <span>Repairs successful: {count(row.protections_created)}</span><span>Duplicates found: {count((row.metadata as RuntimeRow)?.duplicate_orders)}</span><span>Duplicates cancelled: {count(row.stale_orders_cleaned)}</span><span>Result: {text(row.monitor_status)}</span><span>Error: {text(row.errors)}</span>
                </div>
              </div>
            );
          })}
          {!heartbeats.length && <div className="text-sm text-zinc-500">No supervisor/monitor runs found in execution_monitor_heartbeats.</div>}
        </div>
      </Card>
    );
  }

  function protectionDetailSection() {
    const openRows = truthRows.filter((row) => row.protection_status !== 'closed');
    return (
      <Card title="Protection Detail View" icon={Shield}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {openRows.map((row, index) => {
            const missing = [!row.sl_present ? 'Missing SL' : '', !row.tp1_present ? 'Missing TP1' : '', !row.tp2_present ? 'Missing TP2' : ''].filter(Boolean).join(', ') || 'None';
            return (
              <div key={`${row.provider}-${row.symbol}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><b>{text(row.symbol)}</b><span className={row.protection_status === 'protected' ? 'text-emerald-300' : 'text-yellow-300'}>{text(row.protection_status)}</span></div>
                <Row k="Provider" v={text(row.provider)} /><Row k="Side / Qty" v={`${text(row.side)} / ${text(row.qty)}`} /><Row k="Entry / Mark" v={`${text(row.entry_price)} / ${text(row.mark_price)}`} /><Row k="PnL" v={text(row.unrealized_pnl)} />
                <Row k="SL / TP1 / TP2" v={`${row.sl_present ? 'SL' : 'NO SL'} / ${row.tp1_present ? 'TP1' : 'NO TP1'} / ${row.tp2_present ? 'TP2' : 'NO TP2'}`} /><Row k="Profit Lock" v={text(row.profit_lock_status)} /><Row k="Missing" v={missing} /><Row k="Latest Error" v={text(row.latest_error)} /><Row k="Last Synced" v={time(row.latest_sync_at as string)} />
              </div>
            );
          })}
          {!openRows.length && <div className="text-sm text-zinc-500">No open positions in trade_management_truth.</div>}
        </div>
      </Card>
    );
  }

  function telegramRouterDetailSection() {
    return (
      <Card title="Telegram Router Detail" icon={Bell}>
        <div className="grid gap-3">
          {routerAudit.slice(0, 50).map((row, index) => (
            <div key={`${row.id}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{time(row.created_at as string)} · {text(row.event_type ?? row.event)}</b><span>{text(row.destination_channel ?? row.destination)}</span></div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-zinc-300"><span>Symbol: {text(row.symbol)}</span><span>Signal: {text(row.signal_id)}</span><span>Decision: {text(row.decision ?? row.status ?? row.result)}</span><span>Delivery: {text(row.delivery_result ?? row.delivery_status)}</span><span>Reason: {text(row.decision_reason ?? row.reason)}</span><span>Message ID: {text(row.telegram_message_id ?? row.message_id)}</span><span>Error: {text(row.error ?? row.error_message)}</span></div>
            </div>
          ))}
          {!routerAudit.length && <div className="text-sm text-zinc-500">No Telegram routing decisions found in telegram_router_audit.</div>}
        </div>
      </Card>
    );
  }

  function schedulerVisibilitySection() {
    const jobs = [
      { label: 'Scanner Cron', enabled: scannerConfig?.schedule_enabled ?? scannerConfig?.cron_job_active, last: state.latestRun?.started_at, error: state.latestRun?.error_message, source: 'scanner_runs' },
      { label: 'Supervisor Cron', enabled: scannerConfig?.supervisor_enabled, last: heartbeats[0]?.started_at, error: heartbeats[0]?.success === false ? heartbeats[0]?.errors : undefined, source: 'execution_monitor_heartbeats' },
      { label: 'Outcome Cron', enabled: true, last: signalUpdates[0]?.created_at, error: undefined, source: 'signal lifecycle tables' },
      { label: 'News Cron', enabled: scannerConfig?.operator_news_brain_enabled, last: state.latestIntelligenceEvent?.created_at, error: state.latestIntelligenceEvent?.status === 'failed' ? state.latestIntelligenceEvent?.title : undefined, source: 'intelligence runtime tables' },
    ];
    return (
      <Card title="Scheduler Visibility" icon={Clock} status={schedulerStatus}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {jobs.map((job) => { const missed = job.last && Date.now() - new Date(job.last as string).getTime() > 30 * 60_000 ? 1 : 0; return (
            <div key={job.label} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3"><div className="flex items-center justify-between gap-2"><b>{job.label}</b><span className={missed ? 'text-red-300' : 'text-emerald-300'}>{missed ? `MISSED ${missed} RUNS` : 'ON TIME'}</span></div><Row k="Enabled" v={job.enabled ? 'YES' : 'NO'} /><Row k="Last Run" v={time(job.last as string)} /><Row k="Next Expected" v={job.last ? new Date(new Date(job.last as string).getTime() + 5 * 60_000).toLocaleString() : '—'} /><Row k="Missed Runs" v={missed} /><Row k="Latest Error" v={text(job.error)} /><Row k="Source" v={job.source} /></div>
          ); })}
        </div>
      </Card>
    );
  }

  function runtimeProofCenterSection() {
    const rawItems = [
      { label: 'Scanner', pass: scannerStatus === 'LIVE', warn: scannerStatus === 'STALE', time: state.latestRun?.started_at, blocker: state.latestRun?.error_message, source: 'scanner_config + scanner_runs' },
      { label: 'Supervisor', pass: supervisorStatus === 'LIVE', warn: supervisorStatus === 'STALE', time: heartbeats[0]?.started_at, blocker: heartbeats[0]?.errors, source: 'execution_monitor_heartbeats' },
      { label: 'Binance', pass: providerStatus('binance') === 'LIVE' && unsafeRows('binance').length === 0, warn: providerStatus('binance') === 'STALE' || unsafeRows('binance').length > 0, time: latestHeartbeat('binance')?.started_at, blocker: unsafeRows('binance')[0]?.latest_error ?? unsafeRows('binance')[0]?.protection_status, source: 'trade_management_truth' },
      { label: 'Bybit', pass: providerStatus('bybit') === 'LIVE' && unsafeRows('bybit').length === 0, warn: providerStatus('bybit') === 'STALE' || unsafeRows('bybit').length > 0, time: latestHeartbeat('bybit')?.started_at, blocker: unsafeRows('bybit')[0]?.latest_error ?? unsafeRows('bybit')[0]?.protection_status, source: 'trade_management_truth' },
      { label: 'Telegram', pass: telegramStatus === 'LIVE' && failedDeliveries.length === 0, warn: failedDeliveries.length > 0, time: state.latestTelegramDelivery?.created_at, blocker: failedDeliveries[0]?.error_message, source: 'telegram_deliveries' },
      { label: 'News Brain', pass: newsStatus === 'LIVE', warn: newsStatus === 'STALE', time: state.latestIntelligenceEvent?.created_at, blocker: state.latestIntelligenceEvent?.status === 'failed' ? state.latestIntelligenceEvent?.title : undefined, source: 'intelligence runtime tables' },
      { label: 'Signal Distribution', pass: Boolean(scannerConfig?.auto_send_telegram), warn: !scannerConfig?.auto_send_telegram, time: scannerConfig?.updated_at, blocker: !scannerConfig?.auto_send_telegram ? 'auto_send_telegram disabled' : undefined, source: 'scanner_config' },
      { label: 'Scheduler', pass: schedulerTruth.length > 0 && schedulerTruth.every((row) => row.status === 'PASS'), warn: schedulerTruth.some((row) => row.status === 'WARNING'), time: schedulerTruth[0]?.last_run_at ?? state.schedulerProof.latestStartedAt, blocker: schedulerTruth.find((row) => row.status === 'FAIL')?.latest_blocker ?? state.schedulerQueryError, source: 'scheduler_truth_view' },
      { label: 'Quarantine', pass: quarantineRows.filter((row) => row.disabled_for_execution || row.disabled_for_repair).length === 0, warn: quarantineRows.length > 0, time: quarantineRows[0]?.last_seen, blocker: quarantineRows[0]?.reason, source: 'problem_symbol_quarantine' },
      { label: '100-Trade Readiness', pass: readinessRows.every((row) => Number(row.remaining_to_target ?? 100) === 0), warn: readinessRows.length > 0, time: runtimeProof?.generated_at, blocker: readinessRows.find((row) => Number(row.remaining_to_target ?? 100) > 0)?.provider, source: 'clean_trade_audit_view + provider_100_trade_readiness_view' },
      { label: 'Trade Protection', pass: unsafeRows('binance').length + unsafeRows('bybit').length === 0, warn: unsafeRows('binance').length + unsafeRows('bybit').length > 0, time: latestDate(truthRows, ['latest_sync_at']), blocker: unsafeRows('binance')[0]?.protection_status ?? unsafeRows('bybit')[0]?.protection_status, source: 'trade_management_truth' },
    ];
    const items = runtimeTruthPass
      ? rawItems.map((item) => ({ ...item, pass: true, warn: false, blocker: undefined, time: runtimeProof?.generated_at ?? item.time, source: 'runtime_truth_function' }))
      : rawItems;
    return (
      <Card title="Runtime Proof Center" icon={PlayCircle}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => { const result = item.pass ? 'PASS' : item.warn ? 'WARNING' : 'FAIL'; return <div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3"><div className="flex items-center justify-between gap-2"><b>{item.label}</b><span className={result === 'PASS' ? 'text-emerald-300' : result === 'WARNING' ? 'text-yellow-300' : 'text-red-300'}>{result}</span></div><Row k="Latest proof" v={time(item.time as string)} /><Row k="Blocker" v={text(item.blocker)} /><Row k="Source" v={item.source} /><Row k="Runtime Event" v={text(operatorEvents.find((row) => String(row.action).includes(item.label.toLowerCase()))?.id)} /></div>; })}
        </div>
      </Card>
    );
  }

  function criticalIssuesSection() {
    const rawIssues = runtimeTruthPass ? [] : [
      ...truthRows.filter((row) => row.latest_error || !['protected', 'closed'].includes(String(row.protection_status))).map((row) => ({ group: String(row.provider ?? 'Protection'), severity: row.latest_error ? 'CRITICAL' : 'WARNING', first: row.created_at, last: row.latest_sync_at, symbol: row.symbol, source: 'trade_management_truth', error: row.latest_error ?? row.protection_status, action: 'Inspect protection and run Repair Protection Now.' })),
      ...heartbeats.filter((row) => row.success === false || count(row.protections_missing) > 0).map((row) => ({ group: String(row.provider ?? 'Runtime'), severity: row.success === false ? 'CRITICAL' : 'WARNING', first: row.created_at, last: row.started_at, symbol: '—', source: 'execution_monitor_heartbeats', error: row.errors ?? row.monitor_status, action: 'Run provider monitor or full runtime proof.' })),
      ...failedDeliveries.map((row) => ({ group: 'Telegram', severity: 'CRITICAL', first: row.created_at, last: row.created_at, symbol: '—', source: 'telegram_deliveries', error: row.error_message ?? row.status, action: 'Open Telegram failed sends and verify channel config.' })),
      ...quarantineRows.filter((row) => row.disabled_for_execution || row.disabled_for_repair).map((row) => ({ group: 'Quarantine', severity: 'WARNING', first: row.first_seen, last: row.last_seen, symbol: row.symbol, source: 'problem_symbol_quarantine', error: row.reason, action: row.recommended_action ?? 'Wait for cooldown or manually inspect exchange failures.' })),
    ];
    const issues = Array.from(new Map(rawIssues.map((issue) => [`${issue.group}:${issue.symbol}:${String(issue.error)}`, issue])).values()).slice(0, 12);
    return (
      <Card title="Critical Issues" icon={AlertTriangle}>
        <div className="grid gap-3">
          {issues.map((issue, index) => (
            <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><b>{issue.group}</b><span className={issue.severity === 'CRITICAL' ? 'text-red-300' : 'text-yellow-300'}>{issue.severity}</span></div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs text-zinc-300"><span>First: {time(issue.first as string)}</span><span>Last: {time(issue.last as string)}</span><span>Symbol: {text(issue.symbol)}</span><span>Source: {issue.source}</span></div>
              <p className="mt-2 text-zinc-200">{text(issue.error)}</p><p className="mt-1 text-zinc-500">Recommended: {text(issue.action)}</p>
            </div>
          ))}
          {!issues.length && <div className="text-sm text-zinc-500">No unresolved issues found in backend truth.</div>}
        </div>
      </Card>
    );
  }

  function runtimeEventsSection() {
    return (
      <Card title="Latest Runtime Events" icon={Activity}>
        <div className="max-h-96 overflow-auto pr-1">
          {runtimeEvents.map((event, index) => (
            <div key={`${event.at}-${index}`} className="border-t border-zinc-800 py-2 first:border-t-0">
              <div className="text-xs text-zinc-500">{time(event.at)} · {event.type}</div>
              <div className="break-words text-sm text-zinc-200">{event.text || '—'}</div>
            </div>
          ))}
          {!runtimeEvents.length && <div className="text-sm text-zinc-500">No runtime events in backend truth.</div>}
        </div>
      </Card>
    );
  }

  function manualActionsSection() {
    const actions = [
      ['Run Scanner Now', 'run_scanner_now'],
      ['Run Supervisor Now', 'run_supervisor_now'],
      ['Run Binance Monitor', 'run_binance_monitor_now'],
      ['Run Bybit Monitor', 'run_bybit_monitor_now'],
      ['Repair Protection Now', 'repair_protection_now'],
      ['Run Runtime Proof', 'run_runtime_proof'],
      ['Run Telegram Test', 'run_telegram_test'],
      ['Run News Brain', 'run_news_brain'],
    ];
    return (
      <Card title="Manual Operator Actions" icon={PlayCircle}>
        <div className="flex flex-wrap gap-2">
          {actions.map(([label, action]) => (
            <button key={action} disabled={runningAction === action} onClick={() => void runAction(action, action.includes('bybit') ? 'bybit' : action.includes('binance') ? 'binance' : undefined)} className="rounded-xl bg-blue-600/80 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">
              {runningAction === action ? 'Running…' : label}
            </button>
          ))}
          <button onClick={() => void runProof()} className="rounded-xl bg-red-600/80 px-3 py-2 text-sm font-bold text-white hover:bg-red-500">
            Run Runtime Proof
          </button>
        </div>
        <div className="mt-4"><ActionResult result={actionResult} /></div>
      </Card>
    );
  }

  function runtimeProofSection() {
    return (
      <Card title="Runtime Proof" icon={PlayCircle}>
        <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-3"><b>Authoritative Runtime Proof Source</b><span className={runtimeProof?.status === 'PASS' ? 'text-emerald-300' : runtimeProof?.status === 'WARNING' ? 'text-yellow-300' : 'text-red-300'}>{String(runtimeProof?.status ?? 'FAIL')}</span></div>
          <Row k="Source" v={text(runtimeProof?.source_table_function, 'public.runtime_truth')} /><Row k="Blockers" v={text(runtimeProof?.latest_blockers ?? runtimeProof?.blockers)} /><Row k="Generated" v={time(runtimeProof?.generated_at as string)} /><Row k="Last Automatic Run" v={time(runtimeProof?.last_automatic_run_timestamp as string)} /><Row k="Stale Age" v={text(runtimeProof?.stale_age_minutes)} />
        </div>
        <button onClick={() => void runProof()} disabled={proofRunning} className="mb-4 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">
          <PlayCircle size={16} className="inline" /> {proofRunning ? 'Running proof…' : 'Run Runtime Proof'}
        </button>
        <div className="grid gap-2 md:grid-cols-2">
          {proofRows.map((row) => (
            <div key={row.key} className="rounded-xl border border-zinc-800 p-3">
              <div className="flex justify-between gap-3"><b>{row.label}</b><span className={row.yes ? 'text-emerald-300' : 'text-red-300'}>{row.yes ? 'YES' : 'NO'}</span></div>
              <p className="mt-1 text-sm text-zinc-400">{row.blocker ?? 'Runtime proof found.'}</p>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  function renderSection() {
    if (section === 'signals') return <div className="space-y-4">{statusSection()}{signalSection()}{signalPerformanceSection()}{operatorActionHistorySection()}{runtimeEventsSection()}</div>;
    if (section === 'executions') return <div className="space-y-4">{statusSection()}{exchangeSection()}{executionDetailSection()}{supervisorTimelineSection()}{manualActionsSection()}{operatorActionHistorySection()}</div>;
    if (section === 'trade-manager') return <div className="space-y-4">{statusSection()}{tradeSupervisorSection()}{supervisorTimelineSection()}{protectionDetailSection()}{manualActionsSection()}{operatorActionHistorySection()}{runtimeEventsSection()}</div>;
    if (section === 'telegram') return <div className="space-y-4">{statusSection()}{telegramSection()}{telegramRouterDetailSection()}{telegramDeliveryDeepSection()}{manualActionsSection()}{operatorActionHistorySection()}</div>;
    if (section === 'settings') return <div className="space-y-4">{statusSection()}{controlsSection()}{schedulerVisibilitySection()}{schedulerSection()}{manualActionsSection()}{operatorActionHistorySection()}</div>;
    if (section === 'intelligence') return <div className="space-y-4">{statusSection()}{newsSection()}{newsBrainDeepSection()}{manualActionsSection()}{operatorActionHistorySection()}{runtimeEventsSection()}</div>;
    if (section === 'runtime-proof') return <div className="space-y-4">{statusSection()}{runtimeProofSection()}{runtimeProofCenterSection()}{operatorActionHistorySection()}</div>;
    return (
      <div className="space-y-4">
        {statusSection()}
        {runtimeProofCenterSection()}
        {criticalIssuesSection()}
        {tradeSupervisorSection()}
        <div className="grid gap-4 xl:grid-cols-2">
          {telegramSection()}
          {newsSection()}
        </div>
        {manualActionsSection()}
        {operatorActionHistorySection()}
      </div>
    );  }

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <div className="sticky top-14 z-10 -mx-4 border-y border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.25em] text-blue-300">HashiBot X-H.1</p>
              <h1 className="truncate text-2xl font-bold">{sectionTitles[section]}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HealthPill value={statusBar[0][1]} />
              <button onClick={() => { void refresh(); void loadOperatorTruth(); }} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200">
                <RefreshCw size={14} className="inline" /> Refresh
              </button>
            </div>
          </div>
        </div>
        {renderSection()}
      </div>
    </AdminLayout>
  );
}
