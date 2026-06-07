import assert from 'node:assert/strict';
import {
  canExecuteFreshSignal,
  createProtectionPlan,
  decideSameSymbolBlock,
  evaluateManagedExit,
  shouldBlockDuplicateSignal,
  shouldBlockDuplicateSignalWithTruth,
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
  const nativePlan = await createProtectionPlan(fill, nativeClient);
  assert.equal(nativePlan.protection_status, 'protected', 'TP1/TP2/SL native success');
  assert.equal(nativePlan.bracket_mode, 'exchange_native');
  assert.equal(nativePlan.tp1_quantity, 1);
  assert.equal(nativePlan.tp2_quantity, 1);

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
