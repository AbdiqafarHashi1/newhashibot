import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {summarizeReplayOutcomes,type ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';
const root='docs/research/crypto-three-roles',summary=JSON.parse(await readFile(`${root}/summary.json`,'utf8'));
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
let verified=0;
for(const report of summary.reports){
 const bytes=await readFile(`${root}/${report.label}.json.gz`);assert.equal(hash(bytes),report.compressedSha256);const raw=gunzipSync(bytes);assert.equal(hash(raw),report.uncompressedSha256);const r=JSON.parse(raw.toString());assert.equal(r.studies.length,report.label==='development'?20:report.label==='validation'?4:10);assert.equal(r.publication,false);assert.equal(r.execution,false);assert.equal(r.promotion,false);
 for(const study of r.studies){const base:ReplayOutcome[]=[],stress:ReplayOutcome[]=[];let priorExit=-Infinity;
  for(const t of study.selections){assert.equal(t.candidate.lifecycle,'RESEARCH');assert.equal(t.candidate.publicationMode,'SHADOW');assert.equal(t.arbitration.chosen.id,t.candidate.id);assert.ok(Date.parse(t.outcome.entryTime)>=Date.parse(t.decisionAt));assert.equal(t.outcome.entryPrice,t.stressOutcome.entryPrice);assert.equal(t.outcome.exitTime,t.stressOutcome.exitTime);assert.ok(Date.parse(t.decisionAt)>priorExit);if(t.outcome.status!=='EXCLUDED')priorExit=t.outcome.exitTime?Date.parse(t.outcome.exitTime)+900000:Infinity;
   if(report.label==='validation')assert.ok(t.decisionAt>='2026-07-01T00:00:00.000Z'&&t.decisionAt<'2026-10-01T00:00:00.000Z');
   for(const o of [t.outcome,t.stressOutcome])if(o.netR!==null){assert.ok(Math.abs(o.cashFlowEvents.reduce((n:number,e:{realizedR:number})=>n+e.realizedR,0)-o.netR)<1e-9);assert.ok(Math.abs(o.grossR-o.costR-o.netR)<1e-9);verified++;}
   if(t.outcome.netR!==null){assert.ok(t.stressOutcome.netR<=t.outcome.netR);assert.ok(Math.abs(t.stressOutcome.costR-t.outcome.costR*1.5)<1e-9);}base.push(t.outcome);stress.push(t.stressOutcome);
  }
  assert.equal(summarizeReplayOutcomes(base).profitFactor,study.summary.profitFactor);assert.equal(summarizeReplayOutcomes(stress).profitFactor,study.stressSummary.profitFactor);
 }
}
assert.equal(summary.certification,'NOT_CERTIFIED');assert.equal(summary.reports.reduce((n:number,r:{cases:number})=>n+r.cases,0),34);console.log(`Crypto role evidence: ${verified} resolved baseline/stress cash-flow outcomes verified across all34 cases.`);
