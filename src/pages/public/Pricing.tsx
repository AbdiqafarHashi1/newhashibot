import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Package } from '../../lib/types';
import { CheckCircle, ArrowRight, Lock, MessageCircle, Zap, ShieldCheck } from 'lucide-react';

const STATIC_PACKAGES: Package[] = [
  {
    id: 'free_preview', name: 'Free Preview', slug: 'free_preview', price: 0, price_kes: 0, currency: 'KES', billing_period: '7-day preview',
    duration_days: 7, active: true, telegram_access_required: false, sort_order: 0,
    description: '7-day locked preview of the customer dashboard and onboarding flow before paid Signal Room access.',
    features: ['7-day dashboard preview', 'Submit Telegram details for onboarding', 'Locked previews only — no full signal details', 'Manual admin upgrade path'],
    created_at: '', updated_at: '',
  },
  {
    id: 'crypto_signal_room', name: 'Crypto Signal Room', slug: 'crypto_signal_room', price: 5000, price_kes: 5000, currency: 'KES', billing_period: 'monthly',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 1,
    description: 'Main live product: monthly crypto Signal Mode access with Telegram Signal Room onboarding.',
    features: ['Crypto Signal Mode access', 'Active signals and full signal details', 'Telegram Signal Room onboarding', 'Signal history/results', 'Risk and leverage guidance', 'Performance transparency'],
    created_at: '', updated_at: '',
  },
  {
    id: 'premium_crypto_signals', name: 'Premium Crypto Signals', slug: 'premium_crypto_signals', price: 0, price_kes: null, currency: 'KES', billing_period: 'future upgrade',
    duration_days: 30, active: true, telegram_access_required: true, sort_order: 2,
    description: 'Optional future high-touch upgrade. Crypto Signal Room remains the standard signal access package.',
    features: ['Future/contact-admin upgrade, not the default product', 'Priority updates and higher-touch notes planned', 'Expanded coverage planned', 'No guaranteed profit claims'],
    created_at: '', updated_at: '',
  },
  {
    id: 'personal_mode_setup', name: 'Personal EA Setup', slug: 'personal_mode_setup', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly waitlist',
    duration_days: null, active: false, telegram_access_required: false, sort_order: 3,
    description: 'Coming soon setup waitlist. Planned personal-mode onboarding package; live execution and order placement are not available.',
    features: ['10,000 KES/month or $100/month expectation', 'Aggressive personal-mode profile planned', 'Demo connector planned first', 'Crypto-first, forex later', 'No live order placement currently'],
    created_at: '', updated_at: '',
  },
  {
    id: 'prop_mode_setup', name: 'Prop EA Setup', slug: 'prop_mode_setup', price: 10000, price_kes: 10000, currency: 'KES', billing_period: 'monthly waitlist',
    duration_days: null, active: false, telegram_access_required: false, sort_order: 4,
    description: 'Coming soon setup waitlist. Planned prop-safe onboarding package; live execution and order placement are not available.',
    features: ['10,000 KES/month or $100/month expectation', 'Prop-safe conservative profile planned', 'Drawdown/rule protection planned', 'Demo connector planned first', 'No live order placement currently'],
    created_at: '', updated_at: '',
  },
];

const STATIC_BY_SLUG = new Map(STATIC_PACKAGES.map(pkg => [pkg.slug, pkg]));

function normalizePackage(pkg: Package): Package {
  const staticPackage = STATIC_BY_SLUG.get(pkg.slug);
  const features = Array.isArray(pkg.features) ? pkg.features : JSON.parse(String(pkg.features ?? '[]'));
  if (!staticPackage) return { ...pkg, features };

  // Keep database identifiers/timestamps, but force the customer-facing copy/prices for these known packages.
  return {
    ...pkg,
    ...staticPackage,
    id: pkg.id,
    created_at: pkg.created_at,
    updated_at: pkg.updated_at,
  };
}

function priceLabel(pkg: Package) {
  if (pkg.slug === 'premium_crypto_signals') return { main: 'Contact Admin', period: 'Future upgrade' };
  if (!pkg.active) return { main: '10,000 KES', period: '/month or $100/month' };
  if (pkg.price === 0) return { main: 'Free', period: pkg.duration_days ? `${pkg.duration_days}-day preview` : '' };
  const amount = pkg.price_kes ?? pkg.price;
  const period = pkg.billing_period === 'monthly' || pkg.duration_days === 30 ? `/month` : '';
  return { main: pkg.currency === 'KES' ? `${Number(amount).toLocaleString()} KES` : `${pkg.currency} ${Number(amount).toLocaleString()}`, period };
}

function ctaForPackage(pkg: Package, isLoggedIn: boolean, isAdmin: boolean) {
  if (isAdmin) {
    return { to: '/admin/customers', label: 'Manage Customers' };
  }
  if (isLoggedIn) {
    if (pkg.slug === 'free_preview') return { to: '/app/telegram', label: 'Submit Telegram Details' };
    if (pkg.slug === 'crypto_signal_room') return { to: '/app/dashboard', label: 'Go to Dashboard' };
    return { to: '/app/telegram', label: 'Contact Admin' };
  }
  if (pkg.slug === 'free_preview') return { to: '/register', label: 'Create Account' };
  return { to: '/register', label: pkg.active ? 'Get Access' : 'Join Waitlist' };
}

