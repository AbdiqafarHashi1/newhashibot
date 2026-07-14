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

const migration1Preflight = readFileSync('supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract/01_preflight.sql', 'utf8');
const migration1Apply = readFileSync('supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract/02_apply_and_verify.sql', 'utf8');
const migration2Apply = readFileSync('supabase/migrations/prepared/20260714001000_phase3_runtime_read_models/02_apply_and_verify.sql', 'utf8');
const migration3Apply = readFileSync('supabase/migrations/prepared/20260714002000_final_runtime_safety/02_apply_and_verify.sql', 'utf8');
const migration4Apply = readFileSync('supabase/migrations/prepared/20260714003000_final_cron_consolidation/02_apply_and_verify.sql', 'utf8');
const reconciliationDoc = readFileSync('docs/implementation/HASHIBOT_ALL_MIGRATIONS_PREFLIGHT_RECONCILIATION.md', 'utf8');

const repositoryKnownExecutionStatuses = [
  'pending', 'entry_pending', 'new', 'placed', 'entry_submitted', 'submitted', 'open', 'working',
  'entry_accepted', 'partial', 'partially_filled', 'complete', 'completed', 'entry_filled', 'filled',
  'entry_timeout_cancelled', 'canceled', 'cancelled', 'rejected', 'expired', 'entry_missing_no_position',
  'failed', 'error', 'unknown', 'skipped', 'closed_synced', 'protected_native', 'protected_managed',
  'pending_protection', 'protection_pending', 'pending_managed_protection', 'protection_failed',
  'protection_recovered', 'partially_closed', 'closed_tp', 'closed_tp2', 'closed_sl', 'closed_profit_lock',
  'closed_timeout', 'closed_expired', 'closed_manual', 'stale_closed', 'repair_succeeded', 'monitor_synced',
];

for (const status of repositoryKnownExecutionStatuses) {
  assert.ok(reconciliationDoc.includes(`\`${status}\``), `status not classified in reconciliation doc: ${status}`);
}

for (const [legacy, canonical] of [
  ['entry_pending', 'created'],
  ['entry_submitted', 'submitted'],
  ['entry_accepted', 'accepted'],
  ['entry_filled', 'filled'],
  ['entry_timeout_cancelled', 'cancelled'],
  ['entry_missing_no_position', 'expired'],
]) {
  assert.ok(migration1Preflight.includes(`('${legacy}', '${canonical}')`), `preflight missing safe mapping ${legacy}`);
  assert.ok(migration1Apply.includes(`('${legacy}', '${canonical}')`), `apply missing safe mapping ${legacy}`);
}

for (const unsafeStatus of ['skipped', 'closed_synced', 'protected_native', 'protected_managed', 'pending_protection', 'protection_failed', 'partially_closed', 'closed_tp2', 'closed_sl', 'closed_profit_lock', 'repair_succeeded', 'monitor_synced']) {
  assert.ok(!migration1Apply.includes(`('${unsafeStatus}',`), `unsafe status must not be silently mapped: ${unsafeStatus}`);
}

for (const preflightPath of [
  'supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract/01_preflight.sql',
  'supabase/migrations/prepared/20260714001000_phase3_runtime_read_models/01_preflight.sql',
  'supabase/migrations/prepared/20260714002000_final_runtime_safety/01_preflight.sql',
  'supabase/migrations/prepared/20260714003000_final_cron_consolidation/01_preflight.sql',
]) {
  const preflight = readFileSync(preflightPath, 'utf8').replace(/--.*$/gm, '');
  assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL)\b/i.test(preflight), `${preflightPath} must remain read-only`);
}

for (const applyPath of [
  'supabase/migrations/prepared/20260714000000_phase3_execution_orders_contract/02_apply_and_verify.sql',
  'supabase/migrations/prepared/20260714001000_phase3_runtime_read_models/02_apply_and_verify.sql',
  'supabase/migrations/prepared/20260714002000_final_runtime_safety/02_apply_and_verify.sql',
  'supabase/migrations/prepared/20260714003000_final_cron_consolidation/02_apply_and_verify.sql',
]) {
  const apply = readFileSync(applyPath, 'utf8');
  assert.ok(apply.includes('SECTION 2'), `${applyPath} missing forward section`);
  assert.ok(apply.includes('SECTION 3'), `${applyPath} missing postflight section`);
  assert.ok(!apply.includes('SECTION 4: ROLLBACK') && !apply.includes('SECTION 4 — ROLLBACK'), `${applyPath} must not contain rollback`);
}

assert.ok(migration2Apply.includes('required table/column preflight failed for runtime read models'), 'Migration 2 must block missing required schema');
assert.ok(migration2Apply.includes('GRANT SELECT ON public.admin_active_trade_truth_read_model TO service_role'), 'Migration 2 admin views should be service_role only');
assert.ok(!migration2Apply.includes('TO authenticated, service_role'), 'Migration 2 must not broaden authenticated access');
assert.ok(migration3Apply.includes('incompatible populated runtime safety object'), 'Migration 3 must block incompatible populated runtime objects');
assert.ok(migration4Apply.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Migration 4 must require service role Vault secret');
assert.ok(migration4Apply.includes('runtime_acquire_worker_lease'), 'Migration 4 must require lease RPC');
