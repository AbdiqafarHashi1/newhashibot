import {personalRiskProfile,loadSmartGrowthHistory} from './personal-growth-policy.ts';
import {loadProductEntryQuality} from './strategy-deployment-policy.ts';
import {loadHouseMoneyFacts} from './house-money-authority.ts';
import {approvedPropAccountProfile} from './prop-account-profile.ts';
import {isSourceBoundFtmoStaticRules} from './prop-program.ts';
import {assertPropServiceCapital} from './prop-service-limits.ts';
import {loadConfirmedEntry} from './confirmed-entry.ts';
import {prepareAutomaticBybitEvidence} from './automatic-bybit-policy-evidence.ts';
import {prepareAutomaticCryptoEvidence} from './automatic-crypto-policy-evidence.ts';
import {prepareAutomaticMt5Evidence} from './automatic-mt5-policy-evidence.ts';
import {assertMeasuredExecutionLineage} from './measured-execution-lineage.ts';
import {planFromAccountDecision} from './phase-d-execution-plan.ts';
import {pinnedClaimFromQualifiedSet,routeProductionEligibility} from './trading-domain/production-eligibility-router.ts';
import {evaluateAccountSignal,type AccountEvaluationInput,type AccountDecisionRecord} from './account-policy-authority.ts';
import {getExecutionBrain} from './runtime-orchestrator/registries.ts';
import {loadAccountPerformanceHistory} from './provider-outcome-history.ts';
import {assertCompleteProductionContext} from './observed-account-policy-evidence.ts';
/** IDs enter from the operator; every financial/policy fact is reloaded using service authority. */
export async function authorizeCanonicalAccountSignal(db:any,input:{customerId:string;accountId:string;signalId:string;idempotencyKey:string},now=new Date().toISOString()){
 if(!input.customerId||!input.accountId||!input.signalId||!input.idempotencyKey||input.idempotencyKey.length>200)throw Error('AUTHORIZATION_IDENTIFIERS_REQUIRED');
 const loaded=await db.rpc('load_production_account_authorization_input',{p_customer_id:input.customerId,p_account_id:input.accountId,p_signal_id:input.signalId});if(loaded.error||!loaded.data)throw Error('ACCOUNT_AUTHORIZATION_INPUT_UNAVAILABLE');
 const x=loaded.data,account=x.account,signal=x.signal,provider=String(account.provider).toUpperCase() as AccountEvaluationInput['account']['provider'];
 const at=Date.parse(now),observed=Date.parse(x.observed_at),context=x.context;
 await loadConfirmedEntry(db,signal,at);
 const reasons:string[]=[];
 if(provider==='MT5_PROP'&&(context?.prop_rules?.drawdown_model==='FTMO_2STEP_STATIC_INITIAL'||account.policy_overrides?.approved_prop_rules?.drawdown_model==='FTMO_2STEP_STATIC_INITIAL'))try{if(!isSourceBoundFtmoStaticRules(context?.prop_rules)||!isSourceBoundFtmoStaticRules(approvedPropAccountProfile(account)))throw Error('scope')}catch{reasons.push('CURRENT_APPROVED_STATIC_PROP_BASIS_REQUIRED')}

 if(provider==='MT5_PROP'&&account.account_mode==='PROP_FUNDED'){const g=await db.from('prop_profit_cycles').select('state').eq('execution_account_id',account.id).eq('customer_id',account.customer_id).order('cycle_number',{ascending:false}).limit(1).maybeSingle();if(g.error||!g.data||g.data.state!=='ACTIVE')reasons.push('PROP_PROFIT_CYCLE_PAUSED_OR_UNAVAILABLE')}
 if(provider==='MT5_PROP')try{assertPropServiceCapital(context?.total_drawdown?.initial_balance,x.contract?.account_currency)}catch(e){reasons.push(e instanceof Error?e.message:'PROP_SERVICE_CAPITAL_LIMIT_REQUIRED')}
 if(!x.entitlement?.expiresAt||!Number.isFinite(Date.parse(x.entitlement.expiresAt)))reasons.push('FINITE_EXECUTION_ACCESS_REQUIRED');
 try{assertMeasuredExecutionLineage(x)}catch(e){reasons.push(e instanceof Error?e.message:'MEASURED_EXECUTION_RELEASE_REQUIRED')}
 if(x.qualified_set&&x.provisioning?.state==='ACTIVE'&&x.provisioning.qualified_set_id===x.qualified_set.id&&x.provisioning.qualified_set_version===x.qualified_set.setVersion){x.eligibility=routeProductionEligibility({claim:pinnedClaimFromQualifiedSet({product:x.product,market:String(x.product).startsWith('FOREX')?'FOREX':'CRYPTO',set:x.qualified_set,strategyId:signal.strategy_id,strategyVersion:signal.strategy_version,symbol:signal.symbol,timeframe:signal.timeframe,requiredQualification:'FORWARD_VALIDATION_CANDIDATE',evaluatedParameters:x.strategy_plan?.provenance?.evaluated_parameters??{}}),qualifiedSet:x.qualified_set});}
 if(!x.contract)reasons.push('OBSERVED_PROVIDER_CONTRACT_REQUIRED');
 if(context&&x.contract)context.provider_contract=x.contract;
 if(x.pending_orders===null||x.pending_orders===undefined||Number(x.pending_orders)>0)reasons.push('PENDING_ORDER_RECONCILIATION_REQUIRED');
 if(!Number.isFinite(at)||!Number.isFinite(observed)||observed>at||at-observed>60000)reasons.push('ACCOUNT_EVIDENCE_STALE');
 try{assertCompleteProductionContext(context,{customerId:input.customerId,accountId:input.accountId,provider,observedAt:x.observed_at},at)}catch{reasons.push('COMPLETE_ACCOUNT_CONTEXT_REQUIRED')}
 if(context&&(context.environment!==String(account.environment).toUpperCase()||context.account_type!==account.account_mode))reasons.push('ACCOUNT_CONTEXT_MODE_MISMATCH');
 if(x.policy?.policy_id!==account.policy_profile_id||x.policy?.policy_version!==account.policy_version||x.assignment?.policy_version!==account.policy_version)reasons.push('CURRENT_BRAIN_POLICY_REQUIRED');
 if(!x.eligibility||x.eligibility.decision!=='ELIGIBLE')reasons.push('CURRENT_QUALIFIED_SET_REQUIRED');
 if(!Number.isFinite(Date.parse(signal.expires_at))||Date.parse(signal.expires_at)<=at)reasons.push('CANONICAL_SIGNAL_EXPIRED');
 if(signal.status!=='active')reasons.push('CANONICAL_SIGNAL_NOT_ADMITTED');
 if(provider.startsWith('MT5')?(x.connection?.state!=='CONNECTED'||x.connection?.capabilities?.trading!==true):(x.connection?.state!=='VERIFIED'||x.connection?.capabilities?.verified!==true||x.connection?.capabilities?.trading!==true||x.connection?.capabilities?.withdrawal!==false))reasons.push('CURRENT_PROVIDER_CAPABILITIES_REQUIRED');
 if(account.account_mode==='PERSONAL'&&!await loadProductEntryQuality(db,signal))reasons.push('PRODUCT_ENTRY_QUALITY_REQUIRED');
 const sp=x.strategy_plan;if(!sp||sp.identity?.strategy_id!==signal.strategy_id||sp.identity?.strategy_version!==signal.strategy_version||sp.market_context?.symbol!==signal.symbol||sp.decision?.action!==String(signal.direction).toUpperCase()||sp.risk_proposal?.initial_stop!==Number(signal.stop_loss)||sp.risk_proposal?.tp1!==Number(signal.tp1)||sp.risk_proposal?.tp2!==Number(signal.tp2)||Date.parse(sp.entry_plan?.expires_at)<=at||!Number.isFinite(Date.parse(sp.entry_plan?.expires_at)))reasons.push('CANONICAL_STRATEGY_PLAN_REQUIRED');
 const ownership={id:account.id,immutableIdentity:account.immutable_identity,customerId:account.customer_id,provider,accountType:account.account_mode,active:account.enabled===true,executionEnabled:account.execution_enabled===true,runtimeControl:account.runtime_control,policyProfileId:account.policy_profile_id,policyVersion:account.policy_version};
 let performance;const config={preset:account.policy_preset,...account.policy_overrides?.policy_configuration};
 if(config.lossResponse||config.houseMoney){try{performance=await loadAccountPerformanceHistory(db,{customerId:input.customerId,accountId:input.accountId,provider,asOf:now})}catch{reasons.push('COMPLETE_PROVIDER_HISTORY_REQUIRED')}}
 let forwardHistoryEvidence;if(personalRiskProfile(config.personalRiskProfile)==='SMART_GROWTH')forwardHistoryEvidence=await loadSmartGrowthHistory(db,input.customerId,input.accountId,provider,now);
 let houseMoneyFacts;if(config.houseMoney==='house-money/v1'){houseMoneyFacts=await loadHouseMoneyFacts(db,x,now);}
 let decision:AccountDecisionRecord;
 if(!reasons.length){decision=evaluateAccountSignal({liveAuthorization:x.live_authorization,signal:{signal_id:signal.id,symbol:signal.symbol,market_type:signal.market_type,direction:String(signal.direction).toUpperCase() as 'BUY'|'SELL',entry_price:Number(signal.entry_low),stop_loss:Number(signal.stop_loss),tp1:Number(signal.tp1),tp2:signal.tp2===null?null:Number(signal.tp2),confidence_score:Number(signal.confidence_score),grade:signal.grade,strategy_id:signal.strategy_id,timeframe:signal.timeframe,created_at:signal.created_at},account:ownership,context,basePolicy:x.policy,configuration:config,entitlement:x.entitlement,product:x.product,eligibility:x.eligibility,evaluatedAt:now,houseMoneyFacts,forwardHistoryEvidence,performanceEvidence:performance,duplicateSignalForAccount:x.duplicate===true,activeSymbolConflict:x.active_symbol_conflict===true});}
 else{decision={authorityVersion:'account-policy-authority/v1',decisionId:'pending',customerId:input.customerId,accountId:input.accountId,immutableAccountIdentity:ownership.immutableIdentity,signalId:signal.id,decision:'BLOCK',reasonCodes:reasons,authorizedRiskPct:0,brainFamily:account.account_mode==='PERSONAL'?'PERSONAL':'PROP',brainProvider:provider,brainVersion:getExecutionBrain(provider).brain_version,policyProfileId:account.policy_profile_id,policyVersion:account.policy_version,configuration:config,evaluatedAt:now,executionIntent:null};}
 // Production uses a full content fingerprint rather than the pure evaluator's short fixture ID.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({input,evidence:x.evidence_hash,decision,forwardHistoryEvidence})));const fingerprint=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');decision={...decision,decisionId:`decision_${fingerprint}`,executionIntent:decision.executionIntent?{...decision.executionIntent,intentId:`intent_${fingerprint}`}:null};
 let plan=null;if(decision.executionIntent){try{plan=planFromAccountDecision(decision,x,x.strategy_plan,signal.arbitrator_decision??{});if(plan?.status!=='PLANNED')throw Error('ROUTING_REJECTED')}catch{decision={...decision,decision:'BLOCK',authorizedRiskPct:0,executionIntent:null,reasonCodes:[...decision.reasonCodes,'EXECUTION_PLAN_UNAVAILABLE']};plan=null}}
 if(houseMoneyFacts&&'equity_phase' in decision){const saved=await db.rpc('persist_house_money_decision',{p_customer:input.customerId,p_account:input.accountId,p_observed:houseMoneyFacts.observedAt,p_decision:{equity_phase:decision.equity_phase,base_risk_pct:decision.base_risk_pct,applied_risk_pct:decision.applied_risk_pct,block_reason:decision.block_reason}});if(saved.error)throw Error('HOUSE_MONEY_DECISION_NOT_PERSISTED');}
 const persisted=await db.rpc('commit_production_account_authorization',{p_customer_id:input.customerId,p_account_id:input.accountId,p_signal_id:input.signalId,p_idempotency_key:input.idempotencyKey,p_evidence_hash:x.evidence_hash,p_decision:decision,p_execution_plan:plan});if(persisted.error||!persisted.data)throw Error(`ACCOUNT_AUTHORIZATION_NOT_PERSISTED:${persisted.error?.message??'missing result'}`);return persisted.data;
}

