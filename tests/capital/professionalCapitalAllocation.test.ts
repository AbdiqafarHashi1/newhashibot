import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approveStrategyPlan, createStrategyPlan, deepFreeze } from '../../supabase/functions/_shared/strategy-plan.js';
import type { LegacyStrategyResult, StrategyDefinition, StrategyEvaluationContext } from '../../supabase/functions/_shared/professional-strategies.js';
import { RISK_DECISION_SCHEMA_VERSION, type RiskDecision, type RiskDomain } from '../../supabase/functions/_shared/professional-risk-engine.js';
import {
  allocateCapital,
  CAPITAL_ALLOCATION_CONTEXT_VERSION,
  floorToIncrement,
  type AllocationAccountCandidate,
  type CapitalAllocationContext,
  type CryptoContractSpecification,
  type Mt5ContractSpecification,
} from '../../supabase/functions/_shared/professional-capital-allocation.js';

const at = '2026-07-26T12:00:00.000Z';
function approvedPlan(market: 'crypto' | 'forex' = 'crypto') {
  const symbol = market === 'crypto' ? 'BTCUSDT' : 'EURUSD', entry = market === 'crypto' ? 100 : 1.1, stop = market === 'crypto' ? 98 : 1.099;
  const candles = Array.from({ length: 60 }, (_, index) => ({ symbol, market_type: market, timeframe: '15m', open_time: new Date(Date.parse(at) - (60 - index) * 900_000).toISOString(), open: entry, high: entry * 1.001, low: entry * .999, close: entry, volume: 1000, source: 'deterministic-fixture' }));
  const context: StrategyEvaluationContext = { symbol, market, timeframe: '15m', candles, evaluated_at: at, indicators: { ema20: entry * 1.001, ema50: entry * .999, atr14: Math.abs(entry - stop), rsi14: 58, recent_high: entry * 1.01, recent_low: entry * .99, avg_volume: 1000, body_size: 1, atr_pct: 1, range_compression_ratio: .5, momentum_score: .8, volatility_state: 'NORMAL', regime: 'trend_up' } };
  const legacy: LegacyStrategyResult = { status: 'candidate', direction: 'buy', entry_low: entry, entry_high: entry, stop_loss: stop, tp1: entry + (entry - stop), tp2: entry + 2 * (entry - stop), risk_reward: 2, confidence_score: 87, grade: 'A+', reason: 'deterministic allocation fixture', rejection_reason: '', score_breakdown: { primary_failed_gate: 'passed' } };
  const definition: StrategyDefinition = { id: market === 'crypto' ? 'crypto.micro-scalper' : 'forex.swing-continuation', version: '1.0.0', legacyName: market === 'crypto' ? 'MicroScalper' : 'ForexSwingContinuation', market, lifecycle: 'ENABLED', config: { strategy_name: 'fixture', enabled: true, min_score: 70, min_rr: 1, max_bars_in_trade: 24, allowed_symbols: [], allowed_timeframes: ['15m'], params: {} }, evaluate: () => legacy };
  const plan = createStrategyPlan(definition, context, legacy);
  return approveStrategyPlan(plan, { approved_at: at, arbitration: { policy_version: 'fixture-v1', winner_reason: 'deterministic fixture', competing_strategies: [] } });
}

function riskDecision(domain: RiskDomain, market: 'crypto' | 'forex' = 'crypto', overrides: Partial<NonNullable<RiskDecision['authorized_envelope']>> = {}, decision: RiskDecision['decision'] = 'ACCEPT'): RiskDecision {
  const approved = approvedPlan(market), amount = overrides.maximum_authorized_risk_amount ?? 100;
  const envelope = decision === 'REJECT' ? null : { requested_risk_percent: 1, authorized_risk_percent: 1, requested_risk_amount: amount, maximum_authorized_risk_amount: amount, requested_leverage_ceiling: 5, leverage_ceiling: 5, maximum_notional: 200000, maximum_margin: 50000, maximum_quantity: null, permitted_provider: domain, permitted_account_id: `${domain.toLowerCase()}-account`, policy_id: `${domain.toLowerCase()}-risk`, policy_version: '1.0.0', ...overrides };
  return deepFreeze({ schema_version: RISK_DECISION_SCHEMA_VERSION, decision_id: `${domain}-decision`, correlation_id: approved.correlation_id, evaluation_id: approved.strategy_plan.provenance.evaluation_id, evaluated_at: at, approved_strategy_plan: approved, account: { id: `${domain.toLowerCase()}-account`, customer_id: null, provider: domain, environment: domain === 'BINANCE' ? 'TESTNET' : 'DEMO', mode: domain }, decision, authorized_envelope: envelope, gate_ledger: [], reductions: [], explanation: { summary: 'fixture', decisive_rule: 'fixture', near_exhaustion: [], unknown_context: [], downstream_may_append: [], immutable_strategy_fields: [] }, diagnostics: { evaluator_status: 'COMPLETED', policy_resolution_source: 'fixture', effective_policy_fingerprint: 'fixture', missing_context: [], stale_context: [], warnings: [], runtime: { canonical: false, duration_ms: null } } });
}

