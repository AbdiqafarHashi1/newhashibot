import test from 'node:test';
import assert from 'node:assert/strict';
import { CandleEngine, SUPPORTED_CANDLE_TIMEFRAMES, timeframeMs, validateCandle } from '../packages/candle-engine/index.js';
import { InMemoryEventBus, createEvent, type MarketTick } from '../packages/events/index.js';
import { InMemoryCandleCache, candleCacheKey } from '../packages/runtime-cache/index.js';
import type { Candle, Timeframe } from '../packages/types/index.js';

const at=(m:number)=>new Date(Date.UTC(2026,0,1,0,m,0)).toISOString();
const tick=(minute:number, price:number, volume=1, symbol='BTCUSDT', provider='binance'):MarketTick=>({market:'crypto',symbol,price,volume,exchangeVolume:volume,tickVolume:1,occurredAt:at(minute),receivedAt:at(minute),source:`market-data:${provider}`,provider,marketStatus:'open',feedHealth:'healthy'});
async function publish(engine:CandleEngine,bus:InMemoryEventBus,t:MarketTick){ engine.start(); await bus.publish(createEvent('MarketTickReceived', t, {source:t.source})); engine.stop(); }
function setup(tfs:Timeframe[]=['1m']){ const bus=new InMemoryEventBus(5000), cache=new InMemoryCandleCache(100,1000), engine=new CandleEngine(bus,cache,tfs,{gapCandles:true,lateTickPolicy:'apply-to-recent-closed'}); return {bus,cache,engine}; }

test('candle creation, explicit lifecycle, OHLC correctness, volume accumulation, cache and events', async()=>{
  const {bus,cache,engine}=setup(['1m']); engine.start();
  await bus.publish(createEvent('MarketTickReceived', tick(0,100,2), {source:'test'}));
  await bus.publish(createEvent('MarketTickReceived', tick(0,105,3), {source:'test'}));
  await bus.publish(createEvent('MarketTickReceived', tick(0,98,4), {source:'test'}));
  await bus.publish(createEvent('MarketTickReceived', tick(1,101,1), {source:'test'})); engine.stop();
  const closed=cache.get(candleCacheKey('crypto','BTCUSDT','1m'))![0]!;
  assert.equal(closed.open,100); assert.equal(closed.high,105); assert.equal(closed.low,98); assert.equal(closed.close,98); assert.equal(closed.volume,9); assert.equal(closed.lifecycleState,'CLOSED');
  assert.equal(engine.current('crypto','BTCUSDT','1m')?.lifecycleState,'OPEN');
  assert.equal(bus.history('CandleOpened').length,2); assert.equal(bus.history('CandleUpdated').length,2); assert.equal(bus.history('CandleClosing').length,1); assert.equal(bus.history('CandleClosed').length,1);
});

test('multiple timeframes align deterministically and supported set covers roadmap', async()=>{
  const {cache,engine,bus}=setup(['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w']); await publish(engine,bus,tick(7,100));
  for(const tf of SUPPORTED_CANDLE_TIMEFRAMES){ const c=engine.current('crypto','BTCUSDT',tf)!; assert.equal(Date.parse(c.closeTime)-Date.parse(c.openTime), timeframeMs(tf)); validateCandle(c); }
  assert.equal(cache.list().length,0);
});

test('historical warmup loads sorted closed candles, avoids duplicate live close, and emits completion', async()=>{
  const {engine,cache,bus}=setup(['1m']); const c=(m:number,close=100):Candle=>({market:'crypto',symbol:'BTCUSDT',timeframe:'1m',openTime:at(m),closeTime:at(m+1),open:close,high:close,low:close,close,volume:1,source:'binance',isClosed:true});
  await engine.warmup({market:'crypto',symbol:'BTCUSDT',timeframe:'1m',provider:'binance',candles:[c(1,101),c(0,100)]});
  await publish(engine,bus,tick(2,102)); await engine.flush(new Date(at(3)));
  const rows=cache.get(candleCacheKey('crypto','BTCUSDT','1m'))!;
  assert.deepEqual(rows.map(x=>x.openTime), [at(0),at(1),at(2)]);
  assert.equal(new Set(rows.map(x=>x.openTime)).size,3); assert.equal(bus.history('WarmupCompleted' as never).length,1);
});

test('gap detection and recovery create deterministic empty periods on provider reconnect', async()=>{
  const {engine,cache,bus}=setup(['1m']); engine.start();
  await bus.publish(createEvent('MarketTickReceived', tick(0,100), {source:'test'}));
  await bus.publish(createEvent('MarketTickReceived', tick(3,103), {source:'test'})); engine.stop();
  const rows=cache.get(candleCacheKey('crypto','BTCUSDT','1m'))!;
  assert.deepEqual(rows.map(x=>[x.openTime,x.close,x.volume,x.sourceMetadata?.quality]), [[at(0),100,1,'complete'],[at(1),100,0,'gap_fill'],[at(2),100,0,'gap_fill']]);
  assert.equal(bus.history('GapDetected' as never).length,1); assert.equal(bus.history('GapRecovered' as never).length,1);
});

test('late and out-of-order ticks update recent closed candle once and prevent duplicates', async()=>{
  const {engine,cache,bus}=setup(['1m']); engine.start();
  await bus.publish(createEvent('MarketTickReceived', tick(0,100,1), {source:'test'}));
  await bus.publish(createEvent('MarketTickReceived', tick(1,101,1), {source:'test'}));
  await bus.publish(createEvent('MarketTickReceived', {...tick(0,105,2), receivedAt:at(1)}, {source:'test'})); engine.stop();
  const rows=cache.get(candleCacheKey('crypto','BTCUSDT','1m'))!;
  assert.equal(rows.length,1); assert.equal(rows[0].high,105); assert.equal(rows[0].close,105); assert.equal(rows[0].volume,3);
  assert.equal(bus.history('LateTickProcessed' as never).length,1); assert.equal(engine.getMetrics().lateTickCount,1);
});

test('multiple symbols and providers remain provider-neutral with identical candle objects', async()=>{
  const {engine,bus}=setup(['1m']); engine.start();
  await bus.publish(createEvent('MarketTickReceived', tick(0,100,1,'BTCUSDT','binance'), {source:'test'}));
  await bus.publish(createEvent('MarketTickReceived', tick(0,100,1,'BTCUSDT','bybit'), {source:'test'}));
  await bus.publish(createEvent('MarketTickReceived', tick(0,200,1,'ETHUSDT','binance'), {source:'test'})); engine.stop();
  assert.equal(engine.current('crypto','BTCUSDT','1m','binance')?.open,100);
  assert.equal(engine.current('crypto','BTCUSDT','1m','bybit')?.sourceMetadata?.provider,'bybit');
  assert.equal(engine.current('crypto','ETHUSDT','1m','binance')?.open,200);
});

test('performance sanity for thousands of mock ticks', async()=>{
  const {engine,bus}=setup(['1m','5m','1h']); engine.start();
  const start=Date.now();
  for(let i=0;i<2000;i++) await bus.publish(createEvent('MarketTickReceived', tick(i%60,100+(i%7),1,`SYM${i%50}`), {source:'perf'}));
  engine.stop();
  assert.ok(Date.now()-start < 5000); assert.ok(engine.getMetrics().candlesOpened > 0);
});
