import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateIntradayOpportunity, intradayResearchDefinitions, INTRADAY_IDS } from '../../supabase/functions/_shared/intraday-opportunities.ts';
import { calculateActiveIndicators, createApprovedReplayRegistry } from '../../supabase/functions/_shared/active-validation-runtime.ts';
import { runBoundedValidation } from '../../supabase/functions/_shared/phase-l-validation.ts';
import { arbitrationNoTradeReason, classifyMarketContext } from '../../supabase/functions/_shared/scanner-market-context.ts';
import type { StrategyCandle, StrategyEvaluationContext } from '../../supabase/functions/_shared/professional-strategies.ts';

const base = Date.parse('2025-01-01T00:00:00Z');
const fixtureParameters = { minimumStopBps: 75 };
function context(rows: StrategyCandle[]): StrategyEvaluationContext {
  return { symbol: 'BTCUSDT', market: 'crypto', timeframe: '15m', candles: rows,
    evaluated_at: new Date(base + 110 * 900000).toISOString(), indicators: calculateActiveIndicators(rows) };
}
function fixture(id: typeof INTRADAY_IDS[number]) {
  const failures: Record<string, number> = {};
  for (let phase = 0; phase < 120; phase++) {
    const rows: StrategyCandle[] = Array.from({ length: 110 }, (_, i) => {
      const close = 1000 + (id === INTRADAY_IDS[0] ? i * .15 : 0) + Math.sin(i * (id === INTRADAY_IDS[0] ? .25 : .4) + phase * .1) * (id === INTRADAY_IDS[0] ? 10 : 20);
      return { symbol: 'BTCUSDT', market_type: 'crypto', timeframe: '15m', source: 'SYNTHETIC_TEST_ONLY',
        open_time: new Date(base + i * 900000).toISOString(), open: close - .2, close, high: close + .8, low: close - .8, volume: 100 };
    });
    const before = rows.slice(-25, -1), low = Math.min(...before.map(r => r.low)), high = Math.max(...before.map(r => r.high));
    if (id === INTRADAY_IDS[1]) {
      for (const side of [1, -1]) {
        const copy = structuredClone(rows), last = copy[109];
        const level = side === 1 ? low : high;
        last.close = level + side * 2; last.open = last.close - side * .5;
        last.low = Math.min(last.open, last.close, side === 1 ? level - 1 : last.close) - .1;
        last.high = Math.max(last.open, last.close, side === -1 ? level + 1 : last.close) + .1;
        last.volume = 150;
        const c = context(copy);
        const evaluated = evaluateIntradayOpportunity(id, c, fixtureParameters);
        if (evaluated.status === 'candidate') return c;
        failures[evaluated.rejection_reason] = (failures[evaluated.rejection_reason] ?? 0) + 1;
      }
    } else {
      const vwap = before.reduce((n, r) => n + (r.high + r.low + r.close) / 3, 0) / before.length;
      Object.assign(rows[108], { open: vwap - .2, close: vwap - .2, low: vwap - .8, high: vwap + .1 });
      Object.assign(rows[109], { open: vwap - .2, close: vwap + 1, low: vwap - .4, high: vwap + 1.2 });
      const c = context(rows);
      if (evaluateIntradayOpportunity(id, c, fixtureParameters).status === 'candidate') return c;
    }
  }
  throw Error(`SYNTHETIC_CANDIDATE_NOT_FOUND:${id}:${JSON.stringify(failures)}`);
}
for (const id of INTRADAY_IDS) {
  const c = fixture(id), result = evaluateIntradayOpportunity(id, c, fixtureParameters);
  assert.equal(result.status, 'candidate');
  assert.equal(result.score_breakdown.score_is_probability, false);
  assert.equal(result.score_breakdown.order_flow_observed, false);
  assert(result.risk_reward >= 1.5);
  const registry = createApprovedReplayRegistry({ version: 'TEST_ONLY', minSignalGrade: 'A', strategies: [{ id,
    version: '1.0.0', enabled: true, minScore: 75, minRiskReward: 1.5, maxBarsInTrade: 48,
    symbols: ['BTCUSDT'], timeframes: ['15m'], parameters: fixtureParameters }] }, 'BTCUSDT', '15m');
  assert.deepEqual(registry.evaluate(c)[0].professional.legacy, result);
  const [decision] = runBoundedValidation({ runId: 'TEST_ONLY', mode: 'REPLAY', dataset: { id: 'fixture',
    source: 'SYNTHETIC_TEST_ONLY', provenance: 'NOT_MARKET_EVIDENCE', sha256: 'test', timezone: 'UTC' },
    configurationVersion: 'TEST_ONLY', parameterVersion: '1', symbol: c.symbol, market: 'crypto', timeframe: '15m',
    start: c.evaluated_at, end: c.evaluated_at, maxCycles: 1, minimumScore: 0, allowedGrades: ['A'], minSignalGrade: 'A' }, registry, [c]);
  assert.equal(decision.arbitration.winner?.strategyId, id, JSON.stringify(decision));
  assert.equal(decision.arbitration.winner?.stop, result.stop_loss);
  const market = classifyMarketContext(c.indicators, c.candles);
  const entry = { name: id, result, cfg: registry.list()[0].config, guard: { sl_pct: 0, tp1_pct: 0, tp2_pct: 0 } };
  assert.equal(arbitrationNoTradeReason(market, [entry]), '');
  assert.equal(arbitrationNoTradeReason(market, [{ ...entry, result: { ...result,
    score_breakdown: { ...result.score_breakdown, intraday_policy_version: 'forged' } } }]), 'INTRADAY_POLICY_MISMATCH');
  assert.equal(arbitrationNoTradeReason(market, [{ ...entry, result: { ...result,
    score_breakdown: { ...result.score_breakdown, estimated_cost_r: NaN } } }]), 'INTRADAY_POLICY_MISMATCH');
  assert.equal(arbitrationNoTradeReason({ ...market, mixed_market: true, preferred_strategy: 'none', chop_level: 0 },
    [{ ...entry, name: 'MicroScalper' }]), 'mixed_market_no_clear_strategy_requires_a_plus');
  for (const bad of [
    { ...c, evaluated_at: new Date(base + 109 * 900000).toISOString() },
    { ...c, evaluated_at: new Date(base + 111 * 900000).toISOString() },
    { ...c, candles: c.candles.map((r, i) => i === 30 ? { ...r, open_time: 'invalid' } : r) },
    { ...c, candles: c.candles.map((r, i) => i === 30 ? { ...r, open_time: c.candles[29].open_time } : r) },
    { ...c, candles: c.candles.map((r, i) => i === 30 ? { ...r, low: NaN } : r) },
    { ...c, candles: c.candles.map((r, i) => i === 109 ? { ...r, high: r.high + 100 } : r) },
    { ...c, candles: c.candles.map(r => ({ ...r, volume: 0 })) },
  ]) assert.equal(evaluateIntradayOpportunity(id, bad).status, 'rejected');
  assert.equal(evaluateIntradayOpportunity(id, c, { unknown: 1 }).rejection_reason, 'INVALID_PARAMETERS');
  assert.equal(evaluateIntradayOpportunity(id, c, { stopAtr: NaN }).rejection_reason, 'INVALID_PARAMETERS');
  assert.equal(evaluateIntradayOpportunity(id, c, { estimatedCostBps: 1000 }).rejection_reason, 'COST_OR_STOP_INFEASIBLE');
}
assert(intradayResearchDefinitions().every(d => !d.config.enabled && d.lifecycle === 'DISABLED' &&
  d.publicationMode === 'SHADOW' && d.certification === 'RESEARCH'));
assert.match(readFileSync('supabase/functions/market-scanner/index.ts', 'utf8'), /\.\.\.intradayResearchDefinitions\(\)/);
const protocol = JSON.parse(readFileSync('scripts/research/intraday15/protocol.json', 'utf8'));
assert.equal(protocol.trialCount, protocol.hypotheses.length * protocol.variants.length);
assert.equal(protocol.execution, false); assert.equal(protocol.publication, false);
console.log('15m setup candidates, registry/arbitration parity, invalid/future/stale/gapped data, costs and disabled publication tests passed');
