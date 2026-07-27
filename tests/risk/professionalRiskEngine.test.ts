import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { StrategyDefinition, StrategyEvaluationContext } from '../../supabase/functions/_shared/professional-strategies.js';
import { approveStrategyPlan, createStrategyPlan, deepFreeze, type ApprovedStrategyPlan } from '../../supabase/functions/_shared/strategy-plan.js';
import {
  evaluateRisk,
  resolveRiskPolicy,
  RISK_CONTEXT_SCHEMA_VERSION,
  RISK_POLICY_SCHEMA_VERSION,
  PROP_POLICY_SCHEMA_VERSION,
  type PropRiskPolicy,
  type RiskDomain,
  type RiskEvaluationContext,
  type RiskFact,
  type RiskPolicy,
} from '../../supabase/functions/_shared/professional-risk-engine.js';

const at = '2026-07-26T12:00:00.000Z';
const known = <T>(value: T): RiskFact<T> => ({ state: 'KNOWN', value, observed_at: at });
const candles = Array.from({ length: 60 }, (_, index) => ({ symbol: 'BTCUSDT', market_type: 'crypto', timeframe: '15m', open_time: new Date(Date.parse(at) - (60 - index) * 900_000).toISOString(), open: 99, high: 101, low: 98, close: 100, volume: 1000, source: 'deterministic-fixture' }));
const strategyContext: StrategyEvaluationContext = { symbol: 'BTCUSDT', market: 'crypto', timeframe: '15m', candles, evaluated_at: at, indicators: { ema20: 101, ema50: 99, atr14: 2, rsi14: 58, recent_high: 102, recent_low: 96, avg_volume: 1000, body_size: 1, atr_pct: 2, range_compression_ratio: .5, momentum_score: .8, volatility_state: 'NORMAL', regime: 'trend_up' } };
const legacy = { status: 'candidate' as const, direction: 'buy', entry_low: 99.9, entry_high: 100.1, stop_loss: 98, tp1: 102, tp2: 104, risk_reward: 2, confidence_score: 87, grade: 'A+', reason: 'deterministic accepted fixture', rejection_reason: '', score_breakdown: { primary_failed_gate: 'passed', trend_confirmed: true, momentum_confirmed: true, final_score: 87 } };
const definition: StrategyDefinition = { id: 'crypto.micro-scalper', version: '1.0.0', legacyName: 'MicroScalper', market: 'crypto', lifecycle: 'ENABLED', config: { strategy_name: 'MicroScalper', enabled: true, min_score: 72, min_rr: 1.2, max_bars_in_trade: 24, allowed_symbols: [], allowed_timeframes: ['5m', '15m'], params: {} }, evaluate: () => legacy };
const plan = createStrategyPlan(definition, strategyContext, legacy);
const approved = approveStrategyPlan(plan, { approved_at: at, arbitration: { policy_version: 'existing-v1', winner_reason: 'existing deterministic winner', competing_strategies: [] } });

function propPolicy(overrides: Partial<PropRiskPolicy> = {}): PropRiskPolicy {
  return { schema_version: PROP_POLICY_SCHEMA_VERSION, policy_id: 'prop-account-policy', version: 'challenge-v1', challenge_type: 'CHALLENGE', starting_balance: 100000, daily_loss_limit_pct: 5, maximum_drawdown_limit_pct: 10, drawdown_type: 'STATIC', calculation_basis: 'BALANCE_AND_EQUITY', floating_loss_treatment: 'INCLUDED', reset_time: '00:00', timezone: 'UTC', weekend_holding_rule: 'FORBIDDEN', overnight_holding_rule: 'ALLOWED', news_rule: 'FORBIDDEN', maximum_risk_per_trade_pct: 1, maximum_open_risk_pct: 3, leverage_cap: 10, safety_buffer_pct: 1, unknown_fields: [], ...overrides };
}

