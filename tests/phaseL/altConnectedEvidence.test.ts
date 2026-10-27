import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex'),folder='docs/research/alt-connected',summary=JSON.parse(readFileSync(`${folder}/summary.json`,'utf8')),z=readFileSync(`${folder}/evidence.json.gz`),raw=gunzipSync(z),e=JSON.parse(raw.toString());
assert.equal(sha(z),summary.compressedSha256);assert.equal(sha(raw),summary.uncompressedSha256);
const snapshot=JSON.parse(gunzipSync(readFileSync(`${folder}/source-snapshot.json.gz`)).toString());assert.equal(snapshot.commit,'e7a5afc12e392c3bf628f38cef3d70f17144ba80');for(const [path,hash]of Object.entries(e.sourceHashes))assert.equal(sha(snapshot.sources[path]),hash,path);
assert.equal(e.configuration.researchOnly,true);assert.equal(e.publication,false);assert.equal(e.execution,false);assert.equal(e.promotion,false);assert.equal(e.parityDecisions,24288);assert.equal(e.sources.length,48);assert.equal(e.runs.length,12);assert.equal(e.runs.reduce((n:number,r:{cycles:number})=>n+r.cycles,0),97152);assert.equal(e.bySymbol.length,11);
const old=JSON.parse(gunzipSync(readFileSync('docs/research/alt-universe/evidence.json.gz')).toString()),prior=new Map<string,{candidate:{stop:number;entry:number};outcome:Record<string,number|string>;stressOutcome:Record<string,number|string>}>(old.cases.flatMap((c:{symbol:string;selections:{decisionAt:string}[]})=>c.selections.map(s=>[`${c.symbol}:${s.decisionAt}`,s])));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);let positive=0,negative=0,net=0;
for(const row of e.outcomes){const p=prior.get(`${row.outcome.symbol}:${row.decisionAt}`);assert.ok(p,'connected selection matches frozen arithmetic/entry period');
 for(const [outcome,costBps,previous]of [[row.outcome,25,p.outcome],[row.stressOutcome,37.5,p.stressOutcome]] as const){
  assert.equal(outcome.entryTime,previous.entryTime);assert.equal(outcome.exitTime,previous.exitTime);assert.equal(outcome.status,previous.status);near(outcome.entryPrice,Number(previous.entryPrice));near(outcome.exitPrice,Number(previous.exitPrice));near(outcome.netR,Number(previous.netR));
  const risk=outcome.entryPrice-p.candidate.stop,expectedGross=(outcome.exitPrice-outcome.entryPrice)/risk,expectedCost=outcome.entryPrice*costBps/10000/risk;
  assert.ok(risk>0);near(outcome.grossR,expectedGross);near(outcome.costR,expectedCost);near(outcome.netR,expectedGross-expectedCost);near(outcome.cashFlowEvents.reduce((n:number,c:{realizedR:number})=>n+c.realizedR,0),outcome.netR);
 }
 const value=row.outcome.netR;net+=value;if(value>0)positive+=value;else negative-=value;
}
assert.equal(e.outcomes.length,117);near(e.overall.profitFactor,positive/negative);near(e.overall.expectancyR,net/117);assert.equal(e.activity.observedDays,92);assert.equal(e.activity.activeDays+e.activity.zeroEntryDays,92);assert.equal(e.activity.daily.reduce((n:number,d:{entries:number})=>n+d.entries,0),117);
console.log('Connected alt evidence: 97,152 cycles, 24,288 frozen hourly decisions, 117 matching selections, 234 independent base/stress P&L/cash-flow calculations; research-only, fixed losing assets retained.');
