import {sha256Hex} from './commerce-events.ts';
import {whopRequest,type WhopRuntimeConfig} from './whop-runtime.ts';
export function verifiedWhopCheckoutConfiguration(config:WhopRuntimeConfig,checkout:any,source:any){
 const meta=source?.metadata,plan=source?.plan;
 if(!source||typeof source.id!=='string'||!/^[-A-Za-z0-9_]{3,200}$/.test(source.id)||source.account_id!==config.companyId||source.mode!=='payment'||plan?.id!==config.planIds[checkout.product_code]||meta?.hashibot_checkout_id!==checkout.id||meta?.hashibot_customer_id!==checkout.customer_id||meta?.hashibot_product_code!==checkout.product_code)throw Error('WHOP_CHECKOUT_SOURCE_LINEAGE_MISMATCH');
 if(String(plan.currency).toUpperCase()!==checkout.currency||plan.plan_type!=='renewal'||Number(plan.billing_period)!==30||Number(plan.trial_period_days??0)!==0||Math.round(Number(plan.initial_price)*100)!==Number(checkout.amount_minor)||Math.round(Number(plan.renewal_price)*100)!==Number(checkout.amount_minor))throw Error('WHOP_CHECKOUT_SOURCE_PRICE_MISMATCH');
 let link:URL;try{link=new URL(source.purchase_url)}catch{throw Error('WHOP_CHECKOUT_SOURCE_URL_INVALID')}if(link.protocol!=='https:'||!['whop.com','sandbox.whop.com'].includes(link.hostname)||link.username||link.password)throw Error('WHOP_CHECKOUT_SOURCE_URL_INVALID');
 let redirect:URL;try{redirect=new URL(source.redirect_url)}catch{throw Error('WHOP_CHECKOUT_SOURCE_REDIRECT_MISMATCH')}const expected=new URL(checkout.safe_return_url);expected.searchParams.set('checkout',checkout.id);if(redirect.toString()!==expected.toString())throw Error('WHOP_CHECKOUT_SOURCE_REDIRECT_MISMATCH');
 return {externalReference:source.id,actionUrl:link.toString()};
}
/** One conditional database write binds the source-read native ID; this does not grant paid access or resubmit checkout. */
export async function bindRecoveredWhopCheckout(db:any,config:WhopRuntimeConfig,checkout:any,source:any){
 const verified=verifiedWhopCheckoutConfiguration(config,checkout,source);
 if(checkout.external_reference){if(checkout.external_reference!==verified.externalReference)throw Error('WHOP_CHECKOUT_NATIVE_ID_CONFLICT');return checkout}
 if(!['PROVIDER_PENDING','REVIEW_REQUIRED'].includes(checkout.status))throw Error('WHOP_CHECKOUT_NOT_UNCERTAIN');
 const saved=await db.from('commerce_checkout_sessions').update({external_reference:verified.externalReference,provider_action_url:verified.actionUrl,status:'PROVIDER_PENDING'}).eq('id',checkout.id).eq('customer_id',checkout.customer_id).eq('provider','WHOP').is('external_reference',null).in('status',['PROVIDER_PENDING','REVIEW_REQUIRED']).select('*').maybeSingle();if(saved.error)throw Error('WHOP_CHECKOUT_BIND_NOT_PERSISTED');if(saved.data)return saved.data;
 const current=await db.from('commerce_checkout_sessions').select('*').eq('id',checkout.id).eq('customer_id',checkout.customer_id).eq('provider','WHOP').maybeSingle();if(current.error||current.data?.external_reference!==verified.externalReference)throw Error('WHOP_CHECKOUT_NATIVE_ID_CONFLICT');return current.data;
}
export async function recoverWhopCheckoutConfigurations(db:any,config:WhopRuntimeConfig,transport:typeof fetch=fetch,now=Date.now()){
 const results=[];
 for(const plan of [...new Set(Object.values(config.planIds).filter(Boolean))]){
  const scope=`whop-checkouts:${config.environment}:${plan}`,previous=await db.from('commerce_reconciliation_cursors').select('cursor').eq('scope',scope).maybeSingle();if(previous.error)throw Error('WHOP_CHECKOUT_CURSOR_UNAVAILABLE');
  const saved=previous.data?.cursor??{};let start=saved.watermark;
  if(!saved.end&&start==null){const first=await db.from('commerce_checkout_sessions').select('created_at').eq('provider','WHOP').order('created_at').limit(1).maybeSingle();if(first.error)throw Error('WHOP_CHECKOUT_START_UNAVAILABLE');if(!first.data)continue;start=Date.parse(first.data.created_at)-60000;if(!Number.isFinite(start))throw Error('WHOP_CHECKOUT_START_INVALID')}
  const window=saved.end?saved:{start,end:now,after:null};
  const query=new URLSearchParams({account_id:config.companyId,plan_id:plan,first:'5',direction:'asc',order:'created_at',created_after:new Date(window.start).toISOString(),created_before:new Date(window.end).toISOString()});if(window.after)query.set('after',window.after);
  const page=await whopRequest(config,`checkout_configurations?${query}`,undefined,undefined,transport);if(!Array.isArray(page.data)||!page.page_info)throw Error('WHOP_CHECKOUT_PAGE_INVALID');
  for(const item of page.data){if(item.metadata==null)throw Error('WHOP_CHECKOUT_METADATA_PERMISSION_REQUIRED');const id=item.metadata.hashibot_checkout_id;if(!id)continue;
   const found=await db.from('commerce_checkout_sessions').select('*').eq('id',id).eq('provider','WHOP').maybeSingle();if(found.error)throw Error('WHOP_CHECKOUT_LOOKUP_FAILED');const checkout=found.data;if(!checkout||checkout.external_reference||!['PROVIDER_PENDING','REVIEW_REQUIRED'].includes(checkout.status))continue;
   // Retrieve the full configuration: list items may omit the plan/redirect fields.
   if(typeof item.id!=='string'||!/^[-A-Za-z0-9_]{3,200}$/.test(item.id))throw Error('WHOP_CHECKOUT_SOURCE_ID_REQUIRED');
   const source=await whopRequest(config,`checkout_configurations/${encodeURIComponent(item.id)}`,undefined,undefined,transport);if(source.id!==item.id)throw Error('WHOP_CHECKOUT_SOURCE_ID_MISMATCH');
   try{await bindRecoveredWhopCheckout(db,config,checkout,source);results.push({checkoutId:checkout.id,state:'CHECKOUT_LINK_RECOVERED'})}catch(error){
    const code=error instanceof Error?error.message:'';if(!['WHOP_CHECKOUT_SOURCE_LINEAGE_MISMATCH','WHOP_CHECKOUT_SOURCE_PRICE_MISMATCH','WHOP_CHECKOUT_SOURCE_URL_INVALID','WHOP_CHECKOUT_SOURCE_REDIRECT_MISMATCH','WHOP_CHECKOUT_NATIVE_ID_CONFLICT'].includes(code))throw error;
    const eventId=`checkout-source:${item.id}:REVIEW`,review=await db.from('commerce_payment_events').insert({provider:'WHOP',external_event_id:eventId,event_type:'checkout.source_review',signature_verified:true,processing_state:'REVIEW_REQUIRED',review_reason:code,payload_hash:await sha256Hex(eventId+code),normalized_event:{checkoutId:checkout.id,providerCheckoutId:item.id}});if(review.error&&review.error.code!=='23505')throw Error('WHOP_CHECKOUT_REVIEW_NOT_PERSISTED');results.push({checkoutId:checkout.id,state:'REVIEW_REQUIRED'});
   }
  }
  if(page.page_info.has_next_page&&(!page.page_info.end_cursor||page.page_info.end_cursor===window.after||!page.data.length))throw Error('WHOP_CHECKOUT_CURSOR_INVALID');
  const cursor=page.page_info.has_next_page?{...window,after:page.page_info.end_cursor}:{watermark:window.end-300000};const written=await db.from('commerce_reconciliation_cursors').upsert({scope,cursor,updated_at:new Date(now).toISOString()});if(written.error)throw Error('WHOP_CHECKOUT_CURSOR_NOT_PERSISTED');
 }
 return results;
}
