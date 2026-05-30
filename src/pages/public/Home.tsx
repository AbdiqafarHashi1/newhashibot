import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import {
  ArrowRight, Zap, TrendingUp, Shield, BarChart2, Send,
  CheckCircle, Radio, Target, Clock
} from 'lucide-react';

const cryptoMarkets = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'AVAXUSDT', 'LINKUSDT', 'ADAUSDT', 'DOGEUSDT', 'POLUSDT'];

export default function Home() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.15),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(6,182,212,0.06),transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-24 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1.5 text-xs text-blue-400 mb-8 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
              Live signal engine — 10 crypto markets scanned continuously
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
              Crypto signals with<br />
              <span className="text-blue-400">structure and clarity</span>
            </h1>
            <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-4 leading-relaxed">
              HashiBot delivers rule-based crypto signals with defined entry zones, stop loss,
              take profit levels, and full outcome tracking — straight to your dashboard and Telegram.
            </p>
            <p className="text-sm text-zinc-600 max-w-lg mx-auto mb-10">
              Uses Binance public market data. No guesswork, no manual calls. Every signal is graded before delivery.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-7 py-3.5 rounded-lg font-semibold transition-colors shadow-xl shadow-blue-600/20 text-sm"
              >
                Join Signal Room <ArrowRight size={16} />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-7 py-3.5 rounded-lg font-medium transition-colors text-sm"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Market strip */}
      <div className="border-y border-zinc-800/70 bg-zinc-900/30 py-4 overflow-hidden">
        <div className="flex gap-3 px-6 flex-wrap justify-center">
          {cryptoMarkets.map(m => (
            <span key={m} className="text-xs font-mono text-zinc-500 bg-zinc-800/70 border border-zinc-700/50 px-3 py-1.5 rounded-md">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Product pillars */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything a signal needs to be actionable</h2>
          <p className="text-zinc-400 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            Not a call group. Not a tip service. A systematic engine that scores every market setup
            and only sends what passes the grade.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              icon: Target,
              title: 'Defined Entry Zones',
              desc: 'Every signal includes a precise entry zone — not a single price, but a range you can actually fill at.',
            },
            {
              icon: Shield,
              title: 'Risk Levels Built In',
              desc: 'Stop loss and two take profit levels calculated per setup. Risk/reward ratio included on every alert.',
            },
            {
              icon: BarChart2,
              title: 'Graded Quality',
              desc: 'Setups scored across 7 dimensions. Only A and A+ grades reach subscribers. No marginal setups.',
            },
            {
              icon: CheckCircle,
              title: 'Outcome Tracking',
              desc: 'Every signal is tracked to completion — TP1 hit, TP2 hit, stopped out, or closed manually.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors group">
              <div className="w-10 h-10 rounded-lg bg-blue-600/15 border border-blue-600/25 flex items-center justify-center mb-4 group-hover:bg-blue-600/25 transition-colors">
                <Icon size={18} className="text-blue-400" />
              </div>
              <h3 className="font-semibold mb-2 text-sm">{title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-zinc-900/25 border-y border-zinc-800/70 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How HashiBot works</h2>
            <p className="text-zinc-400 text-sm sm:text-base max-w-lg mx-auto">
              From raw price data to a graded signal in your Telegram — five transparent steps.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-4">
            {[
              {
                step: '01',
                icon: BarChart2,
                title: 'Market Feed',
                desc: 'Binance public API feeds live OHLCV candles for 10 crypto pairs. No API key required.',
              },
              {
                step: '02',
                icon: Zap,
                title: 'Indicators',
                desc: 'EMA20/50, ATR14, RSI14, and regime classification computed per symbol and timeframe.',
              },
              {
                step: '03',
                icon: TrendingUp,
                title: 'Strategies',
                desc: 'Three strategies — MicroScalper, CompressionBreakout, TrendContinuation — evaluate each market.',
              },
              {
                step: '04',
                icon: Shield,
                title: 'Scoring & Grading',
                desc: 'Arbitrator scores all candidates. Only setups above 75 (grade A or A+) are published.',
              },
              {
                step: '05',
                icon: Send,
                title: 'Signal Delivery',
                desc: 'Confirmed signal hits your dashboard. One-click Telegram send to your private channel.',
              },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                <div className="text-xs font-mono text-zinc-600 mb-3 font-medium">{step}</div>
                <Icon size={18} className="text-blue-400 mb-3" />
                <h3 className="font-semibold mb-2 text-sm">{title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signal example + grades */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-5">What a signal looks like</h2>
            <p className="text-zinc-400 mb-6 leading-relaxed text-sm sm:text-base">
              Every signal includes everything you need to manage the trade — before, during, and after.
              No chasing entries. No ambiguous stop levels. No "update coming later."
            </p>

            <div className="space-y-3 mb-8">
              {[
                { grade: 'A+', score: '85+', color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/20', label: 'Best setups — high-conviction entries' },
                { grade: 'A', score: '75–84', color: 'text-blue-400', bg: 'bg-blue-500/8 border-blue-500/20', label: 'Solid setups — published to subscribers' },
                { grade: 'B', score: '65–74', color: 'text-yellow-400', bg: 'bg-yellow-500/8 border-yellow-500/20', label: 'Marginal — admin review only' },
                { grade: 'Reject', score: '<65', color: 'text-zinc-500', bg: 'bg-zinc-800/50 border-zinc-700/40', label: 'Logged for analysis, not published' },
              ].map(({ grade, score, color, bg, label }) => (
                <div key={grade} className={`flex items-center gap-4 px-4 py-3 rounded-lg border ${bg}`}>
                  <span className={`font-bold text-sm w-12 shrink-0 ${color}`}>{grade}</span>
                  <span className="text-xs text-zinc-600 w-14 shrink-0">Score {score}</span>
                  <span className="text-xs text-zinc-500">{label}</span>
                </div>
              ))}
            </div>

            <Link to="/signal-mode" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium">
              How Signal Mode works <ArrowRight size={14} />
            </Link>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-7 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Radio size={14} className="text-blue-400" />
                <span className="text-xs text-zinc-400 font-medium">Live signal format</span>
              </div>
              <span className="text-xs bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-2.5 py-1 rounded-full font-medium">A+ Grade</span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div className="text-emerald-400 font-bold text-sm tracking-wide">HASHIBOT SIGNAL — A+</div>
              <div className="h-px bg-zinc-800 my-3" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-zinc-600 mb-0.5">Symbol</div>
                  <div className="text-white font-semibold">BTCUSDT</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">Timeframe</div>
                  <div className="text-white font-semibold">1h</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">Direction</div>
                  <div className="text-emerald-400 font-semibold">BUY</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">Strategy</div>
                  <div className="text-white">TrendContinuation</div>
                </div>
              </div>
              <div className="h-px bg-zinc-800 my-3" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-zinc-600 mb-0.5">Entry Zone</div>
                  <div className="text-white">67,240 – 67,380</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">Stop Loss</div>
                  <div className="text-red-400 font-semibold">66,890</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">TP1</div>
                  <div className="text-blue-400 font-semibold">67,720</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">TP2</div>
                  <div className="text-blue-400 font-semibold">68,400</div>
                </div>
              </div>
              <div className="h-px bg-zinc-800 my-3" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-zinc-600 mb-0.5">Risk/Reward</div>
                  <div className="text-white font-semibold">2.8R</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">Confidence</div>
                  <div className="text-emerald-400 font-semibold">88%</div>
                </div>
              </div>
            </div>
            <div className="mt-5 px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-600">
              Example display — not a live trade recommendation
            </div>
          </div>
        </div>
      </section>

      {/* Social proof / trust row */}
      <section className="bg-zinc-900/25 border-y border-zinc-800/70 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            {[
              { value: '10', label: 'Crypto markets', sub: 'Binance public data' },
              { value: '3', label: 'Rule-based strategies', sub: 'No discretionary calls' },
              { value: 'A/A+', label: 'Minimum grade to publish', sub: 'Score 75+ required' },
            ].map(({ value, label, sub }) => (
              <div key={label}>
                <div className="text-4xl font-bold text-white mb-1">{value}</div>
                <div className="text-sm font-medium text-zinc-300 mb-1">{label}</div>
                <div className="text-xs text-zinc-600">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600/15 to-cyan-600/10 border border-blue-500/20 rounded-2xl p-12 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.12),transparent_60%)]" />
          <div className="relative">
            <Clock size={32} className="text-blue-400 mx-auto mb-5" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Start receiving structured crypto signals</h2>
            <p className="text-zinc-400 mb-3 max-w-lg mx-auto text-sm sm:text-base leading-relaxed">
              Join the Crypto Signal Room and get real-time alerts with entry zones, risk levels,
              and outcome tracking — delivered to your dashboard and Telegram.
            </p>
            <p className="text-xs text-zinc-600 mb-8 max-w-md mx-auto">
              Signals are strategy-generated and must be independently validated before live trading.
              Past setups do not guarantee future results.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-lg font-semibold transition-colors shadow-xl shadow-blue-600/20 text-sm"
              >
                Join Signal Room <ArrowRight size={16} />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 border border-zinc-600 hover:border-zinc-400 text-zinc-300 hover:text-white px-8 py-3.5 rounded-lg font-medium transition-colors text-sm"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
