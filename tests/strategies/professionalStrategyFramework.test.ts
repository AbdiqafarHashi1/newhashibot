import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ProfessionalStrategyRegistry,
  RESEARCH_STRATEGY_CONFIG,
  StrategyDiagnostics,
  evaluateCryptoTrendPullback,
  evaluateReversalExhaustion,
  toProfessionalResult,
  type LegacyStrategyResult,
  type StrategyDefinition,
  type StrategyEvaluationContext,
} from '../../supabase/functions/_shared/professional-strategies.js';

const ACTIVE = [
  ['MicroScalper', 'crypto.micro-scalper', 'crypto'],
  ['QuickScalp', 'crypto.quick-scalp', 'crypto'],
  ['CompressionBreakout', 'crypto.compression-breakout', 'crypto'],
  ['SwingContinuation', 'crypto.swing-continuation', 'crypto'],
  ['ForexMicroScalper', 'forex.micro-scalper', 'forex'],
  ['ForexSwingContinuation', 'forex.swing-continuation', 'forex'],
] as const;
const at = '2026-07-19T12:00:00.000Z';
const scannerSource = readFileSync('supabase/functions/market-scanner/index.ts', 'utf8');
function functionHash(name: string): string {
  const start = scannerSource.indexOf(`function ${name}`); assert.ok(start >= 0, `${name} exists`);
  const body = scannerSource.indexOf('{', start); let depth = 0; let end = body;
  for (; end < scannerSource.length; end++) { if (scannerSource[end] === '{') depth++; else if (scannerSource[end] === '}' && --depth === 0) { end++; break; } }
  return createHash('sha256').update(scannerSource.slice(start, end)).digest('hex');
}
const ROOT_EVALUATOR_BASELINE = {
  evalMicroScalper: '47493ac46780570d9a3cb268b6910f8a66cb67dbdc73b4181add04d663999774',
  evalQuickScalp: 'b111879bc1aed3ba2e7d0b029d1e14a2eaedbe5e8fe50c2dadeac8dc4efc7a40',
  evalCompressionBreakout: 'af23c123a433050e22bd6840f5e728356720e4fd0622f173c07eb39d882a810f',
  evalSwingContinuation: '7ba5c9a2e4648ce4c53b0df560474b4a312d11d35c362aceaa219daccd75cf8f',
  evalForexMicroScalper: 'fd3594d4a960d5f74c692aa3da9b3992aec5e0374843d3e7ef09838215258e44',
  evalForexSwingContinuation: '3e8933964f856eb3d0f454e176a1f8a5fa478f20a0d36256184b730bfa364786',
};
for (const [name, expected] of Object.entries(ROOT_EVALUATOR_BASELINE)) assert.equal(functionHash(name), expected, `${name} production formula baseline changed`);
const candle = (index: number, close = 100) => ({ symbol: 'BTCUSDT', market_type: 'crypto', timeframe: '15m', open_time: new Date(Date.parse(at) - (60 - index) * 900_000).toISOString(), open: close - .2, high: close + .5, low: close - .5, close, volume: 1000, source: 'fixture' });
const candles = Array.from({ length: 60 }, (_, index) => candle(index, 95 + index * .1));
const indicators = { ema20: 100.8, ema50: 99, atr14: 1, rsi14: 55, recent_high: 101.5, recent_low: 98, avg_volume: 1000, body_size: .2, atr_pct: 1, range_compression_ratio: .7, momentum_score: .5, volatility_state: 'normal', regime: 'trend_up' };
const context = (market: 'crypto' | 'forex' = 'crypto'): StrategyEvaluationContext => ({ symbol: market === 'crypto' ? 'BTCUSDT' : 'EURUSD', market, timeframe: '15m', candles: candles.map((row) => ({ ...row, symbol: market === 'crypto' ? 'BTCUSDT' : 'EURUSD', market_type: market })), indicators, evaluated_at: at });
const legacy = (direction: 'buy' | 'sell' | 'none', status: 'candidate' | 'rejected' = direction === 'none' ? 'rejected' : 'candidate'): LegacyStrategyResult => ({ status, direction, entry_low: 99.9, entry_high: 100.1, stop_loss: direction === 'sell' ? 102 : 98, tp1: direction === 'sell' ? 98 : 102, tp2: direction === 'sell' ? 97 : 103, risk_reward: 1.5, confidence_score: 81, grade: 'A', reason: status === 'candidate' ? 'fixture candidate' : 'momentum failed', rejection_reason: status === 'candidate' ? '' : 'momentum_failed', score_breakdown: { final_score: 81, fixture: true } });

