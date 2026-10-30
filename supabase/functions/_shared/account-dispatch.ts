/** Dispatch only persisted canonical Phase-D artifacts. A missing/ambiguous external receipt is reconciliation work, never a retry instruction. */
export async function drainAccountDispatch(db:any,submit:(plan:any,policyVersion:string)=>Promise<{accepted:boolean;uncertain?:boolean;receipt:Record<string,unknown>}>) {
 const claimed=await db.rpc('claim_account_dispatch',{p_limit:10});if(claimed.error)throw Error('DISPATCH_CLAIM_FAILED');const results=[];
 for(const job of claimed.data??[]){let state='FAILED',receipt:Record<string,unknown>={reason:'CANONICAL_PLAN_UNAVAILABLE'};
  try{const artifact=await db.from('certified_runtime_artifacts').select('execution_plan').eq('account_id',job.execution_account_id).contains('execution_plan',{risk_decision:{decision_id:job.decision_id}}).maybeSingle();
   if(artifact.error||!artifact.data?.execution_plan)throw Error('CANONICAL_PLAN_UNAVAILABLE');
   const plan=artifact.data.execution_plan;if(plan.routing?.account_id!==job.execution_account_id||plan.risk_decision?.account?.customer_id!==job.customer_id||plan.risk_decision?.decision_id!==job.decision_id||!['TESTNET','DEMO'].includes(plan.routing?.environment))throw Error('DISPATCH_SCOPE_MISMATCH');
   const r=await submit(plan,job.policy_version);state=r.uncertain?'UNKNOWN':r.accepted?'SENT':'FAILED';receipt=r.receipt;
  }catch(e){state='UNKNOWN';receipt={reason:e instanceof Error?e.message:'DISPATCH_OUTCOME_UNKNOWN'};}
  const saved=await db.from('account_signal_authorization_jobs').update({dispatch_state:state,dispatch_receipt:receipt,last_error:state==='SENT'?null:String(receipt.reason??state),updated_at:new Date().toISOString()}).eq('id',job.id).eq('dispatch_state','CLAIMED');if(saved.error)throw Error('DISPATCH_RECEIPT_NOT_PERSISTED');results.push({id:job.id,state});
 }return results;
}
