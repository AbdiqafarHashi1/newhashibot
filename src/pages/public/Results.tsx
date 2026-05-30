import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { BarChart2, TrendingUp, Zap, Lock, ArrowRight, Info, CheckCircle } from 'lucide-react';

const strategies = [
  {
    name: 'MicroScalper',
    icon: Zap,
    desc: 'Fast momentum entries on 5m and 15m. Trades the early part of a directional move with EMA + RSI confirmation.',
    stats: {
      signals: 142,
      winRate: '63%',
      avgRR: '1.9R',
      topMarket: 'ETHUSDT',
      bestGrade: 'A+',
      timeframes: '5m, 15m',
    },
    trades: [
      { symbol: 'BTCUSDT', dir: 'BUY', grade: 'A+', entry: '67,240', sl: '66,890', tp1: '67,720', rr: '2.4R', outcome: 'TP1 Hit' },
      { symbol: 'ETHUSDT', dir: 'BUY', grade: 'A', entry: '3,480', sl: '3,440', tp1: '3,540', rr: '1.8R', outcome: 'TP1 Hit' },
      { symbol: 'SOLUSDT', dir: 'SELL', grade: 'A', entry: '142.50', sl: '145.20', tp1: '138.10', rr: '2.1R', outcome: 'Stopped Out' },
      { symbol: 'BNBUSDT', dir: 'BUY', grade: 'A+', entry: '412.00', sl: '406.00', tp1: '421.00', rr: '2.2R', outcome: 'TP2 Hit' },
    ],
  },
  {
    name: 'CompressionBreakout',
    icon: BarChart2,
    desc: 'Identifies range compression and waits for a genuine ATR-expansion breakout. Fakeout risk field included.',
    stats: {
      signals: 89,
      winRate: '58%',
      avgRR: '2.3R',
      topMarket: 'BTCUSDT',
      bestGrade: 'A+',
      timeframes: '15m, 1h',
    },
    trades: [
      { symbol: 'BTCUSDT', dir: 'BUY', grade: 'A+', entry: '66,100', sl: '65,600', tp1: '67,100', rr: '2.8R', outcome: 'TP1 Hit' },
      { symbol: 'AVAXUSDT', dir: 'SELL', grade: 'A', entry: '38.40', sl: '39.20', tp1: '36.80', rr: '2.0R', outcome: 'TP1 Hit' },
      { symbol: 'LINKUSDT', dir: 'BUY', grade: 'A', entry: '14.20', sl: '13.85', tp1: '14.80', rr: '1.9R', outcome: 'Stopped Out' },
      { symbol: 'ETHUSDT', dir: 'BUY', grade: 'A+', entry: '3,520', sl: '3,470', tp1: '3,640', rr: '2.6R', outcome: 'TP2 Hit' },
    ],
  },
  {
    name: 'SwingContinuation',
    icon: TrendingUp,
    desc: 'Catches clean pullbacks in established trends. Requires EMA alignment, rejection candle, and regime confirmation.',
    stats: {
      signals: 67,
      winRate: '71%',
      avgRR: '2.6R',
      topMarket: 'BTCUSDT',
      bestGrade: 'A+',
      timeframes: '1h, 4h',
    },
    trades: [
      { symbol: 'BTCUSDT', dir: 'BUY', grade: 'A+', entry: '65,800', sl: '64,900', tp1: '67,200', rr: '3.1R', outcome: 'TP2 Hit' },
      { symbol: 'ETHUSDT', dir: 'BUY', grade: 'A+', entry: '3,200', sl: '3,100', tp1: '3,420', rr: '2.8R', outcome: 'TP1 Hit' },
      { symbol: 'SOLUSDT', dir: 'BUY', grade: 'A', entry: '138.00', sl: '133.50', tp1: '145.50', rr: '2.0R', outcome: 'TP1 Hit' },
      { symbol: 'XRPUSDT', dir: 'SELL', grade: 'A', entry: '0.5480', sl: '0.5560', tp1: '0.5320', rr: '2.2R', outcome: 'Stopped Out' },
    ],
  },
];

function outcomeColor(outcome: string) {
  if (outcome === 'TP2 Hit') return 'text-emerald-400';
  if (outcome === 'TP1 Hit') return 'text-blue-400';
  return 'text-zinc-500';
}

function dirColor(dir: string) {
  return dir === 'BUY' ? 'text-emerald-400' : 'text-red-400';
}

