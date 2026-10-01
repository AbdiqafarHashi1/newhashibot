import { PublicLayout } from '../../components/layout/PublicLayout';
import { 
  ShieldCheck, Lock, ArrowRight,
  RefreshCw, Key, ShieldAlert
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CryptoAutomation() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3.5 py-1 text-xs text-emerald-400 font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Product • Crypto Personal Bot
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Automated Crypto Execution Infrastructure
          </h1>

          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Connect your personal Binance or Bybit exchange account. HashiBot automatically sizes, executes, and protects trades based on your personal risk profile and immutable platform signals.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/execution/crypto"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 text-xs"
            >
              <span>Get Crypto Personal Bot ($100/month per connected execution account)</span>
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/features#execution"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-semibold px-7 py-3 rounded-xl transition-all text-xs"
            >
              <span>Explore Platform Features</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Execution Workflow */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto space-y-10">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Automated Pipeline</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Execution & Risk Workflow</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {[
            { step: '1', title: 'Signal Truth', desc: 'Approved signal received from arbitrator' },
            { step: '2', title: 'Risk Profile', desc: 'User risk % and daily limit evaluated' },
            { step: '3', title: 'Capital Sizing', desc: 'Exact lot size calculated per balance' },
            { step: '4', title: 'Exchange Exec', desc: 'Direct order placement on Binance/Bybit' },
            { step: '5', title: 'Protection', desc: 'SL & TP orders placed immediately' },
            { step: '6', title: 'Monitoring', desc: 'Reconciliation & break-even management' },
          ].map((item) => (
            <div key={item.step} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
              <span className="text-[10px] font-bold text-blue-400 font-mono">STEP {item.step}</span>
              <h3 className="font-bold text-white text-xs">{item.title}</h3>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported Exchanges & Security */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/50 border-y border-zinc-800/80">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Supported Exchanges */}
          <div className="space-y-6">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Supported Venues</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Binance & Bybit Integration</h2>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                HashiBot connects directly to official exchange APIs using secure REST and WebSocket connections.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                <div className="font-bold text-white text-sm flex items-center justify-between">
                  <span>Binance</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">Spot & Futures</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Direct connection for Binance USDT-M Perpetual Futures and Spot pairs with sub-second execution.
                </p>
              </div>

              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                <div className="font-bold text-white text-sm flex items-center justify-between">
                  <span>Bybit</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">Unified Margin</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Support for Bybit V5 Unified Trading Account (UTA) and Inverse/USDT Futures contracts.
                </p>
              </div>
            </div>
          </div>

          {/* Security & Customer Control Box */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Non-Custodial Security Model</h3>
                <p className="text-xs text-zinc-400">Your funds never leave your exchange account.</p>
              </div>
            </div>

            <ul className="space-y-3 text-xs text-zinc-300">
              <li className="flex items-start gap-2.5">
                <Lock size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Write-Only API Keys</strong>
                  HashiBot requires standard trading permissions only. Keys are encrypted at rest and never shown in the UI.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <ShieldAlert size={16} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Zero Withdrawal Permissions</strong>
                  Withdrawal permissions are strictly forbidden. Any key created with withdrawal rights will be rejected.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <Key size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Instant Access Revocation</strong>
                  You retain full ownership and can revoke API key permissions directly on your exchange at any moment.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <RefreshCw size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block">Emergency Kill Switch</strong>
                  Pause or stop bot execution instantly from your HashiBot customer dashboard.
                </div>
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* Pricing CTA */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/60 border-t border-zinc-800/80 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Automate Your Crypto Trading
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Subscribe to Crypto Personal Bot for $100/month per connected execution account. Includes full VIP Signal Room access.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/execution/crypto"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              Get Crypto Bot ($100/month per connected account)
            </Link>
            <Link
              to="/contact?category=Crypto%20Automation#contact-form"
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
