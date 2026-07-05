import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { ExecutorIsolationError, ExecutorManager, buildHealthSnapshot, classifyHealth, createRuntimeMetrics, executorManagerBoundary } from '../../services/executor-manager/index.js';
import { createV2PlatformApiClient } from '../../apps/web-runtime/src/api-client.js';
import { renderAdminRoute } from '../../apps/web-admin/index.js';
import { renderCustomerRoute } from '../../apps/web-customer/index.js';

function manager() {
  const m = new ExecutorManager();
  m.register({ executorId:'exec_a', customerId:'cus_a', accountIds:['acct_a'], provider:'binance', capacity:{ maxAccounts:5, assignedAccounts:1, maxCommandsPerMinute:120, currentCommandsPerMinute:0 }, metadata:{} });
  m.register({ executorId:'exec_b', customerId:'cus_b', accountIds:['acct_b'], provider:'bybit', capacity:{ maxAccounts:5, assignedAccounts:1, maxCommandsPerMinute:120, currentCommandsPerMinute:0 }, metadata:{} });
  return m;
}

test('executor manager enforces customer isolation, ownership, and assignment boundaries', () => {
  const m = manager();
  assert.equal(m.listForCustomer('cus_a').length, 1);
  assert.throws(() => m.getScoped('exec_b', { role:'customer', customerId:'cus_a' }), ExecutorIsolationError);
  assert.equal(m.getScoped('exec_b', { role:'admin' }).customerId, 'cus_b');
  assert.throws(() => m.requestAction('exec_a', 'disable_executor', { actorId:'cus_a', role:'customer', customerId:'cus_a' }), ExecutorIsolationError);
  const assign = m.requestAction('exec_a', 'assign_executor', { actorId:'adm_1', role:'admin' }, { customer_id:'cus_a' });
  assert.equal(assign.status, 'accepted');
  assert.equal(m.getScoped('exec_a', { role:'admin' }).state, 'Provisioning');
});

test('executor lifecycle covers start pause resume stop restart and recovery states without trading logic', () => {
  const m = manager();
  const actor = { actorId:'cus_a', role:'customer' as const, customerId:'cus_a' };
  const expected = [['start','Starting'], ['pause','Paused'], ['resume','Starting'], ['stop','Stopping'], ['restart','Starting'], ['recovery','Recovering']] as const;
  for (const [action, state] of expected) {
    m.requestAction('exec_a', action, actor);
    assert.equal(m.getScoped('exec_a', { role:'admin' }).state, state);
  }
  assert.match(executorManagerBoundary, /no trading/i);
});

test('heartbeat, capacity, provider, worker, queue, and runtime health are classified', () => {
  const m = manager();
  const healthy = createRuntimeMetrics({ executorId:'exec_a', queueDepth:2, providerLatencyMs:200, workerLatencyMs:20, cpuPct:10, memoryMb:256 });
  assert.equal(classifyHealth(healthy), 'Healthy');
  const warning = createRuntimeMetrics({ executorId:'exec_a', queueDepth:25, providerLatencyMs:200 });
  assert.equal(classifyHealth(warning), 'Warning');
  const critical = createRuntimeMetrics({ executorId:'exec_a', queueDepth:101, providerLatencyMs:200 });
  assert.equal(classifyHealth(critical), 'Critical');
  const snapshot = m.heartbeat('exec_a', healthy);
  assert.equal(snapshot.queue.depth, 2);
  assert.equal(snapshot.provider.syncStatus, 'synced');
  assert.equal(snapshot.worker.failures, 0);
  assert.equal(m.summary({ role:'admin' }).capacity[0].maxAccounts, 5);
  assert.equal(buildHealthSnapshot(m.getScoped('exec_a', { role:'admin' }), critical).status, 'Critical');
});

test('platform API client exposes executor action contracts and sanitizes forbidden secrets', async () => {
  const api = createV2PlatformApiClient({ mode: 'mock' });
  await api.startExecutor({ executor_id:'exec_a', password:'hidden' });
  await api.pauseExecutor({ executor_id:'exec_a' });
  await api.resumeExecutor({ executor_id:'exec_a' });
  await api.stopExecutor({ executor_id:'exec_a' });
  await api.restartExecutor({ executor_id:'exec_a' });
  await api.recoverExecutor({ executor_id:'exec_a' });
  await api.syncExecutorAccount({ executor_id:'exec_a' });
  await api.testExecutorTelegram({ executor_id:'exec_a' });
  assert.deepEqual(api.calls.map(c => c.action), ['request_executor_action','request_executor_action','request_executor_action','request_executor_action','request_executor_action','request_executor_action','request_account_sync','request_telegram_test']);
  assert.equal('password' in api.calls[0].payload, false);
});

test('customer and admin UI descriptors expose monitoring center controls', () => {
  const customer: any = renderCustomerRoute('/app/executors');
  for (const action of ['Start','Pause','Resume','Stop','Restart','Recovery','Sync','Telegram Test']) assert.ok(customer.actions.includes(action));
  assert.ok(customer.sections.includes('queue status'));
  const admin: any = renderAdminRoute('/admin/runtime-diagnostics');
  assert.ok(admin.actions.includes('Global Pause'));
  assert.ok(admin.sections.includes('Provider Health'));
  assert.equal((renderAdminRoute('/admin/executors') as any).executors.length, 3);
});

test('edge functions, migrations, RLS, and root isolation are present', () => {
  const files = execSync("find supabase/functions -path '*/index.ts' -print | sort", { encoding:'utf8' });
  for (const name of ['executor-start','executor-stop','executor-pause','executor-resume','executor-restart','executor-recovery','executor-heartbeat','runtime-health','queue-health','provider-health','monitoring-summary']) assert.match(files, new RegExp(`${name}/index.ts`));
  const sql = execSync('cat supabase/migrations/20260705180000_executor_manager_monitoring.sql', { encoding:'utf8' });
  for (const table of ['executor_runtime','executor_events','runtime_health','runtime_metrics','worker_health','provider_health','queue_health','monitoring_alerts','runtime_actions','runtime_statistics','capacity_history','recovery_history']) assert.match(sql, new RegExp(`create table ${table}`));
  assert.match(sql, /enable row level security/);
  const changed = execSync('git diff --name-only HEAD && git ls-files --others --exclude-standard', { encoding:'utf8' }).trim().split('\n').filter(Boolean).filter(file => !file.startsWith('.tmp/'));
  assert.ok(changed.every(file => file.startsWith('v2/') || file.startsWith('packages/') || file.startsWith('services/') || file.startsWith('supabase/') || file.startsWith('tests/') || file.startsWith('apps/') || file.startsWith('docs/') || file.startsWith('deploy/') || file === 'netlify.toml' || file === 'package.json' || file.startsWith('hashibridge/') || file.startsWith('services/')), changed.join('\n'));
});
