import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {aggregateHours} from './crypto-three-role-rules.ts';
import {calculateActiveIndicators} from '../../supabase/functions/_shared/active-validation-runtime.ts';
import {observeAdaptiveMarket,type AdaptiveMarketState} from '../../supabase/functions/_shared/adaptive-market-policy.ts';
import {evaluateEvidenceGovernor,type GovernorLabel} from '../../supabase/functions/_shared/strategy-evidence-governor.ts';
import {arbitrateCanonical} from '../../supabase/functions/_shared/trading-domain/arbitrator.ts';
import {summarizeReplayOutcomes,type ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
const [root]=process.argv.slice(2);if(!root)throw Error('Usage: crypto-governor-study.ts <verified development directory>');
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex'),protocol=JSON.parse(await readFile('scripts/research/crypto-governor-protocol.json','utf8'));
interface Event {candidate:ArbitrationCandidate;decisionAt:string;outcome:ReplayOutcome;stressOutcome:ReplayOutcome;state:AdaptiveMarketState}
interface Study {mode:string;selections:Omit<Event,'state'>[]}
const reports=[];for(const name of ['development','extra-development']){const raw=await readFile(`docs/research/crypto-three-roles/${name}.json.gz`);reports.push({sha:sha(raw),report:JSON.parse(gunzipSync(raw).toString()) as {sources:{name:string;datasetSha256:string}[];studies:Study[]}});}
const sourceHash=sha(JSON.stringify(reports.map(r=>r.sha))),hours=new Map<string,StrategyCandle[]>();
for(const symbol of ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT']){
 const rows:StrategyCandle[]=[];for(const source of reports[0].report.sources.filter(s=>s.name.startsWith(symbol+'-')).sort((a,b)=>a.name.localeCompare(b.name))){const raw=await readFile(`${root}/${source.name}`,'utf8');if(sha(raw)!==source.datasetSha256)throw Error('SOURCE_HASH');rows.push(...JSON.parse(raw));}
 if(rows.length!==52416||rows.some((c,i)=>Date.parse(c.open_time)!==Date.parse('2025-01-01T00:00:00Z')+i*900000||c.symbol!==symbol))throw Error('SOURCE_COVERAGE');hours.set(symbol,aggregateHours(rows));
}
const events:Event[]=reports.flatMap(r=>r.report.studies.filter(s=>s.mode!=='COMBINED').flatMap(s=>s.selections)).map(e=>{const h=hours.get(e.candidate.symbol)!,i=(Date.parse(e.decisionAt)-Date.parse(h[0].open_time))/3600000-1,history=h.slice(Math.max(0,i-109),i+1);if(!Number.isInteger(i)||Date.parse(history.at(-1)!.open_time)+3600000!==Date.parse(e.decisionAt))throw Error('ENTRY_CONTEXT');return {...e,state:observeAdaptiveMarket(history,calculateActiveIndicators(history)).state};}).sort((a,b)=>a.decisionAt.localeCompare(b.decisionAt)||a.candidate.id.localeCompare(b.candidate.id));
if(new Set(events.map(e=>e.candidate.id)).size!==events.length)throw Error('DUPLICATE_CANDIDATE');
const labels:GovernorLabel[]=events.filter(e=>e.outcome.netR!==null&&e.stressOutcome.netR!==null&&e.outcome.exitTime).map(e=>({id:e.candidate.id,strategyId:e.candidate.strategyId,symbol:e.candidate.symbol,state:e.state,entryAt:e.decisionAt,knownAt:new Date(Date.parse(e.outcome.exitTime!)+900000).toISOString(),netR:e.outcome.netR!,stressNetR:e.stressOutcome.netR!,sourceHash,classification:'SIMULATED'}));
const diagnostics=[],results=[];
for(const mode of ['BASELINE','EVIDENCE_GOVERNED']){
 const active=new Map<string,number>(),selected:Event[]=[],decisions=[];
 for(let i=0;i<events.length;){const group:Event[]=[events[i++]!];while(i<events.length&&events[i].decisionAt===group[0].decisionAt)group.push(events[i++]);if(group[0].decisionAt<protocol.decisionFrom)continue;
  for(const symbol of [...new Set(group.map(e=>e.candidate.symbol))]){
   const proposals=group.filter(e=>e.candidate.symbol===symbol),at=Date.parse(group[0].decisionAt);if(at<=(active.get(symbol)??-Infinity))continue;
   const assessments=proposals.map(e=>({event:e,assessment:evaluateEvidenceGovernor({strategyId:e.candidate.strategyId,symbol,state:e.state,at:e.decisionAt,sourceHash},labels,protocol)}));
   const eligible=mode==='BASELINE'?proposals:assessments.filter(a=>a.assessment.eligible).map(a=>a.event);
   const arbitration=arbitrateCanonical(eligible.map(e=>({id:e.candidate.id,strategyId:e.candidate.strategyId,strategyVersion:e.candidate.strategyVersion,configurationVersion:protocol.schema,timestamp:e.decisionAt,symbol,primaryTimeframe:'1h' as const,side:e.candidate.side==='buy'?'BUY' as const:'SELL' as const,entry:e.candidate.entry,stop:e.candidate.stop,targets:e.candidate.targets,score:e.candidate.score,evidence:{reasonCodes:[],indicators:{},observations:{research:true}}})),{minimumScore:0,blockedSymbols:[]});
   const winner=eligible.find(e=>e.candidate.id===arbitration.chosen?.id);
   decisions.push({at:group[0].decisionAt,symbol,state:proposals[0].state,winner:winner?.candidate.id??null,assessments:assessments.map(a=>({id:a.event.candidate.id,...a.assessment}))});
   if(winner){selected.push(winner);if(winner.outcome.status!=='EXCLUDED')active.set(symbol,winner.outcome.exitTime?Date.parse(winner.outcome.exitTime)+900000:Infinity);}
  }
 }
 const summary=summarizeReplayOutcomes(selected.map(e=>e.outcome)),stress=summarizeReplayOutcomes(selected.map(e=>e.stressOutcome));results.push({mode,summary,stress,selected,decisions});console.log(JSON.stringify({mode,n:summary.resolvedCount,pf:summary.profitFactor,mean:summary.expectancyR,decisions:decisions.length}));
}
for(const role of protocol.roles)for(const state of ['TREND_UP','TREND_DOWN','RANGE','COMPRESSION','TRANSITION','SHOCK','INVALID']){const rows=events.filter(e=>e.candidate.strategyId===role&&e.state===state);diagnostics.push({role,state,candidates:rows.length,resolved:rows.filter(e=>e.outcome.netR!==null).length,netR:rows.reduce((n,e)=>n+(e.outcome.netR??0),0)});}
const files=['scripts/research/crypto-governor-protocol.json','scripts/research/crypto-governor-study.ts','supabase/functions/_shared/strategy-evidence-governor.ts','supabase/functions/_shared/adaptive-market-policy.ts','supabase/functions/_shared/active-validation-runtime.ts','supabase/functions/_shared/indicator-engine.ts','supabase/functions/_shared/trading-domain/arbitrator.ts'];
const report={protocol,sourceHash,sourceReports:reports.map(r=>r.sha),sourceHashes:Object.fromEntries(await Promise.all(files.map(async p=>[p,sha(await readFile(p))]))),events:events.length,labels,diagnostics,results,limitations:['Counterfactual outcome labels, not provider fills.','Rule definitions were researched using the whole development interval; this is policy walk-forward on reused dates, not independent out-of-sample strategy validation.','No new entries are invented; this filters stored candidate events and is not full scanner registry parity.','Weekly-cluster normal lower estimate is approximate, not a profitability guarantee.','Calibration abstention does not establish a profitable strategy for an uncovered state.'],publication:false,execution:false,promotion:false};
const dir='docs/research/crypto-governor';await mkdir(dir,{recursive:true});const raw=JSON.stringify(report,null,2)+'\n',compressed=gzipSync(raw,{level:9});await writeFile(`${dir}/evidence.json.gz`,compressed);const compact=(s:Record<string,unknown>)=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='realizedEquityCurve'));await writeFile(`${dir}/summary.json`,JSON.stringify({protocol,events:events.length,labels:labels.length,sourceHash,uncompressedSha256:sha(raw),compressedSha256:sha(compressed),diagnostics,results:results.map(r=>({mode:r.mode,summary:compact(r.summary),stress:compact(r.stress),decisions:r.decisions.length})),publication:false,execution:false,promotion:false},null,2)+'\n');
