import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Database, RefreshCw, Server } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
import { mapMT5Readiness, type MT5Readiness } from '../../lib/operatorStatus';

type AccountRow = { id:string; broker?:string; server?:string; account_number_masked?:string; bridge_id?:string; last_heartbeat_at?:string; terminal_authenticated?:boolean; execution_enabled?:boolean };
const empty = mapMT5Readiness({ backendAvailable: true });
const tone = (value:string) => value === 'READY' || value === 'ONLINE' || value === 'CONNECTED' || value === 'YES' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : value === 'UNKNOWN' || value === 'NOT_CONFIGURED' ? 'text-zinc-300 border-zinc-600 bg-zinc-800' : 'text-amber-300 border-amber-500/30 bg-amber-500/10';
function Badge({children}:{children:string}) { return <span className={`rounded border px-2 py-1 text-[10px] font-bold ${tone(children)}`}>{children.replace(/_/g,' ')}</span> }

export default function ProviderOverview(){
  const [backend,setBackend]=useState<'LOADING'|'AVAILABLE'|'UNAVAILABLE'>('LOADING');
  const [account,setAccount]=useState<AccountRow|null>(null);
  const [mt5,setMt5]=useState<MT5Readiness>(empty);
  const [error,setError]=useState('');
  const load=async()=>{ setBackend('LOADING'); setError(''); const {data,error}=await supabase.from('mt5_accounts_safe').select('id,broker,server,account_number_masked,bridge_id,last_heartbeat_at,terminal_authenticated,execution_enabled').order('last_heartbeat_at',{ascending:false}).limit(1); if(error){setBackend('UNAVAILABLE');setAccount(null);setMt5(mapMT5Readiness({backendAvailable:false}));setError(error.message);return;} const row=(data?.[0]??null) as AccountRow|null; setBackend('AVAILABLE');setAccount(row);setMt5(mapMT5Readiness({backendAvailable:true,accountId:row?.id,bridgeId:row?.bridge_id,lastHeartbeatAt:row?.last_heartbeat_at,terminalAuthenticated:row?.terminal_authenticated,fetchHistorySupported:row?true:null,executionEnabled:row?.execution_enabled,commandPathCertified:null})); };
  useEffect(()=>{void load()},[]);
  return <AdminLayout><main className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-3 border-b border-zinc-800 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-bold uppercase tracking-widest text-blue-400">Providers</div><h1 className="text-2xl font-black">Provider Overview</h1><p className="mt-1 text-sm text-zinc-400">Canonical capability truth. Historical-data access is never presented as execution connectivity.</p></div><button onClick={load} className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs"><RefreshCw size={14}/>Refresh truth</button></header>
    <section className={`rounded-xl border p-4 ${backend==='UNAVAILABLE'?'border-red-500/40 bg-red-500/10':'border-zinc-800 bg-zinc-900'}`}><div className="flex items-center gap-2"><Database size={16}/><b>BACKEND {backend}</b></div>{backend==='UNAVAILABLE'&&<p className="mt-2 text-xs text-red-200">Provider, account, certification, execution, and fresh MT5 research readiness are unavailable. {error}</p>}</section>
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><Server size={17}/>MT5</h2><Badge>{mt5.bridge}</Badge></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><dt className="text-zinc-500">Terminal</dt><dd><Badge>{mt5.terminal}</Badge></dd><dt className="text-zinc-500">Authenticated</dt><dd><Badge>{mt5.authenticated}</Badge></dd><dt className="text-zinc-500">Historical data</dt><dd><Badge>{mt5.history}</Badge></dd><dt className="text-zinc-500">Execution</dt><dd><Badge>{mt5.execution}</Badge></dd><dt className="text-zinc-500">Account</dt><dd>{account?.account_number_masked??'UNKNOWN'}</dd><dt className="text-zinc-500">Broker / server</dt><dd>{account?[account.broker,account.server].filter(Boolean).join(' / '):'UNKNOWN'}</dd></dl><div className="mt-4 text-xs text-amber-300">{mt5.blockers.join(' · ')||'Research prerequisites satisfied'}</div><Link to="/admin/providers/mt5" className="mt-4 inline-block rounded bg-blue-600 px-3 py-2 text-xs font-bold">Open canonical MT5</Link></section>
      {(['Binance','Bybit'] as const).map(name=><section key={name} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between"><h2 className="font-bold">{name}</h2><Badge>UNKNOWN</Badge></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><dt className="text-zinc-500">Public historical</dt><dd><Badge>READY</Badge></dd><dt className="text-zinc-500">Authenticated account</dt><dd><Badge>UNKNOWN</Badge></dd><dt className="text-zinc-500">Execution</dt><dd><Badge>NOT_CONFIGURED</Badge></dd><dt className="text-zinc-500">Certification</dt><dd><Badge>UNKNOWN</Badge></dd></dl><p className="mt-4 text-xs text-zinc-500">Public adapter availability only. No authenticated connection or execution readiness is inferred.</p><Link to={`/admin/providers/${name.toLowerCase()}`} className="mt-4 inline-block text-xs font-bold text-blue-400">Open {name} operations →</Link></section>)}
    </div>
    <aside className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-xs text-zinc-400"><Activity className="mr-2 inline" size={14}/>UNKNOWN remains unknown when no canonical backend contract supplies the fact.</aside>
  </main></AdminLayout>
}
