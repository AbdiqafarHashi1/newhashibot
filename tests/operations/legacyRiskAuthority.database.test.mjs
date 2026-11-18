import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
test('legacy reservations enforce fresh provider identity, 0.5% Prop cap, 4% daily latch and valid stop geometry',async()=>{
 const db=new PGlite(),id='11111111-1111-4111-8111-111111111111';try{
 await db.exec(`create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function auth.role() returns text language sql as $$select 'service_role'::text$$;`);
 await db.exec(await readFile('supabase/migrations/20260824090000_101_non_blocking_risk_mutex_and_atomic_pretrade.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261118111000_legacy_risk_fail_closed.sql','utf8'));
 await db.query("insert into trading_accounts(account_id,provider,account_profile,broker_account_number) values($1,'MT5_PROP','STRICT_PROP_GUARDRAIL','fixture')",[id]);
 const reserve=(key,provider='MT5_PROP',stop=99)=>db.query("select * from fn_evaluate_and_reserve_pretrade_risk($1,$2,'fixture',$3,'XAUUSD','BUY',1,100,$4,0.0001)",[key,id,provider,stop]);
 assert.equal((await reserve('safe')).rows[0].approved,true);
 assert.equal((await reserve('oversized','MT5_PROP',40)).rows[0].approved,false);
 assert.equal((await reserve('wrong-provider','BINANCE_FUTURES')).rows[0].approved,false);
 await assert.rejects(reserve('wrong-stop','MT5_PROP',101),/INVALID_ORDER_RISK_INPUT/);
 await db.query("update trading_accounts set last_equity_update=now()-interval '2 minutes' where account_id=$1",[id]);assert.equal((await reserve('stale')).rows[0].approved,false);
 await db.query('update trading_accounts set last_equity_update=now(),floating_equity=9600 where account_id=$1',[id]);assert.equal((await reserve('daily')).rows[0].rejection_code,'DAILY_LOSS_LIMIT');
 await db.query('update trading_accounts set floating_equity=10000 where account_id=$1',[id]);assert.equal((await reserve('recovered')).rows[0].rejection_code,'ACCOUNT_EXECUTION_HALTED');
 assert.equal((await db.query('select count(*)::int as n from order_reservations')).rows[0].n,1);
 await db.exec('create table account_risk_state(execution_account_id uuid,observed_at timestamptz,block_reason text,applied_risk_pct numeric)');
 await db.exec(await readFile('supabase/migrations/20261118123000_house_money_legacy_sync.sql','utf8'));
 await db.query('update trading_accounts set is_halted=false,last_equity_update=clock_timestamp() where account_id=$1',[id]);
 await db.query('insert into account_risk_state values($1,clock_timestamp(),null,.85)',[id]);
 assert.equal((await reserve('canonical-scaled','MT5_PROP',20)).rows[0].approved,true);
 await db.query("update account_risk_state set block_reason='CHALLENGE_DAILY_HALT'");assert.equal((await reserve('canonical-blocked')).rows[0].approved,false);
 await db.exec("update account_risk_state set block_reason=null,observed_at=clock_timestamp()-interval '70 seconds'");assert.equal((await reserve('canonical-stale')).rows[0].approved,false);

 }finally{await db.close()}
});
