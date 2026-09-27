import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { ArrowRight, CheckCircle2, Settings, Shield, Cpu, CheckCircle, Bell, Zap } from 'lucide-react';

const readyFeatures = [
  'Personal-mode dashboard with real-time setup preferences, health telemetry, and status',
  'Aggressive/frequent qualified setup profile tailored for personal spot and futures accounts',
  'Custom risk, leverage limits, and maximum drawdown boundaries configured directly by user',
  'Direct high-speed REST & WebSocket connector for Binance & Bybit accounts',
  'Multi-timeframe scanner coverage across BTC, ETH, SOL, and top major pairs',
  'Immediate trade execution with synchronized Stop Loss and multi-target Take Profits',
];

export default function PersonalEA() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(37,99,235,0.08),transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-20 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3.5 py-1.5 text-xs text-emerald-400 mb-6 font-medium">
              <Zap size={13} className="text-emerald-400" />
              Crypto Personal Bot — Product Preview — Demo Certification Required
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Automated crypto execution<br />
              <span className="text-blue-400">built for power users</span>
            </h1>
            <p className="text-lg text-zinc-300 leading-relaxed mb-4 max-w-2xl">
              Crypto Personal Bot connects directly to your Binance or Bybit exchange account to automatically execute high-probability setups identified by HashiBot&apos;s arbitrator.
            </p>
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-200 mb-6">
              Subscription: <span className="font-semibold text-white">$100/month per connected accountnth ($100/month)</span>
            </div>
            <p className="text-sm text-zinc-400 max-w-xl leading-relaxed mb-10">
              Non-custodial execution model. Funds remain safely in your exchange account while trades are sized and placed with sub-second latency.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/pricing?package=crypto_personal_bot" className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-7 py-3.5 rounded-lg font-semibold transition-colors shadow-lg shadow-blue-600/20 text-sm">
                Activate Crypto Personal Bot <ArrowRight size={16} />
              </Link>
              <Link to="/contact" className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-7 py-3.5 rounded-lg font-medium transition-colors text-sm">
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-800/70 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Crypto Personal Bot Capabilities</h2>
            <p className="text-zinc-400 text-sm max-w-xl mx-auto">Production-ready algorithmic infrastructure engineered for Binance and Bybit traders.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto mb-12">
            {[
              { icon: Cpu, title: 'Live Control Dashboard', desc: 'Real-time dashboard for position telemetry, Bot execution preferences, and risk guidance.' },
              { icon: Settings, title: 'Optimized Setup Engine', desc: 'Continuous market scanning across multiple timeframes with automatic 7-factor signal scoring.' },
              { icon: Shield, title: 'Non-Custodial Architecture', desc: 'Write-only API permissions with strict withdrawal bans for maximum capital safety.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-blue-600/12 border border-blue-600/20 flex items-center justify-center mb-4">
                  <Icon size={18} className="text-blue-400" />
                </div>
                <h3 className="font-semibold mb-2 text-sm text-white">{title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-2xl p-7 max-w-2xl mx-auto">
            <div className="text-xs text-blue-400 uppercase tracking-wider font-bold mb-5 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-blue-400" />
              Included with Crypto Personal Bot
            </div>
            <div className="space-y-3">
              {readyFeatures.map(f => (
                <div key={f} className="flex items-start gap-3">
                  <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-zinc-300 leading-relaxed">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="bg-zinc-900/50 border border-zinc-800/70 rounded-2xl p-10 max-w-xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/12 border border-blue-600/20 flex items-center justify-center mx-auto mb-6">
            <Bell size={24} className="text-blue-400" />
          </div>
          <h2 className="text-xl font-bold mb-3 text-white">Get Started with Crypto Personal Bot</h2>
          <p className="text-zinc-300 text-sm mb-4 leading-relaxed">
            Subscribe now to start automated algorithmic trade execution on your Binance or Bybit account. Includes full Crypto Signal Room access.
          </p>
          <div className="flex flex-col gap-3">
            <Link to="/pricing?package=crypto_personal_bot" className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors text-sm shadow-lg shadow-blue-600/20">
              Subscribe to Crypto Personal Bot ($100/month per connected account) <ArrowRight size={14} />
            </Link>
            <Link to="/ai-signals" className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 px-8 py-3 rounded-lg text-sm transition-colors">
              View VIP Signal Room <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

