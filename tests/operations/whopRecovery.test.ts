import {test} from 'node:test';import assert from 'node:assert/strict';import {recoverWhopPayments} from '../../supabase/functions/_shared/whop-payment-recovery';
const config={apiKey:'fixture',companyId:'biz_fixture',webhookSecret:'fixture',environment:'production' as const,planIds:{VIP_SIGNALS:'plan_fixture'}};
function fixture(fail=false){const writes:any[]=[];const checkout={id:'checkout',customer_id:'customer',product_code:'VIP_SIGNALS',currency:'USD',amount_minor:2900,external_reference:'ch_fixture'};
 const db={from(table:string){const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='commerce_reconciliation_cursors'?{cursor:{watermark:0}}:checkout}),insert:async(row:any)=>{writes.push({table,row});return{error:fail?{message:'offline'}:null}},upsert:async(row:any)=>{writes.push({table,row});return{error:null}}};return q}};
 const transport=(async(url:any)=>Response.json(String(url).includes('payments?')?{data:[{id:'pay_fixture'}],page_info:{has_next_page:false}}:{id:'pay_fixture',account_id:'biz_fixture',plan_id:'plan_fixture',checkout_configuration_id:'ch_fixture',metadata:{hashibot_checkout_id:'checkout',hashibot_customer_id:'customer',hashibot_product_code:'VIP_SIGNALS'},total:{amount:'29.00',currency:'usd',decimals:2},status:'paid',substatus:'succeeded',paid_at:'2026-10-17T00:00:00Z'})) as typeof fetch;
 return{db,writes,transport};}
test('Whop source polling recovers a paid purchase without a webhook and advances only after durable evidence',async()=>{
 const f=fixture();const result=await recoverWhopPayments(f.db,config,f.transport,Date.parse('2026-10-17T01:00:00Z'));assert.equal(result[0].state,'SUCCEEDED');assert.equal(f.writes[0].table,'commerce_payment_events');assert.equal(f.writes[0].row.normalized_event.customerReference,'customer');assert.equal(f.writes[1].table,'commerce_reconciliation_cursors');
 const failed=fixture(true);await assert.rejects(recoverWhopPayments(failed.db,config,failed.transport),/INBOX_WRITE/);assert.equal(failed.writes.some(w=>w.table==='commerce_reconciliation_cursors'),false);
});

test('current membership payment rechecks persist source evidence before moving the round-robin cursor',async()=>{
 const {recheckWhopMembershipPayments}=await import('../../supabase/functions/_shared/whop-payment-recovery');
 for(const fail of [false,true]){
  const f=fixture(fail);const base=f.db.from.bind(f.db);let cursor:any;
  const db={from(table:string){if(table==='commerce_subscriptions'){const q:any={eq:()=>q,in:()=>q,not:()=>q,order:()=>q,limit:()=>q,gt:()=>q,select:()=>q,then:(resolve:any)=>Promise.resolve({data:[{id:'subscription',last_verified_payment_id:'attempt'}]}).then(resolve)};return q}
   if(table==='commerce_payment_attempts'){const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{external_reference:'pay_fixture'}})};return q}
   if(table==='commerce_reconciliation_cursors'){const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null}),upsert:async(row:any)=>{cursor=row;return{error:null}}};return q}return base(table)}};
  if(fail){await assert.rejects(recheckWhopMembershipPayments(db,config,f.transport),/INBOX_WRITE/);assert.equal(cursor,undefined)}else{const result=await recheckWhopMembershipPayments(db,config,f.transport);assert.equal(result[0].state,'SUCCEEDED');assert.equal(f.writes[0].row.external_event_id,'recheck:pay_fixture:SUCCEEDED');assert.equal(cursor.cursor.after,'subscription')}
 }
});
