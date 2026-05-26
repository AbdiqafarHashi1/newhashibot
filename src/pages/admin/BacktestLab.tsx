import { useEffect, useState, useRef, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Upload, Play, Trash2, CheckCircle, AlertTriangle, Clock,
  BarChart2, RefreshCw, ChevronDown, ChevronUp, Info
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReplayDataset {
  id: string;
  name: string;
  symbol: string;
  market_type: string;
  timeframe: string;
  file_name: string;
  row_count: number;
  created_at: string;
}

interface ReplayRun {
  id: string;
  dataset_id: string;
  mode_slug: string;
  strategy_names: string[];
  status: 'draft' | 'running' | 'completed' | 'failed' | 'cancelled';
  candles_processed: number;
  evaluations_count: number;
  candidates_count: number;
  rejected_count: number;
  signals_created: number;
  simulated_trades_count: number;
  result_summary: Record<string, unknown> | null;
  error_message: string;
  created_at: string;
  updated_at: string;
}

interface ReplaySignalView {
  id: string;
  symbol: string;
  timeframe: string;
  strategy_name: string;
  direction: string;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  grade: string;
  confidence_score: number;
  created_at_candle_time: string | null;
  status: string;
  pnl_r: number | null;
  reason: string;
}

interface ParsedCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { candles: ParsedCandle[]; error: string | null } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { candles: [], error: 'CSV must have at least a header row and one data row' };

  const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/['"]/g, ''));

  const timeColName = ['time', 'open_time', 'datetime', 'date', 'timestamp'].find(c => header.includes(c));
  const openCol = header.indexOf('open');
  const highCol = header.indexOf('high');
  const lowCol = header.indexOf('low');
  const closeCol = header.indexOf('close');
  const volCol = header.indexOf('volume');

  if (!timeColName) return { candles: [], error: 'CSV must have a time/open_time/datetime column' };
  if (openCol < 0 || highCol < 0 || lowCol < 0 || closeCol < 0) {
    return { candles: [], error: 'CSV must have open, high, low, close columns' };
  }

  const timeIdx = header.indexOf(timeColName);
  const candles: ParsedCandle[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 4) continue;
    const rawTime = cols[timeIdx] ?? '';
    const d = new Date(rawTime);
    if (isNaN(d.getTime())) {
      errors.push(`Row ${i + 1}: invalid time "${rawTime}"`);
      if (errors.length >= 3) break;
      continue;
    }
    const open = parseFloat(cols[openCol]);
    const high = parseFloat(cols[highCol]);
    const low = parseFloat(cols[lowCol]);
    const close = parseFloat(cols[closeCol]);
    if ([open, high, low, close].some(isNaN)) {
      errors.push(`Row ${i + 1}: non-numeric OHLC`);
      if (errors.length >= 3) break;
      continue;
    }
    candles.push({
      time: d.toISOString(), open, high, low, close,
      volume: volCol >= 0 ? parseFloat(cols[volCol] ?? '0') || 0 : 0,
    });
  }

  if (errors.length > 0) return { candles: [], error: errors.join('; ') };
  if (candles.length < 60) return { candles: [], error: `Need at least 60 candles for strategy evaluation. Parsed: ${candles.length}` };
  return { candles, error: null };
}

// ── In-browser replay engine ──────────────────────────────────────────────────

interface CandleForReplay { open: number; high: number; low: number; close: number; volume: number; time: string; }

