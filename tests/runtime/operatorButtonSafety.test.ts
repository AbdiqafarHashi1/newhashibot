import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync('supabase/functions/admin-operator-action/index.ts', 'utf8');
const execution = readFileSync('supabase/functions/binance-testnet-execution/index.ts', 'utf8');
const ownership = readFileSync('supabase/functions/_shared/execution-ownership.ts', 'utf8');
const ui = readFileSync('src/pages/admin/MissionControl.tsx', 'utf8');
const mt5 = readFileSync('supabase/functions/mt5-bridge/index.ts', 'utf8');

for (const action of ['run_scanner_now','run_monitor_now','run_supervisor_now','run_runtime_proof','reconcile_runtime','resume_bot','pause_entries','verify_protection','run_recovery_now','sync_providers','emergency_stop_runtime']) {
  assert.ok(backend.includes(`"${action}"`), `backend action missing: ${action}`);
  assert.ok(ui.includes(`'${action}'`), `button action missing: ${action}`);
}
assert.match(backend, /target: "bybit-demo-execution"/);
assert.match(backend, /target: "binance-testnet-execution"/);
assert.ok(!backend.includes('target: "binance-testnet-execution", payload: { action: "prove_bybit'));
assert.match(ownership, /\.eq\("is_operational", true\)/);
assert.match(ownership, /no_operational_account:\$\{provider\}:\$\{environment\}/);
assert.match(ownership, /selection\?\.customerId && selection\?\.accountId/);
assert.match(execution, /read_only: true, mutations_attempted: 0/);
assert.match(execution, /proveProviderReadOnly/);
assert.match(backend, /confirmation_required:\$\{action\}/);
assert.match(backend, /remains_active: \["scanner", "monitoring", "protection", "reconciliation", "mt5_agent"\]/);
assert.match(backend, /actions_taken: \[\]/);
assert.match(ui, /disabled=\{Boolean\(runningAction\)\}/);
assert.match(ui, /data\.success === true/);
assert.ok(!backend.match(/apiKey|apiSecret|api_key|api_secret/), 'operator response layer must not handle credentials');
assert.match(mt5, /mt5_commands/);
assert.ok(!backend.includes('mt5_commands'), 'operator runtime must not claim MT5 commands');
console.log('operator button routing and safety tests passed');
