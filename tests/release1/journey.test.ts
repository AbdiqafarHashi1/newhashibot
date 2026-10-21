import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {accountSchema} from '../operations/support/accountSchema.mjs';
import {commerceSchema} from '../operations/support/commerceSchema.mjs';
import {DarajaMpesaAdapter} from '../../supabase/functions/_shared/mpesa-adapter.ts';
import {reconcileMpesaEvent} from '../../supabase/functions/_shared/mpesa-commerce-reconciliation.ts';
import {handleTelegramJoinRequest} from '../../supabase/functions/_shared/telegram-join-request.ts';
import {processTelegramFulfillmentJobs} from '../../supabase/functions/_shared/telegram-fulfillment-worker.ts';
import {release1SaleDecision} from '../../supabase/functions/_shared/release1-sales-policy.ts';
const db=new PGlite(),customer='11111111-1111-4111-8111-111111111111';
// Supabase-shaped adapter over real isolated SQL. No provider or production credentials are used.
class Query {
 filters:string[]=[];values:any[]=[];operation='select';patch:any;conflict='';columns='*';
 constructor(public table:string){if(!/^[a-z_]+$/.test(table))throw Error('INVALID_TABLE')}
 select(cols='*'){this.columns=cols;return this} eq(k:string,v:any){this.values.push(v);this.filters.push(`"${k}"=$${this.values.length}`);return this} in(k:string,v:any[]){this.values.push(v);this.filters.push(`"${k}"=any($${this.values.length})`);return this}
 not(k:string,_op:string,v:any){this.filters.push(`"${k}" is not null`);return this} lte(k:string,v:any){this.values.push(v);this.filters.push(`"${k}"<=$${this.values.length}`);return this} gt(k:string,v:any){this.values.push(v);this.filters.push(`"${k}">$${this.values.length}`);return this} order(){return this} limit(){return this} update(p:any){this.operation='update';this.patch=p;return this} upsert(p:any,c:any){this.operation='upsert';this.patch=p;this.conflict=c.onConflict;return this}
 async execute(){try{let sql:string,args=this.values;const where=this.filters.length?' where '+this.filters.join(' and '):'';
 if(this.operation==='select')sql=`select ${this.columns} from ${this.table}${where}`;
 else if(this.operation==='update'){const entries=Object.entries(this.patch);args=[...this.values,...entries.map(([,v])=>v)];sql=`update ${this.table} set ${entries.map(([k],i)=>`"${k}"=$${this.values.length+i+1}`).join(',')}${where}`;}
 else{const entries=Object.entries(this.patch);args=entries.map(([,v])=>v);sql=`insert into ${this.table}(${entries.map(([k])=>`"${k}"`).join(',')}) values(${args.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(${this.conflict}) do update set ${entries.map(([k])=>`"${k}"=excluded."${k}"`).join(',')}`;}
 const result=await db.query(sql,args);return {data:result.rows,error:null};}catch(error){return {data:null,error:{message:String(error)}}}}
 async maybeSingle(){const r=await this.execute();return {...r,data:r.data?.[0]??null}}single(){return this.maybeSingle()}then(a:any,b:any){return this.execute().then(a,b)}
}
const apiDb={from:(table:string)=>new Query(table),rpc:async(name:string,args:any)=>{
 if(name==='has_product_entitlement'){const result=await db.query('select has_product_entitlement($1,$2,$3) active',[args.p_user_id,args.p_product_slug,args.p_at]);return{data:result.rows[0].active,error:null};}
 if(name!=='claim_telegram_fulfillment')throw Error(name);
 const rows=await db.query("with selected as(select id from telegram_fulfillment_requests where status='PENDING' order by created_at limit $1) update telegram_fulfillment_requests set status='CLAIMED',claim_token=gen_random_uuid(),attempt_count=attempt_count+1 where id in(select id from selected) returning *",[args.p_limit]);return {data:rows.rows,error:null};
}};
const calls:any[]=[],members=new Map<number,string>();
const telegram=async(_token:string,method:string,body:any)=>{calls.push({method,body});if(method==='getChatMember')return {status:members.get(Number(body.user_id))??'left'};if(method==='createChatInviteLink'){assert.equal(body.creates_join_request,true);assert.equal(body.member_limit,undefined);return {invite_link:'https://t.me/+fixture'}}if(method==='approveChatJoinRequest')members.set(body.user_id,'member');if(method==='banChatMember')members.set(Number(body.user_id),'kicked');if(method==='unbanChatMember')members.set(Number(body.user_id),'left');return true};
try {
 await db.exec(accountSchema);await commerceSchema(db);
 await db.exec(`create table telegram_links(id uuid primary key default gen_random_uuid(),user_id uuid,telegram_user_id bigint,telegram_username text,telegram_display_name text,status text,product_slug text,access_state text,updated_at timestamptz default now());
 create table telegram_onboarding_tokens(id uuid primary key default gen_random_uuid(),user_id uuid,product_slug text,token_hash text,expires_at timestamptz,used_at timestamptz,replaced_at timestamptz,created_at timestamptz default now());
 create table telegram_audience_configuration(audience text primary key,product_code text,chat_id text,enabled boolean,bot_permission_verified_at timestamptz,join_mode text);
 create table telegram_memberships(id uuid primary key default gen_random_uuid(),customer_id uuid,telegram_link_id uuid,audience text,state text,telegram_status text,last_verified_at timestamptz,last_provider_classification text,safe_error text,updated_at timestamptz,unique(customer_id,audience));
 alter table telegram_fulfillment_requests add available_at timestamptz default now(),add claim_token uuid,add completed_at timestamptz,add provider_classification text,add evidence jsonb,add max_attempts int default 6,add entitlement_version timestamptz;
 alter table telegram_fulfillment_requests drop constraint telegram_fulfillment_requests_status_check;
 create table signal_publication_work(id uuid primary key,signal_id uuid,entity_type text,entity_id uuid,event_type text,event_version integer,destination text,customer_id uuid,event_key text unique,status text,lease_token uuid,lease_expires_at timestamptz);
 create table canonical_lifecycle_events(id uuid primary key default gen_random_uuid(),event_key text,event_type text,event_version integer,signal_id uuid,execution_id uuid,customer_id uuid,account_id uuid,occurred_at timestamptz,payload jsonb,content_hash text);
 create table canonical_telegram_delivery_parts(id uuid primary key default gen_random_uuid(),publication_work_id uuid,message_identity text unique,message_part integer,state text,attempt_count integer,operation text,edited_from_message_id text,telegram_message_id text,updated_at timestamptz);
 insert into telegram_audience_configuration values('VIP','VIP_SIGNALS','-1001',true,now(),'JOIN_REQUEST');
 insert into commerce_product_prices(product_code,currency,amount_minor,billing_interval,provider,version,fixed_period_days) values('VIP_SIGNALS','KES',350000,'fixed_period','MPESA',1,30);`);
 const j=await readFile('supabase/migrations/20260928180000_phase_j_telegram_membership.sql','utf8');const start=j.indexOf('create or replace function public.consume_telegram_link_token('),end=j.indexOf('\ncreate or replace function public.claim_telegram_fulfillment',start);await db.exec(j.slice(start,end));
 await db.exec(await readFile('supabase/migrations/20261021053541_release1_publication_membership_recovery.sql','utf8'));
 const buy=async(id:string)=>{const co=(await db.query("insert into commerce_checkout_sessions(customer_id,product_code,provider,currency,amount_minor,price_version,idempotency_key,status,safe_return_url,expires_at,external_reference) values($1,'VIP_SIGNALS','MPESA','KES',350000,1,$2,'PROVIDER_PENDING','https://hashibot.app/payment/result',now()+interval '1 hour',$2) returning id",[customer,id])).rows[0].id;
 await db.query("insert into commerce_payment_attempts(checkout_session_id,customer_id,provider,amount_minor,currency,state,provider_state,idempotency_key,external_reference,safe_evidence) values($1,$2,'MPESA',350000,'KES','PENDING','STK_SENT',$3,$3,$4)",[co,customer,id,JSON.stringify({merchant_request_id:'merchant-'+id,sandbox:false})]);return co;};
 const checkout=await buy('request1');assert.equal((await db.query('select count(*)::int n from phase_h_entitlements')).rows[0].n,0,'Pending checkout cannot grant access');
 const originalFetch=globalThis.fetch;globalThis.fetch=async(url:any)=>new Response(JSON.stringify(String(url).includes('oauth')?{access_token:'mock-only'}:{CheckoutRequestID:'request1',ResultCode:0}),{status:200,headers:{'Content-Type':'application/json'}});
 let event:any;try{const adapter=new DarajaMpesaAdapter({consumerKey:'mock',consumerSecret:'mock',shortCode:'123456',passkey:'mock',callbackUrl:'https://example.org/callback',environment:'production',transactionType:'CustomerBuyGoodsOnline',partyB:'654321'});const callback={Body:{stkCallback:{MerchantRequestID:'merchant-request1',CheckoutRequestID:'request1',ResultCode:0,CallbackMetadata:{Item:[{Name:'Amount',Value:3500},{Name:'MpesaReceiptNumber',Value:'RECEIPT1'},{Name:'PhoneNumber',Value:254711111111}]}}}};
 const wrong=structuredClone(callback);wrong.Body.stkCallback.CallbackMetadata.Item[0].Value=1;await assert.rejects(reconcileMpesaEvent(apiDb,adapter,wrong),/AMOUNT_MISMATCH/);event=(await reconcileMpesaEvent(apiDb,adapter,callback)).event;assert(event?.verified);}
 finally{globalThis.fetch=originalFetch}
 const process=async(e:any,id:string)=>{await db.query("insert into commerce_payment_events(provider,external_event_id,event_type,signature_verified,processing_state,payload_hash,normalized_event) values('MPESA',$1,'fixture',true,'RECEIVED','hash',$2)",[id,JSON.stringify({...e,providerEventId:id})]);return(await db.query("select process_canonical_commerce_event('MPESA',$1) result",[id])).rows[0].result};
 await process(event,'payment1');const entitlement=(await db.query("select * from phase_h_entitlements where customer_id=$1",[customer])).rows[0];assert.equal(entitlement.state,'ACTIVE');
 assert.equal((await process(event,'duplicate')).state,'DUPLICATE_PAYMENT');assert.equal((await db.query('select count(*)::int n from phase_h_entitlements')).rows[0].n,1);
 await db.query("insert into telegram_onboarding_tokens(user_id,token_hash,expires_at) values($1,'token-hash',now()+interval '10 minutes')",[customer]);
 await db.query("select consume_telegram_link_token('token-hash',7001,'fixture','Fixture')");await assert.rejects(db.query("select consume_telegram_link_token('token-hash',7002,'wrong','Wrong')"),/TOKEN_INVALID_OR_REPLAYED/);
 let run=await processTelegramFulfillmentJobs(apiDb,'mock-token',telegram);assert(run.results.some(x=>x.state==='ACTION_REQUIRED'));
 const join=(user:number)=>handleTelegramJoinRequest(apiDb,{from:{id:user},chat:{id:-1001}},(method,body)=>telegram('mock-token',method,body));
 assert.equal((await join(7002)).state,'DECLINED_NO_ACTIVE_ENTITLEMENT');assert.equal(members.get(7002),undefined);assert.equal((await join(7001)).state,'ACTIVE');
 assert.equal((await db.query('select state from telegram_memberships')).rows[0].state,'ACTIVE');
 // Renewal uses a distinct server request/payment identity and extends the existing entitlement.
 const renewal=await buy('request2');await process({...event,checkoutId:renewal,providerCheckoutId:'request2',providerPaymentId:'request2'},'renewal');const renewed=(await db.query('select * from phase_h_entitlements')).rows[0];assert(new Date(renewed.valid_until).getTime()>new Date(entitlement.valid_until).getTime());
 await db.query("update phase_h_entitlements set valid_until=now()-interval '1 second'");await db.query('select reconcile_release1_vip_memberships()');run=await processTelegramFulfillmentJobs(apiDb,'mock-token',telegram);assert(run.results.some(x=>x.state==='COMPLETED'));assert.equal(members.get(7001),'left');assert.equal((await join(7001)).state,'DECLINED_NO_ACTIVE_ENTITLEMENT');
 // The same native processor handles Whop; no redirect or client success grants access.
 const international='44444444-4444-4444-8444-444444444444';await db.query('insert into auth.users(id) values($1)',[international]);
 await db.query("insert into commerce_product_prices(product_code,currency,amount_minor,billing_interval,provider,version,fixed_period_days) values('VIP_SIGNALS','USD',2900,'monthly','WHOP',1,30)");
 const whopCheckout=(await db.query("insert into commerce_checkout_sessions(customer_id,product_code,provider,currency,amount_minor,price_version,idempotency_key,status,safe_return_url,expires_at,external_reference) values($1,'VIP_SIGNALS','WHOP','USD',2900,1,'whop','PROVIDER_PENDING','https://hashibot.app/payment/result',now()+interval '1 hour','cfg_whop') returning id",[international])).rows[0].id;
 const whopEvent={...event,provider:'WHOP',checkoutId:whopCheckout,customerReference:international,productReference:'VIP_SIGNALS',providerPaymentId:'pay_whop',providerCheckoutId:'cfg_whop',providerSubscriptionId:'mem_whop',periodEnd:new Date(Date.now()+30*86400000).toISOString(),amountMinor:2900,currency:'USD',occurredAt:new Date().toISOString(),safeEvidence:{source_lookup_confirmed:true,sandbox:false}};
 const whopProcess=async(patch:any,id:string)=>{await db.query("insert into commerce_payment_events(provider,external_event_id,event_type,signature_verified,processing_state,payload_hash,normalized_event) values('WHOP',$1,'fixture',true,'RECEIVED','hash',$2)",[id,JSON.stringify({...whopEvent,...patch,providerEventId:id})]);return(await db.query("select process_canonical_commerce_event('WHOP',$1) result",[id])).rows[0].result;};
 assert.equal((await whopProcess({safeEvidence:{source_lookup_confirmed:true,sandbox:true}},'sandbox')).state,'REVIEW_REQUIRED');
 assert.equal((await whopProcess({},'whop_paid')).state,'PROCESSED');assert.equal((await db.query('select state from phase_h_entitlements where customer_id=$1',[international])).rows[0].state,'ACTIVE');
 assert.equal((await whopProcess({},'whop_duplicate')).state,'DUPLICATE_PAYMENT');
 await whopProcess({paymentStatus:'CANCEL_AT_PERIOD_END',cancelAtPeriodEnd:true},'cancel');assert.equal((await db.query("select status from commerce_subscriptions where customer_id=$1",[international])).rows[0].status,'CANCEL_AT_PERIOD_END');
 await whopProcess({paymentStatus:'CANCEL_AT_PERIOD_END',cancelAtPeriodEnd:false},'resume');assert.equal((await db.query("select status from commerce_subscriptions where customer_id=$1",[international])).rows[0].status,'ACTIVE');
 await whopProcess({paymentStatus:'REFUNDED',caseType:'REFUND'},'refund');assert.equal((await db.query('select state from phase_h_entitlements where customer_id=$1',[international])).rows[0].state,'EXPIRED');
 await whopProcess({},'late_paid');assert.equal((await db.query('select state from phase_h_entitlements where customer_id=$1',[international])).rows[0].state,'EXPIRED','Delayed paid event cannot restore a refunded payment');
 const workId='22222222-2222-4222-8222-222222222222',lease='33333333-3333-4333-8333-333333333333';
 await db.query("insert into signal_publication_work(id,entity_type,entity_id,event_type,event_version,destination,status,lease_token,lease_expires_at) values($1,'signal',$1,'NEW_SIGNAL',1,'vip','processing',$2,now()+interval '5 minutes')",[workId,lease]);
 assert.equal((await db.query("select (reserve_canonical_delivery_part($1,$2,0,'crash-fixture')).state state",[workId,lease])).rows[0].state,'RESERVED');
 assert.equal((await db.query("select (reserve_canonical_delivery_part($1,$2,0,'crash-fixture')).state state",[workId,lease])).rows[0].state,'UNCERTAIN','Crash after reservation must never blindly resend');
 const sale={product:'VIP_SIGNALS',provider:'MPESA',currency:'KES',termDays:30,amountMinor:350000,salesEnabled:true,promotedStrategies:1};assert.equal(release1SaleDecision(sale),null);assert.equal(release1SaleDecision({...sale,promotedStrategies:0}),'STRATEGY_CERTIFICATION_REQUIRED');assert.equal(release1SaleDecision({...sale,salesEnabled:false}),'RELEASE1_SALES_PAUSED');assert.equal(release1SaleDecision({...sale,amountMinor:1}),'OFFICIAL_VIP_PRICE_REQUIRED');
 console.log('Release 1 real SQL + mocked Daraja and Telegram: pending → verified payment → duplicate → token binding → identity-bound admission → renewal → expiry → removal passed.');
} finally {await db.close()}
