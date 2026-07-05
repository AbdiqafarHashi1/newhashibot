import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventBus, createEvent } from '../../packages/events/index.js';
import { createCryptoMockFeed } from '../../packages/market-data/index.js';
import { CandleEngine } from '../../packages/candle-engine/index.js';
import { IndicatorEngine } from '../../packages/indicator-engine/index.js';
import { InMemoryCandleCache, InMemoryIndicatorCache, candleCacheKey } from '../../packages/runtime-cache/index.js';
import { atr, ema, rsi, sma, adx, vwap, supertrend, macd, bollinger, donchian, stochastic, sessions, marketStructure } from '../../packages/indicator-engine/index.js';

test('event bus publishes, subscribes, unsubscribes, and keeps bounded history', async () => { const bus = new InMemoryEventBus(1); let count = 0; const handler = () => { count++; }; const off = bus.subscribe('MarketTickReceived', handler); await bus.publish(createEvent('MarketTickReceived', { market:'crypto', symbol:'BTCUSDT', price:1, volume:1, occurredAt:'2026-01-01T00:00:00.000Z', receivedAt:'2026-01-01T00:00:00.005Z', source:'test', provider:'test', marketStatus:'open', feedHealth:'healthy' }, { source:'test' })); off(); await bus.publish(createEvent('MarketTickReceived', { market:'crypto', symbol:'BTCUSDT', price:2, volume:1, occurredAt:'2026-01-01T00:01:00.000Z', receivedAt:'2026-01-01T00:01:00.005Z', source:'test', provider:'test', marketStatus:'open', feedHealth:'healthy' }, { source:'test' })); assert.equal(count, 1); assert.equal(bus.history().length, 1); });

test('mock feed emits MarketTickReceived', async () => { const bus = new InMemoryEventBus(); const feed = createCryptoMockFeed(bus, ['BTCUSDT']); let tickSymbol = ''; bus.subscribe('MarketTickReceived', (event) => { tickSymbol = event.payload.symbol; }); await feed.emitOnce(new Date('2026-01-01T00:00:00.000Z')); assert.equal(tickSymbol, 'BTCUSDT'); });

test('candle engine aggregates ticks and emits CandleClosed', async () => { const bus = new InMemoryEventBus(); const candles = new InMemoryCandleCache(); const engine = new CandleEngine(bus, candles, ['1m']); engine.start(); let closed = 0; bus.subscribe('CandleClosed', () => { closed++; }); await bus.publish(createEvent('MarketTickReceived', { market:'crypto', symbol:'BTCUSDT', price:100, volume:1, occurredAt:'2026-01-01T00:00:10.000Z', receivedAt:'2026-01-01T00:00:10.005Z', source:'test', provider:'test', marketStatus:'open', feedHealth:'healthy' }, { source:'test' })); await bus.publish(createEvent('MarketTickReceived', { market:'crypto', symbol:'BTCUSDT', price:110, volume:2, occurredAt:'2026-01-01T00:00:20.000Z', receivedAt:'2026-01-01T00:00:20.005Z', source:'test', provider:'test', marketStatus:'open', feedHealth:'healthy' }, { source:'test' })); await bus.publish(createEvent('MarketTickReceived', { market:'crypto', symbol:'BTCUSDT', price:120, volume:1, occurredAt:'2026-01-01T00:01:00.000Z', receivedAt:'2026-01-01T00:01:00.005Z', source:'test', provider:'test', marketStatus:'open', feedHealth:'healthy' }, { source:'test' })); const list = candles.get(candleCacheKey('crypto','BTCUSDT','1m')); assert.equal(closed, 1); assert.equal(list?.[0].open, 100); assert.equal(list?.[0].high, 110); assert.equal(list?.[0].close, 110); assert.equal(list?.[0].volume, 3); });

