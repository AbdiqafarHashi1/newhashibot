import assert from 'node:assert/strict';
import {test} from 'node:test';
import {binanceClosedOutcome,bybitClosedOutcome,mt5ClosedOutcome,readBoundedHistory,loadAccountPerformanceHistory} from '../../supabase/functions/_shared/provider-outcome-history';
import {collectMt5ProviderOutcomes,collectCryptoProviderOutcomes} from '../../supabase/functions/_shared/provider-outcome-collector';
const closedAt='2026-10-15T12:00:00.000Z',end=Date.parse(closedAt),start=end-60000;
const binance=()=>({executionId:'truth',symbol:'BTCUSDT',quantity:1,orderIds:['entry','tp1','stop'],closedAt,fills:[{id:1,orderId:'entry',symbol:'BTCUSDT',side:'BUY',qty:1,realizedPnl:0,commission:1,commissionAsset:'USDT',time:start},{id:2,orderId:'tp1',symbol:'BTCUSDT',side:'SELL',qty:.4,realizedPnl:8,commission:.4,commissionAsset:'USDT',time:end-1000},{id:3,orderId:'stop',symbol:'BTCUSDT',side:'SELL',qty:.6,realizedPnl:-6,commission:.6,commissionAsset:'USDT',time:end}],income:[{tranId:4,symbol:'BTCUSDT',asset:'USDT',incomeType:'FUNDING_FEE',income:-2,time:end-500}]});
test('Binance nets partial exits, commissions and funding once; unmatched or incomplete evidence blocks',()=>{
 const x=binance();assert.equal(binanceClosedOutcome(x).netPnl,-2);assert.equal(binanceClosedOutcome({...x,fills:[...x.fills,x.fills[0]],income:[...x.income,x.income[0]]}).netPnl,-2);
 assert.throws(()=>binanceClosedOutcome({...x,fills:x.fills.slice(0,2)}),/QUANTITY/);
 assert.throws(()=>binanceClosedOutcome({...x,fills:[...x.fills,{...x.fills[0],id:9,orderId:'manual'}]}),/UNATTRIBUTED/);
 assert.throws(()=>binanceClosedOutcome({...x,fills:[...x.fills,{...x.fills[0],commission:20}]}),/CONFLICT/);
 assert.throws(()=>binanceClosedOutcome({...x,quantity:NaN}),/INPUT_INVALID/);
 assert.throws(()=>binanceClosedOutcome({...x,fills:x.fills.map(f=>({...f,time:end+1}))}),/UNSUPPORTED/);
 assert.throws(()=>binanceClosedOutcome({...x,fills:x.fills.map(f=>({...f,commissionAsset:'BNB'}))}),/UNSUPPORTED/);
});
test('Bybit uses fully reconciled closed P&L without deducting allocated fees twice',()=>{
 const x={executionId:'truth',symbol:'BTCUSDT',quantity:1,exitOrderIds:['tp1','stop'],closedAt,rows:[{orderId:'tp1',symbol:'BTCUSDT',closedSize:.4,closedPnl:6,openFee:1,closeFee:1,updatedTime:end-1000,execType:'Trade'},{orderId:'stop',symbol:'BTCUSDT',closedSize:.6,closedPnl:-8,openFee:1,closeFee:1,updatedTime:end,execType:'Trade'}]};
 assert.equal(bybitClosedOutcome(x).netPnl,-2);assert.throws(()=>bybitClosedOutcome({...x,rows:x.rows.slice(0,1)}),/QUANTITY/);assert.throws(()=>bybitClosedOutcome({...x,rows:x.rows.map(r=>({...r,execType:'BustTrade'}))}),/LINEAGE/);
});
test('MT5 reconciles exact position deals with fees, rejects reversals and missing partial exits',()=>{
 const x={executionId:'truth',positionIds:['position'],quantity:1,currency:'USD',deals:[{ticket:1,position_id:'position',entry:0,volume:1,profit:0,commission:-1,swap:0,fee:0,time:start/1000},{ticket:2,position_id:'position',entry:1,volume:.4,profit:8,commission:-.4,swap:-1,fee:0,time:(end-1000)/1000},{ticket:3,position_id:'position',entry:1,volume:.6,profit:-6,commission:-.6,swap:0,fee:-1,time:end/1000}]};
 assert.equal(mt5ClosedOutcome(x).netPnl,-2);assert.throws(()=>mt5ClosedOutcome({...x,deals:x.deals.slice(0,2)}),/QUANTITY/);assert.throws(()=>mt5ClosedOutcome({...x,deals:x.deals.map(d=>({...d,entry:2}))}),/REVERSAL/);
});
test('history exhausts pagination and saturated windows with bounded failure for repeated cursors',async()=>{
 const ranges:number[][]=[];const rows=await readBoundedHistory(async(lo,hi)=>{ranges.push([lo,hi]);return hi-lo>1?{rows:[{discarded:true}],saturated:true}:{rows:[{lo,hi}]}},0,7);assert.equal(rows.length,4);assert.ok(rows.every(x=>!x.discarded));assert.equal(ranges.length,7);
 await assert.rejects(readBoundedHistory(async()=>({rows:[],cursor:'same'}),start,end),/CURSOR_REPEATED/);
 await assert.rejects(readBoundedHistory(async()=>({rows:[],saturated:true}),0,0),/TRUNCATED/);
 await assert.rejects(readBoundedHistory(async()=>({rows:[],cursor:'next'}),0,1,1),/REQUEST_BOUND/);
});
function store(data:Record<string,any[]>,rpc?:any){return {rpc:rpc??(async()=>({data:'saved'})),from(table:string){let rows=[...(data[table]??[])];const q:any={select:()=>q,eq:(key:string,value:any)=>{rows=rows.filter(r=>String(key.includes('->>')?r.raw_exchange_response?.[key.split('->>')[1]]:r[key])===String(value));return q},order:()=>q,range:(lo:number,hi:number)=>{rows=rows.slice(lo,hi+1);return q},limit:(n:number)=>{rows=rows.slice(0,n);return q},maybeSingle:async()=>({data:rows[0]??null}),then:(resolve:any)=>Promise.resolve({data:rows}).then(resolve)};return q}}}
const scope={customer_id:'owner',execution_account_id:'account'};
const input={customerId:'owner',accountId:'account',provider:'BINANCE',asOf:closedAt};
test('complete history is account scoped; missing outcomes cannot become a zero-loss record',async()=>{
 const truth=[{...scope,id:'a',lifecycle_state:'CLOSED'},{...scope,id:'b',lifecycle_state:'CLOSED'},{...scope,customer_id:'other',id:'other',lifecycle_state:'CLOSED'}];
 const outcome=(id:string,pnl:number,date:string)=>({...scope,execution_truth_id:id,provider:'BINANCE',net_pnl:pnl,currency:'USDT',source_ids:[id],closed_at:date});
 const data={crypto_account_execution_truth:truth,account_closed_provider_outcomes:[outcome('a',10,'2026-10-15T11:59:59Z'),outcome('b',-2,'2026-10-15T11:59:59.000Z')]};
 const result=await loadAccountPerformanceHistory(store(data),input);assert.equal(result.closedTradeCount,2);assert.equal(result.consecutiveLosses,1);
 await assert.rejects(loadAccountPerformanceHistory(store({...data,account_closed_provider_outcomes:data.account_closed_provider_outcomes.slice(0,1)}),input),/INCOMPLETE/);
 await assert.rejects(loadAccountPerformanceHistory(store(data),{...input,asOf:'invalid'}),/SCOPE_INVALID/);
});
test('collectors bind provider history to exact account and entry plan; persistence errors propagate',async()=>{
 const canonical='11111111-1111-4111-8111-111111111111';const truth={...scope,execution_account_id:canonical,id:'truth',execution_plan_id:'plan',symbol:'BTCUSDT',submitted_quantity:1,lifecycle_state:'CLOSED',created_at:new Date(start).toISOString(),updated_at:closedAt};
 const order={customer_id:'owner',account_id:'account',execution_scope_key:'scope',id:'row',entry_order_id:'entry',tp1_order_id:'tp1',sl_order_id:'stop',raw_exchange_response:{certified_execution_plan_id:'plan'}};
 const data={connected_execution_accounts:[{id:canonical,customer_id:'owner',account_id:'account',provider:'binance',execution_instance_id:'instance',credential_ref:'vault-ref',environment:'testnet'}],crypto_account_execution_truth:[truth],execution_orders:[order]};let writes=0;
 await collectCryptoProviderOutcomes(store(data,async(_name:any,args:any)=>{writes++;assert.equal(args.p_execution_id,'truth');assert.equal(args.p_account_id,canonical);assert.equal(args.p_net_pnl,-2);return{data:'saved'}}),{customer_id:'owner',account_id:'account',execution_scope_key:'scope',execution_instance_id:'instance',credential_ref:'vault-ref'},'BINANCE',async(path)=>{if(path.endsWith('userTrades'))return binance().fills;if(path.endsWith('income'))return binance().income;throw Error('-2013 Order does not exist')});assert.equal(writes,1);
 await assert.rejects(collectCryptoProviderOutcomes(store({...data,execution_orders:[{...order,account_id:'other'}]}),{customer_id:'owner',account_id:'account',execution_scope_key:'scope',execution_instance_id:'instance',credential_ref:'vault-ref'},'BINANCE',async()=>[]),/BINDING/);
 await assert.rejects(collectCryptoProviderOutcomes(store(data,async()=>({error:{message:'offline'}})),{customer_id:'owner',account_id:'account',execution_scope_key:'scope',execution_instance_id:'instance',credential_ref:'vault-ref'},'BINANCE',async(path)=>{if(path.endsWith('userTrades'))return binance().fills;if(path.endsWith('income'))return binance().income;throw Error('-2013 Order does not exist')}),/NOT_PERSISTED/);
});
test('MT5 history coverage must include the whole execution before an outcome can be stored',async()=>{
 const truth={...scope,id:'truth',lifecycle_state:'TP2_CLOSED',created_at:new Date(start).toISOString(),updated_at:closedAt,provider_position_id:'position',approved_quantity:1};
 await assert.rejects(collectMt5ProviderOutcomes(store({mt5_account_execution_truth:[truth]}),{customer_id:'owner',account_id:'account'},'MT5_PERSONAL',{from:closedAt,to:closedAt,currency:'USD',deals:[]}),/HISTORY_PARTIAL/);
});
