import assert from 'node:assert/strict';
import { computeTimeStopDeadline, evaluateMonitorGates, processExecutionMonitorTick } from '../../src/lib/binanceTestnetMonitor.js';

async function run() {
  assert.deepEqual(evaluateMonitorGates({ EXECUTION_MODE: 'testnet', TESTNET_ENABLED: true, LIVE_TRADING_ENABLED: true }, { execution_mode: 'testnet', testnet_enabled: true, kill_switch_enabled: false }), { allowed: false, reason: 'live_trading_enabled_abort' }, 'monitor aborts if live trading is enabled');
  assert.deepEqual(evaluateMonitorGates({ EXECUTION_MODE: 'testnet', TESTNET_ENABLED: false, LIVE_TRADING_ENABLED: false }, { execution_mode: 'testnet', testnet_enabled: true, kill_switch_enabled: false }), { allowed: false, reason: 'env_testnet_disabled' }, 'monitor skips when testnet disabled');

  const base = { id: 'e1', symbol: 'BTCUSDT', direction: 'buy' as const, status: 'entry_submitted', binance_entry_order_id: 'entry', volume: 2, entry_price: 100, intended_sl: 90, intended_tp1: 110, intended_tp2: 120 };
  const entry = processExecutionMonitorTick(base, { positionAmt: 2, openOrders: [], markPrice: 101 }, { entry: { orderId: 'entry', status: 'FILLED', avgPrice: '100.5' } });
  assert.equal(entry.updates.status, 'entry_filled', 'entry fill detection');
  assert.equal(entry.updates.entry_price, 100.5);
  assert.equal(entry.events.length, 1);

  const native = { ...base, status: 'protected_native', protection_status: 'protected_native', bracket_mode: 'exchange_native', tp1_algo_id: 'tp1', tp2_algo_id: 'tp2', sl_algo_id: 'sl' };
  const nativeTp1 = processExecutionMonitorTick(native, { positionAmt: 1, openOrders: [], markPrice: 111 }, { tp1: { orderId: 'tp1', status: 'FINISHED' } });
  assert.equal(nativeTp1.updates.status, 'partially_closed', 'native TP1 partial close detection');
  assert.equal(nativeTp1.updates.sl_moved_to_be, true);

  const nativeTp2 = processExecutionMonitorTick({ ...native, tp1_closed_at: new Date().toISOString() }, { positionAmt: 0, openOrders: [{ algoId: 'sl' }], markPrice: 121 }, { tp2: { orderId: 'tp2', status: 'FILLED' } });
  assert.equal(nativeTp2.updates.status, 'closed_tp', 'native TP2 close detection');
  assert.deepEqual(nativeTp2.cancelOrderIds, ['sl']);

  const nativeSl = processExecutionMonitorTick(native, { positionAmt: 0, openOrders: [{ algoId: 'tp1' }, { algoId: 'tp2' }], markPrice: 89 }, { sl: { orderId: 'sl', status: 'FILLED' } });
  assert.equal(nativeSl.updates.status, 'closed_sl', 'native SL close detection');
  assert.deepEqual(nativeSl.cancelOrderIds, ['tp1', 'tp2']);

  const managed = { ...base, status: 'protected_managed', bracket_mode: 'managed_exit_fallback', protection_status: 'protected_managed', remaining_quantity: 2, tp1_quantity: 1 };
  const managedTp1 = processExecutionMonitorTick(managed, { positionAmt: 2, openOrders: [], markPrice: 111 }, {});
  assert.equal(managedTp1.reduceOnlyMarketOrders[0].reason, 'tp1', 'managed TP1 reduce-only close 50%');
  assert.equal(managedTp1.reduceOnlyMarketOrders[0].quantity, 1);
  assert.equal(managedTp1.updates.sl_moved_to_be, true, 'managed SL moved to BE after TP1');

  const managedTp2 = processExecutionMonitorTick({ ...managed, tp1_closed_at: new Date().toISOString(), sl_moved_to_be: true, remaining_quantity: 1 }, { positionAmt: 1, openOrders: [], markPrice: 121 }, {});
  assert.equal(managedTp2.reduceOnlyMarketOrders[0].reason, 'tp2', 'managed TP2 closes remaining');
  assert.equal(managedTp2.updates.status, 'closed_tp');

  const expired = processExecutionMonitorTick({ ...managed, strategy_name: 'MicroScalper', timeframe: '5m', created_at: new Date(Date.now() - 121 * 60_000).toISOString() }, { positionAmt: 2, openOrders: [], markPrice: 101 }, {});
  assert.equal(expired.reduceOnlyMarketOrders[0].reason, 'timeout', 'time-stop closes remaining reduce-only');
  assert.equal(expired.updates.status, 'closed_timeout');
  assert.equal(typeof computeTimeStopDeadline({ ...managed, strategy_name: 'CompressionBreakout', timeframe: '1h', created_at: '2026-06-08T00:00:00.000Z' }), 'string', 'time-stop deadline is computed');

  const unprotected = processExecutionMonitorTick({ ...base, status: 'entry_filled', protection_status: 'unprotected' }, { positionAmt: 2, openOrders: [], markPrice: 100 }, {});
  assert.equal(unprotected.updates.protection_status, 'unprotected_failed', 'unprotected open position warning');

  const managedSl = processExecutionMonitorTick({ ...managed, tp1_closed_at: new Date().toISOString(), sl_moved_to_be: true, remaining_quantity: 1 }, { positionAmt: 1, openOrders: [], markPrice: 99 }, {});
  assert.equal(managedSl.reduceOnlyMarketOrders[0].reason, 'sl', 'managed SL closes remaining');
  assert.equal(managedSl.updates.status, 'closed_sl');

  const stale = processExecutionMonitorTick({ ...base, status: 'protected' }, { positionAmt: 0, openOrders: [], markPrice: 100 }, {});
  assert.equal(stale.updates.status, 'stale_closed', 'stale DB active row cleaned when Binance has no position/orders');
  assert.equal(stale.updates.stale_cleanup_reason, 'binance_truth_no_position_no_orders');

  const activeExposure = processExecutionMonitorTick({ ...base, status: 'protected' }, { positionAmt: 1, openOrders: [], markPrice: 100 }, {});
  assert.equal(activeExposure.updates.status, undefined, 'active Binance exposure blocks cleanup');

  const repeatedTp1 = processExecutionMonitorTick({ ...native, tp1_closed_at: new Date().toISOString() }, { positionAmt: 1, openOrders: [], markPrice: 111 }, { tp1: { orderId: 'tp1', status: 'FINISHED' } });
  assert.equal(repeatedTp1.events.length, 0, 'Telegram update events are emitted only on state changes');
}

run().then(() => console.log('binance testnet monitor tests passed'));
