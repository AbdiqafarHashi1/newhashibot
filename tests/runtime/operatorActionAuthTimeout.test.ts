import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync('supabase/config.toml', 'utf8');
const admin = readFileSync('supabase/functions/admin-operator-action/index.ts', 'utf8');
const helper = readFileSync('supabase/functions/_shared/operator-invocation.ts', 'utf8');
const auth = readFileSync('supabase/functions/_shared/internal-auth.ts', 'utf8');
const scheduled = readFileSync('supabase/functions/scheduled-market-scanner/index.ts', 'utf8');
const marketScanner = readFileSync('supabase/functions/market-scanner/index.ts', 'utf8');
const binanceExecution = readFileSync('supabase/functions/binance-testnet-execution/index.ts', 'utf8');
const binanceMonitor = readFileSync('supabase/functions/binance-testnet-monitor/index.ts', 'utf8');
const bybitMonitor = readFileSync('supabase/functions/bybit-testnet-monitor/index.ts', 'utf8');
const telegramTest = readFileSync('supabase/functions/telegram-test/index.ts', 'utf8');
const intelligence = readFileSync('supabase/functions/intelligence-engine/index.ts', 'utf8');
const evaluator = readFileSync('supabase/functions/evaluate-signal-outcomes/index.ts', 'utf8');
const ui = readFileSync('src/pages/admin/operator/OperatorPanel.tsx', 'utf8');
const result = readFileSync('src/components/admin/ActionResult.tsx', 'utf8');


function functionVerifyJwt(name: string): string | null {
  const match = config.match(new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = (true|false)`));
  return match?.[1] ?? null;
}

const internalOnlyFunctions = [
  'scheduled-market-scanner',
  'market-scanner',
  'binance-testnet-execution',
  'binance-testnet-monitor',
  'bybit-testnet-monitor',
  'telegram-test',
  'intelligence-engine',
  'evaluate-signal-outcomes',
];

assert.equal(functionVerifyJwt('admin-operator-action'), 'true', 'admin operator action must keep gateway JWT verification');
for (const fn of internalOnlyFunctions) {
  assert.equal(functionVerifyJwt(fn), 'false', `${fn} must allow custom internal secret auth to reach handler`);
}
assert.ok(!config.includes('[functions]\nverify_jwt = false'), 'must not disable JWT globally');

function includesAll(text: string, values: string[]) {
  for (const value of values) assert.ok(text.includes(value), `missing ${value}`);
}

includesAll(admin, ['verifyAdmin', 'return { ok: false, status: 401', 'return { ok: false, status: 403']);
includesAll(helper, ['invokeInternalFunction', 'DEFAULT_OPERATOR_TIMEOUT_MS = 12000', 'controller.abort()', 'x-hashibot-internal-secret']);
assert.ok(!helper.includes('Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'), 'shared helper must not use service-role Authorization bearer');
includesAll(auth, ['UNAUTHORIZED_INVALID_JWT_FORMAT', 'x-hashibot-internal-secret', 'hashibot_internal_secret']);
includesAll(scheduled, ['internalHeaders', 'market-scanner', 'correlation_id', 'action_id']);
includesAll(marketScanner, ['authorizeInternalOrAdmin', 'x-hashibot-internal-secret']);
for (const [name, source] of Object.entries({ scheduled, marketScanner, binanceExecution, binanceMonitor, bybitMonitor, telegramTest, intelligence, evaluator })) {
  assert.ok(source.includes('authorizeInternalOrAdmin'), `${name} must import/apply shared internal auth guard`);
}

const expectedRoutes: Record<string, string> = {
  run_scanner_now: 'scheduled-market-scanner',
  run_supervisor_now: 'binance-testnet-execution',
  run_binance_monitor_now: 'binance-testnet-monitor',
  run_bybit_monitor_now: 'bybit-testnet-monitor',
  repair_protection_now: 'binance-testnet-execution',
  refresh_exchange: 'binance-testnet-execution',
  retry_verification: 'binance-testnet-execution',
  retry_protection: 'binance-testnet-execution',
};
for (const [action, target] of Object.entries(expectedRoutes)) {
  assert.ok(admin.includes(`action === "${action}"`), `${action} route missing`);
  assert.ok(admin.includes(`target: "${target}"`), `${action} target ${target} missing`);
}

includesAll(admin, ['idempotencyKey', 'UNKNOWN_OUTCOME_REQUIRES_RECONCILIATION', 'operator_runtime_events', 'runtimeEventId']);
includesAll(ui, ['session.access_token, 20000', 'disabled={runningAction === action}', 'httpStatus', 'errorCode', 'timedOut', 'authFailed']);
includesAll(result, ['<b>Target:</b>', '<b>HTTP:</b>', '<b>Error code:</b>', '<b>Timed out:</b>', '<b>Auth failed:</b>']);

const forbiddenGlobalJwtDisable = ['verify_jwt = false', 'jwt = false'];
for (const marker of forbiddenGlobalJwtDisable) {
  assert.ok(!admin.includes(marker), `admin should not globally disable JWT: ${marker}`);
}

console.log('operator action auth/timeout static tests passed');
