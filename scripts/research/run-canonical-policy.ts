import {readFile,writeFile,rename} from 'node:fs/promises';
import {runCanonicalHistoricalReplay,type CanonicalHistoricalDataset,type CanonicalReplayCheckpoint,type CanonicalReplayEvidence} from '../../supabase/functions/_shared/canonical-historical-replay.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
/** Input is a local frozen manifest, never a provider credential or production job. */
const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath)throw Error('Usage: node --import tsx scripts/research/run-canonical-policy.ts INPUT.json OUTPUT.json');
const input=JSON.parse(await readFile(inputPath,'utf8')) as {datasets:CanonicalHistoricalDataset[];configurations:unknown[];releases:unknown[];start:string;end:string;maxSteps:number;resumeFile?:string;releaseTimeline?:{at:number;enabledStrategyIds:string[]}[]};
const definitions=watchedStrategyCatalog(input.configurations,input.releases),counts:Record<string,number>={},reasons:Record<string,number>={};
let cancelled=false;process.once('SIGINT',()=>{cancelled=true;});process.once('SIGTERM',()=>{cancelled=true;});
const prior=input.resumeFile?JSON.parse(await readFile(input.resumeFile,'utf8')) as {checkpoint:CanonicalReplayCheckpoint;evidence:CanonicalReplayEvidence[]}:undefined;
const evidence:CanonicalReplayEvidence[]=prior?.evidence??[];
for(const row of evidence)for(const o of row.observations){counts[o.decision]=(counts[o.decision]??0)+1;reasons[o.reason]=(reasons[o.reason]??0)+1;}
const result=await runCanonicalHistoricalReplay({datasets:input.datasets,definitions,start:Date.parse(input.start),end:Date.parse(input.end),maxSteps:input.maxSteps,resume:prior?.checkpoint,releaseTimeline:input.releaseTimeline,shouldCancel:()=>cancelled,checkpoint:async(row,checkpoint)=>{
 evidence.push(row);for(const o of row.observations){counts[o.decision]=(counts[o.decision]??0)+1;reasons[o.reason]=(reasons[o.reason]??0)+1;}
 await writeFile(outputPath+'.checkpoint.tmp',JSON.stringify({checkpoint,evidence}));
 await rename(outputPath+'.checkpoint.tmp',outputPath+'.checkpoint.json');
 // Allow signals/cancellation to be observed between historical ticks.
 await new Promise(resolve=>setImmediate(resolve));
}});
const summary={schema:'mission2-policy-verification/v1',status:result.status,policy:'entry-decision/v1',lineage:result.checkpoint.lineage,period:{start:input.start,end:input.end},workerTicks:result.checkpoint.cursor,decisionCounts:counts,reasonCounts:reasons,events:result.checkpoint.store.events.length,confirmedEvents:result.checkpoint.store.events.filter(e=>e.confirmedSignalId).length,datasets:input.datasets.map(d=>({id:d.id,symbol:d.symbol,timeframe:d.timeframe,rows:d.candles.length,sha256:d.sha256,provenance:d.provenance})),profitability:'NOT_EVALUATED',providerFills:'NOT_SIMULATED',qualification:'NOT_GRANTED',productionMutations:false};
await writeFile(outputPath,JSON.stringify({summary,checkpoint:result.checkpoint,evidence},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
