import assert from 'node:assert/strict';
import { calculateProfitLockPrice, classifyExecutionLifecycleOutcome, computeTimeStopDeadline, evaluateMonitorGates, processExecutionMonitorTick } from '../../src/lib/binanceTestnetMonitor.js';

async function run() {
  assert.deepEqual(evaluateMonitorGates({ EXECUTION_MODE: 'testnet', TESTNET_ENABLED: true, LIVE_TRADING_ENABLED: true }, { execution_mode: 'testnet', testnet_enabled: true, kill_switch_enabled: false }), { allowed: false, reason: 'live_trading_enabled_abort' }, 'monitor aborts if live trading is enabled');
  assert.deepEqual(evaluateMonitorGates({ EXECUTION_MODE: 'testnet', TESTNET_ENABLED: false, LIVE_TRADING_ENABLED: false }, { execution_mode: 'testnet', testnet_enabled: true, kill_switch_enabled: false }), { allowed: false, reason: 'env_testnet_disabled' }, 'monitor skips when testnet disabled');

  const base = { id: 'e1', symbol: 'BTCUSDT', direction: 'buy' as const, status: 'entry_submitted', binance_entry_order_id: 'entry', volume: 2, entry_price: 100, intended_sl: 90, intended_tp1: 110, intended_tp2: 120 };
  const entry = processExecutionMonitorTick(base, { positionAmt: 2, openOrders: [], markPrice: 101 }, { entry: { orderId: 'entry', status: 'FILLED', avgPrice: '100.5' } });
  assert.equal(entry.updates.status, 'entry_filled', 'entry fill detection');
  assert.equal(entry.updates.entry_price, 100.5);
  assert.equal(entry.events.length, 1);

  const native = { ...base, status: 'protected_native', protection_status: 'protected_native', bracket_mode: 'exchange_native', tp1_algo_id: 'tp1', tp2_algo_id: 'tp2', sl_algo_id: 'sl', tp1_quantity: 1, tp2_quantity: 1 };
  const nativeTp1 = processExecutionMonitorTick(native, { positionAmt: 1, openOrders: [], markPrice: 111 }, { tp1: { orderId: 'tp1', status: 'FINISHED' } });
  assert.equal(nativeTp1.updates.status, 'partially_closed', 'native TP1 partial close detection');
  assert.equal(nativeTp1.updates.tp1_filled, true);
  assert.equal(nativeTp1.updates.tp1_fill_price, 110);
  assert.equal(nativeTp1.updates.partial_close_qty, 1);
  assert.equal(nativeTp1.updates.remaining_quantity, 1);
  assert.equal(nativeTp1.updates.profit_lock_r, 0.3);
  assert.equal(nativeTp1.updates.replacement_sl_price, 103);
  assert.equal(nativeTp1.replacementStopOrders[0].stopPrice, 103);

  const nativeTp2 = processExecutionMonitorTick({ ...native, tp1_closed_at: new Date().toISOString() }, { positionAmt: 0, openOrders: [{ algoId: 'sl' }], markPrice: 121 }, { tp2: { orderId: 'tp2', status: 'FILLED' } });
  assert.equal(nativeTp2.updates.status, 'closed_tp2', 'native TP2 close detection');
  assert.deepEqual(nativeTp2.cancelOrderIds.sort(), ['sl', 'tp1'].sort(), 'TP2 closure cancels all remaining native conditionals');

  const nativeExpired = processExecutionMonitorTick({ ...native, opened_at: new Date(Date.now() - 121 * 60_000).toISOString(), max_hold_minutes: 120 }, { positionAmt: 1, openOrders: [{ algoId: 'sl' }, { algoId: 'tp1' }, { algoId: 'tp2' }], markPrice: 101 }, {});
  assert.equal(nativeExpired.updates.status, 'closed_expired', 'native protected execution also expires through monitor time-stop');
  assert.equal(nativeExpired.reduceOnlyMarketOrders[0].reason, 'timeout');
  assert.deepEqual(nativeExpired.cancelOrderIds.sort(), ['sl', 'tp1', 'tp2'].sort());

  const nativeSl = processExecutionMonitorTick(native, { positionAmt: 0, openOrders: [{ algoId: 'tp1' }, { algoId: 'tp2' }], markPrice: 89 }, { sl: { orderId: 'sl', status: 'FILLED' } });
  assert.equal(nativeSl.updates.status, 'closed_sl', 'native SL close detection');
  assert.deepEqual(nativeSl.cancelOrderIds, ['tp1', 'tp2']);

  const managed = { ...base, status: 'protected_managed', bracket_mode: 'managed_exit_fallback', protection_status: 'protected_managed', remaining_quantity: 2, tp1_quantity: 1 };
  const managedTp1 = processExecutionMonitorTick(managed, { positionAmt: 2, openOrders: [], markPrice: 111 }, {});
  assert.equal(managedTp1.reduceOnlyMarketOrders[0].reason, 'tp1', 'managed TP1 reduce-only close 50%');
  assert.equal(managedTp1.reduceOnlyMarketOrders[0].quantity, 1);
  assert.equal(managedTp1.updates.profit_lock_sl_active, true, 'managed profit-lock SL active after TP1');
  assert.equal(managedTp1.updates.replacement_sl_price, 103, 'managed SL moved to +0.3R after TP1');

  const managedTp2 = processExecutionMonitorTick({ ...managed, tp1_closed_at: new Date().toISOString(), profit_lock_sl_active: true, replacement_sl_price: 103, remaining_quantity: 1 }, { positionAmt: 1, openOrders: [], markPrice: 121 }, {});
  assert.equal(managedTp2.reduceOnlyMarketOrders[0].reason, 'tp2', 'managed TP2 closes remaining');
  assert.equal(managedTp2.updates.status, 'closed_tp2');

  const expired = processExecutionMonitorTick({ ...managed, strategy_name: 'MicroScalper', timeframe: '5m', created_at: new Date(Date.now() - 121 * 60_000).toISOString() }, { positionAmt: 2, openOrders: [], markPrice: 101 }, {});
  assert.equal(expired.reduceOnlyMarketOrders[0].reason, 'timeout', 'time-stop closes remaining reduce-only');
  assert.equal(expired.updates.status, 'closed_expired');
  assert.equal(expired.updates.expiry_reason, 'strategy_time_stop_expired');
  assert.equal(typeof computeTimeStopDeadline({ ...managed, strategy_name: 'CompressionBreakout', timeframe: '1h', created_at: '2026-06-08T00:00:00.000Z' }), 'string', 'time-stop deadline is computed');

  const unprotected = processExecutionMonitorTick({ ...base, status: 'entry_filled', protection_status: 'unprotected' }, { positionAmt: 2, openOrders: [], markPrice: 100 }, {});
  assert.equal(unprotected.updates.protection_status, 'pending_protection', 'unprotected open position remains pending until native SL/TP1/TP2 verification succeeds');
  assert.equal(unprotected.updates.last_monitor_action, 'protection_recovery_required');

  const managedSl = processExecutionMonitorTick({ ...managed, tp1_closed_at: new Date().toISOString(), profit_lock_sl_active: true, replacement_sl_price: 103, remaining_quantity: 1 }, { positionAmt: 1, openOrders: [], markPrice: 102 }, {});
  assert.equal(managedSl.reduceOnlyMarketOrders[0].reason, 'sl', 'managed SL closes remaining');
  assert.equal(managedSl.updates.status, 'closed_profit_lock');

  const timedOutEntry = processExecutionMonitorTick({ ...base, created_at: new Date(Date.now() - 3 * 60_000).toISOString() }, { positionAmt: 0, openOrders: [{ orderId: 'entry' }], markPrice: 100 }, { entry: { orderId: 'entry', status: 'NEW' } });
  assert.equal(timedOutEntry.updates.status, 'entry_timeout_cancelled', 'entry_submitted older than 2 minutes is cancelled');
  assert.deepEqual(timedOutEntry.cancelOrderIds, ['entry']);

  const missingEntry = processExecutionMonitorTick({ ...base, binance_entry_order_id: 'missing' }, { positionAmt: 0, openOrders: [], markPrice: 100 }, {});
  assert.equal(missingEntry.updates.status, 'entry_missing_no_position', 'missing entry order with no Binance position is closed as entry_missing_no_position');

  const positionFilledEntry = processExecutionMonitorTick({ ...base, binance_entry_order_id: 'missing' }, { positionAmt: 2, openOrders: [], markPrice: 101 }, {});
  assert.equal(positionFilledEntry.updates.status, 'entry_filled', 'Binance position proves entry fill even when entry order lookup is missing');
  assert.equal(positionFilledEntry.updates.protection_status, 'pending_protection');

  const stale = processExecutionMonitorTick({ ...base, status: 'entry_submitted' }, { positionAmt: 0, openOrders: [], markPrice: 100 }, { entry: { orderId: 'entry', status: 'CANCELED' } });
  assert.equal(stale.updates.status, 'stale_closed', 'stale entry row cleaned when Binance has no position/orders');
  assert.equal(stale.updates.remaining_quantity, 0);

  const closedSynced = processExecutionMonitorTick({ ...native, status: 'protected_native' }, { positionAmt: 0, openOrders: [], markPrice: 100 }, {});
  assert.equal(closedSynced.updates.status, 'closed_manual', 'protected DB row syncs closed when Binance has no position/orders');
  assert.equal(closedSynced.updates.protection_status, 'unprotected');
  assert.equal(closedSynced.updates.remaining_quantity, 0);

  const orphanOrders = processExecutionMonitorTick({ ...native, status: 'protected_native' }, { positionAmt: 0, openOrders: [{ algoId: 'sl' }, { algoId: 'tp1' }, { algoId: 'tp2' }], markPrice: 100 }, {});
  assert.equal(orphanOrders.updates.status, 'closed_manual', 'manual Binance close cancels orphan protection orders and syncs closed');
  assert.deepEqual(orphanOrders.cancelOrderIds.sort(), ['sl', 'tp1', 'tp2'].sort());
  assert.equal(orphanOrders.updates.last_monitor_action, 'orphan_protection_orders_cancelled');

  const activeExposure = processExecutionMonitorTick({ ...base, status: 'protected' }, { positionAmt: 1, openOrders: [], markPrice: 100 }, {});
  assert.equal(activeExposure.updates.protection_status, 'pending_protection', 'active Binance exposure without SL/TP1/TP2 is unsafe and never classified protected');

  assert.equal(calculateProfitLockPrice('buy', 100, 95, 0.3), 101.5, 'long profit lock is +0.3R');
  assert.equal(calculateProfitLockPrice('sell', 100, 105, 0.3), 98.5, 'short profit lock is +0.3R');

  const expiredAfterTp1 = processExecutionMonitorTick({ ...managed, tp1_filled: true, runner_active: true, remaining_quantity: 1, strategy_name: 'MicroScalper', timeframe: '5m', created_at: new Date(Date.now() - 121 * 60_000).toISOString() }, { positionAmt: 1, openOrders: [{ algoId: 'tp2' }, { algoId: 'plsl' }], markPrice: 105 }, {});
  assert.equal(expiredAfterTp1.updates.status, 'closed_expired_after_tp1', 'runner expires separately after TP1');
  assert.deepEqual(expiredAfterTp1.cancelOrderIds.sort(), ['plsl', 'tp2'].sort());

  const directSl = processExecutionMonitorTick(native, { positionAmt: 0, openOrders: [{ algoId: 'tp1' }, { algoId: 'tp2' }], markPrice: 89 }, { sl: { orderId: 'sl', status: 'FILLED' } });
  assert.equal(directSl.updates.status, 'closed_sl', 'direct original SL before TP1 remains full-loss path');

  const profitLockSl = processExecutionMonitorTick({ ...native, tp1_filled: true, sl_replaced_after_tp1: true, profit_lock_sl_active: true }, { positionAmt: 0, openOrders: [{ algoId: 'tp2' }], markPrice: 103 }, { sl: { orderId: 'sl', status: 'FILLED' } });
  assert.equal(profitLockSl.updates.status, 'closed_profit_lock', 'replacement SL after TP1 is classified separately from direct SL');

  assert.equal(classifyExecutionLifecycleOutcome({ status: 'closed_tp2' }), 'win_tp2', 'TP2 is classified as bot win');
  assert.equal(classifyExecutionLifecycleOutcome({ status: 'closed_profit_lock', tp1_filled: true }), 'protected_profit_lock', 'profit-lock SL is not a direct SL loss');
  assert.equal(classifyExecutionLifecycleOutcome({ status: 'closed_sl' }), 'loss_direct_sl', 'direct SL before TP1 is the only normal loss path');
  assert.equal(classifyExecutionLifecycleOutcome({ status: 'closed_expired_after_tp1', tp1_filled: true }), 'expired_after_tp1', 'expiry after TP1 is classified separately');

  const repeatedTp1 = processExecutionMonitorTick({ ...native, tp1_closed_at: new Date().toISOString() }, { positionAmt: 1, openOrders: [
    { algoId: 'sl', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, triggerPrice: 90, origQty: 2 },
    { algoId: 'tp1', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 110, origQty: 1 },
    { algoId: 'tp2', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 120, origQty: 1 },
  ], markPrice: 111 }, { tp1: { orderId: 'tp1', status: 'FINISHED' } });
  assert.equal(repeatedTp1.events.length, 0, 'Telegram update events are emitted only on state changes');

  const missingSl = processExecutionMonitorTick(native, { positionAmt: 2, openOrders: [
    { algoId: 'tp1', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 110, origQty: 1 },
    { algoId: 'tp2', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 120, origQty: 1 },
  ], markPrice: 100 }, {});
  assert.equal(missingSl.updates.status, 'protection_failed', 'missing SL downgrades protected_native immediately');

  const missingTp1 = processExecutionMonitorTick(native, { positionAmt: 2, openOrders: [
    { algoId: 'sl', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, triggerPrice: 90, origQty: 2 },
    { algoId: 'tp2', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 120, origQty: 1 },
  ], markPrice: 100 }, {});
  assert.equal(missingTp1.updates.status, 'protection_failed', 'missing TP1 downgrades protected_native immediately');

  const missingTp2 = processExecutionMonitorTick(native, { positionAmt: 2, openOrders: [
    { algoId: 'sl', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, triggerPrice: 90, origQty: 2 },
    { algoId: 'tp1', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 110, origQty: 1 },
  ], markPrice: 100 }, {});
  assert.equal(missingTp2.updates.status, 'protection_failed', 'missing TP2 downgrades protected_native immediately');

  const recoveredProtection = processExecutionMonitorTick({ ...native, status: 'entry_filled', protection_status: 'pending_protection' }, { positionAmt: 2, openOrders: [
    { algoId: 'sl', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, triggerPrice: 90, origQty: 2 },
    { algoId: 'tp1', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 110, origQty: 1 },
    { algoId: 'tp2', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 120, origQty: 1 },
  ], markPrice: 100 }, {});
  assert.equal(recoveredProtection.updates.protection_status, 'protected_native', 'watchdog verification promotes only complete SL/TP1/TP2 protection');

  const recoveredWithStaleDbIds = processExecutionMonitorTick({ ...native, tp1_algo_id: 'old_tp1', tp2_algo_id: 'old_tp2', sl_algo_id: 'old_sl', status: 'entry_filled', protection_status: 'pending_protection' }, { positionAmt: 2, openOrders: [
    { algoId: 'live_sl', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, triggerPrice: 90, origQty: 2 },
    { algoId: 'live_tp1', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 110, origQty: 1 },
    { algoId: 'live_tp2', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 120, origQty: 1 },
  ], markPrice: 100 }, {});
  assert.equal(recoveredWithStaleDbIds.updates.protection_status, 'protected_native', 'watchdog accepts live Binance conditionals even when stored DB IDs are stale');

  const tp2WhileOpen = processExecutionMonitorTick(native, { positionAmt: 1, openOrders: [
    { algoId: 'sl', side: 'SELL', type: 'STOP_MARKET', reduceOnly: true, triggerPrice: 90, origQty: 2 },
    { algoId: 'tp1', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 110, origQty: 1 },
    { algoId: 'tp2', side: 'SELL', type: 'TAKE_PROFIT_MARKET', reduceOnly: true, triggerPrice: 120, origQty: 1 },
  ], markPrice: 121 }, { tp2: { orderId: 'tp2', status: 'FILLED' } });
  assert.equal(tp2WhileOpen.updates.status, undefined, 'TP2 fill cannot close execution while Binance position remains open');
  assert.equal(tp2WhileOpen.events.some((event) => event.telegram), false, 'TP2 while open does not emit Telegram truth notification');
}

run().then(() => console.log('binance testnet monitor tests passed'));
