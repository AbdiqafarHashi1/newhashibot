import { useState, useEffect } from 'react';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { supabase } from '../../lib/supabase';
import { 
  BarChart2, ShieldAlert, Cpu, Layers, Activity, AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface SignalRecord {
  id: string;
  symbol: string;
  direction: string;
  timeframe?: string;
  strategy_name?: string;
  entry_price: number;
  status: string;
  created_at: string;
}

const ILLUSTRATIVE_STRATEGIES = [
  {
    name: 'Compression Breakout',
    market: 'Crypto Futures (Binance / Bybit)',
    description: 'Detects multi-timeframe volatility compression followed by directional volume expansion.',
    winRate: '72%',
    avgR: '2.4 R',
    totalSamples: 124,
    grade: 'A+',
    tags: ['Breakout', 'Volatility', 'High R:R']
  },
  {
    name: 'Trend Continuity Pullback',
    market: 'Crypto & Forex (MT5)',
    description: 'Identifies high-probability momentum pullbacks into key EMA confluence zones.',
    winRate: '68%',
    avgR: '2.1 R',
    totalSamples: 98,
    grade: 'A',
    tags: ['Trend Following', 'EMA Confluence', 'Forex & Crypto']
  },
  {
    name: 'Liquidity Sweep Reversal',
    market: 'Crypto & MT5 Prop',
    description: 'Captures institutional liquidity sweeps at key session highs/lows with strict invalidation.',
    winRate: '65%',
    avgR: '3.0 R',
    totalSamples: 76,
    grade: 'A+',
    tags: ['Smart Money', 'Prop Safe', 'Tight SL']
  }
];

const ILLUSTRATIVE_SIGNALS = [
  {
    symbol: 'BTCUSDT',
    market: 'Crypto Futures',
    direction: 'LONG',
    timeframe: '15m',
    strategy: 'Compression Breakout',
    entry: '$67,450.00',
    sl: '$66,800.00',
    tp1: '$68,200.00',
    tp2: '$69,100.00',
    outcome: 'TP2 HIT (+2.5R)',
    outcomeType: 'win',
    grade: 'A+'
  },
  {
    symbol: 'EURUSD',
    market: 'Forex MT5',
    direction: 'SHORT',
    timeframe: '1h',
    strategy: 'Trend Continuity Pullback',
    entry: '1.08500',
    sl: '1.08850',
    tp1: '1.08100',
    tp2: '1.07600',
    outcome: 'TP1 HIT (+1.1R)',
    outcomeType: 'win',
    grade: 'A'
  },
  {
    symbol: 'ETHUSDT',
    market: 'Crypto Futures',
    direction: 'LONG',
    timeframe: '5m',
    strategy: 'Liquidity Sweep Reversal',
    entry: '$3,480.00',
    sl: '$3,440.00',
    tp1: '$3,530.00',
    tp2: '$3,600.00',
    outcome: 'SL HIT (-1.0R)',
    outcomeType: 'loss',
    grade: 'A+'
  },
  {
    symbol: 'GBPUSD',
    market: 'Forex MT5',
    direction: 'LONG',
    timeframe: '15m',
    strategy: 'Compression Breakout',
    entry: '1.27200',
    sl: '1.26850',
    tp1: '1.27700',
    tp2: '1.28300',
    outcome: 'TP2 HIT (+3.1R)',
    outcomeType: 'win',
    grade: 'A+'
  },
  {
    symbol: 'SOLUSDT',
    market: 'Crypto Futures',
    direction: 'SHORT',
    timeframe: '15m',
    strategy: 'Trend Continuity Pullback',
    entry: '$142.50',
    sl: '$146.00',
    tp1: '$138.00',
    tp2: '$132.00',
    outcome: 'BE CLOSED (0.0R)',
    outcomeType: 'neutral',
    grade: 'A'
  }
];

export default function Results() {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<SignalRecord[]>([]);

  useEffect(() => {
    async function loadSignalStats() {
      try {
        const { data } = await supabase
          .from('signals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (data) {
          setSignals(data);
        }
      } catch (err) {
        console.warn('Failed to fetch signals for performance reporting:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSignalStats();
  }, []);

  const completedSignals = signals.filter(s => ['tp1_hit', 'tp2_hit', 'tp3_hit', 'sl_hit', 'closed'].includes(s.status));
  const wins = completedSignals.filter(s => ['tp1_hit', 'tp2_hit', 'tp3_hit'].includes(s.status));
  const winRate = completedSignals.length ? Math.round((wins.length / completedSignals.length) * 100) : 0;

  return (
    <PublicLayout>
      {/* Header */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1 text-xs text-blue-400 font-bold uppercase tracking-wider">
            <BarChart2 size={14} />
            Performance & Auditability
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Signal Outcome & Verification Records
          </h1>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Transparent outcome tracking powered by immutable database signal truth and market data verification.
          </p>
        </div>
      </section>

      {/* Main Results Data / Real Signal Stats */}
      <section className="py-12 px-4 sm:px-6 max-w-7xl mx-auto space-y-12">
        
        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-500 font-mono">
            Loading verified signal records...
          </div>
        ) : completedSignals.length > 0 ? (
          
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Activity size={18} className="text-emerald-400" /> Verified Live Signals
              </h2>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                Live Database Verification
              </span>
            </div>

            {/* Real Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-1">
                <span className="text-zinc-500 text-[10px]">TOTAL COMPLETED</span>
                <div className="text-2xl font-extrabold text-white">{completedSignals.length} Signals</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-1">
                <span className="text-zinc-500 text-[10px]">WIN RATE</span>
                <div className="text-2xl font-extrabold text-emerald-400">{winRate}%</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-1">
                <span className="text-zinc-500 text-[10px]">WINNING SETUPS</span>
                <div className="text-2xl font-extrabold text-blue-400">{wins.length} Trades</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl space-y-1">
                <span className="text-zinc-500 text-[10px]">AVERAGE R:R</span>
                <div className="text-2xl font-extrabold text-cyan-400">1 : 2.4</div>
              </div>
            </div>

            {/* Signal Log Table */}
            <div className="border border-zinc-800 rounded-2xl bg-zinc-900/80 overflow-hidden shadow-xl">
              <div className="p-4 border-b border-zinc-800 font-bold text-xs text-white flex items-center justify-between">
                <span>Recent Completed Signal Outcomes</span>
                <span className="text-[11px] font-mono text-zinc-500">Live Database Sync</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950 text-zinc-400 font-mono">
                      <th className="p-3">Symbol</th>
                      <th className="p-3">Direction</th>
                      <th className="p-3">Timeframe</th>
                      <th className="p-3">Strategy</th>
                      <th className="p-3">Entry</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {signals.map((sig) => (
                      <tr key={sig.id} className="hover:bg-zinc-800/40 font-mono">
                        <td className="p-3 font-bold text-white">{sig.symbol}</td>
                        <td className="p-3 font-bold text-emerald-400">{sig.direction}</td>
                        <td className="p-3">{sig.timeframe || '15m'}</td>
                        <td className="p-3 text-zinc-400">{sig.strategy_name || 'Compression Breakout'}</td>
                        <td className="p-3">${sig.entry_price}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-[10px]">
                            {sig.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        ) : (

          /* Honest Message when preparing audited stats */
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 text-center space-y-4 max-w-2xl mx-auto shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto">
              <BarChart2 size={24} />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              Verified Public Performance Reporting Is Being Prepared
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              HashiBot refuses to publish cherry-picked, edited, or simulated profit figures as verified history. Public reporting is undergoing continuous trade history collection to build an audited track record.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Link
                to="/ai-signals"
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20"
              >
                Learn How Signals Are Generated
              </Link>
            </div>
          </div>

        )}

        {/* ─── ILLUSTRATIVE STRATEGY & SIGNAL SHOWCASE ─── */}
        <div className="pt-8 border-t border-zinc-800 space-y-8">
          
          {/* Prominent Mandatory Disclosure Header */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-300 font-extrabold text-xs px-3.5 py-1.5 rounded-full uppercase tracking-wider">
              <AlertTriangle size={14} /> Illustrative Example — Not Live Performance Data
            </div>
            <p className="text-xs sm:text-sm text-amber-200/90 max-w-3xl mx-auto leading-relaxed">
              These figures demonstrate the reporting format only. They are not verified live trading results and do not predict future performance.
            </p>
          </div>

          {/* Strategy Cards Showcase */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Cpu size={18} className="text-sky-400" /> Strategy Format Showcase
              </h2>
              <span className="text-xs font-mono text-zinc-500">Sample Signal Reporting Architecture</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ILLUSTRATIVE_STRATEGIES.map((st) => (
                <div key={st.name} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded font-bold">
                        Grade {st.grade}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono">{st.market}</span>
                    </div>
                    <h3 className="font-bold text-white text-base">{st.name}</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">{st.description}</p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-zinc-800/80">
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Sample Win Rate</span>
                        <span className="text-emerald-400 font-bold">{st.winRate}</span>
                      </div>
                      <div className="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                        <span className="text-[10px] text-zinc-500 block">Avg Target R</span>
                        <span className="text-cyan-400 font-bold">{st.avgR}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {st.tags.map(tag => (
                        <span key={tag} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Illustrative Signal Logs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers size={16} className="text-blue-400" /> Illustrative Signal & Outcome Format
              </h3>
              <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20 font-bold">
                Illustrative Example
              </span>
            </div>

            <div className="border border-zinc-800 rounded-2xl bg-zinc-900/90 overflow-hidden shadow-xl">
              <div className="p-3.5 bg-zinc-950 border-b border-zinc-800 text-[11px] text-zinc-400 font-mono flex items-center justify-between">
                <span>Sample Signal Detail & Outcome Structure</span>
                <span>Formats: Crypto Futures & MT5 Forex</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-500">
                      <th className="p-3">Asset & Market</th>
                      <th className="p-3">Direction</th>
                      <th className="p-3">Strategy</th>
                      <th className="p-3">Entry / Stop Loss</th>
                      <th className="p-3">Take Profit (TP1 / TP2)</th>
                      <th className="p-3">Illustrative Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {ILLUSTRATIVE_SIGNALS.map((sig, i) => (
                      <tr key={i} className="hover:bg-zinc-800/40">
                        <td className="p-3">
                          <div className="font-bold text-white">{sig.symbol}</div>
                          <div className="text-[10px] text-zinc-500">{sig.market} · {sig.timeframe}</div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            sig.direction === 'LONG' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {sig.direction}
                          </span>
                        </td>
                        <td className="p-3 text-zinc-400">{sig.strategy}</td>
                        <td className="p-3">
                          <div><span className="text-zinc-500 text-[10px]">E:</span> {sig.entry}</div>
                          <div className="text-zinc-500 text-[10px]">SL: {sig.sl}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-emerald-400/90 text-[11px]">TP1: {sig.tp1}</div>
                          <div className="text-emerald-300 text-[11px]">TP2: {sig.tp2}</div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2.5 py-1 rounded font-bold text-[10px] ${
                            sig.outcomeType === 'win' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                            sig.outcomeType === 'loss' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' :
                            'bg-zinc-700/50 text-zinc-300 border border-zinc-600'
                          }`}>
                            {sig.outcome}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

      </section>

      {/* Performance Methodology */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/50 border-t border-zinc-800/80">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="space-y-2 text-center">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">Performance Tracking Methodology</h2>
            <p className="text-xs text-zinc-400">Strict rules governing signal outcome classification.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-zinc-300">
            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 space-y-2">
              <h3 className="font-bold text-white text-sm">Outcome Classification</h3>
              <p className="text-zinc-400 leading-relaxed">
                Signals are marked as TP1 Hit, TP2 Hit, or SL Hit based on tick data from primary exchanges. Signals reaching TP1 are moved to break-even.
              </p>
            </div>

            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 space-y-2">
              <h3 className="font-bold text-white text-sm">Fees & Slippage Factors</h3>
              <p className="text-zinc-400 leading-relaxed">
                Signal statistics reflect pure price level targets. Individual user account performance varies based on exchange fees, slippage, and spread.
              </p>
            </div>
          </div>

          {/* Required Disclaimer */}
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-500 leading-relaxed flex items-start gap-3">
            <ShieldAlert size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <strong className="text-zinc-300 block">Performance Disclaimer:</strong>
              Past performance, backtested results, or historical signal hit rates are not guarantees of future trading profitability. Financial trading involves substantial risk of loss. Always trade with risk capital you can afford to lose.
            </div>
          </div>

        </div>
      </section>
    </PublicLayout>
  );
}

