import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approveStrategyPlan, createStrategyPlan, deepFreeze, stableFingerprint } from '../../supabase/functions/_shared/strategy-plan.js';
import type { LegacyStrategyResult, StrategyDefinition, StrategyEvaluationContext } from '../../supabase/functions/_shared/professional-strategies.js';
import { RISK_DECISION_SCHEMA_VERSION, type RiskDecision, type RiskDomain } from '../../supabase/functions/_shared/professional-risk-engine.js';
import { CAPITAL_ALLOCATION_PLAN_VERSION, type CapitalAllocationPlan, type CryptoContractSpecification, type Mt5ContractSpecification, type ProviderContractSpecification } from '../../supabase/functions/_shared/professional-capital-allocation.js';
import { EXECUTION_PLANNING_CONTEXT_VERSION, ROUTING_POLICY_VERSION, planExecution, type ExecutionPlanningContext, type ExecutionRoutingPolicy, type ProviderRoutingCapabilities } from '../../supabase/functions/_shared/professional-execution-planning.js';

export const at = '2026-07-26T12:00:00.000Z';
export function upstream(domain: RiskDomain, market: 'crypto' | 'forex' = 'crypto', values: { entry?: number; stop?: number; tp1?: number; tp2?: number; quantity?: number } = {}): CapitalAllocationPlan {
  const symbol = market === 'crypto' ? 'BTCUSDT' : 'EURUSD', entry = values.entry ?? (market === 'crypto' ? 100 : 1.1), stop = values.stop ?? (market === 'crypto' ? 98 : 1.099), tp1 = values.tp1 ?? (market === 'crypto' ? 102 : 1.101), tp2 = values.tp2 ?? (market === 'crypto' ? 104 : 1.102), quantity = values.quantity ?? (market === 'crypto' ? 1 : .2);
  const candles = Array.from({ length: 60 }, (_, index) => ({ symbol, market_type: market, timeframe: '15m', open_time: new Date(Date.parse(at) - (60 - index) * 900_000).toISOString(), open: entry, high: entry * 1.001, low: entry * .999, close: entry, volume: 1000, source: 'deterministic-fixture' }));
  const strategyContext: StrategyEvaluationContext = { symbol, market, timeframe: '15m', candles, evaluated_at: at, indicators: { ema20: entry * 1.001, ema50: entry * .999, atr14: Math.abs(entry - stop), rsi14: 58, recent_high: entry * 1.01, recent_low: entry * .99, avg_volume: 1000, body_size: 1, atr_pct: 1, range_compression_ratio: .5, momentum_score: .8, volatility_state: 'NORMAL', regime: 'trend_up' } };
  const legacy: LegacyStrategyResult = { status: 'candidate', direction: 'buy', entry_low: entry, entry_high: entry, stop_loss: stop, tp1, tp2, risk_reward: 2, confidence_score: 87, grade: 'A+', reason: 'deterministic execution fixture', rejection_reason: '', score_breakdown: { primary_failed_gate: 'passed' } };
  const definition: StrategyDefinition = { id: market === 'crypto' ? 'crypto.micro-scalper' : 'forex.swing-continuation', version: '1.0.0', legacyName: market === 'crypto' ? 'MicroScalper' : 'ForexSwingContinuation', market, lifecycle: 'ENABLED', config: { strategy_name: 'fixture', enabled: true, min_score: 70, min_rr: 1, max_bars_in_trade: 24, allowed_symbols: [], allowed_timeframes: ['15m'], params: {} }, evaluate: () => legacy };
  const strategy = createStrategyPlan(definition, strategyContext, legacy);
  const approved = approveStrategyPlan(strategy, { approved_at: at, arbitration: { policy_version: 'fixture-v1', winner_reason: 'fixture', competing_strategies: [] } });
  const accountId = `${domain.toLowerCase()}-account`;
  const risk: RiskDecision = deepFreeze({ schema_version: RISK_DECISION_SCHEMA_VERSION, decision_id: `${domain}-risk-decision`, correlation_id: approved.correlation_id, evaluation_id: strategy.provenance.evaluation_id, evaluated_at: at, approved_strategy_plan: approved, account: { id: accountId, customer_id: null, provider: domain, environment: domain === 'BINANCE' ? 'TESTNET' : 'DEMO', mode: domain }, decision: 'ACCEPT', authorized_envelope: { requested_risk_percent: 1, authorized_risk_percent: 1, requested_risk_amount: 100, maximum_authorized_risk_amount: 100, requested_leverage_ceiling: 5, leverage_ceiling: 5, maximum_notional: 200000, maximum_margin: 50000, maximum_quantity: null, permitted_provider: domain, permitted_account_id: accountId, policy_id: 'fixture-risk', policy_version: '1.0.0' }, gate_ledger: [], reductions: [], explanation: { summary: 'fixture', decisive_rule: 'fixture', near_exhaustion: [], unknown_context: [], downstream_may_append: [], immutable_strategy_fields: [] }, diagnostics: { evaluator_status: 'COMPLETED', policy_resolution_source: 'fixture', effective_policy_fingerprint: 'fixture', missing_context: [], stale_context: [], warnings: [], runtime: { canonical: false, duration_ms: null } } });
  const allocation: CapitalAllocationPlan = { schema_version: CAPITAL_ALLOCATION_PLAN_VERSION, allocation_id: `${domain}-allocation`, status: 'ALLOCATED', evaluation_id: risk.evaluation_id, correlation_id: risk.correlation_id, created_at: at, approved_strategy_plan: approved, risk_decision: risk, provider: domain, account: { account_id: accountId, customer_id: null, account_currency: 'USD', selection_policy: 'AUTHORIZED_SCOPE_HEALTH_UTILIZATION_PRIORITY_ID_V1', selection_explanation: 'fixture', considered_accounts: [] }, authorized_risk: { percent: 1, amount: 100, leverage_ceiling: 5, maximum_notional: 200000, maximum_margin: 50000 }, allocation: { quantity, quantity_unit: market === 'crypto' ? 'BASE_ASSET' : 'LOTS', contract_quantity: market === 'crypto' ? quantity : quantity * 100000, lot_size: market === 'crypto' ? null : quantity, notional: market === 'crypto' ? quantity * entry : quantity * 100000 * entry, margin: market === 'crypto' ? quantity * entry / 5 : quantity * 100000 * entry / 5, leverage: 5, entry_reference: entry, stop_reference: stop }, precision_adjustments: [], rounding_explanation: 'fixture', gate_ledger: [], rejected_constraints: [], diagnostics: { calculator: market === 'crypto' ? 'CRYPTO_V1' : 'MT5_V1', contract_fingerprint: '', context_fingerprint: 'fixture', warnings: [], active_runtime_adoption: 'PENDING_PHASE_1E', runtime: { canonical: false, duration_ms: null } } };
  return allocation;
}

