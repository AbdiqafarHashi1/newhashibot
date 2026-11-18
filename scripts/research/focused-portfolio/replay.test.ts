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
test('Personal defaults use audited growth strategies while all earlier engines remain Admin comparisons',async()=>{
 const {executionStrategyPresets}=await import('../../../supabase/functions/_shared/execution-strategy-presets.ts');
 const all=executionStrategyPresets('BINANCE','testnet','PERSONAL');assert.equal(all.find(p=>p.id==='reviewed')?.ids.length,1);assert.equal(all.find(p=>p.id==='all-reviewed-comparison')?.ids.length,6);
 assert.ok(!all.some(p=>p.id==='crypto-eth-doge-demo'));
});

test('drop-best sensitivity uses an admitted winner, not a higher-R source trade rejected for symbol conflict',()=>{
 const strategy='crypto.complementary-ema-pullback',entry=Date.parse('2025-04-01T10:00:00Z'),exit=entry+3600000;
 const source={trades:[{id:'a',strategy,symbol:'ETHUSDT',timeframe:'1h',entry,exit,netR:1},{id:'b',strategy,symbol:'ETHUSDT',timeframe:'1h',entry,exit,netR:9}],coverage:[{strategy,start:'2025-04-01',end:'2025-05-01'}]};
 const admitted:any[]=[];replay(source,[],[strategy],'PERSONAL',{start:'2025-04-01',days:30},0,false,admitted);assert.deepEqual(admitted.map(t=>t.id),['a']);
 const stressed=replay(source,[],[strategy],'PERSONAL',{start:'2025-04-01',days:30},0,true);assert.ok(Math.abs(stressed.returnPct-9)<1e-9);
});

test('Personal risk experiment exposes incompatible caps and margin sensitivity without changing Prop',()=>{
 const strategy='crypto.test',fixture={trades:[{id:'a',strategy,symbol:'BTCUSDT',timeframe:'1h',entry:Date.parse('2025-04-01T01:00Z'),exit:Date.parse('2025-04-01T02:00Z'),netR:2,notionalPerRisk:100}],coverage:[{strategy,start:'2025-04-01',end:'2025-05-01'}]},window={start:'2025-04-01',days:30};
 const p={riskPct:5,dailyHaltPct:15,peakHaltPct:60,portfolioLimitPct:15,correlatedLimitPct:3,leverage:15,marginBudgetPct:50};
 const run=(policy:typeof p)=>replay(fixture,[],[strategy],'PERSONAL',window,0,false,undefined,policy);
 assert.equal(run(p).entries,0);assert.equal(run({...p,correlatedLimitPct:10,leverage:3}).blocked.MARGIN_CAPACITY,1);
 const admitted=run({...p,correlatedLimitPct:10});assert.equal(admitted.entries,1);assert.ok(Math.abs(admitted.returnPct-10)<1e-9);
 assert.equal(run({...p,correlatedLimitPct:10,leverage:100}).returnPct,admitted.returnPct);
 assert.throws(()=>replay(fixture,[],[strategy],'PROP_CHALLENGE_PASS',window,0,false,undefined,p),/Personal-only/);
});

test('experimental daily loss lock resets next UTC day while peak loss remains a hard entry lock',()=>{
 const strategy='crypto.test',at=Date.parse('2025-04-01T01:00Z'),trade=(id:string,entry:number,netR:number)=>({id,strategy,symbol:'BTCUSDT',timeframe:'1h',entry,exit:entry+1000,netR});
 const fixture={trades:[trade('a',at,-2),trade('b',at+2000,1),trade('c',at+86400000,1)],coverage:[{strategy,start:'2025-04-01',end:'2025-05-01'}]},p={riskPct:5,dailyHaltPct:8,peakHaltPct:60,portfolioLimitPct:15,correlatedLimitPct:10};
 const r=replay(fixture,[],[strategy],'PERSONAL',{start:'2025-04-01',days:30},0,false,undefined,p);assert.equal(r.entries,2);assert.equal(r.blocked.EXPERIMENT_DAILY_HALT,1);
 const peak=replay(fixture,[],[strategy],'PERSONAL',{start:'2025-04-01',days:30},0,false,undefined,{...p,peakHaltPct:9});assert.equal(peak.entries,1);assert.equal(peak.blocked.EXPERIMENT_PEAK_HALT,2);
});
