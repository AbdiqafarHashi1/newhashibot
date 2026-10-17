import {bindRecoveredWhopCheckout} from './whop-checkout-recovery.ts';
import type {NormalizedCommerceEvent} from './commerce-events.ts';
export type WhopRuntimeConfig={apiKey:string;companyId:string;webhookSecret:string;environment:'sandbox'|'production';planIds:Record<string,string>};
export function whopRuntimeConfig(get:(key:string)=>string|undefined):WhopRuntimeConfig|null{
 const apiKey=get('WHOP_API_KEY'),companyId=get('WHOP_COMPANY_ID'),webhookSecret=get('WHOP_WEBHOOK_SECRET'),environment=get('WHOP_ENVIRONMENT')??'sandbox';
 if(!apiKey||!companyId||!webhookSecret||!['sandbox','production'].includes(environment))return null;
 return {apiKey,companyId,webhookSecret,environment:environment as WhopRuntimeConfig['environment'],planIds:{VIP_SIGNALS:get('WHOP_VIP_PLAN_ID')??'',FOUNDING_AUTO_EXECUTION:get('WHOP_EXECUTION_PLAN_ID')??''}};
}
export async function whopRequest(c:WhopRuntimeConfig,path:string,body?:unknown,idempotencyKey?:string,transport:typeof fetch=fetch){
 const base=c.environment==='production'?'https://api.whop.com/api/v1':'https://sandbox-api.whop.com/api/v1';
 const r=await transport(`${base}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json','Api-Version-Date':'2026-09-11',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('WHOP_PROVIDER_REQUEST_FAILED');return r.json();
}
export function exactWhopMoney(m:any,currency:string):number{
 if(!m||typeof m.amount!=='string'||String(m.currency).toUpperCase()!==currency||m.decimals!==2||!/^\d+(?:\.\d{1,2})?$/.test(m.amount))throw Error('WHOP_EXACT_MONEY_REQUIRED');
 const [whole,fraction='']=m.amount.split('.'),minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));if(!Number.isSafeInteger(minor))throw Error('WHOP_INVALID_AMOUNT');return minor;
}
export async function verifyWhopRuntimePlan(c:WhopRuntimeConfig,product:string,amountMinor:number,currency:string,transport:typeof fetch=fetch){
 const planId=c.planIds[product];if(!planId)throw Error('WHOP_PLAN_NOT_CONFIGURED');
 const plan=await whopRequest(c,`plans/${encodeURIComponent(planId)}`,undefined,undefined,transport);
 if(plan.id!==planId||plan.account?.id!==c.companyId||String(plan.currency).toUpperCase()!==currency||Math.round(Number(plan.initial_price)*100)!==Number(amountMinor)||Number(plan.trial_period_days??0)!==0||plan.plan_type!=='renewal'||Math.round(Number(plan.renewal_price)*100)!==Number(amountMinor)||Number(plan.billing_period)!==30)throw Error('WHOP_PLAN_PRICE_OR_ACCOUNT_MISMATCH');
 return plan;
}
export async function createWhopRuntimeCheckout(c:WhopRuntimeConfig,checkout:any,transport:typeof fetch=fetch){
 await verifyWhopRuntimePlan(c,checkout.product_code,Number(checkout.amount_minor),checkout.currency,transport);
 const redirect=new URL(checkout.safe_return_url);redirect.searchParams.set('checkout',checkout.id);
 const result=await whopRequest(c,'checkout_configurations',{account_id:c.companyId,plan_id:c.planIds[checkout.product_code],mode:'payment',metadata:{hashibot_checkout_id:checkout.id,hashibot_customer_id:checkout.customer_id,hashibot_product_code:checkout.product_code},redirect_url:redirect.toString()},`hashibot:${checkout.id}`,transport);
 const parsed=new URL(result.purchase_url);if(typeof result.id!=='string'||!/^[-A-Za-z0-9_]{3,200}$/.test(result.id)||parsed.protocol!=='https:'||!['whop.com','sandbox.whop.com'].includes(parsed.hostname)||parsed.username||parsed.password)throw Error('WHOP_CHECKOUT_RESPONSE_INVALID');
 return {externalReference:String(result.id),actionUrl:parsed.toString()};
}
/** A signed event triggers a source lookup. Checkout/account/plan/amount are never inferred from a redirect. */
export async function verifyWhopRuntimeEvent(db:any,c:WhopRuntimeConfig,event:NormalizedCommerceEvent,transport:typeof fetch=fetch):Promise<NormalizedCommerceEvent>{
 if(!event.providerPaymentId||!/^pay_[A-Za-z0-9]+$/.test(event.providerPaymentId))throw Error('WHOP_PAYMENT_SOURCE_REQUIRED');
 const p=await whopRequest(c,`payments/${encodeURIComponent(event.providerPaymentId)}`,undefined,undefined,transport),metadata=p.metadata??{};
 let checkout:any,error:any,renewal=false;
 const checkoutId=metadata.hashibot_checkout_id??event.checkoutId;
 if(checkoutId&&p.billing_reason!=='subscription_cycle'){({data:checkout,error}=await db.from('commerce_checkout_sessions').select('*').eq('id',checkoutId).eq('provider','WHOP').maybeSingle())}
 else if(p.membership_id&&p.billing_reason==='subscription_cycle'){
  const {data:subscription,error:subscriptionError}=await db.from('commerce_subscriptions').select('customer_id,product_code,last_verified_payment_id').eq('provider','WHOP').eq('external_reference',p.membership_id).maybeSingle();
  if(subscriptionError||!subscription?.last_verified_payment_id)throw Error('WHOP_BOUND_SUBSCRIPTION_REQUIRED');
  const {data:prior,error:priorError}=await db.from('commerce_payment_attempts').select('checkout_session_id,safe_evidence').eq('id',subscription.last_verified_payment_id).eq('customer_id',subscription.customer_id).eq('provider','WHOP').maybeSingle();
  if(priorError||!prior||prior.safe_evidence?.member_id!==p.member_id)throw Error('WHOP_RENEWAL_MEMBER_MISMATCH');
  ({data:checkout,error}=await db.from('commerce_checkout_sessions').select('*').eq('id',prior.checkout_session_id).eq('customer_id',subscription.customer_id).eq('provider','WHOP').maybeSingle());renewal=true;
 }
 if(!error&&checkout&&!checkout.external_reference&&!renewal&&typeof p.checkout_configuration_id==='string'&&/^[-A-Za-z0-9_]{3,200}$/.test(p.checkout_configuration_id)){
  const source=await whopRequest(c,`checkout_configurations/${encodeURIComponent(p.checkout_configuration_id)}`,undefined,undefined,transport);if(source.id!==p.checkout_configuration_id)throw Error('WHOP_CHECKOUT_SOURCE_ID_MISMATCH');checkout=await bindRecoveredWhopCheckout(db,c,checkout,source);
 }
 if(error||!checkout||p.id!==event.providerPaymentId||p.account_id!==c.companyId||p.plan_id!==c.planIds[checkout.product_code]||!renewal&&(p.checkout_configuration_id!==checkout.external_reference||metadata.hashibot_customer_id!==checkout.customer_id||metadata.hashibot_product_code!==checkout.product_code))throw Error('WHOP_SOURCE_LINEAGE_MISMATCH');
 const total=exactWhopMoney(p.total,checkout.currency),tax=p.tax_amount?exactWhopMoney(p.tax_amount,checkout.currency):0;if(total-tax!==Number(checkout.amount_minor))throw Error('WHOP_SOURCE_AMOUNT_MISMATCH');
 const refunded=p.refunded_at||p.refunded_amount&&exactWhopMoney(p.refunded_amount,checkout.currency)>0;
 const disputed=/dispute|resolution/.test(String(p.substatus));
 const status=refunded?'REFUNDED':disputed?'DISPUTED':p.status==='paid'&&p.substatus==='succeeded'&&p.paid_at?'SUCCEEDED':p.status==='failed'?'FAILED':'PENDING';
 let periodEnd:string|null=null;if(p.membership_id){const m=await whopRequest(c,`memberships/${encodeURIComponent(p.membership_id)}`,undefined,undefined,transport);if(m.id!==p.membership_id||m.member_id&&m.member_id!==p.member_id)throw Error('WHOP_MEMBERSHIP_SOURCE_MISMATCH');periodEnd=m.current_period_end??null;}
 return {...event,checkoutId:checkout.id,customerReference:checkout.customer_id,productReference:checkout.product_code,providerCheckoutId:checkout.external_reference,providerSubscriptionId:p.membership_id??null,amountMinor:Number(checkout.amount_minor),currency:checkout.currency,paymentStatus:status,occurredAt:p.paid_at??event.occurredAt,periodEnd,reconciliationRequired:status==='PENDING',caseType:refunded?'REFUND':disputed?'DISPUTE':null,safeEvidence:{source_lookup_confirmed:true,sandbox:c.environment==='sandbox',account_id:c.companyId,plan_id:p.plan_id,member_id:p.member_id??null}};
}
