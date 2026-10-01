import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeKenyanPhone, maskPhone, canonicalPrice, paymentMatchesCheckout } from '../../src/lib/phaseICommerce.ts';
import { normalizeMpesaCallback } from '../../supabase/functions/_shared/commerce-events.ts';
import { getOrCreatePurchaseAttemptKey } from '../../src/lib/purchaseIntent.ts';
import { paymentResultView } from '../../src/lib/paymentResultState.ts';

assert.equal(normalizeKenyanPhone('0712 345 678'), '+254712345678');
assert.equal(normalizeKenyanPhone('+254 712 345 678'), '+254712345678');
assert.equal(maskPhone('0712345678'), '+254•••••678');
assert.throws(() => normalizeKenyanPhone('1234'), /INVALID_KENYAN_PHONE/);
assert.equal(canonicalPrice('VIP_SIGNALS','KES','MPESA').amount,350000);
assert.throws(()=>paymentMatchesCheckout({amount:120000,currency:'KES',product:'VIP_SIGNALS',customerId:'a'},{amount:350000,currency:'KES',product:'VIP_SIGNALS',customerId:'a'}),/AMOUNT_MISMATCH/);
const callback=normalizeMpesaCallback({Body:{stkCallback:{MerchantRequestID:'m',CheckoutRequestID:'c',ResultCode:1032,CallbackMetadata:{Item:[]}}}},'hash');
assert.equal(callback.paymentStatus,'CANCELLED');
assert.equal(callback.verified,true); // normalization only; webhook persists it unverified until Daraja reconciliation.

const values=new Map<string,string>();
const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}};
const first=getOrCreatePurchaseAttemptKey('mpesa.vip.7',storage);
assert.equal(getOrCreatePurchaseAttemptKey('mpesa.vip.7',storage),first,'retry must reuse its attempt key');
assert.notEqual(getOrCreatePurchaseAttemptKey('mpesa.vip.30',storage),first,'a different offer gets a different attempt key');

assert.equal(paymentResultView({checkoutState:'PROVIDER_PENDING',paymentState:'PENDING',hasLineageEntitlement:true}).entitlementActive,false,'an older entitlement cannot activate a pending checkout');
assert.equal(paymentResultView({checkoutState:'FAILED',paymentState:'FAILED',hasLineageEntitlement:true}).entitlementActive,false,'an older entitlement cannot activate a failed checkout');
assert.equal(paymentResultView({checkoutState:'COMPLETED',paymentState:'SUCCEEDED',hasLineageEntitlement:false}).entitlementActive,false,'payment needs its own lineage entitlement');
assert.equal(paymentResultView({checkoutState:'COMPLETED',paymentState:'SUCCEEDED',hasLineageEntitlement:true}).entitlementActive,true);

const layout=readFileSync('src/components/layout/PublicLayout.tsx','utf8');
assert.match(layout,/adminPreviewEnabled && <li>[\s\S]*Admin Bypass \(Temp Pass\)/);
assert.match(layout,/adminPreviewEnabled && <button[\s\S]*Admin Pass \(Bypass\)/);
assert.doesNotMatch(layout,/adminPreviewEnabled && <button\s+onClick=\{handleSignOut\}/);
assert.doesNotMatch(layout,/adminPreviewEnabled && <button\s+onClick=\{handleCopyMpesa\}/);
const pricing=readFileSync('src/pages/public/Pricing.tsx','utf8');
assert.equal((pricing.match(/Select & Pay via M-Pesa/g)??[]).length,1,'only VIP may advertise M-Pesa purchase');
assert.doesNotMatch(pricing,/Account activation follows manual payment verification|15–30 minutes/);
const resultPage=readFileSync('src/pages/public/PaymentResult.tsx','utf8');
assert.match(resultPage,/\.eq\('source_payment_id',payment\.id\)/);
console.log('public purchase journey unit contracts passed');
