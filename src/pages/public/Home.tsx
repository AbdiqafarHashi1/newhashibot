import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { ArrowRight, Zap, TrendingUp, Shield, Clock, BarChart2, Send } from 'lucide-react';

const markets = [
  'BTCUSDT','ETHUSDT','SOLUSDT','XAUUSD',
  'EURUSD','GBPUSD','USDJPY','BNBUSDT',
  'AVAXUSDT','LINKUSDT','XRPUSDT','GBPJPY',
];

export default function Home() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(37,99,235,0.12),transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-20 text-center relative">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1.5 text-xs text-blue-400 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live Signal Engine — 20 Markets Scanned Continuously
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
            Systematic<br />
            <span className="text-blue-400">trading signals</span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            HashiBot scans 20 crypto and forex markets using rule-based strategies, scores every setup
            through an arbitrator, and delivers graded signals to your dashboard and Telegram.
            Crypto uses Binance public data. Forex is demo until a real provider is configured.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-colors">
              Start Free Trial <ArrowRight size={16} />
            </Link>
            <Link to="/signal-mode" className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-6 py-3 rounded-lg font-medium transition-colors">
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Market ticker strip */}
      <div className="border-y border-zinc-800 bg-zinc-900/40 py-4 overflow-hidden">
        <div className="flex gap-6 animate-none px-6 flex-wrap justify-center">
          {markets.map(m => (
            <span key={m} className="text-xs font-mono text-zinc-400 bg-zinc-800 px-3 py-1 rounded">{m}</span>
          ))}
        </div>
      </div>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3">Not a signal group. A signal engine.</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">Three systematic strategies run on every market, every timeframe. Only the best setups make it through the arbitrator.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Zap, title: 'MicroScalper', desc: 'Fast momentum signals on 5m and 15m. EMA direction + RSI confirmation + ATR stops. No chop, no guessing.' },
            { icon: BarChart2, title: 'CompressionBreakout', desc: 'Identifies range compression, waits for genuine breakout with ATR expansion. Fakeout risk field included.' },
            { icon: TrendingUp, title: 'TrendContinuation', desc: 'Catches clean pullbacks in established trends. Requires EMA alignment + rejection candle + regime confirmation.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center mb-4">
                <Icon size={18} className="text-blue-400" />
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-zinc-900/30 border-y border-zinc-800 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-3">How HashiBot works</h2>
            <p className="text-zinc-400">A multi-layer system that goes from raw price data to graded signal</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { step: '01', icon: BarChart2, title: 'Market Feed', desc: 'Binance public API for crypto (no key required). Forex uses demo candles until a real provider is configured.' },
              { step: '02', icon: Zap, title: 'Indicator Engine', desc: 'EMA20/50, ATR14, RSI14, regime classification per symbol and timeframe.' },
              { step: '03', icon: Shield, title: 'Strategy Arbitrator', desc: 'All candidates scored. Only setups above 75 (grade A) are published by default.' },
              { step: '04', icon: Send, title: 'Signal Delivery', desc: 'Signals hit your dashboard instantly. One click sends to your Telegram channel.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="text-xs font-mono text-zinc-600 mb-3">{step}</div>
                <Icon size={20} className="text-blue-400 mb-3" />
                <h3 className="font-semibold mb-1.5 text-sm">{title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Grades */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4">Every signal is graded before it reaches you</h2>
            <p className="text-zinc-400 mb-6 leading-relaxed">
              The Strategy Arbitrator scores every candidate setup across 7 dimensions —
              regime fit, risk/reward, volatility quality, timeframe weight, and more.
              Nothing is published below grade A.
            </p>
            <div className="space-y-3">
              {[
                { grade: 'A+', score: '85+', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                { grade: 'A', score: '75–84', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                { grade: 'B', score: '65–74', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', note: 'Admin visible only' },
                { grade: 'Reject', score: '<65', color: 'text-zinc-500', bg: 'bg-zinc-800/50 border-zinc-700/50', note: 'Logged, not published' },
              ].map(({ grade, score, color, bg, note }) => (
                <div key={grade} className={`flex items-center justify-between p-3 rounded-lg border ${bg}`}>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold text-sm ${color}`}>{grade}</span>
                    <span className="text-xs text-zinc-500">Score {score}</span>
                  </div>
                  {note && <span className="text-xs text-zinc-600">{note}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-zinc-400">Sample signal output</span>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="text-emerald-400 font-bold">HASHIBOT A+ SIGNAL</div>
              <div className="text-zinc-400">Symbol: <span className="text-white">BTCUSDT</span></div>
              <div className="text-zinc-400">Timeframe: <span className="text-white">1h</span></div>
              <div className="text-zinc-400">Direction: <span className="text-emerald-400">BUY</span></div>
              <div className="text-zinc-400">Entry: <span className="text-white">67,240 – 67,380</span></div>
              <div className="text-zinc-400">Stop Loss: <span className="text-red-400">66,890</span></div>
              <div className="text-zinc-400">TP1: <span className="text-blue-400">67,720</span></div>
              <div className="text-zinc-400">TP2: <span className="text-blue-400">68,400</span></div>
              <div className="text-zinc-400">Risk/Reward: <span className="text-white">2.8R</span></div>
              <div className="text-zinc-400">Strategy: <span className="text-white">TrendContinuation</span></div>
              <div className="text-zinc-400">Confidence: <span className="text-emerald-400">88%</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/20 rounded-2xl p-10 text-center">
          <h2 className="text-3xl font-bold mb-3">Trade with a transparent, rule-based system</h2>
          <p className="text-zinc-400 mb-3 max-w-lg mx-auto">Access signals across 20 markets with full transparency on strategy, regime, and entry logic.</p>
          <p className="text-xs text-zinc-600 mb-8 max-w-md mx-auto">Signals are strategy-generated and must be validated before live use. Past setups do not guarantee future results.</p>
          <Link to="/register" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-medium transition-colors">
            Get Started <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
