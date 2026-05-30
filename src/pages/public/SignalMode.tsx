import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import {
  CheckCircle, ArrowRight, Radio, Target, Shield,
  MessageCircle, BarChart2, Zap, TrendingUp, Clock
} from 'lucide-react';

const cryptoMarkets = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'POLUSDT',
];

const features = [
  { icon: Target, title: 'Entry zones, not vague prices', desc: 'Each signal includes a defined entry zone — a range to fill at, not a single price that moves before you click.' },
  { icon: Shield, title: 'Stop loss and two take profit levels', desc: 'Risk is defined before the trade. TP1 is conservative, TP2 captures the full move. Risk/reward on every signal.' },
  { icon: BarChart2, title: 'Grade filter — A and A+ only', desc: 'Candidates are scored against 7 dimensions. Only setups above 75 reach subscribers. No marginal calls.' },
  { icon: CheckCircle, title: 'Outcome tracking on every signal', desc: 'Every signal is tracked to completion — TP1 hit, TP2 hit, stopped out, or manually closed. Full history available.' },
  { icon: MessageCircle, title: 'Telegram delivery', desc: 'Confirmed signals go to your private Telegram channel. Alerts land while the setup is still valid.' },
  { icon: Clock, title: 'One active signal per symbol', desc: 'No overexposure. Only one live signal per market at a time — the next setup waits until the current one closes.' },
];

const steps = [
  { n: '1', title: 'Create your account', desc: 'Register with your email. Your dashboard is ready immediately.' },
  { n: '2', title: 'Request Signal Room access', desc: 'Submit your access request from your dashboard. An admin activates your account within 24 hours.' },
  { n: '3', title: 'Connect your Telegram', desc: 'Once approved, you receive a direct invite link to the private Telegram channel.' },
  { n: '4', title: 'Receive live signals', desc: 'Signals hit your Telegram and dashboard the moment they\'re confirmed. Full detail, ready to act on.' },
];

export default function SignalMode() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(37,99,235,0.12),transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-20 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1.5 text-xs text-blue-400 mb-6 font-medium">
              <Radio size={12} />
              Signal Mode — Live now
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Crypto signals with<br />
              <span className="text-blue-400">structure, not noise</span>
            </h1>
            <p className="text-lg text-zinc-400 leading-relaxed mb-8 max-w-2xl">
              HashiBot Signal Mode is an always-on market scanner across 10 crypto pairs.
              Three systematic strategies evaluate every market continuously.
              Only setups that score grade A or above are delivered to subscribers.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-7 py-3.5 rounded-lg font-semibold transition-colors shadow-lg shadow-blue-600/20 text-sm"
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

      {/* Feature grid */}
      <section className="border-t border-zinc-800/70 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">What's included in Signal Mode</h2>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">Every piece of information you need to evaluate and manage a trade — included in every signal.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-blue-600/12 border border-blue-600/20 flex items-center justify-center mb-4 group-hover:bg-blue-600/20 transition-colors shrink-0">
                  <Icon size={16} className="text-blue-400" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example signal + strategies */}
      <section className="bg-zinc-900/25 border-y border-zinc-800/70 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Signal example */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Example signal</h2>
              <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                This is what a confirmed A+ signal looks like in your dashboard and Telegram.
                Every field is calculated by the strategy engine — nothing is manually entered.
              </p>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-zinc-400 font-medium">Signal format</span>
                  </div>
                  <span className="text-xs bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-2.5 py-1 rounded-full font-semibold">A+ Grade</span>
                </div>
                <div className="font-mono text-xs space-y-0">
                  <div className="text-emerald-400 font-bold text-sm mb-4 tracking-wide">HASHIBOT SIGNAL — A+</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    {[
                      ['Symbol', 'BTCUSDT', 'text-white'],
                      ['Direction', 'BUY', 'text-emerald-400 font-semibold'],
                      ['Timeframe', '1h', 'text-white'],
                      ['Strategy', 'TrendContinuation', 'text-white'],
                      ['Entry Zone', '67,240 – 67,380', 'text-white'],
                      ['Stop Loss', '66,890', 'text-red-400 font-semibold'],
                      ['TP1', '67,720', 'text-blue-400 font-semibold'],
                      ['TP2', '68,400', 'text-blue-400 font-semibold'],
                      ['Risk/Reward', '2.8R', 'text-white font-semibold'],
                      ['Confidence', '88%', 'text-emerald-400 font-semibold'],
                    ].map(([label, value, cls]) => (
                      <div key={label}>
                        <div className="text-zinc-600 text-xs mb-0.5">{label}</div>
                        <div className={`text-xs ${cls}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 px-3 py-2 bg-zinc-800/50 rounded-lg text-xs text-zinc-600">
                  Example display — not a live trade recommendation
                </div>
              </div>
            </div>

            {/* Strategies */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Three strategies, one engine</h2>
              <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                Every market is evaluated by all three strategies simultaneously.
                A candidate only proceeds to scoring if the strategy's core conditions are met.
              </p>
              <div className="space-y-4">
                {[
                  {
                    icon: Zap,
                    name: 'MicroScalper',
                    tfs: '5m, 15m',
                    regime: 'Trend + Expansion',
                    desc: 'Fast momentum entries. EMA direction + RSI confirmation + ATR-sized stops. Trades the early part of a move.',
                  },
                  {
                    icon: BarChart2,
                    name: 'CompressionBreakout',
                    tfs: '15m, 1h',
                    regime: 'Compression + Breakout',
                    desc: 'Identifies range compression, waits for genuine breakout with ATR expansion. Includes fakeout risk assessment.',
                  },
                  {
                    icon: TrendingUp,
                    name: 'TrendContinuation',
                    tfs: '15m, 1h, 4h',
                    regime: 'Trend Up / Down',
                    desc: 'Catches clean pullbacks in established trends. Requires EMA alignment + rejection candle + regime confirmation.',
                  },
                ].map(({ icon: Icon, name, tfs, regime, desc }) => (
                  <div key={name} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="w-9 h-9 rounded-lg bg-blue-600/12 border border-blue-600/20 flex items-center justify-center shrink-0">
                        <Icon size={16} className="text-blue-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <span className="font-semibold text-sm">{name}</span>
                          <span className="text-xs text-zinc-600 font-mono">{tfs}</span>
                          <span className="text-xs text-zinc-600">{regime}</span>
                        </div>
                        <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Markets covered */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">10 crypto markets, live data</h2>
            <p className="text-zinc-500 text-sm">Binance public OHLCV API — real market data, no API key required.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-2xl mx-auto">
            {cryptoMarkets.map(m => (
              <div key={m} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-center hover:border-zinc-700 transition-colors">
                <span className="text-sm font-mono text-zinc-300">{m}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to get started */}
      <section className="bg-zinc-900/25 border-y border-zinc-800/70 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">How to get started</h2>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">Four steps from account creation to live signals in your Telegram.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-4xl mx-auto">
            {steps.map(({ n, title, desc }) => (
              <div key={n} className="relative">
                <div className="w-9 h-9 rounded-full bg-blue-600/15 border border-blue-600/25 flex items-center justify-center text-sm font-bold text-blue-400 mb-4">
                  {n}
                </div>
                <h3 className="font-semibold text-sm mb-2">{title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-24 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to start receiving signals?</h2>
        <p className="text-zinc-400 mb-8 max-w-lg mx-auto text-sm leading-relaxed">
          Join the Crypto Signal Room and get real-time alerts with complete trade parameters
          delivered to your dashboard and Telegram channel.
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
            className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-8 py-3.5 rounded-lg font-medium transition-colors text-sm"
          >
            View Pricing <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
