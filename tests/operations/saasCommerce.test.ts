import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWhopRuntimeCheckout,exactWhopMoney,verifyWhopRuntimeEvent,whopRuntimeConfig} from '../../supabase/functions/_shared/whop-runtime';
import {DarajaMpesaAdapter,mpesaConfigurationState} from '../../supabase/functions/_shared/mpesa-adapter';
import {reconcileMpesaEvent} from '../../supabase/functions/_shared/mpesa-commerce-reconciliation';
import {measuredRuntimeConfiguration} from '../../supabase/functions/_shared/measured-strategy-runtime';
import {evaluateReplayOutcome,DEFAULT_REPLAY_ASSUMPTIONS} from '../../supabase/functions/_shared/replay-outcomes';
const config={apiKey:'fixture',companyId:'biz_1',webhookSecret:'fixture',environment:'sandbox' as const,planIds:{VIP_SIGNALS:'plan_1'}};
const checkout={id:'checkout',customer_id:'customer',product_code:'VIP_SIGNALS',currency:'USD',amount_minor:2900,safe_return_url:'https://hashibot.app/payment/result',external_reference:'ch_1'};
test('Whop validates the account/plan/price and creates a canonical checkout with an idempotency key',async()=>{
 const calls:any[]=[];const transport=async(url:any,init:any)=>{calls.push({url,init});return Response.json(calls.length===1?{id:'plan_1',account:{id:'biz_1'},currency:'usd',initial_price:29,renewal_price:29,trial_period_days:0,plan_type:'renewal',billing_period:30}:{id:'ch_1',purchase_url:'https://sandbox.whop.com/checkout/plan_1'})};
 const result=await createWhopRuntimeCheckout(config,checkout,transport as typeof fetch);assert.equal(result.externalReference,'ch_1');assert.equal(calls[1].init.headers['Idempotency-Key'],'hashibot:checkout');assert.equal(JSON.parse(calls[1].init.body).metadata.hashibot_customer_id,'customer');
 assert.equal(whopRuntimeConfig(()=>undefined),null);assert.equal(exactWhopMoney({amount:'29.00',currency:'usd',decimals:2},'USD'),2900);assert.throws(()=>exactWhopMoney({amount:29,currency:'usd',decimals:2},'USD'));
 await assert.rejects(createWhopRuntimeCheckout(config,checkout,(async()=>Response.json({id:'plan_1',account:{id:'someone-else'}})) as typeof fetch),/MISMATCH/);
});
test('Whop payment source lookup rejects cross-customer evidence and retains sandbox classification',async()=>{
 const db={from(){const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:checkout})};return q}};
 const p={id:'pay_1',account_id:'biz_1',plan_id:'plan_1',checkout_configuration_id:'ch_1',metadata:{hashibot_checkout_id:'checkout',hashibot_customer_id:'customer',hashibot_product_code:'VIP_SIGNALS'},total:{amount:'29.00',currency:'usd',decimals:2},status:'paid',substatus:'succeeded',paid_at:'2026-10-16T20:00:00Z'};
 const event:any={providerPaymentId:'pay_1',occurredAt:'2026-10-16T20:00:00Z'};
 const verified=await verifyWhopRuntimeEvent(db,config,event,(async()=>Response.json(p)) as typeof fetch);assert.equal(verified.paymentStatus,'SUCCEEDED');assert.equal(verified.safeEvidence.sandbox,true);
 await assert.rejects(verifyWhopRuntimeEvent(db,config,event,(async()=>Response.json({...p,metadata:{...p.metadata,hashibot_customer_id:'other'}})) as typeof fetch),/LINEAGE/);
 const refunded=await verifyWhopRuntimeEvent(db,config,event,(async()=>Response.json({...p,refunded_at:'2026-10-17T00:00:00Z'})) as typeof fetch);assert.equal(refunded.paymentStatus,'REFUNDED');
});
test('Daraja Till requests use explicit Buy Goods destination, bounded reference and missing query result stays pending',async()=>{
 const prior=globalThis.fetch;const calls:any[]=[];globalThis.fetch=(async(url:any,init:any)=>{calls.push({url,body:init?.body?JSON.parse(init.body):null});return Response.json(String(url).includes('oauth')?{access_token:'fixture'}:String(url).includes('stkpushquery')?{}:{ResponseCode:'0',MerchantRequestID:'merchant',CheckoutRequestID:'request'})}) as typeof fetch;
 try{const c={consumerKey:'fixture',consumerSecret:'fixture',shortCode:'123456',passkey:'fixture',callbackUrl:'https://example.test/callback',environment:'sandbox' as const,transactionType:'CustomerBuyGoodsOnline' as const,partyB:'654321'};
 const adapter=new DarajaMpesaAdapter(c);await adapter.createStkRequest({checkoutId:'11111111-1111-4111-8111-111111111111',phone:'0712345678',amountKes:3500});const sent=calls.find(x=>x.body?.Amount);assert.equal(sent.body.TransactionType,'CustomerBuyGoodsOnline');assert.equal(sent.body.PartyB,'654321');assert.equal(sent.body.AccountReference.length,12);assert.equal((await adapter.query('request')).state,'PENDING');assert.equal(mpesaConfigurationState({...c,partyB:undefined}),'READY_FOR_CONFIGURATION');await assert.rejects(adapter.createStkRequest({checkoutId:'x',phone:'0712345678',amountKes:1.2}),/WHOLE_SHILLING/);
 }finally{globalThis.fetch=prior}
});
test('unsigned M-Pesa callbacks cannot choose customer/product or grant access without the actual request query',async()=>{
 const attempt={checkout_session_id:'checkout',customer_id:'customer',external_reference:'request',safe_evidence:{merchant_request_id:'merchant',sandbox:false}},co={...checkout,provider:'MPESA',external_reference:'request',currency:'KES',amount_minor:350000};
 const db={from(table:string){const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='commerce_payment_attempts'?attempt:co})};return q}};
 const raw={Body:{stkCallback:{MerchantRequestID:'merchant',CheckoutRequestID:'request',ResultCode:0,CallbackMetadata:{Item:[{Name:'Amount',Value:3500},{Name:'AccountReference',Value:'attacker-customer'}]}}}};
 let queried=0;const adapter:any={query:async()=>{queried++;return{state:'PENDING'}}};assert.equal((await reconcileMpesaEvent(db,adapter,raw)).event,null);assert.equal(queried,1);
 adapter.query=async()=>({state:'SUCCEEDED',resultCode:0});const result=await reconcileMpesaEvent(db,adapter,raw);assert.equal(result.event!.customerReference,'customer');assert.equal(result.event!.checkoutId,'checkout');assert.equal(result.event!.providerPaymentId,'request');
 await assert.rejects(reconcileMpesaEvent(db,adapter,{Body:{stkCallback:{...raw.Body.stkCallback,MerchantRequestID:'forged'}}}),/LINEAGE/);
});
test('scanner uses frozen measured parameters and blocks missing approval or changed grade',()=>{
 const current={enabled:true,min_score:1,params:{stopAtr:99}},release={id:'release',strategy_id:'crypto.micro-scalper',state:'PROMOTED',immutable_configuration:{minSignalGrade:'A',strategies:[{id:'crypto.micro-scalper',enabled:true,minScore:82,minRiskReward:1.5,maxBarsInTrade:24,symbols:['BTCUSDT'],timeframes:['15m'],parameters:{stopAtr:1.4}}]}};
 assert.equal(measuredRuntimeConfiguration('MicroScalper',current,[],'A').enabled,false);assert.equal(measuredRuntimeConfiguration('MicroScalper',current,[release],'B').enabled,false);const active=measuredRuntimeConfiguration('MicroScalper',current,[release],'A');assert.equal(active.min_score,82);assert.equal(active.params.stopAtr,1.4);assert.equal(current.params.stopAtr,99);
});
test('historical stop fills include adverse opening gaps instead of assuming the original stop price',()=>{
 const candidate:any={id:'candidate',strategyId:'strategy',symbol:'BTCUSDT',timeframe:'15m',side:'buy',stop:95,targets:[110,120]};
 const candles:any=[{open_time:'2026-10-01T00:00:00Z',open:100,high:104,low:99,close:102},{open_time:'2026-10-01T00:15:00Z',open:90,high:94,low:88,close:91}];
 const result=evaluateReplayOutcome(candidate,candles,'2026-10-01T00:00:00Z',DEFAULT_REPLAY_ASSUMPTIONS)!;assert.equal(result.exitPrice,90);assert.equal(result.netR,-2);
});
