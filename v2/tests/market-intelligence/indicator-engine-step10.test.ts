import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventBus, createEvent } from '../../packages/events/index.js';
import { InMemoryCandleCache, InMemoryIndicatorCache, candleCacheKey } from '../../packages/runtime-cache/index.js';
import { IndicatorEngine, classifySession, marketFeatures, structure, wma, hma, roc, momentum, keltner, volumeIndicators } from '../../packages/indicator-engine/index.js';
import type { Candle } from '../../packages/types/index.js';

function candles(symbol='BTCUSDT', provider='binance', timeframe:Candle['timeframe']='1m', count=80): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const open = 100 + i * 0.5 + Math.sin(i / 3), close = open + (i % 7 === 0 ? -0.4 : 0.6);
    return { market:'crypto', symbol, timeframe, openTime:new Date(Date.UTC(2026,0,1,0,i)).toISOString(), closeTime:new Date(Date.UTC(2026,0,1,0,i+1)).toISOString(), open, high:Math.max(open, close) + 1, low:Math.min(open, close) - 1, close, volume:100 + (i % 10) * 20, source:provider, provider, isClosed:true };
  });
}

test('step 10 indicator engine publishes canonical indicators, features, warmup, and deduplicates candles', async () => {
  const bus = new InMemoryEventBus(50), candleCache = new InMemoryCandleCache(), indicatorCache = new InMemoryIndicatorCache();
  const key = candleCacheKey('crypto','BTCUSDT','1m'), rows = candles();
  candleCache.set(key, rows);
  const engine = new IndicatorEngine(bus, candleCache, indicatorCache); engine.start();
  await bus.publish(createEvent('CandleClosed', rows.at(-1)!, { source:'test' }));
  await bus.publish(createEvent('CandleClosed', rows.at(-1)!, { source:'test' }));
  const snapshot = engine.getLatest('crypto','BTCUSDT','1m')!;
  assert.equal(bus.history('IndicatorsUpdated').length, 1);
  assert.equal(bus.history('MarketFeaturesUpdated' as never).length, 1);
  assert.equal(bus.history('IndicatorWarmupCompleted' as never).length, 1);
  assert.ok(snapshot.wma[0].value); assert.ok(snapshot.hma[0].value); assert.ok(snapshot.roc.value); assert.ok(snapshot.momentum.value);
  assert.ok(snapshot.keltnerChannels.upper); assert.ok(snapshot.volume.relativeVolume); assert.ok(snapshot.structure.pivotZones.length >= 0);
  assert.match(snapshot.marketFeatures.marketRegime, /trend|volatility|compression|expansion|range|unknown/);
  assert.equal(engine.getMetrics().indicatorCalculations, 1);
});

test('step 10 helpers cover structure, sessions, volume, keltner, and deterministic feature outputs', () => {
  const rows = candles('ETHUSDT','bybit','5m',90);
  assert.ok(wma(rows.map(c=>c.close), 20)); assert.ok(hma(rows.map(c=>c.close), 20));
  assert.ok(roc(rows.map(c=>c.close))); assert.ok(momentum(rows.map(c=>c.close)));
  assert.ok(keltner(rows).middle); assert.ok(volumeIndicators(rows).obv !== null);
  assert.ok(structure(rows).swingHighs.length >= 0);
  assert.equal(classifySession('2026-01-03T12:00:00.000Z','forex'), 'weekend');
  assert.deepEqual(marketFeatures(rows), marketFeatures(rows));
});
