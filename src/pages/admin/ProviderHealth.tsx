import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ProviderStatus, Symbol as SymbolRow } from '../../lib/types';
import { useAdminLiveState } from '../../hooks/useAdminLiveState';
import { Badge, statusBadge } from '../../components/ui/Badge';
import { callEdgeFunction, EdgeFunctionReachability, ADMIN_SCHEDULER_DEPLOY_INSTRUCTIONS, ADMIN_SCHEDULER_MISSING_MESSAGE } from '../../lib/edgeFunctionStatus';
import { AlertTriangle, CheckCircle, Database, Info, RefreshCw, Wifi, ChevronDown, ChevronUp } from 'lucide-react';
import { getFrontendSupabaseUrl } from '../../lib/supabaseEnv';

interface RuntimeConfig {
  provider?: string;
  fallbacks?: string[];
  demo_fallback?: boolean;
  finnhub_api_key_set?: boolean;
  twelvedata_api_key_set?: boolean;
  effective_provider_order?: string[];
  crypto_provider?: string;
  market_mode?: string;
  signal_enable_crypto?: boolean;
  signal_enable_forex?: boolean;
  forex_disabled?: boolean;
  forex_provider_ignored?: string;
  forex_fallbacks_ignored?: string;
  forex_demo_fallback_ignored?: string;
  telegram_enabled?: boolean;
  enable_signal_mode_output?: boolean;
  telegram_bot_token_set?: boolean;
  telegram_default_channel_id_set?: boolean;
  telegram_chat_id_set?: boolean;
  supabase_url_set?: boolean;
  supabase_service_role_key_set?: boolean;
  scanner_cron_secret_set?: boolean;
}

interface ScannerConfigSummary {
  auto_send_telegram?: boolean;
  schedule_enabled?: boolean;
  cron_job_active?: boolean;
}

