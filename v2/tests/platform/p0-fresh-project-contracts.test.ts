import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { formsFor } from '../../apps/web-runtime/src/pages.js';
import { createV2PlatformApiClient, platformActions, sanitizePlatformPayload } from '../../apps/web-runtime/src/api-client.js';
import { submitRuntimeForm } from '../../apps/web-runtime/src/components.js';

const migrationsDir = 'supabase/migrations';
const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const migrations = migrationFiles.map(file => ({ file, sql: readFileSync(join(migrationsDir, file), 'utf8') }));
const allSql = migrations.map(m => `-- ${m.file}\n${m.sql}`).join('\n');
const platformApi = readFileSync('supabase/functions/platform-api/index.ts', 'utf8');
const apiClient = readFileSync('apps/web-runtime/src/api-client.ts', 'utf8');

function firstIndex(pattern: RegExp) {
  const index = allSql.search(pattern);
  assert.notEqual(index, -1, `missing ${pattern}`);
  return index;
}

test('fresh-project base migration creates V2-owned profiles packages and helpers before policy usage', () => {
  assert.equal(migrationFiles[0], '20260705080000_v2_platform_base_fresh_project.sql');
  assert.match(allSql, /CREATE TABLE IF NOT EXISTS public\.profiles/i);
  assert.match(allSql, /CREATE TABLE IF NOT EXISTS public\.packages/i);
  for (const helper of ['current_profile_id','current_platform_role','is_owner','is_admin','is_operator','is_platform_operator','is_platform_owner','platform_customer_id']) assert.match(allSql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${helper}\\(`, 'i'));
  assert.ok(firstIndex(/CREATE OR REPLACE FUNCTION public\.is_admin\(/i) < firstIndex(/public\.is_admin\(\)/i), 'is_admin is defined before policy use');
  assert.ok(firstIndex(/CREATE TABLE IF NOT EXISTS public\.packages/i) < firstIndex(/ALTER TABLE public\.packages ADD COLUMN/i), 'packages table exists before Step 15 alters it');
  assert.ok(firstIndex(/CREATE TABLE IF NOT EXISTS public\.profiles/i) < firstIndex(/ALTER TABLE public\.profiles ADD COLUMN/i), 'profiles table exists before Step 15 alters it');
});

test('platform RLS baseline covers UI/API domains without provider secret exposure', () => {
  for (const table of ['profiles','packages','customers','customer_profiles','customer_preferences','subscriptions','customer_accounts','provider_credentials','customer_executors','notifications','audit_log','system_settings','engine_events']) {
    assert.match(allSql, new RegExp(`['\"]${table}['\"]|ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY|alter table ${table} enable row level security`, 'i'), `${table} has RLS baseline coverage`);
  }
  assert.match(allSql, /provider_credentials_operator_only/i);
  assert.match(allSql, /platform_customer_own_select/i);
  assert.match(allSql, /system_settings_owner_write/i);
  assert.doesNotMatch(allSql, /CREATE TABLE IF NOT EXISTS public\.v2_trade_truth[\s\S]*CREATE TABLE IF NOT EXISTS public\.v2_trade_truth/i, 'trade truth is not duplicated');
  assert.doesNotMatch(allSql, /CREATE TABLE IF NOT EXISTS public\.v2_execution_commands[\s\S]*CREATE TABLE IF NOT EXISTS public\.v2_execution_commands/i, 'command queue is not duplicated');
});

test('platform-api supports every production-shaped UI action and contains no trading operations', () => {
  for (const action of platformActions) assert.match(platformApi, new RegExp(`['\"]${action}['\"]`), `platform-api supports ${action}`);
  for (const legacy of ['customer_registration','manual_mpesa_review','review_manual_mpesa','save_preferences','send_telegram_test_message','executor_start']) assert.doesNotMatch(platformApi, new RegExp(`action === ['\"]${legacy}['\"]`), `${legacy} action branch removed`);
  assert.doesNotMatch(platformApi, /submitOrder|placeOrder|createOrder|executeTrade|from ['"].*hashicore|from ['"].*strategies|from ['"].*binance|from ['"].*bybit/i);
});

test('UI forms map only to supported platform-api contracts', async () => {
  const api = createV2PlatformApiClient({ mode: 'mock' });
  const expected = new Map<string, string[]>([
    ['/register', ['register_customer']], ['/mpesa', ['submit_mpesa_payment']], ['/app/billing', ['submit_mpesa_payment']], ['/app/accounts', ['request_account_setup']], ['/app/settings', ['save_customer_preferences']], ['/admin/mpesa', ['review_mpesa_payment']], ['/admin/telegram', ['request_telegram_test']], ['/admin/executors', ['request_executor_action']], ['/admin/customers', ['approve_customer']], ['/admin/packages', ['update_package']], ['/admin/accounts', ['approve_account_setup','request_account_clarification']], ['/admin/system-settings', ['update_system_settings']]
  ]);
  for (const [path, actions] of expected) {
    const forms = formsFor(path);
    assert.deepEqual(forms.map(f => f.id), actions, path);
    for (const form of forms) {
      const response = await submitRuntimeForm(api, form, { email:'u@example.test', customer_id:'cus_1', account_id:'acct_1', subscription_id:'sub_1', package_code:'vip', provider:'binance', transaction_code:'QAB123', key:'maintenance_mode', password:'secret' });
      assert.ok(platformActions.includes((response as any).action), `${path} returned supported action`);
    }
  }
  assert.equal(api.calls.some(call => 'password' in call.payload), false);
});

test('real fetch-based client sends expected shape auth header and handles errors', async () => {
  const requests: { input: string | URL | Request; init?: RequestInit }[] = [];
  const okFetch = async (input: string | URL | Request, init?: RequestInit) => { requests.push({ input, init }); return new Response(JSON.stringify({ ok:true, success:true, action:'register_customer', customer_id:'cus_1' }), { status: 200, headers: { 'Content-Type':'application/json' } }); };
  const api = createV2PlatformApiClient({ platformApiBaseUrl: '/functions/v1', getAuthToken: () => 'session-token', fetchImpl: okFetch });
  const response = await api.registerCustomer({ email:'u@example.test', password:'hidden' });
  assert.equal(response.ok, true);
  assert.equal(String(requests[0].input), '/functions/v1/platform-api');
  assert.equal((requests[0].init?.headers as Record<string,string>).Authorization, 'Bearer session-token');
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { action:'register_customer', payload:{ email:'u@example.test' } });

  const badApi = createV2PlatformApiClient({ platformApiBaseUrl: '/functions/v1', fetchImpl: async () => new Response(JSON.stringify({ ok:false, success:false, error:'boom' }), { status: 400, headers: { 'Content-Type':'application/json' } }) });
  const bad = await badApi.submitMpesaPayment({ transaction_code:'QAB123' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'boom');
  assert.deepEqual(sanitizePlatformPayload({ apiSecret:'x', password:'y', credential_value:'z', label:'safe' }), { label:'safe' });
});

test('UI API client keeps security import boundaries and mock is explicit local-only mode', () => {
  assert.match(apiClient, /mode\?: 'real' \| 'mock'/);
  assert.match(apiClient, /fetchImpl|globalThis\.fetch/);
  assert.doesNotMatch(apiClient, /\.\.\/\.\.\/\.\.\/\.\.\/src|src\/lib\/supabase|createClient\(|from ['"].*execution|from ['"].*hashicore|from ['"].*strategies|from ['"].*binance|from ['"].*bybit|from ['"].*mt5/i);
});
