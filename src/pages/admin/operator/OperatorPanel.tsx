import { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, Clock, Database, Newspaper, PauseCircle, PlayCircle, Radio, RefreshCw, Shield } from 'lucide-react';
import { AdminLayout } from '../../../components/layout/AdminLayout';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminLiveState } from '../../../hooks/useAdminLiveState';
import { callEdgeFunction } from '../../../lib/edgeFunctionStatus';
import { RUNTIME_PROOF_CONTRACT, runtimeTruth, statusClasses, RuntimeTruthStatus } from '../../../lib/operatorRuntime';
import { supabase } from '../../../lib/supabase';

type Section = 'dashboard' | 'signals' | 'executions' | 'trade-manager' | 'telegram' | 'settings' | 'intelligence' | 'runtime-proof';
type Health = 'Online' | 'Warning' | 'Critical' | 'Offline';
type RuntimeControlKey = 'is_enabled' | 'supervisor_enabled' | 'operator_telegram_enabled' | 'operator_news_brain_enabled' | 'auto_send_telegram' | 'operator_auto_repair_enabled';
type RuntimeRow = Record<string, unknown>;

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
  ['is_enabled', 'Scanner', 'Pause or resume scanner runs from scanner_config.'],
  ['operator_telegram_enabled', 'Telegram', 'Pause or resume Telegram runtime operations.'],
  ['operator_news_brain_enabled', 'News Brain', 'Pause or resume News Brain runtime operations.'],
  ['supervisor_enabled', 'Supervisor', 'Pause or resume supervisor/monitor operations.'],
  ['auto_send_telegram', 'Signal Distribution', 'Pause or resume signal distribution.'],
  ['operator_auto_repair_enabled', 'Auto Repair', 'Pause or resume protection repair automation.'],
];

const healthClass: Record<Health, string> = {
  Online: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  Warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
  Critical: 'border-red-500/30 bg-red-500/10 text-red-300',
  Offline: 'border-zinc-700 bg-zinc-900 text-zinc-400',
};