export const cryptoSpec = (provider: 'BINANCE' | 'BYBIT'): CryptoContractSpecification => ({ kind: 'CRYPTO', provider, symbol: 'BTCUSDT', product: 'PERPETUAL', quantity_step: .001, quantity_precision: 3, minimum_quantity: .001, maximum_quantity: 1000, tick_size: .1, price_precision: 1, minimum_notional: 5, maximum_notional: 1_000_000, contract_multiplier: 1, leverage_mode: 'ISOLATED', maximum_leverage: 20, quote_currency: 'USDT' });
export const mt5Spec = (provider: 'MT5_PERSONAL' | 'MT5_PROP'): Mt5ContractSpecification => ({ kind: 'MT5', provider, symbol: 'EURUSD', broker_symbol: 'EURUSD.a', contract_size: 100000, tick_size: .00001, tick_value_account_currency: 1, pip_size: .0001, price_precision: 5, minimum_lot: .01, maximum_lot: 100, lot_step: .01, leverage_mode: 'ACCOUNT', maximum_leverage: 30, margin_rate: null, account_currency: 'USD', quote_to_account_conversion: 1 });

export function policy(provider: RiskDomain, overrides: Partial<ExecutionRoutingPolicy> = {}): ExecutionRoutingPolicy {
  return { schema_version: ROUTING_POLICY_VERSION, policy_id: `${provider.toLowerCase()}-routing`, version: '1.0.0', provider, allowed_environments: ['TESTNET', 'DEMO', 'LIVE'], execution_mode: provider === 'BINANCE' ? 'TESTNET' : 'DEMO', entry_order_type: 'LIMIT', time_in_force: 'GTC', post_only: false, protection_mode: provider.startsWith('MT5') ? 'ATTACHED' : 'NATIVE_CONDITIONAL', tp1_quantity_fraction: .5, tp2_quantity_fraction: .5, trigger_reference: provider.startsWith('MT5') ? 'BID_ASK' : 'MARK_PRICE', maximum_provider_truth_age_ms: 60_000, ...overrides };
}
export function capabilities(provider: RiskDomain, overrides: Partial<ProviderRoutingCapabilities> = {}): ProviderRoutingCapabilities {
  return { provider, provider_symbol: provider.startsWith('MT5') ? 'EURUSD.a' : 'BTCUSDT', supported_entry_types: ['MARKET', 'LIMIT'], supported_time_in_force: ['GTC', 'IOC'], supported_leverage_modes: provider.startsWith('MT5') ? ['ACCOUNT'] : ['ISOLATED', 'CROSS', 'NONE'], minimum_stop_distance_price: provider.startsWith('MT5') ? .0001 : .1, supports_reduce_only: !provider.startsWith('MT5'), supports_close_on_trigger: provider === 'BYBIT', supports_post_only: !provider.startsWith('MT5'), leverage_configuration: provider === 'BINANCE' ? 'SET_BEFORE_ENTRY' : 'PRECONFIGURED_ACCOUNT', margin_mode_configuration: provider === 'BINANCE' ? 'SET_BEFORE_ENTRY' : 'PRECONFIGURED_ACCOUNT', mt5_fill_policies: provider.startsWith('MT5') ? ['IOC', 'RETURN'] : undefined, current_bid: provider.startsWith('MT5') ? 1.0999 : null, current_ask: provider.startsWith('MT5') ? 1.1001 : null, ...overrides };
}
export function context(allocation: CapitalAllocationPlan, spec: ProviderContractSpecification, overrides: Partial<ExecutionPlanningContext> = {}): ExecutionPlanningContext {
  const frozen = deepFreeze({ ...allocation, diagnostics: { ...allocation.diagnostics, contract_fingerprint: stableFingerprint(spec) } });
  const provider = frozen.provider;
  return { schema_version: EXECUTION_PLANNING_CONTEXT_VERSION, capital_allocation_plan: frozen, evaluation_id: frozen.evaluation_id, correlation_id: frozen.correlation_id, provider, environment: frozen.risk_decision.account.environment, account_id: frozen.account!.account_id, contract_specification: spec, contract_specification_fingerprint: stableFingerprint(spec), provider_truth_timestamp: at, routing_timestamp: at, freshness: 'KNOWN', routing_policy: policy(provider), capabilities: capabilities(provider), ...overrides };
}

