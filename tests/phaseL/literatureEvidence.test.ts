import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {summarizeReplayOutcomes} from '../../supabase/functions/_shared/replay-outcomes.ts';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function load(dir:string){const s=JSON.parse(await readFile(`${dir}/summary.json`,'utf8')),c=await readFile(`${dir}/evidence.json.gz`);assert.equal(sha(c),s.compressedSha256);const raw=gunzipSync(c);assert.equal(sha(raw),s.uncompressedSha256);const r=JSON.parse(raw.toString());assert.equal(r.publication,false);assert.equal(r.execution,false);assert.equal(r.promotion,false);return r;}
const r=await load('docs/research/literature-btc-eth');assert.equal(r.studies.length,6);assert.equal(r.sources.length,72);let count=0;
for(const s of r.studies){let until=-Infinity;for(const t of s.selections){assert.equal(t.candidate.lifecycle,'RESEARCH');assert.equal(t.candidate.publicationMode,'SHADOW');assert.equal(t.arbitration.chosen.id,t.candidate.id);assert.ok(Date.parse(t.decisionAt)>until);assert.ok(Date.parse(t.outcome.entryTime)>=Date.parse(t.decisionAt));if(t.outcome.status!=='EXCLUDED')until=t.outcome.exitTime?Date.parse(t.outcome.exitTime)+900000:Infinity;
 if(s.id==='FUNDING_PRICE_DISAGREEMENT'){assert.ok(t.features.fundingObservedMs<Date.parse(t.decisionAt));assert.equal(Math.floor(t.features.fundingObservedMs/900000)*900000+900000,Date.parse(t.decisionAt));}
 assert.equal(t.outcome.entryPrice,t.stressOutcome.entryPrice);assert.equal(t.outcome.exitTime,t.stressOutcome.exitTime);for(const o of [t.outcome,t.stressOutcome])if(o.netR!==null){assert.ok(Math.abs(o.grossR-o.costR-o.netR)<1e-9);assert.ok(Math.abs(o.cashFlowEvents.reduce((n:number,c:{realizedR:number})=>n+c.realizedR,0)-o.netR)<1e-9);count++;}}
 assert.equal(summarizeReplayOutcomes(s.selections.map((t:any)=>t.outcome)).profitFactor,s.summary.profitFactor);assert.ok(s.failures.length>0);}
const d=await load('docs/research/hourly-reversal-diagnostic');assert.equal(d.studies.length,2);let paired=0;
for(const s of d.studies){const n=s.paired.length,mx=s.paired.reduce((n:number,p:any)=>n+p.lagReturn,0)/n,my=s.paired.reduce((n:number,p:any)=>n+p.nextReturn,0)/n;const covariance=s.paired.reduce((n:number,p:any)=>n+(p.lagReturn-mx)*(p.nextReturn-my),0),variance=s.paired.reduce((n:number,p:any)=>n+(p.lagReturn-mx)**2,0);assert.ok(Math.abs(covariance/variance-s.coefficient)<1e-10);
 for(const p of s.paired){assert.ok(Math.abs(p.fadeGross+Math.sign(p.lagReturn)*p.nextReturn)<1e-12);assert.ok(Math.abs(p.fadeNet-(p.fadeGross-(p.lagReturn===0?0:.0019)))<1e-12);assert.ok(Math.abs(p.fadeStress-(p.fadeGross-(p.lagReturn===0?0:.00285)))<1e-12);paired++;}}
console.log(`Literature evidence: six cases,72 source identities,${count} reconciled outcomes and ${paired} paired hourly observations/OLS coefficients passed.`);
