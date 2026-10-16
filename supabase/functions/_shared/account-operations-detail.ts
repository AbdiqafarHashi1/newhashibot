import {resolveMt5TerminalRoute} from './mt5-account-routing.ts';
const number=(v:unknown)=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const fields=(row:Record<string,any>,keys:string[])=>Object.fromEntries(keys.map(k=>[k,row[k]??null]));
/** Safe read model only. No provider-wide wallet fallback and no financial defaults. */
export async function loadAccountOperationsDetail(db:any,customerId:string,accountId:string){
 const result=await db.from('connected_execution_accounts').select('id,customer_id,account_id,provider,account_mode,environment,provider_account_identity,policy_overrides,execution_instance_id,credential_ref').eq('id',accountId).eq('customer_id',customerId).maybeSingle();
 if(result.error||!result.data)throw Error('ACCOUNT_OWNERSHIP_REQUIRED');const account=result.data;
 let raw:Record<string,any>|null=null,observedAt:string|null=null,source:string|null=null;
 if(String(account.provider).toUpperCase().startsWith('MT5')){
  try{const route=resolveMt5TerminalRoute(account,customerId);const snapshot=await db.from('mt5_account_snapshots').select('balance,equity,margin,free_margin,floating_pnl,currency,captured_at,positions,orders').eq('account_id',route.mt5AccountId).eq('owner_id',customerId).order('captured_at',{ascending:false}).limit(1).maybeSingle();if(snapshot.error)throw snapshot.error;raw=snapshot.data;observedAt=raw?.captured_at??null;source='MT5_TERMINAL_SNAPSHOT'}catch(e){if(!(e instanceof Error)||!e.message.startsWith('MT5_'))throw e;}
 }else{
  const proof=await db.from('execution_account_runtime_proof').select('account_state,observed_at').eq('customer_id',customerId).eq('account_id',account.account_id).eq('execution_instance_id',account.execution_instance_id).eq('credential_ref',account.credential_ref).order('observed_at',{ascending:false}).limit(1).maybeSingle();if(proof.error)throw proof.error;raw=proof.data?.account_state??null;observedAt=proof.data?.observed_at??null;source='ACCOUNT_PROVIDER_MONITOR';
 }
 const provider=String(account.provider).toUpperCase(),finance=raw?provider.startsWith('MT5')?{balance:number(raw.balance),equity:number(raw.equity),freeMargin:number(raw.free_margin),usedMargin:number(raw.margin),unrealizedPnl:number(raw.floating_pnl),currency:raw.currency??null}:provider==='BINANCE'?{balance:number(raw.account_total_wallet_balance),equity:number(raw.account_total_margin_balance),freeMargin:number(raw.available_usdt),usedMargin:null,unrealizedPnl:number(raw.pnl_snapshot?.unrealized_pnl),currency:null}:{balance:number(raw.account_wallet_balance),equity:number(raw.account_equity),freeMargin:number(raw.trading_available_balance),usedMargin:number(raw.account_initial_margin),unrealizedPnl:number(raw.account_unrealized_pnl),currency:raw.account_currency??null}:null;
 const [decisions,incidents,artifacts]=await Promise.all([
 db.from('execution_account_policy_decisions').select('id,decision,reason_codes,authorized_risk_pct,approved_quantity,policy_version,created_at').eq('customer_id',customerId).eq('execution_account_id',accountId).order('created_at',{ascending:false}).limit(20),
 db.from('crypto_account_execution_truth').select('id,symbol,lifecycle_state,incident_code,updated_at').eq('customer_id',customerId).eq('execution_account_id',accountId).in('lifecycle_state',['SUBMISSION_UNCERTAIN','RECONCILING','PROTECTION_INCIDENT','SAFETY_CLOSING']).order('updated_at',{ascending:false}).limit(20),
 db.from('certified_runtime_artifacts').select('id,evaluation_id,execution_plan,created_at').eq('account_id',accountId).eq('risk_decision->account->>customer_id',customerId).order('created_at',{ascending:false}).limit(10)
 ]);
 for(const r of [decisions,incidents,artifacts])if(r.error)throw Error('ACCOUNT_DETAIL_READ_FAILED');
 return {observedAt,source,finance,policy:fields(account.policy_overrides?.policy_configuration??{},['riskPerTradePct','maxOpenRiskPct','maxLeverage','maxConcurrentPositions','maxDailyDrawdownPct','maxTotalDrawdownPct','allowedSymbols','allowedStrategies','allowedSessions','lossResponse']),decisions:decisions.data??[],incidents:incidents.data??[],plans:(artifacts.data??[]).map((x:any)=>({id:x.id,createdAt:x.created_at,evaluationId:x.evaluation_id,executionPlanId:x.execution_plan?.execution_plan_id??null,status:x.execution_plan?.status??null}))};
}
