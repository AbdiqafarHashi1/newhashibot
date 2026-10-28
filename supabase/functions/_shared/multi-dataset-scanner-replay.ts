import {hasDaily,dailyOutcomeAssumptions} from './daily-trend-profile.ts';
import {ACTIVE_MARKET_WINDOW,closedFifteenMinuteContext} from './replay-market-window.ts';
import {observeReplayPosition,REPLAY_LIFECYCLE_VERSION,type ReplayTrackedPosition} from './scanner-replay-lifecycle.ts';
import type {ReplayFillAssumptions} from './replay-outcomes.ts';
import {requiredReplayBars,needsBtcReference,referenceOnly,validateCoordinatedDatasets,isCryptoTeam,isSignalEnsemble} from './signal-ensemble-selection.ts';
import {calculateActiveIndicators,createApprovedReplayRegistry,type ApprovedReplayConfiguration} from './active-validation-runtime.ts';
import {admitHistoricalCandles,runBoundedValidation,type ReplayConfiguration} from './phase-l-validation.ts';
import {replayScannerChronologically,type ReplayEvent,type ReplayResumeState,type ScannerSelection} from './phase-m-validation.ts';
import type {StrategyCandle} from './professional-strategies.ts';
export interface ReplayDatasetInput{id:string;hash:string;configurationHash:string;source:string;symbol:string;market:'crypto'|'forex';timeframe:string;candles:StrategyCandle[]}
const width=(tf:string)=>{const m=/^(\d+)(m|h|d)$/.exec(tf);if(!m)throw new Error('UNSUPPORTED_TIMEFRAME');return Number(m[1])*(m[2]==='m'?60000:m[2]==='h'?3600000:86400000)};
/** Exact production admission/indicators/registry/qualification/arbitration/selection, isolated evidence only. */
export async function runMultiDatasetScannerReplay(input:{runId:string;datasets:readonly ReplayDatasetInput[];configuration:ApprovedReplayConfiguration;configurationHash:string;start:string;end:string;cooldownMs:number;maxCycles:number;lifecycleAssumptions?:ReplayFillAssumptions;shouldCancel?:()=>Promise<boolean>|boolean;resume?:ReplayResumeState;onEvidence?:(row:{event:ReplayEvent;selection:ScannerSelection},state:ReplayResumeState)=>Promise<void>}){
 if(!input.datasets.length)throw new Error('REPLAY_DATASETS_REQUIRED');
 if(input.datasets.some(d=>d.configurationHash!==input.configurationHash))throw new Error('REPLAY_CONFIGURATION_LINEAGE_CONFLICT');
 validateCoordinatedDatasets(input.configuration,input.datasets);
 const alt=needsBtcReference(input.configuration),windowSize=requiredReplayBars(input.configuration),events:ReplayEvent[]=[],contexts=new Map<string,{dataset:ReplayDatasetInput;candles:StrategyCandle[]}>();
 const admitted=input.datasets.map(dataset=>({dataset,rows:admitHistoricalCandles(dataset.candles,dataset.timeframe,input.end,dataset.market==='crypto'?'24x7':'FOREX_24x5').candles}));
 const observedPositions=new Map<string,{id:string;at:string}>();
 const lifecycle=Boolean(input.lifecycleAssumptions),positions=new Map((input.resume?.positions??[]).map(p=>[p.candidate.symbol,p]));
 if(lifecycle&&input.resume?.cursor&&input.resume.lifecycleVersion!==REPLAY_LIFECYCLE_VERSION)throw Error('REPLAY_LIFECYCLE_CHECKPOINT_REQUIRES_NEW_RUN');
 if(lifecycle&&[...positions.values()].some(p=>!admitted.some(d=>d.dataset.id===p.datasetId&&d.dataset.symbol===p.candidate.symbol&&d.dataset.timeframe===p.candidate.timeframe&&d.dataset.market==='crypto')||!input.configuration.strategies.some(s=>s.id===p.candidate.strategyId)))throw Error('REPLAY_LIFECYCLE_CHECKPOINT_INVALID');
 const reference=alt?admitted.find(d=>d.dataset.symbol==='BTCUSDT'&&d.dataset.timeframe==='15m'):undefined;
 const referenceCloses=new Map(reference?.rows.map((c,i)=>[Date.parse(c.open_time)+900000,i])??[]);
 if(alt&&admitted.filter(d=>d.dataset.timeframe!=='1d').some(d=>d.rows.filter(c=>Date.parse(c.open_time)+900000<=Date.parse(input.start)).length<windowSize))throw Error('ALT_WARMUP_COVERAGE_REQUIRED');
 for(const {dataset,rows} of admitted){
  if(referenceOnly(input.configuration,dataset.symbol,dataset.timeframe))continue;
  for(let i=dataset.timeframe==='1d'&&hasDaily(input.configuration)?200:alt?windowSize-1:54;i<rows.length;i++){
   if(i%64===0&&await input.shouldCancel?.())throw new Error('RUN_CANCELLED');
   const candles=rows.slice(dataset.timeframe==='1d'&&hasDaily(input.configuration)?0:Math.max(0,i-windowSize+1),i+1),closedAt=new Date(Date.parse(candles.at(-1)!.open_time)+width(dataset.timeframe)).toISOString();
   if(hasDaily(input.configuration)&&dataset.timeframe==='15m'&&Date.parse(closedAt)%3600000!==0)continue;
   if(closedAt<input.start||closedAt>input.end||isCryptoTeam(input.configuration)&&Date.parse(closedAt)%3600000!==0)continue;
   const identity=`${dataset.symbol}:${dataset.timeframe}:${closedAt}`,contentHash=`${dataset.hash}:${candles.at(-1)!.open_time}:${candles.at(-1)!.close}`;
   events.push({symbol:dataset.symbol,timeframe:dataset.timeframe,closedAt,contentHash,payload:identity});contexts.set(identity,{dataset,candles});
  }
 }
 if(events.length>input.maxCycles)throw new Error('REPLAY_RANGE_EXCEEDS_CYCLE_LIMIT_SELECT_SHORTER_PERIOD');
 return replayScannerChronologically({shouldCancel:input.shouldCancel,resume:input.resume,beforeEvent:lifecycle?event=>{const released:string[]=[];for(const [symbol,position]of positions){const prior=observedPositions.get(symbol);if(prior?.id===position.candidate.id&&prior.at===event.closedAt)continue;observedPositions.set(symbol,{id:position.candidate.id,at:event.closedAt});const data=admitted.find(d=>d.dataset.id===position.datasetId)!;if(observeReplayPosition(position,data.rows,event.closedAt)){positions.delete(symbol);released.push(symbol);}else if(Date.parse(position.candidate.expiry)<=Date.parse(event.closedAt))positions.delete(symbol);}return released;}:undefined,onEvidence:async(row,state)=>{if(lifecycle){const cycle=row.selection.cycle,arbitration=cycle?.arbitration as import('./arbitrator.ts').ArbitrationResult|undefined,winner=arbitration?.winner;if(arbitration)arbitration.evidence={...arbitration.evidence,selection_lifecycle:REPLAY_LIFECYCLE_VERSION,lifecycle_scope:'crypto',future_outcomes_used_for_admission:false};if(winner&&winner.market==='crypto'&&cycle){const strategy=input.configuration.strategies.find(s=>s.id===winner.strategyId)!;positions.set(winner.symbol,{candidate:winner,decisionAt:row.event.closedAt,datasetId:cycle.datasetId,assumptions:{...dailyOutcomeAssumptions(winner.strategyId,input.lifecycleAssumptions!),maxBarsInTrade:dailyOutcomeAssumptions(winner.strategyId,input.lifecycleAssumptions!).maxBarsInTrade??strategy.maxBarsInTrade}});}state.lifecycleVersion=REPLAY_LIFECYCLE_VERSION;state.positions=[...positions.values()];}await input.onEvidence?.(row,state);},events:events.sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt)||a.symbol.localeCompare(b.symbol)||a.timeframe.localeCompare(b.timeframe)).slice(0,input.maxCycles),cooldownMs:input.cooldownMs,...(isCryptoTeam(input.configuration)||isSignalEnsemble(input.configuration)||hasDaily(input.configuration)?{maxActiveSignals:3}:{}),evaluate:event=>{
  const ctx=contexts.get(String(event.payload))!,registry=createApprovedReplayRegistry(input.configuration,event.symbol,event.timeframe);
  const config:ReplayConfiguration={runId:input.runId,mode:'REPLAY',dataset:{id:ctx.dataset.id,source:ctx.dataset.source,provenance:'MULTI_DATASET_REPLAY',sha256:ctx.dataset.hash,timezone:'UTC',marketCalendar:ctx.dataset.market==='crypto'?'24x7':'FOREX_24x5'},configurationVersion:input.configuration.version,parameterVersion:input.configurationHash,symbol:event.symbol,market:ctx.dataset.market,timeframe:event.timeframe,start:event.closedAt,end:event.closedAt,maxCycles:1,minimumScore:0,allowedGrades:['A+','A','B'],minSignalGrade:input.configuration.minSignalGrade};
  const referenceIndex=referenceCloses.get(Date.parse(event.closedAt));
  const decision=runBoundedValidation(config,registry,[{symbol:event.symbol,market:ctx.dataset.market,timeframe:event.timeframe,candles:ctx.candles,indicators:calculateActiveIndicators(ctx.candles.slice(-ACTIVE_MARKET_WINDOW)),evaluated_at:event.closedAt,higher_timeframe_candles:event.timeframe==='5m'?closedFifteenMinuteContext(ctx.dataset.candles,event.closedAt):undefined,reference_candles:referenceIndex===undefined?undefined:reference!.rows.slice(Math.max(0,referenceIndex-windowSize+1),referenceIndex+1)}])[0];
  const winner=decision?.arbitration.winner,cycle=decision?{cycleId:decision.cycleId,candidates:decision.candidates,arbitration:decision.arbitration,datasetId:ctx.dataset.id,datasetHash:ctx.dataset.hash,configurationHash:input.configurationHash}:undefined;
  if(reference&&decision)decision.arbitration.evidence={...decision.arbitration.evidence,reference_dataset_id:reference.dataset.id,reference_dataset_hash:reference.dataset.hash,reference_as_of:event.closedAt,research_only:true};
  return winner?{decision:'SIGNAL' as const,signalId:winner.id,expiresAt:winner.expiry,reasons:[],cycle}:{decision:'NO_TRADE' as const,reasons:decision?.arbitration.rejected.flatMap(r=>r.reasons)??['NO_CANDIDATE'],cycle};
 }});
}
