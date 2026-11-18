import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
// The actual L/M/P migrations and worker fence; only platform identity is a controlled boundary.
import {initializeDatabaseFixture} from '../phaseP/database-fixture.mjs';
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',job='11111111-1111-4111-8111-111111111111',run='22222222-2222-4222-8222-222222222222',lease='33333333-3333-4333-8333-333333333333';
test('historical journal atomically persists bounded deltas, evidence and small checkpoint under the real worker lease fence',async()=>{
 const db=new PGlite({extensions:{btree_gist}});try{
  const sql:string[]=[];initializeDatabaseFixture((s:string)=>sql.push(s),{actor:owner,other});for(const s of sql)await db.exec(s);
  await db.exec("create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
  await db.exec(readFileSync('supabase/migrations/20261105011226_mission2_historical_journal.sql','utf8'));
  const payload={entryPolicyVersion:'entry-decision/v1',start:'2025-01-01T00:00:00Z',end:'2025-01-01T01:00:00Z',maxCycles:60};
  await db.query("insert into validation_runs(id,mode,status,configuration_hash,immutable_configuration,max_cycles,max_requests,created_by) values($1,'REPLAY','RUNNING','test','{}',60,1,$2)",[run,owner]);
  await db.query("insert into portable_jobs(id,kind,payload,customer_id,idempotency_key,status,lease_token,lease_expires_at,run_id) values($1,'REPLAY',$2,$3,'journal-test','RUNNING',$4,clock_timestamp()+interval '1 hour',$5)",[job,JSON.stringify(payload),owner,lease,run]);
  await db.exec("set role service_role;set request.jwt.claim.role='service_role';");
  const tick={cursor:1,lineage:'a'.repeat(64),through:'2025-01-01T00:00:00Z',states:[{state:{id:'controlled-watch',version:1,status:'WAITING',origin:{immutable:'original',largeControlledEvidence:'x'.repeat(20000)},entryDecision:{kind:'CONDITIONAL_WATCH'}},createdAt:1735689600000,updatedAt:1735689600000}],events:[{id:'controlled-watch:1',at:'2025-01-01T00:00:00Z',status:'WAITING'}],observations:[{decision:'CONDITIONAL_WATCH'}],health:[],rejections:[]};
  const save=(value:unknown,token=lease)=>db.query<{ok:boolean}>('select checkpoint_historical_replay($1,$2,$3) ok',[job,token,JSON.stringify(value)]);
  assert.equal((await save(tick)).rows[0].ok,true);assert.equal((await save(tick)).rows[0].ok,false);
  const checkpoint=(await db.query<{checkpoint:unknown}>('select checkpoint from portable_jobs where id=$1',[job])).rows[0].checkpoint;
  assert(JSON.stringify(checkpoint).length<1000);assert.equal((await db.query('select * from validation_cycles')).rows.length,1);
  await assert.rejects(()=>save({...tick,observations:[{forged:true}]}),/TICK_CONFLICT/);
  await assert.rejects(()=>save({...tick,cursor:2,through:'2025-01-01T00:01:00Z',lineage:'b'.repeat(64)}),/LINEAGE_CONFLICT/);
  await assert.rejects(()=>save(tick,'44444444-4444-4444-8444-444444444444'),/LEASE_LOST/);
  const next={...tick,cursor:2,through:'2025-01-01T00:01:00Z',states:[{...tick.states[0],state:{...tick.states[0].state,version:2,status:'EXPIRED',watchOutcome:'EXPIRED'},updatedAt:1735689660000}],events:[{id:'controlled-watch:2',at:'2025-01-01T00:01:00Z',status:'EXPIRED'}]};
  assert.equal((await save(next)).rows[0].ok,true);
  const conflict={...next,cursor:3,through:'2025-01-01T00:02:00Z',states:[{...next.states[0],state:{...next.states[0].state,version:3,status:'ACTIVE',watchOutcome:'CONFIRMED'}}]};
  await assert.rejects(()=>save(conflict),/TERMINAL_WATCH_OUTCOME/);
  const partialFailure={...next,cursor:3,through:'2025-01-01T00:02:00Z',states:[{state:{id:'must-roll-back',version:1,status:'WAITING'},createdAt:1735689720000,updatedAt:1735689720000}],events:[{...next.events[0],status:'REWRITTEN'}]};
  await assert.rejects(()=>save(partialFailure),/HISTORICAL_EVENT_CONFLICT/);
  assert.equal((await db.query("select * from historical_replay_states where setup_id='must-roll-back'")).rows.length,0);
  assert.equal((await db.query('select * from historical_replay_ticks')).rows.length,2);assert.equal((await db.query('select * from validation_cycles')).rows.length,2);
  await db.exec('reset role;set role authenticated;');
  await assert.rejects(()=>save(tick),/permission denied/);assert.equal((await db.query('select * from historical_replay_states')).rows.length,0);
  await db.exec('reset role;');await db.query("update profiles set role='user' where id=$1",[owner]);await db.exec("set role service_role;set request.jwt.claim.role='service_role';");
  await assert.rejects(()=>save(tick),/AUTHORIZATION_REVOKED/);
 }finally{await db.close();}
});
