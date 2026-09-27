export type Provider = "WHOP" | "MPESA";
export type NormalizedPaymentStatus = "PENDING"|"SUCCEEDED"|"FAILED"|"CANCEL_AT_PERIOD_END"|"CANCELLED"|"EXPIRED"|"REFUNDED"|"PARTIALLY_REFUNDED"|"DISPUTED"|"CHARGEBACK"|"REVERSED";
export interface NormalizedCommerceEvent {
  schemaVersion:"phase-i/1"; provider:Provider; providerEventId:string; providerEventType:string;
  providerPaymentId:string|null; providerCheckoutId:string|null; providerSubscriptionId:string|null;
  checkoutId:string|null; customerReference:string|null; productReference:string|null;
  amountMinor:number|null; currency:string|null; paymentStatus:NormalizedPaymentStatus;
  occurredAt:string; verified:true; payloadHash:string; reconciliationRequired:boolean;
  caseType:"REFUND"|"PARTIAL_REFUND"|"DISPUTE"|"CHARGEBACK"|"REVERSAL"|null;
  providerState:string|null; periodStart:string|null; periodEnd:string|null; cancelAtPeriodEnd:boolean;
  safeEvidence:Record<string,string|number|boolean|null>;
}
const text=(v:unknown)=>typeof v==="string"&&v.trim()?v.trim():null;
const record=(v:unknown):Record<string,any>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};
const amountMinor=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:null;
export function normalizeWhopCommerceEvent(event:{id:string;type:string;timestamp:string;data:Record<string,unknown>},payloadHash:string):NormalizedCommerceEvent {
 const d=record(event.data),p=record(d.payment),m=record(d.membership??p.membership),meta=record(d.metadata??p.metadata??m.metadata); const type=event.type;
 const states:Record<string,NormalizedPaymentStatus>={"payment.succeeded":"SUCCEEDED","payment.failed":"FAILED","payment.pending":"PENDING","membership.activated":"SUCCEEDED","membership.cancel_at_period_end_changed":"CANCEL_AT_PERIOD_END","membership.deactivated":"CANCELLED","refund.created":"REFUNDED","refund.updated":"REFUNDED","dispute.created":"DISPUTED","dispute.updated":"DISPUTED"};
 const status=states[type]; if(!status)throw new Error("UNSUPPORTED_EVENT_TYPE");
 const cents=amountMinor(d.amount_minor??d.amount_cents??p.amount_minor??p.amount_cents); const currency=text(d.currency??p.currency)?.toUpperCase()??null;
 return {schemaVersion:"phase-i/1",provider:"WHOP",providerEventId:event.id,providerEventType:type,providerPaymentId:text(type.startsWith("payment.")?d.id:p.id),providerCheckoutId:text(meta.checkout_reference??d.checkout_id),providerSubscriptionId:text(type.startsWith("membership.")?d.id:d.membership_id??m.id),checkoutId:text(meta.hashibot_checkout_id),customerReference:text(meta.hashibot_customer_id),productReference:text(meta.hashibot_product_code),amountMinor:cents,currency,paymentStatus:status,occurredAt:event.timestamp,verified:true,payloadHash,reconciliationRequired:status==="SUCCEEDED"&&(!cents||!currency),caseType:type.startsWith("refund.")?"REFUND":type.startsWith("dispute.")?"DISPUTE":null,providerState:text(d.status),periodStart:text(d.current_period_start??d.created_at),periodEnd:text(d.current_period_end),cancelAtPeriodEnd:Boolean(d.cancel_at_period_end),safeEvidence:{object_id:text(d.id),billing_reason:text(d.billing_reason)}};
}
export function normalizeMpesaCallback(payload:Record<string,unknown>,payloadHash:string):NormalizedCommerceEvent {
 const body=record(record(payload.Body).stkCallback??payload),metadata=Array.isArray(record(body.CallbackMetadata).Item)?record(body.CallbackMetadata).Item:[];
 const value=(name:string)=>metadata.find((x:any)=>x?.Name===name)?.Value; const result=Number(body.ResultCode); const checkout=text(body.CheckoutRequestID),merchant=text(body.MerchantRequestID),account=text(value("AccountReference")??payload.account_reference);
 if(!checkout||!merchant||!Number.isInteger(result))throw new Error("AMBIGUOUS_MPESA_CALLBACK");
 const amount=value("Amount"); return {schemaVersion:"phase-i/1",provider:"MPESA",providerEventId:text(payload.event_id)??checkout,providerEventType:"stk.callback",providerPaymentId:text(value("MpesaReceiptNumber")),providerCheckoutId:checkout,providerSubscriptionId:null,checkoutId:account,customerReference:null,productReference:null,amountMinor:typeof amount==="number"?Math.round(amount*100):null,currency:"KES",paymentStatus:result===0?"SUCCEEDED":result===1032?"CANCELLED":result===1037?"EXPIRED":"FAILED",occurredAt:new Date().toISOString(),verified:true,payloadHash,reconciliationRequired:result===0&&(!amount||!account),caseType:null,providerState:String(result),periodStart:null,periodEnd:null,cancelAtPeriodEnd:false,safeEvidence:{merchant_request_id:merchant,checkout_request_id:checkout,result_code:result,receipt_present:Boolean(value("MpesaReceiptNumber"))}};
}
export async function sha256Hex(raw:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw)))).map(x=>x.toString(16).padStart(2,"0")).join("");}
