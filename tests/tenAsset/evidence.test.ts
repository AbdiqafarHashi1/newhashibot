import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import type {ArbitrationCandidate} from '../../supabase/functions/_shared/arbitrator.ts';import type {ReplayOutcome} from '../../supabase/functions/_shared/replay-outcomes.ts';import {TEN_ASSET_SYMBOLS} from '../../supabase/functions/_shared/ten-asset-contract.ts';
interface Evidence {sourceHashes:Record<string,string>;sources:unknown[];selected:{at:string;candidate:ArbitrationCandidate;base:ReplayOutcome;stress:ReplayOutcome}[];activity:{days:number;entries:number;quietDays:number;meanPerDay:number};base:{resolvedCount:number;profitFactor:number};byAsset:{symbol:string}[];complementarity:{status:string;missingRoles:string[]};publication:boolean;execution:boolean}
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
for(const folder of ['ten-asset','ten-asset-regimes'])test(`${folder}: genuine outcomes reconcile costs/cash flows, limits and participation`,()=>{const r=JSON.parse(gunzipSync(readFileSync(`docs/research/${folder}/evidence.json.gz`)).toString())as Evidence;const snapshot=JSON.parse(gunzipSync(readFileSync(`docs/research/${folder}/source-snapshot.json.gz`)).toString())as {sources:Record<string,string>};for(const [p,h]of Object.entries(r.sourceHashes))assert.equal(sha(snapshot.sources[p]),h,p);const active=new Map<string,number>(),counts=new Map<string,number>();let checked=0;const values:number[]=[];
 for(const s of r.selected){const at=Date.parse(s.at);for(const [symbol,until]of active)if(until<=at)active.delete(symbol);assert.equal(active.has(s.candidate.symbol),false,'no second active signal on same underlying');assert.ok(active.size<3);const width=s.candidate.timeframe==='1d'?86400000:900000;active.set(s.candidate.symbol,s.base.status==='EXCLUDED'?Date.parse(s.base.entryTime)+width:s.base.exitTime?Date.parse(s.base.exitTime)+width:Infinity);
  for(const [key,mult]of [['base',1],['stress',1.5]]as const){const o=s[key];if(o.netR===null){assert.ok(['OPEN','EXCLUDED'].includes(o.status));continue;}assert.ok(o.exitPrice!==null);const risk=Math.abs(o.entryPrice-s.candidate.stop),sign=s.candidate.side==='buy'?1:-1,bps=s.candidate.strategyId==='crypto.daily-ema-trend'?26:25;assert.ok(Math.abs(((o.exitPrice-o.entryPrice)*sign-o.entryPrice*bps*mult/10000)/risk-o.netR)<1e-9);assert.ok(Math.abs(o.cashFlowEvents.reduce((n,e)=>n+e.realizedR,0)-o.netR)<1e-9);checked++;}
  if(s.base.netR!==null)values.push(s.base.netR);if(s.base.status!=='EXCLUDED'){const d=s.base.entryTime.slice(0,10);counts.set(d,(counts.get(d)??0)+1);}
 }
 const pf=values.reduce((n,v)=>n+Math.max(v,0),0)/-values.reduce((n,v)=>n+Math.min(v,0),0),entries=[...counts.values()].reduce((a,b)=>a+b,0);assert.ok(Math.abs(pf-r.base.profitFactor)<1e-12);assert.equal(values.length,r.base.resolvedCount);assert.equal(entries,r.activity.entries);assert.equal(entries/607,r.activity.meanPerDay);assert.equal(607-counts.size,r.activity.quietDays);assert.deepEqual(r.byAsset.map(a=>a.symbol).sort(),[...TEN_ASSET_SYMBOLS].sort());assert.ok(checked>300);assert.equal(r.publication,false);assert.equal(r.execution,false);assert.equal(r.complementarity.status,'INCOMPLETE');assert.ok(r.complementarity.missingRoles.includes('BEAR_TREND'));assert.ok(r.complementarity.missingRoles.includes('RANGE'));
});

test('small UI projection exactly matches full receipts without bundling raw evidence',()=>{
 const ui=JSON.parse(readFileSync('docs/research/ten-asset/ui-comparison.json','utf8'));
 for(const [name,path] of [['small','daily-connected/combined-summary'],['wide','ten-asset/summary'],['regimes','ten-asset-regimes/summary']]){
  const full=JSON.parse(readFileSync(`docs/research/${path}.json`,'utf8'));
  assert.equal(ui[name].base.profitFactor,full.base.profitFactor);assert.equal(ui[name].stress.profitFactor,full.stress.profitFactor);
  assert.equal(ui[name].activity.entries,full.activity.entries);
 }
 assert.ok(readFileSync('docs/research/ten-asset/ui-comparison.json').length<15000);
});
