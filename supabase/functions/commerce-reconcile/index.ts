import {createClient} from 'npm:@supabase/supabase-js@2';
import {mpesaAdapterFromEnv} from '../_shared/mpesa-adapter.ts';
import {reconcileMpesaRequest} from '../_shared/mpesa-commerce-reconciliation.ts';
import {whopRuntimeConfig,verifyWhopRuntimeEvent} from '../_shared/whop-runtime.ts';
Deno.serve(async req=>{
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply(405,{state:'BLOCKED'});
 const expected=Deno.env.get('HASHIBOT_INTERNAL_SECRET'),provided=req.headers.get('x-hashibot-internal-secret');if(!expected||provided!==expected)return reply(401,{state:'BLOCKED',reason:'SERVICE_AUTH_REQUIRED'});
 const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}}),results:any[]=[],adapter=mpesaAdapterFromEnv();
 // Recover lost callbacks with provider queries against known requests; never submit a second STK request.
 const pending=await db.from('commerce_payment_attempts').select('external_reference').eq('provider','MPESA').eq('state','PENDING').not('external_reference','is',null).order('requested_at').limit(10);
 if(pending.error)return reply(500,{state:'BLOCKED',reason:'PAYMENT_ATTEMPTS_UNAVAILABLE'});
 for(const attempt of pending.data??[]){try{const result=await reconcileMpesaRequest(db,adapter,attempt.external_reference);if(!result.event)continue;const n=result.event,{error}=await db.from('commerce_payment_events').insert({provider:'MPESA',external_event_id:n.providerEventId,event_type:n.providerEventType,signature_verified:true,processing_state:n.safeEvidence.sandbox?'REVIEW_REQUIRED':'RECEIVED',review_reason:n.safeEvidence.sandbox?'SANDBOX_NO_PAID_ACCESS':null,payload_hash:n.payloadHash,normalized_event:n});if(error&&error.code!=='23505')throw error}catch{results.push({state:'MPESA_QUERY_RETRYABLE'})}}
 const {data:events,error}=await db.from('commerce_payment_events').select('provider,external_event_id,normalized_event').in('processing_state',['RECEIVED','FAILED']).order('received_at').limit(25);if(error)return reply(500,{state:'BLOCKED',reason:'INBOX_READ_FAILED'});
 for(const event of events??[]){try{
  let verified;if(event.provider==='MPESA'){verified=(await reconcileMpesaRequest(db,adapter,String(event.normalized_event?.providerCheckoutId))).event;if(!verified)continue}
  else{const config=whopRuntimeConfig(k=>Deno.env.get(k));if(!config)throw Error('WHOP_NOT_CONFIGURED');verified=await verifyWhopRuntimeEvent(db,config,event.normalized_event)}
  if(verified.safeEvidence.sandbox===true||verified.reconciliationRequired){results.push({event_id:event.external_event_id,state:'REVIEW_REQUIRED'});continue}
  const {error:saveError}=await db.from('commerce_payment_events').update({signature_verified:true,normalized_event:verified}).eq('provider',event.provider).eq('external_event_id',event.external_event_id);if(saveError)throw saveError;
  const {data,error}=await db.rpc('process_canonical_commerce_event',{p_provider:event.provider,p_event_id:event.external_event_id});results.push({event_id:event.external_event_id,state:error?'RETRYABLE':data?.state??'PROCESSED'});
 }catch{results.push({event_id:event.external_event_id,state:'RETRYABLE'})}}
 return reply(200,{state:'COMPLETE',results});
});
