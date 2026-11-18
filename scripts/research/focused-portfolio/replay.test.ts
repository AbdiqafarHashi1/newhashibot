import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replay,covers} from './replay.ts';
import {savedLedgerData} from './prepare.ts';
import {COST_POSITIVE_CONFIG_IDS} from '../../../supabase/functions/_shared/cost-positive-configs.ts';
const data=JSON.parse(savedLedgerData()),closes=JSON.parse(readFileSync('docs/research/part1-backfill/friday-closes.json','utf8')).closes;
test('research replay preserves every saved Part 1 economic result with the full original universe',()=>{
 const saved=JSON.parse(readFileSync('docs/research/part1-portfolio-results.json','utf8')).results;
 for(const row of saved){const actual=replay(data,closes,[...COST_POSITIVE_CONFIG_IDS],row.mode,row);for(const field of ['entries','returnPct','realizedMaxDrawdownPct','phaseOneDays','passDays','funded14','funded21','rotationUnpriced','openAtEnd']){
  if(typeof row[field]==='number')assert.ok(Math.abs(actual[field]-row[field])<1e-9,`${row.start}/${row.days}/${row.mode}/${field}`);else assert.equal(actual[field],row[field]);
 }}
});
test('coverage joins contiguous saved periods but never bridges an unobserved gap',()=>{
 const rows=[{strategy:'s',start:0,end:10},{strategy:'s',start:10,end:20}];assert.equal(covers(rows,'s',0,20),true);assert.equal(covers([{...rows[0],end:9},rows[1]],'s',0,20),false);assert.equal(covers(rows,'other',0,20),false);
});
test('Friday repricing closes once at its observed R without borrowing the later source target',()=>{
 const strategy='gold.native-momentum-15-48-2-5',entry=Date.parse('2025-04-03T10:00:00Z'),exit=Date.parse('2025-04-07T10:00:00Z'),at=Date.parse('2025-04-04T20:00:00Z');
 const fixture={trades:[{id:'trade',strategy,symbol:'XAUUSD',timeframe:'15m',entry,exit,netR:9}],coverage:[{strategy,start:'2025-04-01',end:'2025-05-01'}]};
 const r=replay(fixture,[{id:'trade',strategy,at,status:'PRICED',netR:-.5}], [strategy],'PROP_CHALLENGE_PASS',{start:'2025-04-01',days:30});assert.ok(Math.abs(r.returnPct-(-.425))<1e-9);assert.equal(r.openAtEnd,0);assert.equal(r.entries,1);
});

test('entry quality rejects unavailable and future observations without fabricating features',async()=>{
 const {qualityAllows,causalFeatureClock}=await import('./entry-quality.ts');
 assert.equal(causalFeatureClock(1000,999,1000),true);assert.equal(causalFeatureClock(1000,1001,1002),false);assert.equal(causalFeatureClock(1001,1000,1000),false);assert.equal(causalFeatureClock('missing',1,2),false);
 for(const rule of ['normal-volatility','higher-timeframe-aligned','normal-and-aligned','active-volume','low-observed-spread'] as const)assert.equal(qualityAllows(rule,null),false);
 assert.equal(qualityAllows('active-volume',{volumeRatio:1}),true);assert.equal(qualityAllows('active-volume',{volumeRatio:'1'}),false);assert.equal(qualityAllows('low-observed-spread',{spreadToRisk:null}),false);
});
test('the optional crypto comparison preset does not overwrite Personal defaults or appear on Prop/live accounts',async()=>{
 const {executionStrategyPresets}=await import('../../../supabase/functions/_shared/execution-strategy-presets.ts');
 const all=executionStrategyPresets('BINANCE','testnet','PERSONAL'),focus=all.find(p=>p.id==='crypto-eth-doge-demo');assert.equal(focus?.ids.length,2);assert.equal(all.find(p=>p.id==='reviewed')?.ids.length,6);
 assert.ok(!executionStrategyPresets('BINANCE','testnet','PROP_FUNDED').some(p=>p.id==='crypto-eth-doge-demo'));assert.ok(!executionStrategyPresets('BINANCE','live','PERSONAL').some(p=>p.id==='crypto-eth-doge-demo'));
});

test('drop-best sensitivity uses an admitted winner, not a higher-R source trade rejected for symbol conflict',()=>{
 const strategy='crypto.complementary-ema-pullback',entry=Date.parse('2025-04-01T10:00:00Z'),exit=entry+3600000;
 const source={trades:[{id:'a',strategy,symbol:'ETHUSDT',timeframe:'1h',entry,exit,netR:1},{id:'b',strategy,symbol:'ETHUSDT',timeframe:'1h',entry,exit,netR:9}],coverage:[{strategy,start:'2025-04-01',end:'2025-05-01'}]};
 const admitted:any[]=[];replay(source,[],[strategy],'PERSONAL',{start:'2025-04-01',days:30},0,false,admitted);assert.deepEqual(admitted.map(t=>t.id),['a']);
 const stressed=replay(source,[],[strategy],'PERSONAL',{start:'2025-04-01',days:30},0,true);assert.ok(Math.abs(stressed.returnPct-9)<1e-9);
});