function account(domain: RiskDomain, overrides: Partial<AllocationAccountCandidate> = {}): AllocationAccountCandidate {
  return { account_id: `${domain.toLowerCase()}-account`, customer_id: null, provider: domain, environment: domain === 'BINANCE' ? 'TESTNET' : 'DEMO', enabled: true, execution_enabled: true, provider_health: 'HEALTHY', policy_priority: 1, balance: 100000, equity: 100000, available_capital: 90000, available_margin: 50000, used_margin: 10000, utilization_pct: 10, account_currency: 'USD', provider_timestamp: at, freshness: 'KNOWN', ...overrides };
}

function cryptoSpec(provider: 'BINANCE' | 'BYBIT', overrides: Partial<CryptoContractSpecification> = {}): CryptoContractSpecification {
  return { kind: 'CRYPTO', provider, symbol: 'BTCUSDT', product: 'PERPETUAL', quantity_step: provider === 'BINANCE' ? .001 : .01, quantity_precision: provider === 'BINANCE' ? 3 : 2, minimum_quantity: .001, maximum_quantity: 1000, tick_size: .1, price_precision: 1, minimum_notional: 5, maximum_notional: 1_000_000, contract_multiplier: 1, leverage_mode: 'ISOLATED', maximum_leverage: 20, quote_currency: 'USDT', ...overrides };
}

function mt5Spec(provider: 'MT5_PERSONAL' | 'MT5_PROP', overrides: Partial<Mt5ContractSpecification> = {}): Mt5ContractSpecification {
  return { kind: 'MT5', provider, symbol: 'EURUSD', broker_symbol: 'EURUSD.a', contract_size: 100000, tick_size: .00001, tick_value_account_currency: 1, pip_size: .0001, price_precision: 5, minimum_lot: .01, maximum_lot: 100, lot_step: .01, leverage_mode: 'ACCOUNT', maximum_leverage: provider === 'MT5_PROP' ? 10 : 30, margin_rate: null, account_currency: 'USD', quote_to_account_conversion: 1, ...overrides };
}

function allocationContext(risk: RiskDecision, spec: CryptoContractSpecification | Mt5ContractSpecification, accounts: AllocationAccountCandidate[] = [account(risk.account.provider)], overrides: Partial<CapitalAllocationContext> = {}): CapitalAllocationContext {
  return { schema_version: CAPITAL_ALLOCATION_CONTEXT_VERSION, risk_decision: risk, evaluation_id: risk.evaluation_id, correlation_id: risk.correlation_id, evaluated_at: at, provider: risk.account.provider, permitted_account_ids: [risk.account.id], accounts, contract_specification: spec, provider_timestamp: at, freshness: 'KNOWN', maximum_truth_age_ms: 60_000, ...overrides };
}

assert.equal(floorToIncrement(.617, .01), .61);
assert.equal(floorToIncrement(1.239, .001, 3), 1.239);

const binanceRisk = riskDecision('BINANCE');
const binanceContext = allocationContext(binanceRisk, cryptoSpec('BINANCE'));
const binance = allocateCapital(binanceContext);
assert.equal(binance.status, 'ALLOCATED');
assert.equal(binance.allocation?.quantity, 50);
assert.equal(binance.allocation?.notional, 5000);
assert.equal(binance.allocation?.margin, 1000);
assert.strictEqual(binance.risk_decision, binanceRisk);
assert.strictEqual(binance.approved_strategy_plan, binanceRisk.approved_strategy_plan);
assert.ok(Object.isFrozen(binance) && Object.isFrozen(binance.allocation) && Object.isFrozen(binance.gate_ledger));
assert.deepEqual(binanceRisk.approved_strategy_plan.strategy_plan.entry_plan.zone, { low: 100, high: 100 });

const stepRisk = riskDecision('BINANCE', 'crypto', { maximum_authorized_risk_amount: 1.234, requested_risk_amount: 1.234 });
const stepped = allocateCapital(allocationContext(stepRisk, cryptoSpec('BINANCE', { quantity_step: .01, quantity_precision: 2 })));
assert.equal(stepped.allocation?.quantity, .61);
assert.ok(stepped.rounding_explanation.includes('floor'));

const bybitRisk = riskDecision('BYBIT');
const bybit = allocateCapital(allocationContext(bybitRisk, cryptoSpec('BYBIT'), [account('BYBIT', { balance: 200000, available_capital: 180000 })]));
assert.equal(bybit.provider, 'BYBIT'); assert.equal(bybit.allocation?.quantity, 50);
assert.notEqual(bybit.account?.account_id, binance.account?.account_id);
const wrongRules = allocateCapital(allocationContext(bybitRisk, cryptoSpec('BINANCE')));
assert.equal(wrongRules.status, 'REJECTED'); assert.ok(wrongRules.rejected_constraints.includes('contract_provider_mismatch'));
const misalignedPrice = allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE', { tick_size: 3 })));
assert.equal(misalignedPrice.status, 'REJECTED'); assert.ok(misalignedPrice.rejected_constraints.includes('precision_unavailable_or_price_misaligned'));
const providerMaxQuantity = allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE', { maximum_quantity: 10 })));
assert.equal(providerMaxQuantity.allocation?.quantity, 10); assert.equal(providerMaxQuantity.allocation?.notional, 1000);
const spot = allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE', { product: 'SPOT', leverage_mode: 'NONE' })));
assert.equal(spot.allocation?.leverage, 1);

