import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, CheckCircle, LockKeyhole, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { WhopCheckout } from '../../components/commerce/WhopCheckout';

const benefits = ['Complete qualified Forex, Gold/XAUUSD and Crypto signal stream', 'Entry zone, invalidation/stop loss and take-profit levels', 'Context and risk notes attached to each qualified setup', 'Private HashiBot VIP Telegram delivery'];

export default function Vip() {
  const [params] = useSearchParams();
  const mpesaQuery = new URLSearchParams(params);
  mpesaQuery.set('package', 'crypto_signal_room');
  return <PublicLayout>
    <section className="relative overflow-hidden border-b border-zinc-800/80 px-4 py-20 sm:px-6 sm:py-28">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,.18),transparent_45%)]" />
      <div className="relative mx-auto max-w-5xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-300"><Sparkles size={14}/> HashiBot VIP Signals</div>
        <h1 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-6xl">Forex. Gold. Crypto.<br/><span className="text-blue-400">One Qualified Signal Room.</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">Structured, qualified trading signals delivered through the private HashiBot VIP Telegram—built for traders who want clear levels and context, not noise.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a href="#checkout" className="rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-900/30 hover:bg-blue-500">Unlock VIP — $29/month</a>
          <Link to={`/pricing?${mpesaQuery.toString()}#mpesa-payment-section`} className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-7 py-3.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20">Pay 3,500 KES / 30 days</Link>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Payment starts commerce review only. Telegram access follows verified payment and entitlement in Build 2.</p>
      </div>
    </section>

    <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-7"><h2 className="text-2xl font-extrabold text-white">What VIP receives</h2><ul className="mt-6 space-y-4">{benefits.map(x=><li key={x} className="flex gap-3 text-sm text-zinc-300"><CheckCircle className="mt-0.5 shrink-0 text-emerald-400" size={17}/>{x}</li>)}</ul></div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-7"><h2 className="text-2xl font-extrabold text-white">How qualification works</h2><p className="mt-4 text-sm leading-7 text-zinc-400">HashiBot filters market structure, liquidity, volatility, timing and risk conditions. Only setups that pass the configured qualification gates are formatted for the signal room. Qualification reduces noise; it never guarantees an outcome.</p><div className="mt-6 flex gap-3 text-xs text-blue-300"><ShieldCheck size={17}/> Rules-based review • explicit invalidation • risk-first context</div></div>
    </section>

    <section className="border-y border-zinc-800 bg-zinc-900/40 px-4 py-16 sm:px-6"><div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2"><div><div className="text-xs font-bold uppercase tracking-wider text-blue-400">Professional template</div><h2 className="mt-2 text-3xl font-extrabold text-white">A signal you can read quickly</h2><div className="mt-6 rounded-2xl border border-blue-500/30 bg-zinc-950 p-6 font-mono text-sm leading-8 text-zinc-300"><p className="text-blue-400">HASHIBOT VIP • QUALIFIED SETUP</p><p>MARKET: XAUUSD</p><p>DIRECTION: [BUY / SELL]</p><p>ENTRY ZONE: [published level]</p><p>INVALIDATION / SL: [published level]</p><p>TP1 / TP2: [published levels]</p><p>RISK NOTE: Size for your own risk limits</p><p className="mt-3 text-zinc-500">Illustrative format only — not a live signal.</p></div></div><div className="flex flex-col justify-center"><Send className="text-blue-400"/><h2 className="mt-4 text-3xl font-extrabold text-white">Delivered in Telegram</h2><p className="mt-4 text-sm leading-7 text-zinc-400">After verified payment, the future entitlement flow will let you connect Telegram through the existing HashiBot bot. A browser completion screen never grants VIP access.</p></div></div></section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6"><h2 className="text-center text-3xl font-extrabold text-white">Free vs VIP</h2><div className="mt-8 grid gap-5 md:grid-cols-2"><div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"><h3 className="font-bold text-white">HashiBot Free</h3><p className="mt-3 text-sm text-zinc-400">Permanent community access with selected previews, education, intelligence, context and genuine recaps.</p></div><div className="rounded-2xl border border-blue-500/40 bg-blue-950/20 p-6"><h3 className="font-bold text-blue-300">HashiBot VIP</h3><p className="mt-3 text-sm text-zinc-300">The complete paid qualified signal stream across Forex, Gold and Crypto in the private VIP room.</p></div></div></section>

    <section id="checkout" className="border-y border-zinc-800 bg-zinc-900/40 px-4 py-16 sm:px-6"><div className="mx-auto max-w-4xl"><div className="mb-8 text-center"><LockKeyhole className="mx-auto text-blue-400"/><h2 className="mt-3 text-3xl font-extrabold text-white">Choose secure payment</h2><p className="mt-2 text-sm text-zinc-400">$29 USD monthly through Whop, or 3,500 KES per 30 days through M-Pesa.</p></div><WhopCheckout product="HASHIBOT_VIP_SIGNALS"/><div className="mt-4 text-center"><Link to={`/pricing?${mpesaQuery.toString()}#mpesa-payment-section`} className="text-sm font-bold text-emerald-400 hover:text-emerald-300">Prefer M-Pesa? Submit evidence for verification →</Link></div></div></section>

    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6"><h2 className="text-3xl font-extrabold text-white">FAQ</h2><div className="mt-6 space-y-3">{[['Is this automation?','No. /vip sells signals only. It does not sell Auto, Prop, MT5 or exchange credential setup.'],['Is payment confirmation instant access?','No. Access requires verified provider state and a separate HashiBot entitlement.'],['Are results guaranteed?','No. Markets involve risk and every trader remains responsible for position sizing and decisions.']].map(([q,a])=><details key={q} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"><summary className="cursor-pointer font-bold text-white">{q}</summary><p className="mt-3 text-sm text-zinc-400">{a}</p></details>)}</div><div className="mt-10 rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 text-xs leading-6 text-amber-100/70"><BarChart3 className="mb-2 text-amber-400" size={18}/><strong>Risk disclosure:</strong> Trading Forex, Gold and Crypto can result in loss. Signals are informational, are not personalized financial advice, and do not guarantee profit. Never risk funds you cannot afford to lose.</div><div className="mt-8 text-center"><a href="#checkout" className="inline-block rounded-xl bg-blue-600 px-7 py-3 text-sm font-bold text-white">Unlock HashiBot VIP</a><p className="mt-4 text-xs text-zinc-500">Not ready? <Link to="/free" className="text-zinc-300 underline">Join Free</Link></p></div></section>
  </PublicLayout>;
}
