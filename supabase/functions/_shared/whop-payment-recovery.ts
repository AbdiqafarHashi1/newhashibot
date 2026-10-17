import type {NormalizedCommerceEvent} from './commerce-events.ts';
import {sha256Hex} from './commerce-events.ts';
import {verifyWhopRuntimeEvent,whopRequest,type WhopRuntimeConfig} from './whop-runtime.ts';
/** Bounded source polling recovers delayed/missing webhooks; cursor updates follow durable inbox writes. */
export async function recoverWhopPayments(db:any,config:WhopRuntimeConfig,transport:typeof fetch=fetch,now=Date.now()){
 const results:any[]=[];
 for(const plan of [...new Set(Object.values(config.planIds).filter(Boolean))]){
  const scope=`whop:${config.environment}:${plan}`,prior=await db.from('commerce_reconciliation_cursors').select('cursor').eq('scope',scope).maybeSingle();if(prior.error)throw Error('WHOP_RECOVERY_CURSOR_UNAVAILABLE');
  const saved=prior.data?.cursor??{};let initial=saved.watermark;if(!saved.end&&(initial===undefined||initial===null)){const first=await db.from('commerce_checkout_sessions').select('created_at').eq('provider','WHOP').order('created_at').limit(1).maybeSingle();if(first.error)throw Error('WHOP_RECOVERY_START_UNAVAILABLE');if(!first.data)continue;initial=Date.parse(first.data.created_at)-60000;if(!Number.isFinite(initial))throw Error('WHOP_RECOVERY_START_INVALID')}const window=saved.end?saved:{start:initial,end:now,after:null};
  const params=new URLSearchParams({account_id:config.companyId,plan_id:plan,first:'5',direction:'asc',order:'created_at',created_after:new Date(window.start).toISOString(),created_before:new Date(window.end).toISOString()});if(window.after)params.set('after',window.after);
  const page=await whopRequest(config,`payments?${params}`,undefined,undefined,transport);if(!Array.isArray(page.data)||!page.page_info)throw Error('WHOP_RECOVERY_PAGE_INVALID');
  for(const payment of page.data){
   if(typeof payment.id!=='string'||!/^pay_[A-Za-z0-9]+$/.test(payment.id))throw Error('WHOP_RECOVERY_PAYMENT_INVALID');
   const seed={providerPaymentId:payment.id,providerEventId:`source:${payment.id}`,providerEventType:'payment.source_recovery',schemaVersion:'phase-i/1',provider:'WHOP',occurredAt:new Date(now).toISOString(),verified:true} as NormalizedCommerceEvent;
   try{
    const event=await verifyWhopRuntimeEvent(db,config,seed,transport);event.providerEventId=`source:${payment.id}:${event.paymentStatus}`;event.payloadHash=await sha256Hex(JSON.stringify(event));
    const {error}=await db.from('commerce_payment_events').insert({provider:'WHOP',external_event_id:event.providerEventId,event_type:event.providerEventType,signature_verified:true,processing_state:event.safeEvidence.sandbox?'REVIEW_REQUIRED':'RECEIVED',review_reason:event.safeEvidence.sandbox?'SANDBOX_NO_PAID_ACCESS':null,payload_hash:event.payloadHash,normalized_event:event,retention_until:new Date(now+30*86400000).toISOString()});if(error&&error.code!=='23505')throw Error('WHOP_RECOVERY_INBOX_WRITE_FAILED');
    results.push({paymentId:payment.id,state:event.paymentStatus});
   }catch(e){const code=e instanceof Error?e.message:'';if(['WHOP_SOURCE_LINEAGE_MISMATCH','WHOP_SOURCE_AMOUNT_MISMATCH','WHOP_RENEWAL_MEMBER_MISMATCH','WHOP_BOUND_SUBSCRIPTION_REQUIRED'].includes(code)){
    const eventId=`source:${payment.id}:REVIEW`,inbox=await db.from('commerce_payment_events').insert({provider:'WHOP',external_event_id:eventId,event_type:'payment.source_recovery',signature_verified:true,processing_state:'REVIEW_REQUIRED',review_reason:code,payload_hash:await sha256Hex(`${eventId}:${code}`),normalized_event:{...seed,providerEventId:eventId}});if(inbox.error&&inbox.error.code!=='23505')throw Error('WHOP_RECOVERY_REVIEW_NOT_PERSISTED');if(!inbox.error){const {error}=await db.from('commerce_manual_reviews').insert({reason_code:'WHOP_SOURCE_RECOVERY_REQUIRES_LINK_REVIEW',status:'OPEN'});if(error)throw Error('WHOP_RECOVERY_REVIEW_NOT_PERSISTED')}results.push({state:'MANUAL_REVIEW_REQUIRED'});
   }else throw e}
  }
  if(page.page_info.has_next_page&&(!page.page_info.end_cursor||page.page_info.end_cursor===window.after||!page.data.length))throw Error('WHOP_RECOVERY_CURSOR_INVALID');
  const cursor=page.page_info.has_next_page?{...window,after:page.page_info.end_cursor}:{watermark:window.end-300000};
  const {error}=await db.from('commerce_reconciliation_cursors').upsert({scope,cursor,updated_at:new Date(now).toISOString()});if(error)throw Error('WHOP_RECOVERY_CURSOR_NOT_PERSISTED');
 }
 return results;
}

