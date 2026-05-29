import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { StatCard } from '../../components/ui/StatCard';
import { statusBadge, Badge } from '../../components/ui/Badge';
import { ScannerRun } from '../../lib/types';
import { useAdminLiveState } from '../../hooks/useAdminLiveState';
import {
  Activity, Play, Database, AlertTriangle, Radio, BarChart2,
  Zap, Clock, Settings, StopCircle, Send, Users, CheckCircle,
  Wifi, RefreshCw, CalendarClock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function ControlRoom() {
  const { session } = useAuth();
  const { state, refresh } = useAdminLiveState(session);

  const [stats, setStats] = useState({ symbols: 0, candles: 0, signals: 0, candidates: 0, users: 0 });
  const [scanning, setScanning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testingProvider, setTestingProvider] = useState('');
  const [testingTg, setTestingTg] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [scanIsDemo, setScanIsDemo] = useState<boolean | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [runFilter, setRunFilter] = useState<'all' | 'manual' | 'scheduled'>('all');
  const [showHistoricalForexWarnings, setShowHistoricalForexWarnings] = useState(false);

  const loadStats = useCallback(async () => {
    const [symRes, candRes, sigRes, candCountRes, userRes] = await Promise.all([
      supabase.from('symbols').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('candles').select('id', { count: 'exact', head: true }),
      supabase.from('signals').select('id', { count: 'exact', head: true }).in('status', ['new', 'approved', 'waiting', 'active', 'tp1_hit']),
      supabase.from('strategy_candidates').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    setStats({
      symbols: symRes.count ?? 0,
      candles: candRes.count ?? 0,
      signals: sigRes.count ?? 0,
      candidates: candCountRes.count ?? 0,
      users: userRes.count ?? 0,
    });
  }, []);

  useEffect(() => {
    refresh();
    loadStats();
  }, [refresh, loadStats]);

  async function runScanner() {
    if (!session) return;
    setScanning(true);
    setScanMsg('');
    setScanIsDemo(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-scanner`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setScanIsDemo(data.demo_mode ?? false);
        const dur = data.duration_ms ? ` (${(data.duration_ms / 1000).toFixed(1)}s)` : '';
        const paperStr = data.paper_intents_created ? `, Paper: ${data.paper_intents_created}` : '';
        const tgStr = `, TG sent/skipped/failed: ${data.telegram_sent ?? 0}/${data.telegram_skipped ?? 0}/${data.telegram_failed ?? 0}`;
        setScanMsg(`Scan complete${dur}. Symbols: ${data.symbols_scanned}, Candles: ${data.candles_fetched}, Signals: ${data.signals_created}${paperStr}${tgStr}${data.errors?.length ? ` — ${data.errors.length} warning(s)` : ''}`);
      } else {
        setScanMsg(`Error: ${data.error}`);
      }
      await refresh();
      await loadStats();
    } catch (e) {
      setScanMsg(`Network error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    setScanning(false);
  }

  async function toggleScanner(enable: boolean) {
    setToggling(true);
    setActionMsg('');
    const { error } = await supabase.from('scanner_config').update({ is_enabled: enable }).eq('id', 1);
    if (!error) {
      await supabase.from('audit_logs').insert({
        actor_user_id: session?.user.id ?? null,
        action: enable ? 'scanner_enabled' : 'scanner_disabled',
        entity_type: 'scanner_config',
        entity_id: '1',
        metadata: {},
      });
      setActionMsg(enable ? 'Scanner enabled.' : 'Scanner disabled.');
      await refresh();
    } else {
      setActionMsg(`Error: ${error.message}`);
    }
    setToggling(false);
  }

  async function testBinance() {
    setTestingProvider('binance');
    setActionMsg('');
    try {
      const r = await fetch('https://api.binance.com/api/v3/ping');
      if (r.ok) setActionMsg('Binance API reachable. Status: OK');
      else setActionMsg(`Binance returned status ${r.status}`);
    } catch {
      setActionMsg('Binance API unreachable.');
    }
    setTestingProvider('');
  }

  async function testForex() {
    if (!session) return;
    setTestingProvider('forex');
    setActionMsg('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-scanner`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ debug_provider_config: true }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMsg(`Forex provider: ${data.provider} | Fallbacks: ${data.fallbacks?.join(', ') || 'none'} | Demo fallback: ${data.demo_fallback} | Finnhub key: ${data.finnhub_api_key_set}`);
      } else {
        setActionMsg(`Forex config error: ${data.error}`);
      }
    } catch (e) {
      setActionMsg(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    setTestingProvider('');
  }

  async function sendTelegramTest() {
    if (!session) return;
    setTestingTg(true);
    setActionMsg('');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ send: true }),
      });
      const data = await res.json();
      if (data.success) setActionMsg('Telegram test message sent successfully.');
      else setActionMsg(`Telegram error: ${data.error}`);
    } catch (e) {
      setActionMsg(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    setTestingTg(false);
  }

  const { latestRun, latestManualRun, latestScheduledRun, recentRuns, providers, runtimeConfig } = state;
  const cryptoProvider = providers.find(p => p.market_type === 'crypto' || p.provider_name === 'binance');
  const forexProvider = providers.find(p => p.market_type === 'forex');
  const liveForexProvider = runtimeConfig?.provider ?? forexProvider?.provider_name ?? 'unknown';
  const cryptoProviderName = runtimeConfig?.crypto_provider ?? cryptoProvider?.provider_name ?? 'binance';
  const isForexReal = state.signalEnableForex && runtimeConfig?.provider !== 'demo' && runtimeConfig?.provider !== 'off' && runtimeConfig?.finnhub_api_key_set === true;
  const autoTgReady = state.autoSendTelegram && Boolean(runtimeConfig?.telegram_enabled && runtimeConfig?.enable_signal_mode_output && runtimeConfig?.telegram_bot_token_set && (runtimeConfig?.telegram_default_channel_id_set || runtimeConfig?.telegram_chat_id_set));
  const filteredRecentRuns = recentRuns.filter(r => runFilter === 'all' || (r.run_type ?? 'manual') === runFilter);
  const historicalForexWarningRuns = recentRuns.filter(r => /forex|finnhub|twelvedata|oanda|mt5|demo/i.test(r.error_message ?? ''));
  const currentRunWarning = latestRun?.error_message && !/forex|finnhub|twelvedata|oanda|mt5|demo/i.test(latestRun.error_message) ? latestRun.error_message : '';
  const adminActionMissing = state.adminSchedulerActionStatus === 'missing';

  const heartbeatColor =
    state.heartbeatStatus === 'healthy' ? 'text-emerald-400'
    : state.heartbeatStatus === 'stale' ? 'text-yellow-400'
    : state.heartbeatStatus === 'error' ? 'text-red-400'
    : 'text-zinc-500';

  const cronColor = state.cronProven
    ? 'text-emerald-400'
    : state.cronStale
      ? 'text-yellow-400'
      : state.cronConfigured
        ? 'text-blue-400'
        : 'text-zinc-500';

  function shortTimestamp(value: string | null | undefined): string {
    return value ? new Date(value).toLocaleString() : '—';
  }

  function durationStr(run: ScannerRun): string {
    if (!run.finished_at) return '—';
    return `${((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)}s`;
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Operator Control Room</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Signal Mode MVP — scanner, providers, Telegram, subscribers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
          <button onClick={async () => { await refresh(); await loadStats(); }} disabled={state.loading}
            className="inline-flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={state.loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link to="/admin/checklist"
            className="inline-flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors">
            <CheckCircle size={13} /> MVP Checklist
          </Link>
          <Link to="/admin/scanner-config"
            className="inline-flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors">
            <Settings size={13} /> Config
          </Link>
        </div>
      </div>

      {/* Live state banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 flex flex-wrap gap-x-5 gap-y-2 items-center">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${state.scannerEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-sm font-semibold">Signal Mode MVP</span>
        </div>
        <BannerItem label="Scanner" value={state.scannerEnabled ? 'Enabled' : 'Disabled'} color={state.scannerEnabled ? 'text-emerald-400' : 'text-zinc-500'} />
        <BannerItem label="Market Mode" value={state.marketMode === 'crypto_only' ? 'Crypto-only' : state.marketMode} color={state.marketMode === 'crypto_only' ? 'text-emerald-400' : 'text-yellow-400'} />
        <BannerItem label="Crypto" value={state.signalEnableCrypto ? 'Enabled' : 'Disabled'} color={state.signalEnableCrypto ? 'text-emerald-400' : 'text-zinc-500'} />
        <BannerItem label="Forex" value={state.signalEnableForex ? 'Enabled' : 'Disabled for MVP'} color={state.signalEnableForex ? 'text-emerald-400' : 'text-blue-400'} />
        <BannerItem label="Heartbeat" value={state.heartbeatStatus.charAt(0).toUpperCase() + state.heartbeatStatus.slice(1)} color={heartbeatColor} />
        <BannerItem
          label="Schedule"
          value={state.scheduleEnabled ? `ON (${state.scanIntervalMinutes}m)` : 'OFF'}
          color={state.scheduleEnabled ? 'text-emerald-400' : 'text-zinc-500'}
        />
        <BannerItem
          label="Cron job"
          value={state.cronProven ? 'Proven / Active' : state.cronStatusLabel}
          color={cronColor}
          title={state.cronReason}
        />
        <BannerItem
          label="Crypto provider"
          value={cryptoProviderName}
          color="text-emerald-400"
        />
        <BannerItem
          label="Auto TG"
          value={autoTgReady ? 'ON' : state.autoSendTelegram ? 'ON (missing env proof)' : 'OFF'}
          color={autoTgReady ? 'text-emerald-400' : state.autoSendTelegram ? 'text-yellow-400' : 'text-zinc-500'}
        />
        <BannerItem
          label="Latest run"
          value={latestRun ? (latestRun.run_type === 'scheduled' ? 'scheduled (latest)' : latestRun.run_type) : '—'}
          color={latestRun?.run_type === 'scheduled' ? 'text-emerald-400' : latestRun ? 'text-blue-400' : 'text-zinc-500'}
        />
        <BannerItem label="Latest manual" value={shortTimestamp(latestManualRun?.started_at)} color={latestManualRun ? 'text-blue-400' : 'text-zinc-500'} />
        <BannerItem label="Latest scheduled" value={shortTimestamp(latestScheduledRun?.started_at)} color={latestScheduledRun ? 'text-emerald-400' : 'text-zinc-500'} />
        <BannerItem label="Outcome tracking" value={state.outcomeTrackingStatus} color={state.outcomeTrackingStatus.startsWith('Active (automatic)') ? 'text-emerald-400' : state.outcomeTrackingStatus.startsWith('Active') ? 'text-yellow-400' : 'text-zinc-500'} />
      </div>

      {!state.cronProven && state.scheduleEnabled && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-xs border flex items-center gap-2 ${state.cronConfigured ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'}`}>
          <AlertTriangle size={13} className="shrink-0" />
          {state.cronReason}
          <Link to="/admin/scheduler" className="ml-auto underline shrink-0">Setup guide</Link>
        </div>
      )}

      {adminActionMissing && (
        <div className="mb-4 px-4 py-3 rounded-lg text-xs border flex items-start gap-2 bg-yellow-500/10 border-yellow-500/20 text-yellow-200 break-words">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Admin scheduler action function is not deployed yet.</div>
            <div>Deploy supabase/functions/admin-scheduler-action/index.ts in Supabase Edge Functions, then test again. This is a deployment status, not a cron failure.</div>
          </div>
        </div>
      )}

      {currentRunWarning && (
        <div className="mb-4 px-4 py-3 rounded-lg text-xs border flex items-start gap-2 bg-yellow-500/10 border-yellow-500/20 text-yellow-300 break-words">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>{currentRunWarning}</span>
        </div>
      )}

      {historicalForexWarningRuns.length > 0 && (
        <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
          <button onClick={() => setShowHistoricalForexWarnings(v => !v)} className="w-full px-4 py-3 text-left text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-between">
            <span>Historical forex warnings ignored while crypto-only MVP is active ({historicalForexWarningRuns.length})</span>
            <span>{showHistoricalForexWarnings ? 'Hide' : 'Show'}</span>
          </button>
          {showHistoricalForexWarnings && (
            <div className="border-t border-zinc-800 p-4 space-y-2 text-xs text-zinc-500 break-words">
              {historicalForexWarningRuns.slice(0, 5).map(r => <div key={r.id}>{new Date(r.started_at).toLocaleString()} — {r.error_message}</div>)}
            </div>
          )}
        </div>
      )}

      {scanMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border flex items-start gap-2 ${
          scanMsg.startsWith('Error') || scanMsg.startsWith('Network')
            ? 'bg-red-500/10 border-red-500/20 text-red-400'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
        }`}>
          <span className="flex-1">{scanMsg}</span>
          {scanIsDemo !== null && (
            <Badge variant={scanIsDemo ? 'orange' : 'green'} className="shrink-0 mt-0.5">
              {scanIsDemo ? 'DEMO MODE' : 'REAL DATA'}
            </Badge>
          )}
        </div>
      )}
      {actionMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          actionMsg.startsWith('Error') ? 'bg-red-500/10 border-red-500/20 text-red-400'
          : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
        }`}>
          {actionMsg}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Active Symbols" value={stats.symbols} icon={<Radio size={16} />} color="blue" />
        <StatCard label="Candles Stored" value={stats.candles.toLocaleString()} icon={<Database size={16} />} color="cyan" />
        <StatCard label="Active Signals" value={stats.signals} icon={<Zap size={16} />} color="green" />
        <StatCard label="Total Candidates" value={stats.candidates.toLocaleString()} icon={<BarChart2 size={16} />} color="yellow" />
        <StatCard label="Registered Users" value={stats.users} icon={<Users size={16} />} color="blue" />
      </div>

      {/* Real signal counts */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{state.latestApprovedRealSignalCount}</div>
          <div className="text-xs text-zinc-500 mt-1">Active Real Data Signals</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{state.latestRealCryptoSignalCount}</div>
          <div className="text-xs text-zinc-500 mt-1">Active Real Crypto</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold ${state.signalEnableForex ? 'text-cyan-400' : 'text-blue-400'}`}>{state.signalEnableForex ? state.latestRealForexSignalCount : 'OFF'}</div>
          <div className="text-xs text-zinc-500 mt-1">{state.signalEnableForex ? 'Active Real Forex' : 'Forex Disabled for MVP'}</div>
        </div>
      </div>

      {/* Scheduler proof */}
      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Cron proof</div>
          <div className={`text-sm font-semibold ${cronColor}`}>{state.cronStatusLabel}</div>
          <div className="text-xs text-zinc-600 mt-1">{state.cronReason}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Last manual run</div>
          <div className="text-sm text-zinc-200">{shortTimestamp(latestManualRun?.started_at)}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Last scheduled run</div>
          <div className={`text-sm ${latestScheduledRun ? 'text-zinc-200' : 'text-zinc-600'}`}>{shortTimestamp(latestScheduledRun?.started_at)}</div>
          {state.lastScheduledRunAgeMinutes !== null && <div className="text-xs text-zinc-600 mt-1">Age: {state.lastScheduledRunAgeMinutes}m</div>}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:col-span-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Outcome tracking proof</div>
          <div className={`text-sm font-semibold ${state.outcomeTrackingStatus.startsWith('Active (automatic)') ? 'text-emerald-400' : state.outcomeTrackingStatus.startsWith('Active') ? 'text-yellow-400' : 'text-zinc-500'}`}>{state.outcomeTrackingStatus}</div>
          <div className="text-xs text-zinc-600 mt-1">Automatic: {shortTimestamp(state.latestAutomaticOutcomeUpdate?.created_at)} · Manual: {shortTimestamp(state.latestManualOutcomeUpdate?.created_at)} · Latest outcome TG: {state.latestOutcomeDelivery ? `${state.latestOutcomeDelivery.status} (${shortTimestamp(state.latestOutcomeDelivery.created_at)})` : '—'}</div>
        </div>
      </div>

      {/* Primary action panels */}
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Scanner Control</div>
          <div className="flex flex-col gap-2">
            <button
              onClick={runScanner}
              disabled={scanning}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              {scanning
                ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Scanning...</>
                : <><Play size={14} /> Run One Scan Now</>}
            </button>
            {state.scannerEnabled ? (
              <button
                onClick={() => toggleScanner(false)}
                disabled={toggling}
                className="flex items-center justify-center gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                <StopCircle size={14} /> Stop Scanner
              </button>
            ) : (
              <button
                onClick={() => toggleScanner(true)}
                disabled={toggling}
                className="flex items-center justify-center gap-2 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                <Play size={14} /> Start Scanner
              </button>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Provider Tests</div>
          <div className="flex flex-col gap-2">
            <button
              onClick={testBinance}
              disabled={testingProvider === 'binance'}
              className="flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
              {testingProvider === 'binance' ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
              Test Binance
            </button>
            <button
              onClick={testForex}
              disabled={testingProvider === 'forex'}
              className="flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
              {testingProvider === 'forex' ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
Runtime Config
            </button>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Telegram</div>
          <div className="flex flex-col gap-2">
            <button
              onClick={sendTelegramTest}
              disabled={testingTg}
              className="flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50">
              {testingTg ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              Send Test Message
            </button>
            <Link to="/admin/telegram-test"
              className="flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-4 py-2.5 rounded-lg text-sm transition-colors">
              <Settings size={14} /> Telegram Verification
            </Link>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { to: '/admin/scanner-config', icon: Settings, label: 'Scanner Config', sub: 'Timeframes, grade, intervals' },
          { to: '/admin/signals', icon: Radio, label: 'Signals Manager', sub: 'Pipeline + Telegram send' },
          { to: '/admin/outcomes', icon: Activity, label: 'Outcome Tracking', sub: 'TP/SL live evaluation' },
          { to: '/admin/providers', icon: Database, label: 'Provider Health', sub: 'Live runtime config' },
        ].map(({ to, icon: Icon, label, sub }) => (
          <Link key={to} to={to}
            className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex flex-col gap-1.5 transition-colors group">
            <Icon size={16} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-zinc-600">{sub}</span>
          </Link>
        ))}
      </div>

      {/* Provider + runtime config */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2"><Database size={14} className="text-zinc-500" /> Provider Status</div>
            <Link to="/admin/providers" className="text-xs text-zinc-500 hover:text-zinc-300">Full details</Link>
          </div>
          {/* Runtime config row */}
          {runtimeConfig && (
            <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-800/30">
              <div className="text-xs text-zinc-500 mb-1 font-medium">Live Runtime Config</div>
              <div className="flex flex-wrap gap-3 text-xs">
                <span>Market: <span className="font-mono font-medium text-emerald-400">{runtimeConfig.market_mode ?? 'crypto_only'}</span></span>
                <span>Crypto: <span className="font-mono text-emerald-400">{runtimeConfig.crypto_provider ?? 'binance'}</span></span>
                <span>Forex: <span className="font-mono text-blue-400">disabled for MVP</span></span>
                <span>TG config: <span className={`font-mono ${autoTgReady ? 'text-emerald-400' : 'text-yellow-400'}`}>{autoTgReady ? 'ready' : 'check env/config'}</span></span>
              </div>
            </div>
          )}
          <div className="divide-y divide-zinc-800">
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm">Binance</span>
                <span className="text-xs text-zinc-600 ml-2">Crypto — real data</span>
              </div>
              <div className="flex items-center gap-2">
                {cryptoProvider ? statusBadge(cryptoProvider.status) : statusBadge('unknown')}
                {cryptoProvider?.last_success_at && <span className="text-xs text-zinc-600">{new Date(cryptoProvider.last_success_at).toLocaleTimeString()}</span>}
              </div>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm">Forex</span>
                <span className={`text-xs ml-2 ${isForexReal ? 'text-emerald-500/70' : state.signalEnableForex ? 'text-orange-500/70' : 'text-blue-500/70'}`}>
                  {state.signalEnableForex ? `${liveForexProvider} — ${isForexReal ? 'real data' : 'demo/not configured'}` : 'disabled for MVP'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {state.signalEnableForex ? (forexProvider ? statusBadge(forexProvider.status) : statusBadge('unknown')) : <Badge variant="cyan">DISABLED</Badge>}
                <Badge variant={state.signalEnableForex ? (isForexReal ? 'green' : 'orange') : 'cyan'}>{state.signalEnableForex ? (isForexReal ? 'REAL' : 'DEMO') : 'MVP'}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-zinc-500" /> Last Scanner Run</div>
            <Link to="/admin/scanner" className="text-xs text-zinc-500 hover:text-zinc-300">Full log</Link>
          </div>
          {latestRun ? (
            <div className="divide-y divide-zinc-800">
              {([
                { label: 'Status', value: statusBadge(latestRun.status) },
                { label: 'Run Type', value: <span className={`text-xs font-medium ${latestRun.run_type === 'scheduled' ? 'text-emerald-400' : 'text-blue-400'}`}>{latestRun.run_type}</span> },
                { label: 'Started', value: new Date(latestRun.started_at).toLocaleString() },
                { label: 'Duration', value: durationStr(latestRun) },
                { label: 'Symbols / Signals', value: `${latestRun.symbols_scanned} / ${latestRun.signals_created}` },
                { label: 'TG sent / skipped / failed', value: `${latestRun.telegram_sent_count ?? 0} / ${latestRun.telegram_blocked_count ?? 0} / ${latestRun.telegram_failed_count ?? 0}` },
                { label: 'Latest TG delivery', value: state.latestTelegramDelivery ? `${state.latestTelegramDelivery.status}${state.latestTelegramDelivery.error_message ? ` — ${state.latestTelegramDelivery.error_message}` : ''}` : '—' },
                { label: 'Latest outcome update', value: state.latestSignalUpdate ? `${state.latestSignalUpdate.new_status.replace(/_/g, ' ')} (${new Date(state.latestSignalUpdate.created_at).toLocaleString()})` : '—' },
                { label: 'Outcome TG delivery', value: state.latestOutcomeDelivery ? `${state.latestOutcomeDelivery.status}${state.latestOutcomeDelivery.error_message ? ` — ${state.latestOutcomeDelivery.error_message}` : ''}` : '—' },
              ] as { label: string; value: React.ReactNode }[]).map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-5 py-2">
                  <span className="text-xs text-zinc-500">{label}</span>
                  <span className="text-xs text-zinc-200">{value}</span>
                </div>
              ))}
              {latestRun.error_message && !/forex|finnhub|twelvedata|oanda|mt5|demo/i.test(latestRun.error_message) && (
                <div className="px-5 py-2.5">
                  <div className="text-xs text-yellow-400 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{latestRun.error_message}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <Clock size={24} className="text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-600">No scanner runs yet.</p>
              <p className="text-xs text-zinc-700 mt-1">Click "Run One Scan Now" above.</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent runs table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto">
            <div className="text-sm font-semibold shrink-0">Recent Scanner Runs</div>
            {(['all', 'manual', 'scheduled'] as const).map(filter => (
              <button key={filter} onClick={() => setRunFilter(filter)} className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium ${runFilter === filter ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>{filter}</button>
            ))}
          </div>
          <Link to="/admin/scheduler" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
            <Clock size={11} /> Scheduling guide
          </Link>
        </div>
        {state.loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredRecentRuns.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-600">No runs yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-5 py-2.5">Started</th>
                <th className="text-left px-5 py-2.5">Type</th>
                <th className="text-left px-5 py-2.5">Status</th>
                <th className="text-left px-5 py-2.5">Symbols</th>
                <th className="text-left px-5 py-2.5">Signals</th>
                <th className="text-left px-5 py-2.5">TG Sent / Skipped / Failed</th>
                <th className="text-left px-5 py-2.5">Duration</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecentRuns.map(r => (
                <tr key={r.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${r.run_type === 'scheduled' ? 'bg-emerald-500/[0.03]' : ''}` }>
                  <td className="px-5 py-2.5 text-zinc-400">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-5 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${r.run_type === 'scheduled' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>{r.run_type}</span>
                  </td>
                  <td className="px-5 py-2.5">{statusBadge(r.status)}</td>
                  <td className="px-5 py-2.5 text-zinc-300">{r.symbols_scanned}</td>
                  <td className="px-5 py-2.5 text-zinc-300">{r.signals_created}</td>
                  <td className="px-5 py-2.5 text-zinc-300">{r.telegram_sent_count ?? 0} / {r.telegram_blocked_count ?? 0} / {r.telegram_failed_count ?? 0}</td>
                  <td className="px-5 py-2.5 text-zinc-400">{durationStr(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}

function BannerItem({ label, value, color, title }: { label: string; value: string; color: string; title?: string }) {
  return (
    <div className="flex items-center gap-1.5" title={title}>
      <span className="text-xs text-zinc-500">{label}:</span>
      <span className={`text-xs font-medium ${color}`}>{value}</span>
    </div>
  );
}
