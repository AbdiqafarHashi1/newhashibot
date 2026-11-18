export type PropSetupPhase='CHALLENGE'|'VERIFICATION'|'FUNDED';
export function validatePropSetupPhase(value:unknown):PropSetupPhase{if(!['CHALLENGE','VERIFICATION','FUNDED'].includes(String(value)))throw Error('PROP_SETUP_PHASE_REQUIRED');return value as PropSetupPhase;}
/** Stage selection configures only a fresh unconnected account. It never promotes
 * an active evaluation, resets observed capital, changes credentials or starts trading. */
export async function configurePropDraftStage(db:any,customer:string,account:string,value:unknown){
 const phase=validatePropSetupPhase(value),mode=phase==='FUNDED'?'PROP_FUNDED':'PROP_EVALUATION';
 const {data:a,error}=await db.from('connected_execution_accounts').select('id,customer_id,provider,account_mode,provider_account_identity,policy_profile_id,policy_overrides,execution_enabled,updated_at').eq('id',account).eq('customer_id',customer).maybeSingle();
 if(error||!a||a.provider!=='MT5_PROP')throw Error('OWNED_PROP_ACCOUNT_REQUIRED');
 const previous=a.policy_overrides?.prop_setup?.phase;
 if(previous===phase&&a.account_mode===mode)return {phase,account_mode:mode};
 if(a.provider_account_identity!==`draft:${account}`||a.policy_profile_id||a.execution_enabled)throw Error('NEW_PROP_ACCOUNT_SETUP_REQUIRED');
 if(previous&&previous!==phase)throw Error('PROP_SETUP_PHASE_IDEMPOTENCY_CONFLICT');
 let write=db.from('connected_execution_accounts').update({account_mode:mode,policy_overrides:{...a.policy_overrides,prop_setup:{phase,selected_by:customer}},updated_at:new Date().toISOString()}).eq('id',account).eq('customer_id',customer).eq('provider_account_identity',`draft:${account}`).is('policy_profile_id',null).eq('execution_enabled',false);
 write=a.updated_at==null?write.is('updated_at',null):write.eq('updated_at',a.updated_at);
 const result=await write.select('id').maybeSingle();
 if(result.error||!result.data)throw Error('PROP_SETUP_CHANGED_RELOAD_REQUIRED');
 return {phase,account_mode:mode};
}