function safeLower(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function safeDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function providerLabel(p: Partial<ProviderStatus>) {
  const name = typeof p.provider_name === 'string' && p.provider_name.trim() ? p.provider_name : 'Historical unknown provider row';
  return name;
}

function isForexProviderRow(p: Partial<ProviderStatus>) {
  const market = safeLower(p.market_type);
  const name = safeLower(p.provider_name);
  return market === 'forex' || ['forex', 'demo', 'finnhub', 'twelvedata', 'oanda', 'mt5_bridge'].includes(name);
}

function ProviderCard({ p, historical, forexDisabled }: { p: Partial<ProviderStatus>; historical: boolean; forexDisabled: boolean }) {
  const label = providerLabel(p);
  const market = typeof p.market_type === 'string' && p.market_type ? p.market_type : 'unknown';
  const dsl = typeof p.data_source_label === 'string' ? p.data_source_label : '';
  const status = typeof p.status === 'string' ? p.status : 'unknown';
  const error = typeof p.error_message === 'string' ? p.error_message : '';
  const historicalForexWarning = historical && isForexProviderRow(p) && error;

  return (
    <div className={`border rounded-xl overflow-hidden ${historical ? 'bg-zinc-950 border-zinc-800/50 opacity-75' : 'bg-zinc-900 border-zinc-800'}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Database size={16} className={historical ? 'text-zinc-700' : 'text-zinc-500'} />
          <div>
            <div className="font-medium capitalize flex items-center gap-2 flex-wrap">
              {label}
              {historical && <Badge variant="gray">Historical provider row</Badge>}
              {!historical && dsl === 'REAL DATA' && <Badge variant="green">REAL DATA</Badge>}
              {!historical && (dsl === 'DISABLED_FOR_MVP' || dsl === 'DISABLED') && <Badge variant="blue">Disabled</Badge>}
              {!historical && dsl === 'PROVIDER_ERROR' && !forexDisabled && <Badge variant="red">Provider error</Badge>}
            </div>
            <div className="text-xs text-zinc-500 capitalize">{market}</div>
          </div>
        </div>
        {statusBadge(status)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-zinc-800">
        {[
          { label: 'Status', value: status },
          { label: 'Last Success', value: safeDate(p.last_success_at) },
          { label: 'Last Error', value: safeDate(p.last_error_at) },
        ].map(item => (
          <div key={item.label} className={`px-4 py-3 ${historical ? 'bg-zinc-950' : 'bg-zinc-900'}`}>
            <div className="text-xs text-zinc-500 mb-0.5">{item.label}</div>
            <div className="text-xs text-zinc-400">{item.value}</div>
          </div>
        ))}
      </div>
      {error && (
        <div className={`px-5 py-3 border-t ${historicalForexWarning || forexDisabled ? 'border-zinc-800/50 bg-zinc-950' : 'bg-yellow-500/5 border-yellow-500/10'}`}>
          <div className={`text-xs ${historicalForexWarning || forexDisabled ? 'text-zinc-500' : 'text-yellow-400'}`}>
            {historicalForexWarning ? 'Historical forex warning. ' : ''}{error}
          </div>
        </div>
      )}
    </div>
  );
}

function Requirement({ label, ok, expected }: { label: string; ok: boolean; expected?: string }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
      <div className="text-zinc-500 mb-0.5">{label}</div>
      <div className={`font-mono font-semibold ${ok ? 'text-emerald-400' : 'text-yellow-400'}`}>{expected ?? String(ok)}</div>
    </div>
  );
}

export default function ProviderHealth() {
  const { session } = useAuth();
  const { state: liveState, refresh: refreshLiveState } = useAdminLiveState(session);
  const [providers, setProviders] = useState<Partial<ProviderStatus>[]>([]);
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [cfg, setCfg] = useState<ScannerConfigSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [runtimeConfigError, setRuntimeConfigError] = useState('');
  const [loadWarning, setLoadWarning] = useState('');
  const [testingBinance, setTestingBinance] = useState(false);
  const [binanceResult, setBinanceResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [adminSchedulerStatus, setAdminSchedulerStatus] = useState<EdgeFunctionReachability>('unknown');
  const [edgeFunctions, setEdgeFunctions] = useState<Record<string, string>>({});
  const [showHistoricalRows, setShowHistoricalRows] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadWarning('');
    try {
      const [p, s, cfgRes] = await Promise.all([
        supabase.from('provider_status').select('*'),
        supabase.from('symbols').select('*').order('market_type').order('symbol'),
        supabase.from('scanner_config').select('auto_send_telegram,schedule_enabled,cron_job_active').eq('id', 1).maybeSingle(),
      ]);
      if (p.error || s.error || cfgRes.error) {
        setLoadWarning(p.error?.message ?? s.error?.message ?? cfgRes.error?.message ?? 'Provider Health loaded with warnings.');
      }
      setProviders(Array.isArray(p.data) ? p.data : []);
      setSymbols(Array.isArray(s.data) ? (s.data as SymbolRow[]) : []);
      setCfg((cfgRes.data ?? null) as ScannerConfigSummary | null);
    } catch (e) {
      setLoadWarning(e instanceof Error ? e.message : 'Provider status query failed.');
      setProviders([]);
      setSymbols([]);
    }

    let runtimeAvailable = false;
    try {
      const res = await fetch(`${getFrontendSupabaseUrl()}/functions/v1/market-scanner`, {
        method: 'POST',
        headers: {
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ debug_provider_config: true }),
      });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error('Runtime config response was not JSON');
      }
      if (res.ok && json?.success) {
        runtimeAvailable = true;
        setRuntimeConfig(json as RuntimeConfig);
        setRuntimeConfigError('');
      } else {
        setRuntimeConfig(null);
        setRuntimeConfigError(json?.error ? String(json.error) : 'Runtime config unavailable — scanner may still be running.');
      }
    } catch (e) {
      setRuntimeConfig(null);
      setRuntimeConfigError(`Runtime config unavailable — scanner may still be running. ${e instanceof Error ? e.message : ''}`.trim());
    }

    try {
      const adminStatus = await callEdgeFunction<{ edgeFunctions?: Record<string, { state?: string }> }>('admin-scheduler-action', { action: 'status' }, session?.access_token);
      setAdminSchedulerStatus(adminStatus.reachability);
      const ef = adminStatus.data?.edgeFunctions ?? {};
      setEdgeFunctions({
        market_scanner: ef.market_scanner?.state ?? (runtimeAvailable ? 'deployed' : 'unknown'),
        scheduled_market_scanner: ef.scheduled_market_scanner?.state ?? 'unknown',
        evaluate_signal_outcomes: ef.evaluate_signal_outcomes?.state ?? 'unknown',
        admin_scheduler_action: adminStatus.reachability === 'missing' ? 'missing' : adminStatus.reachability === 'deployed' ? 'deployed' : adminStatus.reachability,
      });
    } catch {
      setAdminSchedulerStatus('unreachable');
      setEdgeFunctions(prev => ({ ...prev, admin_scheduler_action: 'unknown' }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { void load(); }, 45_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function testBinance() {
    setTestingBinance(true);
    setBinanceResult(null);
    try {
      const r = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=2');
      if (!r.ok) {
        setBinanceResult({ ok: false, msg: `Binance returned HTTP ${r.status}` });
        return;
      }
      const data = await r.json() as unknown;
      if (!Array.isArray(data) || !Array.isArray(data[data.length - 1])) {
        setBinanceResult({ ok: false, msg: 'Binance returned an unexpected payload.' });
        return;
      }
      const last = data[data.length - 1] as unknown[];
      const ts = new Date(Number(last[0])).toLocaleString();
      setBinanceResult({ ok: true, msg: `Binance OK. Latest BTCUSDT 15m candle: ${ts} — Close: ${parseFloat(String(last[4])).toLocaleString()}` });
    } catch (e) {
      setBinanceResult({ ok: false, msg: `Binance unreachable: ${e instanceof Error ? e.message : 'unknown'}` });
    } finally {
      setTestingBinance(false);
    }
  }

  const forexDisabled = runtimeConfig?.signal_enable_forex === false || runtimeConfig?.forex_disabled !== false;
  const marketMode = runtimeConfig?.market_mode ?? 'crypto_only';
  const cryptoProviderName = runtimeConfig?.crypto_provider ?? 'binance';
  const cryptoProviderRow = providers.find(p => safeLower(p.provider_name) === 'binance');
  const cryptoActive = safeLower(cryptoProviderRow?.status) === 'active' || Boolean(cryptoProviderRow?.last_success_at);
  const latestScheduledAge = liveState.lastScheduledRunAgeMinutes;
  const cronDetected = liveState.cronProven;
  const schedulerLabel = liveState.schedulerProof.label;
  const telegramConfigured = Boolean(runtimeConfig?.telegram_enabled && runtimeConfig.enable_signal_mode_output && runtimeConfig.telegram_bot_token_set && (runtimeConfig.telegram_default_channel_id_set || runtimeConfig.telegram_chat_id_set) && cfg?.auto_send_telegram !== false);
  const currentRuntimeProviders = providers.filter(p => !isForexProviderRow(p) || ['forex', 'finnhub'].includes(safeLower(p.provider_name)) || ['DISABLED_FOR_MVP', 'DISABLED', 'REAL DATA', 'PROVIDER_ERROR'].includes(String(p.data_source_label ?? '')));
  const historicalProviderRows = providers.filter(p => isForexProviderRow(p) && !['forex', 'finnhub'].includes(safeLower(p.provider_name)) && !['DISABLED_FOR_MVP', 'DISABLED', 'REAL DATA', 'PROVIDER_ERROR'].includes(String(p.data_source_label ?? '')));

  const requiredEnv = useMemo(() => [
    { label: 'SIGNAL_ENABLE_CRYPTO=true', ok: runtimeConfig?.signal_enable_crypto !== false, expected: String(runtimeConfig?.signal_enable_crypto ?? true) },
    { label: 'SIGNAL_ENABLE_FOREX optional', ok: true, expected: String(runtimeConfig?.signal_enable_forex ?? false) },
    { label: 'FINNHUB_API_KEY present when forex enabled', ok: runtimeConfig?.signal_enable_forex ? runtimeConfig?.finnhub_api_key_set === true : true, expected: runtimeConfig?.signal_enable_forex ? String(runtimeConfig?.finnhub_api_key_set ?? false) : 'only needed when forex enabled' },
    { label: 'CRYPTO_DATA_PROVIDER=binance', ok: cryptoProviderName === 'binance', expected: cryptoProviderName },
    { label: 'TELEGRAM_ENABLED=true', ok: runtimeConfig?.telegram_enabled === true, expected: String(runtimeConfig?.telegram_enabled ?? false) },
    { label: 'ENABLE_SIGNAL_MODE_OUTPUT=true', ok: runtimeConfig?.enable_signal_mode_output === true, expected: String(runtimeConfig?.enable_signal_mode_output ?? false) },
    { label: 'TELEGRAM_BOT_TOKEN present', ok: runtimeConfig?.telegram_bot_token_set === true },
    { label: 'TELEGRAM_DEFAULT_CHANNEL_ID/CHAT_ID present', ok: runtimeConfig?.telegram_default_channel_id_set === true || runtimeConfig?.telegram_chat_id_set === true },
    { label: 'SUPABASE_URL present', ok: runtimeConfig?.supabase_url_set === true },
    { label: 'SUPABASE_SERVICE_ROLE_KEY present', ok: runtimeConfig?.supabase_service_role_key_set === true },
    { label: 'SCANNER_CRON_SECRET present if used', ok: runtimeConfig?.scanner_cron_secret_set === true, expected: runtimeConfig?.scanner_cron_secret_set ? 'present' : 'only needed for cron-secret auth' },
  ], [cryptoProviderName, runtimeConfig]);

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Provider Health</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Current crypto/forex provider runtime truth plus historical provider rows</p>
        </div>
        <button onClick={async () => { await Promise.all([load(), refreshLiveState()]); }} disabled={refreshing || liveState.loading}
          className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50">
          <RefreshCw size={12} className={refreshing || liveState.loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {(loadWarning || runtimeConfigError) && (
        <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm px-4 py-3 rounded-xl flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            {loadWarning && <div>{loadWarning}</div>}
            {runtimeConfigError && <div>{runtimeConfigError}</div>}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Current Runtime Mode</div>
          <div className="text-lg font-semibold text-emerald-400">{marketMode === 'crypto_only' ? 'Crypto-only' : marketMode}</div>
          <div className="text-xs text-zinc-500 mt-1">Forex is separately gated and signal-only.</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Crypto Provider</div>
          <div className="text-lg font-semibold text-zinc-100 capitalize">{cryptoProviderName}</div>
          <div className={cryptoActive ? 'text-xs text-emerald-400 mt-1' : 'text-xs text-zinc-500 mt-1'}>Crypto Status: {cryptoActive ? 'Active' : 'Unknown'}</div>
        </div>
        <div className="bg-blue-500/8 border border-blue-500/15 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Forex</div>
          <div className="text-lg font-semibold text-blue-400">Disabled</div>
          <div className="text-xs text-zinc-500 mt-1">Future MT5/OANDA phase; old forex rows are historical.</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Telegram</div>
          <div className={telegramConfigured ? 'text-lg font-semibold text-emerald-400' : 'text-lg font-semibold text-yellow-400'}>{telegramConfigured ? 'Enabled/configured' : 'Missing config or disabled'}</div>
          <div className="text-xs text-zinc-500 mt-1">Requires env toggles, token/chat, and scanner_config auto-send.</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Schedule / Cron</div>
          <div className={cronDetected ? 'text-lg font-semibold text-emerald-400' : liveState.cronStale ? 'text-lg font-semibold text-yellow-400' : cfg?.cron_job_active ? 'text-lg font-semibold text-blue-400' : 'text-lg font-semibold text-zinc-500'}>{schedulerLabel}</div>
          <div className="text-xs text-zinc-500 mt-1">Schedule: {cfg?.schedule_enabled ? 'ON' : 'OFF'} · Flag: {cfg?.cron_job_active ? 'ON' : 'OFF'}{latestScheduledAge !== null ? ` · latest automatic scheduled scanner_run ${latestScheduledAge}m ago` : ' · no automatic scheduled scanner_run proof'}</div>
          <div className="text-xs text-zinc-600 mt-1">{liveState.cronReason}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Edge Function unknown status does not override scanner_runs proof.</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:col-span-2 lg:col-span-1">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Edge Functions</div>
          <div className="grid grid-cols-1 gap-1 text-xs">
            {[
              ['market-scanner', edgeFunctions.market_scanner ?? (runtimeConfig ? 'deployed' : 'unknown')],
              ['scheduled-market-scanner', edgeFunctions.scheduled_market_scanner ?? 'unknown'],
              ['evaluate-signal-outcomes', edgeFunctions.evaluate_signal_outcomes ?? 'unknown'],
              ['admin-scheduler-action', edgeFunctions.admin_scheduler_action ?? adminSchedulerStatus],
            ].map(([name, state]) => (
              <div key={name} className="flex items-center justify-between gap-3 min-w-0">
                <span className="text-zinc-500 truncate">{name}</span>
                <span className={state === 'deployed' ? 'text-emerald-400' : state === 'missing' ? 'text-red-400' : 'text-zinc-400'}>{state === 'unknown' ? 'not verified from UI' : state}</span>
              </div>
            ))}
          </div>
          {(edgeFunctions.admin_scheduler_action === 'missing' || adminSchedulerStatus === 'missing') && (
            <div className="mt-2 text-xs text-yellow-300 break-words">{ADMIN_SCHEDULER_MISSING_MESSAGE} {ADMIN_SCHEDULER_DEPLOY_INSTRUCTIONS}</div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-sm font-semibold mb-1 flex items-center gap-2"><Wifi size={14} className="text-blue-400" /> Test Binance Connection</div>
          <p className="text-xs text-zinc-500 mb-3">Fetches 2 BTCUSDT 15m candles directly from Binance public API.</p>
          <button onClick={testBinance} disabled={testingBinance}
            className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {testingBinance ? <RefreshCw size={13} className="animate-spin" /> : <Wifi size={13} />}
            Test Binance
          </button>
          {binanceResult && <div className={`mt-3 px-3 py-2.5 rounded-lg text-xs border ${binanceResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>{binanceResult.msg}</div>}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-sm font-semibold mb-1 flex items-center gap-2"><Info size={14} className="text-blue-400" /> Forex Provider</div>
          <p className="text-xs text-zinc-500 mb-3">C2 forex uses Finnhub only, real-data signal mode only. No demo fallback or broker execution is used.</p>
          <Badge variant="blue">Finnhub only — signal mode</Badge>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
        <button
          onClick={() => setShowRequirements(v => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <CheckCircle size={14} className="text-blue-400" /> Runtime Requirements
          </div>
          {showRequirements ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
        </button>
        {showRequirements && (
          <div className="border-t border-zinc-800 p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {requiredEnv.map(item => <Requirement key={item.label} label={item.label} ok={item.ok} expected={item.expected} />)}
            </div>
            <div className="mt-3 text-xs text-zinc-500 leading-relaxed">
              Ignored while <code className="bg-zinc-800 px-1 rounded">SIGNAL_ENABLE_FOREX=false</code>: FOREX_DATA_PROVIDER, FOREX_PROVIDER_FALLBACKS, FOREX_DEMO_FALLBACK, FINNHUB_API_KEY, TWELVEDATA_API_KEY, FOREX_DATA_API_KEY, MT5_BRIDGE_BASE_URL, MT5_BRIDGE_SECRET. Do not delete forex secrets if you plan to restore forex later.
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-4 mb-8">
          {providers.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center text-sm text-zinc-600">No historical provider rows yet.</div>
          ) : (
            <>
              <div className="text-xs text-zinc-500 uppercase tracking-widest">Current crypto-only runtime rows</div>
              {(currentRuntimeProviders.length ? currentRuntimeProviders : providers.filter(p => !isForexProviderRow(p))).map((p, i) => <ProviderCard key={String(p.id ?? i)} p={p} historical={false} forexDisabled={forexDisabled} />)}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                <button onClick={() => setShowHistoricalRows(v => !v)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
                  <span className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Historical forex/provider rows ({historicalProviderRows.length})</span>
                  {showHistoricalRows ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                </button>
                {showHistoricalRows && (
                  <div className="border-t border-zinc-800 p-3 space-y-3">
                    {historicalProviderRows.length === 0 ? (
                      <div className="bg-zinc-950 border border-zinc-800/50 rounded-xl p-4 text-xs text-zinc-600">No historical forex/provider rows yet.</div>
                    ) : historicalProviderRows.map((p, i) => <ProviderCard key={String(p.id ?? `hist-${i}`)} p={p} historical forexDisabled={forexDisabled} />)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Configured Symbols</div>
          <div className="text-xs text-zinc-500">Crypto plus C2 forex symbols; forex requires separate enablement</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-5 py-2.5">Symbol</th>
                <th className="text-left px-5 py-2.5">Display Name</th>
                <th className="text-left px-5 py-2.5">Market</th>
                <th className="text-left px-5 py-2.5">Provider</th>
                <th className="text-left px-5 py-2.5">Expected Data Source</th>
                <th className="text-left px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {symbols.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-zinc-600">No symbols configured yet.</td></tr>
              ) : symbols.map(s => (
                <tr key={s.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-5 py-2.5 font-mono font-semibold text-zinc-100">{s.symbol}</td>
                  <td className="px-5 py-2.5 text-zinc-400">{s.display_name}</td>
                  <td className="px-5 py-2.5"><Badge variant={s.market_type === 'crypto' ? 'blue' : 'cyan'}>{s.market_type}</Badge></td>
                  <td className="px-5 py-2.5 text-zinc-400 capitalize">{s.market_type === 'crypto' ? 'binance' : 'finnhub'}</td>
                  <td className="px-5 py-2.5">{s.market_type === 'crypto' ? <span className="text-xs text-emerald-400">REAL DATA (Binance API)</span> : <span className="text-xs text-cyan-400">REAL DATA only when forex enabled</span>}</td>
                  <td className="px-5 py-2.5"><Badge variant={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'Active' : 'Inactive'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
