import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {AdminLayout} from '../../components/layout/AdminLayout';
import {CustomerAccessActions} from '../../components/operations/CustomerAccessActions';
import {supabase} from '../../lib/supabase';
type Customer={id:string;email:string;full_name:string};
type Access={customer_id:string;product_code:string;state:string;source:string;valid_until:string|null;revoked_at:string|null};
type Membership={customer_id:string;audience:string;state:string};
export default function Customers(){
 const [params]=useSearchParams(),[rows,setRows]=useState<Customer[]>([]),[access,setAccess]=useState<Access[]>([]),[members,setMembers]=useState<Membership[]>([]),[selected,setSelected]=useState<Customer|null>(null),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[cursors,setCursors]=useState<string[]>(['']),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const generation=useRef(0),cursor=cursors.at(-1)??'',requested=params.get('customer')??'';
 useEffect(()=>{let active=true;const run=++generation.current;setBusy(true);setError('');setRows([]);setAccess([]);setMembers([]);
 void(async()=>{try{
  let q=supabase.from('profiles').select('id,email,full_name').order('id',{ascending:false});
  if(requested)q=q.eq('id',requested);else if(search)q=q.eq('email',search.toLowerCase());else if(cursor)q=q.lt('id',cursor);
  const result=await q.limit(51);if(result.error)throw Error('Customer directory unavailable.');const page=(result.data??[]).slice(0,50),ids=page.map(p=>p.id);
  const [e,m]=ids.length?await Promise.all([supabase.from('phase_h_entitlements').select('customer_id,product_code,state,source,valid_until,revoked_at').in('customer_id',ids).in('product_code',['FREE_SIGNALS','VIP_SIGNALS']),supabase.from('telegram_memberships').select('customer_id,audience,state').in('customer_id',ids)]):[{data:[],error:null},{data:[],error:null}];
  if(e.error||m.error)throw Error('Customer access evidence unavailable.');if(!active||run!==generation.current)return;
  setRows(page);setAccess((e.data??[]) as Access[]);setMembers((m.data??[]) as Membership[]);setMore((result.data?.length??0)>50);if(requested&&page[0])setSelected(page[0]);
 }catch(e){if(active&&run===generation.current)setError(e instanceof Error?e.message:'Customer records unavailable.')}finally{if(active&&run===generation.current)setBusy(false)}})();return()=>{active=false};
 },[cursor,search,requested,refresh]);
 return <AdminLayout><main className="mx-auto max-w-6xl space-y-5 pb-16"><header><h1 className="text-3xl font-bold">Customers &amp; access</h1><p className="mt-2 text-sm text-zinc-400">One support page for registered Free and VIP customers, including people who have not linked Telegram yet. Registration, access and channel membership are shown separately.</p><div className="mt-3 flex flex-wrap gap-4 text-sm text-cyan-300"><Link to="/admin/commerce">Payment records &amp; recovery →</Link><Link to="/admin/telegram?tab=members">Channel membership &amp; reconciliation →</Link></div></header>
 <form onSubmit={e=>{e.preventDefault();setSearch(query.trim());setCursors(['']);setSelected(null)}} className="flex flex-wrap gap-3"><input aria-label="Find customer by email" type="email" placeholder="Exact customer email" className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 p-2" value={query} onChange={e=>setQuery(e.target.value)}/><button className="rounded border border-zinc-700 px-3 py-2" disabled={busy}>Find customer</button><button type="button" onClick={()=>{setSearch('');setQuery('');setCursors(['']);setRefresh(v=>v+1)}} className="rounded border border-zinc-700 px-3 py-2">Refresh directory</button></form>
 <CustomerAccessActions email={selected?.email} customerId={selected?.id} onChanged={()=>setRefresh(v=>v+1)}/>
 {error&&<p role="alert" className="text-amber-200">{error}</p>}{busy&&<p>Loading customer records…</p>}{!busy&&!error&&!rows.length&&<p>No matching customer. They can create their account through /free.</p>}
 <div className="grid gap-3 md:grid-cols-2">{rows.map(c=><article key={c.id} className={`rounded-xl border p-4 ${selected?.id===c.id?'border-cyan-500':'border-zinc-800'}`}><h2 className="font-semibold">{c.full_name||c.email}</h2><p className="break-all text-sm text-zinc-400">{c.email}</p><p className="mt-2 text-xs text-zinc-400">{access.filter(e=>e.customer_id===c.id).map(e=>`${e.product_code}: ${e.revoked_at?'REVOKED':e.state}${e.valid_until?` · until ${new Date(e.valid_until).toLocaleDateString('en-KE')}`:''} · ${e.source}`).join(' | ')||'No Free/VIP access recorded'}</p><p className="mt-2 text-xs text-zinc-400">{members.filter(m=>m.customer_id===c.id).map(m=>`${m.audience}: ${m.state}`).join(' | ')||'Telegram membership not recorded'}</p><button className="mt-3 text-sm text-cyan-300" onClick={()=>setSelected(c)}>Manage this customer</button></article>)}</div>
 <div className="flex gap-4 text-sm"><button disabled={busy||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>Previous</button><span>Page {cursors.length} · up to 50 accounts</span><button disabled={busy||!more} onClick={()=>setCursors(v=>[...v,rows.at(-1)!.id])}>Next</button></div>
 </main></AdminLayout>;
}
