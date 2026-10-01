import { FormEvent, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Phone, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { readAttribution } from '../../lib/commerce';
import { authResumePath, getOrCreatePurchaseAttemptKey, savePurchaseIntent } from '../../lib/purchaseIntent';
import { supabase } from '../../lib/supabase';

export function MpesaCheckout({ termDays }: { termDays: 7 | 30 }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const amount = termDays === 7 ? '1,200' : '3,500';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const attribution = readAttribution(params);
    savePurchaseIntent({ product: 'VIP_SIGNALS', provider: 'MPESA', termDays, attribution: { ...attribution } });
    if (!session) { navigate(authResumePath()); return; }
    submitting.current = true; setBusy(true); setMessage('Starting a secure M-Pesa request…');
    const attemptScope = `mpesa.vip.${termDays}`;
    const { data, error } = await supabase.functions.invoke('commerce-checkout', {
      body: { product_code: 'VIP_SIGNALS', provider: 'MPESA', currency: 'KES', term_days: termDays, phone, return_url: `${location.origin}/payment/result`, ...attribution },
      headers: { 'x-idempotency-key': getOrCreatePurchaseAttemptKey(attemptScope) },
    });
    submitting.current = false; setBusy(false);
    if (error || data?.state === 'CHECKOUT_NOT_CONFIGURED') { setMessage('M-Pesa checkout cannot currently be started. Please try again later; do not send money manually.'); return; }
    if (data?.state === 'PROVIDER_PENDING' || data?.state === 'ACTION_REQUIRED') {
      setMessage(data.masked_phone ? `Prompt sent to ${data.masked_phone}. Enter your M-Pesa PIN only on your phone. We are awaiting confirmation.` : 'This purchase attempt is already in progress. We are awaiting provider confirmation.');
      navigate(`/payment/result?checkout=${encodeURIComponent(data.checkout_id)}`);
      return;
    }
    setMessage('We could not start the payment. No access has been granted.');
  }

  return <form onSubmit={submit} className="rounded-2xl border border-emerald-500/30 bg-zinc-950 p-5">
    <Phone className="text-emerald-400"/><h3 className="mt-2 font-bold text-white">{amount} KES · {termDays} days</h3>
    <p className="mt-2 text-xs leading-5 text-zinc-400">Enter the Safaricom number that should receive the STK prompt. Your PIN is entered only in the M-Pesa prompt on your phone—never on HashiBot.</p>
    <label className="mt-4 block text-xs font-bold text-zinc-300">M-Pesa phone number<input required inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07XX XXX XXX" className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white"/></label>
    <button disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"><ShieldCheck size={16}/>{busy ? 'Starting…' : `Pay ${amount} KES`}</button>
    {message && <p role="status" className="mt-3 text-xs leading-5 text-amber-200">{message}</p>}
  </form>;
}