function policy(domain: RiskDomain, overrides: Partial<RiskPolicy> = {}): RiskPolicy {
  return {
    schema_version: RISK_POLICY_SCHEMA_VERSION, policy_id: `${domain.toLowerCase()}-risk`, version: '1.0.0', domain, source: domain === 'MT5_PROP' ? 'PROP' : 'PROVIDER', hard: true,
    allowed_environments: ['TESTNET', 'DEMO', 'LIVE'], allowed_account_ids: [], allowed_asset_classes: ['CRYPTO', 'FOREX', 'GOLD'],
    limits: { max_risk_per_trade_pct: 1, min_risk_per_trade_pct: .1, leverage_cap: 5, daily_loss_limit_pct: 10, weekly_loss_limit_pct: 15, maximum_drawdown_pct: 10, maximum_open_risk_pct: 5, maximum_concurrent_positions: 5, maximum_pending_orders: 5, symbol_concentration_pct: 10, base_asset_concentration_pct: 20, quote_currency_concentration_pct: 30, forex_currency_concentration_pct: 20, correlated_exposure_pct: 15, gold_exposure_pct: 5, provider_exposure_pct: 30, asset_class_exposure_pct: 40, directional_exposure_pct: 30, margin_utilization_pct: 70 },
    reduction: { starts_at_consumption_ratio: .8, stale_context_factor: .5 },
    requirements: { truth_freshness_ms: 60_000, one_active_position_per_symbol: true, provider_health_required: true, allowed_sessions: [], session: 'ADVISORY', spread: 'ADVISORY', liquidity: 'ADVISORY', news: domain === 'MT5_PROP' ? 'REJECT' : 'ADVISORY', weekend: domain === 'MT5_PROP' ? 'REJECT' : 'ADVISORY', overnight: domain === 'MT5_PROP' ? 'REJECT' : 'ADVISORY' },
    ...(domain === 'MT5_PROP' ? { prop_policy: propPolicy() } : {}), ...overrides,
  };
}

function context(domain: RiskDomain, overrides: Partial<RiskEvaluationContext> = {}): RiskEvaluationContext {
  const zeroProviders = { BINANCE: 0, BYBIT: 0, MT5_PERSONAL: 0, MT5_PROP: 0 };
  const base: RiskEvaluationContext = {
    schema_version: RISK_CONTEXT_SCHEMA_VERSION,
    lineage: { evaluation_id: plan.provenance.evaluation_id, correlation_id: plan.provenance.evaluation_id, risk_policy_id: `${domain.toLowerCase()}-risk`, risk_policy_version: '1.0.0', evaluated_at: at, account_id: `${domain.toLowerCase()}-account`, customer_id: null, provider: domain, environment: domain === 'BINANCE' ? 'TESTNET' : 'DEMO', account_mode: domain },
    request: { risk_percent: 1, leverage_ceiling: 3 },
    account: { exists: true, enabled: true, customer_authorized: true, execution_enabled: true, manually_locked: false, balance: known(10000), equity: known(10000), available_margin: known(9000), used_margin: known(1000), margin_utilization_pct: known(10), realized_daily_pnl: known(0), unrealized_pnl: known(0), daily_loss_used_pct: known(0), weekly_loss_used_pct: known(0), current_drawdown_pct: known(0), peak_equity: known(10000), open_positions: known([]), pending_orders: known(0), pending_risk_pct: known(0), aggregate_open_risk_pct: known(0), provider_health: known('HEALTHY'), truth_timestamp: at, freshness: 'KNOWN' },
    portfolio: { exposure_by_provider_pct: known(zeroProviders), exposure_by_symbol_pct: known({ BTCUSDT: 0 }), exposure_by_asset_class_pct: known({ CRYPTO: 0, FOREX: 0, GOLD: 0 }), exposure_by_direction_pct: known({ BUY: 0, SELL: 0 }), exposure_by_base_asset_pct: known({ BTC: 0 }), exposure_by_quote_currency_pct: known({ USDT: 0 }), forex_currency_exposure_pct: known({ USD: 0 }), correlated_symbol_exposure_pct: known({ BTCUSDT: 0 }), gold_exposure_pct: known(0), open_risk_concentration_pct: known(0) },
    market: { session: known('ALWAYS_OPEN'), spread: known('ELIGIBLE'), liquidity: known('ELIGIBLE'), news: known('CLEAR'), weekend: known(false), overnight: known(false), provider_operational: known(true), account_lock: known(false), customer_execution: known(true) },
  };
  return { ...base, ...overrides, lineage: { ...base.lineage, ...overrides.lineage }, request: { ...base.request, ...overrides.request }, account: { ...base.account, ...overrides.account }, portfolio: { ...base.portfolio, ...overrides.portfolio }, market: { ...base.market, ...overrides.market } };
}

