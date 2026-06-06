import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function hmacSha256Hex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
function floorToStep(value, step, precision) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scaled = Math.floor((value / step) + 1e-12) * step;
  return Number(scaled.toFixed(Math.min(Math.max(precision, 0), 12)));
}
function riskPctForSignal(signal, settings, governor = { state: 'normal', risk_multiplier: 1 }) {
  const grade = String(signal.grade ?? '').toUpperCase();
  const gradeRisk = governor.state === 'aggressive_allowed' ? (grade === 'A+' ? 1.0 : 0.75) : (grade === 'A+' ? settings.testnet_risk_a_plus : settings.testnet_risk_a);
  const recommended = Number(signal.recommended_risk_pct);
  const selected = Number.isFinite(recommended) && recommended > 0 ? Math.min(recommended, gradeRisk) : gradeRisk;
  return Math.min(selected * governor.risk_multiplier, settings.max_testnet_risk_pct, 1);
}
function leverageForSignal(signal, settings, governor = { adjusted_max_leverage: settings.testnet_max_leverage }) {
  const gradeDefault = String(signal.grade ?? '').toUpperCase() === 'A+' ? settings.testnet_leverage_a_plus : settings.testnet_leverage_a;
  const hardMax = Math.min(settings.testnet_max_leverage, governor.adjusted_max_leverage, 7);
  const guidance = Number(signal.suggested_leverage_max ?? signal.suggested_leverage_min);
  let requested = gradeDefault;
  let source = 'grade_default';
  if (Number.isFinite(guidance) && guidance >= 1 && guidance <= hardMax) { requested = guidance; source = 'signal_guidance'; }
  const signalCap = Number(signal.leverage_cap);
  const effectiveMax = Number.isFinite(signalCap) && signalCap > 0 ? Math.min(hardMax, signalCap) : hardMax;
  const leverage = Math.max(1, Math.min(effectiveMax, Math.floor(requested)));
  return { leverage, leverage_source: leverage < requested ? 'capped_to_max' : source };
}
function selectCapital(settings, raw) {
  let selected = 0;
  if (settings.capital_basis === 'manual_override') selected = settings.testnet_capital_override_usdt;
  else if (settings.capital_basis === 'available_usdc_plus_usdt') selected = raw.raw_available_usdt + raw.raw_available_usdc;
  else if (settings.capital_basis === 'total_margin_balance') selected = raw.raw_total_margin_balance;
  else if (settings.capital_basis === 'total_wallet_balance') selected = raw.raw_total_wallet_balance;
  else selected = raw.raw_available_usdt;
  const capped = Number.isFinite(settings.max_capital_used_usdt) && settings.max_capital_used_usdt > 0 && selected > settings.max_capital_used_usdt;
  return { selected_capital_used: capped ? settings.max_capital_used_usdt : selected, max_capital_cap_applied: capped };
}
function buildSizing({ entry, stop, capital, riskPct, leverage, rules }) {
  const riskAmount = capital * (riskPct / 100);
  const stopDistance = Math.abs(entry - stop);
  const rawQuantity = riskAmount / stopDistance;
  const maxLeveredQty = (capital * leverage) / entry;
  const quantity = floorToStep(Math.min(rawQuantity, maxLeveredQty), rules.stepSize, rules.quantityPrecision);
  return { riskAmount, stopDistance, rawQuantity, quantity, notional: quantity * entry };
}
function exitPayload({ symbol, closeSide, type, stopPrice, quantity }) {
  return { endpoint: '/fapi/v1/algoOrder', payload: { symbol, side: closeSide, type, stopPrice, quantity, reduceOnly: true, workingType: 'MARK_PRICE' } };
}
function fallbackMode(error) {
  return /Order type not supported|Algo order API|\/fapi\/v1\/algoOrder|404|unsupported/i.test(error) ? 'managed_exit_fallback' : 'failed';
}
function shouldSkipOldSignal(signalCreatedAt, testnetEnabledAt, manual = false) {
  return !manual && Boolean(testnetEnabledAt) && new Date(signalCreatedAt) < new Date(testnetEnabledAt);
}
function shouldAutoExecute({ env, settings, signal, existing, activeSymbolCount, openCount }) {
  if (env.LIVE_TRADING_ENABLED === 'true') return 'live_trading_impossible_guard';
  if (env.EXECUTION_MODE !== 'testnet' || env.TESTNET_ENABLED !== 'true') return 'skipped_auto_disabled';
  if (settings.execution_mode !== 'testnet' || !settings.testnet_enabled || !settings.auto_execute_testnet) return 'skipped_auto_disabled';
  if (settings.kill_switch_enabled) return 'skipped_kill_switch';
  if (shouldSkipOldSignal(signal.created_at, settings.testnet_enabled_at)) return 'skipped_old_signal';
  if (signal.market_type !== 'crypto') return 'skipped_non_crypto';
  if (existing) return 'skipped_duplicate_signal';
  if (settings.one_active_execution_per_symbol && activeSymbolCount > 0) return 'skipped_active_symbol_execution';
  if (openCount >= settings.max_open_testnet_positions) return 'skipped_max_open_positions';
  return 'auto_executed';
}
function evaluateGovernor({ settings, equity, startEquity, unrealizedPnl = 0, failedStreak = 0, slStreak = 0 }) {
  if (settings.kill_switch_enabled) return { state: 'paused', reason: 'kill_switch_enabled' };
  if (settings.live_trading_enabled) return { state: 'paused', reason: 'live_trading_enabled_guard' };
  if (!Number.isFinite(equity)) return { state: 'defensive', reason: 'current_equity_missing' };
  const pnlPct = ((equity - startEquity) / startEquity) * 100;
  const unrealizedPct = (unrealizedPnl / startEquity) * 100;
  if (pnlPct <= -settings.max_daily_loss_pct) return { state: 'paused', reason: 'daily_loss_limit_reached' };
  if (unrealizedPct <= -settings.max_daily_loss_pct) return { state: 'paused', reason: 'unrealized_drawdown_severe_pause' };
  if (failedStreak >= settings.max_consecutive_failed_executions) return { state: 'paused', reason: 'consecutive_failed_executions_limit' };
  if (slStreak >= settings.max_consecutive_closed_sl) return { state: 'paused', reason: 'consecutive_closed_sl_limit' };
  if (unrealizedPct <= -settings.max_unrealized_drawdown_pct) return { state: 'defensive', reason: 'unrealized_drawdown_defensive' };
  if (pnlPct <= -settings.defensive_loss_pct) return { state: 'defensive', reason: 'daily_loss_defensive' };
  if (pnlPct >= settings.aggressive_allowed_profit_pct) return { state: 'aggressive_allowed', reason: 'profit_threshold_aggressive_allowed' };
  return { state: 'normal', reason: 'governor_normal' };
}
function governorPolicy(state, settings) {
  return { state, risk_multiplier: state === 'defensive' ? 0.5 : 1, adjusted_max_leverage: state === 'defensive' ? Math.min(settings.testnet_max_leverage, 3) : Math.min(settings.testnet_max_leverage, 7), blocks_execution: state === 'paused' };
}

