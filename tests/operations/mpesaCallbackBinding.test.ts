import {test} from 'node:test';import assert from 'node:assert/strict';import {recoverMpesaCallbackBinding} from '../../supabase/functions/_shared/mpesa-commerce-reconciliation';import {sha256Hex} from '../../supabase/functions/_shared/commerce-events';
test('M-Pesa uncertain-request recovery sends only a private token hash to its atomic authority and never trusts callback account references',async()=>{
 const token='random-private-token-which-is-long-enough';let saved:any;const db={rpc:async(name:string,args:any)=>{saved={name,args};return{data:{state:'BOUND_SOURCE_QUERY_REQUIRED'}}}};
 const raw={Body:{stkCallback:{MerchantRequestID:'merchant',CheckoutRequestID:'ws_CO_original',ResultCode:0,CallbackMetadata:{Item:[{Name:'AccountReference',Value:'attacker'}]}}}};
 await recoverMpesaCallbackBinding(db,`https://fixture.supabase.co/functions/v1/mpesa-webhook?h_checkout=known-checkout&h_token=${token}`,raw);assert.equal(saved.name,'bind_mpesa_submission_callback');assert.equal(saved.args.p_checkout,'known-checkout');assert.equal(saved.args.p_token_hash,await sha256Hex(token));assert.equal(JSON.stringify(saved).includes(token),false);assert.equal(JSON.stringify(saved).includes('attacker'),false);
 await assert.rejects(recoverMpesaCallbackBinding(db,'https://fixture.supabase.co/functions/v1/mpesa-webhook?h_checkout=known-checkout&h_token=guess',raw),/TOKEN_REQUIRED/);
});
