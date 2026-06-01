import { useEffect, useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { StrategyCandidate } from '../../lib/types';
import { directionBadge, Badge } from '../../components/ui/Badge';

export default function RejectedSetups() {
  const [items, setItems] = useState<StrategyCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketFilter, setMarketFilter] = useState('all');

  useEffect(() => {
    let query = supabase.from('strategy_candidates').select('*').eq('status', 'rejected')
      .order('created_at', { ascending: false }).limit(100);
    if (marketFilter !== 'all') query = query.eq('market_type', marketFilter);
    query.then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [marketFilter]);

  const reasonColors: Record<string, 'red' | 'yellow' | 'orange' | 'gray'> = {
    low_score: 'red',
    bad_regime: 'yellow',
    duplicate_signal: 'orange',
    insufficient_candles: 'gray',
    risk_reward_too_low: 'red',
    rr_too_low: 'red',
    confidence_too_low: 'red',
    score_below_min: 'red',
    volatility_too_low: 'yellow',
    volatility_too_high: 'orange',
    unclear_trend: 'gray',
    unsupported_timeframe: 'gray',
    invalid_candles: 'gray',
    invalid_atr_or_price: 'gray',
    momentum_failed: 'yellow',
    rsi_not_confirmed: 'yellow',
    candle_body_too_small: 'yellow',
    compression_not_ready: 'yellow',
    breakout_not_confirmed: 'yellow',
    atr_expansion_weak: 'yellow',
    trend_filter_failed: 'yellow',
    pullback_not_ready: 'yellow',
    reclaim_not_confirmed: 'yellow',
    provider_rate_limited: 'orange',
    provider_data_unavailable: 'gray',
    provider_invalid_response: 'gray',
    forex_budget_limited: 'gray',
    distance_guard_failed: 'orange',
  };

  const formatRiskReward = (rr: number | null) => (typeof rr === 'number' && Number.isFinite(rr) ? `${rr.toFixed(2)}R` : '—');

  const formatScore = (score: number | null) => (typeof score === 'number' && Number.isFinite(score) ? `${Math.round(score)}%` : '—');

  const formatDiagnosticValue = (value: number | string | boolean | null | undefined) => {
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return value ? String(value) : '—';
  };

  const diagnosticEntries = (c: StrategyCandidate) => {
    const breakdown = c.score_breakdown ?? {};
    const keys = [
      'primary_failed_gate', 'stop_distance_pct', 'tp1_distance_pct', 'tp2_distance_pct', 'rr',
      'compression_score', 'box_range_atr', 'compression_ready', 'breakout_confirmed', 'atr_expansion',
      'trend_direction', 'trend_score', 'pullback_score', 'reclaim_confirmed', 'momentum_score',
      'volatility_score', 'candle_score', 'rsi_score', 'spread_or_distance_score', 'stop_distance_pips',
      'tp1_distance_pips', 'tp2_distance_pips', 'forex_pair_type', 'session_context',
    ];
    return keys
      .filter((key) => breakdown[key] !== undefined && breakdown[key] !== null && breakdown[key] !== '')
      .map((key) => [key, breakdown[key]] as const);
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Rejected Setups</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{items.length} rejected candidates</p>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {['all', 'crypto', 'forex'].map(f => (
          <button key={f} onClick={() => setMarketFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${marketFilter === f ? 'bg-cyan-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}>
            {f === 'all' ? 'All Markets' : f.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-sm text-zinc-500">
          No rejected setups. Run the scanner to see arbitration decisions.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-3">Symbol</th>
                <th className="text-left px-4 py-3">Market</th>
                <th className="text-left px-4 py-3">TF</th>
                <th className="text-left px-4 py-3">Strategy</th>
                <th className="text-left px-4 py-3">Dir</th>
                <th className="text-left px-4 py-3">Score</th>
                <th className="text-left px-4 py-3">R/R</th>
                <th className="text-left px-4 py-3">Rejection Reason</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Regime</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-300">{c.symbol}</td>
                  <td className="px-4 py-3 text-zinc-500 uppercase">{c.market_type}</td>
                  <td className="px-4 py-3 text-zinc-500">{c.timeframe}</td>
                  <td className="px-4 py-3 text-zinc-500">{c.strategy_name}</td>
                  <td className="px-4 py-3">{directionBadge(c.direction)}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatScore(c.confidence_score)}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatRiskReward(c.risk_reward)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={reasonColors[c.rejection_reason] ?? 'gray'}>
                      {(c.rejection_reason || 'unknown').replace(/_/g, ' ')}
                    </Badge>
                    {diagnosticEntries(c).length > 0 && (
                      <div className="mt-1 flex max-w-md flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-4 text-zinc-500">
                        {diagnosticEntries(c).map(([key, value]) => (
                          <span key={key}>
                            <span className="text-zinc-600">{key.replace(/_/g, ' ')}:</span> {formatDiagnosticValue(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell">{c.regime}</td>
                  <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell">{new Date(c.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
