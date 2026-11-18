import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {complementaryDefinitions,complementaryAggregate,evaluateComplementary,type ComplementaryRole} from '../../../supabase/functions/_shared/complementary-strategies.ts';
import {createApprovedReplayRegistry,calculateActiveIndicators} from '../../../supabase/functions/_shared/active-validation-runtime.ts';
import {runBoundedValidation} from '../../../supabase/functions/_shared/phase-l-validation.ts';
import {evaluateReplayOutcome,summarizeReplayOutcomes,type ReplayOutcome} from '../../../supabase/functions/_shared/replay-outcomes.ts';
import {simulateResearchAccount,type ScenarioTrade} from '../../../supabase/functions/_shared/research-account-scenarios.ts';
import type {ArbitrationCandidate} from '../../../supabase/functions/_shared/arbitrator.ts';
import type {StrategyCandle,StrategyEvaluationContext} from '../../../supabase/functions/_shared/professional-strategies.ts';
const [root,onlySymbol,selectedProtocol]=process.argv.slice(2);const protocolPath=selectedProtocol??'scripts/research/complementary/protocol.json';if(!root)throw Error('Usage: node --import tsx scripts/research/complementary/study.ts <source-directory> [symbol]');
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex'),protocol=JSON.parse(await readFile(protocolPath,'utf8'));
const defs=complementaryDefinitions(),dir='docs/research/complementary';await mkdir(dir,{recursive:true});
const sourceFiles=['supabase/functions/_shared/complementary-strategies.ts','supabase/functions/_shared/indicator-engine.ts','supabase/functions/_shared/active-validation-runtime.ts','supabase/functions/_shared/active-scanner-core.ts','supabase/functions/_shared/scanner-market-context.ts','supabase/functions/_shared/arbitrator.ts','supabase/functions/_shared/trading-domain/arbitrator.ts','supabase/functions/_shared/phase-l-validation.ts','supabase/functions/_shared/active-qualification.ts','supabase/functions/_shared/replay-outcomes.ts',protocolPath,'supabase/functions/_shared/strategy-plan.ts','supabase/functions/_shared/professional-strategies.ts','scripts/research/complementary/swing-study.ts'];
const hashes=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,sha(await readFile(p))])));
const reports:any[]=[],ledger:any[]=[],allSignals:ScenarioTrade[]=[];let cycles=0;
function summary(rows:ReplayOutcome[]){const {realizedEquityCurve,...rest}=summarizeReplayOutcomes(rows);void realizedEquityCurve;const r=rows.filter(x=>x.netR!==null);return {...rest,winRatePct:r.length?100*r.filter(x=>x.netR!>0).length/r.length:null};}
for(const symbol of protocol.scope.filter((s:string)=>!onlySymbol||onlySymbol==='ALL'||s===onlySymbol)){
 for(const tf of protocol.evaluationTimeframes){
 const raw=await readFile(`${root}/${symbol}-${tf}.json`),manifest=JSON.parse(await readFile(`${root}/${symbol}-${tf}.manifest.json`,'utf8'));
 if(sha(raw)!==manifest.datasetSha256)throw Error('SOURCE_SHA_MISMATCH');const rows=JSON.parse(raw.toString()) as StrategyCandle[],market=symbol.endsWith('USDT')?'crypto' as const:'forex' as const,width=tf==='4h'?14400000:tf==='1h'?3600000:900000;
 const matching=defs.filter(d=>d.market===market&&d.config.allowed_symbols.includes(symbol)&&d.config.allowed_timeframes.includes(tf));
 const strategies=matching.map(d=>({id:d.id,version:d.version,enabled:true,minScore:75,minRiskReward:d.config.min_rr,maxBarsInTrade:d.config.max_bars_in_trade,symbols:[symbol],timeframes:[tf],parameters:{}}));
 const configuration={version:protocol.version,minSignalGrade:'A',strategies};
 const registries=matching.map(d=>({id:d.id,registry:createApprovedReplayRegistry({...configuration,strategies:strategies.filter(s=>s.id===d.id)},symbol,tf)}));
 const combined=createApprovedReplayRegistry(configuration,symbol,tf),streams=new Map<string,{until:number;rows:ReplayOutcome[];stress:ReplayOutcome[];proposals:number}>([...matching.map(d=>d.id),'COMBINED'].map(id=>[id,{until:0,rows:[],stress:[],proposals:0}]));
 for(let i=200;i<rows.length-1;i++){
  const at=Date.parse(rows[i].open_time)+width;if(at<Date.parse(protocol.development.start)||at>Date.parse(protocol.validation.end))continue;
  const sourcePrefix=rows.slice(Math.max(0,i+1-protocol.historyBars),i+1),candles=sourcePrefix.slice(-220),higher=complementaryAggregate(sourcePrefix,width,tf==='1h'?14400000:3600000).slice(-220),ctx:StrategyEvaluationContext={symbol,market,timeframe:tf,candles,higher_timeframe_candles:higher,indicators:calculateActiveIndicators(candles),evaluated_at:new Date(at).toISOString()};
  const replay={runId:'complementary',mode:'REPLAY' as const,dataset:{id:symbol,source:manifest.source,provenance:'PUBLIC_VENDOR_HISTORY',sha256:manifest.datasetSha256,timezone:'UTC' as const,marketCalendar:market==='crypto'?'24x7' as const:'FOREX_24x5' as const},configurationVersion:protocol.version,parameterVersion:sha(JSON.stringify(configuration)),symbol,market,timeframe:tf,start:ctx.evaluated_at,end:ctx.evaluated_at,maxCycles:1,minimumScore:0,allowedGrades:['A'],minSignalGrade:'A'};
  const rawCandidates=new Set(registries.filter(d=>evaluateComplementary(d.id.split('complementary-')[1] as ComplementaryRole,ctx).status==='candidate').map(d=>d.id));
  for(const {id,registry} of [...registries,{id:'COMBINED',registry:combined}]){
   if(id==='COMBINED'?!rawCandidates.size:!rawCandidates.has(id))continue;
   const stream=streams.get(id)!;if(at<=stream.until)continue;
   const decision=runBoundedValidation(replay,registry,[ctx])[0],c=decision?.arbitration.winner;if(!c)continue;stream.proposals++;
   // Symbol locks persist until observed exit; no future return is used for candidate selection.
   const cost=market==='crypto'?protocol.fees.cryptoRoundTripBps:protocol.fees.fxCommissionBps+protocol.fees.fxSlippageBps+Math.max(0,(rows[i].ask_close??rows[i].close)-rows[i].close)/rows[i].close*10000;
   const funding=market==='crypto'?protocol.fees.cryptoFundingReserveBps:protocol.fees.fxSwapReserveBps;
   const max=strategies.find(s=>s.id===c.strategyId)!.maxBarsInTrade;
   const assumptions={entryTiming:'NEXT_OPEN' as const,...protocol.outcomes,feeBps:cost,spreadBps:0,slippageBps:0,fundingBps:funding,trailingStopR:null,maxBarsInTrade:max};
   const future=rows.slice(i+1,i+1+max);if(!future.length||Date.parse(future[0].open_time)!==at)continue;
   const outcome=evaluateReplayOutcome(c,future,ctx.evaluated_at,assumptions),stress=evaluateReplayOutcome(c,future,ctx.evaluated_at,{...assumptions,feeBps:cost*protocol.fees.stressMultiplier,fundingBps:funding*protocol.fees.stressMultiplier});
   if(!outcome||!stress)throw Error('MISSING_OUTCOME');stream.rows.push(outcome);stream.stress.push(stress);
   stream.until=outcome.exitTime?Date.parse(outcome.exitTime)+width:Infinity;
   ledger.push({stream:id,decisionAt:ctx.evaluated_at,candidate:c,outcome,stress});
   if(id==='COMBINED'&&outcome.netR!==null&&outcome.exitTime&&outcome.status!=='EXCLUDED'){
    const sign=c.side==='buy'?1:-1,risk=sign*(outcome.entryPrice-c.stop),path=future.filter(b=>Date.parse(b.open_time)<=Date.parse(outcome.exitTime!));
    allSignals.push({id:`${symbol}:${tf}:${at}`,symbol,strategyId:c.strategyId,openedAt:outcome.entryTime,closedAt:new Date(Date.parse(outcome.exitTime)+width).toISOString(),entry:outcome.entryPrice,stop:c.stop,netR:outcome.netR,costR:outcome.costR,worstAdverseR:Math.max(0,...path.map(b=>sign*(outcome.entryPrice-(sign===1?b.low:b.high))/risk)),gapAdverseR:Math.max(0,...path.map(b=>sign*(outcome.entryPrice-b.open)/risk))});
   }
  }
  cycles++;
 }
 for(const [id,s]of streams)for(const stage of ['development','validation']){
  const period=protocol[stage],pick=(r:ReplayOutcome)=>Date.parse(r.entryTime)>=Date.parse(period.start)&&Date.parse(r.entryTime)<=Date.parse(period.end),base=s.rows.filter(pick),stress=s.stress.filter(pick);
  reports.push({symbol,timeframe:tf,id,stage,sourceSha256:manifest.datasetSha256,source:manifest.source,sourceRecords:manifest.records,sourceFirst:manifest.first,sourceLast:manifest.last,base:summary(base),stress:summary(stress)});
 }
 console.log(JSON.stringify({symbol,tf,cycles,selected:streams.get('COMBINED')!.rows.length}),);
 }
}
for(const [p,h]of Object.entries(hashes))if(sha(await readFile(p))!==h)throw Error('FROZEN_ENGINE_CHANGED');
const pooled=[...new Set(reports.map(r=>r.id))].flatMap(id=>['development','validation'].map(stage=>{
 const period=protocol[stage],entries=ledger.filter(l=>l.stream===id&&Date.parse(l.outcome.entryTime)>=Date.parse(period.start)&&Date.parse(l.outcome.entryTime)<=Date.parse(period.end));return {id,stage,base:summary(entries.map(x=>x.outcome)),stress:summary(entries.map(x=>x.stress))};}));
const account=simulateResearchAccount(allSignals,protocol.accountScenario);const {trace,...accountMetrics}=account;void trace;
const result={protocol,hashes,cycles,reports,pooled,account:{...accountMetrics,model:'Existing sequential hypothetical account; not simultaneous netted portfolio'},ledger,publication:false,execution:false};
const suffix=(selectedProtocol?'-swing':'')+(onlySymbol&&onlySymbol!=='ALL'?`-${onlySymbol}`:'');await writeFile(`${dir}/evidence${suffix}.json.gz`,gzipSync(JSON.stringify(result),{level:9}));await writeFile(`${dir}/summary${suffix}.json`,JSON.stringify({...result,ledger:undefined},null,2)+'\n');console.log(JSON.stringify({pooled,account:accountMetrics}));
