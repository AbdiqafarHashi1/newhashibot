import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Package } from '../../lib/types';
import { CheckCircle, ArrowRight, MessageCircle, Zap, ShieldCheck } from 'lucide-react';
import { isBotPackage, normalizePackage, packageStatusLabel, priceLabel, PUBLIC_PACKAGES, signalModeIncluded } from '../../lib/packages';

function ctaForPackage(pkg: Package, isLoggedIn: boolean, isAdmin: boolean) {
  if (isAdmin) return { to: '/admin/access-requests', label: 'Manage Requests' };
  if (isLoggedIn) return { to: `/app/package-request?package=${pkg.slug}`, label: pkg.slug === 'free_preview' ? 'Choose package' : 'Request access' };
  return { to: `/register?package=${pkg.slug}`, label: pkg.slug === 'free_preview' ? 'Sign up' : 'Choose package' };
}

export default function Pricing() {
  const { session, isAdmin } = useAuth();
  const isLoggedIn = Boolean(session);
  const [packages, setPackages] = useState<Package[]>(PUBLIC_PACKAGES);

  useEffect(() => {
    supabase.from('packages').select('*').order('sort_order').then(({ data }) => {
      if (data?.length) {
        const normalized = data
          .map(p => normalizePackage(p as Package))
          .filter(pkg => PUBLIC_PACKAGES.some(publicPkg => publicPkg.slug === pkg.slug));
        setPackages(normalized.length ? normalized : PUBLIC_PACKAGES);
      }
    });
  }, []);

  const sortedPackages = useMemo(() => [...packages].sort((a, b) => a.sort_order - b.sort_order), [packages]);

  return (
    <PublicLayout>
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-full px-3 py-1 text-xs text-sky-400 mb-5">
            <MessageCircle size={12} /> Manual payment + admin approval
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Choose your HashiBot package</h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Start with a free preview, subscribe to the Crypto Signal Room, or request a managed Bot setup package. Bot execution is enabled only after setup is completed and verified.
          </p>
        </div>

        <div className="max-w-7xl mx-auto grid md:grid-cols-2 xl:grid-cols-5 gap-5">
          {sortedPackages.map(pkg => {
            const cta = ctaForPackage(pkg, isLoggedIn, isAdmin);
            const price = priceLabel(pkg);
            const highlight = pkg.slug === 'crypto_signal_room';
            const bot = isBotPackage(pkg.slug);
            return (
              <div key={pkg.slug} className={`relative bg-zinc-900 border rounded-2xl p-6 flex flex-col ${highlight ? 'border-sky-500/50 shadow-2xl shadow-sky-950/20' : 'border-zinc-800'}`}>
                {highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-sky-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Available</div>}
                <div className="mb-5">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h2 className="font-bold text-lg">{pkg.name}</h2>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 border ${bot ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' : highlight ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>{packageStatusLabel(pkg)}</span>
                  </div>
                  <div className="text-3xl font-bold mb-1">{price.main}</div>
                  <div className="text-sm text-zinc-500 min-h-5">{price.period}</div>
                  <p className="text-sm text-zinc-400 leading-relaxed mt-3">{pkg.description}</p>
                </div>

                <div className="space-y-2 mb-6 flex-1">
                  {pkg.features.map(feature => (
                    <div key={feature} className="flex items-start gap-2 text-sm text-zinc-300">
                      <CheckCircle size={13} className="text-emerald-400 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {signalModeIncluded(pkg.slug) && bot && (
                  <div className="mb-4 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    Includes Signal Room access. Bot setup is guided and activated after account review.
                  </div>
                )}

                <Link to={cta.to} className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${highlight ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white'}`}>
                  {cta.label} <ArrowRight size={14} />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-14 max-w-3xl mx-auto">
          <h2 className="text-center text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6">How access works</h2>
          <div className="grid sm:grid-cols-4 gap-4 text-center">
            {[
              { step: '1', title: 'Sign up', desc: 'Create your account or log in' },
              { step: '2', title: 'Choose package', desc: 'Select Signal Room or Bot setup' },
              { step: '3', title: 'Submit payment proof', desc: 'Manual payment details are reviewed' },
              { step: '4', title: 'Account review', desc: 'Approved access is activated' },
            ].map(s => (
              <div key={s.step} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
                <div className="w-8 h-8 rounded-full bg-sky-600/20 border border-sky-600/30 text-sky-400 text-sm font-bold flex items-center justify-center mx-auto mb-2">{s.step}</div>
                <div className="text-sm font-semibold mb-0.5">{s.title}</div>
                <div className="text-xs text-zinc-500">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 flex gap-3">
            <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold mb-1">Customer dashboard access rules</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">Signal Room customers see active signals, signal history, Telegram onboarding, and package status only. Admin analytics, rejected setups, provider health, scanner logs, diagnostics, and strategy tuning remain admin-only.</p>
            </div>
          </div>
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 flex gap-3">
            <Zap size={18} className="text-sky-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold mb-1">Bot package safety</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">Bot packages include guided setup, account review, and risk preset preparation. No guaranteed profit claims, no fake running state, and no broker/MT5 order placement are provided by this flow.</p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 max-w-2xl mx-auto px-4 mt-12">
          Payment is currently processed manually. Submit payment/contact details from your dashboard and wait for admin approval. Trading signals are educational and informational tools only. Past performance does not guarantee future results.
        </p>
      </section>
    </PublicLayout>
  );
}
