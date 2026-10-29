import type {ConditionalSetup} from './conditional-signal-service.ts';
/** Read recorded setups for editorial references. Numeric trade management stays in lifecycle messages. */
export async function conditionalIntelligence(db:any,market:'crypto'|'forex') {
 const r=await db.from('conditional_signal_setups').select('state').eq('market',market).in('status',['WAITING','ARMED','ACTIVE']).order('updated_at',{ascending:false}).limit(21);
 if(r.error||!Array.isArray(r.data)||r.data.length>20)throw Error('TRACKED_SETUP_SNAPSHOT_UNAVAILABLE');
 const states=r.data.map((r:any)=>r.state as ConditionalSetup);
 if(!states.length)return [];
 const samples=await db.from('conditional_free_samples').select('setup_id').in('setup_id',states.map((s:ConditionalSetup)=>s.id));
 if(samples.error)throw Error('FREE_SETUP_SELECTION_UNAVAILABLE');
 const free=new Set((samples.data??[]).map((r:any)=>r.setup_id));
 return states.map((s:ConditionalSetup)=>({id:s.id,symbol:s.symbol,track:s.track,status:s.status,strategy:s.strategy,variant:s.variant,reason:s.reason,free:free.has(s.id)}));
}
export function trackedSetupSections(rows:unknown,audience:'free'|'vip'):Array<{heading:string;body:string}> {
 if(!Array.isArray(rows))return [];
 const selected=rows.filter(s=>audience==='vip'||s.free===true).slice(0,6);
 return selected.length?[{heading:'Tracked setups',body:selected.map(s=>`${s.symbol} · ${s.track} · ${s.status}\n${s.strategy} / ${s.variant}\n${s.reason}\nRef: ${s.id}`).join('\n\n')}]:[];
}
