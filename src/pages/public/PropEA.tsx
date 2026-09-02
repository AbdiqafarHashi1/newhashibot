import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { ArrowRight, Trophy, TrendingDown, BarChart2, CheckCircle, Bell, Shield, ShieldCheck } from 'lucide-react';

const differentiators = [
  'Conservative prop-safe configuration aligned with strict funded-account rule sets',
  'Automated daily drawdown and total maximum drawdown loss locks (e.g. 3.5% daily cap)',
  'Lower risk per trade (0.25% – 0.75%) and compliance-first position sizing guidance',
  'Prop challenge-aware alerts and rule safeguards displayed in real-time telemetry',
  'High-speed MetaTrader 5 Windows Bridge for instant sub-second order placement',
  'Continuous SL/TP drift audit to ensure trades never execute without strict downside gates',
];

export default function PropEA() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(37,99,235,0.08),transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-20 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3.5 py-1.5 text-xs text-amber-400 mb-6 font-medium">
              <ShieldCheck size={13} className="text-amber-400" />
              Forex MT5 Prop Bot — Live & Available Now
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Prop-firm compliant EA<br />
              <span className="text-amber-400">engineered for challenge rules</span>
            </h1>
            <p className="text-lg text-zinc-300 leading-relaxed mb-4 max-w-2xl">
              Forex MT5 Prop Bot is built specifically for strict prop firm challenges (FTMO, FundedNext, MFF) with conservative risk management, automated daily drawdown limits, and multi-symbol execution.
            </p>
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-200 mb-6">
              Subscription: <span className="font-semibold text-white">12,500 KES/month ($95 USD)</span>
            </div>
            <p className="text-sm text-zinc-400 max-w-xl leading-relaxed mb-10">
              Direct MetaTrader 5 execution via our dedicated Windows Daemon Bridge. Protects funded accounts with strict risk fences.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/pricing?package=forex_mt5_prop_bot" className="inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-7 py-3.5 rounded-lg font-semibold transition-colors shadow-lg shadow-amber-600/20 text-sm">
                Activate Forex MT5 Prop Bot <ArrowRight size={16} />
              </Link>
              <Link to="/results#interactive-backtester" className="inline-flex items-center justify-center gap-2 bg-zinc-900 border border-amber-500/30 hover:border-amber-500/60 text-amber-300 hover:text-white px-7 py-3.5 rounded-lg font-semibold transition-colors text-sm">
                <ShieldCheck size={16} className="text-amber-400" />
                Run $50k Prop Backtest
              </Link>
              <Link to="/contact" className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-6 py-3.5 rounded-lg font-medium transition-colors text-sm">
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-800/70 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-white">Prop-Safe Architecture & Capabilities</h2>
            <p className="text-zinc-400 text-sm max-w-xl mx-auto">
              Automated MT5 infrastructure with hardcoded capital protection designed to safeguard evaluation and funded accounts.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto mb-12">
            {[
              { icon: TrendingDown, title: 'Drawdown Loss Fences', desc: 'Hard daily loss locks and maximum trailing drawdown limits automatically halt trading if triggered.' },
              { icon: BarChart2, title: 'Conservative Risk Sizing', desc: 'Customizable 0.25% – 0.75% risk per setup prioritizing account survival and consistency over gamble.' },
              { icon: Trophy, title: 'Prop Rule Compliance', desc: 'Configurable trading windows, news event filters, and weekend hold prevention logic.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-amber-600/12 border border-amber-600/20 flex items-center justify-center mb-4">
                  <Icon size={18} className="text-amber-400" />
                </div>
                <h3 className="font-semibold mb-2 text-sm text-white">{title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-2xl p-7 max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-5">
              <Shield size={16} className="text-amber-400" />
              <span className="text-xs text-amber-400 uppercase tracking-wider font-bold">Challenge Protection Features</span>
            </div>
            <div className="space-y-3">
              {differentiators.map(f => (
                <div key={f} className="flex items-start gap-3">
                  <CheckCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-zinc-300 leading-relaxed">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="bg-zinc-900/50 border border-zinc-800/70 rounded-2xl p-10 max-w-xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-600/12 border border-amber-600/20 flex items-center justify-center mx-auto mb-6">
            <Bell size={24} className="text-amber-400" />
          </div>
          <h2 className="text-xl font-bold mb-3 text-white">Deploy Forex MT5 Prop Bot</h2>
          <p className="text-zinc-300 text-sm mb-4 leading-relaxed">
            Subscribe now to connect your MetaTrader 5 terminal with strict prop firm evaluation and funded protection rules.
          </p>
          <div className="flex flex-col gap-3">
            <Link to="/pricing?package=forex_mt5_prop_bot" className="inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors text-sm shadow-lg shadow-amber-600/20">
              Subscribe to Forex MT5 Prop Bot (12,500 KES/mo) <ArrowRight size={14} />
            </Link>
            <Link to="/mt5-automation" className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 px-8 py-3 rounded-lg text-sm transition-colors">
              Explore MT5 Architecture <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