export default function Results() {
  return (
    <PublicLayout>
      {/* Header */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-12">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3.5 py-1.5 text-xs text-yellow-500 mb-6 font-medium">
            <Info size={11} />
            Example display — not live performance data
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Strategy showcase</h1>
          <p className="text-zinc-400 leading-relaxed text-sm sm:text-base max-w-2xl">
            This page shows the format and depth of signal analytics HashiBot tracks.
            Live performance data will be published here as the system builds a verified track record.
            All figures below are example data for illustration purposes only.
          </p>
        </div>
      </section>

      {/* Disclaimer banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-12">
        <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-5 py-4 flex items-start gap-3">
          <Info size={15} className="text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-yellow-400 mb-1">Example data — not a track record</div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              All signals, win rates, and statistics shown below are illustrative examples generated to demonstrate
              the platform format. They do not represent real trades taken or actual historical performance.
              Live signal history will appear here after verifiable data has been collected.
              Past performance of any signal system does not guarantee future results.
            </p>
          </div>
        </div>
      </div>

      {/* Strategy cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-24 space-y-12">
        {strategies.map(strat => (
          <div key={strat.name} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {/* Strategy header */}
            <div className="p-6 border-b border-zinc-800">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-600/12 border border-blue-600/20 flex items-center justify-center shrink-0">
                    <strat.icon size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold mb-1">{strat.name}</h2>
                    <p className="text-sm text-zinc-500 leading-relaxed max-w-lg">{strat.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-3 py-1.5 text-xs text-yellow-500 shrink-0">
                  <Info size={11} />
                  Example data
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-6">
                {[
                  { label: 'Signals', value: strat.stats.signals.toString() },
                  { label: 'Win Rate', value: strat.stats.winRate },
                  { label: 'Avg R:R', value: strat.stats.avgRR },
                  { label: 'Top Market', value: strat.stats.topMarket },
                  { label: 'Best Grade', value: strat.stats.bestGrade },
                  { label: 'Timeframes', value: strat.stats.timeframes },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                    <div className="text-xs text-zinc-600 mb-1">{label}</div>
                    <div className="text-sm font-semibold text-zinc-200">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample trades table */}
            <div className="p-6">
              <div className="text-xs text-zinc-600 uppercase tracking-wider font-medium mb-4">Sample signal log</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-600 border-b border-zinc-800">
                      <th className="text-left pb-3 font-medium">Symbol</th>
                      <th className="text-left pb-3 font-medium">Dir</th>
                      <th className="text-left pb-3 font-medium">Grade</th>
                      <th className="text-right pb-3 font-medium">Entry</th>
                      <th className="text-right pb-3 font-medium">SL</th>
                      <th className="text-right pb-3 font-medium">TP1</th>
                      <th className="text-right pb-3 font-medium">R:R</th>
                      <th className="text-right pb-3 font-medium">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {strat.trades.map((t, i) => (
                      <tr key={i} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3 font-mono font-medium text-zinc-200">{t.symbol}</td>
                        <td className={`py-3 font-semibold ${dirColor(t.dir)}`}>{t.dir}</td>
                        <td className="py-3">
                          <span className={`font-bold ${t.grade === 'A+' ? 'text-emerald-400' : 'text-blue-400'}`}>{t.grade}</span>
                        </td>
                        <td className="py-3 text-right font-mono text-zinc-400">{t.entry}</td>
                        <td className="py-3 text-right font-mono text-red-400">{t.sl}</td>
                        <td className="py-3 text-right font-mono text-blue-400">{t.tp1}</td>
                        <td className="py-3 text-right font-mono text-zinc-300">{t.rr}</td>
                        <td className={`py-3 text-right font-medium ${outcomeColor(t.outcome)}`}>{t.outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}

        {/* Live data coming */}
        <div className="bg-zinc-900/50 border border-zinc-800/70 rounded-2xl p-10 text-center max-w-xl mx-auto">
          <Lock size={32} className="text-zinc-700 mx-auto mb-4" />
          <h2 className="text-lg font-bold mb-2">Live performance available after login</h2>
          <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
            Authenticated subscribers can view the complete live signal history,
            outcome breakdown, and per-strategy analytics from their dashboard.
          </p>
          <div className="space-y-2 text-left mb-8 max-w-xs mx-auto">
            {[
              'Complete signal history with outcomes',
              'Per-strategy win rate over time',
              'Market breakdown by signal count',
              'TP1 vs TP2 hit rate analysis',
            ].map(f => (
              <div key={f} className="flex items-center gap-2.5">
                <CheckCircle size={13} className="text-zinc-600 shrink-0" />
                <span className="text-xs text-zinc-500">{f}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              Create Account <ArrowRight size={14} />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              Log In
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
