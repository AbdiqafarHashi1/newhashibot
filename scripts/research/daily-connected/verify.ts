import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runMultiDatasetScannerReplay} from '../../../supabase/functions/_shared/multi-dataset-scanner-replay.ts';
import {dailyConfiguration,DAILY_ASSUMPTIONS} from '../../../supabase/functions/_shared/daily-trend-profile.ts';
import {evaluateReplayOutcome,summarizeReplayOutcomes,type ReplayOutcome} from '../../../supabase/functions/_shared/replay-outcomes.ts';
import type {ArbitrationCandidate} from '../../../supabase/functions/_shared/arbitrator.ts';
import type {StrategyCandle} from '../../../supabase/functions/_shared/professional-strategies.ts';
const fixture=JSON.parse(gunzipSync(readFileSync('docs/research/daily-connected/native-fixtures.json.gz')).toString())as {from:string;until:string;sources:unknown[];assets:{symbol:string;candles:StrategyCandle[];originalExpected:{signalAt:number;entryAt:number;entry:number;initialStop:number;exit:number;reason:string}[]}[]};
const outcomes:ReplayOutcome[]=[],selections:{candidate:ArbitrationCandidate;outcome:ReplayOutcome}[]=[];let compared=0;
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),cfg=dailyConfiguration(),cfgHash=hash(cfg);
await runMultiDatasetScannerReplay({runId:'genuine-daily',configuration:cfg,configurationHash:cfgHash,datasets:fixture.assets.map(a=>({id:a.symbol+'-1d',hash:hash(a.candles),configurationHash:cfgHash,source:'BINANCE_KLINES',symbol:a.symbol,market:'crypto',timeframe:'1d',candles:a.candles})),start:new Date(Date.parse(fixture.from)+86400000).toISOString(),end:'2026-09-30T00:00:00.000Z',cooldownMs:0,maxCycles:1500,lifecycleAssumptions:DAILY_ASSUMPTIONS,onEvidence:async row=>{
 const winner=(row.selection.cycle?.arbitration as {winner?:ArbitrationCandidate})?.winner;if(!winner)return;
 const asset=fixture.assets.find(a=>a.symbol===winner.symbol)!;
 const result=evaluateReplayOutcome(winner,asset.candles,row.event.closedAt,DAILY_ASSUMPTIONS);assert.ok(result);outcomes.push(result);selections.push({candidate:winner,outcome:result});
 const expected=asset.originalExpected.find(t=>t.entryAt===Date.parse(result.entryTime));assert.ok(expected,'canonical entry must exist in original continuous simulation '+result.entryTime);assert.ok(Math.abs(expected.initialStop-winner.stop)<1e-8);assert.equal(expected.entry,result.entryPrice);
 if(expected.reason!=='DECLARED_STAGE_END_LIQUIDATION'){assert.ok(result.exitPrice!==null);assert.ok(Math.abs(expected.exit-result.exitPrice)<1e-8);compared++;}
 if(result.netR!==null){const risk=result.entryPrice-winner.stop;assert.ok(Math.abs((result.exitPrice!-result.entryPrice-result.entryPrice*.0026)/risk-result.netR)<1e-10);assert.ok(Math.abs(result.cashFlowEvents.reduce((n,e)=>n+e.realizedR,0)-result.netR)<1e-10);}
 }});
const bySymbol=fixture.assets.map(a=>({symbol:a.symbol,metrics:summarizeReplayOutcomes(outcomes.filter(o=>o.symbol===a.symbol))}));
assert.ok(compared>15);for(const asset of fixture.assets){const expected=asset.originalExpected.filter(t=>t.reason!=='DECLARED_STAGE_END_LIQUIDATION');assert.equal(outcomes.filter(o=>o.symbol===asset.symbol&&o.netR!==null).length,expected.length,'no original closed trade dropped');}
const positive=outcomes.filter(o=>o.netR!==null).map(o=>{return (o.exitPrice!-o.entryPrice)/o.entryPrice-.0026;});const pf=(v:number[])=>v.reduce((n,x)=>n+Math.max(x,0),0)/-v.reduce((n,x)=>n+Math.min(x,0),0);
const report={classification:'GENUINE_DAILY_REGISTRY_ARBITRATION_LIFECYCLE_PARITY_ALREADY_OBSERVED_DATA',sourceHashes:Object.fromEntries(['daily-trend-contract.ts','daily-trend.ts','daily-trend-outcome.ts','daily-trend-profile.ts','replay-outcomes.ts','phase-l-validation.ts','active-qualification.ts','arbitrator.ts','scanner-replay-lifecycle.ts','multi-dataset-scanner-replay.ts','signal-ensemble-selection.ts','active-validation-runtime.ts','scanner-market-context.ts'].map(p=>['supabase/functions/_shared/'+p,createHash('sha256').update(readFileSync('supabase/functions/_shared/'+p)).digest('hex')])),sources:fixture.sources,configuration:cfg,configurationHash:cfgHash,comparedClosedTrades:compared,metrics:summarizeReplayOutcomes(outcomes),equalNotionalClosedReturnPF:pf(positive),bySymbol,selections,publication:false,execution:false};
writeFileSync('docs/research/daily-connected/evidence.json.gz',gzipSync(JSON.stringify(report)));writeFileSync('docs/research/daily-connected/summary.json',JSON.stringify({...report,selections:undefined},null,2)+'\n');console.log(JSON.stringify({compared,closed:report.metrics.resolvedCount,open:report.metrics.openCount,netRPF:report.metrics.profitFactor,equalNotionalPF:report.equalNotionalClosedReturnPF,bySymbol:bySymbol.map(s=>({symbol:s.symbol,closed:s.metrics.resolvedCount,pf:s.metrics.profitFactor}))}));
