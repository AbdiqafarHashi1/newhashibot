import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock3, Loader2, ShieldAlert } from 'lucide-react';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { createVipTelegramOnboardingLink, getMyVipCommerceStatus, getMyVipTelegramStatus, type VipCommerceState, type VipTelegramState } from '../../lib/entitlements';

export default function VipComplete() {
  const { session, loading } = useAuth();
  const [status, setStatus] = useState<VipCommerceState | null>(null);
  const [error, setError] = useState('');
  const [telegram, setTelegram] = useState<VipTelegramState | null>(null);
  const [linking, setLinking] = useState(false);
  const attempts = useRef(0);

  useEffect(() => {
    if (loading || !session) return;
    let timer: number | undefined;
    let cancelled = false;
    const check = async () => {
      try {
        const next = await getMyVipCommerceStatus();
        if (cancelled) return;
        setStatus(next);
        if (next.state === 'ACTIVE') setTelegram(await getMyVipTelegramStatus());
        attempts.current += 1;
        if (next.state === 'VERIFYING' && attempts.current < 6) timer = window.setTimeout(check, 3000);
      } catch {
        if (!cancelled) setError('Authoritative status is temporarily unavailable. No access has been granted.');
      }
    };
    void check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [loading, session]);

  const connectTelegram = async () => {
    setLinking(true); setError('');
    try { const result = await createVipTelegramOnboardingLink(); if (result.state === 'LINKED') setTelegram(await getMyVipTelegramStatus()); else window.location.assign(result.url); }
    catch (err) { setError(err instanceof Error ? err.message : 'Telegram onboarding is unavailable.'); }
    finally { setLinking(false); }
  };

  let content;
  if (loading) content = <State icon={<Loader2 className="animate-spin text-blue-400"/>} title="Checking account" body="Loading your authenticated HashiBot account…"/>;
  else if (!session) content = <State icon={<ShieldAlert className="text-amber-400"/>} title="Sign in to check status" body="Checkout return parameters cannot prove payment. Sign in to resolve your authoritative entitlement." action={<Link className="text-blue-400 font-bold" to="/login">Sign in →</Link>}/>;
  else if (error) content = <State icon={<ShieldAlert className="text-red-400"/>} title="Status unavailable" body={error}/>;
  else if (!status || status.state === 'VERIFYING') content = <State icon={<Loader2 className="animate-spin text-blue-400"/>} title="Verifying" body="The provider may still be notifying HashiBot. We will recheck briefly; this page does not grant access."/>;
  else if (status.state === 'ACTIVE') content = <State icon={<CheckCircle className="text-emerald-400"/>} title="VIP ACTIVE" body={`Your canonical HashiBot VIP entitlement is active${status.expires_at ? ` until ${new Date(status.expires_at).toLocaleString()}` : ''}.`} action={telegram?.state === 'HEALTHY' ? <a href={`https://t.me/${String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/,'')}`} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">OPEN TELEGRAM</a> : <div><button onClick={connectTelegram} disabled={linking} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{linking ? 'CREATING SECURE LINK…' : telegram?.state === 'LINKING_FAILED' ? 'RETRY TELEGRAM LINK' : 'CONNECT TELEGRAM'}</button>{telegram?.safe_error && <p className="mt-2 text-xs text-red-300">Linking needs attention: {telegram.safe_error}</p>}</div>}/>;
  else if (status.state === 'MPESA_PENDING') content = <State icon={<Clock3 className="text-amber-400"/>} title="Payment submitted — awaiting verification" body={`HashiBot reference: ${status.reference}. Your request is durable and you may safely leave or return later from this account.`}/>;
  else content = <State icon={<ShieldAlert className="text-red-400"/>} title={status.state === 'REJECTED' ? 'Payment request rejected' : 'No active VIP access found'} body="No access was granted. Review your payment details or contact HashiBot support." action={<Link className="font-bold text-blue-400" to="/vip">Return to VIP options →</Link>}/>;

  return <PublicLayout><section className="min-h-[65vh] px-4 py-20 sm:px-6"><div className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center shadow-2xl">{content}</div><p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-6 text-zinc-500">Cancellation normally prevents renewal while valid paid access continues until the authoritative period ends. Digital purchases are generally non-refundable after delivery; duplicate charges, billing errors and exceptional cases may be reviewed. Refunds and disputes reconcile against provider truth.</p></section></PublicLayout>;
}

function State({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return <>{<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-950">{icon}</div>}<h1 className="mt-5 text-2xl font-extrabold text-white">{title}</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>{action && <div className="mt-6">{action}</div>}</>;
}
