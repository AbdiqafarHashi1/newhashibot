import {authorizeInternalOrAdmin} from '../_shared/internal-auth.ts';
import {recoverWhopPayments,recheckWhopMembershipPayments} from '../_shared/whop-payment-recovery.ts';
import {commerceEnvironment} from '../_shared/commerce-provider-settings.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {mpesaAdapterFromGetter} from '../_shared/mpesa-adapter.ts';
import {reconcileMpesaRequest} from '../_shared/mpesa-commerce-reconciliation.ts';
import {whopRuntimeConfig,verifyWhopRuntimeEvent} from '../_shared/whop-runtime.ts';
Deno.serve(async req=>{
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply(405,{state:'BLOCKED'});
 const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}});
 const auth=await authorizeInternalOrAdmin(req,db);if(!auth.ok)return reply(auth.status,{state:'BLOCKED',reason:'SERVICE_AUTH_REQUIRED'});
 const get=await commerceEnvironment(db,key=>Deno.env.get(key)),results:any[]=[],adapter=mpesaAdapterFromGetter(get);
 const whop=whopRuntimeConfig(get);if(whop){try{results.push(...await recoverWhopPayments(db,whop));results.push(...await recheckWhopMembershipPayments(db,whop))}catch{results.push({state:'WHOP_SOURCE_RECOVERY_RETRYABLE'})}}
 // Recover lost callbacks with provider queries against known requests; never submit a second STK request.
 const pending=await db.from('commerce_payment_attempts').select('id,external_reference').eq('provider','MPESA').eq('state','PENDING').not('external_reference','is',null).lte('next_status_query_at',new Date().toISOString()).order('next_status_query_at').limit(10);
 if(pending.error)return reply(500,{state:'BLOCKED',reason:'PAYMENT_ATTEMPTS_UNAVAILABLE'});
 for(const attempt of pending.data??[]){try{const due=await db.from('commerce_payment_attempts').update({next_status_query_at:new Date(Date.now()+300000).toISOString()}).eq('id',attempt.id);if(due.error)throw Error('PAYMENT_QUERY_NOT_SCHEDULED');const result=await reconcileMpesaRequest(db,adapter,attempt.external_reference);if(!result.event)continue;const n=result.event,{error}=await db.from('commerce_payment_events').insert({provider:'MPESA',external_event_id:n.providerEventId,event_type:n.providerEventType,signature_verified:true,processing_state:n.safeEvidence.sandbox?'REVIEW_REQUIRED':'RECEIVED',review_reason:n.safeEvidence.sandbox?'SANDBOX_NO_PAID_ACCESS':null,payload_hash:n.payloadHash,normalized_event:n});if(error&&error.code!=='23505')throw error}catch{results.push({state:'MPESA_QUERY_RETRYABLE'})}}
 const {data:events,error}=await db.from('commerce_payment_events').select('provider,external_event_id,normalized_event').in('processing_state',['RECEIVED','FAILED']).lte('next_reconcile_at',new Date().toISOString()).order('next_reconcile_at').limit(25);if(error)return reply(500,{state:'BLOCKED',reason:'INBOX_READ_FAILED'});
 for(const event of events??[]){try{
  let verified;if(event.provider==='MPESA'){verified=(await reconcileMpesaRequest(db,adapter,String(event.normalized_event?.providerCheckoutId))).event;if(!verified){await db.from('commerce_payment_events').update({next_reconcile_at:new Date(Date.now()+300000).toISOString()}).eq('provider',event.provider).eq('external_event_id',event.external_event_id);continue}}
  else{const config=whopRuntimeConfig(get);if(!config)throw Error('WHOP_NOT_CONFIGURED');verified=await verifyWhopRuntimeEvent(db,config,event.normalized_event)}
  if(verified.safeEvidence.sandbox===true||verified.reconciliationRequired){await db.from('commerce_payment_events').update(verified.safeEvidence.sandbox?{processing_state:'REVIEW_REQUIRED',review_reason:'SANDBOX_NO_PAID_ACCESS'}:{next_reconcile_at:new Date(Date.now()+300000).toISOString()}).eq('provider',event.provider).eq('external_event_id',event.external_event_id);results.push({event_id:event.external_event_id,state:'REVIEW_REQUIRED'});continue}
  const {error:saveError}=await db.from('commerce_payment_events').update({signature_verified:true,normalized_event:verified}).eq('provider',event.provider).eq('external_event_id',event.external_event_id);if(saveError)throw saveError;
  const {data,error}=await db.rpc('process_canonical_commerce_event',{p_provider:event.provider,p_event_id:event.external_event_id});if(error)throw Error('PAYMENT_PROCESSOR_RETRYABLE');results.push({event_id:event.external_event_id,state:data?.state??'PROCESSED'});
 }catch{await db.from('commerce_payment_events').update({safe_error:'PAYMENT_SOURCE_OR_PROCESSOR_RETRYABLE',next_reconcile_at:new Date(Date.now()+120000).toISOString()}).eq('provider',event.provider).eq('external_event_id',event.external_event_id);results.push({event_id:event.external_event_id,state:'RETRYABLE'})}}
 return reply(200,{state:'COMPLETE',results});
});
