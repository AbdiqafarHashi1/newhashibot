import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Check, GraduationCap, Radio, Send, Sparkles } from 'lucide-react';
import { CommerceLayout } from '../../components/layout/CommerceLayout';
import { ExecutionProductPreview } from '../../components/public/ExecutionProductPreview';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { authResumePath, savePurchaseIntent } from '../../lib/purchaseIntent';

const freeBenefits = [
  { icon: Radio, title: 'Signal previews', copy: 'Selected genuine setups in the HashiBot format.' },
  { icon: Sparkles, title: 'Market context', copy: 'Understand the structure behind selected opportunities.' },
  { icon: GraduationCap, title: 'Risk-first education', copy: 'Practical guidance built around disciplined trading.' },
  { icon: BookOpen, title: 'Verified recaps', copy: 'Community updates and clearly labelled outcomes.' },
];

export default function Free() {
  const { session } = useAuth(); const navigate = useNavigate();
  const [availability, setAvailability] = useState(false);
  const [enrollmentState, setEnrollmentState] = useState('');
  const joinFree = async () => {
    savePurchaseIntent({ product: 'FREE_SIGNALS' });
    if (!session) { navigate(authResumePath()); return; }
    setAvailability(false); setEnrollmentState('Setting up your free access…');
    const { data, error } = await supabase.functions.invoke('free-enrollment', { headers: { 'idempotency-key': crypto.randomUUID() } });
    if (error) { setAvailability(true); setEnrollmentState('We could not enroll you right now. Please try again.'); return; }
    setEnrollmentState(data?.state === 'ACTIVE' ? 'Free access is ready. Connect Telegram in your account to continue; channel membership is confirmed separately.' : 'Your request is being prepared. We will show the next Telegram step when it is ready.');
  };
  const FreeButton = ({ short = false }: { short?: boolean }) => <button onClick={joinFree} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950/20 hover:bg-emerald-500">{short ? 'Join Free' : 'Join Free Telegram'} <Send size={15}/></button>;

  return <CommerceLayout>
    <div className="pb-16 md:pb-0">
      <section className="relative overflow-hidden border-b border-zinc-800 px-4 py-9 text-center sm:px-6 sm:py-14"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,.14),transparent_52%)]"/><div className="relative mx-auto max-w-4xl"><div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-emerald-300"><Send size={13}/> Permanent free community</div><h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">Start free. <span className="text-emerald-400">See the difference.</span></h1><p className="mx-auto mt-4 max-w-2xl text-[15px] leading-6 text-zinc-300 sm:text-base">Free gets selected previews. VIP gets every qualified setup, every level, every update.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><FreeButton/><Link to="/vip" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-500/40 bg-blue-500/10 px-7 py-3 text-sm font-bold text-blue-300 hover:bg-blue-500/20">Unlock Full VIP — $29/month</Link></div>{enrollmentState && <p role="status" className="mx-auto mt-3 text-xs text-emerald-300">{enrollmentState}</p>}{availability && <p role="status" className="mx-auto mt-3 max-w-md rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">The free community is temporarily unavailable. Please try again shortly.</p>}</div></section>

      <Comparison />

      <section className="mx-auto max-w-5xl px-4 py-9 sm:px-6"><div className="text-center"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-400">Inside HashiBot Free</p><h2 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">Useful from day one</h2></div><div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">{freeBenefits.map(({icon: Icon,title,copy})=><div key={title} className="flex gap-3 bg-zinc-950 p-4 lg:block"><Icon className="shrink-0 text-emerald-400" size={18}/><div><h3 className="font-bold text-white lg:mt-3">{title}</h3><p className="mt-1 text-xs leading-5 text-zinc-400">{copy}</p></div></div>)}</div></section>

      <section className="border-y border-zinc-800 bg-zinc-900/40 px-4 py-9 text-center sm:px-6"><div className="mx-auto max-w-3xl"><h2 className="text-2xl font-extrabold text-white sm:text-3xl">Start with context. Upgrade for completeness.</h2><p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-400">No trial clock. No card required for Free. Move to VIP when you want every qualified setup across Forex, Gold and Crypto.</p><Link to="/vip" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-7 py-3 text-sm font-bold text-white hover:bg-blue-500">Unlock Full VIP</Link></div></section>

      <section className="mx-auto max-w-5xl px-4 py-9 sm:px-6"><div className="mb-5 text-center"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-cyan-400">Free → VIP → Auto Execution</p><h2 className="mt-2 text-2xl font-extrabold text-white">A clear path when you are ready</h2><p className="mt-2 text-sm text-zinc-400">Free and VIP are signal products. Auto Execution is a separate per-account entitlement with provider setup and demo certification.</p></div><ExecutionProductPreview compact/><div className="mt-5 text-center"><Link to="/execution" className="inline-flex rounded-xl border border-cyan-500/40 px-6 py-3 font-bold text-cyan-300">Explore Auto Execution</Link><p className="mt-3 text-xs text-zinc-500">Verified proof will appear only from canonical certification evidence. No performance result is claimed here.</p></div></section>

      <section className="mx-auto max-w-3xl px-4 py-9 text-center sm:px-6"><h2 className="text-2xl font-extrabold text-white sm:text-3xl">Join free now. Upgrade when you want it all.</h2><div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row"><FreeButton short/><Link to="/vip" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-500/40 px-7 py-3 text-sm font-bold text-blue-300">Get Full VIP</Link></div>{availability && <p role="status" className="mt-3 text-xs text-amber-200">The free community is temporarily unavailable. Please try again shortly.</p>}</section>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-zinc-800 bg-zinc-950/95 p-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"><button onClick={joinFree} className="rounded-lg bg-emerald-600 px-3 py-3 text-center text-xs font-bold text-white">Join Free</button><Link to="/vip" className="rounded-lg bg-blue-600 px-3 py-3 text-center text-xs font-bold text-white">Get Full VIP</Link></div>
  </CommerceLayout>;
}