function runtimeToHealth(status: RuntimeTruthStatus): Health {
  if (status === 'LIVE') return 'Online';
  if (status === 'FAILED') return 'Critical';
  if (status === 'STALE') return 'Warning';
  return 'Offline';
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

  async function loadOperatorTruth() {
    const [truth, hb, controls, cfg, sig, deliveryRows, updates] = await Promise.all([
      supabase.from('trade_management_truth').select('*').order('latest_sync_at', { ascending: false }).limit(200),
      supabase.from('execution_monitor_heartbeats').select('*').order('started_at', { ascending: false }).limit(50),
      supabase.from('execution_provider_controls').select('*'),
      supabase.from('scanner_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('telegram_deliveries').select('*').order('created_at', { ascending: false }).limit(75),
      supabase.from('signal_updates').select('*').order('created_at', { ascending: false }).limit(75),
    ]);

    setTruthRows((truth.data ?? []) as RuntimeRow[]);
    setHeartbeats((hb.data ?? []) as RuntimeRow[]);
    setProviderControls((controls.data ?? []) as RuntimeRow[]);
    setScannerConfig((cfg.data as RuntimeRow) ?? null);
    setSignals((sig.data ?? []) as RuntimeRow[]);
    setDeliveries((deliveryRows.data ?? []) as RuntimeRow[]);
    setSignalUpdates((updates.data ?? []) as RuntimeRow[]);
  }

  useEffect(() => {
    void refresh();
    void loadOperatorTruth();
    const id = window.setInterval(() => {
      void refresh();
      void loadOperatorTruth();
    }, 5_000);
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
    ? 'Critical'
    : statusRows.some(([, status]) => status === 'STALE')
      ? 'Warning'
      : statusRows.some(([, status]) => status === 'DISABLED')
        ? 'Offline'
        : 'Online';
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
    ...state.recentRuns.map((run) => ({ at: run.started_at, type: 'Scanner', text: `${run.status ?? 'run'} · ${run.signals_created ?? 0} signals · ${run.error_message ?? 'ok'}` })),
    ...deliveries.map((row) => ({ at: String(row.created_at), type: 'Telegram', text: `${text(row.destination_channel, 'channel')} · ${text(row.status ?? row.delivery_status, 'unknown')} · ${text(row.error_message, '')}` })),
    ...signalUpdates.map((row) => ({ at: String(row.created_at), type: 'Signal', text: `${text(row.signal_id, 'signal')} → ${text(row.new_status, 'updated')} · ${text(row.reason ?? row.message, '')}` })),
    ...heartbeats.map((row) => ({ at: String(row.started_at), type: 'Supervisor', text: `${text(row.provider)}/${text(row.environment)} · ${text(row.monitor_status)} · ${count(row.protections_missing)} missing protections` })),
    ...truthRows.map((row) => ({ at: String(row.latest_sync_at), type: 'Protection', text: `${text(row.provider)} ${text(row.symbol)} ${text(row.side)} · ${text(row.protection_status)} · ${text(row.latest_error, '')}` })),
    ...(state.latestIntelligenceEvent ? [{ at: state.latestIntelligenceEvent.created_at, type: 'News', text: `${state.latestIntelligenceEvent.status} · ${state.latestIntelligenceEvent.title ?? state.latestIntelligenceEvent.event_type}` }] : []),
  ].filter((event) => event.at && event.at !== 'undefined').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40), [state.recentRuns, state.latestIntelligenceEvent, deliveries, signalUpdates, heartbeats, truthRows]);

  async function setControl(key: RuntimeControlKey, value: boolean) {
    setScannerConfig((prev) => ({ ...(prev ?? {}), [key]: value }));
    await supabase.from('scanner_config').update({ [key]: value, updated_at: new Date().toISOString() }).eq('id', 1);
    await loadOperatorTruth();
  }

  async function runAction(action: string) {
    if (!session?.access_token) return;
    await callEdgeFunction('admin-scheduler-action', { action }, session.access_token);
    await refresh();
    await loadOperatorTruth();
  }

  async function runProof() {
    setProofRunning(true);
    try {
      await runAction('runtime_proof');
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
    return (
      <Card title="System Status" icon={Activity}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {statusBar.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-800 p-3">
              <div className="text-xs text-zinc-400">{label}</div>
              <HealthPill value={value} />
            </div>
          ))}
        </div>
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
      ['Run Binance Monitor', 'run_binance_monitor'],
      ['Run Bybit Monitor', 'run_bybit_monitor'],
      ['Run Telegram Test', 'run_telegram_test'],
      ['Run News Brain', 'run_news_brain'],
    ];
    return (
      <Card title="Manual Operator Actions" icon={PlayCircle}>
        <div className="flex flex-wrap gap-2">
          {actions.map(([label, action]) => (
            <button key={action} onClick={() => void runAction(action)} className="rounded-xl bg-blue-600/80 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500">
              {label}
            </button>
          ))}
          <button onClick={() => void runProof()} className="rounded-xl bg-red-600/80 px-3 py-2 text-sm font-bold text-white hover:bg-red-500">
            Run Runtime Proof
          </button>
        </div>
      </Card>
    );
  }

  function runtimeProofSection() {
    return (
      <Card title="Runtime Proof" icon={PlayCircle}>
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
    if (section === 'signals') return <div className="space-y-4">{statusSection()}{signalSection()}{runtimeEventsSection()}</div>;
    if (section === 'executions') return <div className="space-y-4">{statusSection()}{exchangeSection()}{manualActionsSection()}</div>;
    if (section === 'trade-manager') return <div className="space-y-4">{statusSection()}{tradeSupervisorSection()}{manualActionsSection()}{runtimeEventsSection()}</div>;
    if (section === 'telegram') return <div className="space-y-4">{statusSection()}{telegramSection()}{manualActionsSection()}</div>;
    if (section === 'settings') return <div className="space-y-4">{statusSection()}{controlsSection()}{manualActionsSection()}</div>;
    if (section === 'intelligence') return <div className="space-y-4">{statusSection()}{newsSection()}{manualActionsSection()}{runtimeEventsSection()}</div>;
    if (section === 'runtime-proof') return <div className="space-y-4">{statusSection()}{runtimeProofSection()}</div>;
    return (
      <div className="space-y-4">
        {statusSection()}
        {controlsSection()}
        <div className="grid gap-4 xl:grid-cols-2">
          {signalSection()}
          {schedulerSection()}
        </div>
        {tradeSupervisorSection()}
        {exchangeSection()}
        <div className="grid gap-4 xl:grid-cols-2">
          {telegramSection()}
          {newsSection()}
        </div>
        {runtimeEventsSection()}
        {manualActionsSection()}
      </div>
    );
  }

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
