import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {bootstrapMissionDatabase,missionStore} from './mission1-database-fixture.ts';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {observeConditionalSymbol,admitConditionalBatch} from '../../supabase/functions/_shared/conditional-signal-runtime.ts';
import {frozenStrategyConfirmation} from '../../supabase/functions/_shared/frozen-strategy-confirmation.ts';
import {watchedMarketContext} from '../../supabase/functions/_shared/watched-market-context.ts';
import {enterConditionalAtOpen} from '../../supabase/functions/_shared/conditional-signal-service.ts';
import {assertConfirmedEntry} from '../../supabase/functions/_shared/confirmed-entry.ts';
import {renderCanonicalTruth} from '../../supabase/functions/_shared/canonical-publication-runtime.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const release='11111111-1111-4111-8111-111111111111',w=300000;
function setup(at:number){
 const rows:StrategyCandle[]=Array.from({length:240},(_,i)=>{const c=1000+i;return{symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'CONTROLLED_FEED',open_time:new Date(at-(240-i)*w).toISOString(),open:c-4,high:c+5,low:c-5,close:c,volume:1000};});rows.at(-1)!.open=rows.at(-1)!.close-.01;
 const d=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,params:{entry_engine_version:1,tp2_r:3}}]).find(d=>d.id==='crypto.micro-scalper')!,cfg={...d.config,config_source:`measured_release:${release}`},definition={...d,config:cfg};
 const higher=closedAggregate(rows,15,new Date(at).toISOString()),discovery=discoverWatchedStrategies({definitions:[definition],symbol:'BTCUSDT',tf:'5m',rows,higher,now:at});
 assert.equal(discovery.observations[0].decision,'CONDITIONAL_WATCH');return {rows,d,cfg,definition,s:discovery.setups[0]};
}
async function promoteTestConfiguration(db:PGlite,d:any,cfg:any){await db.query('insert into strategy_release_candidates values($1,$2,$3,$4)',[release,d.id,'PROMOTED',JSON.stringify({strategies:[{id:d.id,version:d.version,enabled:true,minScore:cfg.min_score,minRiskReward:cfg.min_rr,maxBarsInTrade:cfg.max_bars_in_trade,symbols:['BTCUSDT'],timeframes:['5m'],parameters:cfg.params}]})]);}

test('persistent genuine conditional evaluator → restart → confirmation → same projected/Telegram signal → conservative outcome',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-04T13:55:00Z')});const db=new PGlite();try{
 await bootstrapMissionDatabase(db);const at=Date.now(),{rows,d,cfg,s}=setup(at),frozen=structuredClone(s.origin);await promoteTestConfiguration(db,d,cfg);let store=missionStore(db);
 assert.equal((await admitConditionalBatch(store,[s],at)).admitted,1);assert.equal((await db.query('select * from signals')).rows.length,0);
 assert.throws(()=>assertConfirmedEntry({id:s.id,status:'waiting',created_at:new Date(at).toISOString(),expires_at:s.expiresAt},null,at),/NOT_CONFIRMED/);
 assert.equal(await store.save({...s,version:2,evaluationOutcome:'DATA_UNAVAILABLE',observedAt:new Date(at).toISOString()},1),true);
 store=missionStore(db);assert.equal((await store.open(s.symbol,s.timeframe))[0].evaluationOutcome,'DATA_UNAVAILABLE');
 t.mock.timers.tick(w);const b={...rows.at(-1)!,open_time:new Date(at).toISOString(),open:s.trigger-1,high:s.trigger+3,low:s.trigger-3,close:s.trigger+1},fresh=[...rows,b],higher=closedAggregate(fresh,15,new Date(Date.now()).toISOString());
 await observeConditionalSymbol(store,s.symbol,'5m',fresh,Date.now(),{qualification:()=>true,intelligence:(prefix,at)=>watchedMarketContext(prefix,at,{higher}),confirmation:(saved,prefix,at)=>frozenStrategyConfirmation(saved,prefix,at,{higher})});
 const armed=(await store.open(s.symbol,s.timeframe))[0];assert.equal(armed.status,'ARMED',armed.result);assert.equal(armed.confirmationEvidence?.evaluatorOutcome,'CONFIRMED');assert.equal(armed.confirmationEvidence?.closedBar.close,b.close);assert.deepEqual(armed.origin,frozen);
 const opening={...b,open_time:new Date(Date.now()).toISOString(),open:s.trigger+.2};t.mock.timers.tick(1);
 const active=enterConditionalAtOpen(armed,opening,Date.now());assert.equal(active.status,'ACTIVE',active.result);assert.equal(await store.save(active,armed.version),true);
 const signal=(await db.query<any>('select * from signals')).rows[0];assert.equal(signal.status,'active');assert.equal((await db.query<any>('select state from conditional_signal_setups')).rows[0].state.watchOutcome,'CONFIRMED');
 const event=(await db.query<any>("select payload from test_events where payload->'state'->>'status'='ACTIVE'")).rows[0].payload;assert.equal(event.confirmed_signal_id,signal.id);
 // A measured research release does not grant admission to the commercial VIP lineup.
 assert.throws(()=>renderCanonicalTruth({entityType:'lifecycle_event',entityId:'conditional-event',eventType:'CONDITIONAL_SETUP',eventVersion:1,occurredAt:new Date().toISOString(),customerId:null,payload:event},'vip_crypto'),/VIP_STRATEGY_NOT_ADMITTED/);
 assert.equal(await store.save(active,armed.version),true);assert.equal((await db.query('select * from signals')).rows.length,1);
 t.mock.timers.tick(w);const stopped={...opening,high:s.tp2+1,low:s.stop-1,close:s.trigger};await observeConditionalSymbol(store,s.symbol,'5m',[...fresh,stopped],Date.now());
 assert.equal((await db.query<any>('select status from signals')).rows[0].status,'sl_hit');assert.equal((await db.query<any>('select state from conditional_signal_setups')).rows[0].state.result,'STOP_FIRST_AMBIGUOUS_BAR');
 }finally{await db.close();}
});