/** Scanner-side durable producer only. It never calls an exchange or dispatches an order. */
export async function drainProductionAccountAuthorizations(db:any,limit=25,refresh?: (account:any)=>Promise<void>){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('AUTHORIZATION_BATCH_BOUND');
 const queued=await db.rpc('enqueue_production_account_authorizations');if(queued.error)throw Error('ACCOUNT_AUTHORIZATION_ENQUEUE_FAILED');
 const pending=await db.from('account_signal_authorization_jobs').select('*').eq('state','PENDING').order('updated_at').order('id').limit(limit);if(pending.error||!Array.isArray(pending.data))throw Error('ACCOUNT_AUTHORIZATION_JOBS_UNAVAILABLE');
 const results=[],refreshed=new Set<string>();
 for(const job of pending.data){try{
  const source=await db.rpc('load_production_account_authorization_input',{p_customer_id:job.customer_id,p_account_id:job.execution_account_id,p_signal_id:job.signal_id});if(source.error||!source.data)throw Error('ACCOUNT_AUTHORIZATION_INPUT_UNAVAILABLE');
  if(Date.parse(source.data.signal.expires_at)<=Date.now()||!['waiting','active'].includes(source.data.signal.status)){
   const ended=await db.from('account_signal_authorization_jobs').update({state:'RECORDED',last_error:'SIGNAL_NO_LONGER_EXECUTABLE',updated_at:new Date().toISOString()}).eq('id',job.id).eq('state','PENDING');if(ended.error)throw Error('ACCOUNT_AUTHORIZATION_JOB_NOT_PERSISTED');results.push({id:job.id,state:'SIGNAL_NO_LONGER_EXECUTABLE'});continue;
  }
  if(source.data.signal.status==='waiting'){
   const held=await db.from('account_signal_authorization_jobs').update({last_error:'WAITING_FOR_CONFIRMATION',updated_at:new Date().toISOString()}).eq('id',job.id).eq('state','PENDING');if(held.error)throw Error('ACCOUNT_AUTHORIZATION_JOB_NOT_PERSISTED');results.push({id:job.id,state:'WAITING_FOR_CONFIRMATION'});continue;
  }
  if(refresh&&!refreshed.has(job.execution_account_id)){await refresh(source.data.account);refreshed.add(job.execution_account_id);}
  // Transient missing observations stay retryable; they must not freeze a permanent BLOCK for this signal.
  if(Date.parse(source.data.signal.expires_at)>Date.now()&&['waiting','active'].includes(source.data.signal.status)){
   await prepareAutomaticMt5Evidence(db,source.data);
   await prepareAutomaticCryptoEvidence(db,source.data);
   await prepareAutomaticBybitEvidence(db,source.data);
   // authorizeCanonicalAccountSignal reloads the newly persisted evidence for every provider.
  }
  const decision=await authorizeCanonicalAccountSignal(db,{customerId:job.customer_id,accountId:job.execution_account_id,signalId:job.signal_id,idempotencyKey:`job:${job.id}`});
  const saved=await db.from('account_signal_authorization_jobs').update({state:'RECORDED',decision_id:decision.id,last_error:null,updated_at:new Date().toISOString()}).eq('id',job.id).eq('state','PENDING');if(saved.error)throw Error('ACCOUNT_AUTHORIZATION_JOB_NOT_PERSISTED');
  results.push({id:job.id,decision:decision.decision});
 }catch(error){const code=error instanceof Error?error.message:'AUTHORIZATION_FAILED';const saved=await db.from('account_signal_authorization_jobs').update({last_error:code,updated_at:new Date().toISOString()}).eq('id',job.id).eq('state','PENDING');if(saved.error)throw Error('ACCOUNT_AUTHORIZATION_JOB_ERROR_NOT_PERSISTED');results.push({id:job.id,error:code})}}
 return results;
}
