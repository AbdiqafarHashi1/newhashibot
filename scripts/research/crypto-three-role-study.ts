import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {aggregateHours,proposeRole,ROLES,type RoleProposal} from './crypto-three-role-rules.ts';
import {arbitrateCanonical} from '../../supabase/functions/_shared/trading-domain/arbitrator.ts';
import {evaluateReplayOutcome,summarizeReplayOutcomes,type ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const [root,output,validationManifest]=process.argv.slice(2);if(!root||!output)throw Error('Usage: crypto-three-role-study.ts <verified directory> <report.json> [frozen-validation-manifest.json]');
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
let protocol=JSON.parse(await readFile('scripts/research/crypto-three-role-protocol.json','utf8'));
if(validationManifest){
 const frozen=JSON.parse(await readFile(validationManifest,'utf8'));
 if(frozen.schema!=='crypto-alt-validation/v1'||frozen.protocol.from!=='2026-06-01T00:00:00.000Z'||frozen.protocol.decisionFrom!=='2026-07-01T00:00:00.000Z'||frozen.protocol.toExclusive!=='2026-10-01T00:00:00.000Z'||JSON.stringify(frozen.protocol.modes)!=='["ALT_RELATIVE_BREAKOUT"]')throw Error('UNAPPROVED_VALIDATION_INTERVAL');
 for(const [file,expected] of Object.entries(frozen.engineHashes))if(hash(await readFile(file,'utf8'))!==expected)throw Error('FROZEN_ENGINE_CHANGED:'+file);
 if(frozen.developmentPassed!==true)throw Error('DEVELOPMENT_GATE_FAILED');protocol=frozen.protocol;
}
const datasets=new Map<string,{rows:StrategyCandle[];hours:StrategyCandle[]}>(),sources=[];
for(const symbol of protocol.symbols as string[]){
 const names=(await readdir(root)).filter(n=>n.startsWith(symbol+'-15m-')&&n.endsWith('.json')&&!n.endsWith('.manifest.json')).sort();if(names.length!==(validationManifest?4:18))throw Error('INCOMPLETE_SOURCE:'+symbol);
 const rows:StrategyCandle[]=[];
 for(const name of names){const raw=await readFile(`${root}/${name}`,'utf8'),m=JSON.parse(await readFile(`${root}/${name.replace('.json','.manifest.json')}`,'utf8')),archive=name.replace('.json','.zip'),zip=await readFile(`${root}/${archive}`),checksum=(await readFile(`${root}/${archive}.CHECKSUM`,'utf8')).split(/\s+/)[0];
  if(hash(raw)!==m.datasetSha256||hash(zip)!==checksum||checksum!==m.rawSha256||m.nativeFlow!==true||m.sourceUrl!==`https://data.binance.vision/data/futures/um/monthly/klines/${symbol}/15m/${archive}`)throw Error('SOURCE_HASH_OR_IDENTITY');
  const part=JSON.parse(raw) as StrategyCandle[];if(part.length!==m.rows)throw Error('SOURCE_COUNT');rows.push(...part);sources.push({name,...m});
 }
 const start=Date.parse(protocol.from);if(rows.length!==(Date.parse(protocol.toExclusive)-start)/900000||rows.some((c,i)=>c.symbol!==symbol||c.timeframe!=='15m'||c.source!=='BINANCE_USDM_KLINES'||Date.parse(c.open_time)!==start+i*900000))throw Error('SOURCE_COVERAGE');
 datasets.set(symbol,{rows,hours:aggregateHours(rows)});
}
const btc=datasets.get('BTCUSDT')!.hours,studies=[];
const baseCosts=(horizon:number)=>({feeBps:protocol.costs.feeBps,spreadBps:protocol.costs.spreadBps,slippageBps:protocol.costs.slippageBps,fundingBps:Math.ceil(horizon/32)*protocol.costs.fundingBpsPer8Hours});
for(const [symbol,{rows,hours}] of datasets)for(const mode of (protocol.modes??[...ROLES,'COMBINED']) as (typeof ROLES[number]|'COMBINED')[]){
 const selections:{decisionAt:string;regime:string;outcome:ReplayOutcome;stressOutcome:ReplayOutcome;candidate:RoleProposal['candidate'];arbitration:ReturnType<typeof arbitrateCanonical>}[]=[],rejects:Record<string,number>={};let activeUntil=-Infinity,cycles=0;
 const reject=(s:string)=>{rejects[s]=(rejects[s]??0)+1};
 for(let i=239;i<hours.length;i++){
  const at=Date.parse(hours[i].open_time)+3600000;if(protocol.decisionFrom&&at<Date.parse(protocol.decisionFrom))continue;cycles++;if(at<=activeUntil){reject('ONE_ACTIVE_PER_SYMBOL');continue;}
  const proposals:RoleProposal[]=[];
  for(const role of mode==='COMBINED'?ROLES:[mode]){
   const horizon=role==='TREND_PULLBACK'?192:role==='RANGE_REVERSION'?32:96,costs=baseCosts(horizon),costBps=Object.values(costs).reduce((n,v)=>n+v,0);
   const result=proposeRole(role,hours.slice(Math.max(0,i-239),i+1),btc.slice(Math.max(0,i-239),i+1),costBps);if(result.proposal)proposals.push(result.proposal);else reject(`${role}:${result.reason}`);
  }
  const arbitration=arbitrateCanonical(proposals.map(({candidate:c})=>({id:c.id,strategyId:c.strategyId,strategyVersion:c.strategyVersion,configurationVersion:protocol.schema,timestamp:new Date(at).toISOString(),symbol:c.symbol,primaryTimeframe:'1h' as const,side:c.side==='buy'?'BUY' as const:'SELL' as const,entry:c.entry,stop:c.stop,targets:c.targets,score:c.score,evidence:{reasonCodes:[],indicators:{},observations:{research:true}}})),{minimumScore:0,blockedSymbols:[]});
  const selected=proposals.find(p=>p.candidate.id===arbitration.chosen?.id);if(!selected){reject('NO_TRADE');continue;}
  const {candidate,horizon,regime}=selected,index=(i+1)*4,costs=baseCosts(horizon),future=rows.slice(index,index+horizon);
  const assumptions={entryTiming:'NEXT_OPEN' as const,...costs,partialExitPct:0,moveStopToBreakevenAfterTp1:false,trailingStopR:null,sameCandlePolicy:'STOP_FIRST' as const,maxBarsInTrade:horizon,closeAtHorizon:true};
  const outcome=evaluateReplayOutcome(candidate,future,new Date(at).toISOString(),assumptions),stressOutcome=evaluateReplayOutcome(candidate,future,new Date(at).toISOString(),{...assumptions,...Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,v*protocol.stressMultiplier]))});
  if(!outcome||!stressOutcome){reject('NO_FUTURE_CANDLE');continue;}
  selections.push({decisionAt:new Date(at).toISOString(),regime,candidate,outcome,stressOutcome,arbitration});
  if(outcome.status!=='EXCLUDED')activeUntil=outcome.exitTime?Date.parse(outcome.exitTime)+900000:Infinity;
 }
 const outcomes=selections.map(t=>t.outcome),stress=selections.map(t=>t.stressOutcome),summary=summarizeReplayOutcomes(outcomes),stressSummary=summarizeReplayOutcomes(stress);
 const result={symbol,mode,cycles,summary,stressSummary,calendar:Object.fromEntries((validationManifest?['2026']:['2025','2026']).map(year=>[year,summarizeReplayOutcomes(selections.filter(t=>t.decisionAt.startsWith(year)).map(t=>t.outcome))])),rejects,selections};studies.push(result);
 console.log(JSON.stringify({symbol,mode,n:summary.resolvedCount,PF:summary.profitFactor,meanR:summary.expectancyR,stressPF:stressSummary.profitFactor}));
}
const aggregate=((protocol.modes??[...ROLES,'COMBINED']) as string[]).map(mode=>{const cases=studies.filter(s=>s.mode===mode&&(mode!=='ALT_RELATIVE_BREAKOUT'||!['BTCUSDT','ETHUSDT'].includes(s.symbol))),trades=cases.flatMap(s=>s.selections),summary=summarizeReplayOutcomes(trades.map(t=>t.outcome)),stress=summarizeReplayOutcomes(trades.map(t=>t.stressOutcome)),calendar=Object.fromEntries((validationManifest?['2026']:['2025','2026']).map(y=>[y,summarizeReplayOutcomes(trades.filter(t=>t.decisionAt.startsWith(y)).map(t=>t.outcome))]));
 const failures=[];if(summary.resolvedCount<protocol.gates.minimumResolved)failures.push('INSUFFICIENT_SAMPLE');if((summary.profitFactor??0)<protocol.gates.minimumNetPF)failures.push('NET_PF');if((summary.expectancyR??-Infinity)<protocol.gates.minimumNetMeanR)failures.push('NET_EXPECTANCY');if(cases.some(s=>(s.summary.expectancyR??-Infinity)<=0))failures.push('ASSET_CONSISTENCY');if(Object.values(calendar).some(s=>(s.expectancyR??-Infinity)<=0))failures.push('CALENDAR_CONSISTENCY');if((stress.expectancyR??-Infinity)<=0)failures.push('COST_STRESS');
 return {mode,summary,stress,calendar,failures,verdict:failures.length?(validationManifest?'VALIDATION_GATE_NOT_MET':'FAILED_DEVELOPMENT'):'REQUIRES_PRODUCTION_PARITY_AND_NEW_VALIDATION'};
});
const sourceFiles=['scripts/research/crypto-three-role-study.ts','scripts/research/crypto-three-role-rules.ts','scripts/research/crypto-three-role-protocol.json','supabase/functions/_shared/replay-outcomes.ts','supabase/functions/_shared/trading-domain/arbitrator.ts'];
await mkdir(output.substring(0,output.lastIndexOf('/'))||'.',{recursive:true});await writeFile(output,JSON.stringify({protocol,sources,sourceHashes:Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,hash(await readFile(p,'utf8'))]))),aggregate,studies,newsEvidence:'NOT_AVAILABLE_NOT_TESTED',publication:false,execution:false,promotion:false},null,2)+'\n');
