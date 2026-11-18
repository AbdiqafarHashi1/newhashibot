import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {COST_POSITIVE_CONFIG_IDS} from '../../supabase/functions/_shared/cost-positive-configs.ts';
test('Friday fixture settles FX once, preserves Personal exits and leaves crypto held',()=>{
 const cwd=mkdtempSync(join(tmpdir(),'part1-friday-test-'));
 try{
  mkdirSync(join(cwd,'.tmp'));mkdirSync(join(cwd,'docs/research/part1-backfill'),{recursive:true});
  const strategy='gold.native-momentum-15-48-2-5';
  const gold={id:'gold-fixture',strategy,symbol:'XAUUSD',timeframe:'15m',entry:Date.parse('2025-04-03T10:00:00Z'),exit:Date.parse('2025-04-07T10:00:00Z'),netR:2,source:'fixture-only'};
  const crypto={...gold,id:'crypto-fixture',strategy:'crypto.launch-trend-pullback-48-1.5-5',symbol:'BNBUSDT',entry:Date.parse('2025-04-08T10:00:00Z'),exit:Date.parse('2025-04-14T10:00:00Z'),netR:1};
  writeFileSync(join(cwd,'.tmp/part1-ledgers.json'),JSON.stringify({sources:[{strategy,sha256:'fixture-only'}],trades:[gold,crypto],coverage:COST_POSITIVE_CONFIG_IDS.map(strategy=>({strategy,start:'2025-01-01',end:'2027-01-01'})),missingReports:[],missingStrategies:[],limitations:['Synthetic unit fixture only; never included in research evidence']}));
  const at=Date.parse('2025-04-04T20:00:00Z');
  writeFileSync(join(cwd,'docs/research/part1-backfill/friday-closes.json'),JSON.stringify({closes:[{strategy,id:gold.id,sourceReportSha256:'fixture-only',status:'PRICED',at,observedAt:at,netR:.5}],limitations:[]}));
  execFileSync(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),resolve('scripts/part1/simulate.ts')],{cwd,stdio:'pipe'});
  const out=JSON.parse(readFileSync(join(cwd,'docs/research/part1-portfolio-results.json'),'utf8'));
  const row=(mode:string)=>out.results.find((r:any)=>r.start==='2025-04-01'&&r.days===30&&r.mode===mode);
  assert.equal(row('PERSONAL').entries,2);
  assert.ok(Math.abs(row('PERSONAL').returnPct-3.02)<1e-8);
  assert.ok(Math.abs(row('PROP_CHALLENGE_PASS').returnPct-1.2786125)<1e-8);
  assert.equal(row('PROP_CHALLENGE_PASS').rotationUnpriced,0);
  assert.equal(row('PROP_CHALLENGE_PASS').openAtEnd,0);
 }finally{rmSync(cwd,{recursive:true,force:true});}
});
