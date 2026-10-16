import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizeCanonicalAccountSignal} from '../../supabase/functions/_shared/production-account-authorization';
import {assertCompleteProductionContext} from '../../supabase/functions/_shared/observed-account-policy-evidence';
import {input as base} from './support/accountPolicyFixture';
import {upstream,mt5Spec,policy,capabilities} from './support/planningFixture';
function fixture(){
 const input=base(),at=input.evaluatedAt,account=input.account,signal=input.signal,strategy=upstream('MT5_PERSONAL','forex',{stop:1.095,tp1:1.11,tp2:1.12}).approved_strategy_plan.strategy_plan;
 const context={...input.context,provider_contract:mt5Spec('MT5_PERSONAL')};
 const strategyPlan=JSON.parse(JSON.stringify(strategy));
 strategyPlan.entry_plan.expires_at='2026-09-25T12:05:00Z';strategyPlan.provenance.evaluated_at=at;
 strategyPlan.identity.strategy_id=signal.strategy_id;strategyPlan.identity.strategy_version='1.0.0';
 const set={version:'qualified-strategy-set/v1',id:'FOREX_PERSONAL_QUALIFIED_SET',setVersion:'set-v1',product:'PERSONAL',researchPolicyVersion:'v1',entries:[{strategyId:signal.strategy_id,strategyVersion:'1.0.0',configId:'cfg',configVersion:'1',qualificationStatus:'FORWARD_VALIDATION_CANDIDATE',supportedSymbols:['EURUSD'],supportedTimeframes:['15m'],strategyParameters:{}}]};
 return {at,x:{account:{id:account.id,customer_id:account.customerId,immutable_identity:account.immutableIdentity,provider:'MT5_PERSONAL',environment:'demo',account_mode:'PERSONAL',enabled:true,execution_enabled:true,runtime_control:'START',policy_profile_id:account.policyProfileId,policy_version:account.policyVersion,policy_preset:'BALANCED',policy_overrides:{policy_configuration:{...input.configuration,lossResponse:undefined}}},signal:{id:signal.signal_id,...signal,strategy_version:'1.0.0',entry_low:signal.entry_price,status:'waiting',expires_at:'2026-09-25T12:05:00Z'},policy:input.basePolicy,context,observed_at:at,contract:mt5Spec('MT5_PERSONAL'),routing_policy:policy('MT5_PERSONAL'),capabilities:capabilities('MT5_PERSONAL'),strategy_plan:strategyPlan,qualified_set:set,provisioning:{state:'ACTIVE',qualified_set_id:set.id,qualified_set_version:set.setVersion},connection:{state:'CONNECTED',capabilities:{trading:true}},assignment:{policy_version:account.policyVersion},pending_orders:0,entitlement:{state:'ACTIVE',expiresAt:null},product:'FOREX_PERSONAL',evidence_hash:'database-loaded-fingerprint'}};
}
test('production producer evaluates the assigned Brain and persists exact quantity before exposing a plan',async()=>{
 const {x,at}=fixture();let saved:any;
 const db={rpc:async(name:string,args:any)=>{if(name==='load_production_account_authorization_input')return{data:x};saved=args;return{data:{decision:args.p_decision.decision,execution_plan:args.p_execution_plan}}}};
 const result=await authorizeCanonicalAccountSignal(db,{customerId:'customer-a',accountId:'a1',signalId:'canonical-phase-c-1',idempotencyKey:'request'},at);
 assert.equal(result.decision,'ALLOW',JSON.stringify(saved.p_decision));assert.equal(saved.p_decision.authorizedRiskPct,1);
 assert.equal(saved.p_execution_plan.status,'PLANNED');assert.equal(saved.p_execution_plan.risk_decision.decision_id,saved.p_decision.decisionId);
 assert.equal(saved.p_execution_plan.capital_allocation_plan.allocation.quantity,saved.p_decision.executionIntent.approvedQuantity);
 assert.equal(saved.p_evidence_hash,'database-loaded-fingerprint');assert.match(saved.p_decision.decisionId,/^decision_[a-f0-9]{64}$/);
});
test('incomplete context, stale evidence and missing history record BLOCK without an execution plan',async()=>{
 for(const mutate of [(x:any)=>x.context=null,(x:any)=>x.observed_at='2026-09-24T12:00:00Z',(x:any)=>x.account.policy_overrides.policy_configuration.lossResponse=base().configuration.lossResponse]){
 const {x,at}=fixture();mutate(x);let saved:any;
 const db={rpc:async(name:string,args:any)=>name==='load_production_account_authorization_input'?{data:x}:(saved=args,{data:args.p_decision})};
 const result=await authorizeCanonicalAccountSignal(db,{customerId:'customer-a',accountId:'a1',signalId:'canonical-phase-c-1',idempotencyKey:'request'},at);
 assert.equal(result.decision,'BLOCK');assert.equal(saved.p_execution_plan,null);assert.equal(saved.p_decision.executionIntent,null);
 }
});
test('failed durable commit cannot report an authorization success; partial market context is rejected',async()=>{
 const {x,at}=fixture();await assert.rejects(authorizeCanonicalAccountSignal({rpc:async(name:string)=>name==='load_production_account_authorization_input'?{data:x}:{error:{message:'offline'}}},{customerId:'customer-a',accountId:'a1',signalId:'canonical-phase-c-1',idempotencyKey:'request'},at),/NOT_PERSISTED/);
 assert.throws(()=>assertCompleteProductionContext({...x.context,news_state:undefined} as any,{customerId:'customer-a',accountId:'a1',provider:'MT5_PERSONAL',observedAt:at},Date.parse(at)),/CONTEXT_REQUIRED/);
});

