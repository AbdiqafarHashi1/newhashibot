import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, CheckCircle, Copy, CreditCard, Loader2, Phone, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { CommerceLayout } from '../../components/layout/CommerceLayout';
import { useAuth } from '../../contexts/AuthContext';
import { getWhopCheckout, readAttribution } from '../../lib/commerce';
import { submitManualMpesaRequest } from '../../lib/mpesa';

const benefits = ['Every qualified Forex, Gold and Crypto setup', 'Clear entry, stop-loss and take-profit levels', 'Context, risk notes and ongoing setup updates', 'Private VIP Telegram delivery'];
const amountKes = 3500;

export default function Vip() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const checkout = getWhopCheckout('HASHIBOT_VIP_SIGNALS');
  const merchantNumber = import.meta.env.VITE_MPESA_MERCHANT_NUMBER as string | undefined;
  const merchantLabel = import.meta.env.VITE_MPESA_MERCHANT_LABEL as string | undefined;
  const referenceRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({
    fullName: String(session?.user.user_metadata?.full_name ?? ''), email: session?.user.email ?? '', phone: '',
    reference: '', paymentDate: new Date().toISOString().split('T')[0], telegramUsername: '',
  });

  const openMpesa = () => {
    document.getElementById('mpesa-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => referenceRef.current?.focus(), 400);
  };

  const submitMpesa = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(null);
    if (!merchantNumber) return setMessage({ kind: 'error', text: 'M-Pesa payment details are unavailable. Please do not send payment.' });
    if (!session?.user.id) return setMessage({ kind: 'error', text: 'Sign in to your HashiBot account before submitting your payment.' });
    setSubmitting(true);
    try {
      const receipt = await submitManualMpesaRequest({
        userId: session.user.id, fullName: form.fullName, email: form.email, phone: form.phone,
        packageSlug: 'crypto_signal_room', packageName: 'VIP Signal Room', product: 'HASHIBOT_VIP_SIGNALS',
        amountKes, transactionReference: form.reference, paymentDate: form.paymentDate,
        telegramUsername: form.telegramUsername, attribution: readAttribution(params),
      });
      setMessage({ kind: 'success', text: `Payment submitted for verification. Your HashiBot reference is ${receipt.publicReference}.` });
      setForm(current => ({ ...current, reference: '' }));
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'We could not submit your payment. Please try again.' });
    } finally { setSubmitting(false); }
  };

  return <CommerceLayout>
    <section className="relative overflow-hidden border-b border-zinc-800 px-4 py-12 sm:px-6 sm:py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,.2),transparent_48%)]" />
      <div className="relative mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-300"><Sparkles size={14}/> HashiBot VIP Signals</div>
        <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-6xl">Trade the setup.<br/><span className="text-blue-400">Skip the noise.</span></h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300">Every qualified Forex, Gold and Crypto setup—complete with levels, context and updates—delivered directly to your private Telegram room.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {checkout.configured ? <a href={checkout.checkoutUrl} className="rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white hover:bg-blue-500">Unlock VIP — $29/month</a> : <span className="rounded-xl border border-zinc-700 px-7 py-3.5 text-sm text-zinc-400">Whop checkout unavailable</span>}
          <button onClick={openMpesa} className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-7 py-3.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20">Pay with M-Pesa — 3,500 KES</button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Secure card checkout through Whop • Local payment through M-Pesa</p>
      </div>
    </section>

    <section className="mx-auto grid max-w-5xl gap-5 px-4 py-10 sm:px-6 md:grid-cols-2">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6"><h2 className="text-2xl font-extrabold text-white">Everything you need to act</h2><ul className="mt-5 space-y-3">{benefits.map(item => <li key={item} className="flex gap-3 text-sm text-zinc-300"><CheckCircle className="shrink-0 text-emerald-400" size={17}/>{item}</li>)}</ul></div>
      <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-6"><ShieldCheck className="text-blue-400"/><h2 className="mt-3 text-2xl font-extrabold text-white">Qualified, not crowded</h2><p className="mt-3 text-sm leading-7 text-zinc-300">HashiBot filters structure, liquidity, volatility, timing and risk. You receive the setups that pass—formatted to scan quickly and manage responsibly.</p><p className="mt-4 text-xs text-zinc-500">Signals are informational and never guarantee a result.</p></div>
    </section>

    <section id="mpesa-payment" className="scroll-mt-4 border-y border-zinc-800 bg-zinc-900/40 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl"><div className="mb-6 text-center"><Phone className="mx-auto text-emerald-400"/><h2 className="mt-2 text-3xl font-extrabold text-white">Pay with M-Pesa</h2><p className="mt-2 text-sm text-zinc-400">Send 3,500 KES, then submit the transaction code below.</p></div>
        <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-2xl border border-emerald-500/30 bg-zinc-950 p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Send Money</p><p className="mt-4 text-xs text-zinc-500">Recipient</p><p className="mt-1 text-lg font-bold text-white">{merchantLabel || 'HashiBot'}</p><p className="mt-4 text-xs text-zinc-500">Merchant number</p>
            <div className="mt-1 flex items-center gap-2"><span className="font-mono text-2xl font-black text-white">{merchantNumber || 'Not configured'}</span>{merchantNumber && <button aria-label="Copy M-Pesa number" onClick={() => { void navigator.clipboard.writeText(merchantNumber); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }} className="rounded-lg bg-zinc-800 p-2 text-zinc-300">{copied ? <Check size={15}/> : <Copy size={15}/>}</button>}</div>
            <p className="mt-4 text-xs text-zinc-500">Amount</p><p className="mt-1 text-xl font-black text-emerald-400">3,500 KES</p>
          </div>
          <form onSubmit={submitMpesa} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Full name"><input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></Field><Field label="Account email"><input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="M-Pesa transaction code"><input ref={referenceRef} required className="uppercase" placeholder="e.g. SJK789XYZ" value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></Field><Field label="Payment date"><input required type="date" value={form.paymentDate} onChange={e=>setForm({...form,paymentDate:e.target.value})}/></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Phone (optional)"><input type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field><Field label="Telegram username (optional)"><input placeholder="@username" value={form.telegramUsername} onChange={e=>setForm({...form,telegramUsername:e.target.value})}/></Field></div>
            {message && <div role="status" className={`flex gap-2 rounded-xl border p-3 text-xs ${message.kind === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{message.kind === 'success' ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}<span>{message.text}</span></div>}
            {!session && <p className="text-xs text-amber-300">Already paid? <Link to="/login" className="font-bold underline">Sign in</Link> before submitting this form.</p>}
            <button disabled={submitting || !merchantNumber} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{submitting ? <Loader2 className="animate-spin" size={16}/> : <Send size={16}/>} Submit payment confirmation</button>
          </form>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-4xl px-4 py-10 text-center sm:px-6"><CreditCard className="mx-auto text-blue-400"/><h2 className="mt-3 text-3xl font-extrabold text-white">Ready for the full signal stream?</h2><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">{checkout.configured && <a href={checkout.checkoutUrl} className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-bold text-white">Unlock VIP — $29/month</a>}<button onClick={openMpesa} className="rounded-xl border border-emerald-500/40 px-7 py-3 text-sm font-bold text-emerald-300">Pay with M-Pesa</button></div><p className="mt-5 text-xs text-zinc-500">Not ready? <Link to="/free" className="text-zinc-300 underline">Join Free</Link></p></section>
  </CommerceLayout>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-zinc-300 [&_input]:mt-1 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-zinc-800 [&_input]:bg-zinc-900 [&_input]:px-3.5 [&_input]:py-2.5 [&_input]:font-normal [&_input]:text-white [&_input]:outline-none focus-within:[&_input]:border-blue-500">{label}{children}</label>;
}
