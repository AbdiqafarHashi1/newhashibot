import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {accountSchema} from './support/accountSchema.mjs';import {commerceSchema} from './support/commerceSchema.mjs';
test('private M-Pesa callback recovers only its original uncertain submission; late acknowledgement cannot downgrade paid access',async()=>{
 const db=new PGlite(),customer='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64);
 try{await db.exec(accountSchema);await commerceSchema(db);await db.exec(await readFile('supabase/migrations/20261017011709_commerce_connection_console.sql','utf8'));
 const checkout=(await db.query("insert into commerce_checkout_sessions(customer_id,product_code,provider,currency,amount_minor,price_version,idempotency_key,status,safe_return_url,expires_at) values($1,'VIP_SIGNALS','MPESA','KES',350000,1,'fixture','REVIEW_REQUIRED','https://hashibot.app/payment/result',now()+interval '1 hour') returning id",[customer])).rows[0].id;
 const attempt=(await db.query("insert into commerce_payment_attempts(checkout_session_id,customer_id,provider,amount_minor,currency,state,provider_state,idempotency_key,safe_evidence) values($1,$2,'MPESA',350000,'KES','REVIEW_REQUIRED','SUBMISSION_UNCERTAIN','fixture',$3) returning id",[checkout,customer,JSON.stringify({callback_token_hash:hash,sandbox:false})])).rows[0].id;
 const bind=(token=hash,request='ws_CO_original')=>db.query("select bind_mpesa_submission_callback($1,$2,$3,'merchant') value",[checkout,token,request]);
 await assert.rejects(bind('b'.repeat(64)),/PRIVATE_CALLBACK/);assert.equal((await db.query('select external_reference from commerce_payment_attempts')).rows[0].external_reference,null);
 assert.equal((await bind()).rows[0].value.state,'BOUND_SOURCE_QUERY_REQUIRED');let row=(await db.query('select * from commerce_payment_attempts')).rows[0];assert.equal(row.state,'PENDING');assert.equal(row.safe_evidence.sandbox,false);assert.equal((await db.query('select count(*)::int n from phase_h_entitlements')).rows[0].n,0);
 await assert.rejects(bind(hash,'ws_CO_different'),/CONFLICT/);
 await db.exec("update commerce_payment_attempts set state='SUCCEEDED',provider_state='0',access_applied_at=now();update commerce_checkout_sessions set status='COMPLETED'");await bind();
 const ack=await db.query("select acknowledge_mpesa_submission($1,$2,'ws_CO_original','merchant') value",[checkout,attempt]);assert.equal(ack.rows[0].value.state,'PAYMENT_ALREADY_RECORDED');assert.equal((await db.query('select state from commerce_payment_attempts')).rows[0].state,'SUCCEEDED');assert.equal((await db.query('select status from commerce_checkout_sessions')).rows[0].status,'COMPLETED');
 await db.exec('set role authenticated');await assert.rejects(bind(),/permission denied/);
 }finally{await db.close()}
});
