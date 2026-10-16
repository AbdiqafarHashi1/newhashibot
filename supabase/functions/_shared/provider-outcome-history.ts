import type {AccountPerformanceEvidence} from './account-performance-policy.ts';
type Row=Record<string,any>;
export interface ClosedProviderOutcome {executionId:string;closedAt:string;currency:string;netPnl:number;sourceIds:string[];source:'BINANCE_USER_TRADES_AND_INCOME'|'BYBIT_CLOSED_PNL'|'MT5_DEALS'}
const finite=(x:unknown)=>typeof x!=='boolean'&&x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x));
/** Exhaust a provider time window; saturation is subdivided, never mistaken for complete history. */
export async function readBoundedHistory(read:(start:number,end:number,cursor?:string)=>Promise<{rows:Row[];cursor?:string;saturated?:boolean}>,start:number,end:number,maxRequests=64){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)throw Error('HISTORY_RANGE_INVALID');let requests=0;const rows:Row[]=[];
 async function window(lo:number,hi:number){let cursor:string|undefined;const seen=new Set<string>();const batch:Row[]=[];do{if(++requests>maxRequests)throw Error('HISTORY_REQUEST_BOUND');const page=await read(lo,hi,cursor);if(!Array.isArray(page.rows))throw Error('HISTORY_RESPONSE_MALFORMED');if(page.saturated){if(cursor||hi<=lo)throw Error('HISTORY_TRUNCATED');const mid=Math.floor((lo+hi)/2);await window(lo,mid);await window(mid+1,hi);return;}batch.push(...page.rows);cursor=page.cursor;if(cursor){if(seen.has(cursor))throw Error('HISTORY_CURSOR_REPEATED');seen.add(cursor)}}while(cursor);rows.push(...batch);}
 const width=7*86400000-1;for(let lo=start;lo<=end;lo+=width+1)await window(lo,Math.min(end,lo+width));return rows;
}
function unique(rows:Row[],id:(r:Row)=>string){const found=new Map<string,string>();return rows.filter(r=>{const key=id(r);if(!key)throw Error('HISTORY_SOURCE_ID_REQUIRED');const content=JSON.stringify(r);if(found.has(key)){if(found.get(key)!==content)throw Error('HISTORY_CONTENT_CONFLICT');return false}found.set(key,content);return true})}
export function binanceClosedOutcome(input:{executionId:string;symbol:string;quantity:number;orderIds:readonly string[];fills:Row[];income:Row[];closedAt:string}):ClosedProviderOutcome{
 if(!finite(input.quantity)||input.quantity<=0||!Number.isFinite(Date.parse(input.closedAt)))throw Error('CLOSED_TRADE_INPUT_INVALID');
 const ids=new Set(input.orderIds.filter(Boolean)),fills=unique(input.fills,r=>String(r.id??''));if(!ids.size||!fills.length)throw Error('CLOSED_TRADE_FILLS_REQUIRED');
 let net=0,buy=0,sell=0;const sources:string[]=[];let first=Infinity,last=-Infinity;
 for(const f of fills){if(f.symbol!==input.symbol||!ids.has(String(f.orderId)))throw Error('UNATTRIBUTED_PROVIDER_FILL');if(!['BUY','SELL'].includes(f.side)||![f.qty,f.realizedPnl,f.commission,f.time].every(finite)||Number(f.qty)<=0||Number(f.time)<=0||Number(f.time)>Date.parse(input.closedAt)||f.commissionAsset!=='USDT')throw Error('FILL_OR_FEE_CURRENCY_UNSUPPORTED');net+=Number(f.realizedPnl)-Number(f.commission);if(f.side==='BUY')buy+=Number(f.qty);else sell+=Number(f.qty);first=Math.min(first,Number(f.time));last=Math.max(last,Number(f.time));sources.push(`trade:${f.id}`)}
 if(Math.abs(buy-sell)>1e-8||Math.abs(buy-input.quantity)>1e-8)throw Error('CLOSED_QUANTITY_NOT_RECONCILED');
 for(const x of unique(input.income,r=>String(r.tranId??''))){if(x.incomeType!=='FUNDING_FEE')continue;if(x.symbol!==input.symbol||x.asset!=='USDT'||![x.income,x.time].every(finite))throw Error('FUNDING_EVIDENCE_INVALID');if(Number(x.time)<first||Number(x.time)>last)continue;net+=Number(x.income);sources.push(`income:${x.tranId}`)}
 return{executionId:input.executionId,closedAt:new Date(last).toISOString(),currency:'USDT',netPnl:net,sourceIds:sources,source:'BINANCE_USER_TRADES_AND_INCOME'};
}
export function bybitClosedOutcome(input:{executionId:string;symbol:string;quantity:number;exitOrderIds:readonly string[];rows:Row[];closedAt:string}):ClosedProviderOutcome{
 if(!finite(input.quantity)||input.quantity<=0||!Number.isFinite(Date.parse(input.closedAt)))throw Error('CLOSED_TRADE_INPUT_INVALID');
 const ids=new Set(input.exitOrderIds.filter(Boolean)),rows=unique(input.rows,r=>String(r.orderId??''));let qty=0,net=0,closed=-Infinity;
 if(!rows.length||!ids.size)throw Error('CLOSED_PNL_REQUIRED');for(const r of rows){if(r.symbol!==input.symbol||!ids.has(String(r.orderId))||![r.closedSize,r.closedPnl,r.updatedTime].every(finite)||Number(r.closedSize)<=0||Number(r.updatedTime)<=0||Number(r.updatedTime)>Date.parse(input.closedAt)||r.execType!=='Trade')throw Error('CLOSED_PNL_LINEAGE_INVALID');qty+=Number(r.closedSize);net+=Number(r.closedPnl);closed=Math.max(closed,Number(r.updatedTime))}
 if(Math.abs(qty-input.quantity)>1e-8||!input.symbol.endsWith('USDT'))throw Error('CLOSED_QUANTITY_OR_CURRENCY_UNSUPPORTED');
 // Provider closedPnl already allocates opening/closing fees and funding; never deduct them again.
 return{executionId:input.executionId,closedAt:new Date(closed).toISOString(),currency:'USDT',netPnl:net,sourceIds:rows.map(r=>String(r.orderId)),source:'BYBIT_CLOSED_PNL'};
}
export function mt5ClosedOutcome(input:{executionId:string;positionIds:readonly string[];quantity:number;currency:string;deals:Row[]}):ClosedProviderOutcome{
 if(!input.currency||!input.positionIds.length||!finite(input.quantity)||input.quantity<=0)throw Error('MT5_OUTCOME_IDENTITY_REQUIRED');const ids=new Set(input.positionIds);const deals=unique(input.deals,r=>String(r.ticket??''));let entries=0,exits=0,net=0,last=0;const sources:string[]=[];
 for(const d of deals){if(!ids.has(String(d.position_id)))continue;if(![0,1].includes(d.entry)||![d.volume,d.profit,d.commission,d.swap,d.fee,d.time].every(finite)||Number(d.volume)<0||Number(d.time)<=0)throw Error('MT5_DEAL_INCOMPLETE_OR_REVERSAL');if(d.entry===0)entries+=Number(d.volume);else exits+=Number(d.volume);net+=Number(d.profit)+Number(d.commission)+Number(d.swap)+Number(d.fee);last=Math.max(last,Number(d.time)*1000);sources.push(String(d.ticket))}
 if(!sources.length||Math.abs(entries-input.quantity)>1e-8||Math.abs(exits-entries)>1e-8)throw Error('MT5_CLOSED_QUANTITY_NOT_RECONCILED');return{executionId:input.executionId,closedAt:new Date(last).toISOString(),currency:input.currency,netPnl:net,sourceIds:sources,source:'MT5_DEALS'};
}
/** Complete canonical executions only, not selected winners or price-inferred outcomes. */
export async function loadAccountPerformanceHistory(db:any,input:{customerId:string;accountId:string;provider:string;asOf:string}):Promise<AccountPerformanceEvidence>{
 if(!input.customerId||!input.accountId||!['BINANCE','BYBIT','MT5_PERSONAL','MT5_PROP'].includes(input.provider)||!Number.isFinite(Date.parse(input.asOf)))throw Error('ACCOUNT_HISTORY_SCOPE_INVALID');
 const mt5=input.provider.startsWith('MT5'),truthTable=mt5?'mt5_account_execution_truth':'crypto_account_execution_truth',closedState=mt5?'TP2_CLOSED':'CLOSED';const closed:Row[]=[],outcomes:Row[]=[];
 for(const [table,target,state] of [[truthTable,closed,closedState],['account_closed_provider_outcomes',outcomes,null]] as const){for(let from=0;;from+=500){let q=db.from(table).select('*').eq('customer_id',input.customerId).eq('execution_account_id',input.accountId);if(state)q=q.eq('lifecycle_state',state);const r=await q.order('id').range(from,from+499);if(r.error||!Array.isArray(r.data))throw Error('ACCOUNT_HISTORY_READ_FAILED');target.push(...r.data);if(target.length>5000)throw Error('ACCOUNT_HISTORY_BOUND');if(r.data.length<500)break;}}
 const byId=new Map(outcomes.map(x=>[x.execution_truth_id,x]));const ordered=closed.map(t=>{const o=byId.get(t.id);if(!o||o.provider!==input.provider||!finite(o.net_pnl)||!o.currency||!o.source_ids?.length||!Number.isFinite(Date.parse(o.closed_at))||Date.parse(o.closed_at)>Date.parse(input.asOf))throw Error('ACCOUNT_HISTORY_INCOMPLETE');return {...o,closed_at:new Date(o.closed_at).toISOString()}}).sort((a,b)=>Date.parse(a.closed_at)-Date.parse(b.closed_at)||String(a.execution_truth_id).localeCompare(String(b.execution_truth_id)));
 // Simultaneous outcomes have no reliable within-millisecond order. Count the worst trailing loss streak across ties.
 let streak=0,lastLoss:string|null=null;for(let i=0;i<ordered.length;){const group:Row[]=[];const at=ordered[i].closed_at;while(i<ordered.length&&ordered[i].closed_at===at)group.push(ordered[i++]);const losses=group.filter(x=>Number(x.net_pnl)<0).length;if(group.some(x=>Number(x.net_pnl)>0))streak=0;streak+=losses;if(losses)lastLoss=at;}
 return{...input,source:'CANONICAL_PROVIDER',closedTradeCount:ordered.length,consecutiveLosses:streak,lastLossAt:lastLoss};
}