const binanceAllocation = upstream('BINANCE');
const binanceContext = context(binanceAllocation, cryptoSpec('BINANCE'));
const binance = planExecution(binanceContext);
assert.equal(binance.status, 'PLANNED'); assert.equal(binance.orders.length, 4);
assert.equal(binance.orders[0].provider_payload.type, 'LIMIT'); assert.equal(binance.orders[0].provider_payload.timeInForce, 'GTC');
assert.equal(binance.orders[1].provider_payload.type, 'STOP_MARKET'); assert.equal(binance.orders[1].provider_payload.reduceOnly, true);
assert.equal(binance.orders[2].provider_payload.type, 'TAKE_PROFIT_MARKET');
assert.deepEqual(binance.provider_configuration.map((row) => row.action), ['SET_MARGIN_MODE', 'SET_LEVERAGE']);
assert.equal(binance.provider_configuration[1].provider_payload.endpoint, '/fapi/v1/leverage');
assert.ok(binance.orders.every((order) => order.client_order_id.length <= 36 && order.idempotency_key));
assert.equal(new Set(binance.orders.map((order) => order.client_order_id)).size, 4);
assert.strictEqual(binance.capital_allocation_plan, binanceContext.capital_allocation_plan);
assert.strictEqual(binance.risk_decision, binanceContext.capital_allocation_plan.risk_decision);
assert.strictEqual(binance.strategy_plan, binanceContext.capital_allocation_plan.approved_strategy_plan.strategy_plan);
assert.ok(Object.isFrozen(binance) && Object.isFrozen(binance.orders) && Object.isFrozen(binance.orders[0].provider_payload));

const bybit = planExecution(context(upstream('BYBIT'), cryptoSpec('BYBIT')));
assert.equal(bybit.status, 'PLANNED'); assert.equal(bybit.orders[0].provider_payload.orderType, 'Limit');
assert.equal(bybit.orders[1].provider_payload.closeOnTrigger, true); assert.equal(bybit.orders[1].provider_payload.triggerDirection, 2);
assert.equal(bybit.orders[2].provider_payload.triggerDirection, 1); assert.ok(bybit.orders[0].provider_payload.orderLinkId);
assert.deepEqual(bybit.provider_configuration.map((row) => row.action), ['VERIFY_PRECONFIGURED_MARGIN_MODE', 'VERIFY_PRECONFIGURED_LEVERAGE']);
assert.notEqual(bybit.routing_fingerprint, binance.routing_fingerprint);

