import assert from 'node:assert/strict';
import {
  buildE2EProtectionProof,
  buildNativeConditionalOrder,
  canExecuteFreshSignal,
  createProtectionPlan,
  decideSameSymbolBlock,
  evaluateManagedExit,
  shouldBlockDuplicateSignal,
  shouldBlockDuplicateSignalWithTruth,
  timeStopMinutes,
  validateSelectedSignalForExecution,
  verifyNativeProtectionOpenOrders,
  governorPausedVisibility,
  governorAllowsTestnetExecution,
  type EntryFill,
  type ManagedExitClient,
  type NativeProtectionClient,
} from '../../src/lib/binanceTruthExecution.js';

async function run() {
  assert.deepEqual(validateSelectedSignalForExecution(null, null), { ok: false, error: 'missing_signal_id' }, 'missing signal_id returns clean error');
  assert.deepEqual(validateSelectedSignalForExecution('sig-1', null), { ok: false, error: 'signal_not_found' }, 'deleted signal returns clean signal_not_found error');
  assert.deepEqual(validateSelectedSignalForExecution('sig-1', { id: 'other', symbol: 'BTCUSDT', market_type: 'crypto', direction: 'buy' }), { ok: false, error: 'invalid_selected_signal' }, 'selected signal mismatch does not crash');
  assert.deepEqual(validateSelectedSignalForExecution('sig-1', { id: 'sig-1', symbol: null, market_type: 'crypto', direction: 'buy' }), { ok: false, error: 'stale_signal_not_executable' }, 'stale signal is not executable');
  assert.equal(governorPausedVisibility({ state: 'paused', reason: 'daily_loss_limit_reached', lastCheckedAt: '2026-06-08T00:00:00.000Z' }).error, 'governor_paused', 'governor paused returns clean reason');
  assert.equal(governorAllowsTestnetExecution('normal', true), false, 'normal governor mode blocks when governor blocks');
  assert.equal(governorAllowsTestnetExecution('readonly', true), true, 'readonly governor mode calculates but does not block testnet execution');
  assert.equal(governorAllowsTestnetExecution('off_for_testing', true), true, 'off_for_testing bypasses governor block for testnet execution');
  const proof = buildE2EProtectionProof({ entryOrderId: 'entry-1', positionSize: 0.1, bracketMode: 'exchange_native', protectionStatus: 'protected_native', slOrderId: 'sl-1', tp1OrderId: 'tp1-1', tp2OrderId: 'tp2-1' });
  assert.equal(proof.entry_submitted, true, 'E2E proof includes entry_submitted');
  assert.equal(proof.native_sl_order_detected, true, 'E2E proof includes native SL detection');
  assert.equal(proof.native_tp1_order_detected, true, 'E2E proof includes native TP1 detection');
  assert.equal(proof.native_tp2_order_detected, true, 'E2E proof includes native TP2 detection');

  assert.equal(shouldBlockDuplicateSignal([{ id: 'skip-auto', symbol: 'BTCUSDT', status: 'skipped', latest_auto_skip_reason: 'skipped_auto_disabled' }]).block, false, 'skipped_auto_disabled row allows manual retry');
  assert.equal(shouldBlockDuplicateSignal([{ id: 'failed', symbol: 'BTCUSDT', status: 'failed' }]).block, false, 'failed row allows retry');
  assert.equal(shouldBlockDuplicateSignal([{ id: 'closed-be', symbol: 'BTCUSDT', status: 'closed_breakeven' }]).block, false, 'closed_breakeven row allows retry');
  const duplicateTruth = shouldBlockDuplicateSignalWithTruth([{ id: 'active-dup', symbol: 'BTCUSDT', status: 'protected' }], { symbol: 'BTCUSDT', positionSize: 0, openOrders: [] });
  assert.equal(duplicateTruth.block, false, 'truth-first duplicate allows retry when Binance is empty');
  assert.deepEqual(duplicateTruth.staleRowIds, ['active-dup']);
  assert.equal(decideSameSymbolBlock([{ id: 'active-stale', symbol: 'BTCUSDT', status: 'protected' }], { symbol: 'BTCUSDT', positionSize: 0, openOrders: [] }).block, false, 'stale DB active row with no Binance position/orders allows retry');
  assert.deepEqual(decideSameSymbolBlock([{ id: 'active-stale', symbol: 'BTCUSDT', status: 'protected' }], { symbol: 'BTCUSDT', positionSize: 0, openOrders: [] }).staleRowIds, ['active-stale']);
  assert.equal(decideSameSymbolBlock([{ id: 'active-real', symbol: 'BTCUSDT', status: 'protected' }], { symbol: 'BTCUSDT', positionSize: 0.25, openOrders: [] }).block, true, 'active DB row with real Binance position blocks');
  assert.equal(decideSameSymbolBlock([], { symbol: 'ETHUSDT', positionSize: 0, openOrders: [] }).block, false, 'same symbol with no Binance position does not block');

  const fill: EntryFill = { symbol: 'BTCUSDT', direction: 'buy', quantity: 2, entryPrice: 100, stopLoss: 90, tp1: 110, tp2: 120 };
  const nativeClient: NativeProtectionClient = {
    async placeReduceOnlyStop() { return { algoId: 'sl-1', clientAlgoId: 'c-sl-1' }; },
    async placeReduceOnlyTakeProfit(input) { return { algoId: `${input.label}-1`, clientAlgoId: `c-${input.label}-1` }; },
  };
  const slIntent = buildNativeConditionalOrder({ ...fill, label: 'sl', quantity: fill.quantity });
  assert.deepEqual(slIntent, { symbol: 'BTCUSDT', side: 'SELL', algoType: 'CONDITIONAL', type: 'STOP_MARKET', quantity: 2, triggerPrice: 90, reduceOnly: true, workingType: 'MARK_PRICE', closePosition: false }, 'native SL uses reduce-only STOP_MARKET on close side');
  const tp1Intent = buildNativeConditionalOrder({ ...fill, label: 'tp1', quantity: 1, targetPrice: fill.tp1 });
  assert.equal(tp1Intent.type, 'TAKE_PROFIT_MARKET', 'native TP1 uses TAKE_PROFIT_MARKET');
  assert.equal(tp1Intent.closePosition, false, 'native TP1 does not use closePosition partials');

  const nativePlan = await createProtectionPlan(fill, {
    ...nativeClient,
    async fetchOpenProtectionOrders() {
      return [
        { orderId: 'legacy-sl', algoId: 'sl-1', symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, closePosition: false, triggerPrice: 90, origQty: 2 },
        { orderId: 'legacy-tp1', algoId: 'tp1-1', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, closePosition: false, triggerPrice: 110, origQty: 1 },
        { orderId: 'legacy-tp2', algoId: 'tp2-1', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, closePosition: false, triggerPrice: 120, origQty: 1 },
      ];
    },
  });
  assert.equal(nativePlan.protection_status, 'protected_native', 'TP1/TP2/SL native algo success after Binance open-order verification');
  assert.equal(nativePlan.native_protection_verified, true, 'native algo orders are verified before protected_native');
  assert.equal(nativePlan.bracket_mode, 'exchange_native');
  assert.equal(nativePlan.tp1_quantity, 1);
  assert.equal(nativePlan.tp2_quantity, 1);
  const verified = verifyNativeProtectionOpenOrders(fill, { sl: 'sl-1', tp1: 'tp1-1', tp2: 'tp2-1' }, [
    { orderId: 'legacy-sl', algoId: 'sl-1', symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, closePosition: false, triggerPrice: 90, origQty: 2 },
    { orderId: 'legacy-tp1', algoId: 'tp1-1', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, closePosition: false, triggerPrice: 110, origQty: 1 },
    { orderId: 'legacy-tp2', algoId: 'tp2-1', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, closePosition: false, triggerPrice: 120, origQty: 1 },
  ]);
  assert.equal(verified.verified, true, 'openOrders verification confirms native SL/TP1/TP2');
  assert.equal(verifyNativeProtectionOpenOrders(fill, { sl: 'sl-1', tp1: 'missing', tp2: 'tp2-1' }, []).missingLabels.includes('tp1'), true, 'missing native TP1 is detected');

  assert.equal(timeStopMinutes('MicroScalper', '5m'), 120, 'MicroScalper 5m time-stop is 120 minutes');
  assert.equal(timeStopMinutes('SwingContinuation', '1h'), 5760, 'SwingContinuation 1h time-stop is 96 hours');

  const fallbackPlan = await createProtectionPlan(fill, {
    async placeReduceOnlyStop() { throw new Error('STOP rejected on demo'); },
    async placeReduceOnlyTakeProfit() { return { algoId: 'unused' }; },
  });
  assert.equal(fallbackPlan.protection_status, 'protection_failed', 'native failures remain unprotected until watchdog recovery verifies Binance SL/TP1/TP2');
  assert.equal(fallbackPlan.bracket_mode, 'exchange_native');

  const closes: Array<{ quantity: number; reason: string }> = [];
  const managedClient: ManagedExitClient = {
    async closeReduceOnlyMarket(_symbol, _direction, quantity, reason) {
      closes.push({ quantity, reason });
      return { orderId: `${reason}-close` };
    },
  };
  const tp1 = await evaluateManagedExit({ ...fill, remainingQuantity: 2, tp1Closed: false, slMovedToBreakEven: false }, 111, managedClient);
  assert.equal(tp1.action, 'tp1_closed', 'TP1 closes 50%');
  assert.equal(tp1.closedQuantity, 1);
  assert.equal(tp1.slMovedToBreakEven, true, 'TP1 moves SL to BE');

  const tp2 = await evaluateManagedExit({ ...fill, remainingQuantity: 1, tp1Closed: true, slMovedToBreakEven: true }, 121, managedClient);
  assert.equal(tp2.action, 'tp2_closed', 'TP2 closes remaining');
  assert.equal(tp2.closedQuantity, 1);
  assert.equal(tp2.remainingQuantity, 0);

  assert.deepEqual(canExecuteFreshSignal({
    testnetModeEnabled: true,
    executionAllowed: true,
    killSwitchOff: true,
    binanceTruth: { symbol: 'BTCUSDT', positionSize: 0, openOrders: [] },
    riskSizeValid: true,
    liveTrading: true,
  }), { allowed: false, reason: 'live_trading_forbidden' }, 'live trading impossible');
}

run().then(() => console.log('execution truth-first tests passed'));
