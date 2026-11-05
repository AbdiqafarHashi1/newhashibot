import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runCanonicalHistoricalReplay,historicalCandleChecksum,historicalOpeningQuote,type CanonicalHistoricalDataset} from '../../supabase/functions/_shared/canonical-historical-replay.ts';
import {watchedStrategyCatalog} from '../../supabase/functions/_shared/watched-strategy-catalog.ts';
import {closedAggregate} from '../../supabase/functions/_shared/regime-opportunities.ts';
import {discoverWatchedStrategies} from '../../supabase/functions/_shared/watched-strategy-discovery.ts';
import type {StrategyCandle} from '../../supabase/functions/_shared/professional-strategies.ts';
import {HistoricalConditionalStore} from '../../supabase/functions/_shared/historical-conditional-store.ts';
const now=Date.parse('2026-11-04T14:00:00Z'),w=300000;
async function fixture(){
 const candles:StrategyCandle[]=Array.from({length:244},(_,i)=>{const c=1000+i;return{symbol:'BTCUSDT',market_type:'crypto',timeframe:'5m',source:'CONTROLLED_TEST',open_time:new Date(now-(240-i)*w).toISOString(),open:c-4,high:c+5,low:c-5,close:c,volume:1000};});
 const d=watchedStrategyCatalog([{strategy_name:'MicroScalper',enabled:true,params:{entry_engine_version:1,tp2_r:3}}]).find(d=>d.id==='crypto.micro-scalper')!;
 const definition={...d,config:{...d.config,config_source:'measured_release:controlled-test-only'}};
 const higher=closedAggregate(candles,15,new Date(now+4*w).toISOString());
 const dataset=(rows:StrategyCandle[],tf:'5m'|'15m'):CanonicalHistoricalDataset=>({id:tf,sha256:'a'.repeat(64),symbol:'BTCUSDT',timeframe:tf,provenance:{source:'CONTROLLED_TEST',instrument:'CONTROLLED_TEST',limitations:['Synthetic engineering fixture, no profitability evidence']},candles:rows});
 const datasets=[dataset(candles,'5m'),dataset(higher,'15m')];for(const d of datasets)d.sha256=await historicalCandleChecksum(d.candles);
 return {candles,definition,datasets};
}
test('historical replay matches actual immediate production discovery with identical closed inputs',async()=>{
 const f=await fixture(),closed=f.candles.slice(0,240),higher=f.datasets[1].candles.filter(b=>Date.parse(b.open_time)+900000<=now);
 const expected=discoverWatchedStrategies({definitions:[f.definition],symbol:'BTCUSDT',tf:'5m',rows:closed,higher,now});
 assert.equal(expected.observations[0].decision,'IMMEDIATE_CONFIRMED');
 const result=await runCanonicalHistoricalReplay({...f,definitions:[f.definition],start:now,end:now,maxSteps:1});
 const found=result.evidence[0].observations.find(r=>r.timeframe==='5m');
 assert.deepEqual(found,expected.observations[0]);
 const events=result.checkpoint.store.events.filter(e=>e.confirmedSignalId);
 assert.equal(events.length,1);assert.equal(events[0].setupId,expected.setups[0].id);
 assert.equal(events[0].status,'ACTIVE');assert(result.checkpoint.store.records[0].state.entryDecision?.executionEligible);
});
test('unqualified research configuration never emits an actionable event',async()=>{
 const f=await fixture(),unqualified={...f.definition,config:{...f.definition.config,config_source:'research:only'}};
 const r=await runCanonicalHistoricalReplay({...f,definitions:[unqualified],start:now,end:now+w,maxSteps:6});
 assert(r.evidence.flatMap(e=>e.observations).some(o=>o.reason.includes('UNQUALIFIED_STRATEGY')));
 assert.equal(r.checkpoint.store.events.filter(e=>e.confirmedSignalId).length,0);
 assert(!r.evidence.some(e=>e.health.some(h=>h.state==='FEED_UNAVAILABLE'&&String(h.error).includes('PROJECTION_REJECTED'))));
});
test('checkpoint restart is deterministic, with no duplicate signal or future-candle influence',async()=>{
 const f=await fixture(),input={...f,definitions:[f.definition],start:now,end:now+3*w,maxSteps:16};
 const full=await runCanonicalHistoricalReplay(input);
 let stop=false;
 const interrupted=await runCanonicalHistoricalReplay({...input,shouldCancel:()=>stop,checkpoint:async(_e,c)=>{if(c.cursor===4)stop=true;}});
 assert.equal(interrupted.status,'CANCELLED');assert.equal(interrupted.checkpoint.cursor,4);
 const resumed=await runCanonicalHistoricalReplay({...input,resume:interrupted.checkpoint});
 assert.deepEqual(resumed.checkpoint,full.checkpoint);
 const alreadyCompleted=await runCanonicalHistoricalReplay({...input,resume:full.checkpoint});assert.deepEqual(alreadyCompleted.checkpoint,full.checkpoint);assert.equal(alreadyCompleted.evidence.length,0);
 const modified=await fixture();modified.candles[243]={...modified.candles[243],high:999999,low:1,close:100};modified.datasets[0].candles=modified.candles;modified.datasets[0].sha256=await historicalCandleChecksum(modified.candles);
 const originalEarly=await runCanonicalHistoricalReplay({...input,end:now,maxSteps:1});
 const modifiedEarly=await runCanonicalHistoricalReplay({...input,datasets:modified.datasets,end:now,maxSteps:1});
 assert.deepEqual(modifiedEarly.evidence,originalEarly.evidence);
 assert.equal(new Set(full.checkpoint.store.events.map(e=>e.id)).size,full.checkpoint.store.events.length);
 await assert.rejects(()=>runCanonicalHistoricalReplay({...input,start:now+60000,resume:interrupted.checkpoint}),/CHECKPOINT_LINEAGE/);
});
test('frozen incomplete setup confirms through the real historical watcher and original evaluator',async()=>{
 const f=await fixture();f.candles[239].open=f.candles[239].close-.01;
 const initial=discoverWatchedStrategies({definitions:[f.definition],symbol:'BTCUSDT',tf:'5m',rows:f.candles.slice(0,240),higher:f.datasets[1].candles.filter(b=>Date.parse(b.open_time)+900000<=now),now});
 assert.equal(initial.observations[0].decision,'CONDITIONAL_WATCH');
 const s=initial.setups[0],b=f.candles[240];Object.assign(b,{open:s.trigger-1,high:s.trigger+3,low:s.trigger-3,close:s.trigger+1});
 f.candles[241].open=b.close;f.candles[241].low=Math.min(f.candles[241].low,b.close);
 f.datasets[0].sha256=await historicalCandleChecksum(f.candles);
 const r=await runCanonicalHistoricalReplay({...f,definitions:[f.definition],start:now,end:now+w,maxSteps:6});
 const original=r.checkpoint.store.records.find(x=>x.state.id===s.id)!.state;
 assert.equal(original.watchOutcome,'CONFIRMED',JSON.stringify(original));
 assert.deepEqual(original.origin,s.origin);assert.equal(original.confirmationEvidence?.evaluatorOutcome,'CONFIRMED');
 assert.equal(r.checkpoint.store.events.filter(e=>e.confirmedSignalId&&e.setupId===s.id).length,1);
});
test('historical persistence enforces CAS, frozen identity and terminal watch outcomes',async()=>{
 const f=await fixture(),r=await runCanonicalHistoricalReplay({...f,definitions:[f.definition],start:now,end:now,maxSteps:1});
 const store=new HistoricalConditionalStore(()=>now,r.checkpoint.store),s=r.checkpoint.store.records[0].state;
 assert.equal(await store.admit(s),false);
 const next={...s,version:s.version+1,lastBar:new Date(now).toISOString(),status:'CLOSED' as const,result:'Controlled closure',exit:s.stop,netR:-1};
 const attempts=await Promise.all([store.save(next,s.version),store.save(next,s.version)]);assert(attempts.every(Boolean));
 assert.equal(store.snapshot().events.filter(e=>e.status==='CLOSED').length,1);
 await assert.rejects(()=>store.save({...next,version:next.version+1,status:'WAITING'},next.version),/TERMINAL/);
 await assert.rejects(()=>store.save({...next,version:next.version+1,trigger:next.trigger+1},next.version),/IMMUTABLE_SETUP_PLAN/);
});
test('dataset mutations, duplicate timestamps and unversioned replay state fail closed',async()=>{
 const f=await fixture(),input={...f,definitions:[f.definition],start:now,end:now,maxSteps:1};
 const altered=structuredClone(f.datasets);altered[0].candles[0].close+=.1;
 await assert.rejects(()=>runCanonicalHistoricalReplay({...input,datasets:altered}),/CHECKSUM_MISMATCH/);
 const duplicate=structuredClone(f.datasets);duplicate[0].candles[1].open_time=duplicate[0].candles[0].open_time;duplicate[0].sha256=await historicalCandleChecksum(duplicate[0].candles);
 await assert.rejects(()=>runCanonicalHistoricalReplay({...input,datasets:duplicate}),/INTEGRITY_INVALID/);
 await assert.rejects(()=>runCanonicalHistoricalReplay({...input,stepMs:300000}),/CLOCK_INVALID/);
});
test('release revocation is causal, auditable and cannot be changed across restart',async()=>{
 const f=await fixture();f.candles[239].open=f.candles[239].close-.01;f.datasets[0].sha256=await historicalCandleChecksum(f.candles);
 const input={...f,definitions:[f.definition],start:now,end:now+w,maxSteps:6,releaseTimeline:[{at:now+w,enabledStrategyIds:[]}]};
 const r=await runCanonicalHistoricalReplay(input);
 assert.equal(r.checkpoint.store.events.filter(e=>e.confirmedSignalId).length,0);
 assert(r.checkpoint.store.records.some(r=>r.state.status==='INVALIDATED'));
 await assert.rejects(()=>runCanonicalHistoricalReplay({...input,releaseTimeline:[],resume:r.checkpoint}),/CHECKPOINT_LINEAGE/);
});
test('missing next candle stays data-unavailable and expiry survives a worker restart',async()=>{
 const f=await fixture();f.candles[239].open=f.candles[239].close-.01;f.datasets[0].candles=f.candles.slice(0,240);f.datasets[0].sha256=await historicalCandleChecksum(f.datasets[0].candles);
 const r=await runCanonicalHistoricalReplay({...f,definitions:[f.definition],start:now,end:now+4*w,maxSteps:21});
 assert.equal(r.checkpoint.store.events.filter(e=>e.confirmedSignalId).length,0);
 assert(r.checkpoint.store.records.some(r=>r.state.status==='EXPIRED'));
 assert(r.evidence.some(e=>e.health.some(h=>h.state==='FEED_UNAVAILABLE')));
});

