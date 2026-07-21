import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOREX_INSTRUMENTS, buildForexMarketContext, forexSession, normalizeForexInstrument, pipsToPrice, priceToPips } from '../../supabase/functions/_shared/forex-domain.js';
import { FOREX_RESEARCH_STRATEGIES, ForexLondonBreakout, ForexNewYorkContinuation, ForexTrendPullback, GoldVolatilityBreakout } from '../../supabase/functions/_shared/forex-research-strategies.js';
import { ProfessionalStrategyRegistry, RESEARCH_STRATEGY_CONFIG, type StrategyDefinition, type StrategyEvaluationContext } from '../../supabase/functions/_shared/professional-strategies.js';

assert.equal(normalizeForexInstrument('EUR/USD'), 'EURUSD');
assert.equal(normalizeForexInstrument('eurusd.a'), 'EURUSD');
assert.equal(normalizeForexInstrument('GOLD'), 'XAUUSD');
assert.equal(normalizeForexInstrument('XAU/USD'), 'XAUUSD');
assert.equal(normalizeForexInstrument('BTCUSDT'), null);
assert.equal(FOREX_INSTRUMENTS.USDJPY.pipSize, .01);
assert.equal(FOREX_INSTRUMENTS.USDJPY.pricePrecision, 3);
assert.equal(FOREX_INSTRUMENTS.XAUUSD.assetClass, 'gold');
assert.equal(FOREX_INSTRUMENTS.XAUUSD.pipSize, .1);
assert.equal(FOREX_INSTRUMENTS.XAUUSD.pricePrecision, 2);
assert.equal(priceToPips('EURUSD', pipsToPrice('EURUSD', 12)), 12);
assert.deepEqual(['EURUSD', 'GBPUSD', 'USDJPY'].map((id) => FOREX_INSTRUMENTS[id as 'EURUSD'].productionEnabled), [true, true, true]);
assert.deepEqual(['AUDUSD', 'USDCAD', 'XAUUSD'].map((id) => FOREX_INSTRUMENTS[id as 'AUDUSD'].productionEnabled), [false, false, false]);

assert.equal(forexSession('2026-01-15T08:30:00.000Z'), 'LONDON');
assert.equal(forexSession('2026-07-15T07:30:00.000Z'), 'LONDON', 'London DST moves the UTC boundary');
assert.equal(forexSession('2026-01-15T13:30:00.000Z'), 'LONDON_NEW_YORK_OVERLAP');
assert.equal(forexSession('2026-07-15T12:30:00.000Z'), 'LONDON_NEW_YORK_OVERLAP', 'NY/London overlap follows DST');
assert.equal(forexSession('2026-07-18T12:30:00.000Z'), 'CLOSED', 'weekends are closed');

const timeframe = '15m';
const evaluatedAt = '2026-01-15T09:00:00.000Z';
function candles(symbol: string, direction: 'up' | 'down' | 'flat', finalBreakout = false, price = symbol === 'XAUUSD' ? 2000 : 1.1) {
  return Array.from({ length: 60 }, (_, index) => {
    const slope = direction === 'up' ? index * (symbol === 'XAUUSD' ? .04 : .00002) : direction === 'down' ? -index * (symbol === 'XAUUSD' ? .04 : .00002) : 0;
    const base = price + slope, isLast = index === 59, jump = isLast && finalBreakout ? (direction === 'down' ? -(symbol === 'XAUUSD' ? 4 : .0007) : symbol === 'XAUUSD' ? 4 : .0007) : 0;
    const close = base + jump, open = isLast && finalBreakout ? base : close - (direction === 'down' ? -.00008 : .00008) * (symbol === 'XAUUSD' ? 1000 : 1);
    const padding = symbol === 'XAUUSD' ? 1 : .00025;
    return { symbol, market_type: 'forex', timeframe, open_time: new Date(Date.parse(evaluatedAt) - (60 - index) * 900_000).toISOString(), open, high: Math.max(open, close) + padding, low: Math.min(open, close) - padding, close, volume: 1000, source: 'fixture' };
  });
}
function input(symbol: string, rows: ReturnType<typeof candles>, overrides: Partial<StrategyEvaluationContext['indicators']> = {}, at = evaluatedAt): StrategyEvaluationContext {
  const last = rows.at(-1)!.close, up = overrides.regime !== 'trend_down';
  return { symbol, market: 'forex', timeframe, candles: rows, evaluated_at: at, indicators: { ema20: last + (up ? -.0002 : .0002) * (symbol === 'XAUUSD' ? 1000 : 1), ema50: last + (up ? -.0006 : .0006) * (symbol === 'XAUUSD' ? 1000 : 1), atr14: symbol === 'XAUUSD' ? 3 : .001, rsi14: up ? 56 : 44, recent_high: Math.max(...rows.slice(-20).map((c) => c.high)), recent_low: Math.min(...rows.slice(-20).map((c) => c.low)), avg_volume: 1000, body_size: Math.abs(rows.at(-1)!.close - rows.at(-1)!.open), atr_pct: .1, range_compression_ratio: .7, momentum_score: up ? .5 : -.5, volatility_state: 'normal', regime: up ? 'trend_up' : 'trend_down', ...overrides } };
}

