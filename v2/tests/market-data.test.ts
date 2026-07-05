import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventBus } from '../packages/events/index.js';
import { MockProvider, ProviderManager, SymbolRegistry, normalizeMessage } from '../packages/market-data/index.js';

const symbol = { symbol:'BTCUSDT', provider:'binance', exchangeSymbol:'btcusdt', market:'crypto' as const, marketType:'perpetual' as const, base:'BTC', quote:'USDT', precision:{price:2, quantity:3}, tickSize:0.01, lotSize:0.001, status:'online' as const, tradingEnabled:true, aliases:['BTC/USDT'] };

test('provider normalization maps raw exchange messages to provider-neutral envelopes', () => {
  const registry = new SymbolRegistry(); registry.register(symbol);
  const envelope = normalizeMessage({ type:'tick', provider:'binance', exchangeSymbol:'btcusdt', sourceTimestamp:'2026-01-01T00:00:00.000Z', receivedAt:'2026-01-01T00:00:00.010Z', payload:{ price:'100', volume:'2', bid:'99', ask:'101' } }, registry);
  assert.equal(envelope.symbol, 'BTCUSDT');
  assert.equal(envelope.latencyMs, 10);
  assert.equal((envelope.data as { price:number }).price, 100);
});

test('symbol registry resolves aliases, precision, trading availability, and provider symbols', () => {
  const registry = new SymbolRegistry(); registry.register(symbol);
  assert.equal(registry.resolve('binance','BTC/USDT')?.tickSize, 0.01);
  assert.equal(registry.isTradable('BTCUSDT'), true);
  assert.equal(registry.supportedSymbols('binance').length, 1);
});

test('subscription manager reference counts and prevents duplicate websocket streams', async () => {
  const registry = new SymbolRegistry(); registry.register(symbol);
  const manager = new ProviderManager(new InMemoryEventBus(), registry);
  const provider = new MockProvider('binance'); manager.register(provider); await manager.connect('binance');
  const req = { provider:'binance', symbol:'BTCUSDT', type:'tick' as const };
  assert.equal(await manager.subscribe(req), true);
  assert.equal(await manager.subscribe(req), false);
  assert.equal(provider.subscriptionCount(), 1);
  assert.equal(manager.subscriptions.refCount(req), 2);
  assert.equal(await manager.unsubscribe(req), false);
  assert.equal(provider.subscriptionCount(), 1);
  assert.equal(await manager.unsubscribe(req), true);
  assert.equal(provider.subscriptionCount(), 0);
});

test('feed manager updates runtime cache and publishes market data events', async () => {
  const bus = new InMemoryEventBus(); const registry = new SymbolRegistry(); registry.register(symbol);
  const manager = new ProviderManager(bus, registry); const provider = new MockProvider('binance'); manager.register(provider); await manager.connect('binance');
  let legacyTicks = 0; let neutralTicks = 0;
  bus.subscribe('MarketTickReceived', () => { legacyTicks++; });
  bus.subscribe('TickReceived', () => { neutralTicks++; });
  provider.emit({ type:'tick', provider:'binance', exchangeSymbol:'btcusdt', sourceTimestamp:'2026-01-01T00:00:00.000Z', receivedAt:'2026-01-01T00:00:00.005Z', payload:{ price:101, volume:3 }});
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(legacyTicks, 1);
  assert.equal(neutralTicks, 1);
  assert.equal(manager.cache.ticks.get('binance:BTCUSDT')?.data.price, 101);
});

test('heartbeat, health, latency metrics, failure handling, reconnect, and resubscribe recover connection', async () => {
  const bus = new InMemoryEventBus(); const registry = new SymbolRegistry(); registry.register(symbol);
  const manager = new ProviderManager(bus, registry); const provider = new MockProvider('binance'); manager.register(provider); await manager.connect('binance');
  await manager.subscribe({ provider:'binance', symbol:'BTCUSDT', type:'tick' });
  provider.heartbeat(new Date('2026-01-01T00:00:01.000Z'));
  provider.emit({ type:'trade', provider:'binance', exchangeSymbol:'btcusdt', sourceTimestamp:'2026-01-01T00:00:00.000Z', receivedAt:'2026-01-01T00:00:00.020Z', payload:{ tradeId:'t1', price:100, quantity:1, side:'buy' }});
  provider.fail();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(provider.subscriptionCount(), 1);
  assert.equal(manager.health('binance').state, 'connected');
  assert.equal(manager.statistics('binance').averageLatencyMs, 20);
  assert.equal(bus.history('ConnectionRecovered').length, 1);
  assert.equal(manager.cache.connectionStates.get('binance')?.provider, 'binance');
});

test('multiple providers share the abstraction without leaking exchange-specific consumers', async () => {
  const registry = new SymbolRegistry(); registry.register(symbol); registry.register({ ...symbol, provider:'bybit', exchangeSymbol:'BTCUSDT' });
  const manager = new ProviderManager(new InMemoryEventBus(), registry);
  const binance = new MockProvider('binance'); const bybit = new MockProvider('bybit'); manager.register(binance); manager.register(bybit);
  await manager.connect('binance'); await manager.connect('bybit');
  await manager.subscribe({ provider:'binance', symbol:'BTCUSDT', type:'orderbook' });
  await manager.subscribe({ provider:'bybit', symbol:'BTCUSDT', type:'orderbook' });
  assert.equal(binance.subscriptionCount(), 1);
  assert.equal(bybit.subscriptionCount(), 1);
});