const mt5PersonalRisk = riskDecision('MT5_PERSONAL', 'forex');
const mt5Personal = allocateCapital(allocationContext(mt5PersonalRisk, mt5Spec('MT5_PERSONAL'), [account('MT5_PERSONAL', { available_margin: 50000 })]));
assert.equal(mt5Personal.status, 'ALLOCATED');
assert.ok(Math.abs((mt5Personal.allocation?.lot_size ?? 0) - 1) < 1e-9);
assert.ok(Math.abs((mt5Personal.allocation?.contract_quantity ?? 0) - 100000) < 1e-6);
assert.ok(Math.abs((mt5Personal.allocation?.margin ?? 0) - 22000) < 1e-6);

const mt5PropRisk = riskDecision('MT5_PROP', 'forex', { leverage_ceiling: 3 });
const mt5Prop = allocateCapital(allocationContext(mt5PropRisk, mt5Spec('MT5_PROP', { maximum_leverage: 10 }), [account('MT5_PROP', { available_margin: 50000 })]));
assert.equal(mt5Prop.status, 'ALLOCATED'); assert.equal(mt5Prop.allocation?.leverage, 3);
assert.equal(mt5Personal.provider, 'MT5_PERSONAL'); assert.equal(mt5Prop.provider, 'MT5_PROP');

const minimumNotional = allocateCapital(allocationContext(riskDecision('BINANCE', 'crypto', { maximum_authorized_risk_amount: .01, requested_risk_amount: .01 }), cryptoSpec('BINANCE')));
assert.equal(minimumNotional.status, 'REJECTED'); assert.ok(minimumNotional.rejected_constraints.includes('minimum_notional_not_met'));
const insufficientCapital = allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE'), [account('BINANCE', { available_capital: 50 })]));
assert.equal(insufficientCapital.status, 'REJECTED'); assert.ok(insufficientCapital.rejected_constraints.includes('insufficient_available_capital'));
const insufficientMargin = allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE'), [account('BINANCE', { available_margin: 100 })]));
assert.equal(insufficientMargin.status, 'REJECTED'); assert.ok(insufficientMargin.rejected_constraints.includes('insufficient_margin'));
const stale = allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE'), [account('BINANCE')], { freshness: 'STALE' }));
assert.equal(stale.status, 'REJECTED'); assert.ok(stale.rejected_constraints.includes('provider_truth_stale_or_unavailable'));
const staleAccount = allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE'), [account('BINANCE', { provider_timestamp: '2026-07-26T11:00:00.000Z' })]));
assert.equal(staleAccount.status, 'REJECTED'); assert.ok(staleAccount.rejected_constraints.includes('insufficient_available_capital'));
const rejectedRisk = riskDecision('BINANCE', 'crypto', {}, 'REJECT');
assert.equal(allocateCapital(allocationContext(rejectedRisk, cryptoSpec('BINANCE'))).status, 'REJECTED');

const unauthorizedLowerUtilization = account('BINANCE', { account_id: 'not-risk-authorized', utilization_pct: 0, policy_priority: 0 });
const selected = allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE'), [unauthorizedLowerUtilization, account('BINANCE', { utilization_pct: 20 })], { permitted_account_ids: ['binance-account', 'not-risk-authorized'] }));
assert.equal(selected.account?.account_id, 'binance-account');
assert.ok(selected.account?.selection_explanation.includes('inside the RiskDecision account scope'));
assert.ok(selected.account?.considered_accounts.some((row) => row.account_id === 'not-risk-authorized' && !row.eligible));

const repeat = allocateCapital(binanceContext);
assert.deepEqual(binance, repeat, 'identical risk, provider truth and contract produce identical allocation');
assert.equal(binance.diagnostics.context_fingerprint, repeat.diagnostics.context_fingerprint);
assert.deepEqual(binanceRisk, repeat.risk_decision, 'allocation never mutates the risk decision');
assert.throws(() => { (binance.allocation as { quantity: number }).quantity = 1; }, TypeError);

const mutableRisk = structuredClone(binanceRisk);
assert.equal(allocateCapital(allocationContext(mutableRisk, cryptoSpec('BINANCE'))).status, 'REJECTED');
assert.equal(allocateCapital(allocationContext(binanceRisk, cryptoSpec('BINANCE'), [account('BINANCE')], { correlation_id: 'wrong' })).status, 'REJECTED');

for (const activeConsumer of ['supabase/functions/binance-testnet-execution/index.ts', 'supabase/functions/bybit-demo-execution/index.ts', 'supabase/functions/mt5-bridge/index.ts']) {
  assert.ok(!readFileSync(activeConsumer, 'utf8').includes('professional-capital-allocation'), `${activeConsumer} remains intentionally unmigrated`);
}

console.log('professional capital allocation certification tests passed');