function protectionMode({ regularOk, algoOk, managedAllowed }) {
  if (regularOk || algoOk) return { bracket_mode: 'exchange_native', protection_status: 'protected' };
  if (managedAllowed) return { bracket_mode: 'managed_exit_fallback', protection_status: 'protected_managed' };
  return { bracket_mode: 'failed', protection_status: 'unprotected_failed' };
}
function managedTransition({ direction = 'buy', mark, entry, sl, tp1, tp2, tp1Filled = false }) {
  const isLong = direction === 'buy';
  const activeSl = tp1Filled ? entry : sl;
  if (isLong ? mark <= activeSl : mark >= activeSl) return tp1Filled ? 'closed_breakeven' : 'closed_sl';
  if (isLong ? mark >= tp2 : mark <= tp2) return 'closed_tp';
  if (!tp1Filled && (isLong ? mark >= tp1 : mark <= tp1)) return 'partially_closed_move_be';
  return 'protected_managed';
}
function nativeTransition({ slStatus, tp1Status, tp2Status, tp1Filled = false }) {
  if (slStatus === 'FILLED') return tp1Filled ? 'closed_breakeven' : 'closed_sl';
  if (tp2Status === 'FILLED') return 'closed_tp';
  if (tp1Status === 'FILLED' && !tp1Filled) return 'partially_closed_move_be';
  return 'protected';
}
function maxOpenPositions(settings) {
  return Math.max(1, Math.min(settings.max_open_testnet_positions, settings.max_open_testnet_positions_allowed_max, 10));
}
function blocksTotalOpenRisk(currentRisk, proposedRisk, cap) {
  return currentRisk + proposedRisk > Math.min(cap, 5) + 1e-9;
}

