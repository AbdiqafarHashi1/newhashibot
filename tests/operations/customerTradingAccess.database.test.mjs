import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
test('customer trading writes are blocked through tables and security-definer RPCs; service/Admin operations survive',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('fixture.admin',true),'false')='true'$$;
 create table customer_bot_setups(id int primary key,risk numeric);insert into customer_bot_setups values(1,.5);
 create table trading_accounts(account_id uuid primary key,user_id uuid);create table order_reservations(account_id uuid);create table account_asset_allocations(account_id uuid);
 alter table trading_accounts enable row level security;alter table order_reservations enable row level security;alter table account_asset_allocations enable row level security;
 grant usage on schema public,auth to authenticated;grant select on trading_accounts,order_reservations,account_asset_allocations to authenticated;
 create function fn_evaluate_and_reserve_pretrade_risk(text,uuid,text,text,text,text,numeric,numeric,numeric,numeric) returns boolean language sql as $$select true$$;
 create function browser_risk_change() returns void language sql security definer as $$update customer_bot_setups set risk=99 where id=1$$;
 insert into trading_accounts values('11111111-1111-4111-8111-111111111111',null),('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');`);
 await db.exec(await readFile('supabase/migrations/20261118110000_customer_trading_view_only.sql','utf8'));
 await db.exec(`set request.jwt.claim.role='authenticated';set fixture.admin='false'`);
 await assert.rejects(db.exec('update customer_bot_setups set risk=9 where id=1'),/CUSTOMER_TRADING_VIEW_ONLY/);
 await assert.rejects(db.exec('select browser_risk_change()'),/CUSTOMER_TRADING_VIEW_ONLY/);
 await db.exec(`set fixture.admin='true';update customer_bot_setups set risk=.4 where id=1;set fixture.admin='false';set request.jwt.claim.role='service_role';update customer_bot_setups set risk=.3 where id=1`);
 assert.equal((await db.query('select risk from customer_bot_setups')).rows[0].risk,'0.3');
 await db.exec(`set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';set role authenticated`);
 assert.equal((await db.query('select * from trading_accounts')).rows.length,1);
 await assert.rejects(db.exec("select fn_evaluate_and_reserve_pretrade_risk('x',null,'','','','',0,0,0,0)"),/permission denied/);
 }finally{await db.close()}
});