function calcEMA(values: number[], period: number): number {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function calcATR(candles: CandleForReplay[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high: h, low: l } = candles[i];
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 2) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  if (gains + losses === 0) return 50;
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

interface SignalDraft {
  index: number; candle_time: string;
  strategy: string; direction: string;
  entry_low: number; entry_high: number;
  stop_loss: number; tp1: number; tp2: number;
  grade: string; score: number; reason: string;
  status: string; outcome_index: number | null; pnl_r: number | null;
}

interface ReplayEngineResult {
  signals: SignalDraft[];
  evaluations: number;
  candidates: number;
  rejected: number;
}

function runReplayEngine(
  candles: CandleForReplay[],
  strategy: string,
  timeframe: string,
): ReplayEngineResult {
  const signals: SignalDraft[] = [];
  let evaluations = 0, candidates = 0, rejected = 0;
  const MIN_WINDOW = 60;

  for (let i = MIN_WINDOW; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const closes = window.map(c => c.close);
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const atr = calcATR(window, 14);
    const rsi = calcRSI(closes, 14);
    const last = window[window.length - 1];
    const prev = window[window.length - 2];
    const price = last.close;
    const body_size = Math.abs(last.close - last.open);
    const atr_pct = price > 0 ? (atr / price) * 100 : 0;

    const olderCandles = window.slice(-50, -20);
    const olderHigh = olderCandles.length > 0 ? Math.max(...olderCandles.map(c => c.high)) : Math.max(...window.map(c => c.high).slice(-20));
    const olderLow = olderCandles.length > 0 ? Math.min(...olderCandles.map(c => c.low)) : Math.min(...window.map(c => c.low).slice(-20));
    const recentHigh = Math.max(...window.map(c => c.high).slice(-20));
    const recentLow = Math.min(...window.map(c => c.low).slice(-20));
    const olderRange = olderHigh - olderLow;
    const rcr = olderRange > 0 ? (recentHigh - recentLow) / olderRange : 1;

    let regime = 'unclear';
    if (ema20 > ema50 * 1.002 && rsi > 52) regime = 'trend_up';
    else if (ema20 < ema50 * 0.998 && rsi < 48) regime = 'trend_down';
    else if (rcr < 0.55) regime = 'compression';
    else if (atr_pct > 2.0) regime = 'expansion';
    else if (rsi > 45 && rsi < 55) regime = 'ranging';

    const mom3 = window.slice(-4);
    let up = 0, dn = 0;
    for (let j = 1; j < mom3.length; j++) {
      if (mom3[j].close > mom3[j - 1].close) up++;
      else if (mom3[j].close < mom3[j - 1].close) dn++;
    }
    const momentumScore = (up - dn) / 3;

    let sig: SignalDraft | null = null;

    if (strategy === 'MicroScalper' && ['5m', '15m'].includes(timeframe)) {
      evaluations++;
      if (atr_pct >= 0.05 && atr_pct <= 3.0 && atr > 0 && body_size / atr >= 0.25) {
        let score = 50;
        let direction: 'buy' | 'sell' | null = null;
        if (ema20 > ema50 && rsi >= 52 && price > ema20) {
          direction = 'buy';
          score += 15;
          if (regime === 'trend_up') score += 10;
          if (momentumScore > 0.2) score += 8; else { rejected++; continue; }
          if (rsi >= 58) score += 8; else score += 3;
          if (prev.close < ema20 && price > ema20) score += 7;
          if (last.close > last.open) score += 5; else score -= 3;
        } else if (ema20 < ema50 && rsi <= 48 && price < ema20) {
          direction = 'sell';
          score += 15;
          if (regime === 'trend_down') score += 10;
          if (momentumScore < -0.2) score += 8; else { rejected++; continue; }
          if (rsi <= 42) score += 8; else score += 3;
          if (prev.close > ema20 && price < ema20) score += 7;
          if (last.close < last.open) score += 5; else score -= 3;
        } else { rejected++; continue; }

        if (score >= 75) {
          candidates++;
          const stop_loss = direction === 'buy' ? price - atr * 1.2 : price + atr * 1.2;
          const tp1 = direction === 'buy' ? price + atr * 0.9 : price - atr * 0.9;
          const tp2 = direction === 'buy' ? price + atr * 1.5 : price - atr * 1.5;
          const risk = Math.abs(price - stop_loss);
          if (risk > 0 && Math.abs(tp2 - price) / risk >= 1.2) {
            const grade = score >= 85 ? 'A+' : score >= 75 ? 'A' : 'B';
            sig = { index: i, candle_time: last.time, strategy: 'MicroScalper', direction, entry_low: price * 0.9998, entry_high: price * 1.0002, stop_loss, tp1, tp2, grade, score, reason: `MicroScalper ${direction}: score=${score}`, status: 'waiting', outcome_index: null, pnl_r: null };
          } else { rejected++; }
        } else { rejected++; }
      } else { rejected++; }
    } else if (strategy === 'CompressionBreakout' && ['15m', '1h'].includes(timeframe)) {
      evaluations++;
      const boxLookback = 32;
      if (window.length >= boxLookback + 5) {
        const boxCandles = window.slice(-(boxLookback + 1), -1);
        const boxHigh = Math.max(...boxCandles.map(c => c.high));
        const boxLow = Math.min(...boxCandles.map(c => c.low));
        const boxRange = boxHigh - boxLow;
        if (atr > 0 && boxRange <= atr * 2.0) {
          const barsInside = boxCandles.filter(c => c.high <= boxHigh * 1.001 && c.low >= boxLow * 0.999).length;
          if (barsInside >= 14) {
            const buffer = atr * 0.10;
            const breakoutUp = last.close > boxHigh + buffer && last.close > last.open;
            const breakoutDn = last.close < boxLow - buffer && last.close < last.open;
            if (breakoutUp || breakoutDn) {
              const hist = window.slice(-49, -1);
              const avgRange = hist.reduce((s, c) => s + (c.high - c.low), 0) / (hist.length || 1);
              const expansion = avgRange > 0 ? (last.high - last.low) / avgRange : 1;
              if (expansion >= 1.05) {
                const direction: 'buy' | 'sell' = breakoutUp ? 'buy' : 'sell';
                let score = 50;
                const cq = barsInside / boxLookback;
                if (cq > 0.8) score += 12; else if (cq > 0.6) score += 7; else score += 2;
                if (expansion > 2.0) score += 12; else if (expansion > 1.5) score += 8; else score += 4;
                if (direction === 'buy' && rsi > 55) score += 6;
                else if (direction === 'sell' && rsi < 45) score += 6;
                if (score >= 78) {
                  candidates++;
                  const stop_loss = direction === 'buy' ? boxLow - atr * 1.2 : boxHigh + atr * 1.2;
                  const tp1 = direction === 'buy' ? price + atr * 1.2 : price - atr * 1.2;
                  const tp2 = direction === 'buy' ? price + atr * 2.5 : price - atr * 2.5;
                  const risk = Math.abs(price - stop_loss);
                  if (risk > 0 && Math.abs(tp2 - price) / risk >= 1.5) {
                    const grade = score >= 85 ? 'A+' : score >= 78 ? 'A' : 'B';
                    sig = { index: i, candle_time: last.time, strategy: 'CompressionBreakout', direction, entry_low: direction === 'buy' ? boxHigh : boxLow - atr * 0.3, entry_high: direction === 'buy' ? boxHigh + atr * 0.3 : boxLow, stop_loss, tp1, tp2, grade, score, reason: `CompressionBreakout ${direction}: comp=${cq.toFixed(2)}, exp=${expansion.toFixed(2)}x`, status: 'waiting', outcome_index: null, pnl_r: null };
                  } else { rejected++; }
                } else { rejected++; }
              } else { rejected++; }
            } else { rejected++; }
          } else { rejected++; }
        } else { rejected++; }
      } else { rejected++; }
    }

    if (sig) {
      // Simulate outcome
      const maxBars = 50;
      const entryPrice = (sig.entry_low + sig.entry_high) / 2;
      const risk = Math.abs(entryPrice - sig.stop_loss);
      let outcome = 'expired';
      let outcome_index: number | null = null;
      let pnl_r: number | null = null;

      for (let j = i + 1; j < Math.min(i + maxBars, candles.length); j++) {
        const c = candles[j];
        if (sig.direction === 'buy') {
          if (c.low <= sig.stop_loss) { outcome = 'sl_hit'; outcome_index = j; pnl_r = -1; break; }
          if (c.high >= sig.tp2) { outcome = 'tp2_hit'; outcome_index = j; pnl_r = risk > 0 ? (sig.tp2 - entryPrice) / risk : 0; break; }
          if (c.high >= sig.tp1) { outcome = 'tp1_hit'; outcome_index = j; pnl_r = risk > 0 ? (sig.tp1 - entryPrice) / risk : 0; break; }
        } else {
          if (c.high >= sig.stop_loss) { outcome = 'sl_hit'; outcome_index = j; pnl_r = -1; break; }
          if (c.low <= sig.tp2) { outcome = 'tp2_hit'; outcome_index = j; pnl_r = risk > 0 ? (entryPrice - sig.tp2) / risk : 0; break; }
          if (c.low <= sig.tp1) { outcome = 'tp1_hit'; outcome_index = j; pnl_r = risk > 0 ? (entryPrice - sig.tp1) / risk : 0; break; }
        }
      }
      sig.status = outcome;
      sig.outcome_index = outcome_index;
      sig.pnl_r = pnl_r;
      signals.push(sig);
    }
  }

  return { signals, evaluations, candidates, rejected };
}

// ── Colours ───────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  tp2_hit: 'text-emerald-400', tp1_hit: 'text-green-400',
  sl_hit: 'text-red-400', expired: 'text-zinc-500',
  waiting: 'text-blue-400', cancelled: 'text-zinc-600',
};
const GRADE_COLORS: Record<string, string> = { 'A+': 'text-emerald-400', A: 'text-blue-400', B: 'text-yellow-400' };

