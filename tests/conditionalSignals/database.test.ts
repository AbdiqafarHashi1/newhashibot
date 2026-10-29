import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {ConditionalSignalStore,admitConditionalBatch,observeConditionalSymbol} from '../../supabase/functions/_shared/conditional-signal-runtime.ts';
import {conditionalMessage,type ConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {processCanonicalPublicationBatch,audienceAllows} from '../../supabase/functions/_shared/canonical-publication-worker.ts';
import {renderCanonicalTruth} from '../../supabase/functions/_shared/canonical-publication-runtime.ts';

test('actual embedded PostgreSQL: concrete store → atomic transition/outbox → canonical rendering → injected delivery; RLS/grants and rollback',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.role() returns text language sql as $$select 'service_role'::text$$;
 create function public.is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='yes'$$;
 create table signals(symbol text,status text);
 create table canonical_lifecycle_events(id uuid primary key default gen_random_uuid(),event_key text,event_type text,event_version int,signal_id uuid,execution_id uuid,customer_id uuid,account_id uuid,occurred_at timestamptz,payload jsonb,content_hash text,unique(event_key,event_version));
 create table signal_publication_work(id uuid default gen_random_uuid(),signal_id uuid,entity_type text,entity_id uuid,event_type text,event_version int,destination text,customer_id uuid,event_key text unique,status text);
 grant select on signals to service_role;`);
 const history=readFileSync('supabase/migrations/20261021053541_release1_publication_membership_recovery.sql','utf8');
 const enqueue=history.slice(history.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_canonical_lifecycle_event'),history.indexOf('CREATE OR REPLACE FUNCTION public.reserve_canonical_delivery_part'));
 assert.ok(enqueue.length>1000);await db.exec(enqueue);
 await db.exec(readFileSync('supabase/migrations/20261029031319_conditional_signal_service.sql','utf8'));
 const now=Date.now(),w=900000,t=Math.floor(now/w)*w-w,iso=(n:number)=>new Date(t+n*w).toISOString();
 const setup=(symbol='BTCUSDT',id='setup'):ConditionalSetup=>({id,symbol,timeframe:'15m',track:'INTRADAY',side:'buy',strategy:'crypto.conditional-intraday',variant:'TREND_PULLBACK',policy:'conditional-signals/v1',sourceClose:iso(1),source:'FIXTURE',trigger:100,stop:90,tp1:110,tp2:120,expiresAt:iso(8),holdBars:48,score:85,reason:'Confirmation required',status:'WAITING',version:1,lastBar:iso(0)});
 const adapter={from:()=>{const filters:Record<string,string>={};const q:any={select:()=>q,eq:(k:string,v:string)=>{filters[k]=v;return q;},in:()=>q,limit:async()=>({data:(await db.query('select state from conditional_signal_setups where symbol=$1 and timeframe=$2 and status in(\'WAITING\',\'ARMED\',\'ACTIVE\')',[filters.symbol,filters.timeframe])).rows})};return q;},rpc:async(name:string,p:any)=>{
 assert.equal(name,'commit_conditional_signal_setup');const r=await db.query('select commit_conditional_signal_setup($1::jsonb,$2,$3) as ok',[JSON.stringify(p.p_state),p.p_expected_version,p.p_message]);return{data:(r.rows[0] as any).ok};}};
 const store=new ConditionalSignalStore(adapter);assert.equal(await store.save(setup(),0),true);assert.equal(await store.save(setup(),0),true);
 assert.equal((await db.query('select * from signal_publication_work')).rows.length,1);
 await assert.rejects(store.save({...setup(),trigger:101},0),/CONTENT_CONFLICT/);
 assert.equal(await store.save(setup('BTCUSDT','duplicate'),0),false);
 await db.exec("set role authenticated");assert.equal((await db.query('select * from conditional_signal_setups')).rows.length,0);
 await assert.rejects(store.save(setup('ETHUSDT','forged'),0),/permission denied/);
 await db.exec("set test.admin='yes'");assert.equal((await db.query('select * from conditional_signal_setups')).rows.length,1);await db.exec('reset role');
 const bar=(n:number,o:number,h:number,l:number,c:number)=>({symbol:'BTCUSDT',market_type:'crypto' as const,timeframe:'15m',open_time:iso(n),open:o,high:h,low:l,close:c,volume:100,source:'FIXTURE'});
 const bars=[bar(1,99,103,98,102),bar(2,100,111,99,110),bar(3,110,121,105,120)];
 await observeConditionalSymbol(store,'BTCUSDT','15m',bars,t+4*w);
 let state=(await db.query('select state from conditional_signal_setups')).rows[0].state as ConditionalSetup;
 assert.equal(state.status,'CLOSED');assert.equal(state.netR,1.475);
 const n=(await db.query('select * from signal_publication_work')).rows.length;
 await observeConditionalSymbol(store,'BTCUSDT','15m',bars,t+4*w);assert.equal((await db.query('select * from signal_publication_work')).rows.length,n);
 const row=(await db.query('select * from canonical_lifecycle_events order by occurred_at desc limit 1')).rows[0] as any;
 const parts=renderCanonicalTruth({entityType:'lifecycle_event',entityId:row.id,eventType:row.event_type,eventVersion:1,occurredAt:new Date(now).toISOString(),customerId:null,payload:row.payload},'vip_crypto');
 const delivered:string[]=[];const injected={send:async(text:string)=>{delivered.push(text);return{kind:'accepted',messageId:'test-only'};}};
 for(const p of parts)await injected.send(p.text);assert.match(delivered.join(''),/Paper|paper/);
 const work=(await db.query('select * from signal_publication_work where entity_id=$1',[row.id])).rows[0] as any;
 const claim={id:work.id,entityType:work.entity_type,entityId:work.entity_id,eventType:work.event_type,eventVersion:work.event_version,destination:'vip_crypto' as const,customerId:null,attemptCount:1,leaseToken:'fixture-lease'};
 const truth={entityType:'lifecycle_event',entityId:row.id,eventType:row.event_type,eventVersion:1,occurredAt:new Date(now).toISOString(),customerId:null,payload:row.payload};
 assert.equal(audienceAllows(claim,truth),true);assert.equal(audienceAllows({...claim,destination:'free'},truth),false);assert.equal(audienceAllows({...claim,destination:'vip_forex_gold'},truth),false);
 const receipt=await processCanonicalPublicationBatch({workerId:'test',limit:1,store:{claim:async()=>[claim],loadTruth:async()=>truth,reservePart:async()=>({state:'SEND',deliveryId:'injected-part'}),finishPart:async()=>{},finishClaim:async(x:any)=>{await db.query('update signal_publication_work set status=$1 where id=$2',[x.state,claim.id]);}},transport:{send:async(x:any)=>{delivered.push(x.text);return{kind:'accepted',messageId:'injected-worker-only'};}},render:renderCanonicalTruth});
 assert.equal(receipt[0].state,'SENT');assert.equal((await db.query('select status from signal_publication_work where id=$1',[claim.id])).rows[0].status,'SENT');
 assert.throws(()=>renderCanonicalTruth({entityType:'lifecycle_event',entityId:'x',eventType:'CONDITIONAL_SETUP',eventVersion:1,occurredAt:iso(1),customerId:null,payload:row.payload},'free'),/SCOPE/);
 // Real transaction rollback if enqueue fails; the state must not survive without its outbox event.
 await db.exec("create function test_reject_outbox() returns trigger language plpgsql as $$begin raise exception 'INJECTED_QUEUE_FAILURE';end$$;create trigger reject_outbox before insert on signal_publication_work for each row execute function test_reject_outbox();");
 await assert.rejects(store.save(setup('ETHUSDT','rollback'),0),/INJECTED_QUEUE_FAILURE/);
 assert.equal((await db.query("select * from conditional_signal_setups where id='rollback'")).rows.length,0);
 await db.exec("drop trigger reject_outbox on signal_publication_work;update conditional_signal_setups set created_at=now()-interval '2 hours';");
 await admitConditionalBatch(store,[setup('ETHUSDT','eth'),setup('SOLUSDT','sol'),setup('XRPUSDT','xrp'),setup('ADAUSDT','ada')],now);
 assert.equal((await db.query("select * from conditional_signal_setups where status='WAITING'")).rows.length,3);
 console.log('Actual single-session embedded PostgreSQL; not deployed Auth/PostgREST, independent sessions or real Telegram.');
 }finally{await db.close();}
});
