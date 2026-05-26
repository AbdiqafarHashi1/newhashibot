import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { StrategyCandidate, ScannerRun, StrategyConfig, ModeConfig } from '../../lib/types';
import { Brain, ChevronDown, ChevronUp, ArrowRight, CheckCircle, XCircle, AlertTriangle, Radio, Cpu, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const REJECTION_COLORS: Record<string, string> = {
  insufficient_candles: 'text-zinc-500',
  wrong_timeframe: 'text-zinc-500',
  volatility_too_low: 'text-yellow-400',
  volatility_too_high: 'text-orange-400',
  trend_not_aligned: 'text-yellow-400',
  momentum_too_weak: 'text-yellow-400',
  rsi_not_confirmed: 'text-yellow-400',
  candle_body_too_small: 'text-zinc-500',
  risk_reward_too_low: 'text-red-400',
  score_below_min: 'text-red-400',
  no_compression_box: 'text-zinc-500',
  box_too_wide: 'text-zinc-500',
  no_breakout: 'text-zinc-500',
  breakout_too_weak: 'text-yellow-400',
  no_atr_expansion: 'text-yellow-400',
  fakeout_risk: 'text-orange-400',
  duplicate_active_signal: 'text-orange-400',
  low_score: 'text-red-400',
};

const MODE_ICONS: Record<string, LucideIcon> = {
  signal_mode: Radio,
  personal_mode: Cpu,
  prop_mode: Zap,
};

export default function TradingBrain() {
  const [latestRun, setLatestRun] = useState<ScannerRun | null>(null);
  const [strategies, setStrategies] = useState<StrategyConfig[]>([]);
  const [rejected, setRejected] = useState<StrategyCandidate[]>([]);
  const [candidates, setCandidates] = useState<StrategyCandidate[]>([]);
  const [modes, setModes] = useState<ModeConfig[]>([]);
  const [paperCount, setPaperCount] = useState(0);
  const [riskBlockedCount, setRiskBlockedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [runRes, stratRes, rejRes, candRes, modesRes, paperRes, riskRes] = await Promise.all([
        supabase.from('scanner_runs').select('*').order('started_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('strategy_configs').select('*').order('strategy_name'),
        supabase.from('strategy_candidates').select('*').eq('status', 'rejected').order('created_at', { ascending: false }).limit(20),
        supabase.from('strategy_candidates').select('*').neq('status', 'rejected').order('created_at', { ascending: false }).limit(20),
        supabase.from('mode_configs').select('*').order('slug'),
        supabase.from('paper_execution_intents').select('id', { count: 'exact' }),
        supabase.from('paper_execution_intents').select('id', { count: 'exact' }).eq('risk_check_passed', false),
      ]);
      setLatestRun(runRes.data as ScannerRun | null);
      setStrategies((stratRes.data ?? []) as StrategyConfig[]);
      setRejected((rejRes.data ?? []) as StrategyCandidate[]);
      setCandidates((candRes.data ?? []) as StrategyCandidate[]);
      setModes((modesRes.data ?? []) as ModeConfig[]);
      setPaperCount(paperRes.count ?? 0);
      setRiskBlockedCount(riskRes.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  // Aggregate rejection reasons
  const rejectionCounts: Record<string, number> = {};
  rejected.forEach((r) => {
    const k = r.rejection_reason || 'unknown';
    rejectionCounts[k] = (rejectionCounts[k] ?? 0) + 1;
  });
  const topRejections = Object.entries(rejectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const approvedCount = candidates.filter((c) => ['approved', 'converted_to_signal'].includes(c.status)).length;
  const signalCount = candidates.filter((c) => c.status === 'converted_to_signal').length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Trading Brain Diagnostics</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Strategy evaluation results, rejection analysis, and signal pipeline</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Latest run stats */}
          <div>
            <h2 className="text-sm font-semibold mb-3 text-zinc-400">Latest Scanner Run</h2>
            {latestRun ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Symbols Scanned', value: latestRun.symbols_scanned },
                  { label: 'Candles Fetched', value: latestRun.candles_fetched?.toLocaleString() },
                  { label: 'Evaluations', value: latestRun.strategy_evaluations_count ?? '—' },
                  { label: 'Rejected', value: latestRun.rejected_candidates_count ?? '—' },
                  { label: 'Approved Candidates', value: latestRun.candidates_found },
                  { label: 'Signals Created', value: latestRun.signals_created },
                  { label: 'Indicators Calc.', value: latestRun.indicators_calculated ?? '—' },
                  { label: 'Duration', value: latestRun.finished_at
                    ? `${Math.round((new Date(latestRun.finished_at).getTime() - new Date(latestRun.started_at).getTime()) / 1000)}s`
                    : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <div className="text-xs text-zinc-500 mb-1">{label}</div>
                    <div className="font-semibold text-sm">{value ?? 0}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-sm text-zinc-500">
                No scanner runs yet. Go to{' '}
                <Link to="/admin/control-room" className="text-blue-400 hover:text-blue-300">Control Room</Link>
                {' '}and click Run One Scan Now.
              </div>
            )}

            {latestRun?.errors && latestRun.errors.length > 0 && (
              <div className="mt-3 bg-yellow-500/8 border border-yellow-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2 text-xs text-yellow-400">
                  <AlertTriangle size={12} /> Scanner errors ({latestRun.errors.length})
                </div>
                <div className="space-y-1">
                  {latestRun.errors.slice(0, 5).map((e, i) => (
                    <div key={i} className="text-xs text-zinc-500 font-mono">{e}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mode status */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-400">Active Modes</h2>
              <Link to="/admin/modes" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                Mode Control <ArrowRight size={11} />
              </Link>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
              {modes.map(m => {
                const Icon = MODE_ICONS[m.slug] ?? Radio;
                return (
                  <div key={m.slug} className={`bg-zinc-900 border rounded-xl p-3 ${m.is_enabled ? 'border-zinc-700' : 'border-zinc-800 opacity-60'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={12} className={m.is_enabled ? 'text-emerald-400' : 'text-zinc-600'} />
                      <span className="text-xs font-medium">{m.display_name}</span>
                      <span className={`ml-auto text-xs ${m.is_enabled ? 'text-emerald-400' : 'text-zinc-600'}`}>
                        {m.is_enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    {m.paper_execution_enabled && m.is_enabled && (
                      <div className="text-xs text-cyan-400 mt-1">Paper execution active</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Paper Intents Total</span>
                <span className="font-semibold text-sm">{paperCount}</span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Risk-Blocked Intents</span>
                <span className={`font-semibold text-sm ${riskBlockedCount > 0 ? 'text-red-400' : 'text-zinc-300'}`}>{riskBlockedCount}</span>
              </div>
            </div>
          </div>

          {/* Strategy configs */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-400">Active Strategies</h2>
              <Link to="/admin/strategy-config" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                Configure <ArrowRight size={11} />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {strategies.map((s) => (
                <div key={s.strategy_name} className={`bg-zinc-900 border rounded-xl p-4 ${s.enabled ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Brain size={13} className={s.enabled ? 'text-blue-400' : 'text-zinc-600'} />
                    <span className="font-semibold text-sm">{s.strategy_name}</span>
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded-full border ${
                      s.enabled ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-zinc-600 bg-zinc-800 border-zinc-700'
                    }`}>{s.enabled ? 'ON' : 'OFF'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-zinc-500">
                    <span>min_score: <span className="text-zinc-300">{s.min_score}</span></span>
                    <span>min_rr: <span className="text-zinc-300">{s.min_rr}</span></span>
                    <span>timeframes: <span className="text-zinc-300 font-mono">{s.allowed_timeframes.join(', ') || 'all'}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top rejection reasons */}
          {topRejections.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3 text-zinc-400">Top Rejection Reasons</h2>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Reason</th>
                      <th className="text-right px-4 py-3">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRejections.map(([reason, count]) => (
                      <tr key={reason} className="border-b border-zinc-800/50">
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-mono ${REJECTION_COLORS[reason] ?? 'text-zinc-400'}`}>{reason}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-zinc-400">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Latest approved candidates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-400">
                Latest Approved Candidates
                <span className="ml-2 text-xs text-zinc-600">({approvedCount} approved, {signalCount} → signal)</span>
              </h2>
              <Link to="/admin/candidates" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>
            {candidates.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-sm text-zinc-500">
                No approved candidates yet. Run the scanner to generate evaluations.
              </div>
            ) : (
              <div className="space-y-2">
                {candidates.slice(0, 10).map((c) => (
                  <CandidateRow key={c.id} c={c} expandedId={expandedId} setExpandedId={setExpandedId} />
                ))}
              </div>
            )}
          </div>

          {/* Latest rejected evaluations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-400">
                Latest Rejected Evaluations
                <span className="ml-2 text-xs text-zinc-600">({rejected.length} shown)</span>
              </h2>
              <Link to="/admin/rejected" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>
            {rejected.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-sm text-zinc-500">
                No rejected evaluations yet. Run the scanner.
              </div>
            ) : (
              <div className="space-y-2">
                {rejected.slice(0, 10).map((c) => (
                  <CandidateRow key={c.id} c={c} expandedId={expandedId} setExpandedId={setExpandedId} />
                ))}
              </div>
            )}
          </div>

          {/* Quick nav */}
          <div className="grid sm:grid-cols-4 gap-3 pt-2 border-t border-zinc-800">
            {[
              { to: '/admin/control-room', label: 'Control Room', sub: 'Run scanner' },
              { to: '/admin/strategy-config', label: 'Strategy Config', sub: 'Tune parameters' },
              { to: '/admin/modes', label: 'Mode Control', sub: 'Enable/disable modes' },
              { to: '/admin/execution', label: 'Execution', sub: 'Paper intents & bridge' },
            ].map(({ to, label, sub }) => (
              <Link key={to} to={to}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center justify-between group transition-colors">
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-zinc-600">{sub}</div>
                </div>
                <ArrowRight size={13} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function CandidateRow({ c, expandedId, setExpandedId }: {
  c: StrategyCandidate;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  const isOpen = expandedId === c.id;
  const isRejected = c.status === 'rejected';

  return (
    <div className={`rounded-xl border overflow-hidden ${isRejected ? 'bg-zinc-900 border-zinc-800' : 'bg-emerald-500/5 border-emerald-500/15'}`}>
      <button
        onClick={() => setExpandedId(isOpen ? null : c.id)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/20 transition-colors">
        <div className="shrink-0">
          {isRejected
            ? <XCircle size={13} className={`${REJECTION_COLORS[c.rejection_reason] ?? 'text-zinc-500'}`} />
            : <CheckCircle size={13} className="text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-mono font-semibold text-zinc-200">{c.symbol}</span>
            <span className="text-zinc-600">{c.timeframe}</span>
            <span className="text-zinc-500">{c.strategy_name}</span>
            {c.direction && (
              <span className={`${c.direction === 'buy' ? 'text-emerald-400' : 'text-red-400'} font-medium`}>
                {c.direction.toUpperCase()}
              </span>
            )}
            {c.grade && c.grade !== 'reject' && (
              <span className={`px-1.5 py-0.5 rounded text-xs border ${
                c.grade === 'A+' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                c.grade === 'A'  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                   'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}>{c.grade}</span>
            )}
            {isRejected && (
              <span className={`font-mono ${REJECTION_COLORS[c.rejection_reason] ?? 'text-zinc-500'}`}>
                {c.rejection_reason}
              </span>
            )}
            <span className="text-zinc-600 ml-auto">{c.confidence_score}pts</span>
          </div>
        </div>
        {isOpen ? <ChevronUp size={12} className="text-zinc-600 shrink-0" /> : <ChevronDown size={12} className="text-zinc-600 shrink-0" />}
      </button>

      {isOpen && (
        <div className="border-t border-zinc-800/50 px-4 py-3 bg-zinc-800/20">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
            {[
              { label: 'Score', value: c.confidence_score },
              { label: 'R:R', value: c.risk_reward?.toFixed(2) ?? '—' },
              { label: 'Regime', value: c.regime },
              { label: 'Data', value: c.data_source },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-800/50 rounded px-2 py-1.5">
                <div className="text-zinc-600 mb-0.5">{label}</div>
                <div className="text-zinc-300">{value}</div>
              </div>
            ))}
          </div>
          {c.reason && <div className="text-xs text-zinc-500 mb-2">{c.reason}</div>}
          {Object.keys(c.score_breakdown ?? {}).length > 0 && (
            <div>
              <div className="text-xs text-zinc-600 mb-1">Score breakdown:</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(c.score_breakdown).map(([k, v]) => (
                  <span key={k} className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                    (v as number) > 0 ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400' : 'bg-red-500/8 border-red-500/20 text-red-400'
                  }`}>
                    {k}: {v > 0 ? '+' : ''}{v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