/** Revisit current paid subscriptions in a durable round-robin so lost refund/dispute webhooks are recoverable too. */
export async function recheckWhopMembershipPayments(db:any,config:WhopRuntimeConfig,transport:typeof fetch=fetch,now=Date.now()){
 const scope=`whop-active:${config.environment}:${config.companyId}`,prior=await db.from('commerce_reconciliation_cursors').select('cursor').eq('scope',scope).maybeSingle();if(prior.error)throw Error('WHOP_RECOVERY_CURSOR_UNAVAILABLE');
 let query=db.from('commerce_subscriptions').select('id,last_verified_payment_id').eq('provider','WHOP').in('status',['ACTIVE','GRACE','PAST_DUE','CANCEL_AT_PERIOD_END']).not('last_verified_payment_id','is',null).order('id').limit(5);if(prior.data?.cursor?.after)query=query.gt('id',prior.data.cursor.after);
 const page=await query;if(page.error||!Array.isArray(page.data))throw Error('WHOP_SUBSCRIPTION_RECOVERY_UNAVAILABLE');
 const results=[];
 for(const subscription of page.data){const attempt=await db.from('commerce_payment_attempts').select('external_reference').eq('id',subscription.last_verified_payment_id).eq('provider','WHOP').maybeSingle();if(attempt.error||!/^pay_[A-Za-z0-9]+$/.test(attempt.data?.external_reference??''))throw Error('WHOP_SUBSCRIPTION_PAYMENT_REQUIRED');
  const event=await verifyWhopRuntimeEvent(db,config,{schemaVersion:'phase-i/1',provider:'WHOP',providerPaymentId:attempt.data.external_reference,providerEventId:'source-recheck',providerEventType:'payment.source_recheck',occurredAt:new Date(now).toISOString(),verified:true} as NormalizedCommerceEvent,transport);
  event.providerEventId=`recheck:${attempt.data.external_reference}:${event.paymentStatus}`;event.payloadHash=await sha256Hex(JSON.stringify(event));
  const {error}=await db.from('commerce_payment_events').insert({provider:'WHOP',external_event_id:event.providerEventId,event_type:event.providerEventType,signature_verified:true,processing_state:event.safeEvidence.sandbox?'REVIEW_REQUIRED':'RECEIVED',review_reason:event.safeEvidence.sandbox?'SANDBOX_NO_PAID_ACCESS':null,payload_hash:event.payloadHash,normalized_event:event,retention_until:new Date(now+30*86400000).toISOString()});if(error&&error.code!=='23505')throw Error('WHOP_RECOVERY_INBOX_WRITE_FAILED');results.push({paymentId:attempt.data.external_reference,state:event.paymentStatus});
 }
 const {error}=await db.from('commerce_reconciliation_cursors').upsert({scope,cursor:{after:page.data.at(-1)?.id??null},updated_at:new Date(now).toISOString()});if(error)throw Error('WHOP_RECOVERY_CURSOR_NOT_PERSISTED');return results;
}
