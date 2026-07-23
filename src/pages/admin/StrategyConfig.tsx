import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { StrategyConfig } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { Settings, Save, RotateCcw, CheckCircle, XCircle, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

type StrategyName = 'MicroScalper' | 'CompressionBreakout' | 'SwingContinuation' | 'QuickScalp' | 'ForexMicroScalper' | 'ForexSwingContinuation' | 'ForexCompressionBreakout' | 'ForexQuickScalp';
type FieldGroup = 'Quality Gates' | 'Timeframes' | 'Indicators' | 'Entry Filters' | 'Stop/TP/Risk' | 'Strategy-Specific';

type ParamField = {
  key: string;
  label: string;
  helper: string;
  group: FieldGroup;
  min?: number;
  max?: number;
  step?: number;
};

type StrategyDefinition = {
  description: string;
  defaultMeta: Pick<EditState, 'enabled' | 'market_type' | 'signal_style' | 'risk_mode' | 'allowed_timeframes' | 'min_score' | 'min_rr' | 'min_stop_distance_pct' | 'min_tp1_distance_pct' | 'min_tp2_distance_pct' | 'max_bars_in_trade'>;
  defaultParams: Record<string, number>;
  params: ParamField[];
  allowedTimeframes: string[];
  codeNotes: string;
};

type EditState = {
  enabled: boolean;
  market_type: string;
  signal_style: string;
  risk_mode: string;
  allowed_timeframes: string[];
  min_score: number;
  min_rr: number;
  min_stop_distance_pct: number;
  min_tp1_distance_pct: number;
  min_tp2_distance_pct: number;
  max_bars_in_trade: number;
  params: Record<string, number>;
};

const FIELD_GROUPS: FieldGroup[] = ['Quality Gates', 'Timeframes', 'Indicators', 'Entry Filters', 'Stop/TP/Risk', 'Strategy-Specific'];
const ALL_TIMEFRAMES = ['5m', '15m', '1h', '4h'];

const indicatorFields: ParamField[] = [
  { key: 'ema_fast', label: 'EMA Fast', helper: 'Fast EMA used by Backtest Lab; scanner indicators are currently fixed at EMA20.', group: 'Indicators', min: 2, step: 1 },
  { key: 'ema_slow', label: 'EMA Slow', helper: 'Slow EMA used by Backtest Lab; scanner indicators are currently fixed at EMA50.', group: 'Indicators', min: 2, step: 1 },
  { key: 'rsi_len', label: 'RSI Length', helper: 'RSI period used by Backtest Lab; scanner indicator snapshot is RSI14.', group: 'Indicators', min: 2, step: 1 },
  { key: 'atr_len', label: 'ATR Length', helper: 'ATR period used by Backtest Lab; scanner indicator snapshot is ATR14.', group: 'Indicators', min: 1, step: 1 },
];

const rsiFilterFields: ParamField[] = [
  { key: 'rsi_buy_min', label: 'RSI Buy Min', helper: 'Minimum RSI required for long-side confirmation.', group: 'Entry Filters', min: 0, max: 100, step: 1 },
  { key: 'rsi_sell_max', label: 'RSI Sell Max', helper: 'Maximum RSI required for short-side confirmation.', group: 'Entry Filters', min: 0, max: 100, step: 1 },
];

const volatilityFields: ParamField[] = [
  { key: 'min_atr_pct', label: 'Min ATR %', helper: 'Rejects periods with volatility below this ATR percentage.', group: 'Entry Filters', min: 0, step: 0.01 },
  { key: 'max_atr_pct', label: 'Max ATR %', helper: 'Rejects excessive volatility above this ATR percentage.', group: 'Entry Filters', min: 0, step: 0.01 },
];

const stopFields: ParamField[] = [
  { key: 'stop_atr_mult', label: 'Stop ATR Multiplier', helper: 'ATR multiple used to place stop distance.', group: 'Stop/TP/Risk', min: 0.01, step: 0.1 },
  { key: 'tp1_r', label: 'TP1 R Multiple', helper: 'First target distance in ATR/R units used by the evaluator.', group: 'Stop/TP/Risk', min: 0.01, step: 0.1 },
  { key: 'tp2_r', label: 'TP2 R Multiple', helper: 'Second target distance in ATR/R units. Must be above TP1.', group: 'Stop/TP/Risk', min: 0.01, step: 0.1 },
];

const microSpecificFields: ParamField[] = [
  { key: 'momentum_lookback', label: 'Momentum Lookback', helper: 'Bars used by scanner/backtest momentum confirmation.', group: 'Strategy-Specific', min: 1, step: 1 },
  { key: 'min_body_atr', label: 'Min Body / ATR', helper: 'Minimum candle body size relative to ATR.', group: 'Strategy-Specific', min: 0, step: 0.01 },
];

const compressionSpecificFields: ParamField[] = [
  { key: 'box_lookback', label: 'Box Lookback', helper: 'Prior candles used to build the compression box.', group: 'Strategy-Specific', min: 10, step: 1 },
  { key: 'min_box_bars', label: 'Min Box Bars', helper: 'Minimum bars that must remain inside the compression box.', group: 'Strategy-Specific', min: 4, step: 1 },
  { key: 'max_box_atr_range', label: 'Max Box ATR Range', helper: 'Maximum compression-box height measured in ATR units.', group: 'Strategy-Specific', min: 0.1, step: 0.1 },
  { key: 'atr_expansion_lookback', label: 'ATR Expansion Lookback', helper: 'Historical range window used for breakout expansion comparison.', group: 'Strategy-Specific', min: 5, step: 1 },
  { key: 'min_atr_expansion', label: 'Min ATR Expansion', helper: 'Current bar range must exceed historical average by this ratio.', group: 'Strategy-Specific', min: 0.1, step: 0.05 },
  { key: 'breakout_buffer_atr', label: 'Breakout Buffer ATR', helper: 'ATR buffer beyond the box required to confirm breakout.', group: 'Strategy-Specific', min: 0, step: 0.01 },
];

const swingSpecificFields: ParamField[] = [
  { key: 'pullback_bars', label: 'Pullback Bars', helper: 'Lookback window used to confirm pullback toward EMA before reclaim.', group: 'Strategy-Specific', min: 1, step: 1 },
];

const STRATEGY_DEFINITIONS: Record<StrategyName, StrategyDefinition> = {
  MicroScalper: {
    description: 'Crypto 5m/15m momentum scalper with EMA trend, RSI, ATR/body, and momentum gates.',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'scalper', risk_mode: 'balanced', allowed_timeframes: ['5m', '15m'], min_score: 72, min_rr: 1.2, min_stop_distance_pct: 0.18, min_tp1_distance_pct: 0.25, min_tp2_distance_pct: 0.40, max_bars_in_trade: 24 },
    defaultParams: { ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, rsi_buy_min: 52, rsi_sell_max: 48, min_atr_pct: 0.10, max_atr_pct: 3.0, momentum_lookback: 3, min_body_atr: 0.30, stop_atr_mult: 1.4, tp1_r: 1.2, tp2_r: 1.8 },
    params: [...indicatorFields, ...rsiFilterFields, ...volatilityFields, ...stopFields, ...microSpecificFields],
    allowedTimeframes: ['5m', '15m'],
    codeNotes: 'Scanner uses RSI, ATR%, body/ATR, configurable momentum lookback, stop ATR, TP1, and TP2; Backtest Lab also uses EMA/RSI/ATR lengths.',
  },
  CompressionBreakout: {
    description: 'Crypto 15m/1h compression box breakout with expansion and momentum confirmation.',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'scalper', risk_mode: 'balanced', allowed_timeframes: ['15m', '1h'], min_score: 75, min_rr: 1.3, min_stop_distance_pct: 0.25, min_tp1_distance_pct: 0.35, min_tp2_distance_pct: 0.60, max_bars_in_trade: 48 },
    defaultParams: { ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, momentum_lookback: 3, box_lookback: 50, min_box_bars: 14, max_box_atr_range: 1.8, atr_expansion_lookback: 48, min_atr_expansion: 1.1, breakout_buffer_atr: 0.12, stop_atr_mult: 1.4, tp1_r: 1.3, tp2_r: 2.5 },
    params: [...indicatorFields.filter((f) => ['rsi_len', 'atr_len'].includes(f.key)), ...stopFields, ...compressionSpecificFields, { key: 'momentum_lookback', label: 'Momentum Lookback', helper: 'Bars used by Backtest Lab breakout momentum check; scanner momentum snapshot remains fixed.', group: 'Strategy-Specific', min: 1, step: 1 }],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Scanner/backtest use box lookback, inside-bar count, box ATR range, expansion lookback/ratio, breakout buffer, stop ATR, TP1, and TP2.',
  },
  SwingContinuation: {
    description: 'Crypto 15m/1h trend continuation using EMA alignment, pullback/reclaim, momentum, and wider stops.',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'swing', risk_mode: 'balanced', allowed_timeframes: ['15m', '1h'], min_score: 76, min_rr: 1.5, min_stop_distance_pct: 0.45, min_tp1_distance_pct: 0.70, min_tp2_distance_pct: 1.20, max_bars_in_trade: 96 },
    defaultParams: { ema_fast: 20, ema_slow: 50, rsi_len: 14, atr_len: 14, rsi_buy_min: 50, rsi_sell_max: 50, min_atr_pct: 0.15, max_atr_pct: 4.0, momentum_lookback: 3, pullback_bars: 5, stop_atr_mult: 1.6, tp1_r: 1.5, tp2_r: 2.5 },
    params: [...indicatorFields, ...rsiFilterFields, ...volatilityFields, ...stopFields, ...swingSpecificFields, { key: 'momentum_lookback', label: 'Momentum Lookback', helper: 'Bars used by Backtest Lab swing momentum check; scanner momentum snapshot remains fixed.', group: 'Strategy-Specific', min: 1, step: 1 }],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Scanner uses RSI, ATR%, pullback bars, stop ATR, TP1, and TP2; Backtest Lab also uses EMA/RSI/ATR lengths and momentum lookback.',
  },
  QuickScalp: {
    description: 'Crypto 5m/15m high-selectivity impulse scalp with volume expansion, EMA alignment, momentum acceleration, ATR expansion, and fast protection.',
    defaultMeta: { enabled: true, market_type: 'crypto', signal_style: 'scalper', risk_mode: 'balanced', allowed_timeframes: ['5m', '15m'], min_score: 82, min_rr: 1.15, min_stop_distance_pct: 0.18, min_tp1_distance_pct: 0.25, min_tp2_distance_pct: 0.40, max_bars_in_trade: 12 },
    defaultParams: { ema_fast: 20, ema_slow: 50, atr_len: 14, min_atr_pct: 0.12, max_atr_pct: 2.5, stop_atr_mult: 0.95, tp1_r: 0.55, tp2_r: 1.15, min_volume_expansion: 1.15, max_extension_atr: 1.15, no_entry_timeout_bars: 3 },
    params: [...indicatorFields.filter((f) => ['ema_fast', 'ema_slow', 'atr_len'].includes(f.key)), ...volatilityFields, ...stopFields, { key: 'min_volume_expansion', label: 'Min Volume Expansion', helper: 'Rejects dead/low-volume impulses below this volume expansion ratio.', group: 'Entry Filters', min: 0, step: 0.05 }, { key: 'max_extension_atr', label: 'Max Extension ATR', helper: 'Rejects late entries after price extends too far from EMA20.', group: 'Entry Filters', min: 0, step: 0.05 }, { key: 'no_entry_timeout_bars', label: 'No-entry Timeout Bars', helper: 'Cancels stale QuickScalp setups if entry is not reached quickly.', group: 'Strategy-Specific', min: 1, step: 1 }],
    allowedTimeframes: ['5m', '15m'],
    codeNotes: 'Scanner evaluates volume expansion, liquidity proxy, EMA alignment, momentum acceleration, ATR expansion, impulse quality, spread quality, no-entry timeout, and fast exit metadata.',
  },
  ForexMicroScalper: {
    description: 'Forex 15m conservative micro scalper using the MicroScalper evaluator and TwelveData candles.',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'forex_signal', risk_mode: 'conservative', allowed_timeframes: ['15m'], min_score: 80, min_rr: 1.4, min_stop_distance_pct: 0.06, min_tp1_distance_pct: 0.08, min_tp2_distance_pct: 0.12, max_bars_in_trade: 32 },
    defaultParams: { rsi_buy_min: 54, rsi_sell_max: 46, min_atr_pct: 0.025, max_atr_pct: 1.2, momentum_lookback: 3, min_body_atr: 0.35, stop_atr_mult: 1.8, tp1_r: 1.2, tp2_r: 2.1 },
    params: [...rsiFilterFields, ...volatilityFields, ...stopFields, ...microSpecificFields],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Forex scanner reuses MicroScalper gates with forex-conservative defaults; UI only allows 15m/1h for forex rows.',
  },
  ForexSwingContinuation: {
    description: 'Forex 1h conservative swing continuation using trend/pullback/reclaim logic and TwelveData candles.',
    defaultMeta: { enabled: true, market_type: 'forex', signal_style: 'forex_signal', risk_mode: 'conservative', allowed_timeframes: ['1h'], min_score: 78, min_rr: 1.5, min_stop_distance_pct: 0.10, min_tp1_distance_pct: 0.12, min_tp2_distance_pct: 0.20, max_bars_in_trade: 72 },
    defaultParams: { rsi_buy_min: 52, rsi_sell_max: 48, min_atr_pct: 0.03, max_atr_pct: 1.5, pullback_bars: 8, stop_atr_mult: 2.0, tp1_r: 1.3, tp2_r: 2.4 },
    params: [...rsiFilterFields, ...volatilityFields, ...stopFields, ...swingSpecificFields],
    allowedTimeframes: ['15m', '1h'],
    codeNotes: 'Forex scanner reuses SwingContinuation gates with lower forex volatility limits and wider stops; UI only allows 15m/1h for forex rows.',
  },
};

