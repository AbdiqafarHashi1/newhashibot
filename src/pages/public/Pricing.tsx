import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Package } from '../../lib/types';
import { 
  CheckCircle, ArrowRight, 
  Copy, Check, Phone, AlertCircle, CreditCard, Send, Loader2,
  Sparkles, UserCheck, ArrowUpRight
} from 'lucide-react';
import { normalizePackage, priceLabel, PUBLIC_PACKAGES } from '../../lib/packages';
import { PRODUCT_BY_PACKAGE, readAttribution } from '../../lib/commerce';
import { submitManualMpesaRequest } from '../../lib/mpesa';
import { WhopCheckout } from '../../components/commerce/WhopCheckout';

export default function Pricing() {
  const mpesaMerchant = import.meta.env.VITE_MPESA_MERCHANT_NUMBER as string | undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const packageParam = searchParams.get('package');

  const { session } = useAuth();
  const userEmail = session?.user?.email || '';
  const userName = session?.user?.user_metadata?.full_name || '';

  const [currency, setCurrency] = useState<'KES' | 'USD'>('KES');
  const [signalDuration, setSignalDuration] = useState<'month' | 'week'>('month');
  const [packages, setPackages] = useState<Package[]>(PUBLIC_PACKAGES);
  const [copiedMpesa, setCopiedMpesa] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Calculate default amount
  const computeAmountForSlug = (slug: string, isWeeklySignal = false) => {
    if (slug === 'free_preview') return '0';
    if (slug === 'crypto_signal_room') return isWeeklySignal ? '1200' : '3500';
    if (slug === 'forex_mt5_personal_bot' || slug === 'crypto_personal_bot') return '8500';
    if (slug === 'forex_mt5_prop_bot' || slug === 'crypto_prop_bot') return '12500';
    return '3500';
  };

  // Form State
  const [formData, setFormData] = useState({
    fullName: userName,
    email: userEmail,
    phone: '',
    packageSlug: packageParam || 'crypto_signal_room',
    amountKes: computeAmountForSlug(packageParam || 'crypto_signal_room'),
    mpesaRef: '',
    paymentDate: new Date().toISOString().split('T')[0],
    telegramUsername: '',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  // Update amount when package selection changes
  const handlePackageChange = useCallback((slug: string, updateUrl = true, isWeekly = false) => {
    const amount = computeAmountForSlug(slug, isWeekly);

    setFormData(prev => ({
      ...prev,
      packageSlug: slug,
      amountKes: amount,
    }));

    if (updateUrl) {
      setSearchParams({ package: slug });
    }
  }, [setSearchParams]);

  // Sync state if URL query parameter changes
  useEffect(() => {
    if (packageParam) {
      handlePackageChange(packageParam, false);
    }
  }, [packageParam, handlePackageChange]);

  function handleSelectAndJumpToPayment(slug: string, isWeekly = false) {
    if (slug === 'crypto_signal_room') {
      setSignalDuration(isWeekly ? 'week' : 'month');
    }
    handlePackageChange(slug, true, isWeekly);
    const formEl = document.getElementById('mpesa-payment-section');
    if (formEl) {
      const headerOffset = 80;
      const elementPosition = formEl.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({ top: Math.max(0, offsetPosition), behavior: 'smooth' });

      // Focus first empty required input
      setTimeout(() => {
        const nameInput = document.getElementById('payer-name-input') as HTMLInputElement | null;
        const refInput = document.getElementById('mpesa-ref-input') as HTMLInputElement | null;
        if (!formData.fullName && nameInput) {
          nameInput.focus();
        } else if (refInput) {
          refInput.focus();
        }
      }, 300);
    }
  }

  function handleCopyMpesa() {
    if (!mpesaMerchant) return;
    navigator.clipboard.writeText(mpesaMerchant);
    setCopiedMpesa(true);
    setTimeout(() => setCopiedMpesa(false), 2000);
  }

  function handleCopyAmount() {
    navigator.clipboard.writeText(formData.amountKes);
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!mpesaMerchant) {
      setSubmitError('M-Pesa merchant instructions are not configured. Do not send payment.');
      return;
    }

    // Durable status is tied to the authenticated customer; never use a browser-only payment claim.
    if (!session?.user.id) {
      setSubmitError('Please create or sign in to your HashiBot account before submitting M-Pesa payment evidence.');
      return;
    }
    // Validation
    if (!formData.fullName.trim()) {
      setSubmitError('Please enter your full name.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setSubmitError('Please enter a valid account email address.');
      return;
    }
    if (formData.packageSlug !== 'free_preview' && !formData.mpesaRef.trim()) {
      setSubmitError('Please enter the M-Pesa Transaction Ref code (e.g., SJK789XYZ).');
      return;
    }

    setSubmitting(true);

    try {
      const selectedPkg = packages.find(p => p.slug === formData.packageSlug);
      
      const product = PRODUCT_BY_PACKAGE[formData.packageSlug as keyof typeof PRODUCT_BY_PACKAGE];
      if (!product) throw new Error('This package is not eligible for an M-Pesa payment request.');
      const receipt = await submitManualMpesaRequest({
        userId: session.user.id,
        fullName: formData.fullName, email: formData.email, phone: formData.phone,
        packageSlug: formData.packageSlug, packageName: selectedPkg?.name || formData.packageSlug,
        product, amountKes: Number(formData.amountKes), transactionReference: formData.mpesaRef,
        paymentDate: formData.paymentDate, telegramUsername: formData.telegramUsername,
        notes: formData.notes, attribution: readAttribution(searchParams),
      });

      setSubmitSuccess(
        `Payment submitted — awaiting verification. HashiBot status reference: ${receipt.publicReference}. You may safely leave and return from this account. This is not payment confirmation or access.`
      );
      
      // Reset transaction ref
      setFormData(prev => ({ ...prev, mpesaRef: '', notes: '' }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit payment confirmation. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPkgObj = packages.find(p => p.slug === formData.packageSlug) || packages[0];

  return (
    <PublicLayout>
      {/* Header */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3.5 py-1 text-xs text-emerald-400 font-bold uppercase tracking-wider">
            <CreditCard size={14} />
            Flexible checkout • Whop or M-Pesa
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Choose Your HashiBot Plan
          </h1>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Keep every HashiBot product and choose international Whop checkout or Kenyan M-Pesa verification.
          </p>

          {/* Quick jump anchor pill buttons */}
          <div className="pt-2 flex items-center justify-center gap-3 flex-wrap text-xs">
            <a
              href="#pricing-plans"
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
            >
              Compare Packages ↓
            </a>
            <a
              href="#mpesa-payment-section"
              className="px-3.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Phone size={13} />
              Jump to M-Pesa Form ↓
            </a>
          </div>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section id="pricing-plans" className="py-16 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center space-y-4 mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-400">Transparent Subscriptions</div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">Select Your Trading Tier</h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
            Zero hidden fees. Full access to institutional setups, automated position reconciliation, and drawdown protection.
          </p>

          {/* Currency Toggle Switcher */}
          <div className="inline-flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            <button
              onClick={() => setCurrency('KES')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                currency === 'KES'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>🇰🇪 Kenyan Shillings (KES / M-Pesa)</span>
            </button>
            <button
              onClick={() => setCurrency('USD')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                currency === 'USD'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>🌐 US Dollars (USD / Crypto / Card)</span>
            </button>
          </div>
        </div>

        {PRODUCT_BY_PACKAGE[formData.packageSlug as keyof typeof PRODUCT_BY_PACKAGE] && (
          <div className="mx-auto mb-10 max-w-xl rounded-2xl border border-blue-500/30 bg-blue-950/20 p-5 text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-300">International checkout for selected product</div>
            <WhopCheckout product={PRODUCT_BY_PACKAGE[formData.packageSlug as keyof typeof PRODUCT_BY_PACKAGE]!} compact />
            <p className="mt-3 text-[11px] text-zinc-500">Whop remains responsible for billing and subscription lifecycle. Payment does not itself grant a HashiBot entitlement.</p>
          </div>
        )}

        {/* 4-Tier Grid + Free Trial Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {/* TIER 1: VIP Signal Room */}
          {(() => {
            const pkg = packages.find(p => p.slug === 'crypto_signal_room') || PUBLIC_PACKAGES[1];
            const isSelected = formData.packageSlug === 'crypto_signal_room';
            const price = signalDuration === 'week' 
              ? { main: currency === 'USD' ? '$10 USD' : '1,200 KES', period: '/7-day trial' }
              : priceLabel(pkg, currency);

            return (
              <div 
                id="plan-crypto_signal_room"
                className={`relative bg-zinc-900/90 border rounded-2xl p-6 flex flex-col justify-between space-y-6 transition-all ${
                  isSelected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/50 bg-emerald-950/20 shadow-2xl shadow-emerald-950/50 scale-[1.02]'
                    : 'border-emerald-500/40 hover:border-emerald-500/80 shadow-lg shadow-emerald-950/20'
                }`}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-bold px-3.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                  Most Popular Entry
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-lg text-white">{pkg.name}</h3>
                    <span className="text-[10px] font-bold rounded-full px-2.5 py-0.5 border bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                      Live & Ready
                    </span>
                  </div>

                  {/* Billing Duration Switcher for Signals */}
                  <div className="flex items-center p-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
                    <button
                      onClick={() => {
                        setSignalDuration('month');
                        handlePackageChange('crypto_signal_room', true, false);
                      }}
                      className={`flex-1 py-1 rounded-md font-bold transition-all text-center ${
                        signalDuration === 'month'
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Monthly {currency === 'USD' ? '($29)' : '(3,500 KES)'}
                    </button>
                    <button
                      onClick={() => {
                        setSignalDuration('week');
                        handlePackageChange('crypto_signal_room', true, true);
                      }}
                      className={`flex-1 py-1 rounded-md font-bold transition-all text-center ${
                        signalDuration === 'week'
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      7-Day Trial {currency === 'USD' ? '($10)' : '(1,200 KES)'}
                    </button>
                  </div>

                  <div>
                    <div className="text-3xl font-extrabold text-white">{price.main}</div>
                    <div className="text-xs text-zinc-400 font-mono mt-0.5">{price.period}</div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{pkg.description}</p>

                  <ul className="space-y-2.5 text-xs text-zinc-300 pt-3 border-t border-zinc-800">
                    {pkg.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleSelectAndJumpToPayment('crypto_signal_room', signalDuration === 'week')}
                    className={`w-full py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                    }`}
                  >
                    <span>{isSelected ? '✓ Plan Selected — Pay Below' : 'Select & Pay via M-Pesa'}</span>
                    <ArrowRight size={14} />
                  </button>

                  <Link
                    to={session ? `/app/package-request?package=crypto_signal_room` : `/register?package=crypto_signal_room`}
                    className="w-full py-2 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 text-center transition-colors block"
                  >
                    {session ? 'Activate in Customer Dashboard →' : 'Sign up for this plan →'}
                  </Link>
                </div>
              </div>
            );
          })()}

          {/* TIER 2: Personal Auto-Bot */}
          {(() => {
            const pkg = packages.find(p => p.slug === 'forex_mt5_personal_bot') || PUBLIC_PACKAGES[2];
            const isSelected = formData.packageSlug === 'forex_mt5_personal_bot' || formData.packageSlug === 'crypto_personal_bot';
            const price = priceLabel(pkg, currency);

            return (
              <div 
                id="plan-forex_mt5_personal_bot"
                className={`relative bg-zinc-900/90 border rounded-2xl p-6 flex flex-col justify-between space-y-6 transition-all ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/50 bg-blue-950/20 shadow-2xl shadow-blue-950/50 scale-[1.02]'
                    : 'border-blue-500/40 hover:border-blue-500/80 shadow-lg shadow-blue-950/20'
                }`}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                  Full Automation
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-lg text-white">{pkg.name}</h3>
                    <span className="text-[10px] font-bold rounded-full px-2.5 py-0.5 border bg-blue-500/10 text-blue-300 border-blue-500/20">
                      MT5 + Crypto API
                    </span>
                  </div>

                  <div>
                    <div className="text-3xl font-extrabold text-white">{price.main}</div>
                    <div className="text-xs text-zinc-400 font-mono mt-0.5">{price.period}</div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{pkg.description}</p>

                  <ul className="space-y-2.5 text-xs text-zinc-300 pt-3 border-t border-zinc-800">
                    {pkg.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle size={15} className="text-blue-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleSelectAndJumpToPayment('forex_mt5_personal_bot')}
                    className={`w-full py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                    }`}
                  >
                    <span>{isSelected ? '✓ Plan Selected — Pay Below' : 'Select & Pay via M-Pesa'}</span>
                    <ArrowRight size={14} />
                  </button>

                  <Link
                    to={session ? `/app/package-request?package=forex_mt5_personal_bot` : `/register?package=forex_mt5_personal_bot`}
                    className="w-full py-2 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 text-center transition-colors block"
                  >
                    {session ? 'Activate in Customer Dashboard →' : 'Sign up for this plan →'}
                  </Link>
                </div>
              </div>
            );
          })()}

          {/* TIER 3: Prop Pass Master */}
          {(() => {
            const pkg = packages.find(p => p.slug === 'forex_mt5_prop_bot') || PUBLIC_PACKAGES[3];
            const isSelected = formData.packageSlug === 'forex_mt5_prop_bot';
            const price = priceLabel(pkg, currency);

            return (
              <div 
                id="plan-forex_mt5_prop_bot"
                className={`relative bg-zinc-900/90 border rounded-2xl p-6 flex flex-col justify-between space-y-6 transition-all ${
                  isSelected
                    ? 'border-amber-500 ring-2 ring-amber-500/50 bg-amber-950/20 shadow-2xl shadow-amber-950/50 scale-[1.02]'
                    : 'border-amber-500/40 hover:border-amber-500/80 shadow-lg shadow-amber-950/20'
                }`}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-600 to-orange-500 text-white text-[10px] font-bold px-3.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                  Prop Challenge Specialist
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-lg text-white">{pkg.name}</h3>
                    <span className="text-[10px] font-bold rounded-full px-2.5 py-0.5 border bg-amber-500/10 text-amber-300 border-amber-500/20">
                      4.5% Drawdown Lock
                    </span>
                  </div>

                  <div>
                    <div className="text-3xl font-extrabold text-white">{price.main}</div>
                    <div className="text-xs text-zinc-400 font-mono mt-0.5">{price.period}</div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{pkg.description}</p>

                  <ul className="space-y-2.5 text-xs text-zinc-300 pt-3 border-t border-zinc-800">
                    {pkg.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleSelectAndJumpToPayment('forex_mt5_prop_bot')}
                    className={`w-full py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30'
                        : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20'
                    }`}
                  >
                    <span>{isSelected ? '✓ Plan Selected — Pay Below' : 'Select & Pay via M-Pesa'}</span>
                    <ArrowRight size={14} />
                  </button>

                  <Link
                    to={session ? `/app/package-request?package=forex_mt5_prop_bot` : `/register?package=forex_mt5_prop_bot`}
                    className="w-full py-2 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 text-center transition-colors block"
                  >
                    {session ? 'Activate in Customer Dashboard →' : 'Sign up for this plan →'}
                  </Link>
                </div>
              </div>
            );
          })()}

          {/* TIER 4: Crypto Prop Pass Master */}
          {(() => {
            const pkg = packages.find(p => p.slug === 'crypto_prop_bot') || PUBLIC_PACKAGES[4];
            const isSelected = formData.packageSlug === 'crypto_prop_bot';
            const price = priceLabel(pkg, currency);

            return (
              <div 
                id="plan-crypto_prop_bot"
                className={`relative bg-zinc-900/90 border rounded-2xl p-6 flex flex-col justify-between space-y-6 transition-all ${
                  isSelected
                    ? 'border-purple-500 ring-2 ring-purple-500/50 bg-purple-950/20 shadow-2xl shadow-purple-950/50 scale-[1.02]'
                    : 'border-purple-500/40 hover:border-purple-500/80 shadow-lg shadow-purple-950/20'
                }`}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-indigo-500 text-white text-[10px] font-bold px-3.5 py-0.5 rounded-full uppercase tracking-wider shadow-md whitespace-nowrap">
                  24/7 Crypto Challenges
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-lg text-white">{pkg.name}</h3>
                    <span className="text-[10px] font-bold rounded-full px-2.5 py-0.5 border bg-purple-500/10 text-purple-300 border-purple-500/20">
                      4.0% Circuit Lock
                    </span>
                  </div>

                  <div>
                    <div className="text-3xl font-extrabold text-white">{price.main}</div>
                    <div className="text-xs text-zinc-400 font-mono mt-0.5">{price.period}</div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{pkg.description}</p>

                  <ul className="space-y-2.5 text-xs text-zinc-300 pt-3 border-t border-zinc-800">
                    {pkg.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle size={15} className="text-purple-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleSelectAndJumpToPayment('crypto_prop_bot')}
                    className={`w-full py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20'
                    }`}
                  >
                    <span>{isSelected ? '✓ Plan Selected — Pay Below' : 'Select & Pay via M-Pesa'}</span>
                    <ArrowRight size={14} />
                  </button>

                  <Link
                    to={session ? `/app/package-request?package=crypto_prop_bot` : `/register?package=crypto_prop_bot`}
                    className="w-full py-2 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 text-center transition-colors block"
                  >
                    {session ? 'Activate in Customer Dashboard →' : 'Sign up for this plan →'}
                  </Link>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Free 7-Day Preview Banner */}
        <div className="mt-8 max-w-6xl mx-auto bg-zinc-950 border border-zinc-800/90 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm sm:text-base">Want to test the platform first?</span>
                <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-bold">100% FREE</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Explore dashboard architecture, setup audit rules, and sample historical performance.</p>
            </div>
          </div>
          <Link
            to="/free"
            className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold border border-zinc-700 transition-colors shrink-0"
          >
            Join Permanent Free Telegram
          </Link>
        </div>
      </section>

      {/* M-PESA PAYMENT SECTION & FORM */}
      <section 
        id="mpesa-payment-section" 
        ref={formRef}
        className="py-16 px-4 sm:px-6 bg-zinc-900/50 border-t border-zinc-800/80 scroll-mt-20"
      >
        <div className="max-w-5xl mx-auto space-y-12">
          
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3.5 py-1 text-xs text-emerald-400 font-bold uppercase tracking-wider">
              <Phone size={14} />
              M-Pesa Payment Instructions & Confirmation
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
              M-Pesa Evidence & Verification Form
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
              Follow the payment instructions, then submit your transaction reference for manual verification. A reference alone is never verified payment.
            </p>
          </div>

          {/* Dynamic Plan Confirmation Banner */}
          <div className="bg-gradient-to-r from-blue-950/60 via-zinc-900 to-indigo-950/60 border border-blue-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <Sparkles size={20} />
              </div>
              <div>
                <span className="text-xs text-blue-400 font-bold uppercase tracking-wider block">Targeting Package</span>
                <span className="text-base font-extrabold text-white">{selectedPkgObj?.name || 'Selected Package'}</span>
                <span className="text-xs text-zinc-400 ml-2">({formData.amountKes === '0' ? 'Free Preview' : `${Number(formData.amountKes).toLocaleString()} KES / month`})</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Need to switch?</span>
              <select
                value={formData.packageSlug}
                onChange={e => handlePackageChange(e.target.value, true)}
                className="bg-zinc-950 border border-zinc-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-medium"
              >
                {packages.map(p => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} ({priceLabel(p).main})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            
            {/* Left Col: M-Pesa Details Box */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* M-Pesa Number Card */}
              <div className="bg-zinc-950 border border-emerald-500/40 rounded-2xl p-6 space-y-4 shadow-2xl relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Official M-Pesa Number</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">SEND MONEY</span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-zinc-400">Recipient Mobile Number:</span>
                  <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <span className="font-mono text-2xl font-extrabold text-white tracking-wider">{mpesaMerchant || 'Not configured'}</span>
                    <button
                      onClick={handleCopyMpesa}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                      title="Copy M-Pesa Number"
                    >
                      {copiedMpesa ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedMpesa ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {formData.amountKes !== '0' && (
                  <div className="space-y-1 pt-1">
                    <span className="text-xs text-zinc-400">Exact Amount to Send:</span>
                    <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3">
                      <span className="font-mono text-lg font-bold text-emerald-400">{Number(formData.amountKes).toLocaleString()} KES</span>
                      <button
                        onClick={handleCopyAmount}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors"
                      >
                        {copiedAmount ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedAmount ? 'Copied' : 'Copy Amount'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Always verify that the recipient name corresponds to the designated HashiBot payment contact before entering your M-Pesa PIN.
                </p>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4 text-xs">
                <h3 className="font-extrabold text-sm text-white">How To Complete Activation:</h3>
                <ol className="space-y-3 text-zinc-300 list-decimal list-inside leading-relaxed">
                  <li>Open M-Pesa on your mobile phone.</li>
                  <li>Select <strong className="text-white">Send Money</strong>.</li>
                  <li>Enter recipient number: <strong className="text-emerald-400 font-mono">{mpesaMerchant || 'Contact HashiBot — merchant not configured'}</strong></li>
                  <li>Enter exact plan amount: <strong className="text-white font-mono">{Number(formData.amountKes).toLocaleString()} KES</strong></li>
                  <li>Enter your M-Pesa PIN and confirm transaction.</li>
                  <li>Copy the M-Pesa Transaction Ref Code from your SMS (e.g. <strong className="text-cyan-400 font-mono">SJK789XYZ</strong>).</li>
                  <li>Fill out the form on the right and click <strong className="text-white">Submit Payment Confirmation</strong>.</li>
                  <li>Account activation follows manual payment verification within 15–30 minutes.</li>
                </ol>
              </div>

            </div>

            {/* Right Col: Payment Confirmation Form */}
            <div id="payment-form-card" className="lg:col-span-3 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-extrabold text-white">Payment Confirmation Form</h3>
                  {session && (
                    <span className="text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      <UserCheck size={13} /> Account Linked
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1">Submit your details after completing M-Pesa transfer.</p>
              </div>

              {submitSuccess && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 leading-relaxed space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>{submitSuccess}</div>
                  </div>
                  {!session && (
                    <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-zinc-300">Have you created your login account yet?</span>
                      <Link
                        to={`/register?package=${formData.packageSlug}`}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center gap-1"
                      >
                        <span>Create Login Account</span>
                        <ArrowUpRight size={13} />
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {submitError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 leading-relaxed flex items-start gap-2.5">
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <div>{submitError}</div>
                </div>
              )}

              <form onSubmit={handleSubmitPayment} className="space-y-4 text-xs">
                
                {/* Full Name & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-zinc-300">Full Name *</label>
                    <input
                      id="payer-name-input"
                      type="text"
                      required
                      placeholder="John Doe"
                      value={formData.fullName}
                      onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-zinc-300">Account Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="trader@gmail.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Product Package & Amount */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-zinc-300">Selected Product Package *</label>
                    <select
                      value={formData.packageSlug}
                      onChange={e => handlePackageChange(e.target.value, true)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="crypto_signal_room">VIP Signal Room (3,500 KES/mo or 1,200 KES/week)</option>
                      <option value="forex_mt5_personal_bot">Personal Auto-Bot (8,500 KES/mo or $65)</option>
                      <option value="forex_mt5_prop_bot">Forex &amp; Metals Prop Pass Master (12,500 KES/mo or $95)</option>
                      <option value="crypto_prop_bot">Crypto Prop Pass Master (12,500 KES/mo or $95)</option>
                      <option value="free_preview">Free 7-Day Preview (0 KES)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-zinc-300">Amount Paid (KES) *</label>
                    <input
                      type="number"
                      required
                      value={formData.amountKes}
                      onChange={e => setFormData({ ...formData, amountKes: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                {/* Transaction Ref & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-zinc-300">
                      M-Pesa Transaction Ref Code {formData.packageSlug !== 'free_preview' && '*'}
                    </label>
                    <input
                      id="mpesa-ref-input"
                      type="text"
                      required={formData.packageSlug !== 'free_preview'}
                      placeholder="e.g. SJK789XYZ"
                      value={formData.mpesaRef}
                      onChange={e => setFormData({ ...formData, mpesaRef: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 font-mono uppercase tracking-wider"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-zinc-300">Payment Date *</label>
                    <input
                      type="date"
                      required
                      value={formData.paymentDate}
                      onChange={e => setFormData({ ...formData, paymentDate: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                {/* Phone & Telegram Username */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-zinc-300">Mobile Phone Number (Optional)</label>
                    <input
                      type="tel"
                      placeholder="0712345678"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-zinc-300">Telegram Handle (Optional)</label>
                    <input
                      type="text"
                      placeholder="@trader_john"
                      value={formData.telegramUsername}
                      onChange={e => setFormData({ ...formData, telegramUsername: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="font-bold text-zinc-300">Additional Notes / Setup Preferences (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Any specific setup preferences, broker, or questions..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-xl shadow-blue-600/25 flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Submitting Payment Confirmation...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Submit Payment Confirmation</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-zinc-500 text-center">
                  Submissions are reviewed manually. You will receive an email confirmation once activated.
                </p>

              </form>
            </div>

          </div>

        </div>
      </section>
    </PublicLayout>
  );
}
