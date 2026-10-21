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
import {
  appendSizedExecutionPlan,
  approveStrategyPlan,
  createStrategyPlan,
  stableFingerprint,
  STRATEGY_PLAN_SCHEMA_VERSION,
  type SizedExecutionAppendix,
} from '../../supabase/functions/_shared/strategy-plan.js';

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
const cryptoEvaluatorSource = readFileSync('supabase/functions/_shared/crypto-production-evaluators.ts', 'utf8');
function functionHash(name: string): string {
  const source = name.startsWith('evalForex') ? readFileSync('supabase/functions/_shared/forex-legacy-evaluators.ts','utf8') : cryptoEvaluatorSource;
  const start = source.indexOf(`function ${name}`); assert.ok(start >= 0, `${name} exists in active shared evaluator authority`);
  const body = source.indexOf('{', start); let depth = 0; let end = body;
  for (; end < source.length; end++) { if (source[end] === '{') depth++; else if (source[end] === '}' && --depth === 0) { end++; break; } }
  return createHash('sha256').update(source.slice(start, end)).digest('hex');
}
const ROOT_EVALUATOR_BASELINE = {
  // Intentional ranging/range_chop compatibility repair; behavioral guard covered by phaseL/regimeSafety.
  evalMicroScalper: 'e1d505d2c903d9b110ec107eef13cdcc0480f248f978ea64cea34dedd47bd356',
  evalQuickScalp: 'b111879bc1aed3ba2e7d0b029d1e14a2eaedbe5e8fe50c2dadeac8dc4efc7a40',
  evalCompressionBreakout: 'af23c123a433050e22bd6840f5e728356720e4fd0622f173c07eb39d882a810f',
  evalSwingContinuation: '7ba5c9a2e4648ce4c53b0df560474b4a312d11d35c362aceaa219daccd75cf8f',
  evalForexMicroScalper: '0b83aa27dbc2abd1dd78cc0bf5a303091747b4d08d5dc6aff7319dc8b5314328',
  evalForexSwingContinuation: '3a8ed28b615d9d84ac051fdaa3aeb710fef21ada5769b3f25052466d7477c3d0',
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

// Phase 1B golden parity: the certified envelope cannot change evaluator economics.
const allStrategyIdentities = [
  ...ACTIVE.map(([name, id, market]) => [name, id, market, 'ENABLED'] as const),
  ['CryptoTrendPullback', 'crypto.trend-pullback', 'crypto', 'RESEARCH'],
  ['ReversalExhaustion', 'crypto.reversal-exhaustion', 'crypto', 'RESEARCH'],
  ['forex.london-breakout', 'forex.london-breakout', 'forex', 'RESEARCH'],
  ['forex.new-york-continuation', 'forex.new-york-continuation', 'forex', 'RESEARCH'],
  ['forex.trend-pullback', 'forex.trend-pullback', 'forex', 'RESEARCH'],
  ['gold.volatility-breakout', 'gold.volatility-breakout', 'forex', 'RESEARCH'],
] as const;

for (const [name, id, market, lifecycle] of allStrategyIdentities) {
  const raw = legacy('buy');
  const def = definition(name, id, market, raw, { lifecycle, version: lifecycle === 'RESEARCH' ? '0.1.0-research' : '1.0.0', publicationMode: lifecycle === 'RESEARCH' ? 'SHADOW' : 'LIVE', certification: lifecycle === 'RESEARCH' ? 'RESEARCH' : 'PRODUCTION' });
  const plan = createStrategyPlan(def, context(market), raw);
  assert.equal(plan.schema_version, STRATEGY_PLAN_SCHEMA_VERSION);
  assert.equal(plan.identity.strategy_id, id);
  assert.equal(plan.decision.action, 'BUY');
  assert.deepEqual(plan.entry_plan.zone, { low: raw.entry_low, high: raw.entry_high });
  assert.equal(plan.risk_proposal.initial_stop, raw.stop_loss);
  assert.equal(plan.risk_proposal.tp1, raw.tp1);
  assert.equal(plan.risk_proposal.tp2, raw.tp2);
  assert.equal(plan.risk_proposal.proposed_risk_reward, raw.risk_reward);
  assert.equal(plan.diagnostics.confidence, raw.confidence_score);
  assert.equal(plan.diagnostics.grade, raw.grade);
  assert.equal(plan.provenance.candle_boundary.closed_only, true);
  assert.equal(plan.market_context.liquidity.status, 'UNKNOWN');
  assert.equal(plan.market_context.news.status, 'UNKNOWN');
  assert.ok(plan.qualification_ledger.some((gate) => gate.id === 'evaluator_decision' && gate.status === 'PASS'));
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.entry_plan) && Object.isFrozen(plan.evidence.strategy_specific), `${id} plan is deeply immutable`);
}

