import {commerceEnvironment} from '../_shared/commerce-provider-settings.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {mpesaAdapterFromGetter} from '../_shared/mpesa-adapter.ts';
import {reconcileMpesaEvent} from '../_shared/mpesa-commerce-reconciliation.ts';
import {sha256Hex} from '../_shared/commerce-events.ts';
Deno.serve(async req=>{
 const reply=(state:string,status=200)=>new Response(JSON.stringify({state}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply('METHOD_NOT_ALLOWED',405);
 const raw=await req.text();if(new TextEncoder().encode(raw).byteLength>262144)return reply('PAYLOAD_TOO_LARGE',413);
 let payload;try{payload=JSON.parse(raw)}catch{return reply('MALFORMED_JSON',400)}
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return reply('READY_FOR_CONFIGURATION',503);
 const db=createClient(url,key,{auth:{persistSession:false}});
 try{
  const get=await commerceEnvironment(db,key=>Deno.env.get(key));const result=await reconcileMpesaEvent(db,mpesaAdapterFromGetter(get),payload,await sha256Hex(raw));if(!result.event)return reply('AWAITING_PROVIDER_RECONCILIATION',202);
  const n=result.event,{error}=await db.from('commerce_payment_events').insert({provider:'MPESA',external_event_id:n.providerEventId,event_type:n.providerEventType,signature_verified:true,processing_state:n.safeEvidence.sandbox?'REVIEW_REQUIRED':'RECEIVED',payload_hash:n.payloadHash,normalized_event:n,review_reason:n.safeEvidence.sandbox?'SANDBOX_NO_PAID_ACCESS':null,retention_until:new Date(Date.now()+30*86400000).toISOString()});
  if(error&&error.code!=='23505')return reply('INBOX_WRITE_FAILED',500);
  if(n.safeEvidence.sandbox)return reply('SANDBOX_VERIFIED_NO_PAID_ACCESS',202);
  const {data,error:processError}=await db.rpc('process_canonical_commerce_event',{p_provider:'MPESA',p_event_id:n.providerEventId});
  if(processError)return reply('PAYMENT_PENDING',500);return reply(error?.code==='23505'?'DUPLICATE_ACCEPTED':data?.state??'PROCESSED');
 }catch{return reply('MANUAL_REVIEW_REQUIRED',202)}
});