for (const provider of ['MT5_PERSONAL', 'MT5_PROP'] as const) {
  const mt5 = planExecution(context(upstream(provider, 'forex'), mt5Spec(provider)));
  assert.equal(mt5.status, 'PLANNED'); assert.equal(mt5.orders.length, 2);
  assert.deepEqual(mt5.orders.map((order) => order.quantity), [.1, .1]);
  assert.ok(mt5.orders.every((order) => order.order_type === 'BUY_LIMIT' && order.provider_payload.sl === 1.099 && order.provider_payload.tp));
  assert.equal(mt5.orders[0].provider_payload.type_filling, 'IOC'); assert.equal(mt5.orders[0].provider_payload.symbol, 'EURUSD.a');
}

const marketBinance = planExecution(context(binanceAllocation, cryptoSpec('BINANCE'), { routing_policy: policy('BINANCE', { entry_order_type: 'MARKET', time_in_force: 'IOC' }) }));
assert.equal(marketBinance.status, 'PLANNED'); assert.equal(marketBinance.orders[0].price, null); assert.equal(marketBinance.orders[0].provider_payload.type, 'MARKET');
const postOnlyBinance = planExecution(context(binanceAllocation, cryptoSpec('BINANCE'), { routing_policy: policy('BINANCE', { post_only: true }) }));
assert.equal(postOnlyBinance.orders[0].provider_payload.timeInForce, 'GTX'); assert.equal(postOnlyBinance.orders[0].time_in_force, 'POST_ONLY');
const postOnlyBybit = planExecution(context(upstream('BYBIT'), cryptoSpec('BYBIT'), { routing_policy: policy('BYBIT', { post_only: true }) }));
assert.equal(postOnlyBybit.orders[0].provider_payload.timeInForce, 'PostOnly');

const repeated = planExecution(binanceContext);
assert.deepEqual(binance, repeated); assert.equal(binance.idempotency_key, repeated.idempotency_key); assert.equal(binance.execution_fingerprint, repeated.execution_fingerprint);
assert.deepEqual(binance.orders.map((order) => order.client_order_id), repeated.orders.map((order) => order.client_order_id));
assert.throws(() => { (binance.orders[0] as { quantity: number }).quantity = 99; }, TypeError);
assert.deepEqual(binanceContext.capital_allocation_plan.allocation, binance.capital_allocation_plan.allocation, 'execution planning never changes quantity or leverage');

const stale = planExecution(context(binanceAllocation, cryptoSpec('BINANCE'), { freshness: 'STALE' }));
assert.equal(stale.status, 'REJECTED'); assert.ok(stale.diagnostics.rejected_instructions.includes('provider_routing_truth_stale'));
const badFingerprint = planExecution(context(binanceAllocation, cryptoSpec('BINANCE'), { contract_specification_fingerprint: 'wrong' }));
assert.equal(badFingerprint.status, 'REJECTED'); assert.ok(badFingerprint.diagnostics.rejected_instructions.includes('contract_fingerprint_mismatch'));
const wrongProvider = planExecution(context(binanceAllocation, cryptoSpec('BINANCE'), { provider: 'BYBIT', capabilities: capabilities('BYBIT'), routing_policy: policy('BYBIT') }));
assert.equal(wrongProvider.status, 'REJECTED');
const unsupported = planExecution(context(binanceAllocation, cryptoSpec('BINANCE'), { routing_policy: policy('BINANCE', { post_only: true, entry_order_type: 'MARKET' }) }));
assert.equal(unsupported.status, 'REJECTED'); assert.ok(unsupported.diagnostics.rejected_instructions.includes('order_semantics_unsupported'));
const invalidStopAllocation = upstream('BINANCE', 'crypto', { stop: 101 });
const invalidStop = planExecution(context(invalidStopAllocation, cryptoSpec('BINANCE')));
assert.equal(invalidStop.status, 'REJECTED'); assert.ok(invalidStop.diagnostics.rejected_instructions.includes('stop_instruction_invalid'));
const mutableAllocation = structuredClone(binanceContext.capital_allocation_plan);
assert.equal(planExecution({ ...binanceContext, capital_allocation_plan: mutableAllocation }).status, 'REJECTED');

assert.ok(readFileSync('supabase/functions/binance-testnet-execution/index.ts','utf8').includes('professional-execution-planning'), 'active adoption boundary consumes ExecutionPlan');
for (const transportOnly of ['supabase/functions/bybit-demo-execution/index.ts','supabase/functions/mt5-bridge/index.ts','src/lib/exchange/ExchangeProviderMT5.ts']) assert.ok(!readFileSync(transportOnly,'utf8').includes('planExecution('), `${transportOnly} never plans`);

console.log('professional execution planning certification tests passed');