const strategyNames = Object.keys(STRATEGY_DEFINITIONS) as StrategyName[];

function isStrategyName(name: string): name is StrategyName {
  return name in STRATEGY_DEFINITIONS;
}

function toNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : fallback;
}

function buildEditState(cfg: StrategyConfig): EditState {
  const def = isStrategyName(cfg.strategy_name) ? STRATEGY_DEFINITIONS[cfg.strategy_name] : null;
  const meta = def?.defaultMeta;
  const defaults = def?.defaultParams ?? {};

  return {
    enabled: cfg.enabled ?? meta?.enabled ?? true,
    market_type: cfg.market_type ?? meta?.market_type ?? 'crypto',
    signal_style: cfg.signal_style ?? meta?.signal_style ?? 'scalper',
    risk_mode: cfg.risk_mode ?? meta?.risk_mode ?? 'balanced',
    allowed_timeframes: toStringArray(cfg.allowed_timeframes, meta?.allowed_timeframes ?? []),
    min_score: toNumber(cfg.min_score, meta?.min_score ?? 75),
    min_rr: toNumber(cfg.min_rr, meta?.min_rr ?? 1.2),
    min_stop_distance_pct: toNumber(cfg.min_stop_distance_pct, meta?.min_stop_distance_pct ?? 0.18),
    min_tp1_distance_pct: toNumber(cfg.min_tp1_distance_pct, meta?.min_tp1_distance_pct ?? 0.25),
    min_tp2_distance_pct: toNumber(cfg.min_tp2_distance_pct, meta?.min_tp2_distance_pct ?? 0.40),
    max_bars_in_trade: toNumber(cfg.max_bars_in_trade, meta?.max_bars_in_trade ?? 24),
    params: { ...defaults, ...(cfg.params ?? {}) },
  };
}