function assertCandidate(strategy: typeof FOREX_RESEARCH_STRATEGIES[number], value: StrategyEvaluationContext, decision: 'buy' | 'sell') {
  const first = strategy.evaluate(value), second = strategy.evaluate(value);
  assert.deepEqual(first, second, `${strategy.id} repeats deterministically`);
  assert.equal(first.status, 'candidate', `${strategy.id} produces ${decision}: ${first.rejection_reason}`);
  assert.equal(first.direction, decision); assert.ok(first.stop_loss > 0); assert.ok(first.tp1 > 0); assert.ok(first.tp2 > 0); assert.ok(first.risk_reward >= 1.45);
  assert.equal(first.score_breakdown.strategy_id, strategy.id); assert.equal(first.score_breakdown.strategy_version, '0.1.0-research'); assert.equal(first.score_breakdown.research_only, true);
}

const londonBuy = input('EURUSD', candles('EURUSD', 'up', true));
const londonSellRows = candles('EURUSD', 'down', true); const londonSell = input('EURUSD', londonSellRows, { regime: 'trend_down' });
assertCandidate(ForexLondonBreakout, londonBuy, 'buy');
assertCandidate(ForexLondonBreakout, londonSell, 'sell');
assert.equal(ForexLondonBreakout.evaluate(input('EURUSD', candles('EURUSD', 'flat'))).status, 'rejected');

const nyAt = '2026-01-15T14:30:00.000Z';
const nyBuyRows = candles('EURUSD', 'up'); nyBuyRows.forEach((row, index) => { row.open_time = new Date(Date.parse(nyAt) - (60 - index) * 900_000).toISOString(); });
const nySellRows = candles('EURUSD', 'down'); nySellRows.forEach((row, index) => { row.open_time = new Date(Date.parse(nyAt) - (60 - index) * 900_000).toISOString(); });
assertCandidate(ForexNewYorkContinuation, input('EURUSD', nyBuyRows, {}, nyAt), 'buy');
assertCandidate(ForexNewYorkContinuation, input('EURUSD', nySellRows, { regime: 'trend_down' }, nyAt), 'sell');
assert.equal(ForexNewYorkContinuation.evaluate(input('EURUSD', nyBuyRows, {}, '2026-01-15T22:00:00.000Z')).status, 'rejected');

const pullbackBuyRows = candles('GBPUSD', 'up'); const pullbackBuy = input('GBPUSD', pullbackBuyRows); pullbackBuy.indicators.ema20 = pullbackBuyRows.at(-1)!.close - .0001;
const pullbackSellRows = candles('GBPUSD', 'down'); const pullbackSell = input('GBPUSD', pullbackSellRows, { regime: 'trend_down' }); pullbackSell.indicators.ema20 = pullbackSellRows.at(-1)!.close + .0001;
assertCandidate(ForexTrendPullback, pullbackBuy, 'buy');
assertCandidate(ForexTrendPullback, pullbackSell, 'sell');
const flatPullback = input('GBPUSD', candles('GBPUSD', 'flat'), { ema20: 1.1, ema50: 1.1, rsi14: 50, regime: 'ranging' });
assert.equal(ForexTrendPullback.evaluate(flatPullback).rejection_reason, 'trend_not_established');

