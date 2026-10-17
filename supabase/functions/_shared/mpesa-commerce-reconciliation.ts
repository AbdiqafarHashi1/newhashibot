import {normalizeMpesaCallback,sha256Hex,type NormalizedCommerceEvent} from './commerce-events.ts';
import type {MpesaAdapter} from './mpesa-adapter.ts';
/** Polling and callbacks converge on the same server-created request identity. */
export async function reconcileMpesaRequest(db:any,adapter:MpesaAdapter,requestId:string,callback?:NormalizedCommerceEvent){
 const {data:attempt,error}=await db.from('commerce_payment_attempts').select('*').eq('provider','MPESA').eq('external_reference',requestId).maybeSingle();
 if(error||!attempt)throw Error('MPESA_SERVER_REQUEST_REQUIRED');
 const {data:checkout,error:readError}=await db.from('commerce_checkout_sessions').select('*').eq('id',attempt.checkout_session_id).eq('provider','MPESA').eq('customer_id',attempt.customer_id).maybeSingle();
 if(readError||!checkout||checkout.external_reference!==requestId||callback&&callback.safeEvidence.merchant_request_id!==attempt.safe_evidence?.merchant_request_id)throw Error('MPESA_REQUEST_LINEAGE_MISMATCH');
 if(callback?.amountMinor!=null&&callback.amountMinor!==Number(checkout.amount_minor))throw Error('MPESA_AMOUNT_MISMATCH');
 const query=await adapter.query(requestId);if(query.state==='PENDING'||query.state==='REVIEW_REQUIRED')return {state:'PENDING',event:null};
 const sandbox=attempt.safe_evidence?.sandbox!==false,event:NormalizedCommerceEvent={schemaVersion:'phase-i/1',provider:'MPESA',providerEventId:requestId,providerEventType:'stk.query',providerPaymentId:requestId,providerCheckoutId:requestId,providerSubscriptionId:null,checkoutId:checkout.id,customerReference:checkout.customer_id,productReference:checkout.product_code,amountMinor:Number(checkout.amount_minor),currency:checkout.currency,paymentStatus:query.state==='SUCCEEDED'?'SUCCEEDED':'FAILED',occurredAt:attempt.requested_at??new Date().toISOString(),verified:true,payloadHash:callback?.payloadHash??await sha256Hex(`MPESA:${requestId}:${query.state}`),reconciliationRequired:false,caseType:null,providerState:String(query.resultCode??query.state),periodStart:null,periodEnd:null,cancelAtPeriodEnd:false,safeEvidence:{status_query_confirmed:true,status_query_result:query.resultCode??null,sandbox}};
 return {state:sandbox?'SANDBOX_VERIFIED':'VERIFIED',event};
}
/** Callback text is a notification only. It cannot choose an account, amount, product or customer. */
export async function reconcileMpesaEvent(db:any,adapter:MpesaAdapter,raw:any,hash?:string){const callback=normalizeMpesaCallback(raw,hash??await sha256Hex(JSON.stringify(raw)));return reconcileMpesaRequest(db,adapter,String(callback.providerCheckoutId),callback)}

/** The URL token proves association with the server's submitted request; it never proves payment success. */
export async function recoverMpesaCallbackBinding(db:any,url:string,raw:any){
 const params=new URL(url).searchParams,checkout=params.get('h_checkout'),token=params.get('h_token');
 if(!checkout&&!token)return; // Earlier known-request callbacks still use their persisted native request ID.
 if(!checkout||!token||token.length<32||token.length>200)throw Error('PRIVATE_CALLBACK_TOKEN_REQUIRED');
 const callback=normalizeMpesaCallback(raw,await sha256Hex(JSON.stringify(raw)));
 const {error}=await db.rpc('bind_mpesa_submission_callback',{p_checkout:checkout,p_token_hash:await sha256Hex(token),p_request:callback.providerCheckoutId,p_merchant:callback.safeEvidence.merchant_request_id});
 if(error)throw Error('PRIVATE_CALLBACK_BINDING_NOT_CONFIRMED');
}
