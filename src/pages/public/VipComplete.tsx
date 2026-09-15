import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock3, Loader2, ShieldAlert } from 'lucide-react';
import { CommerceLayout } from '../../components/layout/CommerceLayout';
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
    let timer: number | undefined; let cancelled = false;
    const check = async () => {
      try { const next = await getMyVipCommerceStatus(); if (cancelled) return; setStatus(next); if (next.state === 'ACTIVE') setTelegram(await getMyVipTelegramStatus()); attempts.current += 1; if (next.state === 'VERIFYING' && attempts.current < 6) timer = window.setTimeout(check, 3000); }
      catch { if (!cancelled) setError('We cannot check your access right now. Please try again shortly.'); }
    };
    void check(); return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [loading, session]);

  const connectTelegram = async () => {
    setLinking(true); setError('');
    try { const result = await createVipTelegramOnboardingLink(); if (result.state === 'LINKED') setTelegram(await getMyVipTelegramStatus()); else window.location.assign(result.url); }
    catch (err) { setError(err instanceof Error ? err.message : 'Telegram connection is unavailable. Please try again.'); }
    finally { setLinking(false); }
  };

  let content;
  if (loading) content = <State icon={<Loader2 className="animate-spin text-blue-400"/>} title="Checking your account" body="Just a moment while we load your HashiBot account."/>;
  else if (!session) content = <State icon={<ShieldAlert className="text-amber-400"/>} title="Sign in to confirm access" body="Use the HashiBot account connected to your payment." action={<Link className="font-bold text-blue-400" to="/login">Sign in →</Link>}/>;
  else if (error) content = <State icon={<ShieldAlert className="text-red-400"/>} title="We couldn't finish that" body={error}/>;
  else if (!status || status.state === 'VERIFYING') content = <State icon={<Loader2 className="animate-spin text-blue-400"/>} title="Confirming your payment" body="Your payment provider is still confirming the payment. We’ll check again automatically."/>;
  else if (status.state === 'ACTIVE') content = <State icon={<CheckCircle className="text-emerald-400"/>} title="VIP access is active" body={`Your VIP access is ready${status.expires_at ? ` through ${new Date(status.expires_at).toLocaleDateString()}` : ''}. Connect Telegram to enter the room.`} action={telegram?.state === 'HEALTHY' ? <a href={`https://t.me/${String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').replace(/^@/,'')}`} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">Open Telegram</a> : <button onClick={connectTelegram} disabled={linking} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{linking ? 'Preparing your link…' : telegram?.state === 'LINKING_FAILED' ? 'Try Telegram again' : 'Connect Telegram'}</button>}/>;
  else if (status.state === 'MPESA_PENDING') content = <State icon={<Clock3 className="text-amber-400"/>} title="Payment submitted" body={`We’re confirming your M-Pesa payment. Your reference is ${status.reference}. You can safely return later.`}/>;
  else content = <State icon={<ShieldAlert className="text-red-400"/>} title={status.state === 'REJECTED' ? 'Payment needs attention' : 'VIP access is not active'} body="Check your payment details or contact HashiBot support for help." action={<Link className="font-bold text-blue-400" to="/vip">Return to payment options →</Link>}/>;

  return <CommerceLayout><section className="px-4 py-12 sm:px-6 sm:py-16"><div className="mx-auto max-w-xl text-center"><p className="text-sm font-bold text-blue-400">HASHIBOT VIP</p><h1 className="mt-3 text-3xl font-black text-white">You’re almost in. Confirm your access, connect Telegram, and enter the VIP room.</h1><div className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-7 shadow-2xl">{content}</div><p className="mt-6 text-xs leading-6 text-zinc-500">Manage your plan anytime through your payment provider. Your access stays active for the period you’ve paid for.</p></div></section></CommerceLayout>;
}

function State({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return <><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-950">{icon}</div><h2 className="mt-5 text-2xl font-extrabold text-white">{title}</h2><p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>{action && <div className="mt-6">{action}</div>}</>;
}
