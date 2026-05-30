import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { supabase } from '../../lib/supabase';
import { Package } from '../../lib/types';
import { CheckCircle, ArrowRight, Lock, MessageCircle, Zap } from 'lucide-react';

const STATIC_PACKAGES: Package[] = [
  {
    id: 'free_preview', name: 'Free Preview', slug: 'free_preview', price: 0, currency: 'USD',
    duration_days: 7, active: true, telegram_access_required: false, sort_order: 0,
    description: 'One week free access to see HashiBot signals in action.',
    features: ['7-day free access', 'Signal dashboard (read-only)', 'View live crypto signals', 'No Telegram delivery', 'Upgrade to unlock alerts'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_signal_room', name: 'Crypto Signal Room', slug: 'crypto_signal_room', price: 29, currency: 'USD',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 1,
    description: 'Monthly access to the live crypto signal room with Telegram delivery.',
    features: ['30-day rolling access', 'Live BTC, ETH, SOL and 7+ more', 'A and A+ grade signals', 'Telegram group alerts', 'Signal dashboard & history', 'Entry zone, SL, TP1, TP2'],
    created_at: '', updated_at: '',
  },
  {
    id: 'premium_crypto_signals', name: 'Premium Crypto Signals', slug: 'premium_crypto_signals', price: 49, currency: 'USD',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 2,
    description: 'Premium plan with all markets, priority alerts, and full analytics.',
    features: ['Everything in Crypto Signal Room', '20 crypto markets', 'Regime & confidence scoring', 'Priority Telegram alerts', 'Full signal history and analytics', 'Early access to new features'],
    created_at: '', updated_at: '',
  },
  {
    id: 'personal_mode_setup', name: 'Personal Mode Setup', slug: 'personal_mode_setup', price: 149, currency: 'USD',
    duration_days: null, active: false, telegram_access_required: false, sort_order: 3,
    description: 'One-time setup of the Personal EA for MT5 auto-execution (coming soon).',
    features: ['MT5 auto-execution (coming soon)', 'Custom risk configuration', 'Personal account only', 'Setup & onboarding call', 'Ongoing signal delivery'],
    created_at: '', updated_at: '',
  },
  {
    id: 'prop_mode_setup', name: 'Prop Mode Setup', slug: 'prop_mode_setup', price: 199, currency: 'USD',
    duration_days: null, active: false, telegram_access_required: false, sort_order: 4,
    description: 'One-time setup of the Prop EA for funded account trading (coming soon).',
    features: ['Built for funded accounts (coming soon)', 'FTMO & MyFundedFX support', 'Drawdown-aware position sizing', 'Conservative regime filters', 'Setup & onboarding call'],
    created_at: '', updated_at: '',
  },
];

function priceLabel(pkg: Package) {
  if (pkg.price === 0) return { main: 'Free', period: pkg.duration_days ? `${pkg.duration_days}-day trial` : '' };
  if (!pkg.active) return { main: 'Coming Soon', period: '' };
  const period = pkg.duration_days ? `/month` : ' one-time';
  return { main: `$${pkg.price}`, period };
}

export default function Pricing() {
  const [packages, setPackages] = useState<Package[]>(STATIC_PACKAGES);

  useEffect(() => {
    supabase.from('packages').select('*').order('sort_order').then(({ data }) => {
      if (data && data.length > 0) {
        setPackages(data.map(p => ({
          ...p,
          features: Array.isArray(p.features) ? p.features : JSON.parse(String(p.features ?? '[]')),
        })) as Package[]);
      }
    });
  }, []);

  const livePackages = packages.filter(p => p.active);
  const comingSoon = packages.filter(p => !p.active);
  const highlight = livePackages.find(p => p.slug === 'premium_crypto_signals') ?? livePackages[livePackages.length - 1];

  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-full px-4 py-1.5 text-xs text-sky-400 mb-6">
          <Zap size={11} />
          Crypto Signal Room — live now
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-zinc-400 max-w-lg mx-auto text-sm leading-relaxed">
          Access HashiBot's live crypto signal engine. No hidden fees. Admin activates access after payment confirmation.
        </p>
      </section>

      {/* Live packages */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className={`grid gap-5 max-w-5xl mx-auto ${
          livePackages.length <= 2 ? 'sm:grid-cols-2 max-w-3xl' :
          livePackages.length === 3 ? 'sm:grid-cols-3' :
          'sm:grid-cols-2 lg:grid-cols-4'
        }`}>
          {livePackages.map(pkg => {
            const { main, period } = priceLabel(pkg);
            const isHighlight = pkg.id === highlight?.id;
            return (
              <div key={pkg.id} className={`rounded-2xl border flex flex-col relative ${isHighlight ? 'bg-sky-600/8 border-sky-500/35' : 'bg-zinc-900 border-zinc-800'}`}>
                {isHighlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-sky-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="mb-5">
                    <div className="text-xs text-zinc-400 mb-1 font-medium">{pkg.name}</div>
                    <div className="text-3xl font-bold">
                      {main}
                      {period && <span className="text-base font-normal text-zinc-500">{period}</span>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{pkg.description}</div>
                  </div>

                  {pkg.telegram_access_required && (
                    <div className="flex items-center gap-1.5 text-xs text-sky-400 bg-sky-500/8 border border-sky-500/15 rounded-lg px-2.5 py-1.5 mb-4 w-fit">
                      <MessageCircle size={11} /> Includes Telegram alerts
                    </div>
                  )}

                  <div className="flex-1 space-y-2 mb-6">
                    {pkg.features.map((f: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle size={13} className="text-emerald-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-zinc-300">{f}</span>
                      </div>
                    ))}
                  </div>

                  <Link to="/register"
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${isHighlight ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white'}`}>
                    {pkg.price === 0 ? 'Start Free Trial' : 'Get Access'} <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* How it works */}
        <div className="mt-14 max-w-3xl mx-auto">
          <h2 className="text-center text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6">How access works</h2>
          <div className="grid sm:grid-cols-4 gap-4 text-center">
            {[
              { step: '1', title: 'Register', desc: 'Create your free account' },
              { step: '2', title: 'Choose a plan', desc: 'Pick the package that fits you' },
              { step: '3', title: 'Send payment', desc: 'Pay via M-Pesa or bank transfer' },
              { step: '4', title: 'Get access', desc: 'Admin activates your subscription' },
            ].map(s => (
              <div key={s.step} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
                <div className="w-8 h-8 rounded-full bg-sky-600/20 border border-sky-600/30 text-sky-400 text-sm font-bold flex items-center justify-center mx-auto mb-2">{s.step}</div>
                <div className="text-sm font-semibold mb-0.5">{s.title}</div>
                <div className="text-xs text-zinc-500">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coming soon section */}
      {comingSoon.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
          <div className="border-t border-zinc-800 pt-12">
            <h2 className="text-center text-lg font-bold mb-2">Coming Soon</h2>
            <p className="text-center text-sm text-zinc-500 mb-8">Automated execution products in active development.</p>
            <div className={`grid gap-5 mx-auto max-w-3xl ${comingSoon.length === 1 ? 'max-w-sm' : 'sm:grid-cols-2'}`}>
              {comingSoon.map(pkg => (
                <div key={pkg.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-zinc-800 text-zinc-500 text-xs px-2 py-0.5 rounded-full">
                    <Lock size={10} /> Coming Soon
                  </div>
                  <div className="mb-4">
                    <div className="text-xs text-zinc-500 mb-1">{pkg.name}</div>
                    <div className="text-2xl font-bold text-zinc-400">${pkg.price} <span className="text-sm font-normal">one-time</span></div>
                    <div className="text-xs text-zinc-600 mt-1">{pkg.description}</div>
                  </div>
                  <div className="space-y-1.5 mb-5">
                    {pkg.features.map((f: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle size={12} className="text-zinc-600 mt-0.5 shrink-0" />
                        <span className="text-xs text-zinc-600">{f}</span>
                      </div>
                    ))}
                  </div>
                  <button disabled
                    className="w-full flex items-center justify-center gap-2 border border-zinc-700 text-zinc-600 px-4 py-2 rounded-xl text-sm cursor-not-allowed">
                    Join Waitlist <ArrowRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="pb-12">
        <p className="text-center text-xs text-zinc-600 max-w-lg mx-auto px-4">
          Payment is currently processed manually. After registering, contact admin with your payment confirmation to activate access.
          Trading signals are for educational and informational purposes only. Past performance does not guarantee future results.
        </p>
      </section>
    </PublicLayout>
  );
}
