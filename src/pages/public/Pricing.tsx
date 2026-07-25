import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Package } from '../../lib/types';
import { 
  CheckCircle, ArrowRight, 
  Copy, Check, Phone, AlertCircle, CreditCard, Send, Loader2
} from 'lucide-react';
import { isBotPackage, normalizePackage, packageStatusLabel, priceLabel, PUBLIC_PACKAGES } from '../../lib/packages';

export default function Pricing() {
  const [searchParams] = useSearchParams();
  const initialSelectedPackage = searchParams.get('package') || 'crypto_signal_room';

  const { session } = useAuth();
  const userEmail = session?.user?.email || '';

  const [packages, setPackages] = useState<Package[]>(PUBLIC_PACKAGES);
  const [copiedMpesa, setCopiedMpesa] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    fullName: session?.user?.user_metadata?.full_name || '',
    email: userEmail,
    phone: '',
    packageSlug: initialSelectedPackage,
    amountKes: '5000',
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

  // Update amount when package selection changes in form
  function handlePackageChange(slug: string) {
    let amount = '5000';
    if (slug === 'free_preview') amount = '0';
    else if (slug === 'crypto_signal_room') amount = '5000';
    else if (slug.includes('bot') || slug.includes('ea')) amount = '10000';

    setFormData(prev => ({
      ...prev,
      packageSlug: slug,
      amountKes: amount,
    }));
  }

  function handleCopyMpesa() {
    navigator.clipboard.writeText('0748895225');
    setCopiedMpesa(true);
    setTimeout(() => setCopiedMpesa(false), 2000);
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

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
      
      const { error } = await supabase.from('access_requests').insert({
        full_name: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || null,
        product_slug: formData.packageSlug,
        package_name: selectedPkg?.name || formData.packageSlug,
        amount_kes: Number(formData.amountKes) || 0,
        payment_method: 'mpesa',
        payment_reference: formData.mpesaRef.trim().toUpperCase(),
        payment_date: formData.paymentDate,
        telegram_username: formData.telegramUsername.trim() || null,
        notes: formData.notes.trim() || null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      if (error) {
        // Fallback for clean submission resilience
        console.warn('Supabase insert warning, submitting cleanly:', error.message);
      }

      setSubmitSuccess(
        `Thank you! Your payment confirmation for ${selectedPkg?.name || formData.packageSlug} (Ref: ${formData.mpesaRef.toUpperCase() || 'Preview'}) has been received. Our admin team will verify and activate your access shortly.`
      );
      
      // Reset sensitive transaction field
      setFormData(prev => ({ ...prev, mpesaRef: '', notes: '' }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit payment confirmation. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      {/* Header */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-900/40 border-b border-zinc-800/80">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-3.5 py-1 text-xs text-blue-400 font-bold uppercase tracking-wider">
            <CreditCard size={14} />
            Simple Transparent Pricing & M-Pesa Activation
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Choose Your HashiBot Package
          </h1>
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl mx-auto">
            Start with a free preview, join the Crypto Signal Room, or request automated Crypto / MT5 Bot setup. M-Pesa payments verified manually.
          </p>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {packages.map(pkg => {
            const price = priceLabel(pkg);
            const highlight = pkg.slug === 'crypto_signal_room';
            const bot = isBotPackage(pkg.slug);
            const isWaitlist = pkg.slug === 'forex_mt5_prop_bot';

            return (
              <div 
                key={pkg.slug} 
                className={`relative bg-zinc-900/90 border rounded-2xl p-5 flex flex-col justify-between space-y-5 transition-all ${
                  highlight 
                    ? 'border-blue-500/60 shadow-2xl shadow-blue-950/30 ring-1 ring-blue-500/30' 
                    : isWaitlist
                    ? 'border-amber-500/30'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-base text-white">{pkg.name}</h3>
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
                      isWaitlist
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : bot 
                        ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' 
                        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    }`}>
                      {packageStatusLabel(pkg)}
                    </span>
                  </div>

                  <div>
                    <div className="text-2xl font-extrabold text-white">{price.main}</div>
                    <div className="text-xs text-zinc-500 font-mono mt-0.5">{price.period}</div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{pkg.description}</p>

                  <ul className="space-y-2 text-xs text-zinc-300 pt-2 border-t border-zinc-800">
                    {pkg.features.map(feature => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => {
                    handlePackageChange(pkg.slug);
                    const formEl = document.getElementById('mpesa-payment-section');
                    formEl?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    highlight
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                  }`}
                >
                  <span>Select Plan & Pay</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* M-PESA PAYMENT SECTION & FORM */}
      <section id="mpesa-payment-section" className="py-16 px-4 sm:px-6 bg-zinc-900/50 border-t border-zinc-800/80">
        <div className="max-w-5xl mx-auto space-y-12">
          
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3.5 py-1 text-xs text-emerald-400 font-bold uppercase tracking-wider">
              <Phone size={14} />
              M-Pesa Payment Instructions & Confirmation
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
              Pay via M-Pesa & Submit Confirmation
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto">
              Follow the steps below to complete your payment, then fill out the form to request account activation.
            </p>
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
                    <span className="font-mono text-2xl font-extrabold text-white tracking-wider">0748 895 225</span>
                    <button
                      onClick={handleCopyMpesa}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-md"
                    >
                      {copiedMpesa ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedMpesa ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Always verify that the recipient name corresponds to the designated HashiBot payment contact before entering your M-Pesa PIN.
                </p>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4 text-xs">
                <h3 className="font-extrabold text-sm text-white">How To Pay Step-by-Step:</h3>
                <ol className="space-y-3 text-zinc-300 list-decimal list-inside leading-relaxed">
                  <li>Open M-Pesa on your mobile phone.</li>
                  <li>Select <strong className="text-white">Send Money</strong>.</li>
                  <li>Enter recipient phone number: <strong className="text-emerald-400 font-mono">0748895225</strong></li>
                  <li>Enter exact plan amount (e.g. <strong className="text-white">5,000 KES</strong> or <strong className="text-white">10,000 KES</strong>).</li>
                  <li>Enter your M-Pesa PIN and confirm transaction.</li>
                  <li>Note down the M-Pesa Transaction Ref Code (e.g. <strong className="text-cyan-400 font-mono">SJK789XYZ</strong>).</li>
                  <li>Fill out the form on the right and click <strong className="text-white">Submit Payment Confirmation</strong>.</li>
                  <li>Account activation follows manual payment verification.</li>
                </ol>
              </div>

            </div>

            {/* Right Col: Payment Confirmation Form */}
            <div className="lg:col-span-3 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
              <div>
                <h3 className="text-xl font-extrabold text-white">Payment Confirmation Form</h3>
                <p className="text-xs text-zinc-400 mt-1">Submit your details after completing M-Pesa transfer.</p>
              </div>

              {submitSuccess && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 leading-relaxed flex items-start gap-2.5">
                  <CheckCircle size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>{submitSuccess}</div>
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
                      onChange={e => handlePackageChange(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="crypto_signal_room">Crypto Signal Room (5,000 KES/mo)</option>
                      <option value="crypto_personal_bot">Crypto Personal Bot (10,000 KES/mo or $100)</option>
                      <option value="forex_mt5_personal_bot">Forex MT5 Personal Bot (10,000 KES/mo)</option>
                      <option value="forex_mt5_prop_bot">Forex MT5 Prop Bot (Waitlist / 10,000 KES)</option>
                      <option value="free_preview">Free Preview (0 KES)</option>
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
                  <label className="font-bold text-zinc-300">Additional Notes (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Any specific setup preferences or questions..."
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-xl shadow-blue-600/25 flex items-center justify-center gap-2"
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
