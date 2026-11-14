import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {accountSchema} from './support/accountSchema.mjs';
test('expired demo access pauses entries and queues only owned MT5 tickets, with renewal, retry and account isolation',async()=>{
 const db=new PGlite();try{
 await db.exec(accountSchema);await db.exec(`alter table connected_execution_accounts add column runtime_control text;
 create table phase_h_entitlements(id uuid primary key,customer_id uuid,execution_account_id uuid,state text,valid_from timestamptz,valid_until timestamptz,revoked_at timestamptz);
 create table execution_entitlement_bindings(execution_account_id uuid,customer_id uuid,entitlement_id uuid,state text);
 create table mt5_account_snapshots(account_id uuid,owner_id uuid,bridge_id text,captured_at timestamptz,terminal_authenticated boolean,read_status jsonb,positions jsonb,orders jsonb);
 create table mt5_commands(id uuid primary key default gen_random_uuid(),account_id uuid,bridge_id text,operation text,payload jsonb,idempotency_key text,status text,intended_policy jsonb,expires_at timestamptz,error_code text,attempts integer not null default 0,unique(account_id,idempotency_key));`);
 await db.exec(await readFile('supabase/migrations/20261114054116_execution_expiry_management.sql','utf8'));
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',account=crypto.randomUUID(),terminal=crypto.randomUUID(),ent=crypto.randomUUID();
 await db.query("insert into connected_execution_accounts(id,customer_id,provider,account_mode,environment,credential_ref,provider_account_identity,runtime_control,execution_enabled,monitor_enabled) values($1,$2,'MT5_PERSONAL','PERSONAL','demo','vault',$3,'START',true,true)",[account,owner,terminal]);await db.query("insert into mt5_accounts values($1,$2,'bridge','vault')",[terminal,owner]);
 await db.query("insert into phase_h_entitlements values($1,$2,$3,'ACTIVE',clock_timestamp()-interval '29 days',clock_timestamp()+interval '1 day',null)",[ent,owner,account]);await db.query("insert into execution_entitlement_bindings values($1,$2,$3,'ACTIVE')",[account,owner,ent]);
 const access=async()=>(await db.query('select execution_access_boundary($1,$2) as a',[account,owner])).rows[0].a;
 assert.equal((await access()).state,'ACTIVE');await assert.rejects(db.query('select execution_access_boundary($1,$2)',[account,other]),/SCOPE/);
 const child='exact-approved-child',comment='hb:'+createHash('sha256').update(child).digest('hex').slice(0,24);
 await db.query("insert into mt5_commands(account_id,bridge_id,operation,payload,idempotency_key,status,expires_at) values($1,'bridge','OPEN_POSITION',$2,'entry','accepted',clock_timestamp()+interval '1 minute')",[terminal,JSON.stringify({certified:true,native_child_orders:[{client_order_id:child}]})]);
 const snap=async(positions,orders=[],ownerId=owner,bridge='bridge',fresh=true)=>db.query("insert into mt5_account_snapshots values($1,$2,$3,clock_timestamp()-case when $4 then interval '0 seconds' else interval '10 minutes' end,true,'{\"positions\":true,\"orders\":true}',$5,$6)",[terminal,ownerId,bridge,fresh,JSON.stringify(positions),JSON.stringify(orders)]);
 await snap([{ticket:1,comment}]);assert.equal((await db.query("select * from mt5_commands where operation='CLOSE_POSITION'")).rows.length,0);
 await db.query("update phase_h_entitlements set valid_until=clock_timestamp()-interval '1 second' where id=$1",[ent]);
 await snap([{ticket:1,comment}],[],other);await snap([{ticket:1,comment}],[] ,owner,'wrong');await snap([{ticket:1,comment}],[],owner,'bridge',false);assert.equal((await db.query("select * from mt5_commands where operation='CLOSE_POSITION'")).rows.length,0);
 await snap([{ticket:1,comment},{ticket:999,comment:'manual'}],[{ticket:2,comment}]);await snap([{ticket:1,comment},{ticket:999,comment:'manual'}],[{ticket:2,comment}]);
 const commands=(await db.query("select * from mt5_commands where operation<>'OPEN_POSITION'")).rows;assert.equal(commands.length,2);assert.deepEqual(commands.map(c=>c.payload.ticket).sort(),['1','2']);
 const a=(await db.query('select execution_enabled,monitor_enabled,runtime_control from connected_execution_accounts where id=$1',[account])).rows[0];assert.equal(a.execution_enabled,false);assert.equal(a.monitor_enabled,true);assert.equal(a.runtime_control,'PAUSE_NEW_ENTRIES');
 await db.exec("update mt5_commands set status='accepted' where operation<>'OPEN_POSITION'");const close=commands.find(c=>c.operation==='CLOSE_POSITION');
 const authorize=async(bridge='bridge')=>(await db.query('select authorize_expiry_management($1,$2,$3,$4) as a',[close.id,owner,terminal,bridge])).rows[0].a;
 assert.equal((await authorize()).authority,'EXECUTION_ACCESS_EXPIRED');assert.equal(await authorize('wrong'),null);
 await db.exec("update mt5_commands set expires_at=clock_timestamp()-interval '1 second' where operation<>'OPEN_POSITION'");await snap([{ticket:1,comment}],[{ticket:2,comment}]);assert.equal((await db.query("select * from mt5_commands where operation<>'OPEN_POSITION'")).rows.length,2);
 await db.query("update phase_h_entitlements set valid_until=clock_timestamp()+interval '30 days' where id=$1",[ent]);assert.equal((await access()).state,'ACTIVE');assert.equal(await authorize(),null);assert.equal((await db.query('select execution_enabled from connected_execution_accounts')).rows[0].execution_enabled,false);
 await db.exec("set request.jwt.claim.role='authenticated'");await assert.rejects(access(),/SERVICE_ROLE/);
 }finally{await db.close()}
});
