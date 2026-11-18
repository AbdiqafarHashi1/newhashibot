// Offline fixtures only; this module never connects to a provider.
import {input as base} from '../../tests/operations/support/accountPolicyFixture.ts';
import {upstream,mt5Spec,policy,capabilities} from '../../tests/operations/support/planningFixture.ts';
export function smokeFixture(){
 const input=base(),at=input.evaluatedAt,account=input.account,signal=input.signal,strategy=upstream('MT5_PERSONAL','forex',{stop:1.095,tp1:1.11,tp2:1.12}).approved_strategy_plan.strategy_plan;
 const context={...input.context,provider_contract:mt5Spec('MT5_PERSONAL')};
 const strategyPlan=JSON.parse(JSON.stringify(strategy));
 strategyPlan.entry_plan.expires_at='2026-09-25T12:05:00Z';strategyPlan.provenance.evaluated_at=at;
 strategyPlan.identity.strategy_id=signal.strategy_id;strategyPlan.identity.strategy_version='1.0.0';strategyPlan.provenance.measured_release_id='release';strategyPlan.provenance.evaluated_parameters={};
 const set={version:'qualified-strategy-set/v1',id:'FOREX_PERSONAL_QUALIFIED_SET',setVersion:'set-v1',product:'PERSONAL',researchPolicyVersion:'v1',entries:[{strategyId:signal.strategy_id,strategyVersion:'1.0.0',configId:'cfg',configVersion:'1',qualificationStatus:'FORWARD_VALIDATION_CANDIDATE',supportedSymbols:['EURUSD'],supportedTimeframes:['15m'],strategyParameters:{}}]};
 input.configuration={...input.configuration,lossResponse:undefined,houseMoney:'house-money/v1'};
 return {at,x:{measured_release:{id:'release',state:'PROMOTED',strategy_id:signal.strategy_id,configuration_hash:'release-hash',immutable_configuration:{strategies:[{id:signal.strategy_id,enabled:true,symbols:['EURUSD'],timeframes:['15m'],parameters:{}}]}},account:{id:account.id,customer_id:account.customerId,immutable_identity:account.immutableIdentity,provider:'MT5_PERSONAL',environment:'demo',account_mode:'PERSONAL',enabled:true,execution_enabled:true,runtime_control:'START',policy_profile_id:account.policyProfileId,policy_version:account.policyVersion,policy_preset:'BALANCED',policy_overrides:{policy_configuration:{...input.configuration,lossResponse:undefined}}},signal:{id:signal.signal_id,...signal,strategy_version:'1.0.0',entry_low:signal.entry_price,status:'active',expires_at:'2026-09-25T12:05:00Z'},policy:input.basePolicy,context,observed_at:at,contract:mt5Spec('MT5_PERSONAL'),routing_policy:policy('MT5_PERSONAL'),capabilities:capabilities('MT5_PERSONAL'),strategy_plan:strategyPlan,qualified_set:set,provisioning:{state:'ACTIVE',qualified_set_id:set.id,qualified_set_version:set.setVersion},connection:{state:'CONNECTED',capabilities:{trading:true}},assignment:{policy_version:account.policyVersion},pending_orders:0,entitlement:{state:'ACTIVE',expiresAt:'2026-09-26T12:00:00Z'},product:'FOREX_PERSONAL',evidence_hash:'database-loaded-fingerprint'}};
}

export function mockSmokeDatabase(){
 const {x,at}=smokeFixture();let decision:any,plan:any;const receipts:any[]=[];
 const db={from(table:string){const q:any={select:()=>q,eq:()=>q,contains:()=>q,order:()=>q,range:()=>q,limit:()=>q,in:()=>q,update:(row:any)=>{receipts.push(row);return q;},then:(yes:any)=>Promise.resolve({data:[],error:null}).then(yes),maybeSingle:async()=>({data:table==='signal_updates'?{signal_id:x.signal.id,new_status:'active',price:x.signal.entry_low,reason:'candle_entry_trigger',created_at:at}:table==='certified_runtime_artifacts'?{execution_plan:plan}:null,error:null})};return q;},async rpc(name:string,args:any){
 if(name==='load_production_account_authorization_input')return{data:x};
 if(name==='observe_personal_forward_history')return{data:{customerId:x.account.customer_id,accountId:x.account.id,provider:x.account.provider,observedAt:at,verifiedDays:30,closedTradeCount:1,historyComplete:true}};
 if(name==='observe_house_money_account')return {data:{customerId:x.account.customer_id,accountId:x.account.id,observedAt:at,monthlyPnlPct:0,dailyPnlPct:0,peakDrawdownPct:0,totalDrawdownPct:0,consecutiveLosses:0,phase:1}};
 if(name==='persist_house_money_decision')return{data:true};
 if(name==='commit_production_account_authorization'){decision=args.p_decision;plan=args.p_execution_plan;return{data:{...decision,id:decision.decisionId,decision:decision.decision}};}
 if(name==='claim_account_dispatch')return{data:plan?[{id:'mock-job',customer_id:x.account.customer_id,execution_account_id:x.account.id,decision_id:decision.decisionId,policy_version:x.account.policy_version}]:[]};
 throw Error('UNEXPECTED_MOCK_RPC:'+name);
 }};return {db,x,at,receipts,getDecision:()=>decision};
}
