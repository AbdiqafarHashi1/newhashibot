import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
import {bootstrapMissionDatabase,missionStore} from '../conditionalSignals/mission1-database-fixture';
import {GOLD_RSI_TRAILING,GOLD_TRAILING_POLICY} from '../../supabase/functions/_shared/atr-trailing-policy';
import {advanceConditionalSetup} from '../../supabase/functions/_shared/conditional-signal-service';
import {HistoricalConditionalStore} from '../../supabase/functions/_shared/historical-conditional-store';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery';
import {goldRsiTrailingDefinition} from '../../supabase/functions/_shared/gold-rsi-trailing';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities';
// Authentic native rows are read from the same immutable fixture as evaluator tests.
// SQL publication uses a controlled measured-release identity, never a real account.
test('actual SQL and replay persist tightened stops, reject rebasing/loosening, retain immutable origin and deduplicate updates',async t=>{
 const f=JSON.parse(readFileSync('tests/operations/fixtures/goldRsiPipeline.json','utf8')),now=Date.parse(f.at);t.mock.timers.enable({apis:['Date'],now});
 const db=new PGlite();try{await bootstrapMissionDatabase(db);const release='11111111-1111-4111-8111-111111111111',d=goldRsiTrailingDefinition();d.lifecycle='ENABLED';d.publicationMode='LIVE';d.certification='PRODUCTION';d.config={...d.config,enabled:true,config_source:'measured_release:'+release,params:{entry_engine_version:1}};
 const found=discoverWatchedStrategies({definitions:[d],symbol:'XAUUSD',tf:'15m',rows:f.rows,now});assert.equal(found.setups.length,1);const s=found.setups[0];assert.equal(s.strategy,GOLD_RSI_TRAILING);assert.deepEqual(s.origin?.plan.management_intent.trailing_policy,GOLD_TRAILING_POLICY);
 await db.query('insert into strategy_release_candidates values($1,$2,$3,$4)',[release,d.id,'PROMOTED',JSON.stringify({strategies:[{id:d.id,version:d.version,enabled:true,minScore:75,minRiskReward:4.4,maxBarsInTrade:96,symbols:['XAUUSD'],timeframes:['15m'],parameters:d.config.params}]})]);
 const historical=new HistoricalConditionalStore(()=>Date.now()),sql=missionStore(db);for(const store of [sql,historical])assert.equal(await store.admit(s),true);
 const side=s.side==='buy'?1:-1,risk=Math.abs(s.fill!-s.stop),last=f.rows.at(-1),bar={...last,open_time:new Date(now).toISOString(),open:s.fill!,high:side===1?s.fill!+2.5*risk:s.fill!+.1*risk,low:side===1?s.fill!-.1*risk:s.fill!-2.5*risk,close:s.fill!+side*2*risk};
 const next=advanceConditionalSetup(s,bar,[...f.rows,bar]);assert(next.trailingState);t.mock.timers.setTime(now+900000);
 for(const store of [sql,historical]){assert.equal(await store.save(next,s.version),true);assert.equal(await store.save(next,s.version),true);const bad={...next,version:next.version+1,lastBar:new Date(now+900000).toISOString(),trailingState:{...next.trailingState!,stop:s.stop-side*risk}};await assert.rejects(()=>store.save(bad,next.version),/TRAILING_STATE/);}
 assert.equal((await db.query('select state from conditional_signal_setups')).rows[0].state.trailingState.stop,next.trailingState!.stop);
 }finally{await db.close();t.mock.timers.reset()}
});
