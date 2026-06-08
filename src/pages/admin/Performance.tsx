import { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { gradeBadge, directionBadge } from '../../components/ui/Badge';
import { RefreshCw, TrendingUp, TrendingDown, Minus, BarChart2, AlertTriangle } from 'lucide-react';
import { DEFAULT_CAPITAL_ASSUMPTIONS, estimateCapitalFromR, formatMoney, formatPct, validCapitalAssumptions, CapitalAssumptions } from '../../lib/capitalAnalytics';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SignalAnalyticsRow {
  signal_id: string;
  strategy_name: string | null;
  symbol: string;
  timeframe: string;
  direction: string;
  grade: string;
  market_type: string;
  data_source: string | null;
  current_status: string;
  outcome_category: string;
  r_result: number | null;
  close_price: number | null;
  closed_at: string | null;
  duration_minutes: number | null;
  created_at: string;
  entry_price: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
}

interface Filters {
  market: string;
  strategy: string;
  symbol: string;
  timeframe: string;
  direction: string;
  grade: string;
  outcome: string;
  datePreset: DatePreset;
  customStart: string;
  customEnd: string;
}

interface ResetCountRow {
  table_name: string;
  deleted_count: number;
  status?: string;
}

type ResetRemainingCounts = Record<string, number>;

type ResetResponse = {
  completed_at?: string;
  timestamp?: string;
  success?: boolean;
  has_more?: boolean;
  deleted_counts?: Record<string, { deleted_count?: number; status?: string } | number | string>;
  remaining_counts?: ResetRemainingCounts;
};

type DatePreset = 'today' | 'last24h' | 'last7d' | 'last30d' | 'baseline' | 'custom';

type MetricSummary = {
  totalSignals: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  expired: number;
  tp1Hits: number;
  tp2Hits: number;
  slHits: number;
  winRatePct: number | null;
  profitFactor: number | null;
  totalR: number | null;
  avgR: number | null;
  bestR: number | null;
  worstR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  lastSignalTime: string | null;
};

type BreakdownRow = MetricSummary & {
  key: string;
  label: string;
  rows: SignalAnalyticsRow[];
  market?: string;
  mostUsedStrategy?: string | null;
};

interface StrategyConfigRow {
  strategy_name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESET_CONFIRMATION_TEXT = 'RESET PERFORMANCE HISTORY';
const BASELINE_STORAGE_KEY = 'hashibot.adminPerformance.baselineStartedAt';
const CAPITAL_STORAGE_KEY = 'hashibot.adminPerformance.capitalAssumptions';
const REQUIRED_STRATEGIES = [
  'MicroScalper',
  'CompressionBreakout',
  'SwingContinuation',
  'ForexMicroScalper',
  'ForexSwingContinuation',
];

const OUTCOME_COLORS: Record<string, string> = {
  WIN: 'text-emerald-400',
  LOSS: 'text-red-400',
  EXPIRED: 'text-zinc-500',
  OPEN: 'text-blue-400',
  CANCELLED: 'text-zinc-600',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────



function resetRowsFromResponse(data: unknown): ResetCountRow[] {
  const payload = (data ?? {}) as ResetResponse;
  const counts = payload.deleted_counts ?? {};
  return Object.entries(counts).map(([table_name, value]) => {
    if (typeof value === 'number') return { table_name, deleted_count: value, status: 'deleted' };
    if (typeof value === 'string') return { table_name, deleted_count: 0, status: value };
    return { table_name, deleted_count: Number(value?.deleted_count ?? 0), status: value?.status };
  });
}

function mergeResetRows(existing: ResetCountRow[], next: ResetCountRow[]) {
  const merged = new Map<string, ResetCountRow>();
  [...existing, ...next].forEach(row => {
    const current = merged.get(row.table_name);
    merged.set(row.table_name, {
      table_name: row.table_name,
      deleted_count: (current?.deleted_count ?? 0) + row.deleted_count,
      status: row.status ?? current?.status,
    });
  });
  return Array.from(merged.values());
}

function normalizeResetBatch(data: unknown, rows: ResetCountRow[]): { rows: ResetCountRow[]; timestamp: string; remainingCounts: ResetRemainingCounts; hasMore: boolean } {
  const payload = (data ?? {}) as ResetResponse;
  return {
    rows,
    timestamp: payload.completed_at ?? payload.timestamp ?? new Date().toISOString(),
    remainingCounts: payload.remaining_counts ?? {},
    hasMore: Boolean(payload.has_more || payload.success === false),
  };
}

function getStoredCapitalAssumptions(): CapitalAssumptions {
  if (typeof window === 'undefined') return DEFAULT_CAPITAL_ASSUMPTIONS;
  try {
    const raw = window.localStorage.getItem(CAPITAL_STORAGE_KEY);
    if (!raw) return DEFAULT_CAPITAL_ASSUMPTIONS;
    const parsed = JSON.parse(raw) as Partial<CapitalAssumptions>;
    return validCapitalAssumptions({
      startingCapital: Number(parsed.startingCapital),
      riskPct: Number(parsed.riskPct),
    });
  } catch {
    return DEFAULT_CAPITAL_ASSUMPTIONS;
  }
}

function rValuesByCreatedAt(rows: SignalAnalyticsRow[]) {
  return [...rows]
    .filter(row => row.r_result !== null && row.r_result !== undefined && !Number.isNaN(Number(row.r_result)))
    .sort((a, b) => new Date(a.closed_at ?? a.created_at).getTime() - new Date(b.closed_at ?? b.created_at).getTime())
    .map(row => Number(row.r_result));
}

function capitalForRows(rows: SignalAnalyticsRow[], assumptions: CapitalAssumptions) {
  return estimateCapitalFromR(rValuesByCreatedAt(rows), assumptions);
}

function CapitalText({ estimate }: { estimate: ReturnType<typeof estimateCapitalFromR> }) {
  const color = (estimate.estimatedPnl ?? 0) > 0 ? 'text-emerald-400' : (estimate.estimatedPnl ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400';
  if (estimate.estimatedPnl === null) return <span className="text-zinc-500">—</span>;
  return <span className={color}>{formatPct(estimate.totalReturnPct, true)} / {formatMoney(estimate.estimatedPnl)}</span>;
}

function getStoredBaselineTimestamp() {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(BASELINE_STORAGE_KEY);
  return stored && !Number.isNaN(new Date(stored).getTime()) ? stored : null;
}

function initialFilters(): Filters {
  const baselineStartedAt = getStoredBaselineTimestamp();
  return {
    market: 'crypto',
    strategy: '',
    symbol: '',
    timeframe: '',
    direction: '',
    grade: '',
    outcome: '',
    datePreset: baselineStartedAt ? 'baseline' : 'last30d',
    customStart: '',
    customEnd: '',
  };
}

function fmtR(n: number | null | undefined, empty = '—') {
  if (n === null || n === undefined || Number.isNaN(n)) return <span className="text-zinc-500">{empty}</span>;
  const color = n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-400';
  return <span className={color}>{n > 0 ? '+' : ''}{n.toFixed(2)}R</span>;
}

function fmtSignalR(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return <span className="text-zinc-500">open</span>;
  return fmtR(n);
}

function fmtPF(pf: number | null | undefined) {
  if (pf === null || pf === undefined || Number.isNaN(pf)) return <span className="text-zinc-500">—</span>;
  const color = pf >= 1.5 ? 'text-emerald-400' : pf >= 1 ? 'text-yellow-400' : 'text-red-400';
  return <span className={color}>{pf.toFixed(2)}</span>;
}

function fmtWinRate(wr: number | null | undefined) {
  if (wr === null || wr === undefined || Number.isNaN(wr)) return <span className="text-zinc-500">—</span>;
  const color = wr >= 60 ? 'text-emerald-400' : wr >= 40 ? 'text-yellow-400' : 'text-red-400';
  return <span className={color}>{wr.toFixed(1)}%</span>;
}

function fmtDuration(mins: number | null | undefined) {
  if (mins === null || mins === undefined) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / 1440).toFixed(1)}d`;
}

function forexDecimals(symbol: string) {
  return symbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase().endsWith('JPY') ? 3 : 5;
}

function fmtPrice(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return n >= 100 ? n.toFixed(2) : n.toFixed(5);
}

function fmtMarketPrice(row: SignalAnalyticsRow, n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  if (row.market_type === 'forex') return n.toFixed(forexDecimals(row.symbol));
  return fmtPrice(n);
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRangeForFilters(filters: Filters, baselineStartedAt: string | null) {
  const now = new Date();
  let start: Date | null = null;
  let end: Date | null = null;

  if (filters.datePreset === 'today') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
  } else if (filters.datePreset === 'last24h') {
    start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    end = new Date(now);
  } else if (filters.datePreset === 'last7d') {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    end = new Date(now);
  } else if (filters.datePreset === 'last30d') {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    end = new Date(now);
  } else if (filters.datePreset === 'baseline' && baselineStartedAt) {
    start = new Date(baselineStartedAt);
  } else if (filters.datePreset === 'custom') {
    if (filters.customStart) {
      start = new Date(`${filters.customStart}T00:00:00`);
    }
    if (filters.customEnd) {
      end = new Date(`${filters.customEnd}T23:59:59.999`);
    }
  }

  return { start, end };
}

function isWinLoss(row: SignalAnalyticsRow) {
  return row.outcome_category === 'WIN' || row.outcome_category === 'LOSS';
}

function calculateSummary(rows: SignalAnalyticsRow[]): MetricSummary {
  const closedRows = rows.filter(row => row.outcome_category !== 'OPEN');
  const rRows = closedRows.filter(row => row.r_result !== null && row.r_result !== undefined);
  const wins = rows.filter(row => row.outcome_category === 'WIN').length;
  const losses = rows.filter(row => row.outcome_category === 'LOSS').length;
  const positiveR = rRows.filter(row => (row.r_result ?? 0) > 0).reduce((sum, row) => sum + (row.r_result ?? 0), 0);
  const negativeR = rRows.filter(row => (row.r_result ?? 0) < 0).reduce((sum, row) => sum + (row.r_result ?? 0), 0);
  const totalR = rRows.reduce((sum, row) => sum + (row.r_result ?? 0), 0);
  const rValues = rRows.map(row => row.r_result ?? 0);
  const winLossCount = wins + losses;

  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  [...rows]
    .filter(isWinLoss)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach(row => {
      if (row.outcome_category === 'WIN') {
        currentWinStreak += 1;
        currentLossStreak = 0;
      } else {
        currentLossStreak += 1;
        currentWinStreak = 0;
      }
      maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
    });

  return {
    totalSignals: rows.length,
    closedTrades: closedRows.length,
    openTrades: rows.filter(row => row.outcome_category === 'OPEN').length,
    wins,
    losses,
    expired: rows.filter(row => row.outcome_category === 'EXPIRED').length,
    tp1Hits: rows.filter(row => row.current_status === 'tp1_hit').length,
    tp2Hits: rows.filter(row => row.current_status === 'tp2_hit').length,
    slHits: rows.filter(row => row.current_status === 'sl_hit').length,
    winRatePct: winLossCount > 0 ? (wins / winLossCount) * 100 : null,
    profitFactor: positiveR > 0 && negativeR < 0 ? positiveR / Math.abs(negativeR) : null,
    totalR: rRows.length > 0 ? totalR : null,
    avgR: rRows.length > 0 ? totalR / rRows.length : null,
    bestR: rValues.length > 0 ? Math.max(...rValues) : null,
    worstR: rValues.length > 0 ? Math.min(...rValues) : null,
    avgWinR: wins > 0 ? positiveR / wins : null,
    avgLossR: losses > 0 ? negativeR / losses : null,
    maxWinStreak,
    maxLossStreak,
    lastSignalTime: rows.reduce<string | null>((latest, row) => {
      if (!latest) return row.created_at;
      return new Date(row.created_at) > new Date(latest) ? row.created_at : latest;
    }, null),
  };
}

function groupBreakdown(rows: SignalAnalyticsRow[], getKey: (row: SignalAnalyticsRow) => string, getExtra?: (key: string, keyRows: SignalAnalyticsRow[]) => Partial<BreakdownRow>): BreakdownRow[] {
  const groups = new Map<string, SignalAnalyticsRow[]>();
  rows.forEach(row => {
    const key = getKey(row) || '—';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups.entries()].map(([key, keyRows]) => ({
    key,
    label: key,
    rows: keyRows,
    ...calculateSummary(keyRows),
    ...(getExtra?.(key, keyRows) ?? {}),
  })).sort((a, b) => b.totalSignals - a.totalSignals || a.label.localeCompare(b.label));
}

function mostUsedStrategy(rows: SignalAnalyticsRow[]) {
  const counts = new Map<string, number>();
  rows.forEach(row => counts.set(row.strategy_name ?? 'unnamed', (counts.get(row.strategy_name ?? 'unnamed') ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-zinc-100 leading-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-zinc-500">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function DatePresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${active ? 'bg-blue-600/20 border-blue-500/60 text-blue-200' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'}`}
    >
      {children}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Performance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState<SignalAnalyticsRow[]>([]);
  const [configuredStrategies, setConfiguredStrategies] = useState<string[]>(REQUIRED_STRATEGIES);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [baselineStartedAt, setBaselineStartedAt] = useState<string | null>(() => getStoredBaselineTimestamp());
  const [resetInput, setResetInput] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetResult, setResetResult] = useState<{ rows: ResetCountRow[]; timestamp: string; remainingCounts: ResetRemainingCounts; hasMore: boolean } | null>(null);
  const [capitalAssumptions, setCapitalAssumptions] = useState<CapitalAssumptions>(() => getStoredCapitalAssumptions());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sigRes, stratConfigRes] = await Promise.all([
        supabase.from('signal_analytics_view')
          .select('signal_id,strategy_name,symbol,market_type,timeframe,direction,grade,data_source,current_status,outcome_category,r_result,close_price,closed_at,duration_minutes,created_at,entry_price,stop_loss,tp1,tp2')
          .eq('data_source', 'REAL DATA')
          .neq('outcome_category', 'CANCELLED')
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase.from('strategy_configs').select('strategy_name').order('strategy_name'),
      ]);

      if (sigRes.error) throw new Error(sigRes.error.message);
      if (stratConfigRes.error) throw new Error(stratConfigRes.error.message);

      setSignals((sigRes.data ?? []) as SignalAnalyticsRow[]);
      const names = new Set(REQUIRED_STRATEGIES);
      ((stratConfigRes.data ?? []) as StrategyConfigRow[]).forEach(row => {
        if (row.strategy_name) names.add(row.strategy_name);
      });
      setConfiguredStrategies([...names].sort());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    window.localStorage.setItem(CAPITAL_STORAGE_KEY, JSON.stringify(capitalAssumptions));
  }, [capitalAssumptions]);

  function setFilter(key: keyof Filters, val: string) {
    setFilters(f => ({ ...f, [key]: val }));
  }

  function setDatePreset(datePreset: DatePreset) {
    setFilters(f => {
      const next = { ...f, datePreset };
      if (datePreset === 'custom' && !next.customStart && !next.customEnd) {
        next.customStart = toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        next.customEnd = toDateInputValue(new Date());
      }
      return next;
    });
  }

  async function handleResetTradingHistory() {
    if (resetInput !== RESET_CONFIRMATION_TEXT || resetting) return;

    setResetting(true);
    setResetError('');
    try {
      let aggregateRows: ResetCountRow[] = [];
      let normalized: ReturnType<typeof normalizeResetBatch> | null = null;

      for (let iteration = 0; iteration < 2000; iteration += 1) {
        const { data, error: rpcError } = await supabase.rpc('admin_reset_trading_history_batch', { p_batch_size: 50, p_until_empty: true });
        if (rpcError) throw new Error(rpcError.message);

        aggregateRows = mergeResetRows(aggregateRows, resetRowsFromResponse(data));
        normalized = normalizeResetBatch(data, aggregateRows);
        if (!normalized.hasMore) break;
      }

      if (!normalized) throw new Error('Reset did not return a result');
      if (normalized.hasMore) throw new Error('Reset stopped before all performance rows were cleared. Please run reset again.');

      window.localStorage.setItem(BASELINE_STORAGE_KEY, normalized.timestamp);
      setBaselineStartedAt(normalized.timestamp);
      setFilters(f => ({ ...f, datePreset: 'baseline', customStart: '', customEnd: '' }));
      setResetResult(normalized);
      setResetInput('');
      await load();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Failed to reset trading history');
    } finally {
      setResetting(false);
    }
  }

  const filterOpts = useMemo(() => {
    const marketScopedSignals = filters.market ? signals.filter(s => s.market_type === filters.market) : signals;
    return {
      strategies: configuredStrategies,
      symbols: [...new Set(marketScopedSignals.map(s => s.symbol).filter(Boolean))].sort(),
      timeframes: [...new Set(marketScopedSignals.map(s => s.timeframe).filter(Boolean))].sort(),
      directions: [...new Set(marketScopedSignals.map(s => s.direction).filter(Boolean))].sort(),
      grades: [...new Set(marketScopedSignals.map(s => s.grade).filter(Boolean))].sort(),
    };
  }, [configuredStrategies, signals, filters.market]);

  const { start: dateStart, end: dateEnd } = useMemo(() => dateRangeForFilters(filters, baselineStartedAt), [filters, baselineStartedAt]);

  const filteredSignals = useMemo(() => signals.filter(s => {
    const created = new Date(s.created_at);
    if (dateStart && created < dateStart) return false;
    if (dateEnd && created > dateEnd) return false;
    if (filters.market && s.market_type !== filters.market) return false;
    if (filters.strategy && (s.strategy_name ?? 'unnamed') !== filters.strategy) return false;
    if (filters.symbol && s.symbol !== filters.symbol) return false;
    if (filters.timeframe && s.timeframe !== filters.timeframe) return false;
    if (filters.direction && s.direction !== filters.direction) return false;
    if (filters.grade && s.grade !== filters.grade) return false;
    if (filters.outcome && s.outcome_category !== filters.outcome) return false;
    return true;
  }), [signals, filters, dateStart, dateEnd]);

  const baselineSignals = useMemo(() => {
    if (!baselineStartedAt) return signals;
    const baselineDate = new Date(baselineStartedAt);
    return signals.filter(signal => new Date(signal.created_at) >= baselineDate);
  }, [baselineStartedAt, signals]);

  const summary = useMemo(() => calculateSummary(filteredSignals), [filteredSignals]);
  const summaryCapital = useMemo(() => capitalForRows(filteredSignals, capitalAssumptions), [filteredSignals, capitalAssumptions]);
  const strategyBreakdown = useMemo(() => {
    const grouped = new Map(groupBreakdown(filteredSignals, row => row.strategy_name ?? 'unnamed').map(row => [row.key, row]));
    return configuredStrategies.map(strategy => grouped.get(strategy) ?? {
      key: strategy,
      label: strategy,
      rows: [],
      ...calculateSummary([]),
    });
  }, [configuredStrategies, filteredSignals]);
  const symbolBreakdown = useMemo(() => groupBreakdown(filteredSignals, row => row.symbol, (_key, rows) => ({
    market: [...new Set(rows.map(row => row.market_type))].join(', '),
    mostUsedStrategy: mostUsedStrategy(rows),
  })), [filteredSignals]);
  const timeframeBreakdown = useMemo(() => groupBreakdown(filteredSignals, row => row.timeframe), [filteredSignals]);
  const gradeBreakdown = useMemo(() => groupBreakdown(filteredSignals, row => row.grade), [filteredSignals]);
  const riskAmount = capitalAssumptions.startingCapital * (capitalAssumptions.riskPct / 100);

  const activeFilterCount = [filters.market, filters.strategy, filters.symbol, filters.timeframe, filters.direction, filters.grade, filters.outcome].filter(Boolean).length + (filters.datePreset !== (baselineStartedAt ? 'baseline' : 'last30d') || filters.customStart || filters.customEnd ? 1 : 0);
  const hasSignalsInBaseline = baselineSignals.length > 0;
  const emptyMessage = !hasSignalsInBaseline
    ? 'No tracked signals in this baseline yet. Run the scanner to begin collecting fresh results.'
    : 'No signals match this filter/date range.';

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 size={22} className="text-blue-400" />
            Signal Performance
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">REAL DATA signals by market — crypto and forex only mix when Market is set to All</p>
          <p className="text-xs text-zinc-500 mt-2">
            {baselineStartedAt ? `Current baseline started: ${fmtDateTime(baselineStartedAt)}` : 'Baseline: all available trading history'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50 self-start"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* ── Reset Danger Zone ── */}
      <section className="mb-8 bg-red-950/20 border border-red-900/60 rounded-xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="text-sm font-semibold text-red-300 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={16} /> Danger Zone
            </h2>
            <h3 className="text-base font-semibold text-zinc-100 mt-2">Reset Performance History</h3>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
              Clears signal/performance/testing history only: signals, outcomes, Telegram delivery rows linked to signals, candidate/rejected setups, performance/stat rows derived from old signals, and DB execution history linked to old signals. It preserves scanner settings, strategy settings, execution settings, customers, packages, subscriptions, profiles, Telegram config, bot setup records, Binance credentials, account balances, and real Binance positions/orders. It does not reset the testnet governor or disable the scanner; the next scheduled scanner run will repopulate fresh rows if setups qualify.
            </p>
            <p className="text-xs text-zinc-500 mt-3">
              Type <span className="font-mono text-red-200">{RESET_CONFIRMATION_TEXT}</span> to enable this manual reset.
            </p>
          </div>
          <div className="w-full lg:w-80 space-y-2">
            <input
              value={resetInput}
              onChange={e => setResetInput(e.target.value)}
              placeholder={RESET_CONFIRMATION_TEXT}
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-red-500 text-zinc-100 text-xs rounded-lg px-3 py-2 outline-none"
              disabled={resetting}
            />
            <button
              onClick={handleResetTradingHistory}
              disabled={resetInput !== RESET_CONFIRMATION_TEXT || resetting}
              className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
            >
              {resetting && <RefreshCw size={12} className="animate-spin" />}
              Reset Performance History
            </button>
            {resetError && <div className="text-xs text-red-300 bg-red-950/50 border border-red-900/50 rounded-lg px-3 py-2">{resetError}</div>}
            {resetResult && (
              <div className="text-xs text-zinc-400 bg-zinc-950/70 border border-zinc-800 rounded-lg px-3 py-2 space-y-1">
                <div className="font-medium text-emerald-300">Reset Complete at {new Date(resetResult.timestamp).toLocaleString()}.</div>
                <div className="pt-1 font-medium text-zinc-300">Deleted</div>
                {resetResult.rows.map(row => (
                  <div key={row.table_name} className="flex justify-between gap-3">
                    <span className="font-mono">{row.table_name}</span>
                    <span>{row.deleted_count}{row.status ? ` (${row.status})` : ''}</span>
                  </div>
                ))}
                <div className="pt-2 font-medium text-zinc-300">Remaining</div>
                {['signals', 'outcomes', 'telegram_deliveries', 'candidates', 'rejected_setups'].map(table => {
                  const count = resetResult.remainingCounts[table] ?? 0;
                  return (
                    <div key={table} className={`flex justify-between gap-3 ${count > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                      <span className="font-mono">{table}</span>
                      <span>{count}</span>
                    </div>
                  );
                })}
                {Object.entries(resetResult.remainingCounts).filter(([table, count]) => count > 0 && !['signals', 'outcomes', 'telegram_deliveries', 'candidates', 'rejected_setups'].includes(table)).map(([table, count]) => (
                  <div key={table} className="flex justify-between gap-3 text-red-300">
                    <span className="font-mono">Responsible: {table}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Filters ── */}
      <section className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <FilterSelect label="Market" value={filters.market} onChange={v => setFilter('market', v)} options={['crypto', 'forex']} />
          <FilterSelect label="Strategy" value={filters.strategy} onChange={v => setFilter('strategy', v)} options={filterOpts.strategies} />
          <FilterSelect label="Symbol" value={filters.symbol} onChange={v => setFilter('symbol', v)} options={filterOpts.symbols} />
          <FilterSelect label="Timeframe" value={filters.timeframe} onChange={v => setFilter('timeframe', v)} options={filterOpts.timeframes} />
          <FilterSelect label="Direction" value={filters.direction} onChange={v => setFilter('direction', v)} options={filterOpts.directions} />
          <FilterSelect label="Grade" value={filters.grade} onChange={v => setFilter('grade', v)} options={filterOpts.grades} />
          <FilterSelect label="Outcome" value={filters.outcome} onChange={v => setFilter('outcome', v)} options={['OPEN', 'WIN', 'LOSS', 'EXPIRED']} />
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters({ ...initialFilters(), datePreset: baselineStartedAt ? 'baseline' : 'last30d' })}
              className="text-xs text-zinc-500 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 px-2 py-1.5 rounded-lg transition-colors"
            >
              Clear ({activeFilterCount})
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Date range</span>
            <div className="flex flex-wrap gap-2">
              <DatePresetButton active={filters.datePreset === 'today'} onClick={() => setDatePreset('today')}>Today</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'last24h'} onClick={() => setDatePreset('last24h')}>Last 24h</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'last7d'} onClick={() => setDatePreset('last7d')}>Last 7 days</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'last30d'} onClick={() => setDatePreset('last30d')}>Last 30 days</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'baseline'} onClick={() => setDatePreset('baseline')}>All baseline</DatePresetButton>
              <DatePresetButton active={filters.datePreset === 'custom'} onClick={() => setDatePreset('custom')}>Custom</DatePresetButton>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-zinc-500">Custom start date</label>
            <input
              type="date"
              value={filters.customStart}
              onChange={e => setFilters(f => ({ ...f, customStart: e.target.value, datePreset: 'custom' }))}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-zinc-500">Custom end date</label>
            <input
              type="date"
              value={filters.customEnd}
              onChange={e => setFilters(f => ({ ...f, customEnd: e.target.value, datePreset: 'custom' }))}
              className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="text-xs text-zinc-600">
            Applied: {dateStart ? fmtDateTime(dateStart.toISOString()) : 'beginning'} → {dateEnd ? fmtDateTime(dateEnd.toISOString()) : 'now'}
          </div>
        </div>
      </section>

      <section className="mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-300">Capital assumptions</h2>
            <p className="text-xs text-zinc-500 mt-1">Admin-only estimates for signal reporting. These do not change scanner, provider, strategy, or execution logic.</p>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-zinc-500">Starting capital (USD)</label>
              <input type="number" min="1" step="50" value={capitalAssumptions.startingCapital}
                onChange={e => setCapitalAssumptions(a => validCapitalAssumptions({ ...a, startingCapital: Number(e.target.value) }))}
                className="w-32 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-zinc-500">Risk per signal (%)</label>
              <input type="number" min="0.01" step="0.05" value={capitalAssumptions.riskPct}
                onChange={e => setCapitalAssumptions(a => validCapitalAssumptions({ ...a, riskPct: Number(e.target.value) }))}
                className="w-28 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500" />
            </div>
            <div className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
              Estimated risk / signal: <span className="font-semibold text-zinc-200">{formatMoney(riskAmount)}</span>
            </div>
          </div>
        </div>
      </section>

      {loading && signals.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Overall Performance Cards ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Overall Performance</h2>
        {filteredSignals.length === 0 && !loading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-10 text-center text-sm text-zinc-600">
            {emptyMessage}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-3">
              <StatCard label="Total Signals" value={summary.totalSignals} sub={`${summary.closedTrades} closed · ${summary.openTrades} open`} />
              <StatCard label="Closed Signals" value={summary.closedTrades} sub="resolved or expired" />
              <StatCard label="Open Signals" value={summary.openTrades} sub="awaiting outcome" />
              <StatCard label="Win Rate" value={fmtWinRate(summary.winRatePct)} sub={`${summary.wins}W / ${summary.losses}L`} />
              <StatCard label="Profit Factor" value={fmtPF(summary.profitFactor)} sub="wins vs losses only" />
              <StatCard label="Total R" value={fmtR(summary.totalR)} sub={`avg ${summary.avgR === null ? '—' : `${summary.avgR > 0 ? '+' : ''}${summary.avgR.toFixed(2)}R`} / closed`} />
              <StatCard label={`Estimated P/L @ ${capitalAssumptions.riskPct.toFixed(2)}%`} value={<CapitalText estimate={summaryCapital} />} sub={`on ${formatMoney(capitalAssumptions.startingCapital)} baseline`} />
              <StatCard label="Estimated Equity" value={formatMoney(summaryCapital.estimatedFinalCapital)} sub={`max DD est. ${formatPct(summaryCapital.maxDrawdownPct)}`} />
              <StatCard label="Average R / Closed" value={fmtR(summary.avgR)} sub={`est. ${formatPct(summaryCapital.avgReturnPct, true)} / ${formatMoney(summaryCapital.avgPnl)}`} />
              <StatCard label="Best Trade" value={fmtR(summary.bestR)} sub={`worst: ${summary.worstR === null ? '—' : `${summary.worstR.toFixed(2)}R`}`} />
              <StatCard label="Worst Trade" value={fmtR(summary.worstR)} sub={`best: ${summary.bestR === null ? '—' : `${summary.bestR > 0 ? '+' : ''}${summary.bestR.toFixed(2)}R`}`} />
              <StatCard label="TP1 Hits" value={summary.tp1Hits} sub="partial wins" />
              <StatCard label="TP2 Hits" value={summary.tp2Hits} sub="full target hits" />
              <StatCard label="SL Hits" value={summary.slHits} sub="stop losses" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Expired" value={summary.expired} sub="not counted as W/L" />
              <StatCard label="Max Win Streak" value={summary.maxWinStreak} sub="WIN outcomes only" />
              <StatCard label="Max Loss Streak" value={summary.maxLossStreak} sub="LOSS outcomes only" />
              <StatCard label="Last Signal" value={fmtDate(summary.lastSignalTime)} sub={summary.lastSignalTime ? fmtDateTime(summary.lastSignalTime) : '—'} />
            </div>
          </>
        )}
      </section>

      {/* ── Strategy Performance Table ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Strategy Breakdown</h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Strategy</th>
                  <th className="text-right px-3 py-3 font-medium">Trades</th>
                  <th className="text-right px-3 py-3 font-medium">Closed</th>
                  <th className="text-right px-3 py-3 font-medium">Open</th>
                  <th className="text-right px-3 py-3 font-medium">Wins</th>
                  <th className="text-right px-3 py-3 font-medium">Losses</th>
                  <th className="text-right px-3 py-3 font-medium">Expired</th>
                  <th className="text-right px-3 py-3 font-medium">Win Rate</th>
                  <th className="text-right px-3 py-3 font-medium">PF</th>
                  <th className="text-right px-3 py-3 font-medium">Total R</th>
                  <th className="text-right px-3 py-3 font-medium">Est. P/L</th>
                  <th className="text-right px-3 py-3 font-medium">Avg Est.</th>
                  <th className="text-right px-3 py-3 font-medium">Est. DD</th>
                  <th className="text-right px-3 py-3 font-medium">Avg R</th>
                  <th className="text-right px-3 py-3 font-medium">Best R</th>
                  <th className="text-right px-3 py-3 font-medium">Worst R</th>
                  <th className="text-right px-3 py-3 font-medium">TP1</th>
                  <th className="text-right px-3 py-3 font-medium">TP2</th>
                  <th className="text-right px-3 py-3 font-medium">SL</th>
                  <th className="text-right px-4 py-3 font-medium">Last Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {strategyBreakdown.map(row => (
                  <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-200 max-w-[180px]"><span className="truncate block" title={row.label}>{row.label}</span></td>
                    <td className="px-3 py-3 text-right text-zinc-300">{row.totalSignals}</td>
                    <td className="px-3 py-3 text-right text-zinc-300">{row.closedTrades}</td>
                    <td className="px-3 py-3 text-right text-blue-400">{row.openTrades}</td>
                    <td className="px-3 py-3 text-right text-emerald-400">{row.wins}</td>
                    <td className="px-3 py-3 text-right text-red-400">{row.losses}</td>
                    <td className="px-3 py-3 text-right text-zinc-500">{row.expired}</td>
                    <td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td>
                    <td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td>
                    <td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td>
                    {(() => { const est = capitalForRows(row.rows, capitalAssumptions); return <>
                      <td className="px-3 py-3 text-right"><CapitalText estimate={est} /></td>
                      <td className="px-3 py-3 text-right text-zinc-300">{formatMoney(est.avgPnl)}</td>
                      <td className="px-3 py-3 text-right text-red-400">{formatPct(est.maxDrawdownPct)}</td>
                    </>; })()}
                    <td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td>
                    <td className="px-3 py-3 text-right">{fmtR(row.bestR)}</td>
                    <td className="px-3 py-3 text-right">{fmtR(row.worstR)}</td>
                    <td className="px-3 py-3 text-right text-cyan-400">{row.tp1Hits}</td>
                    <td className="px-3 py-3 text-right text-emerald-400">{row.tp2Hits}</td>
                    <td className="px-3 py-3 text-right text-red-400">{row.slHits}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{fmtDate(row.lastSignalTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Symbol Breakdown ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Symbol Breakdown</h2>
        {symbolBreakdown.length === 0 ? <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-8 text-center text-sm text-zinc-600">{emptyMessage}</div> : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
              {['Symbol','Market','Trades','Closed','Open','Win Rate','PF','Total R','Est. P/L','Avg Est.','Avg R','Best R','Worst R','Most Used Strategy','Last Signal'].map((h, i) => <th key={h} className={`${i < 2 || i === 11 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/60">{symbolBreakdown.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors">
              <td className="px-3 py-3 font-mono font-bold text-zinc-100">{row.label}</td><td className="px-3 py-3 text-zinc-400 uppercase">{row.market}</td><td className="px-3 py-3 text-right">{row.totalSignals}</td><td className="px-3 py-3 text-right">{row.closedTrades}</td><td className="px-3 py-3 text-right text-blue-400">{row.openTrades}</td><td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td><td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td><td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td>{(() => { const est = capitalForRows(row.rows, capitalAssumptions); return <><td className="px-3 py-3 text-right"><CapitalText estimate={est} /></td><td className="px-3 py-3 text-right text-zinc-300">{formatMoney(est.avgPnl)}</td></>; })()}<td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td><td className="px-3 py-3 text-right">{fmtR(row.bestR)}</td><td className="px-3 py-3 text-right">{fmtR(row.worstR)}</td><td className="px-3 py-3 text-zinc-400">{row.mostUsedStrategy ?? '—'}</td><td className="px-3 py-3 text-right text-zinc-500">{fmtDate(row.lastSignalTime)}</td>
            </tr>)}</tbody>
          </table></div></div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
        {/* ── Timeframe Breakdown ── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Timeframe Breakdown</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">{['Timeframe','Trades','Win Rate','PF','Total R','Est. P/L','Avg R','TP2','SL'].map((h, i) => <th key={h} className={`${i === 0 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-800/60">{timeframeBreakdown.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-600">{emptyMessage}</td></tr> : timeframeBreakdown.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors"><td className="px-3 py-3 font-medium text-zinc-200">{row.label}</td><td className="px-3 py-3 text-right">{row.totalSignals}</td><td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td><td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td><td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td><td className="px-3 py-3 text-right"><CapitalText estimate={capitalForRows(row.rows, capitalAssumptions)} /></td><td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td><td className="px-3 py-3 text-right text-emerald-400">{row.tp2Hits}</td><td className="px-3 py-3 text-right text-red-400">{row.slHits}</td></tr>)}</tbody>
          </table></div></div>
        </section>

        {/* ── Grade Breakdown ── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Grade Breakdown</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">{['Grade','Trades','Win Rate','PF','Total R','Est. P/L','Avg R'].map((h, i) => <th key={h} className={`${i === 0 ? 'text-left' : 'text-right'} px-3 py-3 font-medium`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-800/60">{gradeBreakdown.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-600">{emptyMessage}</td></tr> : gradeBreakdown.map(row => <tr key={row.key} className="hover:bg-zinc-800/30 transition-colors"><td className="px-3 py-3">{row.label !== '—' ? gradeBadge(row.label) : <span className="text-zinc-600">—</span>}</td><td className="px-3 py-3 text-right">{row.totalSignals}</td><td className="px-3 py-3 text-right">{fmtWinRate(row.winRatePct)}</td><td className="px-3 py-3 text-right">{fmtPF(row.profitFactor)}</td><td className="px-3 py-3 text-right">{fmtR(row.totalR)}</td><td className="px-3 py-3 text-right"><CapitalText estimate={capitalForRows(row.rows, capitalAssumptions)} /></td><td className="px-3 py-3 text-right">{fmtR(row.avgR)}</td></tr>)}</tbody>
          </table></div></div>
        </section>
      </div>

      {/* ── Recent Signals Table ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Tracked Signals</h2>
          <span className="text-xs text-zinc-600">{filteredSignals.length} {activeFilterCount > 0 ? 'matching' : 'total'}</span>
        </div>

        {loading ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-10 flex justify-center">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-10 text-center text-sm text-zinc-600">
            {emptyMessage}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Symbol</th>
                    <th className="text-left px-3 py-3 font-medium">Market</th>
                    <th className="text-left px-3 py-3 font-medium">Strategy</th>
                    <th className="text-left px-3 py-3 font-medium">Timeframe</th>
                    <th className="text-left px-3 py-3 font-medium">Direction</th>
                    <th className="text-left px-3 py-3 font-medium">Grade</th>
                    <th className="text-left px-3 py-3 font-medium">Outcome</th>
                    <th className="text-right px-3 py-3 font-medium">R Result</th>
                    <th className="text-right px-3 py-3 font-medium">Entry</th>
                    <th className="text-right px-3 py-3 font-medium">Stop Loss</th>
                    <th className="text-right px-3 py-3 font-medium">TP1</th>
                    <th className="text-right px-3 py-3 font-medium">TP2</th>
                    <th className="text-right px-3 py-3 font-medium">Close Price</th>
                    <th className="text-right px-3 py-3 font-medium">Duration</th>
                    <th className="text-right px-3 py-3 font-medium">Created</th>
                    <th className="text-right px-4 py-3 font-medium">Closed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredSignals.map(sig => (
                    <tr key={sig.signal_id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-zinc-100">{sig.symbol}</td>
                      <td className="px-3 py-3 text-zinc-400 uppercase">{sig.market_type}</td>
                      <td className="px-3 py-3 text-zinc-400 max-w-[140px]"><span className="truncate block" title={sig.strategy_name ?? undefined}>{sig.strategy_name ?? <span className="text-zinc-600 italic">—</span>}</span></td>
                      <td className="px-3 py-3 text-zinc-400">{sig.timeframe}</td>
                      <td className="px-3 py-3">{directionBadge(sig.direction)}</td>
                      <td className="px-3 py-3">{gradeBadge(sig.grade)}</td>
                      <td className="px-3 py-3">
                        <span className={`font-medium ${OUTCOME_COLORS[sig.outcome_category] ?? 'text-zinc-400'}`}>
                          {sig.outcome_category === 'WIN'
                            ? <span className="flex items-center gap-1"><TrendingUp size={10} />WIN</span>
                            : sig.outcome_category === 'LOSS'
                            ? <span className="flex items-center gap-1"><TrendingDown size={10} />LOSS</span>
                            : sig.outcome_category === 'EXPIRED'
                            ? <span className="flex items-center gap-1"><Minus size={10} />EXPIRED</span>
                            : sig.outcome_category}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">{fmtSignalR(sig.r_result)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.entry_price)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.stop_loss)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.tp1)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.tp2)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">{fmtMarketPrice(sig, sig.close_price)}</td>
                      <td className="px-3 py-3 text-right text-zinc-500">{fmtDuration(sig.duration_minutes)}</td>
                      <td className="px-3 py-3 text-right text-zinc-500 whitespace-nowrap">{fmtDateTime(sig.created_at)}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 whitespace-nowrap">{fmtDateTime(sig.closed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Footer note */}
      <div className="mt-6 text-xs text-zinc-600 leading-relaxed">
        <span className="font-medium text-zinc-500">Data notes:</span>{' '}
        Signal rows are loaded from <code className="bg-zinc-800 px-1 rounded">signal_analytics_view</code>; configured strategy names are loaded from{' '}
        <code className="bg-zinc-800 px-1 rounded">strategy_configs</code> with required strategy fallbacks.
        All cards and breakdowns are recalculated client-side from the same filtered signal set.
        Open signals are counted separately and excluded from win/loss/PF/R aggregates.
        Expired signals are shown separately and are not treated as wins or losses.
        Profit factor shows “—” when there are no losses or no closed R results, avoiding unsafe infinity values.
      </div>
    </AdminLayout>
  );
}
