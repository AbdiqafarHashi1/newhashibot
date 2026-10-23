import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { calculateActiveIndicators, createApprovedReplayRegistry } from '../../../supabase/functions/_shared/active-validation-runtime.ts';
import { evaluateCostAware, costAwareFeatures, predictUtility } from '../../../supabase/functions/_shared/cost-aware-opportunities.ts';
import { runBoundedValidation } from '../../../supabase/functions/_shared/phase-l-validation.ts';
import { evaluateReplayOutcome, type ReplayOutcome } from '../../../supabase/functions/_shared/replay-outcomes.ts';
import type { StrategyCandle, StrategyEvaluationContext } from '../../../supabase/functions/_shared/professional-strategies.ts';
import { engineHashes, summarize } from '../../release1/regime/replay.ts';
const [root,modelFile,fxCoverage,output,market='crypto']=process.argv.slice(2);
if(!root||!modelFile||!fxCoverage||!output)throw Error('Usage: evaluate.ts <native-data> <models.json> <forex-coverage.json> <report.json>');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
if(!['crypto','forex'].includes(market))throw Error('INVALID_MODEL_MARKET');
const forex=market==='forex',timeframe=forex?'1h':'15m',width=forex?3600000:900000,strategyId=forex?'forex.cost-aware-hourly':'crypto.cost-aware-15m';
const protocolRaw=await readFile(`scripts/research/cost-aware/${forex?'forex-protocol':'protocol'}.json`,'utf8'),p=JSON.parse(protocolRaw),modelRaw=await readFile(modelFile,'utf8'),m=JSON.parse(modelRaw),symbols=p.symbols??p.cryptoSymbols;
if(m.protocolHash!==sha(protocolRaw)||m.publication!==false||m.execution!==false||!forex&&![24,36].includes(m.models.length))throw Error('FROZEN_MODEL_PROTOCOL_INVALID');
if(m.nonlinearProtocolSha256&&m.nonlinearProtocolSha256!==sha(await readFile('scripts/research/cost-aware/nonlinear-protocol.json','utf8')))throw Error('NONLINEAR_PROTOCOL_CHANGED');
const rowsBySymbol=new Map<string,StrategyCandle[]>(),indexBySymbol=new Map<string,Map<string,number>>();
for(const symbol of symbols){
 const sources=m.sources.filter((s:{file:string})=>forex?s.file===`${symbol}-1h.json`:s.file.startsWith(symbol+'-15m-')).sort((a:{file:string},b:{file:string})=>a.file.localeCompare(b.file));
 if(sources.length!==(forex?1:18))throw Error('INCOMPLETE_MODEL_SOURCE');const rows:StrategyCandle[]=[];
 for(const source of sources){const raw=await readFile(`${root}/${source.file}`,'utf8');if(sha(raw)!==source.datasetSha256)throw Error('MODEL_SOURCE_CHANGED');rows.push(...JSON.parse(raw));}
 rowsBySymbol.set(symbol,rows);indexBySymbol.set(symbol,new Map(rows.map((r,i)=>[new Date(Date.parse(r.open_time)+width).toISOString(),i])));
}
const trials=[];
for(const alpha of [...new Set(m.models.map((model:{parameters:{alpha:number}})=>model.parameters.alpha))] as number[]){
 const outcomes:ReplayOutcome[]=[],stressOutcomes:ReplayOutcome[]=[],evidence:unknown[]=[],until=new Map<string,number>(),rejected:Record<string,number>={};
 const forecasts=m.predictions.filter((x:{alpha:number})=>x.alpha===alpha).sort((a:{at:string;symbol:string},b:{at:string;symbol:string})=>a.at.localeCompare(b.at)||a.symbol.localeCompare(b.symbol));
 for(const forecast of forecasts){
  const model=m.models.find((x:{id:string})=>x.id===forecast.modelId);if(!model)throw Error('MODEL_IDENTITY_MISSING');
  const rows=rowsBySymbol.get(forecast.symbol)!,i=indexBySymbol.get(forecast.symbol)!.get(forecast.at);if(i===undefined||i<109)throw Error('FORECAST_DATA_IDENTITY_INVALID');
  const history=rows.slice(i-109,i+1),context:StrategyEvaluationContext={symbol:forecast.symbol,market:forex?'forex':'crypto',timeframe,candles:history,evaluated_at:forecast.at,indicators:calculateActiveIndicators(history)};
  const features=costAwareFeatures(context,model.parameters.estimated_cost_bps),predicted=predictUtility(features.values,model.parameters);
  if(Math.abs(predicted.longNetR-forecast.longNetR)>1e-8||Math.abs(predicted.shortNetR-forecast.shortNetR)>1e-8)throw Error('PYTHON_TYPESCRIPT_INFERENCE_PARITY_FAILED');
  const direct=evaluateCostAware(context,model.parameters);if(direct.status!=='candidate')throw Error('MODEL_DIRECT_CANDIDATE_REJECTED:'+direct.rejection_reason);
  if(Date.parse(forecast.at)<=(until.get(forecast.symbol)??-Infinity)){rejected.ONE_ACTIVE_PER_SYMBOL=(rejected.ONE_ACTIVE_PER_SYMBOL??0)+1;continue;}
  // No outcome may use prices outside this model's monthly evaluation window.
  const future=rows.slice(i+1,i+1+p.maxBars);if(future.length!==p.maxBars||Date.parse(future.at(-1)!.open_time)+width>model.parameters.valid_until_ms){rejected.MONTH_BOUNDARY=(rejected.MONTH_BOUNDARY??0)+1;continue;}
  if(future.some((r,j)=>Date.parse(r.open_time)!==Date.parse(forecast.at)+j*width))throw Error('OUTCOME_QUOTE_GAP');
  const registry=createApprovedReplayRegistry({version:'cost-aware-research/v1',minSignalGrade:'A',strategies:[{id:strategyId,version:'1.0.0',enabled:true,minScore:75,minRiskReward:1.5,maxBarsInTrade:p.maxBars,symbols,timeframes:[timeframe],parameters:model.parameters}]},forecast.symbol,timeframe);
  const [decision]=runBoundedValidation({runId:'cost-aware-development',mode:'REPLAY',dataset:{id:forecast.symbol,source:forex?'DUKASCOPY_BROKER_BID_ASK':'BINANCE_USDM_KLINES',provenance:forex?'RECOVERED_SOURCE_HASHED_BID_ASK':'OFFICIAL_ARCHIVE_CHECKSUM',sha256:sha(JSON.stringify(m.sources)),timezone:'UTC',...(forex?{marketCalendar:'FOREX_24x5' as const}:{})},
    configurationVersion:'cost-aware-research/v1',parameterVersion:sha(JSON.stringify(model.parameters)),symbol:forecast.symbol,market:forex?'forex':'crypto',timeframe,start:forecast.at,end:forecast.at,maxCycles:1,minimumScore:0,allowedGrades:['A'],minSignalGrade:'A'},registry,[context]);
  const winner=decision.arbitration.winner;if(!winner)throw Error('CANONICAL_MODEL_ARBITRATION_REJECTED:'+JSON.stringify(decision.arbitration.rejected));
  const c=forex?p.costsBps:p.cryptoCostsBps,spread=forex?(rows[i].ask_close!-rows[i].close)/rows[i].close*10000:c.spread,assumptions={entryTiming:'NEXT_OPEN' as const,feeBps:c.fees,spreadBps:spread,slippageBps:c.slippage,fundingBps:c.fundingReserve,partialExitPct:.5,moveStopToBreakevenAfterTp1:false,trailingStopR:null,
   sameCandlePolicy:'STOP_FIRST' as const,tp1StopPolicy:'CONSERVATIVE_SAME_BAR' as const,maxBarsInTrade:p.maxBars,closeAtHorizon:true};
  const row=evaluateReplayOutcome(winner,future,forecast.at,assumptions);if(!row||row.netR===null)throw Error('MODEL_OUTCOME_NOT_RESOLVED');
  if(Math.abs(row.netR-forecast.label.netR)>1e-9)throw Error('TRAINING_LABEL_CANONICAL_OUTCOME_PARITY_FAILED');
  const stress=evaluateReplayOutcome(winner,future,forecast.at,{...assumptions,feeBps:c.fees*p.costStress,spreadBps:spread*p.costStress,slippageBps:c.slippage*p.costStress,fundingBps:c.fundingReserve*p.costStress});
  outcomes.push(row);if(stress)stressOutcomes.push(stress);until.set(forecast.symbol,Date.parse(row.exitTime!)+width);evidence.push({forecast,configurationHash:sha(JSON.stringify(model.parameters)),arbitration:decision.arbitration,outcome:row,stressOutcome:stress});
 }
 const stressMetrics=summarize(stressOutcomes);
 const metrics=summarize(outcomes),reasons=[...(metrics.resolvedCount<50?['INSUFFICIENT_TRADES']:[]),...((metrics.profitFactor??0)<1.2?['NET_PF_BELOW_GATE']:[]),...((metrics.expectancyR??0)<=0?['NONPOSITIVE_EXPECTANCY']:[]),...((stressMetrics.expectancyR??0)<=0?['NONPOSITIVE_STRESSED_EXPECTANCY']:[]),...(forex?['INCOMPLETE_FOREX_COVERAGE']:[])];
 trials.push({alpha,metrics,stressMetrics,reasons,observedAboveThreshold:forecasts.length,rejected,evidence,perSymbol:symbols.map((symbol:string)=>({symbol,metrics:summarize(outcomes.filter(r=>r.symbol===symbol))}))});
 console.log(JSON.stringify({alpha,trades:metrics.resolvedCount,pf:metrics.profitFactor,expectancyR:metrics.expectancyR,reasons}));
}
const sourceHashes=await engineHashes();for(const file of ['supabase/functions/_shared/cost-aware-opportunities.ts','supabase/functions/_shared/native-kline.ts',
 'scripts/research/cost-aware/prepare.ts','scripts/research/cost-aware/prepare-forex.ts','scripts/research/cost-aware/prepare-fx.py','scripts/research/cost-aware/fit.py','scripts/research/cost-aware/fit-trees.py','scripts/research/cost-aware/nonlinear-protocol.json','scripts/research/cost-aware/evaluate.ts','scripts/research/cost-aware/protocol.json','scripts/research/cost-aware/forex-protocol.json'])sourceHashes[file]=sha(await readFile(file,'utf8'));
await writeFile(output,JSON.stringify({schema:'cost-aware-walk-forward/v1',market,generatedAt:new Date().toISOString(),modelSha256:sha(modelRaw),protocolHash:sha(protocolRaw),sourceHashes,
 sources:m.sources,models:m.models,skippedMonths:m.skipped??[],trials,forexCoverage:JSON.parse(await readFile(fxCoverage,'utf8')),publication:false,execution:false,promotion:false,
 verdict:trials.some(t=>!t.reasons.length)?'DEVELOPMENT_ONLY_REQUIRES_UNTOUCHED_AND_FORWARD_EVIDENCE':'NOT_CERTIFIED',
 limitations:['Previously examined calendar dates; this is walk-forward development, not a new final holdout.','Predicted net R is not a calibrated win probability or guarantee.',
 'Multiple alpha cases overlap; pooled symbols are not account portfolio or Prop performance.','Costs use disclosed reserves rather than historic executable order-book/funding evidence.',
 'New listings and news are observational editorial, not model trades.','Incomplete Forex archive coverage cannot become market certification.']},null,2)+'\n');
