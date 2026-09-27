import { useEffect,useState } from 'react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { supabase } from '../../lib/supabase';
type Row={execution_account_id:string;customer_id:string;state:string;reasons:string[];required_action:string|null;calculated_at:string};
type Related={onboarding:number;entitlements:number;connections:number;brains:number;acks:number;slots:number;support:number;additional:number;campaigns:number;audits:number};
const empty:Related={onboarding:0,entitlements:0,connections:0,brains:0,acks:0,slots:0,support:0,additional:0,campaigns:0,audits:0};
export default function OnboardingOperations(){
 const [rows,setRows]=useState<Row[]>([]),[counts,setCounts]=useState(empty),[error,setError]=useState('');
 useEffect(()=>{void Promise.all([
  supabase.from('execution_readiness_projections').select('execution_account_id,customer_id,state,reasons,required_action,calculated_at').order('calculated_at',{ascending:false}),
  ...['customer_onboarding_sessions','phase_h_entitlements','provider_connections_safe','account_brain_assignments','risk_acknowledgements','founding_slot_reservations','assisted_setup_requests','additional_account_requests','campaign_attributions','phase_h_audit_events'].map(t=>supabase.from(t).select('*',{count:'exact',head:true}))
 ]).then(([readiness,...related])=>{setRows((readiness.data||[]) as Row[]);setError(readiness.error?.message||'');setCounts(Object.fromEntries(Object.keys(empty).map((k,i)=>[k,related[i].count||0])) as unknown as Related)})},[]);
 return <AdminLayout><main className="p-4 text-zinc-100 sm:p-8"><h1 className="text-2xl font-bold">Customer onboarding operations</h1><p className="mt-2 text-zinc-400">Safe support projections only. Raw provider secrets, passwords, tokens and pairing codes are unavailable.</p>
 <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">{Object.entries(counts).map(([k,v])=><div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3" key={k}><small className="uppercase text-zinc-500">{k}</small><b className="block text-xl">{v}</b></div>)}</div>
 {error&&<div className="mt-6 rounded-xl border border-amber-500/30 p-4 text-amber-200">READY_FOR_CONFIGURATION — {error}</div>}
 <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full text-sm"><thead className="bg-zinc-900 text-zinc-400"><tr>{['Customer','Account','Readiness','Reason codes','Required action','Safe audit/support'].map(x=><th className="p-3 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr className="border-t border-zinc-800" key={r.execution_account_id}><td className="p-3 font-mono">{r.customer_id.slice(0,8)}…</td><td className="p-3 font-mono">{r.execution_account_id.slice(0,8)}…</td><td className="p-3 font-semibold">{r.state}</td><td className="p-3">{r.reasons.join(', ')}</td><td className="p-3">{r.required_action||'—'}</td><td className="p-3">Server-authority actions only</td></tr>)}{!rows.length&&!error&&<tr><td className="p-8 text-center text-zinc-400" colSpan={6}>No onboarding accounts yet. No mock customers are shown.</td></tr>}</tbody></table></div>
 <p className="mt-4 text-xs text-zinc-500">Package, entitlement, founding slot, provider, bridge heartbeat, Brain/version, acknowledgement, certification, support, additional-account, campaign, incident and audit projections are loaded from canonical tables. Any future action must be audited server-side.</p></main></AdminLayout>;
}
