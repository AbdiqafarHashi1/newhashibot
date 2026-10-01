import assert from 'node:assert/strict';
import { normalizeKenyanPhone, maskPhone, canonicalPrice, paymentMatchesCheckout } from '../../src/lib/phaseICommerce.ts';
import { normalizeMpesaCallback } from '../../supabase/functions/_shared/commerce-events.ts';

assert.equal(normalizeKenyanPhone('0712 345 678'), '+254712345678');
assert.equal(normalizeKenyanPhone('+254 712 345 678'), '+254712345678');
assert.equal(maskPhone('0712345678'), '+254•••••678');
assert.throws(() => normalizeKenyanPhone('1234'), /INVALID_KENYAN_PHONE/);
assert.equal(canonicalPrice('VIP_SIGNALS','KES','MPESA').amount,350000);
assert.throws(()=>paymentMatchesCheckout({amount:120000,currency:'KES',product:'VIP_SIGNALS',customerId:'a'},{amount:350000,currency:'KES',product:'VIP_SIGNALS',customerId:'a'}),/AMOUNT_MISMATCH/);
const callback=normalizeMpesaCallback({Body:{stkCallback:{MerchantRequestID:'m',CheckoutRequestID:'c',ResultCode:1032,CallbackMetadata:{Item:[]}}}},'hash');
assert.equal(callback.paymentStatus,'CANCELLED');
assert.equal(callback.verified,true); // normalization only; webhook persists it unverified until Daraja reconciliation.
console.log('public purchase journey unit contracts passed');