// ── Component ─────────────────────────────────────────────────────────────────
export default function BacktestLab() {
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [datasets, setDatasets] = useState<ReplayDataset[]>([]);
  const [runs, setRuns] = useState<ReplayRun[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [selectedStrategy, setSelectedStrategy] = useState('MicroScalper');
  const [selectedMode, setSelectedMode] = useState('signal_mode');
  const [selectedTimeframe, setSelectedTimeframe] = useState('15m');
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [activeRun, setActiveRun] = useState<ReplayRun | null>(null);
  const [runSignals, setRunSignals] = useState<ReplaySignalView[]>([]);
  const [showSignals, setShowSignals] = useState(false);
  const [parsedCandles, setParsedCandles] = useState<ParsedCandle[] | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvSymbol, setCsvSymbol] = useState('');
  const [csvMarketType, setCsvMarketType] = useState('crypto');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, r] = await Promise.all([
      supabase.from('replay_datasets').select('*').order('created_at', { ascending: false }),
      supabase.from('replay_runs').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    setDatasets((d.data ?? []) as ReplayDataset[]);
    setRuns((r.data ?? []) as ReplayRun[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setUploadStatus(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { candles, error } = parseCSV(text);
      if (error) { setUploadStatus({ ok: false, msg: error }); setParsedCandles(null); }
      else { setUploadStatus({ ok: true, msg: `Valid CSV — ${candles.length} candles parsed. Fill in symbol and save.` }); setParsedCandles(candles); }
    };
    reader.readAsText(file);
  }

  async function saveDataset() {
    if (!parsedCandles || !csvSymbol) { setUploadStatus({ ok: false, msg: 'Enter symbol name before saving' }); return; }
    const { data, error } = await supabase.from('replay_datasets').insert({
      name: `${csvSymbol.toUpperCase()} ${selectedTimeframe} — ${csvFileName}`,
      symbol: csvSymbol.toUpperCase(), market_type: csvMarketType,
      timeframe: selectedTimeframe, source: 'csv_upload',
      file_name: csvFileName, row_count: parsedCandles.length, uploaded_by: profile?.id,
    }).select().maybeSingle();
    if (error) { setUploadStatus({ ok: false, msg: `Save failed: ${error.message}` }); }
    else if (data) {
      setUploadStatus({ ok: true, msg: `Dataset saved: ${(data as ReplayDataset).name}` });
      setSelectedDataset(data.id); await load();
    }
  }

  async function runReplayForDataset() {
    if (!selectedDataset || !parsedCandles) { setUploadStatus({ ok: false, msg: 'Upload a CSV first' }); return; }
    const dataset = datasets.find(d => d.id === selectedDataset);
    const symbol = dataset?.symbol ?? csvSymbol ?? 'UNKNOWN';
    const timeframe = dataset?.timeframe ?? selectedTimeframe;

    setRunning(true); setRunProgress(0); setActiveRun(null); setRunSignals([]);

    const { data: runData } = await supabase.from('replay_runs').insert({
      dataset_id: selectedDataset, mode_slug: selectedMode,
      strategy_names: [selectedStrategy], status: 'running', candles_processed: 0,
    }).select().maybeSingle();
    if (!runData) { setRunning(false); return; }
    const runId = (runData as ReplayRun).id;

    const candlesForReplay: CandleForReplay[] = parsedCandles.map(c => ({
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, time: c.time,
    }));

    const progressInterval = setInterval(() => setRunProgress(p => Math.min(p + 4, 88)), 80);
    const result = runReplayEngine(candlesForReplay, selectedStrategy, timeframe);
    clearInterval(progressInterval);
    setRunProgress(95);

    if (result.signals.length > 0) {
      await supabase.from('replay_signals').insert(result.signals.map(s => ({
        replay_run_id: runId, symbol, timeframe, strategy_name: s.strategy,
        direction: s.direction, entry_low: s.entry_low, entry_high: s.entry_high,
        stop_loss: s.stop_loss, tp1: s.tp1, tp2: s.tp2,
        grade: s.grade, confidence_score: s.score, created_at_index: s.index,
        created_at_candle_time: s.candle_time, status: s.status,
        outcome_index: s.outcome_index,
        outcome_candle_time: s.outcome_index !== null ? (candlesForReplay[s.outcome_index]?.time ?? null) : null,
        pnl_r: s.pnl_r, reason: s.reason,
      })));
    }

    const wins = result.signals.filter(s => s.status === 'tp1_hit' || s.status === 'tp2_hit').length;
    const losses = result.signals.filter(s => s.status === 'sl_hit').length;
    const totalR = result.signals.reduce((sum, s) => sum + (s.pnl_r ?? 0), 0);
    const summary = {
      candles_processed: candlesForReplay.length, evaluations: result.evaluations,
      candidates: result.candidates, rejected: result.rejected,
      signals_created: result.signals.length, wins, losses,
      win_rate_pct: result.signals.length > 0 ? parseFloat(((wins / result.signals.length) * 100).toFixed(1)) : 0,
      tp1_hits: result.signals.filter(s => s.status === 'tp1_hit').length,
      tp2_hits: result.signals.filter(s => s.status === 'tp2_hit').length,
      sl_hits: result.signals.filter(s => s.status === 'sl_hit').length,
      expired_count: result.signals.filter(s => s.status === 'expired').length,
      total_r: parseFloat(totalR.toFixed(2)),
      avg_r_per_trade: result.signals.length > 0 ? parseFloat((totalR / result.signals.length).toFixed(2)) : 0,
    };

    await supabase.from('replay_runs').update({
      status: 'completed', candles_processed: candlesForReplay.length,
      evaluations_count: result.evaluations, candidates_count: result.candidates,
      rejected_count: result.rejected, signals_created: result.signals.length,
      result_summary: summary, updated_at: new Date().toISOString(),
    }).eq('id', runId);

    setRunProgress(100);
    setRunSignals(result.signals.map((s, idx) => ({
      id: String(idx), symbol, timeframe, strategy_name: s.strategy,
      direction: s.direction, entry_low: s.entry_low, entry_high: s.entry_high,
      stop_loss: s.stop_loss, tp1: s.tp1, tp2: s.tp2,
      grade: s.grade, confidence_score: s.score,
      created_at_candle_time: s.candle_time,
      status: s.status, pnl_r: s.pnl_r, reason: s.reason,
    })));

    await load();
    const { data: freshRun } = await supabase.from('replay_runs').select('*').eq('id', runId).maybeSingle();
    if (freshRun) setActiveRun(freshRun as ReplayRun);
    setRunning(false); setShowSignals(true);
  }

  async function deleteDataset(id: string) {
    setDeleting(id);
    await supabase.from('replay_datasets').delete().eq('id', id);
    await load();
    if (selectedDataset === id) setSelectedDataset('');
    setDeleting(null);
  }

  const summary = activeRun?.result_summary as Record<string, unknown> | null;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Replay / Testnet Lab</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Upload historical candle CSVs and replay strategies to test signal generation logic</p>
      </div>

      <div className="bg-blue-500/8 border border-blue-500/15 rounded-xl p-4 flex gap-3 mb-6">
        <Info size={15} className="text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-zinc-400 leading-relaxed">
          <strong className="text-zinc-200">Replay/Testnet uses uploaded historical candles.</strong>{' '}
          No broker trades, no live data, no Binance connection. Results labeled{' '}
          <strong className="text-yellow-400">REPLAY DATA</strong>. The replay engine runs the same strategy logic as the live scanner.
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Upload */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <Upload size={14} className="text-zinc-500" /> Upload CSV Dataset
          </div>
          <div className="px-5 py-4 space-y-4">
            <p className="text-xs text-zinc-500">
              Required: <code className="bg-zinc-800 px-1 rounded">time</code> · <code className="bg-zinc-800 px-1 rounded">open</code> · <code className="bg-zinc-800 px-1 rounded">high</code> · <code className="bg-zinc-800 px-1 rounded">low</code> · <code className="bg-zinc-800 px-1 rounded">close</code>. Optional: volume. Min 60 rows.
            </p>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileSelect} />
            <button onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2.5 rounded-lg text-sm transition-colors">
              <Upload size={13} />{csvFileName || 'Choose CSV File'}
            </button>

            {parsedCandles && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Symbol</label>
                    <input type="text" placeholder="e.g. BTCUSDT" value={csvSymbol}
                      onChange={e => setCsvSymbol(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Market Type</label>
                    <select value={csvMarketType} onChange={e => setCsvMarketType(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                      <option value="crypto">Crypto</option>
                      <option value="forex">Forex</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Timeframe</label>
                  <select value={selectedTimeframe} onChange={e => setSelectedTimeframe(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    {['5m', '15m', '1h', '4h'].map(tf => <option key={tf} value={tf}>{tf}</option>)}
                  </select>
                </div>
                <button onClick={saveDataset}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                  <CheckCircle size={13} /> Save Dataset ({parsedCandles.length} candles)
                </button>
              </div>
            )}
            {uploadStatus && (
              <div className={`px-3 py-2.5 rounded-lg text-xs border ${uploadStatus.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                {uploadStatus.msg}
              </div>
            )}
          </div>
        </div>

        {/* Run config */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <Play size={14} className="text-zinc-500" /> Configure &amp; Run Replay
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Dataset</label>
              <select value={selectedDataset} onChange={e => setSelectedDataset(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="">— Select dataset —</option>
                {datasets.map(d => <option key={d.id} value={d.id}>{d.name} ({d.row_count} candles)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Strategy</label>
                <select value={selectedStrategy} onChange={e => setSelectedStrategy(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="MicroScalper">MicroScalper</option>
                  <option value="CompressionBreakout">CompressionBreakout</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Mode</label>
                <select value={selectedMode} onChange={e => setSelectedMode(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="signal_mode">Signal Mode</option>
                  <option value="personal_mode">Personal Mode</option>
                  <option value="prop_mode">Prop Mode</option>
                </select>
              </div>
            </div>
            {!parsedCandles && selectedDataset && (
              <div className="bg-yellow-500/8 border border-yellow-500/15 rounded-lg px-3 py-2.5 text-xs text-yellow-400">
                Re-upload the CSV file to run a new replay for this dataset.
              </div>
            )}
            {running && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Running replay...</span>
                  <span>{runProgress}%</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${runProgress}%` }} />
                </div>
              </div>
            )}
            <button onClick={runReplayForDataset} disabled={running || !selectedDataset || !parsedCandles}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
              {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
              {running ? 'Running Replay...' : 'Run Replay'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {activeRun && summary && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
            <BarChart2 size={14} className="text-zinc-500" />
            Replay Results
            <span className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 px-1.5 py-0.5 rounded ml-2">REPLAY DATA</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-zinc-800">
            {[
              { label: 'Candles Processed', value: String(summary.candles_processed ?? 0) },
              { label: 'Evaluations', value: String(summary.evaluations ?? 0) },
              { label: 'Signals Created', value: String(summary.signals_created ?? 0) },
              { label: 'Win Rate', value: (summary.signals_created && Number(summary.signals_created) > 0) ? `${summary.win_rate_pct}%` : 'N/A' },
              { label: 'TP1 Hits', value: String(summary.tp1_hits ?? 0) },
              { label: 'TP2 Hits', value: String(summary.tp2_hits ?? 0) },
              { label: 'SL Hits', value: String(summary.sl_hits ?? 0) },
              { label: 'Expired', value: String(summary.expired_count ?? 0) },
              { label: 'Total R', value: (summary.signals_created && Number(summary.signals_created) > 0) ? `${Number(summary.total_r) > 0 ? '+' : ''}${Number(summary.total_r).toFixed(2)}R` : 'N/A' },
              { label: 'Avg R/Trade', value: (summary.signals_created && Number(summary.signals_created) > 0) ? `${Number(summary.avg_r_per_trade) > 0 ? '+' : ''}${Number(summary.avg_r_per_trade).toFixed(2)}R` : 'N/A' },
              { label: 'Candidates', value: String(summary.candidates ?? 0) },
              { label: 'Rejected', value: String(summary.rejected ?? 0) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-900 px-4 py-3">
                <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
                <div className="text-sm font-medium text-zinc-200">{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signals table */}
      {runSignals.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Replay Signals ({runSignals.length})</div>
            <button onClick={() => setShowSignals(s => !s)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              {showSignals ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showSignals ? 'Hide' : 'Show'}
            </button>
          </div>
          {showSignals && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    {['Candle Time', 'Strategy', 'Dir', 'Grade', 'Score', 'Outcome', 'PnL (R)'].map(h => (
                      <th key={h} className="text-left px-4 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runSignals.slice(0, 100).map((s, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="px-4 py-2 text-zinc-400">{s.created_at_candle_time ? new Date(s.created_at_candle_time).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 text-zinc-300">{s.strategy_name}</td>
                      <td className="px-4 py-2"><span className={s.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'}>{s.direction?.toUpperCase()}</span></td>
                      <td className={`px-4 py-2 font-medium ${GRADE_COLORS[s.grade] ?? 'text-zinc-400'}`}>{s.grade}</td>
                      <td className="px-4 py-2 text-zinc-300">{s.confidence_score}</td>
                      <td className={`px-4 py-2 font-medium ${STATUS_COLORS[s.status] ?? 'text-zinc-400'}`}>{s.status}</td>
                      <td className={`px-4 py-2 font-medium ${s.pnl_r !== null && s.pnl_r > 0 ? 'text-emerald-400' : s.pnl_r !== null && s.pnl_r < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                        {s.pnl_r !== null ? `${s.pnl_r > 0 ? '+' : ''}${s.pnl_r.toFixed(2)}R` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {runSignals.length > 100 && (
                <div className="px-4 py-2 text-xs text-zinc-600 border-t border-zinc-800">Showing 100 of {runSignals.length} signals</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Saved datasets */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
        <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold">Saved Datasets</div>
        {datasets.length === 0 ? (
          <div className="px-5 py-6 text-sm text-zinc-600 text-center">No datasets yet. Upload a CSV above.</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {datasets.map(d => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div>
                  <div className="text-sm font-medium text-zinc-200">{d.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{d.symbol} · {d.market_type} · {d.timeframe} · {d.row_count.toLocaleString()} rows · {new Date(d.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setSelectedDataset(d.id)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selectedDataset === d.id ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>
                    {selectedDataset === d.id ? 'Selected' : 'Select'}
                  </button>
                  <button onClick={() => deleteDataset(d.id)} disabled={deleting === d.id}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-600 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50">
                    {deleting === d.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Run history */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold flex items-center gap-2">
          <Clock size={14} className="text-zinc-500" /> Replay Run History
        </div>
        {runs.length === 0 ? (
          <div className="px-5 py-6 text-sm text-zinc-600 text-center">No replay runs yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                {['Date', 'Strategy', 'Mode', 'Status', 'Candles', 'Signals', 'Total R'].map(h => (
                  <th key={h} className="text-left px-5 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map(r => {
                const rs = r.result_summary as Record<string, unknown> | null;
                return (
                  <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                    onClick={() => { setActiveRun(r); setShowSignals(false); }}>
                    <td className="px-5 py-2.5 text-zinc-400">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-2.5 text-zinc-300">{(r.strategy_names ?? []).join(', ')}</td>
                    <td className="px-5 py-2.5 text-zinc-400">{r.mode_slug}</td>
                    <td className={`px-5 py-2.5 font-medium ${r.status === 'completed' ? 'text-emerald-400' : r.status === 'failed' ? 'text-red-400' : r.status === 'running' ? 'text-blue-400' : 'text-zinc-500'}`}>{r.status}</td>
                    <td className="px-5 py-2.5 text-zinc-300">{r.candles_processed}</td>
                    <td className="px-5 py-2.5 text-zinc-300">{r.signals_created}</td>
                    <td className="px-5 py-2.5">
                      {rs?.total_r != null ? (
                        <span className={Number(rs.total_r) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {Number(rs.total_r) > 0 ? '+' : ''}{Number(rs.total_r).toFixed(2)}R
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={13} className="text-yellow-400 mt-0.5 shrink-0" />
          <div className="text-xs text-zinc-500 space-y-1">
            <div className="font-medium text-zinc-400">Codex TODO: Replay enhancements</div>
            <div>Current: in-browser replay runs exact strategy logic. Future: server-side edge function for large datasets (&gt;10k candles), multi-strategy runs, equity curve chart, per-strategy breakdown, CSV export.</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
