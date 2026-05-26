import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { CheckCircle, ArrowRight } from 'lucide-react';

export default function Pricing() {
  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-zinc-400 max-w-lg mx-auto">Access to HashiBot's live signal engine. No hidden fees.</p>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            {
              name: 'Signal Mode',
              price: '$49',
              period: '/month',
              desc: 'Live signals across 20 markets',
              features: [
                '20 markets (10 crypto + 10 forex)',
                'A+ and A grade signals only',
                'Telegram delivery',
                'Full signal dashboard',
                'Signal history',
                'Entry zone, SL, TP1, TP2',
              ],
              highlight: true,
              cta: 'Get Signal Access',
            },
            {
              name: 'Personal EA',
              price: 'Coming Soon',
              period: '',
              desc: 'Automated MT5 execution',
              features: [
                'All Signal Mode features',
                'MT5 auto-execution',
                'Configurable risk settings',
                'Personal account only',
              ],
              highlight: false,
              cta: 'Join Waitlist',
            },
            {
              name: 'Prop EA',
              price: 'Coming Soon',
              period: '',
              desc: 'Purpose-built for funded accounts',
              features: [
                'Challenge drawdown control',
                'Prop-firm compliant sizing',
                'Conservative regime filters',
                'FTMO & MyFundedFX support',
              ],
              highlight: false,
              cta: 'Join Waitlist',
            },
          ].map(plan => (
            <div key={plan.name} className={`rounded-xl border p-6 flex flex-col ${plan.highlight ? 'bg-blue-600/10 border-blue-500/40' : 'bg-zinc-900 border-zinc-800'}`}>
              <div className="mb-5">
                <div className="text-sm text-zinc-400 mb-1">{plan.name}</div>
                <div className="text-3xl font-bold">{plan.price}<span className="text-base font-normal text-zinc-500">{plan.period}</span></div>
                <div className="text-xs text-zinc-500 mt-1">{plan.desc}</div>
              </div>
              <div className="flex-1 space-y-2 mb-6">
                {plan.features.map(f => (
                  <div key={f} className="flex items-start gap-2">
                    <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-zinc-300">{f}</span>
                  </div>
                ))}
              </div>
              <Link to="/register" className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${plan.highlight ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white'}`}>
                {plan.cta} <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-zinc-600 mt-8">
          Trading signals are for educational and informational purposes only. Past performance does not guarantee future results.
        </p>
      </section>
    </PublicLayout>
  );
}