const goldBuy = input('XAUUSD', candles('XAUUSD', 'up', true));
const goldSell = input('XAUUSD', candles('XAUUSD', 'down', true), { regime: 'trend_down' });
assertCandidate(GoldVolatilityBreakout, goldBuy, 'buy');
assertCandidate(GoldVolatilityBreakout, goldSell, 'sell');
assert.equal(GoldVolatilityBreakout.evaluate(input('EURUSD', candles('EURUSD', 'up', true))).rejection_reason, 'unsupported_symbol');

for (const strategy of FOREX_RESEARCH_STRATEGIES) {
  const malformed = input(strategy === GoldVolatilityBreakout ? 'XAUUSD' : 'EURUSD', candles(strategy === GoldVolatilityBreakout ? 'XAUUSD' : 'EURUSD', 'up'));
  malformed.candles = [...malformed.candles.slice(0, -1), { ...malformed.candles.at(-1)!, high: 1, low: 2 }];
  assert.equal(strategy.evaluate(malformed).rejection_reason, 'malformed_candles', `${strategy.id} rejects malformed data`);
  const stale = { ...malformed, candles: malformed.candles.slice(0, -1), evaluated_at: '2026-01-16T09:00:00.000Z' };
  assert.equal(strategy.evaluate(stale).rejection_reason, 'stale_candles', `${strategy.id} rejects stale data`);
  const definition: StrategyDefinition = { id: strategy.id, version: strategy.version, legacyName: strategy.id, market: 'forex', lifecycle: 'RESEARCH', publicationMode: 'SHADOW', certification: 'RESEARCH', config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: strategy.id, allowed_symbols: [...strategy.symbols], allowed_timeframes: [...strategy.timeframes] }, evaluate: (ctx) => strategy.evaluate(ctx) };
  const registry = new ProfessionalStrategyRegistry([definition]);
  const eligibleInput = strategy === GoldVolatilityBreakout ? goldBuy : strategy === ForexNewYorkContinuation ? input('EURUSD', nyBuyRows, {}, nyAt) : strategy === ForexTrendPullback ? pullbackBuy : londonBuy;
  assert.ok(registry.evaluate(eligibleInput).every((row) => !row.publishable), `${strategy.id} is publication blocked`);
}
assert.equal(new Set(FOREX_RESEARCH_STRATEGIES.map((strategy) => strategy.id)).size, 4, 'research identities are unique');

const future = { ...londonBuy.candles.at(-1)!, open_time: '2026-01-15T10:00:00.000Z', close: 9, high: 10 };
assert.deepEqual(ForexLondonBreakout.evaluate(londonBuy), ForexLondonBreakout.evaluate({ ...londonBuy, candles: [...londonBuy.candles, future] }), 'future candles are ignored by the context builder');
const market = buildForexMarketContext({ symbol: 'XAUUSD', timeframe, candles: goldBuy.candles, indicators: goldBuy.indicators, evaluatedAt });
assert.equal(market?.instrument.assetClass, 'gold'); assert.equal(market?.currentClosedCandle?.open_time, goldBuy.candles.at(-1)?.open_time);
assert.equal(market?.sessionMetadata.londonOpenAt, '2026-01-15T08:00:00.000Z');
assert.equal(market?.sessionMetadata.newYorkOpenAt, '2026-01-15T13:00:00.000Z');

const scanner = readFileSync('supabase/functions/market-scanner/index.ts', 'utf8');
assert.match(scanner, /if \(!evaluation\.publishable\) continue;[\s\S]*allEvals\.push/);
for (const strategy of FOREX_RESEARCH_STRATEGIES) assert.doesNotMatch(scanner, new RegExp(`allEvals\\.push\\([^)]*${strategy.id.replace(/[.]/g, '\\.')}`), `${strategy.id} never enters publishable allEvals directly`);
assert.match(scanner, /FOREX_RESEARCH_STRATEGIES/);

console.log('Phase 2 Forex recovery tests passed');