const resolvedBinance = resolveRiskPolicy([policy('BINANCE')], 'BINANCE');
const accepted = evaluateRisk(approved, context('BINANCE'), resolvedBinance);
assert.equal(accepted.decision, 'ACCEPT');
assert.equal(accepted.authorized_envelope?.authorized_risk_percent, 1);
assert.equal(accepted.authorized_envelope?.maximum_authorized_risk_amount, 100);
assert.strictEqual(accepted.approved_strategy_plan, approved);
assert.ok(Object.isFrozen(accepted) && Object.isFrozen(accepted.gate_ledger));
assert.deepEqual(approved.strategy_plan, plan, 'risk acceptance does not alter strategy economics');

// Integrity and eligibility rejections.
const mutableApproval = structuredClone(approved) as unknown as ApprovedStrategyPlan;
assert.equal(evaluateRisk(mutableApproval, context('BINANCE'), resolvedBinance).decision, 'REJECT');
const noTradeLegacy = { ...legacy, status: 'rejected' as const, direction: 'none', rejection_reason: 'momentum_failed' };
const noTrade = createStrategyPlan(definition, strategyContext, noTradeLegacy);
const forgedNoTradeApproval = deepFreeze({ ...structuredClone(approved), strategy_plan: noTrade, correlation_id: noTrade.provenance.evaluation_id });
assert.equal(evaluateRisk(forgedNoTradeApproval, context('BINANCE', { lineage: { ...context('BINANCE').lineage, evaluation_id: noTrade.provenance.evaluation_id, correlation_id: noTrade.provenance.evaluation_id } }), resolvedBinance).decision, 'REJECT');
assert.equal(evaluateRisk(approved, context('BINANCE', { lineage: { ...context('BINANCE').lineage, correlation_id: 'mismatch' } }), resolvedBinance).decision, 'REJECT');
assert.equal(evaluateRisk(approved, context('BINANCE', { lineage: { ...context('BINANCE').lineage, account_mode: 'BYBIT' } }), resolvedBinance).decision, 'REJECT');
assert.equal(evaluateRisk(approved, context('BINANCE', { account: { ...context('BINANCE').account, enabled: false } }), resolvedBinance).decision, 'REJECT');

// Deterministic reductions; the most restrictive rule wins.
const drawdownReduced = evaluateRisk(approved, context('BINANCE', { account: { ...context('BINANCE').account, current_drawdown_pct: known(8.5) } }), resolvedBinance);
assert.equal(drawdownReduced.decision, 'REDUCE'); assert.ok(Math.abs((drawdownReduced.authorized_envelope?.authorized_risk_percent ?? 0) - .75) < 1e-9);
const dailyReduced = evaluateRisk(approved, context('BINANCE', { account: { ...context('BINANCE').account, daily_loss_used_pct: known(9) } }), resolvedBinance);
assert.equal(dailyReduced.decision, 'REDUCE'); assert.equal(dailyReduced.authorized_envelope?.authorized_risk_percent, .5);
const aggregateReduced = evaluateRisk(approved, context('BINANCE', { account: { ...context('BINANCE').account, aggregate_open_risk_pct: known(4.5) } }), resolvedBinance);
assert.equal(aggregateReduced.authorized_envelope?.authorized_risk_percent, .5);
const concentrationReduced = evaluateRisk(approved, context('BINANCE', { portfolio: { ...context('BINANCE').portfolio, exposure_by_symbol_pct: known({ BTCUSDT: 9.6 }) } }), resolvedBinance);
assert.ok(Math.abs((concentrationReduced.authorized_envelope?.authorized_risk_percent ?? 0) - .4) < 1e-9);
const leverageReduced = evaluateRisk(approved, context('BINANCE', { request: { risk_percent: 1, leverage_ceiling: 10 } }), resolvedBinance);
assert.equal(leverageReduced.decision, 'REDUCE'); assert.equal(leverageReduced.authorized_envelope?.leverage_ceiling, 5);
const marginReduced = evaluateRisk(approved, context('BINANCE', { account: { ...context('BINANCE').account, margin_utilization_pct: known(63) } }), resolvedBinance);
assert.equal(marginReduced.decision, 'REDUCE'); assert.ok(marginReduced.reductions.some((item) => item.rule_id === 'truth.margin_utilization'));
const mostRestrictive = evaluateRisk(approved, context('BINANCE', { account: { ...context('BINANCE').account, current_drawdown_pct: known(8.5), aggregate_open_risk_pct: known(4.5) }, request: { risk_percent: 1, leverage_ceiling: 10 } }), resolvedBinance);
assert.equal(mostRestrictive.authorized_envelope?.authorized_risk_percent, .5);
assert.ok(mostRestrictive.reductions.every((item) => item.source && item.transformation));

