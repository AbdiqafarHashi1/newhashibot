import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeExecutionOrderStatus } from '../../src/lib/runtime/executionOrders/index.js';
import { InMemoryWorkerLeaseManager, incidentFingerprint, retryDelayMs } from '../../src/lib/runtime/worker/index.js';
import { RuntimeMonitorEngine } from '../../src/lib/runtime/monitor/index.js';
import { ReportingPipeline, telegramDeliveryKey } from '../../src/lib/runtime/reporting/index.js';

const edgeFiles = [
  'supabase/functions/binance-testnet-execution/index.ts',
  'supabase/functions/binance-testnet-monitor/index.ts',
  'supabase/functions/bybit-testnet-monitor/index.ts',
];
for (const file of edgeFiles) {
  const src = readFileSync(file, 'utf8');
  assert(!/rpc\(\s*["']upsert_trade_management_truth["']/.test(src), `${file} has direct trade truth RPC`);
  assert(!/from\(\s*["']trade_management_truth["']\s*\)\s*\.\s*(insert|update|upsert)/.test(src), `${file} has direct trade truth table mutation`);
  assert(src.includes('../_shared/trade-truth/index.ts'), `${file} does not import shared trade-truth adapter`);
}

assert.equal(normalizeExecutionOrderStatus('entry_submitted').ok, true);
assert.equal(normalizeExecutionOrderStatus('protected_native').ok, false);
const ambiguous = normalizeExecutionOrderStatus('protected_native');
assert.equal(ambiguous.ok ? false : (ambiguous as { ambiguous: boolean }).ambiguous, true);

const leases = new InMemoryWorkerLeaseManager();
assert(leases.acquire('monitor:binance', 'worker-a', 1000, new Date('2026-07-14T00:00:00Z')));
assert.equal(leases.acquire('monitor:binance', 'worker-b', 1000, new Date('2026-07-14T00:00:00.500Z')), null);
assert(leases.acquire('monitor:binance', 'worker-b', 1000, new Date('2026-07-14T00:00:02Z')));
assert.equal(retryDelayMs(3), 2000);
assert.equal(incidentFingerprint(['BINANCE', 'BTCUSDT', 'missing_sl']), 'binance:btcusdt:missing_sl');

const monitor = new RuntimeMonitorEngine();
const observation = monitor.observe({ provider_id: 'binance', environment_id: 'testnet', account_id: 'acct', symbol: 'BTCUSDT', exchange_order_ok: true, exchange_position_ok: true, sl_ok: false, tp_ok: true, execution_truth_ok: true, trade_truth_ok: true, orphan_detected: false, stale_truth: false, observed_at: '2026-07-14T00:00:00Z' });
assert.equal(observation.repair_required, true);

const pipeline = new ReportingPipeline();
const event = pipeline.event({ event_id: 'evt-1', trade_id: 'trade-1', provider_id: 'binance', environment_id: 'testnet', event_type: 'tp1', payload: {}, created_at: '2026-07-14T00:00:00Z' });
assert.equal(event.idempotency_key, 'trade-1:tp1:evt-1');
assert.equal(telegramDeliveryKey(event), 'telegram:trade-1:tp1:evt-1');

console.log('phase3 static tests passed');
