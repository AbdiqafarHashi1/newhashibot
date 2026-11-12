import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { launchJourneys, type LaunchStatus, type ServiceState } from '../../lib/launchOverview';

const tones: Record<ServiceState, string> = { recorded:'border-cyan-800/50 bg-cyan-950/20 text-cyan-200', attention:'border-amber-800/50 bg-amber-950/20 text-amber-200', unavailable:'border-zinc-700 bg-zinc-900 text-zinc-400' };
const labels: Record<ServiceState, string> = { recorded:'Observation available', attention:'Needs attention', unavailable:'Awaiting connection' };
export default function LaunchSetup() {
  const [status,setStatus] = useState<LaunchStatus|null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(true);
  const request = useRef<AbortController|null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setStatus(null);
    try {
      const {data,error} = await supabase.functions.invoke('saas-launch-status',{body:{}, signal:controller.signal, timeout:12000});
      if (error || data?.error || !data?.observedAt || !Array.isArray(data?.checks)) throw new Error('STATUS_UNAVAILABLE');
      if (!controller.signal.aborted) { setNow(Date.now()); setStatus(data); }
    } catch {
      if (!controller.signal.aborted) setError('The backend could not be reached. Restore Supabase and deploy the current database and functions to load connected service status. You can still review historical research and the public pages.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  },[]);
  useEffect(() => { void refresh(); return () => request.current?.abort(); },[refresh]);
  // Re-evaluate freshness even while this dashboard stays open.
  const [now,setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()),30000); return () => clearInterval(timer); },[]);
  const journeys = launchJourneys(status, now);
  return <AdminLayout><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">HashiBot operations</p><h1 className="mt-2 text-3xl font-bold">Your launch workspace</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Research, customer access and connected services in one place. Open a service to configure it, inspect its evidence or resolve a failure.</p></div><button onClick={() => void refresh()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm disabled:opacity-50"><RefreshCw size={14} className={busy?'animate-spin':''}/>{busy?'Checking services…':'Refresh services'}</button></header>
    <section className="grid gap-3 sm:grid-cols-3">
      <Link to="/admin/research" className="rounded-2xl border border-cyan-700/50 bg-gradient-to-br from-cyan-950/70 to-zinc-900 p-5"><p className="text-xs text-cyan-300">Improve the trading engine</p><h2 className="mt-2 text-lg font-semibold">Open strategy research →</h2><p className="mt-2 text-xs leading-5 text-zinc-400">Compare results, activity and account decisions.</p></Link>
      <Link to="/admin/providers" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><p className="text-xs text-blue-300">Owner demo accounts</p><h2 className="mt-2 text-lg font-semibold">Connect trading providers →</h2><p className="mt-2 text-xs leading-5 text-zinc-400">Binance testnet · Bybit demo · MT5 demo.</p></Link>
      <Link to="/" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><p className="text-xs text-indigo-300">Customer experience</p><h2 className="mt-2 text-lg font-semibold">Review the public website →</h2><p className="mt-2 text-xs leading-5 text-zinc-400">Home, pricing, signup and published research.</p></Link>
    </section>
    {error && <p role="alert" className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 text-sm leading-6 text-amber-100">{error}</p>}
    {busy && <p role="status" className="text-sm text-zinc-400">Loading connected service observations…</p>}
    {status && <p className="text-xs text-zinc-500">Checked {new Date(status.observedAt).toLocaleString('en-GB',{timeZone:'Africa/Nairobi',hour12:true})} EAT. Records describe individual steps; inspect their outcomes before activation.</p>}
    <section aria-label="Service journeys" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{journeys.map(j => <article key={j.id} className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{j.title}</h2><Link aria-label={`Open ${j.title}`} to={j.to} className="rounded-lg border border-zinc-700 p-2 text-cyan-300"><ArrowUpRight size={15}/></Link></div><p className="mt-2 text-sm leading-6 text-zinc-400">{j.purpose}</p><span className={`mt-4 self-start rounded-full border px-2.5 py-1 text-[11px] ${tones[j.state]}`}>{labels[j.state]}</span><p className="mt-3 text-xs leading-5 text-zinc-400">{j.evidence}</p><div className="mt-auto pt-4"><p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Next step</p><p className="mt-1 text-sm leading-6 text-zinc-300">{j.next}</p></div></article>)}</section>
    {status && <details className="rounded-xl border border-zinc-800 p-4"><summary className="cursor-pointer text-sm font-semibold">Configuration & recorded diagnostics</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(status.configuration??{}).map(([name,values]) => <article key={name} className="rounded-lg border border-zinc-800 p-3"><h3 className="text-sm font-semibold capitalize">{name}</h3><dl className="mt-2 space-y-2 text-xs">{Object.entries(values).map(([key,value]) => <div key={key} className="flex flex-wrap justify-between gap-2"><dt className="text-zinc-400">{key.replace(/([A-Z])/g,' $1')}</dt><dd>{typeof value==='boolean'?(value?'Present / enabled':'Missing / disabled'):String(value)}</dd></div>)}</dl></article>)}</div>{status.checks.map(check => <details key={check.name} className="mt-3 rounded border border-zinc-800 p-3"><summary className="text-xs">{check.name} · {check.state}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-400">{JSON.stringify(check.data,null,2)}</pre></details>)}</details>}
  </div></AdminLayout>;
}
