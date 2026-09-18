import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowDown, Check, CheckCircle, Copy, CreditCard, Loader2, LockKeyhole, Phone, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { CommerceLayout } from '../../components/layout/CommerceLayout';
import { useAuth } from '../../contexts/AuthContext';
import { getWhopCheckout, readAttribution } from '../../lib/commerce';
import { submitManualMpesaRequest } from '../../lib/mpesa';

const benefits = ['Qualified setups', 'Precise entries', 'Stop / invalidation', 'Multi-level targets', 'Lifecycle management', 'Private VIP Telegram', 'Forex + Gold + Crypto'];
const amountKes = 3500;
const temporaryMessage = 'This payment option is temporarily unavailable. Please try again shortly.';

export default function Vip() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const checkout = getWhopCheckout('HASHIBOT_VIP_SIGNALS');
  const merchantNumber = import.meta.env.VITE_MPESA_MERCHANT_NUMBER as string | undefined;
  const merchantLabel = import.meta.env.VITE_MPESA_MERCHANT_LABEL as string | undefined;
  const referenceRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({
    fullName: String(session?.user.user_metadata?.full_name ?? ''), email: session?.user.email ?? '', phone: '',
    reference: '', paymentDate: new Date().toISOString().split('T')[0], telegramUsername: '',
  });

  const openCardCheckout = () => {
    setAvailability(null);
    if (checkout.configured) window.location.assign(checkout.checkoutUrl);
    else setAvailability('Card checkout is temporarily unavailable. Please try again shortly.');
  };

  const openMpesa = () => {
    setAvailability(null);
    if (!merchantNumber) return setAvailability(temporaryMessage);
    document.getElementById('mpesa-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => referenceRef.current?.focus(), 400);
  };

  const submitMpesa = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(null);
    if (!merchantNumber) return setMessage({ kind: 'error', text: temporaryMessage });
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
    <section className="relative overflow-hidden border-b border-zinc-800 px-4 py-9 sm:px-6 sm:py-14">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,.18),transparent_50%)]" />
      <div className="relative mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-blue-300"><Sparkles size={13}/> HashiBot VIP Signals</div>
        <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">Trade the setup.<br/><span className="text-blue-400">Skip the noise.</span></h1>
        <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-6 text-zinc-300 sm:text-base sm:leading-7">Every qualified Forex, Gold and Crypto setup — complete with levels, context and updates delivered directly to your private Telegram room.</p>
        <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
          <button onClick={openCardCheckout} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500"><CreditCard size={16}/> $29/month <span className="font-medium text-blue-100">· Card / International</span></button>
          <button onClick={openMpesa} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20"><Phone size={16}/> 3,500 KES / 30 days <span className="font-medium">· M-Pesa</span></button>
        </div>
        {availability && <div role="status" className="mx-auto mt-3 max-w-xl rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{availability}</div>}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500"><LockKeyhole size={12}/> Secure checkout • Cancel anytime</p>
      </div>
    </section>

    <SignalDemo />

    <section className="mx-auto max-w-5xl px-4 py-9 sm:px-6">
      <div className="grid overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 md:grid-cols-[1.15fr_.85fr]">
        <div className="p-5 sm:p-7"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-blue-400">Everything you need to act</p><h2 className="mt-2 text-2xl font-extrabold text-white">The complete setup, at a glance.</h2><div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">{benefits.map(item => <div key={item} className="flex gap-2 text-sm text-zinc-300"><CheckCircle className="mt-0.5 shrink-0 text-emerald-400" size={15}/>{item}</div>)}</div></div>
        <div className="border-t border-zinc-800 bg-zinc-950/60 p-5 md:border-l md:border-t-0 sm:p-7"><ShieldCheck className="text-blue-400" size={22}/><h2 className="mt-3 text-xl font-extrabold text-white">Qualified, not crowded</h2><p className="mt-3 text-sm leading-6 text-zinc-400">HashiBot filters structure, liquidity, volatility, timing and risk. You receive the setups that pass — formatted to scan quickly and manage responsibly.</p><p className="mt-4 text-xs text-zinc-600">Signals are informational and never guarantee a result.</p></div>
      </div>
      <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-blue-500/25 bg-blue-500/[.06] p-4 sm:flex-row sm:px-5"><div><p className="font-bold text-white">Get every qualified setup and every update.</p><p className="mt-1 text-xs text-zinc-400">Choose card or M-Pesa. Both options are shown above.</p></div><button onClick={openCardCheckout} className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 sm:w-auto">Unlock Full VIP — $29/month</button></div>
    </section>

    {merchantNumber && <section id="mpesa-payment" className="scroll-mt-4 border-y border-zinc-800 bg-zinc-900/40 px-4 py-9 sm:px-6">
      <div className="mx-auto max-w-5xl"><div className="mb-5 text-center"><Phone className="mx-auto text-emerald-400" size={22}/><h2 className="mt-2 text-2xl font-extrabold text-white">Pay with M-Pesa</h2><p className="mt-2 text-sm text-zinc-400">Send 3,500 KES, then submit the transaction code below.</p></div>
        <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
          <div className="rounded-2xl border border-emerald-500/30 bg-zinc-950 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Payment details</p><p className="mt-4 text-xs text-zinc-500">Recipient</p><p className="mt-1 text-lg font-bold text-white">{merchantLabel || 'HashiBot'}</p><p className="mt-3 text-xs text-zinc-500">Merchant number</p>
            <div className="mt-1 flex items-center gap-2"><span className="font-mono text-2xl font-black text-white">{merchantNumber}</span><button aria-label="Copy M-Pesa number" onClick={() => { void navigator.clipboard.writeText(merchantNumber); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }} className="rounded-lg bg-zinc-800 p-2 text-zinc-300">{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div>
            <p className="mt-3 text-xs text-zinc-500">Amount</p><p className="mt-1 text-xl font-black text-emerald-400">3,500 KES</p>
          </div>
          <form onSubmit={submitMpesa} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Full name"><input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></Field><Field label="Account email"><input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field></div>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="M-Pesa transaction code"><input ref={referenceRef} required className="uppercase" placeholder="e.g. SJK789XYZ" value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></Field><Field label="Payment date"><input required type="date" value={form.paymentDate} onChange={e=>setForm({...form,paymentDate:e.target.value})}/></Field></div>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone (optional)"><input type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field><Field label="Telegram username (optional)"><input placeholder="@username" value={form.telegramUsername} onChange={e=>setForm({...form,telegramUsername:e.target.value})}/></Field></div>
            {message && <div role="status" className={`flex gap-2 rounded-xl border p-3 text-xs ${message.kind === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{message.kind === 'success' ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}<span>{message.text}</span></div>}
            {!session && <p className="text-xs text-amber-300">Already paid? <Link to="/login" className="font-bold underline">Sign in</Link> before submitting this form.</p>}
            <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{submitting ? <Loader2 className="animate-spin" size={16}/> : <Send size={16}/>} Submit payment confirmation</button>
          </form>
        </div>
      </div>
    </section>}

    <section className="mx-auto max-w-4xl px-4 py-9 text-center sm:px-6"><h2 className="text-2xl font-extrabold text-white sm:text-3xl">Ready for the full signal stream?</h2><div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={openCardCheckout} className="rounded-xl bg-blue-600 px-7 py-3 text-sm font-bold text-white">Unlock VIP — $29/month</button><button onClick={openMpesa} className="rounded-xl border border-emerald-500/40 px-7 py-3 text-sm font-bold text-emerald-300">Pay with M-Pesa</button></div><p className="mt-4 text-xs text-zinc-500">Not ready? <Link to="/free" className="text-zinc-300 underline">Join Free</Link></p>{availability && <p role="status" className="mt-3 text-xs text-amber-200">{availability}</p>}</section>
  </CommerceLayout>;
}

function SignalDemo() {
  return <section className="border-b border-zinc-800/80 bg-zinc-900/20 px-4 py-9 sm:px-6"><div className="mx-auto max-w-3xl"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-blue-400">Example VIP signal</p><h2 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">See exactly what arrives.</h2></div><span className="hidden text-xs text-zinc-500 sm:block">Illustrative format</span></div>
    <div className="overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#090b10] shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 sm:px-5"><div className="flex items-center gap-2 text-xs font-bold text-zinc-300"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white"><Send size={13}/></span> HashiBot VIP <span className="text-blue-400">✓</span></div><span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Signal desk</span></div>
      <div className="p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><h3 className="mr-1 text-2xl font-black tracking-tight text-white">EURUSD</h3><span className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-400 ring-1 ring-inset ring-emerald-500/30">BUY</span><span className="rounded-md bg-blue-500/15 px-2.5 py-1 text-xs font-black text-blue-300 ring-1 ring-inset ring-blue-500/30">A+ QUALIFIED</span></div>
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-5">{[['Entry','1.17320 – 1.17345'],['Stop Loss','1.17180'],['TP1','1.17480'],['TP2','1.17640'],['Risk','0.5%']].map(([label,value])=><div key={label} className="bg-zinc-950 p-3 last:col-span-2 sm:last:col-span-1"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p><p className={`mt-1 font-mono text-sm font-bold ${label === 'Stop Loss' ? 'text-red-300' : label.startsWith('TP') ? 'text-emerald-300' : 'text-white'}`}>{value}</p></div>)}</div>
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-1 text-center text-[9px] font-bold uppercase tracking-wide sm:text-[11px]"><span className="text-emerald-400">Signal active</span><ArrowDown className="-rotate-90 text-zinc-600" size={12}/><span className="text-emerald-400">TP1 hit ✓</span><ArrowDown className="-rotate-90 text-zinc-600" size={12}/><span className="text-blue-300">Stop moved<br/>to break even</span><ArrowDown className="-rotate-90 text-zinc-600" size={12}/><span className="text-white">TP2 target<br/>active</span></div></div>
        <div className="mt-3 ml-auto max-w-lg rounded-xl rounded-tr-sm border border-blue-500/20 bg-blue-950/30 p-3"><div className="flex gap-2"><Send className="mt-0.5 shrink-0 text-blue-400" size={14}/><p className="text-xs leading-5 text-zinc-300"><strong className="text-white">Management update:</strong> TP1 reached. Stop moved to break even; TP2 remains active. Continue to follow the published risk plan.</p></div></div>
      </div>
    </div><p className="mt-3 text-center text-[11px] leading-5 text-zinc-500">Illustrative example of the VIP signal format only — not a live or historical trade, performance claim or trading guarantee.</p></div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-zinc-300 [&_input]:mt-1 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-zinc-800 [&_input]:bg-zinc-900 [&_input]:px-3.5 [&_input]:py-2.5 [&_input]:font-normal [&_input]:text-white [&_input]:outline-none focus-within:[&_input]:border-blue-500">{label}{children}</label>;
}