export default function Pricing() {
  const { session, isAdmin } = useAuth();
  const isLoggedIn = Boolean(session);
  const [packages, setPackages] = useState<Package[]>(STATIC_PACKAGES);

  useEffect(() => {
    supabase.from('packages').select('*').order('sort_order').then(({ data }) => {
      if (data && data.length > 0) {
        setPackages(data.map(p => normalizePackage(p as Package)));
      }
    });
  }, []);

  const sortedPackages = useMemo(() => [...packages].sort((a, b) => a.sort_order - b.sort_order), [packages]);
  const mainPackages = sortedPackages.filter(p => ['free_preview', 'crypto_signal_room'].includes(p.slug));
  const premiumPackage = sortedPackages.find(p => p.slug === 'premium_crypto_signals');
  const comingSoon = sortedPackages.filter(p => ['personal_mode_setup', 'prop_mode_setup'].includes(p.slug));

  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-full px-4 py-1.5 text-xs text-sky-400 mb-6">
          <Zap size={11} />
          Crypto Signal Room — live now at 5,000 KES/month
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-zinc-400 max-w-2xl mx-auto text-sm leading-relaxed">
          Crypto Signal Room is the standard live product. Premium Crypto Signals is only a future/contact-admin upgrade, while Personal EA and Prop EA are setup waitlists with no live execution or order placement currently.
        </p>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-14">
        <div className="grid gap-5 max-w-4xl mx-auto sm:grid-cols-2">
          {mainPackages.map(pkg => {
            const { main, period } = priceLabel(pkg);
            const cta = ctaForPackage(pkg, isLoggedIn, isAdmin);
            const isHighlight = pkg.slug === 'crypto_signal_room';
            return (
              <div key={pkg.id} className={`rounded-2xl border flex flex-col relative ${isHighlight ? 'bg-sky-600/8 border-sky-500/35' : 'bg-zinc-900 border-zinc-800'}`}>
                {isHighlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-sky-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Main live product
                  </div>
                )}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="mb-5">
                    <div className="text-xs text-zinc-400 mb-1 font-medium">{pkg.name}</div>
                    <div className="text-3xl font-bold">
                      {main}
                      {period && <span className="text-base font-normal text-zinc-500"> {period}</span>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{pkg.description}</div>
                  </div>

                  {pkg.telegram_access_required && (
                    <div className="flex items-center gap-1.5 text-xs text-sky-400 bg-sky-500/8 border border-sky-500/15 rounded-lg px-2.5 py-1.5 mb-4 w-fit">
                      <MessageCircle size={11} /> Includes Telegram onboarding
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

                  <Link to={cta.to}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${isHighlight ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white'}`}>
                    {cta.label} <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {premiumPackage && (
          <div className="mt-8 max-w-4xl mx-auto bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-start gap-5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-purple-300" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h2 className="font-bold">{premiumPackage.name}</h2>
                  <span className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full px-2 py-0.5">Future upgrade · contact admin</span>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                  Premium is not the current default package. Crypto Signal Room = standard signal access. Premium is a future higher-touch layer for priority updates, expanded coverage, and extra notes — never guaranteed profit.
                </p>
                <div className="grid sm:grid-cols-2 gap-2 mb-5">
                  {premiumPackage.features.map((f: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <CheckCircle size={13} className="text-purple-300 mt-0.5 shrink-0" /> {f}
                    </div>
                  ))}
                </div>
                <Link to={ctaForPackage(premiumPackage, isLoggedIn, isAdmin).to} className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
                  {ctaForPackage(premiumPackage, isLoggedIn, isAdmin).label} <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="mt-14 max-w-3xl mx-auto">
          <h2 className="text-center text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6">How access works</h2>
          <div className="grid sm:grid-cols-4 gap-4 text-center">
            {[
              { step: '1', title: 'Register', desc: 'Create your account or open dashboard' },
              { step: '2', title: 'Choose Signal Room', desc: 'Standard live package is 5,000 KES/month' },
              { step: '3', title: 'Send payment', desc: 'Pay manually and submit details' },
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

      {comingSoon.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
          <div className="border-t border-zinc-800 pt-12">
            <h2 className="text-center text-lg font-bold mb-2">Setup waitlist packages</h2>
            <p className="text-center text-sm text-zinc-500 mb-8">Personal EA and Prop EA are planned setup/onboarding packages. Demo connector comes first; live execution is not available.</p>
            <div className="grid gap-5 mx-auto max-w-4xl sm:grid-cols-2">
              {comingSoon.map(pkg => {
                const cta = ctaForPackage(pkg, isLoggedIn, isAdmin);
                const { main, period } = priceLabel(pkg);
                return (
                  <div key={pkg.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-3 right-3 flex items-center gap-1 bg-zinc-800 text-zinc-500 text-xs px-2 py-0.5 rounded-full">
                      <Lock size={10} /> Waitlist
                    </div>
                    <div className="mb-4 pr-16">
                      <div className="text-xs text-zinc-500 mb-1">{pkg.name}</div>
                      <div className="text-2xl font-bold text-zinc-200">{main} <span className="text-sm font-normal text-zinc-500">{period}</span></div>
                      <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{pkg.description}</div>
                    </div>
                    <div className="space-y-1.5 mb-5">
                      {pkg.features.map((f: string, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle size={12} className="text-zinc-500 mt-0.5 shrink-0" />
                          <span className="text-xs text-zinc-500">{f}</span>
                        </div>
                      ))}
                    </div>
                    <Link to={cta.to} className="w-full flex items-center justify-center gap-2 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 px-4 py-2 rounded-xl text-sm transition-colors">
                      {cta.label} <ArrowRight size={13} />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="pb-12">
        <p className="text-center text-xs text-zinc-600 max-w-2xl mx-auto px-4">
          Payment is currently processed manually. After registering or from your dashboard, submit Telegram/payment details and contact admin to activate access. Trading signals are educational and informational tools only. Past performance does not guarantee future results.
        </p>
      </section>
    </PublicLayout>
  );
}
