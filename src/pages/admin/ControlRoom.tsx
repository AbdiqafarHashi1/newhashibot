import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { StatCard } from '../../components/ui/StatCard';
import { statusBadge, Badge } from '../../components/ui/Badge';
import { ScannerRun, ProviderStatus, ModeConfig } from '../../lib/types';
import {
  Activity, Play, Database, AlertTriangle, Radio, BarChart2,
  Zap, Clock, Settings, StopCircle, Send, Users, CheckCircle,
  Wifi, RefreshCw, Layers
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function ControlRoom() {
  const { session } = useAuth();
  const [runs, setRuns] = useState<ScannerRun[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [scannerConfig, setScannerConfig] = useState<{
    is_enabled: boolean;
    demo_mode_enabled: boolean;
    active_timeframes: string[];
    min_signal_grade: string;
    heartbeat_status: string | null;
    schedule_enabled: boolean;
    scan_interval_minutes: number;
    last_scheduled_scan_at: string | null;
    cron_job_active: boolean;
    cron_job_name: string | null;
  } | null>(null);
  const [modes, setModes] = useState<ModeConfig[]>([]);
  const [paperCount, setPaperCount] = useState(0);
  const [riskBlockedCount, setRiskBlockedCount] = useState(0);
  const [stats, setStats] = useState({ symbols: 0, candles: 0, signals: 0, candidates: 0, users: 0 });
  const [scanning, setScanning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testingProvider, setTestingProvider] = useState('');
  const [testingTg, setTestingTg] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [scanIsDemo, setScanIsDemo] = useState<boolean | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [runsRes, provRes, symRes, candRes, sigRes, candCountRes, cfgRes, userRes, modesRes, paperRes, riskRes] = await Promise.all([
      supabase.from('scanner_runs').select('*').order('started_at', { ascending: false }).limit(5),
      supabase.from('provider_status').select('*'),
      supabase.from('symbols').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('candles').select('id', { count: 'exact' }),
      supabase.from('signals').select('id', { count: 'exact' }).in('status', ['waiting', 'active']),
      supabase.from('strategy_candidates').select('id', { count: 'exact' }),
      supabase.from('scanner_config').select('is_enabled,demo_mode_enabled,active_timeframes,min_signal_grade,heartbeat_status,schedule_enabled,scan_interval_minutes,last_scheduled_scan_at,cron_job_active,cron_job_name').eq('id', 1).maybeSingle(),
      supabase.from('profiles').select('id', { count: 'exact' }),
      supabase.from('mode_configs').select('*').order('slug'),
      supabase.from('paper_execution_intents').select('id', { count: 'exact' }),
      supabase.from('paper_execution_intents').select('id', { count: 'exact' }).eq('risk_check_passed', false),
    ]);
    setRuns(runsRes.data ?? []);
    setProviders(provRes.data ?? []);
    setScannerConfig(cfgRes.data ?? null);
    setModes((modesRes.data ?? []) as ModeConfig[]);
    setPaperCount(paperRes.count ?? 0);
    setRiskBlockedCount(riskRes.count ?? 0);
    setStats({
      symbols: symRes.count ?? 0,
      candles: candRes.count ?? 0,
      signals: sigRes.count ?? 0,
      candidates: candCountRes.count ?? 0,
      users: userRes.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
        const riskStr = data.risk_blocked ? `, Risk-blocked: ${data.risk_blocked}` : '';
        setScanMsg(`Scan complete${dur}. Symbols: ${data.symbols_scanned}, Candles: ${data.candles_fetched}, Candidates: ${data.candidates_found}, Signals: ${data.signals_created}${paperStr}${riskStr}${data.errors?.length ? ` — ${data.errors.length} warning(s)` : ''}`);
      } else {
        setScanMsg(`Error: ${data.error}`);
      }
      await load();
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
      await load();
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
      setActionMsg('Binance API unreachable. Check your network or demo mode.');
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
        body: JSON.stringify({ symbols: ['EURUSD'], timeframes: ['15m'], quick_test: true }),
      });
      const data = await res.json();
      const fp = data.forex_provider ?? 'unknown';
      const isReal = data.forex_real_data === true;
      const demoFallback = data.forex_demo_fallback_used === true;
      setActionMsg(
        `Forex provider: ${fp} | Data: ${isReal ? 'REAL DATA' : demoFallback ? 'DEMO FALLBACK' : 'DEMO'}`
      );
    } catch (e) {
      setActionMsg(`Forex test error: ${e instanceof Error ? e.message : 'unknown'}`);
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

  const lastRun = runs[0];
  const cryptoProvider = providers.find(p => p.market_type === 'crypto');
  const forexProvider = providers.find(p => p.market_type === 'forex');
  const isForexReal = forexProvider?.data_source_label === 'REAL DATA';
  const isEnabled = scannerConfig?.is_enabled ?? false;

  const lastRunMinsAgo = lastRun
    ? Math.floor((Date.now() - new Date(lastRun.started_at).getTime()) / 60000)
    : null;
  const dbHeartbeat = scannerConfig?.heartbeat_status;
  const heartbeatStatus = dbHeartbeat
    ? dbHeartbeat.charAt(0).toUpperCase() + dbHeartbeat.slice(1)
    : (!lastRun ? 'No runs yet' : 'Inactive');
  const heartbeatColor =
    dbHeartbeat === 'healthy' ? 'text-emerald-400'
    : dbHeartbeat === 'stale' ? 'text-yellow-400'
    : dbHeartbeat === 'error' ? 'text-red-400'
    : 'text-zinc-500';

  function durationStr(run: ScannerRun): string {
    if (!run.finished_at) return '—';
    const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <AdminLayout>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Operator Control Room</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Signal Mode MVP — scanner, providers, Telegram, subscribers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
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

      {/* Bot mode banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-sm font-semibold">Bot Mode: Signal Mode MVP</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Scanner:</span>
          <span className={`text-xs font-medium ${isEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Heartbeat:</span>
          <span className={`text-xs font-medium ${heartbeatColor}`}>{heartbeatStatus}</span>
          {lastRunMinsAgo !== null && <span className="text-xs text-zinc-600">{lastRunMinsAgo}m ago</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Schedule:</span>
          <span className={`text-xs font-medium ${scannerConfig?.schedule_enabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {scannerConfig?.schedule_enabled ? `ON (${scannerConfig.scan_interval_minutes ?? 5}m)` : 'OFF'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Cron job:</span>
          <span className={`text-xs font-medium ${scannerConfig?.cron_job_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {scannerConfig?.cron_job_active ? 'Configured' : 'Not set up'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Min grade:</span>
          <span className="text-xs text-zinc-300">{scannerConfig?.min_signal_grade ?? '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Timeframes:</span>
          <span className="text-xs text-zinc-300">{scannerConfig?.active_timeframes?.join(', ') ?? '—'}</span>
        </div>
        {!isEnabled && (
          <div className="ml-auto text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-lg">
            Scheduled scanning is not active. Manual scanning available. Cron setup required for always-on mode.
          </div>
        )}
      </div>

      {/* Mode status strip */}
      {modes.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 mb-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Layers size={12} />
            <span>Modes:</span>
          </div>
          {modes.map(m => (
            <div key={m.slug} className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${m.is_enabled ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
              <span className={`text-xs ${m.is_enabled ? 'text-zinc-300' : 'text-zinc-600'}`}>{m.display_name}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="text-zinc-500">Paper intents: <span className="text-zinc-300 font-medium">{paperCount}</span></span>
            {riskBlockedCount > 0 && (
              <span className="text-red-400">Risk-blocked: <span className="font-medium">{riskBlockedCount}</span></span>
            )}
          </div>
        </div>
      )}

      {scannerConfig?.demo_mode_enabled && (
        <div className="mb-4 px-4 py-3 rounded-lg text-xs border bg-orange-500/10 border-orange-500/20 text-orange-300 flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />
          <span>Demo mode is enabled. Scanner uses seeded candle data as fallback. Forex always uses demo data.</span>
          <Link to="/admin/scanner-config" className="ml-auto underline shrink-0">Configure</Link>
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
            {isEnabled ? (
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
              Test Forex Provider
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
          { to: '/admin/signals', icon: Radio, label: 'Signals Manager', sub: 'Send, update, cancel' },
          { to: '/admin/modes', icon: Layers, label: 'Mode Control', sub: 'Signal / Personal / Prop' },
          { to: '/admin/trading-brain', icon: BarChart2, label: 'Trading Brain', sub: 'Evaluation diagnostics' },
        ].map(({ to, icon: Icon, label, sub }) => (
          <Link key={to} to={to}
            className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex flex-col gap-1.5 transition-colors group">
            <Icon size={16} className="text-zinc-500 group-hover:text-blue-400 transition-colors" />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-zinc-600">{sub}</span>
          </Link>
        ))}
      </div>

      {/* Provider + Last Run */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2"><Database size={14} className="text-zinc-500" /> Provider Status</div>
            <Link to="/admin/providers" className="text-xs text-zinc-500 hover:text-zinc-300">Full details</Link>
          </div>
          <div className="divide-y divide-zinc-800">
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm">Binance</span>
                <span className="text-xs text-zinc-600 ml-2">Crypto — real data when reachable</span>
              </div>
              <div className="flex items-center gap-2">
                {cryptoProvider ? statusBadge(cryptoProvider.status) : statusBadge('unknown')}
                {cryptoProvider?.last_success_at && (
                  <span className="text-xs text-zinc-600">{new Date(cryptoProvider.last_success_at).toLocaleTimeString()}</span>
                )}
              </div>
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm">Forex</span>
                <span className={`text-xs ml-2 ${isForexReal ? 'text-emerald-500/70' : 'text-orange-500/70'}`}>
                  {isForexReal ? `${forexProvider?.provider_name ?? 'real'} — real data` : 'Demo data — not real'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {forexProvider ? statusBadge(forexProvider.status) : statusBadge('unknown')}
                <Badge variant={isForexReal ? 'green' : 'orange'}>{isForexReal ? 'REAL' : 'DEMO'}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-zinc-500" /> Last Scanner Run</div>
            <Link to="/admin/scanner" className="text-xs text-zinc-500 hover:text-zinc-300">Full log</Link>
          </div>
          {lastRun ? (
            <div className="divide-y divide-zinc-800">
              {([
                { label: 'Status',           value: statusBadge(lastRun.status) },
                { label: 'Started',          value: new Date(lastRun.started_at).toLocaleString() },
                { label: 'Duration',         value: durationStr(lastRun) },
                { label: 'Symbols Scanned',  value: String(lastRun.symbols_scanned) },
                { label: 'Candles Fetched',  value: String(lastRun.candles_fetched) },
                { label: 'Candidates Found', value: String(lastRun.candidates_found) },
                { label: 'Signals Created',  value: String(lastRun.signals_created) },
              ] as { label: string; value: React.ReactNode }[]).map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-5 py-2">
                  <span className="text-xs text-zinc-500">{label}</span>
                  <span className="text-xs text-zinc-200">{value}</span>
                </div>
              ))}
              {lastRun.error_message && (
                <div className="px-5 py-2.5">
                  <div className="text-xs text-yellow-400 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{lastRun.error_message}</span>
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

      {/* Recent runs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Recent Scanner Runs</div>
          <Link to="/admin/scheduler" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
            <Clock size={11} /> Set up scheduling
          </Link>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-600">No runs yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-5 py-2.5">Started</th>
                <th className="text-left px-5 py-2.5">Status</th>
                <th className="text-left px-5 py-2.5">Duration</th>
                <th className="text-left px-5 py-2.5">Symbols</th>
                <th className="text-left px-5 py-2.5">Candles</th>
                <th className="text-left px-5 py-2.5">Candidates</th>
                <th className="text-left px-5 py-2.5">Signals</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-5 py-2.5 text-zinc-400">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-5 py-2.5">{statusBadge(r.status)}</td>
                  <td className="px-5 py-2.5 text-zinc-400">{durationStr(r)}</td>
                  <td className="px-5 py-2.5 text-zinc-300">{r.symbols_scanned}</td>
                  <td className="px-5 py-2.5 text-zinc-300">{r.candles_fetched}</td>
                  <td className="px-5 py-2.5 text-zinc-300">{r.candidates_found}</td>
                  <td className="px-5 py-2.5 text-zinc-300">{r.signals_created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}
