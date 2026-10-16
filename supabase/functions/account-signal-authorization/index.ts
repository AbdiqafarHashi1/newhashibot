import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {authorizeInternalOrAdmin} from '../_shared/internal-auth.ts';
import {authorizeCanonicalAccountSignal,drainProductionAccountAuthorizations} from '../_shared/production-account-authorization.ts';
import {recordObservedAccountPolicyEvidence} from '../_shared/observed-account-policy-evidence.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-hashibot-internal-secret','Content-Type':'application/json'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}}),auth=await authorizeInternalOrAdmin(req,db);
 if(!auth.ok)return new Response(JSON.stringify({error:auth.error}),{status:auth.status,headers});
 try{
  const body=await req.json();let result;
  if(body.action==='record_observed_evidence'){
   if(!['service_role','hashibot_internal_secret'].includes(auth.method))return new Response(JSON.stringify({error:'PROVIDER_WORKER_REQUIRED'}),{status:403,headers});
   const {action:_action,...input}=body;const keys=['customer_id','execution_account_id','provider','symbol','observed_at','account_context','contract_specification','routing_policy','capabilities','pending_orders'];
   if(Object.keys(input).some(k=>!keys.includes(k)))throw Error('OBSERVED_EVIDENCE_FIELDS_REQUIRED');
   result=await recordObservedAccountPolicyEvidence(db,input);
  }else if(body.action==='drain'){
   if(Object.keys(body).some(k=>k!=='action'))throw Error('CANONICAL_IDENTIFIERS_ONLY');result=await drainProductionAccountAuthorizations(db);
  }else{
   if(Object.keys(body).some(k=>!['customer_id','execution_account_id','signal_id','idempotency_key'].includes(k)))throw Error('CANONICAL_IDENTIFIERS_ONLY');
   result=await authorizeCanonicalAccountSignal(db,{customerId:body.customer_id,accountId:body.execution_account_id,signalId:body.signal_id,idempotencyKey:body.idempotency_key});
  }
  return new Response(JSON.stringify({state:'RECORDED',data:result}),{status:200,headers});
 }catch(error){return new Response(JSON.stringify({state:'BLOCKED',reason:error instanceof Error?error.message:'AUTHORIZATION_FAILED'}),{status:409,headers})}
});
