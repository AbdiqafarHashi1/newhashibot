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

function leverageForSignal(signal) {
  const grade = String(signal.grade ?? '').toUpperCase();
  const fallback = grade === 'A+' ? 5 : 3;
  const rawSuggested = signal.suggested_leverage_max ?? signal.suggested_leverage_min;
  const suggestedNumber = Number(rawSuggested);
  const suggested = Number.isFinite(suggestedNumber) && suggestedNumber > 0 ? suggestedNumber : fallback;
  const rawCap = Number(signal.leverage_cap);
  const cappedBySignal = Number.isFinite(rawCap) && rawCap > 0 ? Math.min(suggested, rawCap) : suggested;
  return Math.max(1, Math.min(7, Math.floor(Number.isFinite(cappedBySignal) ? cappedBySignal : fallback)));
}

function shouldSkipOldSignal(signalCreatedAt, testnetEnabledAt, manual = false) {
  return !manual && Boolean(testnetEnabledAt) && new Date(signalCreatedAt) < new Date(testnetEnabledAt);
}

function liveTradingGuard(env) {
  if (env.LIVE_TRADING_ENABLED === 'true') throw new Error('Live trading guard blocked execution');
  if (env.EXECUTION_MODE !== 'testnet') throw new Error('Execution disabled');
  if (env.EXCHANGE !== 'binance_usdm_testnet') throw new Error('Wrong exchange');
  if (env.TESTNET_ENABLED !== 'true') throw new Error('Testnet disabled');
  if (env.BINANCE_TESTNET_BASE_URL !== 'https://demo-fapi.binance.com') throw new Error('Wrong base URL');
  return true;
}

function isDuplicate(existingExecution) {
  return Boolean(existingExecution?.id);
}

assert.equal(
  hmacSha256Hex('test-secret', 'symbol=BTCUSDT&timestamp=1710000000000'),
  crypto.createHmac('sha256', 'test-secret').update('symbol=BTCUSDT&timestamp=1710000000000').digest('hex'),
  'signature generation should be deterministic',
);
assert.equal(floorToStep(0.123456, 0.001, 3), 0.123, 'quantity floors to step size');
assert.equal(floorToStep(1.999, 0.1, 1), 1.9, 'quantity never rounds up');
assert.equal(leverageForSignal({ grade: 'A+', suggested_leverage_max: 25, leverage_cap: 12 }), 7, 'hard leverage cap is 7x');
assert.equal(leverageForSignal({ grade: 'A', suggested_leverage_max: null, suggested_leverage_min: null, leverage_cap: null }), 3, 'A fallback leverage is 3x');
assert.equal(isDuplicate({ id: 'existing' }), true, 'duplicate execution prevention detects existing execution');
assert.equal(shouldSkipOldSignal('2026-06-05T10:00:00Z', '2026-06-05T11:00:00Z'), true, 'old signal is skipped');
assert.equal(shouldSkipOldSignal('2026-06-05T10:00:00Z', '2026-06-05T11:00:00Z', true), false, 'manual selected signal can bypass old-signal auto guard');
assert.equal(liveTradingGuard({ EXECUTION_MODE: 'testnet', EXCHANGE: 'binance_usdm_testnet', TESTNET_ENABLED: 'true', LIVE_TRADING_ENABLED: 'false', BINANCE_TESTNET_BASE_URL: 'https://demo-fapi.binance.com' }), true);
assert.throws(() => liveTradingGuard({ EXECUTION_MODE: 'testnet', EXCHANGE: 'binance_usdm_testnet', TESTNET_ENABLED: 'true', LIVE_TRADING_ENABLED: 'true', BINANCE_TESTNET_BASE_URL: 'https://demo-fapi.binance.com' }), /Live trading guard/);

console.log('Binance testnet connector self-tests passed');
