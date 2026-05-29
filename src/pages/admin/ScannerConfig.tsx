import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLiveState } from '../../hooks/useAdminLiveState';
import { Save, Activity, Clock, Calendar } from 'lucide-react';
import { ScannerConfigRow } from '../../lib/types';

interface SymbolRow {
  id: string;
  symbol: string;
  display_name: string;
  market_type: string;
  is_active: boolean;
}

const ALL_TIMEFRAMES = ['5m', '15m', '1h', '4h'];

function fmtDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

function HeartbeatPill({ status }: { status: ScannerConfigRow['heartbeat_status'] | 'recent' | 'missing' }) {
  const cfg = {
    healthy: { cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400', label: 'Healthy / proven' },
    recent: { cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300', dot: 'bg-emerald-300', label: 'Recently proven' },
    stale: { cls: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400', label: 'Stale' },
    missing: { cls: 'bg-zinc-700/50 border-zinc-700 text-zinc-400', dot: 'bg-zinc-500', label: 'Missing' },
    inactive: { cls: 'bg-zinc-700/50 border-zinc-700 text-zinc-400', dot: 'bg-zinc-500', label: 'Inactive' },
    error: { cls: 'bg-red-500/10 border-red-500/20 text-red-400', dot: 'bg-red-400', label: 'Error' },
  }[status] ?? { cls: 'bg-zinc-700/50 border-zinc-700 text-zinc-400', dot: 'bg-zinc-500', label: 'Unknown' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === 'healthy' || status === 'recent' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

export default function ScannerConfig() {
  const { profile, session } = useAuth();
  const { state: liveState } = useAdminLiveState(session);
  const [config, setConfig] = useState<ScannerConfigRow | null>(null);
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [cfgRes, symRes] = await Promise.all([
      supabase.from('scanner_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('symbols').select('*').order('market_type').order('symbol'),
    ]);
    setConfig(cfgRes.data ?? null);
    setSymbols(symRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!config) return;
    setSaving(true);
    setMsg('');
    setError('');
    const { error: err } = await supabase.from('scanner_config').update({
      is_enabled: config.is_enabled,
      demo_mode_enabled: config.demo_mode_enabled,
      min_signal_grade: config.min_signal_grade,
      prevent_duplicate_symbol_signals: config.prevent_duplicate_symbol_signals,
      crypto_scan_interval_minutes: config.crypto_scan_interval_minutes,
      forex_scan_interval_minutes: config.forex_scan_interval_minutes,
      active_timeframes: config.active_timeframes,
      allow_demo_telegram_sending: config.allow_demo_telegram_sending,
      schedule_enabled: config.schedule_enabled,
      scan_interval_minutes: config.scan_interval_minutes,
      auto_send_telegram: config.auto_send_telegram,
      min_auto_send_grade: config.min_auto_send_grade,
      scan_crypto_enabled: config.scan_crypto_enabled,
      scan_forex_enabled: config.scan_forex_enabled,
      last_updated_by: profile?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setSaving(false);
    if (err) setError(err.message);
    else setMsg('Configuration saved');
  }

  async function toggleSymbol(symId: string, current: boolean) {
    await supabase.from('symbols').update({ is_active: !current }).eq('id', symId);
    setSymbols(s => s.map(sym => sym.id === symId ? { ...sym, is_active: !current } : sym));
  }

  function toggleTf(tf: string) {
    if (!config) return;
    const tfs = config.active_timeframes.includes(tf)
      ? config.active_timeframes.filter(t => t !== tf)
      : [...config.active_timeframes, tf];
    setConfig({ ...config, active_timeframes: tfs });
  }

  function setBool(field: keyof ScannerConfigRow, val: boolean) {
    if (!config) return;
    setConfig({ ...config, [field]: val });
  }

  function setStr(field: keyof ScannerConfigRow, val: string) {
    if (!config) return;
    setConfig({ ...config, [field]: val });
  }

  function setNum(field: keyof ScannerConfigRow, val: number) {
    if (!config) return;
    setConfig({ ...config, [field]: val });
  }

  if (loading) return (
    <AdminLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AdminLayout>
  );

  if (!config) return (
    <AdminLayout>
      <div className="text-center py-20 text-zinc-500">Scanner config not found. Run a migration.</div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Scanner Configuration</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Control scanner behaviour, data sources, scheduling, and signal quality</p>
        </div>
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Config'}
        </button>
      </div>

      {msg && <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg">{msg}</div>}
      {error && <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">{error}</div>}

      <div className="space-y-4 max-w-3xl">

        {/* Heartbeat status */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <Activity size={14} className="text-zinc-500" />
            Scheduler Heartbeat
          </div>
          <div className="px-5 py-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1.5">Status</div>
              <HeartbeatPill status={liveState.schedulerProof.status === 'active' ? 'healthy' : liveState.schedulerProof.status} />
              <div className="text-xs text-zinc-600 mt-1">{liveState.cronReason}</div>
              {liveState.loadedAt && (
                <div className="text-xs text-zinc-600 mt-1">Refreshed: {fmtDate(liveState.loadedAt)}</div>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-zinc-500 flex items-center gap-1"><Calendar size={10} /> Last Scheduled Scan</div>
                <div className="text-xs text-zinc-300 mt-0.5">{fmtDate(liveState.latestScheduledRun?.started_at ?? config.last_scheduled_scan_at)}</div>
                {liveState.latestScheduledRun && <div className="text-[11px] text-zinc-600 mt-0.5">Run ID: {liveState.latestScheduledRun.id} · Age: {liveState.schedulerProof.ageMinutes ?? '—'}m</div>}
              </div>
              <div>
                <div className="text-xs text-zinc-500 flex items-center gap-1"><Clock size={10} /> Last Manual Scan</div>
                <div className="text-xs text-zinc-300 mt-0.5">{fmtDate(liveState.latestManualRun?.started_at ?? config.last_manual_scan_at)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Master switches */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Master Controls</div>
          <div className="divide-y divide-zinc-800">
            <Toggle label="Scanner Enabled" desc="Master on/off for the scanner. Disabling prevents any scans." value={config.is_enabled} onChange={v => setBool('is_enabled', v)} />
            <Toggle label="Demo Mode Enabled" desc="Allow demo/seeded candle data when real providers fail or are not configured." value={config.demo_mode_enabled} onChange={v => setBool('demo_mode_enabled', v)} />
            <Toggle label="Prevent Duplicate Symbol Signals" desc="One active signal per symbol. New signals won't be created if the symbol already has a waiting/active signal." value={config.prevent_duplicate_symbol_signals} onChange={v => setBool('prevent_duplicate_symbol_signals', v)} />
            <Toggle
              label="Allow Demo Telegram Sending"
              desc="Allow signals generated from demo/seeded data to be sent to Telegram. DISABLED by default to prevent fake signals reaching users."
              value={config.allow_demo_telegram_sending}
              onChange={v => setBool('allow_demo_telegram_sending', v)}
              warn={config.allow_demo_telegram_sending}
            />
          </div>
        </div>

        {/* Scheduled scanning */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Scheduled Scanning</div>
          <div className="divide-y divide-zinc-800">
            <Toggle
              label="Schedule Enabled"
              desc="Allow the scheduled-market-scanner Edge Function (called by pg_cron) to execute. When disabled, cron calls are silently skipped."
              value={config.schedule_enabled ?? false}
              onChange={v => setBool('schedule_enabled', v)}
            />
          </div>
          <div className="px-5 py-4">
            <label className="block text-xs text-zinc-400 mb-1.5">Scan Interval (minutes)</label>
            <input
              type="number" min={1} max={60} value={config.scan_interval_minutes ?? 5}
              onChange={e => setNum('scan_interval_minutes', parseInt(e.target.value) || 5)}
              className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-zinc-600 mt-1.5">Used to compute heartbeat staleness threshold (interval × 2). Must match your pg_cron schedule.</p>
          </div>
        </div>

        {/* Market toggles */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Market Scanning</div>
          <div className="divide-y divide-zinc-800">
            <Toggle label="Scan Crypto" desc="Include crypto symbols (Binance) in scanner runs." value={config.scan_crypto_enabled ?? true} onChange={v => setBool('scan_crypto_enabled', v)} />
            <Toggle label="Scan Forex" desc="Include forex symbols (Twelve Data or configured provider) in scanner runs." value={config.scan_forex_enabled ?? true} onChange={v => setBool('scan_forex_enabled', v)} />
          </div>
        </div>

        {/* Auto Telegram */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Auto Telegram Delivery</div>
          <div className="divide-y divide-zinc-800">
            <Toggle
              label="Auto Send Telegram"
              desc="Automatically send new signals to Telegram after each scan. Only signals from REAL DATA and meeting minimum grade are sent. Disabled by default."
              value={config.auto_send_telegram ?? false}
              onChange={v => setBool('auto_send_telegram', v)}
              warn={config.auto_send_telegram}
            />
          </div>
          <div className="px-5 py-4">
            <label className="block text-xs text-zinc-400 mb-1.5">Minimum Grade for Auto Send</label>
            <select
              value={config.min_auto_send_grade ?? 'A'}
              onChange={e => setStr('min_auto_send_grade', e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="A+">A+ only (highest confidence)</option>
              <option value="A">A and above — recommended</option>
              <option value="B">B and above (more signals, lower quality)</option>
            </select>
            <p className="text-xs text-zinc-600 mt-1.5">Signals below this grade are created but not auto-sent. Blocked reasons are logged.</p>
          </div>
        </div>

        {/* Signal quality */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Signal Quality</div>
          <div className="px-5 py-4">
            <label className="block text-xs text-zinc-400 mb-1.5">Minimum Signal Grade</label>
            <select value={config.min_signal_grade} onChange={e => setStr('min_signal_grade', e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="A+">A+ only (score 85+)</option>
              <option value="A">A and above (score 75+) — recommended</option>
              <option value="B">B and above (score 65+) — more signals, lower quality</option>
            </select>
            <p className="text-xs text-zinc-600 mt-1.5">Candidates below this grade will be stored but not promoted to signals.</p>
          </div>
        </div>

        {/* Scan intervals (legacy) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Legacy Scan Interval Docs</div>
          <div className="px-5 py-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Crypto Interval (minutes)</label>
              <input type="number" min={1} max={60} value={config.crypto_scan_interval_minutes}
                onChange={e => setNum('crypto_scan_interval_minutes', parseInt(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              <p className="text-xs text-zinc-600 mt-1">Documentation only — scheduling via pg_cron.</p>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Forex Interval (minutes)</label>
              <input type="number" min={1} max={60} value={config.forex_scan_interval_minutes}
                onChange={e => setNum('forex_scan_interval_minutes', parseInt(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>

        {/* Timeframes */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Active Timeframes</div>
          <div className="px-5 py-4 flex gap-3">
            {ALL_TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => toggleTf(tf)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  config.active_timeframes.includes(tf)
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                }`}>
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Symbol on/off */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Symbol Enable / Disable</div>
          <div className="divide-y divide-zinc-800 max-h-96 overflow-y-auto scrollbar-thin">
            {symbols.map(sym => (
              <div key={sym.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="font-mono text-sm text-zinc-100">{sym.symbol}</span>
                  <span className="text-xs text-zinc-500 ml-2">{sym.display_name}</span>
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${sym.market_type === 'crypto' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {sym.market_type}
                  </span>
                </div>
                <button onClick={() => toggleSymbol(sym.id, sym.is_active)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${sym.is_active ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sym.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}

function Toggle({ label, desc, value, onChange, warn = false }: {
  label: string; desc: string; value: boolean;
  onChange: (v: boolean) => void; warn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between px-5 py-4 gap-4">
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${warn ? 'text-orange-400' : 'text-zinc-200'}`}>{label}</div>
        <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</div>
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${value ? (warn ? 'bg-orange-500' : 'bg-blue-600') : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