function Comparison() {
  const free = ['Selected setup previews', 'Market context & education', 'Permanent community access'];
  const vip = ['Every qualified setup', 'Every entry, stop and target level', 'Every lifecycle update', 'Forex + Gold + Crypto', 'Private VIP room'];
  return <section className="border-b border-zinc-800 bg-zinc-900/30 px-4 py-9 sm:px-6"><div className="mx-auto max-w-5xl"><div className="text-center"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-blue-400">Free vs VIP</p><h2 className="mt-2 text-2xl font-extrabold text-white sm:text-3xl">Choose how complete you want the stream.</h2></div><div className="mt-6 grid overflow-hidden rounded-2xl border border-zinc-800 md:grid-cols-2"><Plan title="HashiBot Free" items={free} tone="free"/><Plan title="HashiBot VIP" items={vip} tone="vip"/></div><div className="mt-5 text-center"><Link to="/vip" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-7 py-3 text-sm font-bold text-white hover:bg-blue-500">Unlock Full VIP</Link></div></div></section>;
}

function Plan({ title, items, tone }: { title: string; items: string[]; tone: 'free' | 'vip' }) {
  return <div className={`p-5 sm:p-6 ${tone === 'vip' ? 'border-t border-blue-500/30 bg-blue-950/20 md:border-l md:border-t-0' : 'bg-zinc-950'}`}><div className="flex items-center justify-between"><h3 className={`text-sm font-black uppercase tracking-wider ${tone === 'vip' ? 'text-blue-300' : 'text-emerald-300'}`}>{title}</h3>{tone === 'vip' && <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[10px] font-bold text-blue-300">COMPLETE</span>}</div><ul className="mt-4 space-y-2.5">{items.map(item=><li key={item} className="flex gap-2 text-sm text-zinc-300"><Check className={`mt-0.5 shrink-0 ${tone === 'vip' ? 'text-blue-400' : 'text-emerald-400'}`} size={15}/>{item}</li>)}</ul></div>;
}