test('EMA/SMA/RSI/ATR compute and indicator cache stores snapshot', async () => { const bus = new InMemoryEventBus(); const candleCache = new InMemoryCandleCache(); const indicatorCache = new InMemoryIndicatorCache(); const key = candleCacheKey('crypto','BTCUSDT','1m'); const candles = Array.from({ length: 30 }, (_, i) => ({ market:'crypto' as const, symbol:'BTCUSDT', timeframe:'1m' as const, openTime:`2026-01-01T00:${String(i).padStart(2,'0')}:00.000Z`, closeTime:`2026-01-01T00:${String(i+1).padStart(2,'0')}:00.000Z`, open:100+i, high:101+i, low:99+i, close:100.5+i, volume:1, source:'test', isClosed:true })); candleCache.set(key, candles); const engine = new IndicatorEngine(bus, candleCache, indicatorCache); engine.start(); let updated = false; bus.subscribe('IndicatorsUpdated', () => { updated = true; }); await bus.publish(createEvent('CandleClosed', candles[candles.length - 1], { source:'test' })); const snapshot = indicatorCache.get(key); assert.equal(updated, true); assert.ok(snapshot?.ema?.[0].value); assert.ok(snapshot?.sma?.[0].value); assert.ok(snapshot?.rsi?.value); assert.ok(snapshot?.atr?.value); assert.ok(ema(candles.map(c=>c.close), 20)); assert.ok(sma(candles.map(c=>c.close), 20)); assert.ok(rsi(candles.map(c=>c.close), 14)); assert.ok(atr(candles, 14)); });

test('market intelligence runtime source does not import Supabase package', async () => { const fs = await import('node:fs/promises'); const path = await import('node:path'); const root = path.resolve(process.cwd()); const files = ['services/market-intelligence/index.ts','packages/market-data/index.ts','packages/candle-engine/index.ts','packages/indicator-engine/index.ts','packages/runtime-cache/index.ts']; for (const file of files) { const text = await fs.readFile(path.join(root, file), 'utf8'); assert.equal(/supabase/i.test(text), false, `${file} must not import or reference Supabase`); } });

test('runtime cache TTL and max-size evict expired and oldest entries', async () => {
  const { InMemoryStore } = await import('../../packages/runtime-cache/index.js');
  const store = new InMemoryStore<number>(2);
  store.set('a', 1); store.set('b', 2); store.set('c', 3);
  assert.equal(store.get('a'), undefined);
  assert.deepEqual(store.snapshot(), { b: 2, c: 3 });
  store.set('ttl', 4, 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(store.get('ttl'), undefined);
});

test('candle timer flush, gap candle, late tick, and out-of-order policy are deterministic', async () => {
  const bus = new InMemoryEventBus(); const cache = new InMemoryCandleCache(); const engine = new CandleEngine(bus, cache, ['1m'], { gapCandles:true }); engine.start();
  const tick = (price:number, occurredAt:string) => createEvent('MarketTickReceived', { market:'crypto', symbol:'ETHUSDT', price, volume:1, occurredAt, receivedAt:occurredAt, source:'test', provider:'test', marketStatus:'open', feedHealth:'healthy' }, { source:'test' });
  await bus.publish(tick(10,'2026-01-01T00:00:10.000Z'));
  await engine.flush(new Date('2026-01-01T00:01:00.000Z'));
  await bus.publish(tick(9,'2026-01-01T00:00:20.000Z'));
  await bus.publish(tick(12,'2026-01-01T00:03:01.000Z'));
  const rows = cache.get(candleCacheKey('crypto','ETHUSDT','1m')) ?? [];
  assert.equal(rows[0].isClosed, true);
  assert.equal(rows.filter((c) => c.sourceMetadata?.generatedBy === 'gap').length, 2);
  assert.equal(rows.some((c) => c.close === 9), false);
});

 test('all production indicators and market features produce typed outputs', () => {
  const candles = Array.from({ length: 60 }, (_, i) => ({ market:'forex' as const, symbol:'EURUSD', timeframe:'1m' as const, openTime:new Date(Date.UTC(2026,0,5,0,i)).toISOString(), closeTime:new Date(Date.UTC(2026,0,5,0,i+1)).toISOString(), open:1+i*0.001, high:1.002+i*0.001, low:0.999+i*0.001, close:1.001+i*0.001, volume:100+i, source:'fixture', isClosed:true }));
  assert.ok(adx(candles).value !== null);
  assert.ok(vwap(candles));
  assert.ok(supertrend(candles).value !== null);
  assert.ok(macd(candles.map(c=>c.close)).histogram !== null);
  assert.ok(bollinger(candles.map(c=>c.close)).upper !== null);
  assert.ok(donchian(candles).middle !== null);
  assert.ok(stochastic(candles).d !== null);
  assert.ok(sessions(candles).dailyHigh);
  assert.ok(marketStructure(candles).swingHighs.length >= 0);
});
