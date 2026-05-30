import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { ArrowRight, Clock, Settings, Shield, Cpu, CheckCircle, Bell } from 'lucide-react';

const planned = [
  'Connects directly to your MT5 account — your broker, your funds, your control',
  'Same signal engine as Signal Mode — MicroScalper, CompressionBreakout, TrendContinuation',
  'Configurable risk per trade: fixed lot, percentage of equity, or fixed dollar amount',
  'Daily loss limit: bot stops trading automatically when the daily limit is reached',
  'Drawdown ceiling: position management pauses if equity drops below a threshold',
  'Max open positions: prevents overexposure across simultaneous setups',
  'Per-symbol on/off switch: exclude markets you don\'t want traded',
  'Telegram reporting: every filled and closed trade reported to your private channel',
];

export default function PersonalEA() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(37,99,235,0.08),transparent_60%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-20 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-3.5 py-1.5 text-xs text-zinc-400 mb-6 font-medium">
              <Clock size={11} />
              Personal Mode — Coming Soon
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Automate your signals<br />
              <span className="text-zinc-400">on your own MT5</span>
            </h1>
            <p className="text-lg text-zinc-400 leading-relaxed mb-6 max-w-2xl">
              Personal Mode will connect HashiBot's signal engine directly to your personal MT5 account,
              executing trades automatically within the risk limits you define.
            </p>
            <p className="text-sm text-zinc-600 max-w-xl leading-relaxed mb-10">
              Currently in development and testing. The engine, risk governance, and MT5 bridge are being
              built internally. No real trades are placed until Personal Mode is fully launched.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-7 py-3.5 rounded-lg font-semibold transition-colors shadow-lg shadow-blue-600/20 text-sm"
              >
                Join Waitlist <ArrowRight size={16} />
              </Link>
              <Link
                to="/signal-mode"
                className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-7 py-3.5 rounded-lg font-medium transition-colors text-sm"
              >
                Signal Mode is live now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Core differentiators */}
      <section className="border-t border-zinc-800/70 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">What Personal Mode will include</h2>
            <p className="text-zinc-500 text-sm max-w-md mx-auto">Planned features based on the engine already in development.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-5 max-w-4xl mx-auto mb-12">
            {[
              {
                icon: Cpu,
                title: 'Same signal engine',
                desc: 'MicroScalper, CompressionBreakout, and TrendContinuation — the same strategies and scoring system as Signal Mode.',
              },
              {
                icon: Settings,
                title: 'Full risk configuration',
                desc: 'Set risk per trade, daily loss limit, max drawdown, lot sizing method, and which markets to trade.',
              },
              {
                icon: Shield,
                title: 'Your account, your control',
                desc: 'Runs on your personal MT5 account. No shared accounts, no third-party broker dependency.',
              },
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

          {/* Planned feature list */}
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

      {/* Waitlist CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="bg-zinc-900/50 border border-zinc-800/70 rounded-2xl p-10 max-w-xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/12 border border-blue-600/20 flex items-center justify-center mx-auto mb-6">
            <Bell size={24} className="text-blue-400" />
          </div>
          <h2 className="text-xl font-bold mb-3">Get notified at launch</h2>
          <p className="text-zinc-400 text-sm mb-2 leading-relaxed">
            Personal Mode is in active development. Create your account now and you'll be
            first in line when early access opens.
          </p>
          <p className="text-xs text-zinc-600 mb-8">
            Signal Mode is live and available today while you wait.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-semibold transition-colors text-sm shadow-lg shadow-blue-600/20"
            >
              Join Waitlist <ArrowRight size={14} />
            </Link>
            <Link
              to="/signal-mode"
              className="inline-flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200 px-8 py-3 rounded-lg text-sm transition-colors"
            >
              Try Signal Mode instead <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