function validateStrategy(name: string, edit: EditState): string[] {
  const errors: string[] = [];
  if (edit.min_score < 0 || edit.min_score > 100) errors.push('Min score must be between 0 and 100.');
  if (edit.min_rr <= 1.0) errors.push('Min R:R must be above 1.0.');
  if (edit.min_stop_distance_pct <= 0 || edit.min_tp1_distance_pct <= 0 || edit.min_tp2_distance_pct <= 0) errors.push('Distance guards must be above 0.');
  if (edit.max_bars_in_trade <= 0) errors.push('Max bars in trade must be above 0.');
  if (edit.enabled && edit.allowed_timeframes.length === 0) errors.push('Enabled strategies must have at least one allowed timeframe.');

  const stop = edit.params.stop_atr_mult;
  const tp1 = edit.params.tp1_r;
  const tp2 = edit.params.tp2_r;
  if (stop !== undefined && stop <= 0) errors.push('Stop ATR multiplier must be above 0.');
  if (tp1 !== undefined && tp1 <= 0) errors.push('TP1 R multiple must be above 0.');
  if (tp2 !== undefined && tp1 !== undefined && tp2 <= tp1) errors.push('TP2 R multiple must be above TP1 R multiple.');

  if (name.startsWith('Forex') && edit.allowed_timeframes.some((tf) => !['15m', '1h'].includes(tf))) {
    errors.push('Forex strategies currently allow only 15m and 1h.');
  }
  if ((name === 'MicroScalper' || name === 'QuickScalp') && edit.allowed_timeframes.some((tf) => ['1h', '4h'].includes(tf))) {
    errors.push(`${name} scanner supports only 5m and 15m.`);
  }
  if ((name === 'SwingContinuation' || name === 'ForexSwingContinuation') && edit.allowed_timeframes.includes('5m')) {
    errors.push('Swing strategies do not support 5m in the scanner.');
  }
  if (isStrategyName(name)) {
    const allowed = STRATEGY_DEFINITIONS[name].allowedTimeframes;
    const unsupported = edit.allowed_timeframes.filter((tf) => !allowed.includes(tf));
    if (unsupported.length > 0) errors.push(`${name} does not support: ${unsupported.join(', ')}.`);
  }

  return errors;
}

