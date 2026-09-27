import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyWhopWebhook } from "../_shared/whop-verification.ts";
import { normalizeWhopCommerceEvent,sha256Hex } from "../_shared/commerce-events.ts";
const response=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async request=>{
 if(request.method!=="POST")return response(405,{state:"BLOCKED",reason:"METHOD_NOT_ALLOWED"});
 const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>262144)return response(413,{state:"BLOCKED",reason:"PAYLOAD_TOO_LARGE"});
 const verification=verifyWhopWebhook(raw,request.headers,Deno.env.get("WHOP_WEBHOOK_SECRET"));if(!verification.verified)return response(Deno.env.get("WHOP_WEBHOOK_SECRET")?401:503,{state:Deno.env.get("WHOP_WEBHOOK_SECRET")?"BLOCKED":"WEBHOOK_NOT_CONFIGURED",reason:verification.error});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return response(503,{state:"READY_FOR_CONFIGURATION"});
 const hash=await sha256Hex(raw);let normalized;try{normalized=normalizeWhopCommerceEvent(verification.event,hash)}catch{return response(202,{state:"UNSUPPORTED_EVENT_IGNORED",event_id:verification.event.id})}
 const db=createClient(url,key,{auth:{persistSession:false}});const incomplete=normalized.reconciliationRequired||!normalized.checkoutId;
 const {error:inboxError}=await db.from("commerce_payment_events").insert({provider:"WHOP",external_event_id:normalized.providerEventId,event_type:normalized.providerEventType,signature_verified:true,processing_state:incomplete?"REVIEW_REQUIRED":"RECEIVED",payload_hash:hash,normalized_event:normalized,retention_until:new Date(Date.now()+30*86400000).toISOString()});
 if(inboxError?.code==="23505")return response(200,{state:"DUPLICATE_ACCEPTED",event_id:normalized.providerEventId});if(inboxError)return response(500,{state:"PAYMENT_PENDING",reason:"INBOX_WRITE_FAILED"});
 if(incomplete){await db.from("commerce_manual_reviews").insert({reason_code:"INCOMPLETE_PROVIDER_EVIDENCE",status:"OPEN"});return response(202,{state:"MANUAL_REVIEW_REQUIRED",event_id:normalized.providerEventId});}
 const {data,error}=await db.rpc("process_canonical_commerce_event",{p_provider:"WHOP",p_event_id:normalized.providerEventId});if(error)return response(500,{state:"PAYMENT_PENDING",reason:"ATOMIC_PROCESSING_FAILED"});
 return response(data?.state==="REVIEW_REQUIRED"?202:200,{state:data?.state??"PROCESSED",event_id:normalized.providerEventId});
});
