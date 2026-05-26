import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { ArrowRight, Clock, Settings, Shield, Cpu } from 'lucide-react';

export default function PersonalEA() {
  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1.5 text-xs text-zinc-400 mb-5">
            <Clock size={12} />
            Coming Soon
          </div>
          <h1 className="text-5xl font-bold mb-5 leading-tight">Personal EA</h1>
          <p className="text-lg text-zinc-400 leading-relaxed">
            HashiBot Personal EA connects directly to your MT5 account and executes trades automatically
            based on the same signals powering the Signal Mode scanner.
          </p>
        </div>
      </section>

      <section className="border-t border-zinc-800 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Cpu, title: 'Same strategies', desc: 'MicroScalper, CompressionBreakout, and TrendContinuation — the same engine powering your signals.' },
              { icon: Settings, title: 'Full configuration', desc: 'Set risk per trade, max drawdown, lot sizing, and which markets to trade.' },
              { icon: Shield, title: 'Your account, your control', desc: 'Runs on your own MT5. No shared accounts. No third-party broker dependency.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <Icon size={20} className="text-blue-400 mb-4" />
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-zinc-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 max-w-xl mx-auto">
          <Clock size={32} className="text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">In Development</h2>
          <p className="text-zinc-400 text-sm mb-6">Personal EA is currently in development. Get early access when it launches.</p>
          <Link to="/register" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
            Join Waitlist <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
