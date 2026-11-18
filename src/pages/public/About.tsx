import { PublicLayout } from '../../components/layout/PublicLayout';
import { 
  Zap, Target, Users
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function About() {
  return (
    <PublicLayout>
      {/* Header */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1 text-xs text-blue-400 font-bold uppercase tracking-wider">
            <Target size={14} />
            Our Mission & Architecture
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            About HashiBot Platform
          </h1>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            HashiBot brings structured market analysis, setup tracking and account controls into one platform.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 sm:p-12 space-y-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto">
            <Zap size={24} />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Platform Core Mission</h2>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-3xl mx-auto">
            To empower retail and institutional traders with disciplined, rule-based market scanning, deterministic signal arbitration, non-custodial automated execution, and institutional risk management across cryptocurrency and forex markets.
          </p>
        </div>
      </section>

      {/* What Makes HashiBot Different */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/50 border-y border-zinc-800/80">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Pillars of Differentiation</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">What Makes HashiBot Unique</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
            {[
              { title: '1. One Shared Signal Truth', desc: 'Each setup keeps a shared identity and recorded history across its applicable customer channels.' },
              { title: '2. Quality-Based Arbitration', desc: 'Multiple strategy candidates compete. Arbitration resolves competing candidates using the applicable market and trading-track rules.' },
              { title: '3. Account-Level Risk Controls', desc: 'Automatic lot/position sizing based on account balance and configured risk limits informs each account decision.' },
              { title: '4. Active Trade Protection', desc: 'Position monitoring, stop and target management, break-even updates and protection drift detection.' },
              { title: '5. Full Operations & Telemetry', desc: 'Deep admin and customer dashboards rendering real-time provider health, heartbeats, and command queue depth.' },
              { title: '6. Non-Custodial Architecture', desc: 'Your funds remain strictly on your personal exchange or MetaTrader 5 broker. HashiBot never accepts deposits.' },
            ].map((item) => (
              <div key={item.title} className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 space-y-2">
                <h3 className="font-bold text-sm text-white">{item.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto space-y-10">
        <div className="text-center space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Target Audience</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Who HashiBot Is Built For</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {[
            { role: 'Signal Subscribers', desc: 'Traders seeking high-probability Telegram alerts with exact SL/TP targets for manual execution.' },
            { role: 'Personal Crypto Traders', desc: 'Binance and Bybit users who want hands-free execution and disciplined position sizing.' },
            { role: 'Forex MT5 Traders', desc: 'Traders connecting personal MT5 broker terminals to automated forex strategies.' },
            { role: 'Prop Firm Traders', desc: 'Funded account holders requiring strict daily drawdown gates and risk controls for FTMO/FundedNext.' },
          ].map((item) => (
            <div key={item.role} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Users size={16} />
              </div>
              <h3 className="font-bold text-sm text-white">{item.role}</h3>
              <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 bg-zinc-900/60 border-t border-zinc-800/80 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Experience HashiBot Today
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Join the Crypto Signal Room or request a managed bot setup today.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/pricing#pricing-plans"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              View Pricing & Plans
            </Link>
            <Link
              to="/contact#contact-form"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs px-6 py-3 rounded-xl transition-all border border-zinc-700"
            >
              Contact Support Form
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
