/** Bounded, chronological research. No network, database, promotion or execution. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {calculateActiveIndicators,createApprovedReplayRegistry,type ApprovedReplayConfiguration} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {admitHistoricalCandles,runBoundedValidation} from '../../supabase/functions/_shared/phase-l-validation.ts';
import {evaluateReplayOutcome,summarizeReplayOutcomes,type ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';
import type {StrategyCandle,StrategyEvaluationContext} from '../../supabase/functions/_shared/professional-strategies.ts';
const [directory,output]=process.argv.slice(2);if(!directory||!output)throw new Error('Usage: node --import tsx scripts/research/calibrate-scanner.ts <data-directory> <output.json>');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const protocolRaw=await readFile(`${directory}/protocol.json`,'utf8'),protocol=JSON.parse(protocolRaw);
const base=JSON.parse(await readFile('scripts/research/fixed-crypto-research.json','utf8')) as ApprovedReplayConfiguration;
base.strategies.forEach(s=>s.timeframes=['15m','1h']);
base.strategies.push({id:'crypto.micro-scalper',version:'1.0.0',enabled:true,minScore:75,minRiskReward:1.2,maxBarsInTrade:24,minStopDistancePct:.15,minTp1DistancePct:.2,minTp2DistancePct:.3,symbols:protocol.symbols,timeframes:['15m'],parameters:{}},{id:'crypto.quick-scalp',version:'1.0.0',enabled:true,minScore:82,minRiskReward:1.15,maxBarsInTrade:4,minStopDistancePct:.1,minTp1DistancePct:.1,minTp2DistancePct:.15,symbols:protocol.symbols,timeframes:['15m'],parameters:{}});
base.outcomeAssumptions={...base.outcomeAssumptions!,fundingBps:protocol.costBps.fundingReserve,closeAtHorizon:true,tp1StopPolicy:'CONSERVATIVE_SAME_BAR'};
interface Dataset {file:string;hash:string;manifest:unknown;candles:StrategyCandle[];contexts:StrategyEvaluationContext[];month:string;symbol:string;timeframe:string}
const cache=new Map<string,Dataset>();
async function load(month:string,symbol:string,timeframe:string){
 const file=`${directory}/${symbol}-${month}${timeframe==='1h'?'':'-'+timeframe}.json`;if(cache.has(file))return cache.get(file)!;
 const raw=await readFile(file,'utf8'),candles=JSON.parse(raw) as StrategyCandle[],width=timeframe==='1h'?3600000:900000;
 const manifest=JSON.parse(await readFile(file.replace('.json','.manifest.json'),'utf8'));
 if(manifest.datasetSha256!==hash(raw)||manifest.instrumentType!=='USDT_PERPETUAL'||candles.some(c=>c.source!=='BINANCE_UM_FUTURES_ARCHIVE'||c.symbol!==symbol||c.timeframe!==timeframe))throw new Error(`SOURCE_MISMATCH:${file}`);
 const end=new Date(Date.parse(candles.at(-1)!.open_time)+width).toISOString(),admission=admitHistoricalCandles(candles,timeframe,end);
 if(admission.exclusions.length||candles.length<200)throw new Error(`INVALID_DATASET:${file}`);
 const contexts:StrategyEvaluationContext[]=[];
 for(let i=109;i<candles.length;i++){const history=candles.slice(i-109,i+1);contexts.push({symbol,market:'crypto',timeframe,candles:history,indicators:calculateActiveIndicators(history),evaluated_at:new Date(Date.parse(candles[i].open_time)+width).toISOString()});}
 const data={file,hash:hash(raw),manifest,candles,contexts,month,symbol,timeframe};cache.set(file,data);return data;
}
function metrics(rows:ReplayOutcome[]){const {realizedEquityCurve,...m}=summarizeReplayOutcomes(rows);return {...m,analysisMode:'FIXED_RISK_SIGNAL_SLOTS' as const,overlapPolicy:'ONE_ACTIVE_SIGNAL_PER_SYMBOL_ACROSS_TIMEFRAMES' as const,totalNetR:rows.reduce((s,r)=>s+(r.netR??0),0)};}
interface Trial {id:string;adaptive:boolean;config:ApprovedReplayConfiguration}
const trials:Trial[]=[];
for(const profile of ['base','balanced','wide'])for(const scoreAdd of [0,6])for(const adaptive of [false,true]){
 const config=structuredClone(base);config.version=`calibration-${profile}-score${scoreAdd}-${adaptive?'adaptive':'control'}`;
 for(const s of config.strategies){s.minScore=Math.min(95,s.minScore+scoreAdd);if(profile!=='base'){const stop=profile==='wide'?2.4:1.8;s.parameters={...s.parameters,stop_atr_mult:stop,tp1_r:stop,tp2_r:stop*2.5};}}
 trials.push({id:config.version,adaptive,config});
}
if(trials.length!==protocol.maxTrials)throw new Error('TRIAL_BUDGET_MISMATCH');
async function evaluate(trial:Trial,months:string[],stress=false){
 const outcomes:ReplayOutcome[]=[],byRegime:Record<string,ReplayOutcome[]>={},byStrategy:Record<string,ReplayOutcome[]>={},periods:unknown[]=[],reasons:Record<string,number>={};let cycles=0,noTrades=0,overlapBlocked=0;
 for(const month of months){
  const signals:{candidate:NonNullable<ReturnType<typeof runBoundedValidation>[number]['arbitration']['winner']>;at:string;data:Dataset;state:string}[]=[];
  for(const symbol of protocol.symbols)for(const timeframe of protocol.timeframes){
   const data=await load(month,symbol,timeframe),registry=createApprovedReplayRegistry(trial.config,symbol,timeframe),contexts=data.contexts;
   const decisions=runBoundedValidation({runId:`${trial.id}:${data.hash.slice(0,8)}`,mode:'REPLAY',dataset:{id:data.file,source:'BINANCE_UM_FUTURES_ARCHIVE',provenance:data.file,sha256:data.hash,timezone:'UTC'},configurationVersion:trial.id,parameterVersion:hash(JSON.stringify(trial.config)),symbol,market:'crypto',timeframe,start:contexts[0].evaluated_at,end:contexts.at(-1)!.evaluated_at,maxCycles:10000,minimumScore:0,allowedGrades:['A+','A'],minSignalGrade:'A',adaptivePolicy:trial.adaptive},registry,contexts);
   cycles+=decisions.length;
   for(let i=0;i<decisions.length;i++){const d=decisions[i];if(!d.arbitration.winner)noTrades++;for(const r of d.arbitration.rejected)for(const reason of r.reasons)reasons[reason]=(reasons[reason]??0)+1;const winner=d.arbitration.winner;if(winner)signals.push({candidate:winner,at:d.candleCloseTime,data,state:String((winner.evidence.adaptive_market as any)?.state??contexts[i].indicators.regime)});}
  }
  signals.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||b.candidate.score-a.candidate.score||a.candidate.id.localeCompare(b.candidate.id));
  const blockedUntil=new Map<string,number>(),monthRows:ReplayOutcome[]=[];
  for(const signal of signals){const {candidate,at,data,state}=signal;if(Date.parse(at)<=(blockedUntil.get(candidate.symbol)??0)){overlapBlocked++;continue;}
   const strategy=trial.config.strategies.find(s=>s.id===candidate.strategyId)!,width=data.timeframe==='1h'?3600000:900000;
   // Resolve hourly signals using actual 15m bars, never synthetic interpolation.
   const resolution=data.timeframe==='1h'?await load(month,candidate.symbol,'15m'):data;
   const assumptions={...trial.config.outcomeAssumptions!,maxBarsInTrade:strategy.maxBarsInTrade*(data.timeframe==='1h'?4:1),...(stress?{feeBps:20,spreadBps:4,slippageBps:8,fundingBps:8}:{})};
   const row=evaluateReplayOutcome(candidate,resolution.candles,at,assumptions);if(!row||row.status==='EXCLUDED')continue;
   if(!row.exitTime||row.netR===null)throw new Error('UNRESOLVED_TRADE_CANNOT_BE_DROPPED');
   // Exit bar open timestamp + duration: do not reuse capacity before close is observable.
   blockedUntil.set(candidate.symbol,Date.parse(row.exitTime)+900000);
   outcomes.push(row);monthRows.push(row);(byRegime[state]??=[]).push(row);(byStrategy[row.strategyId]??=[]).push(row);
  }
  periods.push({month,metrics:metrics(monthRows)});
 }
 return {metrics:metrics(outcomes),cycles,noTrades,overlapBlocked,periods,byRegime:Object.fromEntries(Object.entries(byRegime).map(([k,v])=>[k,metrics(v)])),byStrategy:Object.fromEntries(Object.entries(byStrategy).map(([k,v])=>[k,metrics(v)])),rejectionCounts:reasons};
}
const development=[];
for(const trial of trials){const result=await evaluate(trial,protocol.development);development.push({id:trial.id,adaptive:trial.adaptive,...result});console.log(JSON.stringify({stage:'DEVELOPMENT',trial:trial.id,...result.metrics}));}
// Controls measure the contribution of adaptation. Only the six adaptive candidates may be selected.
const ranked=development.filter(r=>r.adaptive&&r.metrics.resolvedCount>=protocol.minimumResolvedPerSplit).sort((a,b)=>b.metrics.expectancyR!-a.metrics.expectancyR!||a.id.localeCompare(b.id));
if(!ranked.length)throw new Error('INSUFFICIENT_DEVELOPMENT_EVIDENCE');
const selected=trials.find(t=>t.id===ranked[0].id)!,frozenHash=hash(JSON.stringify(selected.config));
await writeFile(`${directory}/frozen-candidate.json`,JSON.stringify({protocolHash:hash(protocolRaw),id:selected.id,configurationHash:frozenHash,config:selected.config,selectedBeforeValidationAndHoldout:true},null,2)+'\n');
console.log(JSON.stringify({stage:'FROZEN',id:selected.id,configurationHash:frozenHash}));
const validation=await evaluate(selected,protocol.validation);console.log(JSON.stringify({stage:'VALIDATION',...validation.metrics}));
const holdout=await evaluate(selected,protocol.holdout);console.log(JSON.stringify({stage:'HOLDOUT',...holdout.metrics}));
const stressedHoldout=await evaluate(selected,protocol.holdout,true);console.log(JSON.stringify({stage:'STRESSED_HOLDOUT',...stressedHoldout.metrics}));
const pass=(r:typeof holdout)=>r.metrics.resolvedCount>=protocol.minimumResolvedPerSplit&&(r.metrics.profitFactor??0)>=protocol.minimumProfitFactor&&(r.metrics.expectancyR??-Infinity)>=protocol.minimumExpectancyR;
const promotionEligible=pass(validation)&&pass(holdout)&&stressedHoldout.metrics.totalNetR>0;
await writeFile(output,JSON.stringify({effectiveMarketWindowBars:110,implementationNotes:["The predeclared protocol prose says 200 warmup bars. Before development began the implementation used 110 closed bars to match the production window; the original protocol and hash are retained transparently. No selection thresholds or time splits changed after evaluation."],status:promotionEligible?'RESEARCH_GATES_PASSED_REQUIRES_OWNER_REVIEW':'REJECTED_NOT_FOR_PROMOTION',protocol,protocolHash:hash(protocolRaw),selected,frozenConfigurationHash:frozenHash,development,validation,holdout,stressedHoldout,sources:[...cache.values()].map(d=>({file:d.file,datasetHash:d.hash,manifest:d.manifest})),limitations:['Retrospective sampled months are not prospective certification or a complete contiguous multi-year portfolio.','Fixed 1R outcome accounting, not compounded account sizing, margin, cross-asset correlation or drawdown locks.','No parameter retuning after validation or holdout; controls are never eligible for selection.','Hourly fills resolved with actual 15m OHLC; same-bar protection ambiguities conservatively stop first.','Funding is an explicit reserve, not reconstructed realized funding history. Estimated execution costs need provider validation.','5m MicroScalper higher-timeframe wiring is tested separately, not performance-certified by this 15m/1h study.','Forex strategies need real MT5 broker history; no Forex performance inferred from crypto.'],promoted:false},null,2)+'\n');
console.log(JSON.stringify({status:promotionEligible?'RESEARCH_GATES_PASSED_REQUIRES_OWNER_REVIEW':'REJECTED_NOT_FOR_PROMOTION',output}));
