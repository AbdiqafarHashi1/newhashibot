import { PublicLayout } from '../../components/layout/PublicLayout';
import { 
  CheckCircle2, ArrowRight, ShieldCheck, 
  TrendingUp, Bell, BarChart3
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AISignals() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3.5 py-1 text-xs text-emerald-400 font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Product • Crypto Signal Room
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Structured AI & Algorithmic Trading Signals
          </h1>

          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Systematic market scanning, rule-based strategy evaluation, and centralized arbitration deliver precise trading setups directly to your Telegram and HashiBot Dashboard.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/pricing?package=crypto_signal_room#mpesa-payment-section"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 text-xs"
            >
              <span>Subscribe to Signal Room (5,000 KES/mo)</span>
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/results#performance-summary"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-semibold px-7 py-3 rounded-xl transition-all text-xs"
            >
              <span>View Performance History</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Decision Pipeline */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto space-y-10">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Systematic Generation</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Signal Decision Pipeline</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            Every signal passes through an 8-stage verification process before dispatch.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { step: '1', name: 'Market Data', detail: 'Real-time WebSocket tick feeds' },
            { step: '2', name: 'Scanner', detail: 'Multi-timeframe structure scan' },
            { step: '3', name: 'Strategies', detail: 'Compression & pullback evaluation' },
            { step: '4', name: 'Qualification', detail: '7-factor grading thresholds' },
            { step: '5', name: 'Arbitration', detail: 'Deterministic winner selection' },
            { step: '6', name: 'Signal Truth', detail: 'Immutable record saved' },
            { step: '7', name: 'Delivery', detail: 'Dashboard & Telegram dispatch' },
            { step: '8', name: 'Outcome Track', detail: 'Verified TP/SL performance log' },
          ].map((item) => (
            <div key={item.step} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] font-bold text-blue-400 font-mono">STEP {item.step}</span>
              <div className="font-bold text-white text-xs">{item.name}</div>
              <div className="text-[11px] text-zinc-400">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Illustrative Signal Format Card */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/50 border-y border-zinc-800/80">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Signal Format & Anatomy</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">What A HashiBot Signal Looks Like</h2>
            <p className="text-xs text-zinc-400">Every signal provides exact parameters, stop losses, profit targets, and evidence reasoning.</p>
          </div>

          {/* Signal Card Component */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
            {/* Tag */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider">
                  Illustrative Signal Format
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Grade A+ (94/100)
                </span>
              </div>
              <span className="text-xs font-mono text-zinc-500">ID: sig-btc-illustrative</span>
            </div>

            {/* Signal Main Data Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block mb-1 font-mono text-[10px]">SYMBOL</span>
                <span className="font-extrabold text-white text-base">BTC / USDT</span>
              </div>
              <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block mb-1 font-mono text-[10px]">DIRECTION</span>
                <span className="font-extrabold text-emerald-400 text-base flex items-center gap-1">
                  <TrendingUp size={16} /> BUY / LONG
                </span>
              </div>
              <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block mb-1 font-mono text-[10px]">TIMEFRAME</span>
                <span className="font-bold text-white text-base font-mono">15m</span>
              </div>
              <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 block mb-1 font-mono text-[10px]">RISK : REWARD</span>
                <span className="font-bold text-cyan-400 text-base font-mono">1 : 2.55</span>
              </div>
            </div>

            {/* Price Levels */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
                <span className="text-zinc-500 text-[10px] block">ENTRY ZONE</span>
                <span className="font-bold text-white text-sm">$68,200.00 – $68,500.00</span>
              </div>
              <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                <span className="text-red-400 text-[10px] block font-bold">STOP LOSS</span>
                <span className="font-bold text-red-300 text-sm">$67,400.00 (-1.31%)</span>
              </div>
              <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 space-y-1">
                <span className="text-emerald-400 text-[10px] block font-bold">TAKE PROFIT TARGETS</span>
                <div className="text-emerald-300 text-xs font-bold">TP1: $69,500.00 (+1.75%)</div>
                <div className="text-emerald-300 text-xs font-bold">TP2: $70,800.00 (+3.65%)</div>
              </div>
            </div>

            {/* Evidence & Strategy */}
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="font-bold text-white">Qualifying Strategy:</span>
                <span className="font-mono text-blue-400">Compression Breakout + Volume Spike</span>
              </div>
              <p className="text-zinc-300 leading-relaxed text-[11px]">
                <strong className="text-zinc-200">Supporting Evidence:</strong> RSI oversold divergence on 15m chart, 4h macro trend alignment, bid orderbook wall identified at $68,150 on Binance futures depth.
              </p>
            </div>

            {/* Outcome Banner */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs text-emerald-300">
              <span className="font-bold flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-400" />
                Verified Status: TP1 Hit (+1.75% R)
              </span>
              <span className="text-[11px] font-mono text-zinc-400">Tracked in Signal History</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Signal Mode */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Key Advantages</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Why Subscribe to AI Signals?</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          {[
            {
              title: 'No API Keys Required',
              desc: 'Keep complete control of your exchange account. Signals are delivered as actionable alerts for manual execution.',
              icon: ShieldCheck,
            },
            {
              title: 'Instant Telegram Notifications',
              desc: 'High-priority notifications delivered directly to your phone via Telegram within milliseconds of signal approval.',
              icon: Bell,
            },
            {
              title: 'Transparent Performance Audit',
              desc: 'Every signal is logged to public history upon generation and tracked until SL exit or TP target achievement.',
              icon: BarChart3,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Icon size={18} />
                </div>
                <h3 className="font-bold text-sm text-white">{item.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/60 border-t border-zinc-800/80 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Join the Crypto Signal Room Today
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Get instant access to structured signals, risk levels, and Telegram alerts for 5,000 KES / month.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/pricing?package=crypto_signal_room#mpesa-payment-section"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              Subscribe Now (5,000 KES/mo)
            </Link>
            <Link
              to="/contact?category=Signals%20%26%20Strategy#contact-form"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs px-6 py-3 rounded-xl transition-all border border-zinc-700"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
