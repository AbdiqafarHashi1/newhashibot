import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

test('PWA worker leaves published evidence and backend requests to the network', () => {
  const handlers = new Map<string,(event:unknown)=>void>();
  runInNewContext(readFileSync('public/service-worker.js','utf8'), {
    self:{addEventListener:(event:string,handler:(event:unknown)=>void)=>handlers.set(event,handler)},
    URL,
    caches:{match:()=>{throw new Error('Research must not read an old cache');}},
  });
  for(const path of ['/research/mission2-results.json','/research/mission2-current-validation-combined.json','/research/mission2-current-validation-combined-account-0.json','/rest/v1/signals']) {
    let intercepted = false;
    handlers.get('fetch')!({request:new Request('https://hashibot.test'+path),respondWith:()=>{intercepted=true;}});
    assert.equal(intercepted,false,path);
  }
});
