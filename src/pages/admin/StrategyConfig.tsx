import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { StrategyConfig } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { Settings, Save, RotateCcw, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  MicroScalper: {
    ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14,
    rsi_buy_min: 52, rsi_sell_max: 48,
    min_atr_pct: 0.05, max_atr_pct: 3.0,
    momentum_lookback: 3, min_body_atr: 0.25,
    stop_atr_mult: 1.2, tp1_r: 0.9, tp2_r: 1.5,
  },
  CompressionBreakout: {
    box_lookback: 32, min_box_bars: 20,
    max_box_atr_range: 2.0, atr_len: 14,
    atr_expansion_lookback: 48, min_atr_expansion: 1.05,
    breakout_buffer_atr: 0.10, stop_atr_mult: 1.2,
    tp1_r: 1.2, tp2_r: 2.5, fakeout_max_reentry_bars: 3,
  },
};

const PARAM_DESCRIPTIONS: Record<string, string> = {
  ema_fast: 'Fast EMA period', ema_slow: 'Slow EMA period',
  rsi_len: 'RSI period', atr_len: 'ATR period',
  rsi_buy_min: 'RSI minimum for buy signal (e.g. 52)',
  rsi_sell_max: 'RSI maximum for sell signal (e.g. 48)',
  min_atr_pct: 'Min ATR% — filters low-volatility periods',
  max_atr_pct: 'Max ATR% — filters extreme volatility',
  momentum_lookback: 'Bars to check momentum direction',
  min_body_atr: 'Min candle body as fraction of ATR',
  stop_atr_mult: 'Stop loss = entry ± ATR × this',
  tp1_r: 'TP1 = risk × this R multiple',
  tp2_r: 'TP2 = risk × this R multiple',
  box_lookback: 'Candles to build compression box',
  min_box_bars: 'Min bars inside box for valid compression',
  max_box_atr_range: 'Max box range in ATR units',
  atr_expansion_lookback: 'Historical window for ATR expansion check',
  min_atr_expansion: 'Current range / avg range must exceed this',
  breakout_buffer_atr: 'ATR buffer above/below box for breakout confirm',
  fakeout_max_reentry_bars: 'Max bars to re-enter after fakeout reversal',
};

type EditState = {
  enabled: boolean;
  min_score: number;
  min_rr: number;
  allowed_timeframes: string[];
  params: Record<string, number>;
};

const ALL_TIMEFRAMES = ['5m', '15m', '1h', '4h'];