function definition(name: string, id: string, market: 'crypto' | 'forex', result: LegacyStrategyResult, overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return { id, version: '1.0.0', legacyName: name, market, lifecycle: 'ENABLED', config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: name, enabled: true, min_score: 75, min_rr: 1.2, max_bars_in_trade: 8, allowed_timeframes: ['15m'] }, evaluate: () => result, ...overrides };
}

for (const [name, id, market] of ACTIVE) {
  for (const [direction, decision] of [['buy', 'BUY'], ['sell', 'SELL'], ['none', 'NO_TRADE']] as const) {
    const def = definition(name, id, market, legacy(direction));
    const result = toProfessionalResult(def, context(market), def.evaluate(context(market)));
    assert.equal(result.strategy_id, id, `${name} preserves strategy identity`);
    assert.equal(result.strategy_version, '1.0.0');
    assert.equal(result.decision, decision, `${name} preserves ${direction}`);
    assert.equal(result.confidence, 81); assert.equal(result.grade, 'A'); assert.equal(result.risk_reward, 1.5);
    assert.equal(result.stop, direction === 'sell' ? 102 : 98); assert.equal(result.tp1, direction === 'sell' ? 98 : 102); assert.equal(result.tp2, direction === 'sell' ? 97 : 103);
    assert.equal(result.expires_at, '2026-07-19T14:00:00.000Z');
    assert.deepEqual(result.evidence, { final_score: 81, fixture: true });
    assert.deepEqual(result.rejection_reasons, direction === 'none' ? ['momentum_failed'] : []);
    assert.deepEqual(result.legacy, def.evaluate(context(market)), `${name} legacy payload is byte-for-byte structurally preserved`);
  }
}

const filtered = definition('MicroScalper', 'crypto.micro-scalper', 'crypto', legacy('buy'), { config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: 'MicroScalper', enabled: true, allowed_symbols: ['ETHUSDT'], allowed_timeframes: ['5m'] } });
assert.equal(new ProfessionalStrategyRegistry([filtered]).evaluate(context()).length, 0, 'symbol/timeframe config filters are enforced');
const disabled = definition('MicroScalper', 'crypto.micro-scalper', 'crypto', legacy('buy'), { config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: 'MicroScalper', enabled: false }, lifecycle: 'ENABLED' });
assert.equal(new ProfessionalStrategyRegistry([disabled]).evaluate(context()).length, 0, 'disabled existing config remains disabled');

const researchDefinitions: StrategyDefinition[] = [
  { id: 'crypto.trend-pullback', version: '0.1.0-research', legacyName: 'CryptoTrendPullback', market: 'crypto', lifecycle: 'RESEARCH', config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: 'CryptoTrendPullback' }, evaluate: evaluateCryptoTrendPullback },
  { id: 'crypto.reversal-exhaustion', version: '0.1.0-research', legacyName: 'ReversalExhaustion', market: 'crypto', lifecycle: 'RESEARCH', config: { ...RESEARCH_STRATEGY_CONFIG, strategy_name: 'ReversalExhaustion' }, evaluate: evaluateReversalExhaustion },
];
const diagnostics = new StrategyDiagnostics();
const registry = new ProfessionalStrategyRegistry(researchDefinitions, diagnostics);
const first = registry.evaluate(context());
const second = registry.evaluate(context());
assert.deepEqual(first, second, 'research evaluation is deterministic');
assert.ok(first.every((row) => !row.publishable), 'research strategies can never publish');

const malformed = context(); malformed.candles = [...malformed.candles.slice(0, -1), { ...malformed.candles.at(-1)!, high: 1, low: 2 }];
assert.ok(registry.evaluate(malformed).every((row) => row.professional.rejection_reasons.includes('invalid_candles')), 'malformed candles reject');
const stale = context(); stale.evaluated_at = '2026-07-20T12:00:00.000Z';
assert.ok(registry.evaluate(stale).every((row) => row.professional.rejection_reasons.includes('stale_candles')), 'stale candles reject deterministically');
const prefix = context(); const future = { ...candle(61, 10_000), open_time: '2026-07-20T00:00:00.000Z' };
const before = researchDefinitions.map((def) => def.evaluate(prefix));
const afterIgnoringFuture = researchDefinitions.map((def) => def.evaluate({ ...prefix, candles: [...prefix.candles, future].filter((row) => row.open_time <= at) }));
assert.deepEqual(before, afterIgnoringFuture, 'closed-candle boundary prevents lookahead');
assert.throws(() => new ProfessionalStrategyRegistry([researchDefinitions[0], researchDefinitions[0]]), /duplicate_strategy_id/);
assert.equal(diagnostics.snapshot()['crypto.trend-pullback'].published_signals, 0);

console.log('professional strategy framework compatibility tests passed');
