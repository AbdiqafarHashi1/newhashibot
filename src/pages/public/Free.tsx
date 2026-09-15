import { Link } from 'react-router-dom';
import { CheckCircle, Send, Sparkles } from 'lucide-react';
import { CommerceLayout } from '../../components/layout/CommerceLayout';

const freeBenefits = ['Selected genuine signal previews', 'Market context and risk-first education', 'Verified outcomes and community updates'];

export default function Free() {
  const invite = import.meta.env.VITE_TELEGRAM_FREE_INVITE_URL as string | undefined;
  const validInvite = invite?.startsWith('https://t.me/');
  const freeCta = validInvite
    ? <a href={invite} rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 py-3.5 text-sm font-bold text-white hover:bg-emerald-500">Join Free Telegram <Send size={16}/></a>
    : <span className="rounded-xl border border-zinc-700 px-7 py-3.5 text-sm text-zinc-400">Free invite coming soon</span>;
  const vipCta = <Link to="/vip" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white hover:bg-blue-500">Unlock Full VIP — $29/month</Link>;

  return <CommerceLayout>
    <section className="relative overflow-hidden border-b border-zinc-800 px-4 py-12 text-center sm:px-6 sm:py-16"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,.15),transparent_50%)]"/><div className="relative mx-auto max-w-4xl"><div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300"><Send size={14}/> Permanent free community</div><h1 className="mt-5 text-4xl font-black text-white sm:text-6xl">Start free. See the difference.</h1><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300">Free gets selected previews. VIP gets every qualified setup, every level, every update.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">{freeCta}{vipCta}</div></div></section>

    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><h2 className="text-center text-3xl font-extrabold text-white">Useful from day one</h2><div className="mt-7 grid gap-4 md:grid-cols-3">{freeBenefits.map(item=><div key={item} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-300"><CheckCircle className="mb-3 text-emerald-400" size={19}/>{item}</div>)}</div><div className="mt-7 text-center">{vipCta}</div></section>

    <section className="border-y border-zinc-800 bg-zinc-900/40 px-4 py-10 sm:px-6"><div className="mx-auto max-w-5xl"><div className="text-center"><Sparkles className="mx-auto text-blue-400"/><h2 className="mt-3 text-3xl font-extrabold text-white">Free previews. VIP completeness.</h2><p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-zinc-400">Get a feel for HashiBot in Free, then upgrade when you want the complete qualified stream without missing levels or updates.</p></div><div className="mt-7 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"><h3 className="font-bold text-emerald-300">HashiBot Free</h3><ul className="mt-4 space-y-3 text-sm text-zinc-400"><li>Selected setup previews</li><li>Education and market context</li><li>Permanent community access</li></ul></div><div className="rounded-2xl border border-blue-500/40 bg-blue-950/20 p-6"><h3 className="font-bold text-blue-300">HashiBot VIP</h3><ul className="mt-4 space-y-3 text-sm text-zinc-200"><li>Every qualified setup</li><li>Every entry, stop and target level</li><li>Every live update in the private room</li></ul></div></div><div className="mt-7 text-center">{vipCta}</div></div></section>

    <section className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6"><h2 className="text-3xl font-extrabold text-white">Join free now. Upgrade when you want it all.</h2><p className="mt-3 text-sm text-zinc-400">No trial clock. No card required for Free.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">{freeCta}{vipCta}</div></section>
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-zinc-800 bg-zinc-950/95 p-2 backdrop-blur md:hidden">{validInvite ? <a href={invite} rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-3 text-center text-xs font-bold text-white">Join Free</a> : <span className="rounded-lg bg-zinc-800 px-3 py-3 text-center text-xs text-zinc-500">Join Free</span>}<Link to="/vip" className="rounded-lg bg-blue-600 px-3 py-3 text-center text-xs font-bold text-white">Unlock VIP</Link></div>
  </CommerceLayout>;
}