// Canonical hard rejections.
const rejectionCases: [string, Partial<RiskEvaluationContext>][] = [
  ['stale truth', { account: { ...context('BINANCE').account, freshness: 'STALE' } }],
  ['unhealthy provider', { account: { ...context('BINANCE').account, provider_health: known('UNHEALTHY') } }],
  ['daily loss', { account: { ...context('BINANCE').account, daily_loss_used_pct: known(10) } }],
  ['weekly loss', { account: { ...context('BINANCE').account, weekly_loss_used_pct: known(15) } }],
  ['drawdown', { account: { ...context('BINANCE').account, current_drawdown_pct: known(10) } }],
  ['aggregate risk', { account: { ...context('BINANCE').account, aggregate_open_risk_pct: known(5) } }],
  ['pending risk', { account: { ...context('BINANCE').account, aggregate_open_risk_pct: known(3), pending_risk_pct: known(2) } }],
  ['position count', { account: { ...context('BINANCE').account, open_positions: known(Array.from({ length: 5 }, () => ({ provider: 'BINANCE' as const, symbol: 'ETHUSDT', direction: 'BUY' as const, asset_class: 'CRYPTO' as const, risk_percent: .5, notional: 100, base_asset: 'ETH', quote_currency: 'USDT', currencies: [], correlation_group: 'ETH' }))) } }],
  ['duplicate symbol cross-provider', { account: { ...context('BINANCE').account, open_positions: known([{ provider: 'BYBIT', symbol: 'BTC/USDT', direction: 'BUY', asset_class: 'CRYPTO', risk_percent: .5, notional: 100, base_asset: 'BTC', quote_currency: 'USDT', currencies: [], correlation_group: 'BTC' }]) } }],
];
for (const [label, patch] of rejectionCases) {
  const result = evaluateRisk(approved, context('BINANCE', patch), resolvedBinance);
  assert.equal(result.decision, 'REJECT', label); assert.ok(result.explanation.decisive_rule); assert.equal(result.authorized_envelope, null);
}
const noSafeRisk = evaluateRisk(approved, context('BINANCE', { account: { ...context('BINANCE').account, aggregate_open_risk_pct: known(4.95) } }), resolvedBinance);
assert.equal(noSafeRisk.decision, 'REJECT'); assert.equal(noSafeRisk.explanation.decisive_rule, 'no_safe_risk_remaining');

// Provider domains remain separate, while portfolio truth can carry economic cross-provider exposure.
for (const domain of ['BINANCE', 'BYBIT', 'MT5_PERSONAL'] as const) {
  const resolved = resolveRiskPolicy([policy(domain)], domain), result = evaluateRisk(approved, context(domain), resolved);
  assert.equal(result.account.provider, domain); assert.equal(result.authorized_envelope?.permitted_account_id, `${domain.toLowerCase()}-account`);
}
const bybitIndependent = evaluateRisk(approved, context('BYBIT', { account: { ...context('BYBIT').account, balance: known(20000), equity: known(20000) } }), resolveRiskPolicy([policy('BYBIT')], 'BYBIT'));
assert.equal(bybitIndependent.authorized_envelope?.maximum_authorized_risk_amount, 200, 'Bybit authorization uses only the Bybit account snapshot');
assert.equal(accepted.authorized_envelope?.maximum_authorized_risk_amount, 100, 'Binance authorization retains its independent snapshot');
assert.throws(() => resolveRiskPolicy([policy('BINANCE')], 'BYBIT'), /risk_policy_missing/);

