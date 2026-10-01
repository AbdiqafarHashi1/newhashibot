export type PaymentResultView = { title:string; body:string; tone:'waiting'|'warning'|'success'; entitlementActive:boolean };

export function paymentResultView(input:{checkoutState?:string;paymentState?:string;hasLineageEntitlement:boolean}):PaymentResultView {
  const {checkoutState,paymentState,hasLineageEntitlement}=input;
  const active=checkoutState==='COMPLETED'&&paymentState==='SUCCEEDED'&&hasLineageEntitlement;
  if(active)return {title:'Access is active',body:'Your payment and matching entitlement are verified. You can now connect Telegram; admission is confirmed separately after Telegram completes membership.',tone:'success',entitlementActive:true};
  if(paymentState==='SUCCEEDED'&&checkoutState==='COMPLETED')return {title:'Payment verified',body:'This checkout’s payment is verified. We are still preparing its matching access entitlement; Telegram access is not active yet.',tone:'waiting',entitlementActive:false};
  if(paymentState==='FAILED'||paymentState==='CANCELLED')return {title:'Payment was declined or cancelled',body:'No access was granted for this checkout. You can return to the offer page and try again.',tone:'warning',entitlementActive:false};
  if(paymentState==='EXPIRED'||checkoutState==='EXPIRED')return {title:'Payment request timed out',body:'No access was granted for this checkout. A later provider confirmation will be reconciled safely; do not pay twice unless instructed.',tone:'warning',entitlementActive:false};
  if(paymentState==='REVIEW_REQUIRED'||checkoutState==='REVIEW_REQUIRED')return {title:'Payment needs review',body:'We received evidence that could not be matched safely to this checkout. Access remains locked while support reviews it.',tone:'warning',entitlementActive:false};
  if(checkoutState==='ACTION_REQUIRED')return {title:'Check your phone',body:'An M-Pesa prompt was sent. Enter your PIN only in the prompt on your phone. We are awaiting provider confirmation.',tone:'waiting',entitlementActive:false};
  if(checkoutState==='PROVIDER_PENDING'||paymentState==='PENDING')return {title:'Awaiting payment confirmation',body:'The payment provider has not yet confirmed this checkout. This page will not activate access from a redirect or an older entitlement.',tone:'waiting',entitlementActive:false};
  return {title:'Checkout created',body:'Your checkout exists, but a payment prompt or secure payment page has not yet been confirmed.',tone:'waiting',entitlementActive:false};
}
