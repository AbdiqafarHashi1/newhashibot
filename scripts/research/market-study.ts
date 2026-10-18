/** Offline research only. Does not publish, certify, calibrate or execute. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {calculateActiveIndicators,createApprovedReplayRegistry,type ApprovedReplayConfiguration} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {admitHistoricalCandles,runBoundedValidation} from '../../supabase/functions/_shared/phase-l-validation.ts';
import {evaluateReplayOutcome,summarizeReplayOutcomes,type ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';
import type {StrategyCandle,StrategyEvaluationContext} from '../../supabase/functions/_shared/professional-strategies.ts';
const [configurationFile,output,...files]=process.argv.slice(2);
if(!configurationFile||!output||!files.length)throw new Error('Usage: node --import tsx scripts/research/market-study.ts <research-config.json> <report.json> <dataset.json> [...]');
const configurationRaw=await readFile(configurationFile,'utf8'),configuration=JSON.parse(configurationRaw) as ApprovedReplayConfiguration;
if(!configuration.outcomeAssumptions)throw new Error('EXPLICIT_COST_AND_FILL_ASSUMPTIONS_REQUIRED');
const configurationHash=createHash('sha256').update(configurationRaw).digest('hex');
const datasets=[];
for(const file of files){
 const raw=await readFile(file,'utf8'),input=JSON.parse(raw) as StrategyCandle[];
 const symbol=input[0]?.symbol,timeframe=input[0]?.timeframe;
 if(timeframe!=='1h'||!symbol?.endsWith('USDT')||input.some(c=>c.symbol!==symbol||c.timeframe!==timeframe||c.source!=='BINANCE_SPOT_ARCHIVE'))throw new Error('REQUIRES_SINGLE_SYMBOL_HOURLY_BINANCE_SPOT_DATA');
 const end=new Date(Date.parse(input.at(-1)!.open_time)+3600000).toISOString(),admission=admitHistoricalCandles(input,timeframe,end);
 if(admission.exclusions.length||admission.candles.length<200)throw new Error('INCOMPLETE_OR_INVALID_DATASET');
 const datasetHash=createHash('sha256').update(raw).digest('hex'),registry=createApprovedReplayRegistry(configuration,symbol,timeframe),contexts:StrategyEvaluationContext[]=[];
 for(let i=199;i<admission.candles.length;i++){
  const candles=admission.candles.slice(i-199,i+1);
  contexts.push({symbol,market:'crypto',timeframe,candles,indicators:calculateActiveIndicators(candles),evaluated_at:new Date(Date.parse(candles.at(-1)!.open_time)+3600000).toISOString()});
 }
 const decisions=runBoundedValidation({runId:datasetHash.slice(0,12),mode:'REPLAY',dataset:{id:file,source:'BINANCE_SPOT_ARCHIVE',provenance:file,sha256:datasetHash,timezone:'UTC'},configurationVersion:configuration.version,parameterVersion:configurationHash,symbol,market:'crypto',timeframe,start:contexts[0].evaluated_at,end,maxCycles:10000,minimumScore:0,allowedGrades:['A+','A','B'],minSignalGrade:configuration.minSignalGrade},registry,contexts);
 const outcomes:ReplayOutcome[]=[],regimes:Record<string,{cycles:number;winners:number;outcomes:ReplayOutcome[]}>={};
 const rejectionCounts:Record<string,number>={};
 for(let i=0;i<decisions.length;i++){
  const d=decisions[i],regime=contexts[i].indicators.regime,group=regimes[regime]??={cycles:0,winners:0,outcomes:[]};group.cycles++;
  for(const candidate of d.candidates)for(const reason of candidate.rejectionReasons)rejectionCounts[reason]=(rejectionCounts[reason]??0)+1;
  if(!d.arbitration.winner)continue;group.winners++;
  const winner=d.arbitration.winner,strategy=configuration.strategies.find(s=>s.id===winner.strategyId)!;
  const outcome=evaluateReplayOutcome(winner,admission.candles,d.candleCloseTime,{...configuration.outcomeAssumptions,maxBarsInTrade:strategy.maxBarsInTrade});
  if(outcome){outcomes.push(outcome);group.outcomes.push(outcome);}
 }
 const compact=(rows:ReplayOutcome[])=>{const {realizedEquityCurve,...metrics}=summarizeReplayOutcomes(rows);return metrics;};
 datasets.push({file,datasetHash,symbol,timeframe,start:input[0].open_time,end,bars:input.length,cycles:decisions.length,noTradeCycles:decisions.filter(d=>!d.arbitration.winner).length,metrics:compact(outcomes),regimes:Object.fromEntries(Object.entries(regimes).map(([key,g])=>[key,{cycles:g.cycles,winners:g.winners,metrics:compact(g.outcomes)}])),rejectionCounts});
}
await writeFile(output,JSON.stringify({status:'RESEARCH_ONLY',configurationHash,configuration,limitations:['Fixed configuration, no parameter search; independent chronological months are not an unseen prospective holdout.','Spot OHLC does not certify futures, funding, live fills, execution isolation or portfolio returns.','Independent overlapping signals, not an account simulation. No cross-month exits; unresolved trades stay OPEN.','Hourly intrabar collisions use configured stop-first approximation. No profitability guarantee.'],datasets},null,2)+'\n');
console.log(JSON.stringify(datasets.map(d=>({file:d.file,...d.metrics})),null,2));