export default function StrategyConfigPage() {
  const { session } = useAuth();
  const [configs, setConfigs] = useState<StrategyConfig[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [msgErr, setMsgErr] = useState(false);
  const [loading, setLoading] = useState(true);

  const sortedConfigs = useMemo(() => {
    return [...configs].sort((a, b) => {
      const ai = strategyNames.indexOf(a.strategy_name as StrategyName);
      const bi = strategyNames.indexOf(b.strategy_name as StrategyName);
      if (ai === -1 && bi === -1) return a.strategy_name.localeCompare(b.strategy_name);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [configs]);

  const flash = useCallback((text: string, err = false) => {
    setMsg(text); setMsgErr(err);
    setTimeout(() => setMsg(''), 5000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('strategy_configs').select('*').order('strategy_name');
    if (error) {
      flash(`Load failed: ${error.message}`, true);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as StrategyConfig[];
    setConfigs(rows);
    const initEdits: Record<string, EditState> = {};
    rows.forEach((c) => { initEdits[c.strategy_name] = buildEditState(c); });
    setEdits(initEdits);
    setLoading(false);
  }, [flash]);

  useEffect(() => { void load(); }, [load]);

  async function save(name: string) {
    const e = edits[name];
    if (!e) return;
    const errors = validateStrategy(name, e);
    if (errors.length > 0) {
      flash(`${name} not saved: ${errors.join(' ')}`, true);
      return;
    }

    setSaving((p) => ({ ...p, [name]: true }));
    const { error } = await supabase
      .from('strategy_configs')
      .update({
        enabled: e.enabled,
        market_type: e.market_type,
        signal_style: e.signal_style,
        risk_mode: e.risk_mode,
        min_score: e.min_score,
        min_rr: e.min_rr,
        min_stop_distance_pct: e.min_stop_distance_pct,
        min_tp1_distance_pct: e.min_tp1_distance_pct,
        min_tp2_distance_pct: e.min_tp2_distance_pct,
        max_bars_in_trade: e.max_bars_in_trade,
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
        metadata: { strategy_name: name, min_score: e.min_score, min_rr: e.min_rr, enabled: e.enabled },
      });
      flash(`${name} saved. Only this strategy row was updated.`);
      await load();
    }
    setSaving((p) => ({ ...p, [name]: false }));
  }

  function restoreDefaults(name: string) {
    if (!isStrategyName(name)) return;
    const def = STRATEGY_DEFINITIONS[name];
    setEdits((p) => ({
      ...p,
      [name]: { ...p[name], ...def.defaultMeta, params: { ...def.defaultParams } },
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
    if (!Number.isFinite(val)) return;
    setEdits((p) => ({
      ...p,
      [name]: { ...p[name], params: { ...p[name].params, [key]: val } },
    }));
  }

  function renderNumberInput(label: string, helper: string, value: number, onChange: (value: number) => void, min?: number, max?: number, step = 0.01) {
    return (
      <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-800">
        <label className="block text-xs font-medium text-zinc-300 mb-1">{label}</label>
        <p className="text-[11px] leading-snug text-zinc-500 mb-2">{helper}</p>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(ev) => onChange(parseFloat(ev.target.value) || 0)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        />
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Strategy Config</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Tune real scanner/backtest parameters only. No provider, Telegram, or execution deployment is triggered by saving.</p>
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
      ) : sortedConfigs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500">
          No strategy configs found. Run migrations or scanner seeding first.
        </div>
      ) : (
        <div className="space-y-4 max-w-6xl">
          {sortedConfigs.map((cfg) => {
            const e = edits[cfg.strategy_name];
            if (!e) return null;
            const isOpen = expanded[cfg.strategy_name];
            const def = isStrategyName(cfg.strategy_name) ? STRATEGY_DEFINITIONS[cfg.strategy_name] : null;
            const fields = def?.params ?? [];
            const validationErrors = validateStrategy(cfg.strategy_name, e);

            return (
              <div key={cfg.strategy_name} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="w-8 h-8 rounded bg-blue-600/20 flex items-center justify-center shrink-0">
                    <Settings size={14} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {cfg.strategy_name}
                      <span className="text-[10px] uppercase tracking-wide rounded bg-zinc-800 px-2 py-0.5 text-zinc-400">{e.market_type}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{def?.description ?? 'Custom strategy config row.'}</div>
                    <div className="text-xs text-zinc-600 mt-1">
                      min_score={e.min_score} · min_rr={e.min_rr} · {e.signal_style} · {e.risk_mode} · {e.allowed_timeframes.join(', ') || 'no timeframes'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEdit(cfg.strategy_name, 'enabled', !e.enabled)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        e.enabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                      }`}
                    >
                      {e.enabled ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {e.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [cfg.strategy_name]: !p[cfg.strategy_name] }))}
                      className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${cfg.strategy_name}`}
                    >
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-zinc-800 px-4 sm:px-5 py-4 space-y-5 bg-zinc-900/50">
                    {def && (
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200">
                        <strong className="text-blue-100">Code truth:</strong> {def.codeNotes}
                      </div>
                    )}

                    {validationErrors.length > 0 && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300 flex gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <div>{validationErrors.join(' ')}</div>
                      </div>
                    )}

                    <section>
                      <div className="text-xs font-semibold text-zinc-400 mb-2">Quality Gates</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {renderNumberInput('Min Score', 'Minimum confidence score required before a signal can pass.', e.min_score, (v) => setEdit(cfg.strategy_name, 'min_score', v), 0, 100, 1)}
                        {renderNumberInput('Min R:R', 'Minimum reward-to-risk required by scanner/backtest gates.', e.min_rr, (v) => setEdit(cfg.strategy_name, 'min_rr', v), 1.01, 10, 0.1)}
                        {renderNumberInput('Max Bars in Trade', 'Outcome/backtest expiry horizon for this strategy style.', e.max_bars_in_trade, (v) => setEdit(cfg.strategy_name, 'max_bars_in_trade', v), 1, undefined, 1)}
                        {renderNumberInput('Min SL Distance %', 'Minimum stop distance guard after levels are calculated.', e.min_stop_distance_pct, (v) => setEdit(cfg.strategy_name, 'min_stop_distance_pct', v), 0.001, undefined, 0.01)}
                        {renderNumberInput('Min TP1 Distance %', 'Minimum first-target distance guard.', e.min_tp1_distance_pct, (v) => setEdit(cfg.strategy_name, 'min_tp1_distance_pct', v), 0.001, undefined, 0.01)}
                        {renderNumberInput('Min TP2 Distance %', 'Minimum second-target distance guard.', e.min_tp2_distance_pct, (v) => setEdit(cfg.strategy_name, 'min_tp2_distance_pct', v), 0.001, undefined, 0.01)}
                      </div>
                    </section>

                    <section>
                      <div className="text-xs font-semibold text-zinc-400 mb-2">Timeframes</div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {ALL_TIMEFRAMES.map((tf) => {
                          const unsupported = def ? !def.allowedTimeframes.includes(tf) : false;
                          return (
                            <button
                              key={tf}
                              onClick={() => toggleTf(cfg.strategy_name, tf)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                                e.allowed_timeframes.includes(tf)
                                  ? unsupported ? 'bg-amber-600/20 border-amber-500/40 text-amber-300' : 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                                  : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                              }`}
                            >
                              {tf}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-zinc-500">Allowed by current evaluator: {def?.allowedTimeframes.join(', ') ?? 'custom'}.</p>
                    </section>

                    <section>
                      <div className="text-xs font-semibold text-zinc-400 mb-2">Common Fields</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-800">
                          <label className="block text-xs font-medium text-zinc-300 mb-1">Strategy Name</label>
                          <p className="text-[11px] text-zinc-500 mb-2">Primary key; displayed only to avoid renaming production rows.</p>
                          <input value={cfg.strategy_name} disabled className="w-full bg-zinc-900/70 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-500" />
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-800">
                          <label className="block text-xs font-medium text-zinc-300 mb-1">Market Type</label>
                          <p className="text-[11px] text-zinc-500 mb-2">Scanner market bucket for this row.</p>
                          <select value={e.market_type} onChange={(ev) => setEdit(cfg.strategy_name, 'market_type', ev.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100">
                            <option value="crypto">crypto</option>
                            <option value="forex">forex</option>
                          </select>
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-800">
                          <label className="block text-xs font-medium text-zinc-300 mb-1">Signal Style</label>
                          <p className="text-[11px] text-zinc-500 mb-2">Used by scanner metadata and C3 risk guidance.</p>
                          <select value={e.signal_style} onChange={(ev) => setEdit(cfg.strategy_name, 'signal_style', ev.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100">
                            <option value="scalper">scalper</option>
                            <option value="swing">swing</option>
                            <option value="forex_signal">forex_signal</option>
                          </select>
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-800">
                          <label className="block text-xs font-medium text-zinc-300 mb-1">Risk Mode</label>
                          <p className="text-[11px] text-zinc-500 mb-2">Feeds C3 risk/leverage guidance as the risk profile.</p>
                          <select value={e.risk_mode} onChange={(ev) => setEdit(cfg.strategy_name, 'risk_mode', ev.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100">
                            <option value="conservative">conservative</option>
                            <option value="balanced">balanced</option>
                            <option value="aggressive">aggressive</option>
                          </select>
                        </div>
                      </div>
                    </section>

                    {FIELD_GROUPS.filter((group) => !['Quality Gates', 'Timeframes'].includes(group)).map((group) => {
                      const groupFields = fields.filter((field) => field.group === group);
                      if (groupFields.length === 0) return null;
                      return (
                        <section key={group}>
                          <div className="text-xs font-semibold text-zinc-400 mb-2">{group}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {groupFields.map((field) => (
                              <div key={field.key}>
                                {renderNumberInput(
                                  field.label,
                                  field.helper,
                                  e.params[field.key] ?? (def?.defaultParams[field.key] ?? 0),
                                  (v) => setParam(cfg.strategy_name, field.key, String(v)),
                                  field.min,
                                  field.max,
                                  field.step ?? 0.01,
                                )}
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })}

                    <details className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-zinc-400">Advanced JSON Preview</summary>
                      <pre className="mt-3 max-h-56 overflow-auto rounded bg-black/30 p-3 text-[11px] text-zinc-400">{JSON.stringify(e.params, null, 2)}</pre>
                    </details>

                    <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-zinc-800">
                      <button
                        onClick={() => save(cfg.strategy_name)}
                        disabled={saving[cfg.strategy_name] || validationErrors.length > 0}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        {saving[cfg.strategy_name]
                          ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Save size={13} />}
                        Save {cfg.strategy_name}
                      </button>
                      {def && (
                        <button
                          onClick={() => restoreDefaults(cfg.strategy_name)}
                          className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          <RotateCcw size={13} /> Restore coded defaults
                        </button>
                      )}
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