// Prop policy is explicit, conservative and account-specific.
const resolvedProp = resolveRiskPolicy([policy('MT5_PROP')], 'MT5_PROP');
assert.equal(resolvedProp.prop_policy?.challenge_type, 'CHALLENGE');
assert.equal(evaluateRisk(approved, context('MT5_PROP', { market: { ...context('MT5_PROP').market, weekend: known(true) } }), resolvedProp).decision, 'REJECT');
assert.equal(evaluateRisk(approved, context('MT5_PROP', { market: { ...context('MT5_PROP').market, news: { state: 'UNKNOWN', value: null } } }), resolvedProp).decision, 'REJECT');
const sessionPolicy = resolveRiskPolicy([policy('MT5_PROP', { requirements: { ...policy('MT5_PROP').requirements, allowed_sessions: ['LONDON'] } })], 'MT5_PROP');
assert.equal(evaluateRisk(approved, context('MT5_PROP', { market: { ...context('MT5_PROP').market, session: known('TOKYO') } }), sessionPolicy).decision, 'REJECT');
const propReduced = evaluateRisk(approved, context('MT5_PROP', { account: { ...context('MT5_PROP').account, current_drawdown_pct: known(7.5) } }), resolvedProp);
assert.equal(propReduced.decision, 'REDUCE');
const unknownProp = resolveRiskPolicy([policy('MT5_PROP', { prop_policy: propPolicy({ unknown_fields: ['consistency_rule'] }) })], 'MT5_PROP');
assert.equal(evaluateRisk(approved, context('MT5_PROP'), unknownProp).decision, 'REJECT');

// Policy precedence is safest-limit wins and fully fingerprinted.
const system = policy('BINANCE', { policy_id: 'system-hard', source: 'SYSTEM', limits: { ...policy('BINANCE').limits, max_risk_per_trade_pct: .8, leverage_cap: 4 } });
const customer = policy('BINANCE', { policy_id: 'customer-override', source: 'CUSTOMER', limits: { ...policy('BINANCE').limits, max_risk_per_trade_pct: 2, leverage_cap: 20 } });
const effectiveA = resolveRiskPolicy([customer, system], 'BINANCE');
const effectiveB = resolveRiskPolicy([system, customer], 'BINANCE');
assert.equal(effectiveA.limits.max_risk_per_trade_pct, .8); assert.equal(effectiveA.limits.leverage_cap, 4);
assert.equal(effectiveA.fingerprint, effectiveB.fingerprint); assert.deepEqual(effectiveA, effectiveB);
const repeat = evaluateRisk(approved, context('BINANCE'), resolvedBinance);
assert.deepEqual(accepted, repeat, 'same plan, truth and policy produce identical immutable decision');
assert.equal(accepted.diagnostics.effective_policy_fingerprint, resolvedBinance.fingerprint);
const advisoryUnknown = evaluateRisk(approved, context('BINANCE', { market: { ...context('BINANCE').market, news: { state: 'UNKNOWN', value: null } } }), resolvedBinance);
assert.equal(advisoryUnknown.decision, 'ACCEPT'); assert.ok(advisoryUnknown.gate_ledger.some((gate) => gate.id === 'market.news' && gate.status === 'UNKNOWN'));

for (const activeConsumer of [
  'supabase/functions/market-scanner/index.ts',
  'supabase/functions/binance-testnet-execution/index.ts',
  'supabase/functions/bybit-demo-execution/index.ts',
  'supabase/functions/mt5-bridge/index.ts',
]) {
  assert.ok(!readFileSync(activeConsumer, 'utf8').includes('professional-risk-engine'), `${activeConsumer} remains intentionally unmigrated`);
}

console.log('professional risk engine certification tests passed');
