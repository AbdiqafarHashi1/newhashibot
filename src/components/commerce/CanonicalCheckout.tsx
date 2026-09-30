import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { captureAttribution } from '../../lib/commerce';
import { supabase } from '../../lib/supabase';

export type CheckoutProduct = 'VIP_SIGNALS' | 'FOUNDING_AUTO_EXECUTION';

export function CanonicalCheckout({ product, executionAccountId, compact = false }: { product: CheckoutProduct; executionAccountId?: string; compact?: boolean }) {
  const { session } = useAuth();
  const route = useLocation();
  const [params] = useSearchParams();
  const attribution = useMemo(() => captureAttribution(params), [params]);
  const [state, setState] = useState('');
  const [provider, setProvider] = useState<'WHOP' | 'MPESA'>('WHOP');
  const [phone, setPhone] = useState('');

  const intended = `${route.pathname}${route.search}`;
  const begin = async () => {
    if (!session) {
      sessionStorage.setItem('hashibot.checkout.resume', intended);
      setState('AUTHENTICATION_REQUIRED');
      return;
    }
    if (product === 'FOUNDING_AUTO_EXECUTION' && !executionAccountId) {
      setState('EXECUTION_ACCOUNT_REQUIRED — complete onboarding and select an owned account.');
      return;
    }
    setState('CREATING_CHECKOUT');
    const key = crypto.randomUUID();
    const { data, error } = await supabase.functions.invoke('commerce-checkout', {
      body: {
        product_code: product, provider, currency: provider === 'WHOP' ? 'USD' : 'KES',
        execution_account_id: executionAccountId, phone: provider === 'MPESA' ? phone : undefined,
        return_url: `${window.location.origin}/payment/result`,
        campaign: attribution.campaign || attribution.utmCampaign,
        source: attribution.source || attribution.utmSource,
        medium: attribution.utmMedium, content: attribution.utmContent,
        affiliate: attribution.affiliate || attribution.ref,
      },
      headers: { 'x-idempotency-key': key },
    });
    const next = String(data?.state || (error ? 'CHECKOUT_NOT_CONFIGURED' : 'PAYMENT_PENDING'));
    setState(next);
    if (data?.checkout_id) sessionStorage.setItem('hashibot.checkout.last', String(data.checkout_id));
    if (next === 'PROVIDER_PENDING' && data?.action_url) window.location.assign(String(data.action_url));
  };

  return <div data-testid={`canonical-checkout-${product}`} className={compact ? 'space-y-3' : 'rounded-2xl border border-blue-500/30 bg-zinc-950 p-6'}>
    <div className="grid grid-cols-2 gap-2" aria-label="Payment provider">
      <button onClick={() => setProvider('WHOP')} className={`rounded-lg border px-3 py-2 text-xs font-bold ${provider === 'WHOP' ? 'border-blue-400 text-blue-300' : 'border-zinc-700 text-zinc-400'}`}>Card / International</button>
      <button onClick={() => setProvider('MPESA')} disabled={product !== 'VIP_SIGNALS'} className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40 ${provider === 'MPESA' ? 'border-emerald-400 text-emerald-300' : 'border-zinc-700 text-zinc-400'}`}>M-Pesa</button>
    </div>
    {provider === 'MPESA' && <label className="block text-xs text-zinc-400">Kenyan phone for provider prompt<input aria-label="M-Pesa phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="07…" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>}
    <button onClick={() => void begin()} className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white">{product === 'VIP_SIGNALS' ? 'Continue to verified VIP checkout' : 'Continue to Founding 20 checkout'}</button>
    {!session && <p className="text-xs text-zinc-400">We will preserve this purchase while you <Link className="text-blue-300 underline" to={`/login?returnTo=${encodeURIComponent(intended)}`}>sign in</Link> or <Link className="text-blue-300 underline" to={`/register?returnTo=${encodeURIComponent(intended)}`}>create an account</Link>.</p>}
    {state && <p role="status" className="text-xs text-amber-300">{state}</p>}
    <p className="text-[11px] leading-4 text-zinc-500">Only a signed provider event verified by the backend can activate access. Redirects, receipts, usernames and checkout creation are not payment proof.</p>
  </div>;
}
