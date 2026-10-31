import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const [development,validation,extra]=process.argv.slice(2);if(!development||!validation||!extra)throw Error('Usage: export-crypto-roles.ts <development.json> <validation.json> <extra-development.json>');
const sha=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const root='docs/research/crypto-three-roles';await mkdir(root,{recursive:true});
const compact=(s:Record<string,unknown>)=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='realizedEquityCurve'));
const reports=[];
for(const [label,path] of [['development',development],['validation',validation],['extra-development',extra]]){
 const raw=await readFile(path),r=JSON.parse(raw.toString());if(r.publication!==false||r.execution!==false||r.promotion!==false||r.studies.length!==(label==='development'?20:label==='validation'?4:10))throw Error('EVIDENCE_SCOPE');
 if(label==='development'&&sha(raw)!==JSON.parse(await readFile('scripts/research/crypto-alt-validation-frozen.json','utf8')).developmentReportSha256)throw Error('DEVELOPMENT_FROZEN_HASH_MISMATCH');
 for(const [path,expected] of Object.entries(r.sourceHashes))if(sha(await readFile(path))!==expected)throw Error('ENGINE_CHANGED:'+path);
 for(const s of r.studies)for(const t of s.selections)for(const o of [t.outcome,t.stressOutcome])if(o.netR!==null&&Math.abs(o.cashFlowEvents.reduce((n:number,e:{realizedR:number})=>n+e.realizedR,0)-o.netR)>1e-9)throw Error('CASH_FLOW_MISMATCH');
 const bytes=gzipSync(raw,{level:9});await writeFile(`${root}/${label}.json.gz`,bytes);
 reports.push({label,protocol:r.protocol,compressedSha256:sha(bytes),uncompressedSha256:sha(raw),sources:r.sources.length,cases:r.studies.length,aggregate:r.aggregate.map((a:Record<string,unknown>)=>({...a,summary:compact(a.summary as Record<string,unknown>),stress:compact(a.stress as Record<string,unknown>),calendar:Object.fromEntries(Object.entries(a.calendar as Record<string,Record<string,unknown>>).map(([y,s])=>[y,compact(s)]))})),assets:r.studies.map((s:Record<string,unknown>)=>({symbol:s.symbol,mode:s.mode,summary:compact(s.summary as Record<string,unknown>),stressSummary:compact(s.stressSummary as Record<string,unknown>)}))});
}
await writeFile(`${root}/summary.json`,JSON.stringify({schema:'crypto-three-roles-evidence/v1',reports,certification:'NOT_CERTIFIED',newsEvidence:'NOT_AVAILABLE_NOT_TESTED',publication:false,execution:false,promotion:false},null,2)+'\n');
console.log('Exported every development/validation case and verified source and cash-flow integrity.');
