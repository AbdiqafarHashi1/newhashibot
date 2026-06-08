import assert from 'node:assert/strict';
import {
  buildNativeConditionalOrder,
  canExecuteFreshSignal,
  createProtectionPlan,
  decideSameSymbolBlock,
  evaluateManagedExit,
  shouldBlockDuplicateSignal,
  shouldBlockDuplicateSignalWithTruth,
  timeStopMinutes,
  verifyNativeProtectionOpenOrders,
  type EntryFill,
  type ManagedExitClient,
  type NativeProtectionClient,
} from '../../src/lib/binanceTruthExecution.js';

async function run() {
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
    async placeReduceOnlyStop() { return { orderId: 'sl-1' }; },
    async placeReduceOnlyTakeProfit(input) { return { orderId: `${input.label}-1` }; },
  };
  const slIntent = buildNativeConditionalOrder({ ...fill, label: 'sl', quantity: fill.quantity });
  assert.deepEqual(slIntent, { symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', quantity: 2, stopPrice: 90, reduceOnly: true, workingType: 'MARK_PRICE', closePosition: false }, 'native SL uses reduce-only STOP_MARKET on close side');
  const tp1Intent = buildNativeConditionalOrder({ ...fill, label: 'tp1', quantity: 1, targetPrice: fill.tp1 });
  assert.equal(tp1Intent.type, 'TAKE_PROFIT_MARKET', 'native TP1 uses TAKE_PROFIT_MARKET');
  assert.equal(tp1Intent.closePosition, false, 'native TP1 does not use closePosition partials');

  const nativePlan = await createProtectionPlan(fill, nativeClient);
  assert.equal(nativePlan.protection_status, 'protected', 'TP1/TP2/SL native success');
  assert.equal(nativePlan.bracket_mode, 'exchange_native');
  assert.equal(nativePlan.tp1_quantity, 1);
  assert.equal(nativePlan.tp2_quantity, 1);
  const verified = verifyNativeProtectionOpenOrders(fill, { sl: 'sl-1', tp1: 'tp1-1', tp2: 'tp2-1' }, [
    { orderId: 'sl-1', symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, closePosition: false, stopPrice: 90, origQty: 2 },
    { orderId: 'tp1-1', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, closePosition: false, stopPrice: 110, origQty: 1 },
    { orderId: 'tp2-1', symbol: 'BTCUSDT', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, closePosition: false, stopPrice: 120, origQty: 1 },
  ]);
  assert.equal(verified.verified, true, 'openOrders verification confirms native SL/TP1/TP2');
  assert.equal(verifyNativeProtectionOpenOrders(fill, { sl: 'sl-1', tp1: 'missing', tp2: 'tp2-1' }, []).missingLabels.includes('tp1'), true, 'missing native TP1 is detected');

  assert.equal(timeStopMinutes('MicroScalper', '5m'), 120, 'MicroScalper 5m time-stop is 120 minutes');
  assert.equal(timeStopMinutes('SwingContinuation', '1h'), 5760, 'SwingContinuation 1h time-stop is 96 hours');

  const fallbackPlan = await createProtectionPlan(fill, {
    async placeReduceOnlyStop() { throw new Error('STOP rejected on demo'); },
    async placeReduceOnlyTakeProfit() { return { orderId: 'unused' }; },
  });
  assert.equal(fallbackPlan.protection_status, 'protected_managed', 'managed fallback success');
  assert.equal(fallbackPlan.bracket_mode, 'managed_exit_fallback');

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
