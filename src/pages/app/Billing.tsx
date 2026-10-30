import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {AppLayout} from '../../components/layout/AppLayout';
import {usePreviewViewer} from '../../contexts/OwnerPreviewContext';
import {supabase} from '../../lib/supabase';
type Subscription={id:string;product_code:string;provider:string;status:string;current_period_end?:string;currency:string;amount_minor:number;cancel_at_period_end:boolean};
export default function Billing(){
 const {subject}=usePreviewViewer(),id=subject?.id;
 const [rows,setRows]=useState<Subscription[]>([]),[manual,setManual]=useState<{expires_at:string;access_status:string}|null>(null),[state,setState]=useState('LOADING');
 useEffect(()=>{let active=true;if(!id)return;setState('LOADING');void Promise.all([supabase.from('commerce_subscriptions').select('id,product_code,provider,status,current_period_end,currency,amount_minor,cancel_at_period_end').eq('customer_id',id),supabase.rpc('my_release1_customer_subscription')]).then(([s,e])=>{if(!active)return;if(s.error||e.error){setRows([]);setManual(null);setState('UNAVAILABLE');return;}setRows((s.data??[]) as Subscription[]);setManual(e.data?.manual_access?e.data:null);setState('READY')});return()=>{active=false}},[id]);
 return <AppLayout><main className="mx-auto max-w-3xl space-y-5 pb-12"><header><h1 className="text-3xl font-bold">Billing &amp; access</h1><p className="mt-3 text-zinc-400">Your subscriptions, renewal dates and any owner-approved VIP allowance.</p></header>{state==='LOADING'&&<p>Loading your billing status…</p>}{state==='UNAVAILABLE'&&<p role="alert" className="text-amber-200">Your billing status could not be loaded. Please refresh in a moment.</p>}
 {manual&&<section className="rounded-xl border border-zinc-700 p-5"><h2 className="font-semibold">Owner-approved VIP access</h2><p className="mt-2 text-sm text-zinc-400">{manual.access_status} · until {new Date(manual.expires_at).toLocaleDateString('en-KE')}. This allowance is separate from provider billing.</p></section>}
 {rows.map(r=><article key={r.id} className="rounded-xl border border-zinc-800 p-5"><h2 className="font-semibold">{r.product_code.replaceAll('_',' ')} · {r.status.replaceAll('_',' ')}</h2><p className="mt-2 text-sm text-zinc-400">{r.provider} · {(r.amount_minor/100).toLocaleString()} {r.currency}{r.current_period_end?` · period ends ${new Date(r.current_period_end).toLocaleDateString('en-KE')}`:''}</p>{r.cancel_at_period_end&&<p className="mt-2 text-sm text-amber-200">Cancellation is scheduled at the end of the current period.</p>}</article>)}
 {state==='READY'&&!rows.length&&!manual&&<p>No VIP subscription is recorded yet. You can continue with Free or explore VIP below.</p>}
 <nav className="flex flex-wrap gap-3"><Link className="rounded bg-cyan-500 px-4 py-2 font-semibold text-zinc-950" to="/app/onboarding">Continue onboarding</Link><Link className="rounded border border-zinc-700 px-4 py-2" to="/vip">VIP plans &amp; renewal</Link><Link className="rounded border border-zinc-700 px-4 py-2" to="/app/telegram">Telegram access</Link></nav>
 </main></AppLayout>;
}
