import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { ArrowRight, Clock, Settings, Shield, Cpu, CheckCircle, Bell } from 'lucide-react';

const planned = [
  'Personal-mode dashboard for setup preferences, status, and onboarding notes',
  'Aggressive/frequent qualified setup profile planned for personal accounts',
  'Risk and leverage guidance surfaced before any connector is enabled',
  'Demo connector planned first for observation and testing',
  'Crypto-first roadmap with forex considered later',
  'No broker connection, live execution, or order placement is available currently',
];

export default function PersonalEA() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(37,99,235,0.08),transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-20 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-3.5 py-1.5 text-xs text-zinc-400 mb-6 font-medium">
              <Clock size={11} />
              Personal EA Setup — Coming Soon / Waitlist
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Personal-mode setup<br />
              <span className="text-zinc-400">planned for power users</span>
            </h1>
            <p className="text-lg text-zinc-400 leading-relaxed mb-4 max-w-2xl">
              Personal EA Setup is a planned onboarding package for users who want a more aggressive personal-mode workflow around qualified crypto setups.
            </p>
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-200 mb-6">
              Expected price: <span className="font-semibold text-white">10,000 KES/month or $100/month</span>
            </div>
            <p className="text-sm text-zinc-600 max-w-xl leading-relaxed mb-10">
              This is not live execution. Demo connector planning comes first, and HashiBot does not currently connect brokers or place orders for Personal Mode.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-7 py-3.5 rounded-lg font-semibold transition-colors shadow-lg shadow-blue-600/20 text-sm">
                Join Personal Mode Waitlist <ArrowRight size={16} />
              </Link>
              <Link to="/app/telegram" className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-7 py-3.5 rounded-lg font-medium transition-colors text-sm">
                Contact Admin
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-800/70 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Planned Personal Mode scope</h2>
            <p className="text-zinc-500 text-sm max-w-xl mx-auto">A setup waitlist for future tooling; live execution, MT5/OANDA/Binance order placement, and broker connections are not available today.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto mb-12">
            {[
              { icon: Cpu, title: 'Personal dashboard', desc: 'Planned dashboard for onboarding status, personal-mode preferences, and risk guidance.' },
              { icon: Settings, title: 'Aggressive setup profile', desc: 'More frequent qualified setup profile planned, still bounded by risk/leverage guidance and transparency.' },
              { icon: Shield, title: 'Demo connector first', desc: 'Connector work starts in demo/observation mode before any live capability is considered.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-blue-600/12 border border-blue-600/20 flex items-center justify-center mb-4">
                  <Icon size={18} className="text-blue-400" />
                </div>
                <h3 className="font-semibold mb-2 text-sm">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-2xl p-7 max-w-2xl mx-auto">
            <div className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-5">Planned feature list</div>
            <div className="space-y-3">
              {planned.map(f => (
                <div key={f} className="flex items-start gap-3">
                  <CheckCircle size={13} className="text-zinc-600 mt-0.5 shrink-0" />
                  <span className="text-sm text-zinc-400 leading-relaxed">{f}</span>
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
          <h2 className="text-xl font-bold mb-3">Join the Personal Mode waitlist</h2>
          <p className="text-zinc-400 text-sm mb-2 leading-relaxed">
            Request setup interest now. Admin will confirm availability when demo-first Personal Mode onboarding is ready.
          </p>
          <p className="text-xs text-zinc-600 mb-8">Crypto Signal Room is live today while Personal Mode remains planned.</p>
          <div className="flex flex-col gap-3">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors text-sm shadow-lg shadow-blue-600/20">
              Join Personal Mode Waitlist <ArrowRight size={14} />
            </Link>
            <Link to="/signal-mode" className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200 px-8 py-3 rounded-lg text-sm transition-colors">
              View live Signal Mode <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
