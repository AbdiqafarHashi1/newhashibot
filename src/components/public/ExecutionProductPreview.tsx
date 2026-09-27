import { Activity, AlertTriangle, Brain, CheckCircle2, KeyRound, Laptop, Server, ShieldCheck } from 'lucide-react';

const items = [
  ['Customer dashboard','Package pending · next action: finish provider setup'],
  ['Execution account','MT5 Personal · DEMO · not connected'],
  ['Assigned Brain','PERSONAL_MT5_GROWTH · policy 2026.09'],
  ['Safe risk customization','0.10%–1.00% · server-enforced range'],
  ['Strategy permissions','Forex Trend · Gold Breakout · approved only'],
  ['Phase-D decision example','REDUCE · account risk limit'],
  ['HashiBridge download','READY_FOR_CONFIGURATION · no artifact claimed'],
  ['Pairing code','Example only · short-lived · single-use'],
  ['Terminal detected','Pending authenticated handshake'],
  ['Heartbeat','Example state: HEALTHY → DEGRADED → OFFLINE'],
  ['Windows VPS','Recommended for reliable 24/7 MT5 operation'],
  ['Binance connection','Testnet · credentials required'],
  ['Bybit connection','Demo · credentials required'],
  ['Capability guard','Withdrawal permission is rejected'],
  ['Readiness','AWAITING_PROVIDER · execution disabled'],
  ['Position lifecycle','Entry → TP1 → breakeven → profit lock → trail → TP2'],
  ['Protection verified','Example interface · canonical lifecycle evidence required'],
  ['Protection incident','Safety close / reconciliation escalation'],
  ['Telegram lifecycle','Example notification · automation not activated'],
] as const;

/** Read-only by construction: no callbacks, forms, provider clients, or mutations. */
export function ExecutionProductPreview({compact=false}:{compact?:boolean}) {
  const shown=compact?items.slice(0,6):items;
  const icons=[Brain,ShieldCheck,KeyRound,Server,Laptop,Activity,AlertTriangle,CheckCircle2];
  return <section data-preview-mode="read-only" aria-label="Auto Execution product preview" className="rounded-3xl border border-cyan-500/20 bg-zinc-950/80 p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.18em] text-cyan-400">Product preview · read-only</p><h2 className="mt-2 text-2xl font-black text-white">See the safety workflow before setup</h2></div><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200">NOT CONNECTED</span></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.map(([title,value],i)=>{const Icon=icons[i%icons.length];return <article key={title} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="flex items-center gap-2 text-zinc-400"><Icon size={15}/><span className="text-xs font-bold uppercase tracking-wide">{title}</span></div><p className="mt-2 text-sm leading-5 text-zinc-200">{value}</p></article>})}</div>
    <p className="mt-5 text-xs leading-5 text-zinc-500">Example interface only. It contains no performance results, connected account, real credential, provider call, or execution control.</p>
  </section>;
}