test('persistent conditional rejection matrix: invalidated, expired, stale, missing data and conflicting opportunities never project',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-04T13:55:00Z')});const db=new PGlite();try{
 await bootstrapMissionDatabase(db);const at=Date.now(),{rows,s}=setup(at),store=missionStore(db);
 const conflict={...s,id:s.id+':opposite',side:'sell' as const,stop:2*s.trigger-s.stop,tp1:2*s.trigger-s.tp1,tp2:2*s.trigger-s.tp2};const rejected=await admitConditionalBatch(store,[s,conflict],at);assert.equal(rejected.admitted,0);assert.equal((await db.query('select * from signals')).rows.length,0);
 assert.equal((await admitConditionalBatch(store,[s],at)).admitted,1);
 // A gap is nonterminal and cannot advance the frozen candle watermark.
 const missing={...rows.at(-1)!,open_time:new Date(at+w).toISOString()};await observeConditionalSymbol(store,s.symbol,'5m',[missing],at+2*w);assert.equal((await store.open(s.symbol,s.timeframe))[0].status,'WAITING');
 const invalid={...rows.at(-1)!,open_time:new Date(at).toISOString(),low:s.stop-1};t.mock.timers.tick(w);await observeConditionalSymbol(store,s.symbol,'5m',[...rows,invalid],Date.now());assert.equal((await db.query<any>('select status from conditional_signal_setups')).rows[0].status,'INVALIDATED');
 assert.equal((await db.query('select * from signals')).rows.length,0);
 // Separate original opportunity, admitted after the per-symbol analysis cooldown.
 t.mock.timers.tick(3600000*5);const later=setup(Date.now()),expired={...later.s,id:'expiry-matrix',expiresAt:new Date(Date.now()+1000).toISOString(),entryDecision:{...later.s.entryDecision!,opportunityId:'expiry-matrix'}};assert.equal(await store.admit(expired),true);t.mock.timers.tick(1001);assert.equal(await store.expire(expired.symbol,expired.timeframe,Date.now()),1);assert.equal((await db.query<any>("select status from conditional_signal_setups where id='expiry-matrix'")).rows[0].status,'EXPIRED');
 assert.equal((await db.query('select * from signals')).rows.length,0);
 const stale=discoverWatchedStrategies({definitions:[later.definition],symbol:'BTCUSDT',tf:'5m',rows,now:Date.now()});assert.equal(stale.setups.length,0);
 }finally{await db.close();}
});
