import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const [baselineFile,exitFile]=process.argv.slice(2);if(!baselineFile||!exitFile)throw Error('Provide baseline and exit diagnosis JSON');
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex'),baselineRaw=await readFile(baselineFile,'utf8'),exitRaw=await readFile(exitFile,'utf8'),base=JSON.parse(baselineRaw),exit=JSON.parse(exitRaw);
if(exit.baselineHash!==hash(baselineRaw)||base.studies.length!==25||exit.cases.length!==50||base.publication!==false||exit.promotion!==false)throw Error('DIAGNOSIS_LINEAGE_INVALID');
for(const report of [base,exit])for(const [path,digest] of Object.entries(report.sourceHashes))if(hash(await readFile(path,'utf8'))!==digest)throw Error('DIAGNOSIS_SOURCE_CHANGED:'+path);
const directory='docs/research/strategy-diagnosis';await mkdir(directory,{recursive:true});const artifacts=[];
for(const [name,raw] of [['baseline',baselineRaw],['exits',exitRaw]]){const bytes=gzipSync(Buffer.from(raw),{level:9}),file=`${name}.json.gz`;await writeFile(`${directory}/${file}`,bytes);artifacts.push({file,jsonSha256:hash(raw),gzipSha256:hash(bytes),bytes:bytes.length});}
const summary={schema:'strategy-diagnosis-summary/v1',period:{from:base.protocol.from,toExclusive:base.protocol.toExclusive},scope:'Crypto15m only; previously examined DEVELOPMENT. Forex15m/Gold not measured.',caseCount:25,exitCaseCount:50,totalCandidateCycles:base.studies.reduce((n:number,s:{cycles:number})=>n+s.cycles,0),costsBps:base.protocol.costsBps,configurationAuthority:base.protocol.variants,baseline:base.aggregate,exitAlternatives:exit.aggregate,artifacts,verdict:'NO_STRATEGY_CERTIFIED',publication:false,execution:false,limitations:base.limitations};
await writeFile(`${directory}/summary.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({artifacts,cycles:summary.totalCandidateCycles,baseline:base.aggregate.map((a:{strategyId:string;metrics:{grossPF:number|null;netPF:number|null;resolved:number}})=>({id:a.strategyId,...a.metrics}))}));
