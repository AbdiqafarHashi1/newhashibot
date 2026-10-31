import {createHash} from 'node:crypto';
import {dirname,join,normalize} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {runBoundedValidation} from '../../../supabase/functions/_shared/phase-l-validation.ts';
import {createApprovedReplayRegistry,calculateActiveIndicators} from '../../../supabase/functions/_shared/active-validation-runtime.ts';
import {qualifyActiveCandidate} from '../../../supabase/functions/_shared/active-qualification.ts';
import {evaluateReplayOutcome,summarizeReplayOutcomes,type ReplayOutcome} from '../../../supabase/functions/_shared/replay-outcomes.ts';
import {classifyOpportunity,evaluateRegimeOpportunity,REGIME_DEFAULTS,REGIME_ENGINE_VERSION,closedAggregate,type RegimeId} from '../../../supabase/functions/_shared/regime-opportunities.ts';
import type {StrategyCandle,StrategyEvaluationContext} from '../../../supabase/functions/_shared/professional-strategies.ts';

export const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export const ENGINE_FILES=['supabase/functions/_shared/regime-opportunities.ts','supabase/functions/_shared/indicator-engine.ts','supabase/functions/_shared/active-scanner-core.ts','supabase/functions/_shared/active-qualification.ts','supabase/functions/_shared/arbitrator.ts','supabase/functions/_shared/trading-domain/arbitrator.ts','supabase/functions/_shared/replay-outcomes.ts','scripts/release1/regime/replay.ts','scripts/release1/regime/certify.ts','supabase/functions/_shared/active-validation-runtime.ts','supabase/functions/_shared/phase-l-validation.ts','supabase/functions/_shared/scanner-market-context.ts'];
export async function engineHashes(){const visited=new Map<string,string>();async function visit(path:string){if(visited.has(path))return;const raw=await readFile(path,'utf8');visited.set(path,sha(raw));for(const match of raw.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g))await visit(normalize(join(dirname(path),match[1])));}for(const path of ENGINE_FILES)await visit(path);return Object.fromEntries([...visited].sort(([a],[b])=>a.localeCompare(b)));}
export const VARIANTS=[{name:'base',parameters:{...REGIME_DEFAULTS}},{name:'wider',parameters:{...REGIME_DEFAULTS,stopAtr:2.2,targetR:3}},{name:'shorter',parameters:{...REGIME_DEFAULTS,stopAtr:1.5,targetR:2}}];
export interface Spec {strategy:RegimeId;variant:string;parameters:Record<string,number>;}
export interface Dataset {symbol:string;rows:StrategyCandle[];sources:unknown[];}
export async function loadDatasets(root:string):Promise<Dataset[]>{
 const files=(await readdir(root)).filter(f=>f.endsWith('.json')&&!f.includes('manifest')).sort();
 return Promise.all(['BTCUSDT','ETHUSDT'].map(async symbol=>{
  const rows:StrategyCandle[]=[],sources=[];
  for(const file of files.filter(f=>f.startsWith(symbol+'-'))){const raw=await readFile(`${root}/${file}`,'utf8'),meta=JSON.parse(await readFile(`${root}/${file}.manifest.json`,'utf8'));if(sha(raw)!==meta.normalizedSha256)throw Error('NORMALIZED_HASH_MISMATCH:'+file);const part:StrategyCandle[]=JSON.parse(raw);rows.push(...part);sources.push({file,...meta});}
  rows.sort((a,b)=>Date.parse(a.open_time)-Date.parse(b.open_time));
  if(rows.length<110||rows.some((r,i)=>r.symbol!==symbol||r.timeframe!=='1h'||![r.open,r.high,r.low,r.close,r.volume].every(Number.isFinite)||r.low<=0||r.high<Math.max(r.open,r.close)||r.low>Math.min(r.open,r.close)||r.volume<0||(i>0&&Date.parse(r.open_time)-Date.parse(rows[i-1].open_time)!==3600000)))throw Error('DATA_MISSING_MALFORMED_DUPLICATED_OR_GAPPED:'+symbol);
  return{symbol,rows,sources};
 }));
}
export function summarize(rows:ReplayOutcome[]){
 const {realizedEquityCurve,...base}=summarizeReplayOutcomes(rows),resolved=rows.filter(r=>r.netR!==null),wins=resolved.filter(r=>r.netR!>0);let equity=10000,peak=equity,dd=0;for(const r of [...resolved].sort((a,b)=>String(a.exitTime).localeCompare(String(b.exitTime)))){equity*=1+.005*r.netR!;peak=Math.max(peak,equity);dd=Math.max(dd,(peak-equity)/peak*100);}
 // Fixed-seed moving-block bootstrap; correlated trades are not IID samples.
 const returns=resolved.map(r=>r.netR!),means:number[]=[];let seed=219823;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let b=0;b<500&&returns.length;b++){const samples:number[]=[];while(samples.length<returns.length){const start=Math.floor(random()*returns.length);for(let i=0;i<5&&samples.length<returns.length;i++)samples.push(returns[(start+i)%returns.length]);}means.push(samples.reduce((n,x)=>n+x,0)/samples.length);}means.sort((a,b)=>a-b);
 return{...base,winCount:wins.length,winRatePct:resolved.length?wins.length/resolved.length*100:null,netR:returns.reduce((n,x)=>n+x,0),netReturnPctAtHalfPercentRisk:(equity/10000-1)*100,maxDrawdownPctAtHalfPercentRisk:dd,expectancy95PctBlockBootstrap:means.length?[means[12],means[487]]:null};
}
export function replay(spec:Spec,data:Dataset,costMultiplier=1){
 const width=spec.strategy==='crypto.regime-channel-breakout'?14400000:3600000,rows=width===14400000?closedAggregate(data.rows,240,new Date(Date.parse(data.rows.at(-1)!.open_time)+3600000).toISOString()):data.rows,rejections:Record<string,number>={},regimes:Record<string,ReplayOutcome[]>={},trades:ReplayOutcome[]=[];let activeUntil=-Infinity,eligible=0;
 const registry=createApprovedReplayRegistry({version:'regime-research/v1',minSignalGrade:'A',strategies:[{id:spec.strategy,version:REGIME_ENGINE_VERSION,enabled:true,minScore:75,minRiskReward:1.5,maxBarsInTrade:48,symbols:[data.symbol],timeframes:[width===14400000?'4h':'1h'],parameters:spec.parameters}]},data.symbol,width===14400000?'4h':'1h');const regimeCounts:Record<string,number>={};
 for(let i=109;i<rows.length-1;i++){
  const last=rows[i],asOf=new Date(Date.parse(last.open_time)+width).toISOString(),context={symbol:data.symbol,market:'crypto',timeframe:width===14400000?'4h':'1h',candles:rows.slice(i-109,i+1),indicators:calculateActiveIndicators(rows.slice(i-109,i+1)),evaluated_at:asOf} as StrategyEvaluationContext;
  const state=classifyOpportunity(context);regimeCounts[state.regime]=(regimeCounts[state.regime]??0)+1;
  const result=evaluateRegimeOpportunity(spec.strategy,context,spec.parameters);
  if(result.status!=='candidate'){rejections[result.rejection_reason]=(rejections[result.rejection_reason]??0)+1;continue;}
  const q=qualifyActiveCandidate(result,{strategy_name:spec.strategy,enabled:true,min_score:75,min_rr:1.5,max_bars_in_trade:48,allowed_symbols:[data.symbol],allowed_timeframes:['1h'],params:spec.parameters},'A');
  if(!q.passed){for(const reason of q.reasons)rejections[reason]=(rejections[reason]??0)+1;continue;}eligible++;
  if(Date.parse(asOf)<=activeUntil){rejections.ONE_ACTIVE_PER_SYMBOL=(rejections.ONE_ACTIVE_PER_SYMBOL??0)+1;continue;}
  const [decision]=runBoundedValidation({runId:'regime-diagnostic',mode:'REPLAY',dataset:{id:data.symbol,source:'BINANCE_UM_FUTURES_ARCHIVE',provenance:'CHECKSUM_VERIFIED_ARCHIVE',sha256:'SEE_SOURCE_MANIFEST',timezone:'UTC'},configurationVersion:'regime-research/v1',parameterVersion:sha(JSON.stringify(spec)),symbol:data.symbol,market:'crypto',timeframe:context.timeframe,start:asOf,end:asOf,maxCycles:1,minimumScore:0,allowedGrades:['A+','A'],minSignalGrade:'A'},registry,[context]);
  const winner=decision?.arbitration.winner;if(!winner){rejections.ARBITRATION_REJECTED=(rejections.ARBITRATION_REJECTED??0)+1;continue;}
  // Full horizon must exist within this split; boundary trades cannot leak into the next period.
  if(i+48>=rows.length){rejections.SPLIT_BOUNDARY_HORIZON=(rejections.SPLIT_BOUNDARY_HORIZON??0)+1;continue;}
  const outcome=evaluateReplayOutcome(winner,rows.slice(i+1,i+49),asOf,{entryTiming:'NEXT_OPEN',feeBps:10*costMultiplier,spreadBps:2*costMultiplier,slippageBps:4*costMultiplier,fundingBps:(width===14400000?24:4.5)*costMultiplier,partialExitPct:.5,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST',tp1StopPolicy:'CONSERVATIVE_SAME_BAR',maxBarsInTrade:48,closeAtHorizon:true});
  if(!outcome)continue;if(outcome.status==='EXCLUDED'){rejections[outcome.exclusionReason??'EXCLUDED']=(rejections[outcome.exclusionReason??'EXCLUDED']??0)+1;continue;}
  activeUntil=Date.parse(outcome.exitTime!)+width;trades.push(outcome);(regimes[state.regime]??=[]).push(outcome);
 }
 return{strategy:spec.strategy,variant:spec.variant,symbol:data.symbol,sampleBars:rows.length,from:rows[0].open_time,to:rows.at(-1)!.open_time,parameters:spec.parameters,configurationHash:sha(JSON.stringify(spec)),costMultiplier,eligibleCandidates:eligible,metrics:summarize(trades),regimeCounts,regimes:Object.fromEntries(Object.entries(regimes).map(([k,v])=>[k,summarize(v)])),rejections,trades};
}
