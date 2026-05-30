import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { gradeBadge, directionBadge } from '../../components/ui/Badge';
import { RefreshCw, TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PerformanceSummary {
  total_signals: number;
  closed_trades: number;
  open_trades: number;
  wins: number;
  losses: number;
  tp1_hits: number;
  tp2_hits: number;
  sl_hits: number;
  expired: number;
  win_rate_pct: number | null;
  loss_rate_pct: number | null;
  total_r: number;
  avg_r: number;
  profit_factor: number | null;
  avg_win_r: number;
  avg_loss_r: number;
  best_trade_r: number;
  worst_trade_r: number;
  max_consecutive_wins: number;
  max_consecutive_losses: number;
  estimated_pnl_r: number;
  calculated_at: string;
}

interface StrategyRow {
  strategy_name: string | null;
  total_signals: number;
  closed_trades: number;
  open_trades: number;
  wins: number;
  losses: number;
  tp1_hits: number;
  tp2_hits: number;
  sl_hits: number;
  expired: number;
  win_rate_pct: number | null;
  total_r: number;
  avg_r: number;
  profit_factor: number | null;
  avg_win_r: number;
  avg_loss_r: number;
  best_trade_r: number;
  worst_trade_r: number;
  estimated_pnl_r: number;
  last_signal_time: string | null;
}

interface SignalAnalyticsRow {
  signal_id: string;
  strategy_name: string | null;
  symbol: string;
  timeframe: string;
  direction: string;
  grade: string;
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
  strategy: string;
  symbol: string;
  timeframe: string;
  direction: string;
  grade: string;
  outcome: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtR(n: number | null | undefined) {
  if (n === null || n === undefined) return <span className="text-zinc-500">open</span>;
  const color = n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-400';
  return <span className={color}>{n > 0 ? '+' : ''}{n.toFixed(2)}R</span>;
}

function fmtPF(pf: number | null | undefined) {
  if (pf === null || pf === undefined) return <span className="text-emerald-300 font-semibold">∞</span>;
  const color = pf >= 1.5 ? 'text-emerald-400' : pf >= 1 ? 'text-yellow-400' : 'text-red-400';
  return <span className={color}>{pf.toFixed(2)}</span>;
}

function fmtWinRate(wr: number | null | undefined) {
  if (wr === null || wr === undefined) return '—';
  const color = wr >= 60 ? 'text-emerald-400' : wr >= 40 ? 'text-yellow-400' : 'text-red-400';
  return <span className={color}>{wr.toFixed(1)}%</span>;
}

function fmtDuration(mins: number | null | undefined) {
  if (mins === null || mins === undefined) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / 1440).toFixed(1)}d`;
}

const OUTCOME_COLORS: Record<string, string> = {
  WIN: 'text-emerald-400',
  LOSS: 'text-red-400',
  EXPIRED: 'text-zinc-500',
  OPEN: 'text-blue-400',
  CANCELLED: 'text-zinc-600',
};

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-zinc-100 leading-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── FilterBar ───────────────────────────────────────────────────────────────

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Performance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [signals, setSignals] = useState<SignalAnalyticsRow[]>([]);
  const [filters, setFilters] = useState<Filters>({ strategy: '', symbol: '', timeframe: '', direction: '', grade: '', outcome: '' });

  // Dynamic filter options derived from loaded data
  const [filterOpts, setFilterOpts] = useState<{ strategies: string[]; symbols: string[]; timeframes: string[]; directions: string[]; grades: string[] }>({
    strategies: [], symbols: [], timeframes: [], directions: [], grades: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, stratRes, sigRes] = await Promise.all([
        supabase.from('signal_performance_summary_view').select('*').maybeSingle(),
        supabase.from('strategy_performance_view').select('*'),
        supabase.from('signal_analytics_view')
          .select('signal_id,strategy_name,symbol,timeframe,direction,grade,data_source,current_status,outcome_category,r_result,close_price,closed_at,duration_minutes,created_at,entry_price,stop_loss,tp1,tp2')
          .eq('data_source', 'REAL DATA')
          .neq('outcome_category', 'CANCELLED')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (summaryRes.error) throw new Error(summaryRes.error.message);
      if (stratRes.error) throw new Error(stratRes.error.message);
      if (sigRes.error) throw new Error(sigRes.error.message);

      setSummary((summaryRes.data ?? null) as PerformanceSummary | null);
      const stratData = (stratRes.data ?? []) as StrategyRow[];
      setStrategies(stratData);
      const sigData = (sigRes.data ?? []) as SignalAnalyticsRow[];
      setSignals(sigData);

      // Derive filter options
      setFilterOpts({
        strategies: [...new Set(stratData.map(s => s.strategy_name ?? 'unnamed').filter(Boolean))].sort(),
        symbols: [...new Set(sigData.map(s => s.symbol))].sort(),
        timeframes: [...new Set(sigData.map(s => s.timeframe))].sort(),
        directions: [...new Set(sigData.map(s => s.direction))].filter(Boolean).sort(),
        grades: [...new Set(sigData.map(s => s.grade))].filter(Boolean).sort(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function setFilter(key: keyof Filters, val: string) {
    setFilters(f => ({ ...f, [key]: val }));
  }

  // Apply filters to signals table
  const filteredSignals = signals.filter(s => {
    if (filters.strategy && (s.strategy_name ?? 'unnamed') !== filters.strategy) return false;
    if (filters.symbol && s.symbol !== filters.symbol) return false;
    if (filters.timeframe && s.timeframe !== filters.timeframe) return false;
    if (filters.direction && s.direction !== filters.direction) return false;
    if (filters.grade && s.grade !== filters.grade) return false;
    if (filters.outcome && s.outcome_category !== filters.outcome) return false;
    return true;
  });

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 size={22} className="text-blue-400" />
            Signal Performance
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">Crypto REAL DATA signals — live from analytics views</p>
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

      {loading && !summary && (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Overall Performance Cards ── */}
      {summary && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Overall Performance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-3">
            <StatCard label="Total Signals" value={summary.total_signals} sub={`${summary.closed_trades} closed · ${summary.open_trades} open`} />
            <StatCard label="Win Rate" value={fmtWinRate(summary.win_rate_pct)} sub={`${summary.wins}W / ${summary.losses}L`} />
            <StatCard label="Profit Factor" value={fmtPF(summary.profit_factor)} sub={summary.profit_factor === null && summary.wins > 0 ? 'No losses recorded' : undefined} />
            <StatCard label="Total R" value={
              <span className={summary.total_r > 0 ? 'text-emerald-400' : summary.total_r < 0 ? 'text-red-400' : 'text-zinc-300'}>
                {summary.total_r > 0 ? '+' : ''}{summary.total_r.toFixed(2)}R
              </span>
            } sub={`avg ${summary.avg_r > 0 ? '+' : ''}${summary.avg_r.toFixed(2)}R / trade`} />
            <StatCard label="Best Trade" value={<span className="text-emerald-400">+{summary.best_trade_r.toFixed(2)}R</span>} sub={`worst: ${summary.worst_trade_r.toFixed(2)}R`} />
            <StatCard label="Avg Win R" value={<span className="text-emerald-400">+{summary.avg_win_r.toFixed(2)}R</span>} sub={`avg loss: ${summary.avg_loss_r.toFixed(2)}R`} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="TP1 Hits" value={summary.tp1_hits} sub="partial wins" />
            <StatCard label="TP2 Hits" value={summary.tp2_hits} sub="full wins" />
            <StatCard label="SL Hits" value={summary.sl_hits} sub="losses" />
            <StatCard label="Expired" value={summary.expired} sub="0R — neither win nor loss" />
            <StatCard label="Max Win Streak" value={summary.max_consecutive_wins} sub={`max loss streak: ${summary.max_consecutive_losses}`} />
          </div>
        </section>
      )}

      {!loading && !summary && (
        <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-10 text-center text-sm text-zinc-600">
          No REAL DATA crypto signals tracked yet. Run the scanner to generate signals.
        </div>
      )}

      {/* ── Strategy Performance Table ── */}
      {strategies.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Strategy Breakdown</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Strategy</th>
                    <th className="text-right px-3 py-3 font-medium">Trades</th>
                    <th className="text-right px-3 py-3 font-medium">W / L</th>
                    <th className="text-right px-3 py-3 font-medium">Win Rate</th>
                    <th className="text-right px-3 py-3 font-medium">PF</th>
                    <th className="text-right px-3 py-3 font-medium">Total R</th>
                    <th className="text-right px-3 py-3 font-medium">Avg R</th>
                    <th className="text-right px-3 py-3 font-medium">TP1</th>
                    <th className="text-right px-3 py-3 font-medium">TP2</th>
                    <th className="text-right px-3 py-3 font-medium">SL</th>
                    <th className="text-right px-3 py-3 font-medium">Exp</th>
                    <th className="text-right px-3 py-3 font-medium">Open</th>
                    <th className="text-right px-4 py-3 font-medium">Last Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {strategies.map((row, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-zinc-200 max-w-[160px]">
                        <span className="truncate block" title={row.strategy_name ?? 'unnamed'}>
                          {row.strategy_name ?? <span className="text-zinc-600 italic">unnamed</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-300">{row.total_signals}</td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-emerald-400">{row.wins}</span>
                        <span className="text-zinc-600"> / </span>
                        <span className="text-red-400">{row.losses}</span>
                      </td>
                      <td className="px-3 py-3 text-right">{fmtWinRate(row.win_rate_pct)}</td>
                      <td className="px-3 py-3 text-right">{fmtPF(row.profit_factor)}</td>
                      <td className="px-3 py-3 text-right">
                        <span className={row.total_r > 0 ? 'text-emerald-400' : row.total_r < 0 ? 'text-red-400' : 'text-zinc-400'}>
                          {row.total_r > 0 ? '+' : ''}{row.total_r.toFixed(2)}R
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className={row.avg_r > 0 ? 'text-emerald-400' : row.avg_r < 0 ? 'text-red-400' : 'text-zinc-400'}>
                          {row.avg_r > 0 ? '+' : ''}{row.avg_r.toFixed(2)}R
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-cyan-400">{row.tp1_hits}</td>
                      <td className="px-3 py-3 text-right text-emerald-400">{row.tp2_hits}</td>
                      <td className="px-3 py-3 text-right text-red-400">{row.sl_hits}</td>
                      <td className="px-3 py-3 text-right text-zinc-500">{row.expired}</td>
                      <td className="px-3 py-3 text-right text-blue-400">{row.open_trades}</td>
                      <td className="px-4 py-3 text-right text-zinc-500">
                        {row.last_signal_time ? new Date(row.last_signal_time).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Filters ── */}
      <section className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Strategy" value={filters.strategy} onChange={v => setFilter('strategy', v)} options={filterOpts.strategies} />
          <FilterSelect label="Symbol" value={filters.symbol} onChange={v => setFilter('symbol', v)} options={filterOpts.symbols} />
          <FilterSelect label="Timeframe" value={filters.timeframe} onChange={v => setFilter('timeframe', v)} options={filterOpts.timeframes} />
          <FilterSelect label="Direction" value={filters.direction} onChange={v => setFilter('direction', v)} options={filterOpts.directions} />
          <FilterSelect label="Grade" value={filters.grade} onChange={v => setFilter('grade', v)} options={filterOpts.grades} />
          <FilterSelect label="Outcome" value={filters.outcome} onChange={v => setFilter('outcome', v)} options={['OPEN', 'WIN', 'LOSS', 'EXPIRED']} />
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters({ strategy: '', symbol: '', timeframe: '', direction: '', grade: '', outcome: '' })}
              className="text-xs text-zinc-500 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 px-2 py-1.5 rounded-lg transition-colors"
            >
              Clear ({activeFilterCount})
            </button>
          )}
        </div>
      </section>

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
            {activeFilterCount > 0 ? 'No signals match the current filters.' : 'No REAL DATA crypto signals found.'}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Symbol</th>
                    <th className="text-left px-3 py-3 font-medium">Strategy</th>
                    <th className="text-left px-3 py-3 font-medium">TF</th>
                    <th className="text-left px-3 py-3 font-medium">Dir</th>
                    <th className="text-left px-3 py-3 font-medium">Grade</th>
                    <th className="text-left px-3 py-3 font-medium">Outcome</th>
                    <th className="text-right px-3 py-3 font-medium">R Result</th>
                    <th className="text-right px-3 py-3 font-medium">Duration</th>
                    <th className="text-right px-3 py-3 font-medium">Close Price</th>
                    <th className="text-right px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredSignals.map(sig => (
                    <tr key={sig.signal_id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-zinc-100">{sig.symbol}</td>
                      <td className="px-3 py-3 text-zinc-400 max-w-[120px]">
                        <span className="truncate block" title={sig.strategy_name ?? undefined}>
                          {sig.strategy_name ?? <span className="text-zinc-600 italic">—</span>}
                        </span>
                      </td>
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
                      <td className="px-3 py-3 text-right">{fmtR(sig.r_result)}</td>
                      <td className="px-3 py-3 text-right text-zinc-500">{fmtDuration(sig.duration_minutes)}</td>
                      <td className="px-3 py-3 text-right font-mono text-zinc-400">
                        {sig.close_price != null ? sig.close_price.toFixed(5) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500">
                        {new Date(sig.created_at).toLocaleDateString()}
                      </td>
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
        All stats are from <code className="bg-zinc-800 px-1 rounded">signal_performance_summary_view</code>,{' '}
        <code className="bg-zinc-800 px-1 rounded">strategy_performance_view</code>, and{' '}
        <code className="bg-zinc-800 px-1 rounded">signal_analytics_view</code>.
        Open signals are excluded from win/loss/PF calculations.
        Profit factor = ∞ when no losses exist.
        R uses entry midpoint and SL distance as 1R.
        Crypto REAL DATA only — forex excluded for MVP.
      </div>
    </AdminLayout>
  );
}
