/** Provider snapshots feed account lifecycle truth; they never certify performance. */
export type MonitorObservationStore = {from(table:string):any;rpc(name:string,args:Record<string,unknown>):PromiseLike<{data?:unknown;error?:{message?:string}|null}>};
type Row=Record<string,any>;
export async function synchronizeCanonicalMonitor(input:{store:MonitorObservationStore;ownership:Row;provider:'BINANCE'|'BYBIT';positions:Row[];orders:Row[];complete:boolean;observedAt:string;lookupEntry:(symbol:string,orderId:string)=>Promise<{id:string;symbol:string;side:string;filledQuantity:number;status:string}|null>}){
 if(!input.complete)throw new Error('CANONICAL_MONITOR_INCOMPLETE');
 const {ownership:o,store}=input;
 if(!o.customer_id||!o.account_id||!o.execution_scope_key)throw new Error('CANONICAL_MONITOR_SCOPE_REQUIRED');
 const at=Date.parse(input.observedAt);if(!Number.isFinite(at)||at>Date.now()+5000||Date.now()-at>120000)throw new Error('CANONICAL_MONITOR_STALE');
 const truth=await store.from('crypto_account_execution_truth').select('id,symbol,execution_plan_id,deterministic_client_order_id,lifecycle_state').eq('customer_id',o.customer_id).eq('execution_account_id',o.account_id).eq('provider',input.provider).not('lifecycle_state','in','(CLOSED,REJECTED)').limit(101);
 if(truth.error)throw new Error('CANONICAL_MONITOR_READ_FAILED');if(!Array.isArray(truth.data)||truth.data.length>100)throw new Error('CANONICAL_MONITOR_BOUND_EXCEEDED');
 for(const t of truth.data as Row[]){
  const rows=await store.from('execution_orders').select('*').eq('customer_id',o.customer_id).eq('account_id',o.account_id).eq('execution_scope_key',o.execution_scope_key).eq('raw_exchange_response->>certified_execution_plan_id',t.execution_plan_id).limit(2);
  if(rows.error||!Array.isArray(rows.data)||rows.data.length!==1)throw new Error('CANONICAL_MONITOR_BINDING_REQUIRED');
  const r=rows.data[0] as Row,position=input.positions.filter(p=>p.symbol===t.symbol);
  if(position.length>1)throw new Error('CANONICAL_MONITOR_AMBIGUOUS_POSITION');
  const p=position[0],quantity=p?Math.abs(Number(input.provider==='BINANCE'?p.positionAmt:p.size)):0;
  const side=p?(input.provider==='BINANCE'?(Number(p.positionAmt)>0?'BUY':'SELL'):(p.side==='Buy'?'BUY':p.side==='Sell'?'SELL':null)):null;
  if(!Number.isFinite(quantity)||quantity<0||p&&!side)throw new Error('CANONICAL_MONITOR_INVALID_POSITION');
  if(p&&side!==String(r.direction).toUpperCase().replace('LONG','BUY').replace('SHORT','SELL'))throw new Error('CANONICAL_MONITOR_SIDE_MISMATCH');
  const entry=r.entry_order_id?await input.lookupEntry(String(t.symbol),String(r.entry_order_id)):null;
  const entryVerified=Boolean(entry&&entry.id===String(r.entry_order_id)&&entry.symbol===t.symbol&&['FILLED','PARTIALLY_FILLED'].includes(entry.status)&&Number.isFinite(entry.filledQuantity)&&entry.filledQuantity>0&&entry.side===String(r.direction).toUpperCase().replace('LONG','BUY').replace('SHORT','SELL'));
  const pending=input.orders.filter(x=>x.symbol===t.symbol).length;
  const rowTime=Date.parse(String(r.last_monitor_checked_at??r.latest_sync_at??r.updated_at));
  const fresh=Number.isFinite(rowTime)&&Math.abs(at-rowTime)<=120000;
  const protectedPosition=Boolean(p&&fresh&&r.sl_confirmed===true&&(r.tp1_confirmed===true||r.tp1_status==='filled')&&r.tp2_confirmed===true);
  const evidence={schema_version:'canonical-monitor-observation/v1',observed_at:input.observedAt,execution_scope_key:o.execution_scope_key,execution_order_id:r.id,entry_verified:entryVerified,entry_evidence:entryVerified?entry:null,position_quantity:quantity,position_side:side,open_order_count:pending,protection_verified:protectedPosition,safety_close_pending:r.lifecycle_state==='SAFETY_CLOSING',entry_provider_order_id:r.entry_order_id??null};
  const result=await store.rpc('record_canonical_monitor_observation',{p_customer_id:o.customer_id,p_account_id:o.account_id,p_plan_id:t.execution_plan_id,p_observation:evidence});
  if(result.error)throw new Error(`CANONICAL_MONITOR_NOT_PERSISTED:${result.error.message}`);
 }
 return {observed:truth.data.length};
}
