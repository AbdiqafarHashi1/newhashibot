import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {authorizeCanonicalAccountSignal} from '../supabase/functions/_shared/production-account-authorization.ts';
import {drainAccountDispatch} from '../supabase/functions/_shared/account-dispatch.ts';
import {renderCanonicalVipSignal} from '../supabase/functions/_shared/telegram-product.ts';
import {mockSmokeDatabase} from './connected-demo/mock.ts';
type Selection={customerId:string;accountId:string;signalId:string};
type Env=Record<string,string|undefined>;
export function smokeMode(args:string[]){if(args.length!==1||!['--mode=mock','--mode=live'].includes(args[0]))throw Error('Usage: node --import tsx scripts/run_connected_demo_smoke.ts --mode=mock|live');return args[0].slice(7) as 'mock'|'live';}
export function liveSmokeConfig(env:Env){
 for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','HASHIBOT_INTERNAL_SECRET','TELEGRAM_BOT_TOKEN','TELEGRAM_VIP_CRYPTO_CHAT_ID','TELEGRAM_VIP_FOREX_GOLD_CHAT_ID','TELEGRAM_FREE_CHAT_ID','SMOKE_ACCOUNTS_FILE'])if(!env[key])throw Error('MISSING_'+key);
 const url=new URL(env.SUPABASE_URL!);if(url.protocol!=='https:')throw Error('HTTPS_SUPABASE_REQUIRED');
 if(new Set([env.TELEGRAM_VIP_CRYPTO_CHAT_ID,env.TELEGRAM_VIP_FOREX_GOLD_CHAT_ID,env.TELEGRAM_FREE_CHAT_ID]).size!==3)throw Error('DISTINCT_VIP_DESTINATIONS_REQUIRED');
 return {url:url.origin,key:env.SUPABASE_SERVICE_ROLE_KEY!};
}
export async function telegramSmoke(fetcher:typeof fetch,token:string,chatId:string,signal:any,channel:string){
 const text='CONNECTED DEMO SMOKE — connectivity check, not a trade alert\n\n'+renderCanonicalVipSignal({signal_id:signal.id??'mock-signal',symbol:signal.symbol,market:signal.market_type,direction:signal.direction,entry_low:Number(signal.entry_low),entry_high:Number(signal.entry_high??signal.entry_low),stop_loss:Number(signal.stop_loss),targets:[Number(signal.tp1),Number(signal.tp2)],occurred_at:signal.created_at,strategy:signal.strategy_id});
 const response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text})});
 const body=await response.json();if(!response.ok||body.ok!==true||!body.result?.message_id)throw Error('TELEGRAM_DELIVERY_FAILED:'+channel);
 return {channel,message_id:body.result.message_id};
}
type SmokeDependencies={db?:any;selections?:Selection[];authorize?:typeof authorizeCanonicalAccountSignal;dispatch?:typeof drainAccountDispatch;sleep?:(ms:number)=>Promise<void>};
export async function runSmoke(mode:'mock'|'live',env:Env=process.env,fetcher:typeof fetch=fetch,deps:SmokeDependencies={}){
 if(mode==='mock'){
  const {db,x,at,getDecision}=mockSmokeDatabase();const telegram=[];
  for(const [channel,symbol,market] of [['vip_crypto','ETHUSDT','crypto'],['vip_forex_gold','XAUUSD','forex']])telegram.push(await telegramSmoke(async()=>new Response(JSON.stringify({ok:true,result:{message_id:1}})),'mock-token','mock-chat',{...x.signal,symbol,market_type:market,strategy_id:market==='crypto'?'crypto.complementary-ema-pullback':'gold.native-momentum-60-24-2-5'},channel));
  const authorization=await authorizeCanonicalAccountSignal(db,{customerId:x.account.customer_id,accountId:x.account.id,signalId:x.signal.id,idempotencyKey:'connected-demo-mock'},at);
  if(!['ALLOW','REDUCE'].includes(authorization.decision))throw Error('MOCK_AUTHORIZATION_BLOCKED:'+JSON.stringify(getDecision()));
  const orders:any[]=[];const dispatches=await drainAccountDispatch(db,async plan=>{const receipt={mock:true,order_id:'mock-'+plan.execution_plan_id,provider:plan.provider};orders.push(receipt);return{accepted:true,receipt};});
  if(dispatches.length!==1||dispatches.some(r=>r.state!=='SENT'))throw Error('MOCK_DISPATCH_FAILED');
  return {mode,synthetic:true,telegram,equity_phase:getDecision().equity_phase,applied_risk_pct:getDecision().applied_risk_pct,dispatches,order_receipts:orders};
 }
 const config=liveSmokeConfig(env),db=deps.db??createClient(config.url,config.key,{auth:{persistSession:false}});
 const selections=deps.selections??JSON.parse(readFileSync(env.SMOKE_ACCOUNTS_FILE!,'utf8')) as Selection[];
 if(!Array.isArray(selections)||selections.length!==3||selections.some(s=>!s.customerId||!s.accountId||!s.signalId)||new Set(selections.map(s=>s.accountId)).size!==3)throw Error('THREE_DISTINCT_SANDBOX_ACCOUNTS_REQUIRED');
 const accounts=await db.from('connected_execution_accounts').select('id,customer_id,provider,environment,execution_enabled,runtime_control').in('id',selections.map(s=>s.accountId));
 if(accounts.error||accounts.data?.length!==3)throw Error('SANDBOX_ACCOUNT_READ_FAILED');
 const providers=new Set<string>();
 for(const s of selections){const a=accounts.data.find(a=>a.id===s.accountId&&a.customer_id===s.customerId);if(!a||!['demo','testnet'].includes(a.environment)||!a.execution_enabled||!['START','RESUME'].includes(a.runtime_control))throw Error('ENABLED_SCOPED_SANDBOX_REQUIRED');if(String(a.provider).toUpperCase()==='BYBIT'&&a.environment!=='demo'||String(a.provider).toUpperCase()==='BINANCE'&&a.environment!=='testnet')throw Error('ACTIVE_PROVIDER_SANDBOX_CONTRACT_REQUIRED');providers.add(String(a.provider).startsWith('MT5')?'MT5':String(a.provider).toUpperCase());}
 if(!['BINANCE','BYBIT','MT5'].every(p=>providers.has(p)))throw Error('BINANCE_BYBIT_MT5_REQUIRED');
 // Keep SQL claim locks, authorization and adoption guards intact. Use an isolated
 // demo project, with normal workers paused; refuse any other dispatchable scope.
 const pending=await db.from('account_signal_authorization_jobs').select('execution_account_id,signal_id').in('dispatch_state',['PENDING','CLAIMED','UNKNOWN']);
 if(pending.error||pending.data.some(j=>!selections.some(s=>s.accountId===j.execution_account_id&&s.signalId===j.signal_id)))throw Error('DEDICATED_DEMO_QUEUE_REQUIRED');
 const telegram:any[]=[],authorizations:any[]=[];
 for(const s of selections){
  const job=await db.from('account_signal_authorization_jobs').select('id').eq('customer_id',s.customerId).eq('execution_account_id',s.accountId).eq('signal_id',s.signalId).eq('state','PENDING').eq('dispatch_state','PENDING').single();if(job.error||!job.data)throw Error('FRESH_SCANNER_JOB_REQUIRED');
  const result=await (deps.authorize??authorizeCanonicalAccountSignal)(db,{...s,idempotencyKey:`connected-demo:${s.accountId}:${s.signalId}`});
  if(!result.execution_plan_id||!['ALLOW','REDUCE'].includes(result.decision))throw Error('CANONICAL_AUTHORIZATION_BLOCKED:'+JSON.stringify({accountId:s.accountId,decision:result.decision,reasons:result.reason_codes}));
  const recorded=await db.from('account_signal_authorization_jobs').update({state:'RECORDED',decision_id:result.id,updated_at:new Date().toISOString()}).eq('id',job.data.id).eq('state','PENDING').eq('dispatch_state','PENDING').select('id').single();if(recorded.error||!recorded.data)throw Error('AUTHORIZATION_JOB_NOT_RECORDED');
  const state=await db.from('account_risk_state').select('equity_phase,applied_risk_pct,observed_at').eq('customer_id',s.customerId).eq('execution_account_id',s.accountId).single();
  if(state.error||!state.data||!Number.isFinite(Date.parse(state.data.observed_at))||Date.now()-Date.parse(state.data.observed_at)<0||Date.now()-Date.parse(state.data.observed_at)>60000)throw Error('FRESH_RISK_STATE_REQUIRED');
  authorizations.push({accountId:s.accountId,executionPlanId:result.execution_plan_id,...state.data});
  const source=await db.from('signals').select('*').eq('id',s.signalId).single();if(source.error)throw Error('SIGNAL_READ_FAILED');
  const channel=String(source.data.market_type).toLowerCase()==='crypto'?'vip_crypto':'vip_forex_gold';
  if(!telegram.some(t=>t.channel===channel))telegram.push(await telegramSmoke(fetcher,env.TELEGRAM_BOT_TOKEN!,env[channel==='vip_crypto'?'TELEGRAM_VIP_CRYPTO_CHAT_ID':'TELEGRAM_VIP_FOREX_GOLD_CHAT_ID']!,source.data,channel));
 }
 if(telegram.length!==2)throw Error('BOTH_MARKET_SIGNALS_REQUIRED');
 const receipts:any[]=[];const approvedPlanIds=new Set(authorizations.map(a=>a.executionPlanId));
 const dispatches=await (deps.dispatch??drainAccountDispatch)(db,async(plan,version)=>{
  if(!approvedPlanIds.has(plan.execution_plan_id)||!['TESTNET','DEMO'].includes(plan.routing?.environment)||!selections.some(s=>s.accountId===plan.routing?.account_id&&s.customerId===plan.risk_decision?.account?.customer_id))throw Error('SANDBOX_PLAN_SCOPE_REQUIRED');
  const response=await fetcher(config.url+'/functions/v1/binance-testnet-execution',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','x-hashibot-internal-secret':env.HASHIBOT_INTERNAL_SECRET!},body:JSON.stringify({action:'adopt_execution_plan',execution_plan:plan,expected_policy_version:version})});
  const body=await response.json();const receipt={accountId:plan.routing.account_id,execution_plan_id:plan.execution_plan_id,success:body.success===true,uncertain:body.uncertain===true,reason:body.blocker??body.reason??null,canonical_state:body.canonical_state??null};receipts.push(receipt);
  return {accepted:response.ok&&body.success===true,uncertain:body.uncertain===true||typeof body.success!=='boolean',receipt};
 });
 if(dispatches.length<3||dispatches.some(d=>d.state!=='SENT'))throw Error('DEMO_DISPATCH_INCOMPLETE:'+JSON.stringify({dispatches,receipts}));
 const providerReceipts:any[]=[];
 for(const s of selections){const a=accounts.data.find((a:any)=>a.id===s.accountId)!;let receipt:any=null;
  for(let attempt=0;attempt<30;attempt++){
   const r=await db.from(String(a.provider).startsWith('MT5')?'mt5_account_execution_truth':'crypto_account_execution_truth').select('execution_plan_id,provider_order_id,lifecycle_state').eq('customer_id',s.customerId).eq('execution_account_id',s.accountId).eq('signal_id',s.signalId).maybeSingle();
   if(r.error)throw Error('PROVIDER_RECEIPT_READ_FAILED');
   if(r.data?.provider_order_id){receipt=r.data;break;}
   await (deps.sleep??((ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))))(1000);
  }
  if(!receipt)throw Error('PROVIDER_ORDER_RECEIPT_PENDING:'+s.accountId);
  providerReceipts.push({accountId:s.accountId,...receipt});
 }
 return {mode,telegram,authorizations,dispatches,adoption_receipts:receipts,order_receipts:providerReceipts,receiptMeaning:'Provider order IDs observed; lifecycle_state must show protected management before marking full demo acceptance.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){runSmoke(smokeMode(process.argv.slice(2))).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e instanceof Error?e.message:'SMOKE_FAILED');process.exitCode=1;});}