function syncStatus({ entry, sl, tp1, tp2, hasProtection }) {
  if (entry === 'FILLED' && !hasProtection) return 'entry_filled';
  if (sl === 'FILLED') return 'closed_sl';
  if (tp2 === 'FILLED') return 'closed_tp';
  if (tp1 === 'FILLED') return 'partially_closed';
  if (hasProtection) return 'protected';
  return 'entry_submitted';
}
function liveTradingGuard(env) {
  if (env.LIVE_TRADING_ENABLED === 'true') throw new Error('Live trading guard blocked execution');
  if (env.EXECUTION_MODE !== 'testnet') throw new Error('Execution disabled');
  if (env.EXCHANGE !== 'binance_usdm_testnet') throw new Error('Wrong exchange');
  if (env.TESTNET_ENABLED !== 'true') throw new Error('Testnet disabled');
  if (env.BINANCE_TESTNET_BASE_URL !== 'https://demo-fapi.binance.com') throw new Error('Wrong base URL');
  return true;
}

const settings = { max_open_testnet_positions: 3, max_open_testnet_positions_allowed_max: 10, max_total_open_risk_pct: 3, testnet_risk_a: 0.5, testnet_risk_a_plus: 0.75, max_testnet_risk_pct: 1, testnet_leverage_a: 3, testnet_leverage_a_plus: 5, testnet_max_leverage: 7, capital_basis: 'available_usdt', testnet_capital_override_usdt: null, max_capital_used_usdt: null, max_daily_loss_pct: 2, max_unrealized_drawdown_pct: 1.5, aggressive_allowed_profit_pct: 1.5, defensive_loss_pct: 1, max_consecutive_failed_executions: 3, max_consecutive_closed_sl: 3, kill_switch_enabled: false, live_trading_enabled: false };
const rawCapital = { raw_available_usdt: 4950, raw_available_usdc: 2500, raw_total_margin_balance: 10600, raw_total_wallet_balance: 10400 };

assert.equal(hmacSha256Hex('test-secret', 'symbol=BTCUSDT&timestamp=1710000000000'), crypto.createHmac('sha256', 'test-secret').update('symbol=BTCUSDT&timestamp=1710000000000').digest('hex'));
assert.equal(floorToStep(0.123456, 0.001, 3), 0.123);
assert.deepEqual(exitPayload({ symbol: 'ETHUSDT', closeSide: 'SELL', type: 'STOP_MARKET', stopPrice: 3450, quantity: 0.2 }), { endpoint: '/fapi/v1/algoOrder', payload: { symbol: 'ETHUSDT', side: 'SELL', type: 'STOP_MARKET', stopPrice: 3450, quantity: 0.2, reduceOnly: true, workingType: 'MARK_PRICE' } }, 'exchange-native SL payload uses algo endpoint with reduceOnly');
assert.equal(exitPayload({ symbol: 'ETHUSDT', closeSide: 'SELL', type: 'TAKE_PROFIT_MARKET', stopPrice: 3650, quantity: 0.1 }).payload.reduceOnly, true, 'TP payload is reduce-only');
assert.equal(fallbackMode('Binance /fapi/v1/order failed (400): Order type not supported for this endpoint. Please use the Algo order API endpoints instead.'), 'managed_exit_fallback');
assert.equal(selectCapital(settings, rawCapital).selected_capital_used, 4950, 'capital_basis available_usdt');
assert.equal(selectCapital({ ...settings, capital_basis: 'total_margin_balance' }, rawCapital).selected_capital_used, 10600, 'capital_basis total_margin_balance');
assert.equal(selectCapital({ ...settings, capital_basis: 'manual_override', testnet_capital_override_usdt: 1234 }, rawCapital).selected_capital_used, 1234, 'capital_basis manual_override');
assert.deepEqual(selectCapital({ ...settings, capital_basis: 'total_margin_balance', max_capital_used_usdt: 5000 }, rawCapital), { selected_capital_used: 5000, max_capital_cap_applied: true });
const sizing = buildSizing({ entry: 3500, stop: 3400, capital: 10000, riskPct: 0.5, leverage: 3, rules: { stepSize: 0.001, quantityPrecision: 3 } });
assert.equal(sizing.riskAmount, 50, 'risk sizing formula risk amount');
assert.equal(sizing.rawQuantity, 0.5, 'risk sizing formula quantity');
assert.equal(sizing.notional, 1750, 'risk sizing formula notional');
assert.equal(riskPctForSignal({ grade: 'A+', recommended_risk_pct: 5 }, settings), 0.75, 'recommended risk cannot exceed grade/admin default');
assert.equal(riskPctForSignal({ grade: 'A+', recommended_risk_pct: null }, { ...settings, max_testnet_risk_pct: 0.6 }), 0.6, '1% max risk cap setting caps risk');
assert.equal(leverageForSignal({ grade: 'A', suggested_leverage_max: null, suggested_leverage_min: null, leverage_cap: null }, settings).leverage, 3, 'A leverage = 3x');
assert.equal(leverageForSignal({ grade: 'A+', suggested_leverage_max: null, suggested_leverage_min: null, leverage_cap: null }, settings).leverage, 5, 'A+ leverage = 5x');
assert.equal(leverageForSignal({ grade: 'A+', suggested_leverage_max: null, leverage_cap: null }, { ...settings, testnet_leverage_a_plus: 9, testnet_max_leverage: 9 }).leverage, 7, 'max leverage cap = 7x');

