import {authorizeHistoricalResearch} from '../../supabase/functions/_shared/historical-research-authorization.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {bootstrapMissionDatabase,missionStore} from '../conditionalSignals/mission1-database-fixture.ts';
import {HistoricalConditionalStore} from '../../supabase/functions/_shared/historical-conditional-store.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {resolvedWatchState} from '../../supabase/functions/_shared/conditional-signal-runtime.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
test('historical persistence matches migrated production SQL for admission, CAS, immutable plans and terminal outcomes',async t=>{
 const now=Date.parse('2026-11-04T14:00:00Z');t.mock.timers.enable({apis:['Date'],now});
 const db=new PGlite();try{
  await bootstrapMissionDatabase(db);
  const release='11111111-1111-4111-8111-111111111111';
  const rows:StrategyCandle[]=Array.from({length:240},(_,i)=>({symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'CONTROLLED_TEST',open_time:new Date(now-(240-i)*300000).toISOString(),open:996+i,high:1005+i,low:995+i,close:1000+i,volume:1000}));
  const d=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,params:{entry_engine_version:1,tp2_r:3}}]).find(d=>d.id==='crypto.micro-scalper')!,cfg={...d.config,config_source:`measured_release:${release}`};
  const found=discoverWatchedStrategies({definitions:[{...d,config:cfg}],symbol:'BTCUSDT',tf:'5m',rows,higher:closedAggregate(rows,15,new Date(now).toISOString()),now}),s=found.setups[0];assert.equal(s.status,'ACTIVE');
  await db.query('insert into strategy_release_candidates values($1,$2,$3,$4)',[release,d.id,'PROMOTED',JSON.stringify({strategies:[{id:d.id,version:d.version,enabled:true,minScore:cfg.min_score,minRiskReward:cfg.min_rr,maxBarsInTrade:cfg.max_bars_in_trade,symbols:['BTCUSDT'],timeframes:['5m'],parameters:cfg.params}]})]);
  const researchDefinitions=await authorizeHistoricalResearch([d],'database-research-isolation');
  const research=discoverWatchedStrategies({definitions:researchDefinitions,symbol:'BTCUSDT',tf:'5m',rows,higher:closedAggregate(rows,15,new Date(now).toISOString()),now}).setups[0];
  assert.equal(research.entryDecision?.authorizationScope,'RESEARCH');assert.equal(research.entryDecision?.executionEligible,false);
  assert.equal(await missionStore(db).admit(research),false,'research-only immediate events cannot enter the actual live SQL signal projection');
  assert.equal((await db.query('select * from signals')).rows.length,0);
  const sql=missionStore(db),historical=new HistoricalConditionalStore(()=>Date.now());
  assert.equal(await sql.admit(s),true);assert.equal(await historical.admit(s),true);
  assert.equal(await sql.admit(s),false);assert.equal(await historical.admit(s),false);
  assert.deepEqual((await db.query<{state:unknown}>('select state from conditional_signal_setups')).rows[0].state,JSON.parse(JSON.stringify(historical.snapshot().records[0].state)));
  const terminal=resolvedWatchState({...s,version:2,lastBar:new Date(now).toISOString(),status:'CLOSED',exit:s.stop,netR:-1,result:'Controlled stop'});
  t.mock.timers.setTime(now+300000);
  for(const store of [sql,historical]){
   assert.equal(await store.save(terminal,99),false);
   assert.equal(await store.save(terminal,1),true);
   assert.equal(await store.save(terminal,1),true);
   await assert.rejects(()=>store.save({...terminal,version:3,reason:'Rewritten original reason'},2),/IMMUTABLE_SETUP_PLAN/);
   await assert.rejects(()=>store.save({...terminal,version:3,status:'ACTIVE'},2),/TERMINAL/);
  }
  const actual=(await db.query<{state:unknown}>('select state from conditional_signal_setups')).rows[0].state;
  assert.deepEqual(actual,JSON.parse(JSON.stringify(historical.snapshot().records[0].state)));
  assert.equal((await db.query('select * from canonical_lifecycle_events')).rows.length,historical.snapshot().events.length);
 }finally{await db.close();t.mock.timers.reset();}
});
