import {test} from 'node:test';import assert from 'node:assert/strict';
import {authorizeHistoricalResearch} from '../../supabase/functions/_shared/historical-research-authorization.ts';
import {entryPolicyQualified} from '../../supabase/functions/_shared/entry-decision.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {historicalCandleChecksum,runCanonicalHistoricalReplay,type CanonicalHistoricalDataset} from '../../supabase/functions/_shared/canonical-historical-replay.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const now=Date.parse('2026-11-04T14:00:00Z');
test('explicit research admission uses the real immediate and frozen conditional policy without production execution authority',async()=>{
 const original=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,params:{tp2_r:3}}]).filter(d=>d.id==='crypto.micro-scalper'),definitions=await authorizeHistoricalResearch(original,'controlled-research-safety');
 assert.equal(original[0].config.config_source,'db');assert.equal(entryPolicyQualified(definitions[0].config),false);assert.equal(definitions[0].publicationMode,'SHADOW');
 for(const conditional of [false,true]){
 const rows:StrategyCandle[]=Array.from({length:242},(_,i)=>({symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'CONTROLLED_TEST',open_time:new Date(now-(240-i)*300000).toISOString(),open:996+i,high:1005+i,low:995+i,close:1000+i,volume:1000}));
 if(conditional){rows[239].open=rows[239].close-.01;rows[240].open=1238;rows[240].close=1241;rows[240].high=1243;rows[240].low=1237;rows[241].open=1241;}
 const datasets:CanonicalHistoricalDataset[]=[];for(const candles of [rows,closedAggregate(rows,15,new Date(now+600000).toISOString())])datasets.push({id:candles[0].timeframe,sha256:await historicalCandleChecksum(candles),symbol:'BTCUSDT',timeframe:candles[0].timeframe as '5m'|'15m',candles,provenance:{source:'CONTROLLED_TEST',instrument:'CONTROLLED_TEST',limitations:['Synthetic engineering test only']}});
 const result=await runCanonicalHistoricalReplay({datasets,definitions,start:now,end:now+300000,maxSteps:6});
 const states=result.checkpoint.store.records.map(r=>r.state);assert(states.some(s=>s.watchOutcome==='CONFIRMED'),JSON.stringify(result.evidence));
 assert(states.every(s=>s.entryDecision?.executionEligible===false));assert(states.every(s=>s.entryDecision?.authorizationScope==='RESEARCH'));
 assert(result.checkpoint.store.events.some(e=>e.researchSignalId));assert(result.checkpoint.store.events.every(e=>e.confirmedSignalId===null));
 assert(result.evidence[0].observations.some(o=>o.decision===(conditional?'CONDITIONAL_WATCH':'IMMEDIATE_CONFIRMED')));
 }
});
