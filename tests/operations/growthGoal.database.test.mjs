import {PGlite} from '@electric-sql/pglite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('growth goal counts distinct verified current paying customers beyond UI page limits; approval queues atomically',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text);
 create table phase_h_entitlements(customer_id uuid,product_code text,state text,source text,source_payment_id uuid,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz);
 create table telegram_links(user_id uuid,telegram_user_id bigint);
 create table telegram_memberships(customer_id uuid,audience text,state text,last_verified_at timestamptz);
 create table telegram_fulfillment_requests(status text);
 create table phase_o_campaigns(status text);
 create table phase_o_agent_jobs(id uuid primary key,status text,checkpoint jsonb,available_at timestamptz,updated_at timestamptz);
 create table phase_o_drafts(id uuid primary key,job_id uuid,version integer,destination_id uuid);
 create table phase_o_delivery_parts(state text);
 create table phase_o_approvals(id uuid primary key default gen_random_uuid(),draft_id uuid,draft_version integer,binding_hash text,scope text,max_uses integer,min_interval_minutes integer,expires_at timestamptz,approved_by uuid,approved_at timestamptz default now(),revoked_at timestamptz);
 insert into phase_h_entitlements select md5(i::text)::uuid,'VIP_SIGNALS','ACTIVE','VERIFIED_WHOP',gen_random_uuid(),null,now()-interval '1 day',now()+interval '1 day' from generate_series(1,1201)i;
 insert into phase_h_entitlements select * from phase_h_entitlements;
 insert into phase_h_entitlements values(gen_random_uuid(),'VIP_SIGNALS','TRIAL','VERIFIED_WHOP',gen_random_uuid(),null,now()-interval '1 day',now()+interval '1 day'),(gen_random_uuid(),'VIP_SIGNALS','ACTIVE','MANUAL_REVIEW',gen_random_uuid(),null,now()-interval '1 day',now()+interval '1 day'),(gen_random_uuid(),'VIP_SIGNALS','ACTIVE','VERIFIED_WHOP',null,null,now()-interval '1 day',now()+interval '1 day'),(gen_random_uuid(),'VIP_SIGNALS','ACTIVE','VERIFIED_WHOP',gen_random_uuid(),null,now()-interval '2 days',now()-interval '1 day');`);
 await db.exec(await readFile('supabase/migrations/20261016120000_growth_goal_overview.sql','utf8'));
 const read=async()=>(await db.query('select phase_o_growth_overview() value')).rows[0].value;
 const result=await read();assert.equal(result.paid_customers,1201);assert.equal(result.target,1000);assert.equal(result.paid_without_telegram_link,1201);assert.equal(result.confirmed_vip_members,0);
 const actor='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222',draft='33333333-3333-4333-8333-333333333333';
 await db.query("insert into profiles values($1,'admin');",[actor]);await db.query("insert into phase_o_agent_jobs(id,status) values($1,'CANCELLED')",[job]);await db.query('insert into phase_o_drafts values($1,$2,1,$3)',[draft,job,actor]);
 const approve=async()=>(await db.query("select approve_phase_o_draft_and_queue($1,$2,$3,'ONE_TIME',1,0,now()+interval '1 day') value",[draft,actor,'a'.repeat(64)])).rows[0].value;
 await assert.rejects(approve(),/STATE_CHANGED/);assert.equal((await db.query('select count(*)::int n from phase_o_approvals')).rows[0].n,0);
 await db.query("update phase_o_agent_jobs set status='AWAITING_APPROVAL' where id=$1",[job]);assert.equal((await approve()).idempotent,false);const checkpoint=(await db.query('select checkpoint from phase_o_agent_jobs')).rows[0].checkpoint;assert.equal(checkpoint.stage,'DELIVERY');
 assert.equal((await approve()).idempotent,true);assert.deepEqual((await db.query('select checkpoint from phase_o_agent_jobs')).rows[0].checkpoint,checkpoint);assert.equal((await db.query('select count(*)::int n from phase_o_approvals')).rows[0].n,1);
 await db.exec('set role authenticated');await assert.rejects(read(),/permission denied/);await assert.rejects(approve(),/permission denied/);
 }finally{await db.close()}
});