assert.equal(evaluateGovernor({ settings, equity: 10000, startEquity: 10000 }).state, 'normal', 'normal governor state');
assert.equal(evaluateGovernor({ settings, equity: 9900, startEquity: 10000 }).state, 'defensive', 'defensive governor state');
assert.equal(evaluateGovernor({ settings, equity: 10160, startEquity: 10000 }).state, 'aggressive_allowed', 'aggressive_allowed governor state');
assert.equal(evaluateGovernor({ settings: { ...settings, kill_switch_enabled: true }, equity: 10000, startEquity: 10000 }).state, 'paused', 'paused governor state');
assert.equal(evaluateGovernor({ settings, equity: 9790, startEquity: 10000 }).reason, 'daily_loss_limit_reached', 'daily loss pause');
assert.equal(evaluateGovernor({ settings, equity: 10160, startEquity: 10000 }).reason, 'profit_threshold_aggressive_allowed', 'profit unlock aggressive_allowed');
assert.equal(evaluateGovernor({ settings, equity: 10000, startEquity: 10000, failedStreak: 3 }).reason, 'consecutive_failed_executions_limit', 'failed execution pause');
assert.equal(evaluateGovernor({ settings, equity: 10000, startEquity: 10000, slStreak: 3 }).reason, 'consecutive_closed_sl_limit', 'SL streak pause');
assert.equal(riskPctForSignal({ grade: 'A', recommended_risk_pct: null }, settings, governorPolicy('defensive', settings)), 0.25, 'risk multiplier applied');
assert.equal(leverageForSignal({ grade: 'A+', suggested_leverage_max: null, suggested_leverage_min: null, leverage_cap: null }, settings, governorPolicy('defensive', settings)).leverage, 3, 'max leverage reduced in defensive');
assert.equal(riskPctForSignal({ grade: 'A+', recommended_risk_pct: null }, settings, governorPolicy('aggressive_allowed', settings)), 1, 'aggressive A+ risk remains capped at 1%');

