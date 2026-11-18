import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
function decode(path:string){const envelope=read(path);assert.equal(envelope.encoding,'gzip-base64/v1');const raw=gunzipSync(Buffer.from(envelope.data,'base64'));assert.equal(createHash('sha256').update(raw).digest('hex'),envelope.sha256);return JSON.parse(raw.toString());}
test('published evidence is genuine-source attributed, integrity checked, scenario separated and never production-qualified',()=>{
 const index=read('public/research/mission2-results.json');assert.equal(index.strategyInventory.length,30);assert(index.studies.length>=12);assert(index.strategyInventory.every((s:any)=>s.demoRecommendation==='NOT_APPROVED_YET'));
 for(const descriptor of index.studies){const study=decode('public'+descriptor.dataUrl);assert.equal(study.qualification,'NOT_GRANTED');assert(study.manifests.every((m:any)=>m.vendorChecksum&&m.sourceUrl.startsWith('https://data.binance.vision/')));
  for(const account of study.accounts){assert.equal(account.metrics.qualification,'NOT_GRANTED');assert(account.metrics.closedTrades<=account.metrics.authorizedEntries);assert(account.metrics.costs>=0);const marks=decode('public'+account.detailUrl).equityPath;assert(marks.length>0);assert(marks.every((m:any,i:number)=>Number.isFinite(m.equity)&&(!i||m.at>=marks[i-1].at)));}
 }
});
