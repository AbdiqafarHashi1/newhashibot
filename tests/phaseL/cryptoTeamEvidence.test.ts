import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const sha=(s:Buffer|string)=>createHash('sha256').update(s).digest('hex'),folder='docs/research/crypto-team',summary=JSON.parse(readFileSync(`${folder}/summary.json`,'utf8')),z=readFileSync(`${folder}/evidence.json.gz`),raw=gunzipSync(z),r=JSON.parse(raw.toString()),snapshot=JSON.parse(gunzipSync(readFileSync(`${folder}/source-snapshot.json.gz`)).toString());
assert.equal(sha(z),summary.compressedSha256);assert.equal(sha(raw),summary.uncompressedSha256);for(const [p,h]of Object.entries(r.sourceHashes))assert.equal(sha(snapshot.sources[p]),h,p);
for(const p of ['supabase/functions/_shared/coordinated-crypto.ts','supabase/functions/_shared/coordinated-crypto-contract.ts','supabase/functions/_shared/coordinated-crypto-policy.ts','supabase/functions/_shared/coordinated-crypto-selection.ts'])assert.equal(sha(readFileSync(p)),r.sourceHashes[p],p);
assert.equal(r.sources.length,72);assert.equal(r.cases.length,5);assert.equal(r.publication,false);assert.equal(r.execution,false);assert.equal(r.promotion,false);assert.ok(r.cases.every((c:{stage:string;failures:string[]})=>c.stage==='development'&&c.failures.length>0));
let paired=0;const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
for(const c of r.cases){let profit=0,loss=0,net=0;const active=new Map<string,number>(),identities=new Set<string>();
 for(const row of c.selections){const time=Date.parse(row.decisionAt),symbol=row.candidate.symbol;for(const [s,expiry]of active)if(expiry<=time)active.delete(s);assert.ok(!active.has(symbol));assert.ok(active.size<3);active.set(symbol,Date.parse(row.candidate.expiry));const identity=`${symbol}:${row.decisionAt}`;assert.ok(!identities.has(identity));identities.add(identity);
  for(const [o,bps]of [[row.outcome,25],[row.stressOutcome,37.5]] as const){if(o.netR===null)continue;const sign=row.candidate.side==='buy'?1:-1,risk=(o.entryPrice-row.candidate.stop)*sign;assert.ok(risk>0);const gross=(o.exitPrice-o.entryPrice)*sign/risk,cost=o.entryPrice*bps/10000/risk;close(o.grossR,gross);close(o.costR,cost);close(o.netR,gross-cost);close(o.cashFlowEvents.reduce((n:number,e:{realizedR:number})=>n+e.realizedR,0),o.netR);paired++;}
  if(row.outcome.netR!==null){net+=row.outcome.netR;if(row.outcome.netR>0)profit+=row.outcome.netR;else loss-=row.outcome.netR;}
 }
 if(loss)close(c.summary.profitFactor,profit/loss);close(c.summary.expectancyR,net/c.summary.resolvedCount);assert.ok(c.selections.every((x:{arbitration:{winner?:{id:string}};candidate:{id:string}})=>x.arbitration.winner?.id===x.candidate.id));
}
assert.equal(paired,1258);console.log(`Four-role evidence: ${paired} independently calculated base/stress P&L/cash-flow cases; same-symbol exclusivity, max-three concentration, all failures retained and no release grant.`);
