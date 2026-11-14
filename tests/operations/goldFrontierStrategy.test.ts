import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {evaluateGoldFrontierCompression,GOLD_FRONTIER_COMPRESSION} from '../../supabase/functions/_shared/gold-frontier-strategies';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog';
import {authorizeHistoricalResearch} from '../../supabase/functions/_shared/historical-research-authorization';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery';
const fixtures=JSON.parse(readFileSync('tests/operations/fixtures/goldFrontier.json','utf8'));
const context=(f:any)=>({symbol:'XAUUSD',market:'forex',timeframe:'15m',candles:f.rows,indicators:{},evaluated_at:f.at} as any);
test('real native closed-bar fixtures match frozen compression direction and geometry',()=>{
 for(const f of fixtures){const r=evaluateGoldFrontierCompression(context(f));assert.equal(r.status==='candidate'?(r.direction==='buy'?1:-1):0,f.side);if(f.side){assert.equal(r.tp1,r.tp2);assert.equal(r.risk_reward,5);const last=f.rows.at(-1),stop=f.side===1?Math.min(last.close-1.5*f.atr,f.structure):Math.max(last.close+1.5*f.atr,f.structure);assert(Math.abs(r.stop_loss-stop)<1e-7);}}
 const mt5=context(fixtures[0]);mt5.candles=structuredClone(mt5.candles).map((b:any)=>{b.source='mt5_hashibridge:dedicated-test-feed';for(const k of ['ask_open','ask_high','ask_low','ask_close'])delete b[k];return b});assert.equal(evaluateGoldFrontierCompression(mt5).status,'candidate');
 const bad=context(fixtures[0]);bad.candles=structuredClone(bad.candles);bad.candles[0].ask_open=null;assert.equal(evaluateGoldFrontierCompression(bad).status,'rejected');
});
test('new compression remains disabled without an exact measured release',async()=>{
 const d=watchedStrategyCatalog().find(d=>d.id===GOLD_FRONTIER_COMPRESSION)!;assert(d);assert.equal(d.config.enabled,false);assert.equal(d.publicationMode,'SHADOW');
 const [authorized]=await authorizeHistoricalResearch([d],'frontier-fixture');const f=JSON.parse(readFileSync('tests/operations/fixtures/goldFrontierPipeline.json','utf8'));const result=discoverWatchedStrategies({definitions:[authorized],symbol:'XAUUSD',tf:'15m',rows:f.rows,now:Date.parse(f.at)});
 assert(result.observations.some(o=>o.strategy_id===d.id));
 assert.equal(result.setups.length,1);assert.equal(result.setups[0].entryDecision?.kind,'IMMEDIATE_CONFIRMED');assert.equal(result.setups[0].entryDecision?.authorizationScope,'RESEARCH');
 assert(result.setups.every(s=>s.origin.thesis.strategyDefined===true));
});
