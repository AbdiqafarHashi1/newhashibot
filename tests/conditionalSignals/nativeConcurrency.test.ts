import {test} from 'node:test';import assert from 'node:assert/strict';
import {bootstrapMissionDatabase} from './mission1-database-fixture.ts';
import {conditionalMessage,type ConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service.ts';
// Explicit disposable native runtime only. No deployed database or provider access.
const modulePath=process.env.HASHIBOT_MISSION1_EMBEDDED_PG;
test('native PostgreSQL independent sessions: admission, confirmation/invalidation race, expiry and rollback',{skip:!modulePath},async()=>{
 const {default:EmbeddedPostgres}=await import(modulePath!);
 const pg=new EmbeddedPostgres({databaseDir:'/tmp/hashibot-mission1-native-db',port:55489,user:'postgres',password:'disposable-engineering-only',persistent:false,createPostgresUser:false,autoRehydrateSymlinks:true,onLog:()=>{},onError:(e:unknown)=>{if(e instanceof Error)console.error(e.message);}});
 await pg.initialise();await pg.start();const a=pg.getPgClient(),b=pg.getPgClient();await Promise.all([a.connect(),b.connect()]);
 try{
 await bootstrapMissionDatabase({exec:async sql=>a.query(sql)});
 const at=Date.now(),iso=(n:number)=>new Date(at+n).toISOString();
 const s:ConditionalSetup={id:'native-race',symbol:'BTCUSDT',timeframe:'15m',track:'INTRADAY',side:'buy',strategy:'analysis-only-test',variant:'TREND_PULLBACK',policy:'conditional-signals/v1',sourceClose:iso(-900000),source:'TEST_ONLY',trigger:100,stop:90,tp1:110,tp2:120,expiresAt:iso(900000),holdBars:48,score:85,reason:'Controlled native concurrency fixture',status:'WAITING',version:1,lastBar:iso(-1800000)};
 const admit=(c:any,state:ConditionalSetup)=>c.query('select admit_conditional_signal_setup($1::jsonb,$2) ok',[JSON.stringify(state),conditionalMessage(state)]);
 const admitted=await Promise.all([admit(a,s),admit(b,s)]);assert.deepEqual(admitted.map(r=>r.rows[0].ok).sort(),[false,true]);
 const armed={...s,status:'ARMED' as const,version:2,lastBar:iso(-900000),armedAt:iso(0)},invalid={...s,status:'INVALIDATED' as const,version:2,lastBar:iso(-900000),result:'Original stop invalidated.'};
 const save=(c:any,state:ConditionalSetup,version:number)=>c.query('select commit_conditional_signal_setup($1::jsonb,$2,$3) ok',[JSON.stringify(state),version,conditionalMessage(state)]);
 const race=await Promise.allSettled([save(a,armed,1),save(b,invalid,1)]);assert.equal(race.filter(r=>r.status==='fulfilled'&&r.value.rows[0].ok).length,1);
 assert.equal(Number((await a.query('select count(*) n from conditional_setup_history')).rows[0].n),2);
 assert.equal(Number((await a.query('select count(*) n from test_events')).rows[0].n),2);
 const expiring={...s,id:'native-expiry',symbol:'ETHUSDT',expiresAt:iso(250)};assert.equal((await admit(a,expiring)).rows[0].ok,true);
 await new Promise(r=>setTimeout(r,300));const expired={...expiring,status:'EXPIRED' as const,version:2,observedAt:new Date().toISOString()};
 const late={...expiring,status:'ARMED' as const,version:2,lastBar:iso(-900000),armedAt:iso(0)};
 const expiry=await Promise.allSettled([save(a,expired,1),save(b,late,1)]);assert.equal(expiry[0].status,'fulfilled');assert.equal((await a.query("select status from conditional_signal_setups where id='native-expiry'")).rows[0].status,'EXPIRED');
 assert.equal((await a.query('select version()')).rows.length,1);console.log((await a.query('select version() v')).rows[0].v);
 }finally{await Promise.all([a.end(),b.end()]);await pg.stop();}
});