assert.deepEqual(protectionMode({ regularOk: true, algoOk: false, managedAllowed: false }), { bracket_mode: 'exchange_native', protection_status: 'protected' }, 'native SL/TP order success');
assert.deepEqual(protectionMode({ regularOk: false, algoOk: true, managedAllowed: false }), { bracket_mode: 'exchange_native', protection_status: 'protected' }, 'Algo fallback success');
assert.deepEqual(protectionMode({ regularOk: false, algoOk: false, managedAllowed: true }), { bracket_mode: 'managed_exit_fallback', protection_status: 'protected_managed' }, 'managed fallback when Binance rejects native protection');
assert.deepEqual(protectionMode({ regularOk: false, algoOk: false, managedAllowed: false }), { bracket_mode: 'failed', protection_status: 'unprotected_failed' }, 'unprotected_failed when no protection path works');
assert.equal(nativeTransition({ tp1Status: 'FILLED' }), 'partially_closed_move_be', 'TP1 closes 50%');
assert.equal(managedTransition({ mark: 3600, entry: 3500, sl: 3400, tp1: 3600, tp2: 3700 }), 'partially_closed_move_be', 'SL moves to BE after TP1');
assert.equal(nativeTransition({ tp2Status: 'FILLED', tp1Filled: true }), 'closed_tp', 'TP2 closes remaining 50%');
assert.equal(nativeTransition({ slStatus: 'FILLED', tp1Filled: false }), 'closed_sl', 'SL before TP1 closes full position');
assert.equal(nativeTransition({ slStatus: 'FILLED', tp1Filled: true }), 'closed_breakeven', 'BE SL after TP1 closes remaining position');
assert.equal(maxOpenPositions({ max_open_testnet_positions: 12, max_open_testnet_positions_allowed_max: 10 }), 10, 'max_open_testnet_positions up to 10');
assert.equal(blocksTotalOpenRisk(3.0, 0.75, 3.0), true, 'total open risk cap blocks new trade');
assert.equal(blocksTotalOpenRisk(2.25, 0.75, 3.0), false, 'total open risk cap allows exact cap');
assert.equal(shouldSkipOldSignal('2026-06-05T10:00:00Z', '2026-06-05T11:00:00Z'), true, 'old signal skip');
const gateBase = { env: { EXECUTION_MODE: 'testnet', TESTNET_ENABLED: 'true', LIVE_TRADING_ENABLED: 'false' }, settings: { execution_mode: 'testnet', testnet_enabled: true, auto_execute_testnet: true, kill_switch_enabled: false, one_active_execution_per_symbol: true, max_open_testnet_positions: 3, testnet_enabled_at: '2026-06-05T09:00:00Z' }, signal: { created_at: '2026-06-05T10:00:00Z', market_type: 'crypto' }, existing: false, activeSymbolCount: 0, openCount: 0 };
assert.equal(shouldAutoExecute({ ...gateBase, settings: { ...gateBase.settings, auto_execute_testnet: false } }), 'skipped_auto_disabled', 'auto_execute_testnet=false skip');
assert.equal(shouldAutoExecute({ ...gateBase, existing: true }), 'skipped_duplicate_signal', 'duplicate execution skip');
assert.equal(shouldAutoExecute({ ...gateBase, activeSymbolCount: 1 }), 'skipped_active_symbol_execution', 'one active execution per symbol skip');
assert.equal(shouldAutoExecute({ ...gateBase, openCount: 3 }), 'skipped_max_open_positions', 'max open positions skip');
assert.equal(shouldAutoExecute({ ...gateBase, env: { ...gateBase.env, LIVE_TRADING_ENABLED: 'true' } }), 'live_trading_impossible_guard', 'live trading impossible guard');
assert.equal(syncStatus({ entry: 'FILLED', hasProtection: false }), 'entry_filled', 'sync updates entry_filled');
assert.equal(syncStatus({ entry: 'FILLED', hasProtection: true }), 'protected', 'sync updates protected');
assert.equal(syncStatus({ entry: 'FILLED', hasProtection: true, sl: 'FILLED' }), 'closed_sl', 'sync updates failed/closed SL states');
assert.equal(liveTradingGuard({ EXECUTION_MODE: 'testnet', EXCHANGE: 'binance_usdm_testnet', TESTNET_ENABLED: 'true', LIVE_TRADING_ENABLED: 'false', BINANCE_TESTNET_BASE_URL: 'https://demo-fapi.binance.com' }), true);
assert.throws(() => liveTradingGuard({ EXECUTION_MODE: 'testnet', EXCHANGE: 'binance_usdm_testnet', TESTNET_ENABLED: 'true', LIVE_TRADING_ENABLED: 'true', BINANCE_TESTNET_BASE_URL: 'https://demo-fapi.binance.com' }), /Live trading guard/);
console.log('Binance testnet connector self-tests passed');