test('evidence ingestion checks observed finances and pending orders against the exact provider snapshot',async()=>{
 const {recordObservedAccountPolicyEvidence}=await import('../../supabase/functions/_shared/observed-account-policy-evidence');
 const {x,at}=fixture();let captured:any;
 const account={id:'a1',customer_id:'customer-a',provider:'MT5_PERSONAL',environment:'demo',account_mode:'PERSONAL',execution_instance_id:'instance',credential_ref:'vault',provider_account_identity:'physical'};
 const snapshot={id:'snapshot',captured_at:at,balance:10000,equity:10000,free_margin:10000,positions:[],orders:[]};
 const db={from(table:string){const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,insert:(row:any)=>{captured=row;return q},single:async()=>({data:table==='connected_execution_accounts'?account:{id:'saved'}}),maybeSingle:async()=>({data:snapshot})};return q}};
 const input={customer_id:'customer-a',execution_account_id:'a1',provider:'MT5_PERSONAL',symbol:'EURUSD',observed_at:at,account_context:x.context,contract_specification:x.contract,routing_policy:x.routing_policy,capabilities:x.capabilities,pending_orders:0};
 assert.equal((await recordObservedAccountPolicyEvidence(db,input,Date.parse(at))).id,'saved');assert.equal(captured.credential_ref,'vault');assert.equal(captured.source_reference,'mt5:snapshot');
 await assert.rejects(recordObservedAccountPolicyEvidence(db,{...input,account_context:{...x.context,balance:20000}},Date.parse(at)),/FINANCIAL_EVIDENCE_MISMATCH/);
 await assert.rejects(recordObservedAccountPolicyEvidence(db,{...input,pending_orders:1},Date.parse(at)),/ORDER_EVIDENCE_MISMATCH/);
});

test('MT5 observed positions use the bridge quantity field and reject a changed quantity',async()=>{
 const {recordObservedAccountPolicyEvidence}=await import('../../supabase/functions/_shared/observed-account-policy-evidence');
 const {x,at}=fixture();const position={ticket_or_id:'42',symbol:'EURUSD',side:'BUY',quantity:.1,entry_price:1.1,current_price:1.1,unrealized_pnl:0,stop_loss:1.09,take_profit:1.12,open_risk_amount:100,open_risk_pct:1,notional_value:11000,opened_at:at};
 const c={...x.context,open_positions:[position],exposure:{total_notional_usd:11000,total_open_risk_usd:100,total_open_risk_pct:1,active_position_count:1,positions_by_symbol:{EURUSD:1}}};
 const snapshot={captured_at:at,balance:10000,equity:10000,free_margin:10000,positions:[{symbol:'EURUSD',quantity:.1}],orders:[]};
 const account={provider:'MT5_PERSONAL',environment:'demo',account_mode:'PERSONAL',provider_account_identity:'physical'};
 const db={from(table:string){const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,insert:()=>q,single:async()=>({data:table==='connected_execution_accounts'?account:{id:'saved'}}),maybeSingle:async()=>({data:snapshot})};return q}};
 const input={customer_id:'customer-a',execution_account_id:'a1',provider:'MT5_PERSONAL',symbol:'EURUSD',observed_at:at,account_context:c,contract_specification:x.contract,routing_policy:x.routing_policy,capabilities:x.capabilities,pending_orders:0};
 assert.equal((await recordObservedAccountPolicyEvidence(db,input,Date.parse(at))).id,'saved');snapshot.positions[0].quantity=.2;await assert.rejects(recordObservedAccountPolicyEvidence(db,input,Date.parse(at)),/POSITION_EVIDENCE_MISMATCH/);
});