test('legacy runner cannot silently backtest a new-policy configuration with old entry rules',async()=>{
 const {runMultiDatasetScannerReplay}=await import('../../supabase/functions/_shared/multi-dataset-scanner-replay.ts');
 const f=await fixture();
 await assert.rejects(()=>runMultiDatasetScannerReplay({runId:'controlled',datasets:f.datasets.map(d=>({id:d.id,hash:d.sha256,configurationHash:'frozen',source:d.provenance.source,symbol:d.symbol,market:'crypto',timeframe:d.timeframe,candles:[...d.candles]})),configurationHash:'frozen',configuration:{version:'controlled',minSignalGrade:'A',strategies:[{id:f.definition.id,version:f.definition.version,enabled:true,minScore:72,minRiskReward:1.2,maxBarsInTrade:24,symbols:['BTCUSDT'],timeframes:['5m'],parameters:{entry_engine_version:1}}]},start:new Date(now).toISOString(),end:new Date(now+w).toISOString(),cooldownMs:0,maxCycles:10}),/CANONICAL_ENTRY_POLICY_REPLAY_REQUIRED/);
});

test('only bid/ask opening quotes are exposed, never future native flow or ask extrema',async()=>{
 const f=await fixture(),b={...f.candles[240],instrument_type:'SPOT' as const,quote_volume:999999,trade_count:10000,taker_buy_volume:500,taker_buy_quote_volume:20000,ask_open:1240,ask_high:9999,ask_low:1,ask_close:9999};
 const quote=historicalOpeningQuote(b);assert.equal(quote.ask_open,1240);assert.equal(quote.ask_high,1240);assert.equal(quote.ask_low,1240);assert.equal(quote.ask_close,1240);assert.equal(quote.high,b.open);assert.equal(quote.close,b.open);assert.equal(quote.quote_volume,undefined);assert.equal(quote.trade_count,undefined);assert.equal(quote.taker_buy_volume,undefined);
});