export default function StrategyConfigPage() {
  const { session } = useAuth();
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [msgErr, setMsgErr] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase.from('strategy_configs').select('*').order('strategy_name');
    const rows = (data ?? []) as StrategyConfig[];
    setConfigs(rows);
    const initEdits: Record<string, EditState> = {};
    rows.forEach((c) => {
      initEdits[c.strategy_name] = {
        enabled: c.enabled,
        min_score: c.min_score,
        min_rr: c.min_rr,
        allowed_timeframes: c.allowed_timeframes,
        params: { ...c.params },
      };
    });
    setEdits(initEdits);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function flash(text: string, err = false) {
    setMsg(text); setMsgErr(err);
    setTimeout(() => setMsg(''), 5000);
  }

  async function save(name: string) {
    const e = edits[name];
    if (!e) return;
    setSaving((p) => ({ ...p, [name]: true }));
    const { error } = await supabase
      .from('strategy_configs')
      .update({
        enabled: e.enabled,
        min_score: e.min_score,
        min_rr: e.min_rr,
        allowed_timeframes: e.allowed_timeframes,
        params: e.params,
        updated_at: new Date().toISOString(),
      })
      .eq('strategy_name', name);

    if (error) {
      flash(`Save failed: ${error.message}`, true);
    } else {
      await supabase.from('audit_logs').insert({
        actor_user_id: session?.user.id ?? null,
        action: 'strategy_config_updated',
        entity_type: 'strategy_configs',
        entity_id: name,
        metadata: { min_score: e.min_score, min_rr: e.min_rr, enabled: e.enabled },
      });
      flash(`${name} saved.`);
      await load();
    }
    setSaving((p) => ({ ...p, [name]: false }));
  }

  function restoreDefaults(name: string) {
    setEdits((p) => ({
      ...p,
      [name]: { ...p[name], params: { ...DEFAULT_PARAMS[name] } },
    }));
  }

  function setEdit<K extends keyof EditState>(name: string, key: K, val: EditState[K]) {
    setEdits((p) => ({ ...p, [name]: { ...p[name], [key]: val } }));
  }

  function toggleTf(name: string, tf: string) {
    const current = edits[name]?.allowed_timeframes ?? [];
    const next = current.includes(tf) ? current.filter((t) => t !== tf) : [...current, tf];
    setEdit(name, 'allowed_timeframes', next);
  }

  function setParam(name: string, key: string, raw: string) {
    const val = parseFloat(raw);
    if (isNaN(val)) return;
    setEdits((p) => ({
      ...p,
      [name]: { ...p[name], params: { ...p[name].params, [key]: val } },
    }));
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Strategy Config</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Enable/disable strategies and tune parameters</p>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          msgErr ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>{msg}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : configs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
          No strategy configs found. Run a scanner scan first to seed defaults.
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {configs.map((cfg) => {
            const e = edits[cfg.strategy_name];
            if (!e) return null;
            const isOpen = expanded[cfg.strategy_name];
            const params = DEFAULT_PARAMS[cfg.strategy_name] ?? {};

            return (
              <div key={cfg.strategy_name} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Header row */}
                <div className="px-5 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded bg-blue-600/20 flex items-center justify-center shrink-0">
                    <Settings size={14} className="text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{cfg.strategy_name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      min_score={e.min_score} · min_rr={e.min_rr} · {e.allowed_timeframes.join(', ') || 'all timeframes'}
                    </div>
                  </div>
                  {/* Enable toggle */}
                  <button
                    onClick={() => setEdit(cfg.strategy_name, 'enabled', !e.enabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      e.enabled
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                    }`}>
                    {e.enabled ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {e.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [cfg.strategy_name]: !p[cfg.strategy_name] }))}
                    className="text-zinc-500 hover:text-zinc-200 transition-colors">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-zinc-800 px-5 py-4 space-y-5 bg-zinc-900/50">
                    {/* Core settings */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Min Score (0–100)</label>
                        <input
                          type="number" min={0} max={100}
                          value={e.min_score}
                          onChange={(ev) => setEdit(cfg.strategy_name, 'min_score', parseFloat(ev.target.value) || 0)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Min R:R</label>
                        <input
                          type="number" min={0.5} max={10} step={0.1}
                          value={e.min_rr}
                          onChange={(ev) => setEdit(cfg.strategy_name, 'min_rr', parseFloat(ev.target.value) || 0)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Timeframes */}
                    <div>
                      <label className="block text-xs text-zinc-500 mb-2">Allowed Timeframes (empty = all active)</label>
                      <div className="flex gap-2">
                        {ALL_TIMEFRAMES.map((tf) => (
                          <button key={tf}
                            onClick={() => toggleTf(cfg.strategy_name, tf)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                              e.allowed_timeframes.includes(tf)
                                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                            }`}>
                            {tf}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Params */}
                    {Object.keys(params).length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-zinc-500">Strategy Parameters</label>
                          <button
                            onClick={() => restoreDefaults(cfg.strategy_name)}
                            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                            <RotateCcw size={10} /> Restore defaults
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.keys(params).map((key) => (
                            <div key={key} className="bg-zinc-800/60 rounded p-2">
                              <div className="text-xs text-zinc-600 mb-0.5 font-mono">{key}</div>
                              <div className="text-xs text-zinc-600 mb-1">{PARAM_DESCRIPTIONS[key] ?? ''}</div>
                              <input
                                type="number" step="any"
                                value={e.params[key] ?? params[key]}
                                onChange={(ev) => setParam(cfg.strategy_name, key, ev.target.value)}
                                className="w-full bg-zinc-700/50 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1 border-t border-zinc-800">
                      <button
                        onClick={() => save(cfg.strategy_name)}
                        disabled={saving[cfg.strategy_name]}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        {saving[cfg.strategy_name]
                          ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Save size={13} />}
                        Save {cfg.strategy_name}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
