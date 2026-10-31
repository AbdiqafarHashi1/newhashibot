import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
interface Outcome {netR:number|null;grossR:number|null;costR:number;status:string;cashFlowEvents:{realizedR:number}[]}
interface Study {trades:{outcome:Outcome}[];metrics:{resolved:number;netR:number;grossR:number}}
const summary=JSON.parse(readFileSync('docs/research/strategy-diagnosis/summary.json','utf8'));
const hash=(s:Uint8Array)=>createHash('sha256').update(s).digest('hex');let checked=0;
assert.equal(summary.verdict,'NO_STRATEGY_CERTIFIED');assert.equal(summary.publication,false);assert.equal(summary.caseCount,25);assert.equal(summary.exitCaseCount,50);
for(const artifact of summary.artifacts){const bytes=readFileSync(`docs/research/strategy-diagnosis/${artifact.file}`);assert.equal(hash(bytes),artifact.gzipSha256);const raw=gunzipSync(bytes);assert.equal(hash(raw),artifact.jsonSha256);const report=JSON.parse(raw.toString('utf8'));assert.equal(report.publication,false);assert.equal(report.promotion,false);
 const studies:Study[]=report.studies??report.cases;assert.equal(studies.length,artifact.file.startsWith('baseline')?25:50);
 for(const study of studies){const resolved=study.trades.map(t=>t.outcome).filter(r=>r.netR!==null);assert.equal(resolved.length,study.metrics.resolved);assert.ok(Math.abs(resolved.reduce((n,r)=>n+r.netR!,0)-study.metrics.netR)<1e-7);
  for(const r of resolved){assert.ok(Math.abs(r.grossR!-r.costR-r.netR!)<1e-9);assert.ok(Math.abs(r.cashFlowEvents.reduce((n,e)=>n+e.realizedR,0)-r.netR!)<1e-9);checked++;}
 }
}
console.log(`Archived diagnosis: both SHA-256-verified reports, all 75 cases and ${checked} cash-flow-reconciled scenario outcomes passed. Overlapping scenarios are not independent trades.`);
