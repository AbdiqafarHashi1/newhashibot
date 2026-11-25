import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {freeGuideMessages} from '../../supabase/functions/_shared/free-guide.ts';
import {subscriberCopySafe} from '../../supabase/functions/_shared/subscriber-copy.ts';
import {renderCanonicalTruth} from '../../supabase/functions/_shared/canonical-publication-runtime.ts';
import {validateGenerated} from '../../supabase/functions/_shared/phase-o-agents.ts';
const actor='11111111-1111-4111-8111-111111111111',customer='22222222-2222-4222-8222-222222222222',dest='33333333-3333-4333-8333-333333333333',campaign='44444444-4444-4444-8444-444444444444';
test('upgrade guide explains lifecycle and failed breakouts without fabricating market facts or scarcity',()=>{
 for(const language of ['en','so']){const texts=freeGuideMessages('https://hashibot.app/vip?utm_source=free',language);assert.equal(texts.length,6);assert(texts.every(t=>t.includes('https://hashibot.app/vip')&&subscriberCopySafe(t)));assert(texts.every(t=>!/(remaining slots|guaranteed|current price|site not found)/i.test(t)));}
 const texts=freeGuideMessages('https://hashibot.app/vip');assert.match(texts[1],/not an entry/);assert.match(texts[2],/separate update/);assert.match(texts[3],/own new reference/);assert.match(texts[4],/No filter catches every/);
 for(const url of ['https://other.test/vip','https://hashibot.app/missing','http://hashibot.app/vip'])assert.throws(()=>freeGuideMessages(url));
});
test('diagnostics cannot become subscriber copy, including already stored canonical messages',()=>{
 for(const text of ['SyntaxError: unexpected token','Site not found','Deployment not found','404: NOT_FOUND','HTTP 503 upstream','Traceback (most recent call last)','<!doctype html><html>Bad gateway']){assert.equal(subscriberCopySafe(text),false);assert.throws(()=>validateGenerated(text,[]),/DIAGNOSTIC/);
  assert.throws(()=>renderCanonicalTruth({entityId:'e',entityType:'lifecycle_event',eventType:'CONDITIONAL_SETUP',eventVersion:1,occurredAt:new Date().toISOString(),payload:{market_type:'crypto',policy:'conditional-signals/v1',message:text,state:{status:'WAITING',strategy:'crypto.launch-trend-pullback-48-1.5-5'}}} as any,'vip_crypto'),/DIAGNOSTIC/);
 }
 assert(subscriberCopySafe('A failed breakout invalidated this setup. No entry.'));
});
test('actual SQL: audited 30-day manual access, no fake payment, expiry, idempotency, role denial and six staggered Free guide jobs',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function public.is_admin() returns boolean language sql as $$select auth.uid()='${actor}'::uuid$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${actor}'),('${customer}');
 create table profiles(id uuid primary key,email text,role text);insert into profiles values('${actor}','owner@test.test','admin'),('${customer}','customer@test.test','customer');
 create table phase_h_entitlements(id uuid primary key default gen_random_uuid(),customer_id uuid,product_code text,state text,source text,external_reference text,valid_from timestamptz,valid_until timestamptz,revoked_at timestamptz,account_limit integer,feature_permissions jsonb,granted_at timestamptz,grant_reason text,source_payment_id uuid,created_at timestamptz default now(),updated_at timestamptz default now());
 create table commerce_payment_attempts(id uuid primary key,customer_id uuid,state text,safe_evidence jsonb,provider text,amount_minor integer,currency text);
 create table customer_subscriptions(user_id uuid,product_slug text,access_status text,payment_status text,revoked_at timestamptz,starts_at timestamptz,created_at timestamptz,expires_at timestamptz);
 create table telegram_fulfillment_requests(customer_id uuid,entitlement_id uuid,access_type text,audience text,action text,idempotency_key text unique,entitlement_version timestamptz);
 create table commerce_audit_events(actor_id uuid,customer_id uuid,event_type text,safe_metadata jsonb);
 create table phase_o_destinations(id uuid primary key,audience text,platform text,enabled boolean,configuration_state text,permission_verified_at timestamptz,permitted_roles text[],languages text[],allowed_content_types text[],min_interval_minutes integer);
 insert into phase_o_destinations values('${dest}','FREE','TELEGRAM',true,'READY',now(),array['GROWTH_ENGAGEMENT'],array['en','so'],array['TEXT'],0);
 create table phase_o_campaigns(id uuid primary key,status text,offer_code text);insert into phase_o_campaigns values('${campaign}','ACTIVE','VIP_SIGNALS_MONTHLY_USD_29');
 create table phase_o_agent_configurations(role text primary key,enabled boolean,paused_at timestamptz,permitted_tasks text[],languages text[]);insert into phase_o_agent_configurations values('GROWTH_ENGAGEMENT',true,null,array['UPGRADE_POST'],array['en','so']);
 create table phase_o_agent_jobs(id uuid primary key,role text,task text,language text,campaign_id uuid,destination_id uuid,status text,requested_by uuid,available_at timestamptz,checkpoint jsonb,updated_at timestamptz default now(),attempt integer default 0);
 create table phase_o_drafts(id uuid primary key,job_id uuid,version integer,content text,content_hash text,destination_id uuid,offer_code text);
 create table phase_o_approvals(id uuid primary key default gen_random_uuid(),draft_id uuid,draft_version integer,binding_hash text,scope text,max_uses integer,expires_at timestamptz,approved_by uuid,min_interval_minutes integer,revoked_at timestamptz,last_used_at timestamptz,used_count integer default 0);
 create function phase_o_binding_hash(text,integer,uuid,uuid,text) returns text language sql immutable as $$select encode(sha256(convert_to(concat_ws('|',$1,$2,coalesce($3::text,''),coalesce($4::text,''),coalesce($5,'')),'UTF8')),'hex')$$;
 revoke all on function phase_o_binding_hash(text,integer,uuid,uuid,text) from public;
 `);
 await db.exec(readFileSync('supabase/migrations/20261030012342_release1_four_hour_guide_and_manual_vip.sql','utf8'));
 const standing=readFileSync('supabase/migrations/20261029053521_conditional_tracks_and_acquisition.sql','utf8');await db.exec(standing.slice(standing.indexOf('create function public.queue_due_phase_o_standing()'))); 
 await db.exec(`grant usage on schema public,auth to service_role,authenticated;grant select on profiles to service_role;
 grant all on phase_h_entitlements,telegram_fulfillment_requests,commerce_audit_events,phase_o_agent_jobs,phase_o_drafts,phase_o_approvals to service_role;
 grant select on phase_o_destinations,phase_o_campaigns,phase_o_agent_configurations to service_role;grant update on phase_o_destinations to service_role;
 grant execute on function auth.role(),auth.uid() to public;set test.role='service_role';set role service_role;`);
 const grant=async()=>(await db.query<any>('select grant_release1_manual_vip($1,$2,$3) result',[actor,customer,'Owner approved 30-day access'])).rows[0].result;
 const g=await grant();assert.equal(g.state,'GRANTED');const again=await grant();assert.equal(again.entitlement_id,g.entitlement_id);assert.equal(again.state,'EXISTING_ACCESS');
 assert.equal((await db.query<any>("select has_product_entitlement($1,'crypto_signal_room',now()) ok",[customer])).rows[0].ok,true);
 assert.equal((await db.query<any>("select has_product_entitlement($1,'crypto_signal_room',now()+interval '31 days') ok",[customer])).rows[0].ok,false);
 const e=(await db.query<any>('select * from phase_h_entitlements')).rows[0];assert.equal(e.source,'OWNER_MANUAL_30D');assert.equal(e.source_payment_id,null);assert.equal(Date.parse(e.valid_until)-Date.parse(e.valid_from),30*86400000);
 assert.equal((await db.query('select * from telegram_fulfillment_requests')).rows.length,2);
 assert.equal((await db.query('select * from commerce_audit_events')).rows.length,1);
 await assert.rejects(db.query('select grant_release1_manual_vip($1,$2,$3)',[customer,customer,'not owner']),/ADMIN_REQUIRED/);
 const configure=async(enabled=true)=>(await db.query<any>('select configure_release1_free_guide($1,$2,$3,$4,$5,$6) result',[actor,dest,campaign,'en',JSON.stringify(freeGuideMessages('https://hashibot.app/vip')),enabled])).rows[0].result;
 assert.equal((await configure()).state,'ENABLED');assert.equal((await db.query<any>('select min_interval_minutes n from phase_o_destinations')).rows[0].n,240);
 const jobs=(await db.query<any>('select * from phase_o_agent_jobs order by available_at')).rows;assert.equal(jobs.length,6);for(let i=1;i<6;i++)assert.equal(Date.parse(jobs[i].available_at)-Date.parse(jobs[i-1].available_at),4*3600000);
 const approvals=(await db.query<any>('select * from phase_o_approvals')).rows;assert(approvals.every(a=>a.min_interval_minutes===1440&&a.scope==='STANDING_TEMPLATE'));
 await db.exec("update phase_o_agent_jobs set status='COMPLETED';update phase_o_approvals set last_used_at=now()-interval '23 hours';");
 assert.equal((await db.query<any>('select queue_due_phase_o_standing() n')).rows[0].n,0);
 await db.exec("update phase_o_approvals set last_used_at=now()-interval '25 hours';");
 assert.equal((await db.query<any>('select queue_due_phase_o_standing() n')).rows[0].n,6);
 assert.equal((await db.query<any>('select queue_due_phase_o_standing() n')).rows[0].n,0);
 assert.equal((await configure(false)).state,'PAUSED');assert.equal((await db.query("select * from phase_o_agent_jobs where status<>'CANCELLED'")).rows.length,0);
 await db.exec('reset role');await db.exec(`update phase_o_destinations set audience='VIP_CRYPTO';set role service_role;`);await assert.rejects(configure(),/VERIFIED_FREE_DESTINATION_REQUIRED/);
 await db.exec('reset role');await db.exec(`update release1_manual_vip_grants set revoked_at=now();set role service_role;`);assert.equal((await db.query<any>("select has_product_entitlement($1,'crypto_signal_room',now()) ok",[customer])).rows[0].ok,false);
 await db.exec('reset role');await db.exec(`set test.role='authenticated';set role authenticated;`);
 await assert.rejects(grant(),/permission denied/);await assert.rejects(configure(),/permission denied/);await assert.rejects(db.exec('insert into release1_manual_vip_grants default values'),/permission denied/);
 }finally{await db.close();}
});
