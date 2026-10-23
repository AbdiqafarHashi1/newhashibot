import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {closedAggregate,classifyOpportunity,evaluateRegimeOpportunity,regimeResearchDefinitions,REGIME_IDS} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {createApprovedReplayRegistry,calculateActiveIndicators,type ApprovedReplayConfiguration} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {qualifyActiveCandidate} from '../../supabase/functions/_shared/active-qualification.ts';
import type {StrategyCandle,StrategyEvaluationContext} from '../../supabase/functions/_shared/professional-strategies.ts';
const base=Date.parse('2026-01-01T00:00:00Z');
function candles(kind:'trend'|'range'):StrategyCandle[]{return Array.from({length:110},(_,i)=>{const price=kind==='trend'?100+i*.15+Math.sin(i*.6)*.5:100+Math.sin(i*.5)*1.5;return{symbol:'BTCUSDT',market_type:'crypto',timeframe:'1h',open_time:new Date(base+i*3600000).toISOString(),open:price-.1,close:price,high:price+.4,low:price-.4,volume:100,source:'SYNTHETIC_TEST_ONLY'};});}
function context(rows:StrategyCandle[],at=base+110*3600000):StrategyEvaluationContext{return{symbol:'BTCUSDT',market:'crypto',timeframe:'1h',candles:rows,indicators:calculateActiveIndicators(rows),evaluated_at:new Date(at).toISOString()};}
const trend=context(candles('trend')),range=context(candles('range'));
assert.equal(classifyOpportunity(trend).regime,'TREND_UP');assert.equal(classifyOpportunity(range).regime,'RANGE');
for(const c of [trend,range]){
 const opposite=evaluateRegimeOpportunity(c===trend?REGIME_IDS[1]:REGIME_IDS[0],c);assert.equal(opposite.status,'rejected');
 for(const bad of [context(c.candles,candles('trend').length*3600000+base-3600000),context(c.candles,base+113*3600000),context(c.candles.filter((_,i)=>i!==80)),context(c.candles.map((r,i)=>i===95?{...r,high:NaN}:r))])assert.equal(classifyOpportunity(bad).regime,'UNAVAILABLE');
}
const shock=structuredClone(trend);shock.candles=shock.candles.map((c,i)=>i===109?{...c,high:c.close+30,low:c.close-30}:c);assert.equal(classifyOpportunity(shock).regime,'SHOCK');for(const id of REGIME_IDS)assert.equal(evaluateRegimeOpportunity(id,shock).status,'rejected');
const aggregate=closedAggregate(trend.candles,240,trend.evaluated_at);assert(aggregate.every(r=>Date.parse(r.open_time)+4*3600000<=Date.parse(trend.evaluated_at)));assert.equal(closedAggregate(trend.candles,240,new Date(base+107*3600000).toISOString()).at(-1)?.open_time,new Date(base+100*3600000).toISOString());
const fourRows=candles('trend').map((r,i)=>({...r,timeframe:'4h',open_time:new Date(base+i*14400000).toISOString()}));const fourContext={...context(fourRows,base+110*14400000),timeframe:'4h'};
const definitions=regimeResearchDefinitions();assert(definitions.every(d=>d.lifecycle==='DISABLED'&&d.publicationMode==='SHADOW'&&d.certification==='RESEARCH'&&!d.config.enabled));
for(const id of REGIME_IDS){
 assert.equal(evaluateRegimeOpportunity(id,trend,{targetR:NaN}).rejection_reason,'INVALID_PARAMETERS');
 assert.equal(evaluateRegimeOpportunity(id,trend,{unknown:1}).rejection_reason,'INVALID_PARAMETERS');
 const subject=id===REGIME_IDS[2]?fourContext:trend;
 const item={id,version:'1.0.0',enabled:true,minScore:75,minRiskReward:1.5,maxBarsInTrade:48,symbols:['BTCUSDT'],timeframes:[subject.timeframe],parameters:{}};
 const config:ApprovedReplayConfiguration={version:'test',minSignalGrade:'A',strategies:[item]};const registry=createApprovedReplayRegistry(config,'BTCUSDT',subject.timeframe);
 assert.throws(()=>createApprovedReplayRegistry({...config,strategies:[{...item,version:'9.0.0'}]},'BTCUSDT','1h'),/VERSION/);
 assert.throws(()=>createApprovedReplayRegistry(config,'SOLUSDT','1h'),/NO_APPROVED/);
 const direct=evaluateRegimeOpportunity(id,subject),through=registry.evaluate(subject)[0].professional.legacy;assert.deepEqual(through,direct);
 if(direct.status==='candidate'){assert.equal(direct.score_breakdown.score_is_probability,false);assert.equal(qualifyActiveCandidate(direct,registry.list()[0].config,'A').passed,true);}
}
const setups=JSON.parse(readFileSync('tests/release1/regime-fixtures.json','utf8')) as {id:typeof REGIME_IDS[number];context:StrategyEvaluationContext;expected:ReturnType<typeof evaluateRegimeOpportunity>}[];
assert(setups.length>=3);for(const fixture of setups){const actual=evaluateRegimeOpportunity(fixture.id,fixture.context);assert.equal(actual.status,'candidate');assert.deepEqual(actual,fixture.expected);assert.equal(actual.score_breakdown.score_is_probability,false);assert.equal(evaluateRegimeOpportunity(fixture.id,fixture.context,{estimatedCostBps:1000}).rejection_reason,'COST_OR_STOP_INFEASIBLE');}
assert.match(readFileSync('supabase/functions/market-scanner/index.ts','utf8'),/\.\.\.regimeResearchDefinitions\(\)/);
const refused=spawnSync(process.execPath,['--import','tsx','scripts/release1/regime/certify.ts','validate','/missing-sequestered-data','/tmp/should-not-exist-regime-report.json','docs/release1/regime/frozen-candidates.json'],{encoding:'utf8'});
assert.notEqual(refused.status,0);assert.match(refused.stderr,/DEVELOPMENT_GATE_NOT_PASSED_KEEP_VALIDATION_SEQUESTERED/);
const held=spawnSync('python3',['scripts/release1/regime/download-binance.py','--phase','holdout','--output','/tmp/hashibot-held-regime-data','--frozen-manifest','docs/release1/regime/frozen-candidates.json'],{encoding:'utf8'});
assert.notEqual(held.status,0);assert.match(held.stderr,/Validation must pass before fetching holdout/);
console.log('Regime specialist routing, shock/stale/gap/open rejection, closed HTF, frozen version, replay parity and research-only publication boundary passed');
