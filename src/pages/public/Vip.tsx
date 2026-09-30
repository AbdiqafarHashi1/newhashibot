import { Link } from 'react-router-dom';
import { ArrowRight, Check, Send } from 'lucide-react';
import { CommerceLayout } from '../../components/layout/CommerceLayout';
import { CanonicalCheckout } from '../../components/commerce/CanonicalCheckout';
import { ExecutionProductPreview } from '../../components/public/ExecutionProductPreview';
import { EvidenceSlot } from '../../components/public/EvidenceSlot';

const benefits = ['Every qualified canonical setup', 'Entry, stop and target levels', 'Lifecycle management updates', 'Forex + Gold + Crypto', 'Private VIP Telegram'];
export default function Vip() {
 return <CommerceLayout>
  <section className="border-b border-zinc-800 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,.18),transparent_50%)] px-4 py-12"><div className="mx-auto max-w-4xl text-center"><p className="text-xs font-black uppercase tracking-widest text-blue-300">HashiBot VIP Signals</p><h1 className="mt-3 text-4xl font-black text-white sm:text-6xl">One scanner. One canonical signal truth.</h1><p className="mx-auto mt-4 max-w-2xl text-zinc-300">The locked scanner qualifies a setup once. Free receives selected previews; VIP receives the complete levels and truthful lifecycle updates. No result is guaranteed.</p><div className="mx-auto mt-7 max-w-xl"><CanonicalCheckout product="VIP_SIGNALS" /></div><p className="mt-3 text-xs text-zinc-500">$29/month card · 3,500 KES / 30 days M-Pesa · prices are validated by the server.</p></div></section>
  <SignalDemo />
  <section className="mx-auto max-w-5xl px-4 py-10"><div className="grid gap-4 sm:grid-cols-2">{benefits.map(x=><div key={x} className="flex gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300"><Check size={16} className="text-blue-400"/>{x}</div>)}</div><div className="mt-8 rounded-2xl border border-cyan-500/25 bg-cyan-500/[.06] p-5"><p className="text-xs font-black uppercase text-cyan-400">Separate products, separate entitlements</p><h2 className="mt-2 text-2xl font-black text-white">VIP is not Auto Execution</h2><p className="mt-2 text-sm leading-6 text-zinc-300">Execution is separately gated by verified per-account payment, owned-account onboarding, provider setup, versioned Brain policy, and paper/demo certification. Live execution is not enabled.</p><div className="mt-4"><ExecutionProductPreview compact/></div><Link to="/execution" className="mt-4 inline-flex rounded-xl bg-cyan-500 px-5 py-3 font-bold text-zinc-950">Explore execution</Link></div></section>
  <Journey /><section className="mx-auto max-w-4xl px-4 py-10"><EvidenceSlot/></section>
 </CommerceLayout>;
}
function Journey(){const steps=['Choose VIP and sign in; the intended purchase is preserved.','Create canonical checkout; provider remains pending until verified.','Payment webhook activates entitlement—never the browser redirect.','Connect the bot before or after payment.','Accept the single-use private invite; status stays ACTION_REQUIRED until Telegram confirms membership.'];return <section className="border-y border-zinc-800 bg-zinc-900/40 px-4 py-10"><div className="mx-auto max-w-4xl"><h2 className="text-2xl font-black text-white">Purchase to private Telegram</h2><ol className="mt-5 space-y-3">{steps.map((x,i)=><li key={x} className="flex gap-3 rounded-xl bg-zinc-950 p-4 text-sm text-zinc-300"><b className="text-blue-400">{i+1}</b>{x}</li>)}</ol><Link to="/app/telegram" className="mt-5 inline-block text-blue-300 underline">Already entitled? Connect Telegram</Link></div></section>}
function SignalDemo() {
  const evidence = ['Structure aligned', 'Momentum confirmed', 'Volatility acceptable', 'Timing/liquidity filter passed', 'Risk filters passed'];

  return <section className="border-b border-zinc-800/80 bg-zinc-900/20 px-4 py-8 sm:px-6 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-blue-400">Example VIP signal</p>
        <h2 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">See exactly what arrives in VIP.</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">A complete setup, followed by management updates as the trade develops.</p>
      </div>

      <div className="rounded-2xl border border-zinc-700/80 bg-[#070a10] p-2.5 shadow-2xl shadow-black/30 sm:p-4">
        <article aria-label="Illustrative HashiBot VIP signal message" className="overflow-hidden rounded-xl border border-blue-500/20 bg-[#10141d]">
          <header className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-[#131925] px-3.5 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white ring-2 ring-blue-400/20"><Send size={16}/></span>
              <div className="min-w-0"><div className="flex items-center gap-1.5"><h3 className="truncate text-sm font-extrabold text-white">HashiBot VIP</h3><span aria-label="Verified" className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black text-white">✓</span></div><p className="text-[11px] font-medium text-blue-300">Private VIP Signal</p></div>
            </div>
            <span className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-200">Example template</span>
          </header>

          <div className="px-3.5 py-4 sm:px-5">
            <p className="text-[11px] font-black uppercase tracking-[.16em] text-blue-300">HashiBot VIP Signal</p>
            <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-2xl font-black tracking-tight text-white">EURUSD</span><span className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-400 ring-1 ring-inset ring-emerald-500/30">BUY</span><span className="rounded-md bg-blue-500/15 px-2.5 py-1 text-xs font-black text-blue-300 ring-1 ring-inset ring-blue-500/30">A+ QUALIFIED</span></div>

            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[['Market', 'FOREX'], ['Strategy', 'Example: Structure + Momentum'], ['Timeframe', '15M'], ['Status', '🟢 SIGNAL ACTIVE']].map(([label, value]) => <div key={label} className={`${label === 'Strategy' ? 'col-span-2 sm:col-span-1' : ''} rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5`}><dt className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</dt><dd className={`mt-1 text-xs font-bold ${label === 'Status' ? 'text-emerald-400' : 'text-zinc-200'}`}>{value}</dd></div>)}
            </dl>

            <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
              <div className="col-span-2 bg-zinc-950 p-3 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Entry</p><p className="mt-1 whitespace-nowrap font-mono text-sm font-bold text-white">1.17320 – 1.17345</p></div>
              <div className="bg-zinc-950 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Stop loss</p><p className="mt-1 font-mono text-sm font-bold text-red-300">1.17180</p></div>
              <div className="bg-zinc-950 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Risk</p><p className="mt-1 font-mono text-sm font-bold text-white">0.5%</p></div>
              <div className="col-span-2 bg-zinc-950 p-3 sm:col-span-1"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Take profit</p><p className="mt-1 font-mono text-sm font-bold text-emerald-300">TP1: 1.17480</p><p className="mt-0.5 font-mono text-sm font-bold text-emerald-300">TP2: 1.17640</p></div>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-zinc-500"><strong className="text-zinc-400">R:R from 1.17345:</strong> TP1 0.82R · TP2 1.79R (calculated from the top of the entry range to the stop).</p>

            <div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-zinc-400">Setup context <span className="font-medium normal-case tracking-normal text-zinc-600">· illustrative checks</span></p><div className="mt-2 flex flex-wrap gap-1.5">{evidence.map(item => <span key={item} className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2.5 py-1 text-[10px] font-medium text-zinc-300"><span className="mr-1 text-emerald-400">✓</span>{item}</span>)}</div></div>
          </div>
        </article>

        <div aria-label="Illustrative signal lifecycle" className="my-2.5 flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-2 text-[9px] font-bold uppercase tracking-wide sm:gap-2 sm:text-[10px]"><span className="text-emerald-400">Signal active</span><ArrowRight className="text-zinc-600" size={11}/><span className="text-emerald-400">TP1 hit</span><ArrowRight className="text-zinc-600" size={11}/><span className="text-blue-300">Break even</span><ArrowRight className="text-zinc-600" size={11}/><span className="text-white">TP2 active</span></div>

        <article aria-label="Illustrative HashiBot management update message" className="ml-auto max-w-[95%] overflow-hidden rounded-xl rounded-tr-sm border border-blue-500/25 bg-blue-950/25 sm:max-w-[88%]">
          <header className="flex items-center gap-2 border-b border-blue-500/15 px-3.5 py-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white"><Send size={12}/></span><div><h3 className="text-xs font-bold text-white">HashiBot Management Update</h3><p className="text-[10px] text-blue-300">EURUSD BUY</p></div></header>
          <div className="space-y-1 px-3.5 py-3 text-xs leading-5 text-zinc-300"><p className="font-extrabold text-emerald-400">✅ TP1 HIT</p><p>Stop moved to <strong className="text-white">BREAK EVEN</strong>.</p><p>TP2 remains active.</p><p>Original risk plan remains in effect.</p><p className="pt-1 text-[11px] text-zinc-500">This demonstrates how HashiBot follows the signal lifecycle after entry.</p></div>
        </article>
      </div>

      <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-center text-[10px] leading-4 text-zinc-500">Example only — this demonstrates the VIP signal format. It is not a live signal, historical trade, or performance claim.</p>
      <p className="mx-auto mt-4 max-w-2xl text-center text-sm font-semibold leading-6 text-zinc-300">This is what VIP means: the full setup, the levels, and the management updates — not just a direction.</p>
    </div>
  </section>;
}
