import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { CheckCircle, ArrowRight, Radio } from 'lucide-react';

const features = [
  'Crypto signals use Binance public market data when available',
  'Forex provider is demo until a real data provider is configured',
  'Three rule-based strategies: MicroScalper, CompressionBreakout, TrendContinuation',
  'Signals scored and graded A+, A, B — only A and above sent to users by default',
  'Entry zone, Stop Loss, TP1, TP2, Risk/Reward on every signal',
  'Market regime classification per symbol + timeframe',
  'Telegram delivery — signal lands in your channel after admin review and send',
  'Signal history with full audit trail',
  'One-active-signal-per-symbol to prevent overexposure',
  'Signals are strategy-generated and must be tested before live trading',
];

const timeframes = [
  { tf: '5m', label: '5-Minute', desc: 'MicroScalper fast momentum entries' },
  { tf: '15m', label: '15-Minute', desc: 'MicroScalper + CompressionBreakout' },
  { tf: '1h', label: '1-Hour', desc: 'CompressionBreakout + TrendContinuation' },
  { tf: '4h', label: '4-Hour', desc: 'TrendContinuation high-timeframe setups' },
];

export default function SignalMode() {
  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1.5 text-xs text-blue-400 mb-5">
            <Radio size={12} />
            Signal Mode
          </div>
          <h1 className="text-5xl font-bold mb-5 leading-tight">Systematic signals.<br />Zero guesswork.</h1>
          <p className="text-lg text-zinc-400 leading-relaxed mb-8">
            HashiBot Signal Mode is an always-on market scanner. It detects high-probability setups
            using three systematic strategies, scores every candidate against 7 quality dimensions,
            and only delivers what meets the grade.
          </p>
          <Link to="/register" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-colors">
            Get Signal Access <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="border-t border-zinc-800 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold mb-8">What's included</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {features.map(f => (
              <div key={f} className="flex items-start gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
                <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-sm text-zinc-300">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold mb-8">Timeframe coverage</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {timeframes.map(({ tf, label, desc }) => (
              <div key={tf} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="text-2xl font-bold text-blue-400 mb-1">{tf}</div>
                <div className="font-medium text-sm mb-2">{label}</div>
                <div className="text-xs text-zinc-500">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-zinc-900/30 border-y border-zinc-800 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold mb-8">20 Markets scanned</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Crypto</div>
              {['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','POLUSDT'].map(s => (
                <div key={s} className="text-sm font-mono text-zinc-300 py-1 border-b border-zinc-800/50">{s}</div>
              ))}
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Forex / CFD</div>
              {['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD','EURJPY','GBPJPY','XAUUSD'].map(s => (
                <div key={s} className="text-sm font-mono text-zinc-300 py-1 border-b border-zinc-800/50">{s}</div>
              ))}
            </div>
            <div className="col-span-2">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Strategies</div>
              {[
                { name: 'MicroScalper', tfs: '5m, 15m', regime: 'Trend + Expansion' },
                { name: 'CompressionBreakout', tfs: '15m, 1h', regime: 'Compression + Breakout' },
                { name: 'TrendContinuation', tfs: '15m, 1h, 4h', regime: 'Trend Up / Down' },
              ].map(s => (
                <div key={s.name} className="py-2 border-b border-zinc-800/50">
                  <div className="text-sm text-white font-medium">{s.name}</div>
                  <div className="text-xs text-zinc-500">{s.tfs} · {s.regime}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Start receiving live signals today</h2>
        <p className="text-zinc-400 mb-8 max-w-lg mx-auto">Join HashiBot Signal Mode and get real-time alerts delivered to your Telegram the moment a setup is confirmed.</p>
        <Link to="/register" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-medium transition-colors">
          Get Started <ArrowRight size={16} />
        </Link>
      </section>
    </PublicLayout>
  );
}
