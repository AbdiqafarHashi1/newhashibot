import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {conditionalMessage,type ConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {audienceAllows} from '../../supabase/functions/_shared/canonical-publication-worker.ts';
import {renderCanonicalTruth} from '../../supabase/functions/_shared/canonical-publication-runtime.ts';

test('PostgreSQL track isolation, original plans/history, Free selection and admin-only unknown routing',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function public.is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='yes'$$;
 create table signals(symbol text,status text);
 create table phase_o_destinations(id uuid primary key,external_identity_ref text,platform text,audience text,configuration_state text,permission_verified_at timestamptz,enabled boolean,min_interval_minutes integer);
 create table phase_o_drafts(id uuid primary key,job_id uuid,destination_id uuid);
 create table phase_o_approvals(id uuid primary key,draft_id uuid,scope text,revoked_at timestamptz,expires_at timestamptz,used_count integer,max_uses integer,min_interval_minutes integer,last_used_at timestamptz);
 create table phase_o_agent_configurations(role text primary key,enabled boolean,paused_at timestamptz);
 create table phase_o_campaigns(id uuid primary key,status text);
 create table phase_o_agent_jobs(id uuid primary key,role text,campaign_id uuid,status text,task text,attempt integer,checkpoint jsonb,available_at timestamptz);
 create table test_events(key text primary key,event text,payload jsonb,destinations text[]);
 create function public.enqueue_canonical_lifecycle_event(text,text,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text[]) returns void language sql as $$insert into test_events values($1,$2,$9,$10)$$;
 grant select on signals to service_role;`);
 await db.exec(readFileSync('supabase/migrations/20261029031319_conditional_signal_service.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261029053521_conditional_tracks_and_acquisition.sql','utf8'));
 const t=Math.floor(Date.now()/3600000)*3600000,iso=(n:number)=>new Date(t+n*3600000).toISOString();
 const setup=(symbol:string,track:'INTRADAY'|'SWING',side:'buy'|'sell'='buy'):ConditionalSetup=>({id:`${symbol}:${track}:${side}`,symbol,track,timeframe:track==='INTRADAY'?'15m':'1h',side,strategy:'conditional',variant:'TREND_PULLBACK',policy:'conditional-signals/v1',source:'TEST',sourceClose:iso(0),lastBar:iso(-1),trigger:100,stop:side==='buy'?90:110,tp1:side==='buy'?110:90,tp2:side==='buy'?120:80,expiresAt:iso(8),holdBars:48,score:85,reason:'Higher timeframe trend pullback',status:'WAITING',version:1});
 const save=async(s:ConditionalSetup,v=0)=>(await db.query<{ok:boolean}>('select commit_conditional_signal_setup($1::jsonb,$2,$3) ok',[JSON.stringify(s),v,conditionalMessage(s)])).rows[0].ok;
 const a=setup('BTCUSDT','INTRADAY');assert.equal(await save(a),true);assert.equal(await save(a),true);
 assert.equal(await save(setup('BTCUSDT','SWING')),true);
 assert.equal(await save(setup('ETHUSDT','INTRADAY')),true);assert.equal(await save(setup('SOLUSDT','INTRADAY')),true);
 assert.equal(await save(setup('XRPUSDT','INTRADAY')),false); // 3 per-hour admissions in this track
 assert.equal(await save(setup('XRPUSDT','SWING')),true); // separate Swing throughput
 assert.equal((await db.query('select * from conditional_free_samples')).rows.length,1);
 assert.equal((await db.query('select * from conditional_setup_history')).rows.length,5);
 await assert.rejects(save({...a,track:'SWING',version:2,lastBar:iso(0)},1),/INVALID_CONDITIONAL_STATE/);
 await assert.rejects(save({...a,reason:'Rewritten plan',version:2,lastBar:iso(0)},1),/IMMUTABLE_SETUP_PLAN/);
 const unknown={...a,status:'DATA_GAP' as const,version:2,lastBar:iso(0),result:'Missing candles; outcome unknown.'};assert.equal(await save(unknown,1),true);
 const e=(await db.query<any>("select * from test_events where key=$1",[`conditional:${a.id}:2`])).rows[0];assert.deepEqual(e.destinations,['admin']);
 const truth:any={entityId:'event',entityType:'lifecycle_event',eventType:'CONDITIONAL_SETUP',eventVersion:1,occurredAt:iso(0),payload:e.payload};
 const claim:any={entityId:'event',entityType:'lifecycle_event',eventType:'CONDITIONAL_SETUP',eventVersion:1,destination:'vip_crypto',customerId:null};
 assert.equal(audienceAllows(claim,truth),false);assert.equal(audienceAllows({...claim,destination:'admin'},truth),true);
 assert.throws(()=>renderCanonicalTruth(truth,'vip_crypto'),/SCOPE/);
 const free=(await db.query<any>('select payload from test_events where key=$1',[`conditional:${a.id}:1`])).rows[0].payload;
 const freeText=renderCanonicalTruth({...truth,payload:free},'free').map(x=>x.text).join('');assert.match(freeText,/Today’s Free selection/);assert.match(freeText,/3500|3,500/);
 await db.exec("set test.admin='yes'");const overview=(await db.query<any>('select conditional_service_overview() result')).rows[0].result;assert.equal(overview.tracks.reduce((n:number,x:any)=>n+Number(x.total),0),5);
 assert.equal((await db.query<any>('select count(*) n from conditional_setup_history where setup_id=$1',[a.id])).rows[0].n,2);
 await db.exec('set role service_role');await assert.rejects(db.exec('delete from conditional_setup_history'),/permission denied/);await db.exec('reset role');
 // Partner identity verification uses an expected-identity fence and invalidates prior approvals.
 const dest='11111111-1111-1111-1111-111111111111';await db.query("insert into phase_o_destinations(id,external_identity_ref,platform,audience,configuration_state) values($1,'@partner','TELEGRAM','FREE','UNCONFIGURED')",[dest]);
 assert.equal((await db.query<any>("select verify_phase_o_destination_identity($1,'@other','-1001',now()) ok",[dest])).rows[0].ok,false);
 assert.equal((await db.query<any>("select verify_phase_o_destination_identity($1,'@partner','-1001',now()) ok",[dest])).rows[0].ok,true);
 assert.equal((await db.query<any>('select configuration_state from phase_o_destinations where id=$1',[dest])).rows[0].configuration_state,'READY');
 await db.query("update phase_o_destinations set external_identity_ref='-1002' where id=$1",[dest]);assert.equal((await db.query<any>('select configuration_state from phase_o_destinations where id=$1',[dest])).rows[0].configuration_state,'UNCONFIGURED');
 assert.equal((await db.query<any>('select queue_due_phase_o_standing() n')).rows[0].n,0);
 const job='22222222-2222-2222-2222-222222222222',draft='33333333-3333-3333-3333-333333333333',approval='44444444-4444-4444-4444-444444444444';
 await db.exec("insert into phase_o_agent_configurations values('GROWTH_ENGAGEMENT',true,null)");
 await db.query("update phase_o_destinations set enabled=true,configuration_state='READY',permission_verified_at=now(),min_interval_minutes=60 where id=$1",[dest]);
 await db.query("insert into phase_o_agent_jobs(id,role,status,task,attempt) values($1,'GROWTH_ENGAGEMENT','COMPLETED','UPGRADE_POST',1)",[job]);
 await db.query('insert into phase_o_drafts values($1,$2,$3)',[draft,job,dest]);
 await db.query("insert into phase_o_approvals values($1,$2,'STANDING_TEMPLATE',null,now()+interval '30 days',1,30,1440,now()-interval '2 days')",[approval,draft]);
 assert.equal((await db.query<any>('select queue_due_phase_o_standing() n')).rows[0].n,1);
 assert.equal((await db.query<any>('select queue_due_phase_o_standing() n')).rows[0].n,0);
 assert.equal((await db.query<any>('select checkpoint from phase_o_agent_jobs where id=$1',[job])).rows[0].checkpoint.stage,'DELIVERY');
 await db.query("update phase_o_agent_jobs set status='COMPLETED' where id=$1",[job]);
 await db.exec("update phase_o_agent_configurations set enabled=false");
 assert.equal((await db.query<any>('select queue_due_phase_o_standing() n')).rows[0].n,0);

 }finally{await db.close();}
});