const acceptedDefinition = definition('MicroScalper', 'crypto.micro-scalper', 'crypto', legacy('buy'));
const acceptedPlan = createStrategyPlan(acceptedDefinition, context(), legacy('buy'));
const repeatPlan = createStrategyPlan(acceptedDefinition, context(), legacy('buy'));
assert.deepEqual(acceptedPlan, repeatPlan, 'same context, config and result produce a deterministic plan');
assert.equal(stableFingerprint({ b: 2, a: 1 }), stableFingerprint({ a: 1, b: 2 }), 'config fingerprint is key-order independent');
assert.throws(() => { (acceptedPlan.entry_plan.zone as { low: number }).low = 1; }, TypeError, 'approved entry cannot mutate');
assert.throws(() => { (acceptedPlan.evidence.strategy_specific as Record<string, unknown>).fixture = false; }, TypeError, 'approved evidence cannot mutate');

const rejectedPlan = createStrategyPlan(acceptedDefinition, context(), legacy('none'));
assert.equal(rejectedPlan.decision.action, 'NO_TRADE');
assert.equal(rejectedPlan.entry_plan.zone, null);
assert.equal(rejectedPlan.risk_proposal.initial_stop, null);
assert.ok(rejectedPlan.qualification_ledger.some((gate) => gate.id === 'evaluator_decision' && gate.status === 'FAIL'));
assert.ok(rejectedPlan.diagnostics.rejection_category);

const appendix: SizedExecutionAppendix = {
  correlation_id: acceptedPlan.provenance.evaluation_id,
  risk_engine: { version: 'design-fixture', decision: 'APPROVED' },
  capital_allocation: { capital_basis: 1000, currency: 'USD' },
  portfolio_exposure: { before: 0, after: 1, unit: 'R' },
  provider: { id: 'fixture', account_id: 'fixture-account', venue: 'fixture-venue' },
  sizing: { position_size: 1, leverage: 1, margin: 100, unit: 'contracts' },
  execution_instructions: { order_type: 'fixture' },
  protection_policy: { version: 'existing-behavior', policy: {} },
  reporting_metadata: { fixture: true },
};
const approved = approveStrategyPlan(acceptedPlan, { approved_at: at, arbitration: { policy_version: 'existing-arbitrator', winner_reason: 'highest existing arbitration score', competing_strategies: [{ strategy_id: 'crypto.quick-scalp', decision: 'LOST', reason: 'lower existing arbitration score' }] } });
assert.strictEqual(approved.strategy_plan, acceptedPlan, 'arbitration appends its explanation without mutating intent');
assert.equal(approved.correlation_id, acceptedPlan.provenance.evaluation_id);
assert.throws(() => approveStrategyPlan(rejectedPlan, { approved_at: at, arbitration: { policy_version: 'fixture', winner_reason: 'invalid', competing_strategies: [] } }), /not_qualifiable/);
const sized = appendSizedExecutionPlan(acceptedPlan, appendix);
assert.strictEqual(sized.strategy_plan, acceptedPlan, 'sizing appends around the exact approved plan');
assert.deepEqual(sized.strategy_plan.entry_plan.zone, { low: 99.9, high: 100.1 });
assert.ok(Object.isFrozen(sized) && Object.isFrozen(sized.sizing), 'sized wrapper is immutable');
assert.throws(() => appendSizedExecutionPlan(acceptedPlan, { ...appendix, correlation_id: 'wrong' }), /correlation_mismatch/);

console.log('professional strategy framework compatibility tests passed');

