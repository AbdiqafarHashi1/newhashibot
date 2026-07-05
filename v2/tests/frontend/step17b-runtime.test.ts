import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { adminPaths, createSession, createV2PlatformApiClient, customerPaths, formsFor, guardRoute, publicPaths, redirectAfterLogin, renderAppToHtml, resolveRoute } from '../../apps/web-runtime/index.js';
import { submitRuntimeForm } from '../../apps/web-runtime/src/components.js';

test('real React runtime renders public routes with shell, navigation, and forms', () => {
  for (const path of publicPaths) {
    const html = renderAppToHtml({ path, session: createSession('visitor') });
    assert.match(html, /HashiBot V2/);
    assert.match(html, /V2 Platform API boundary/);
  }
  assert.match(renderAppToHtml({ path: '/login' }), /<form/);
  assert.match(renderAppToHtml({ path: '/register' }), /Request access/);
});

test('customer routes render through approved session and protected states redirect correctly', () => {
  const approved = createSession('approved_customer', 'ava@example.test');
  for (const path of customerPaths) assert.match(renderAppToHtml({ path, session: approved }), /customer-page|Approval pending|Access limited/);
  assert.deepEqual(resolveRoute('/app/dashboard', createSession('pending_customer')).path, '/app/pending');
  assert.deepEqual(resolveRoute('/app/dashboard', createSession('suspended_customer')).path, '/app/suspended');
  assert.deepEqual(resolveRoute('/app/dashboard', createSession('expired_customer')).path, '/app/expired');
  assert.equal(redirectAfterLogin(createSession('owner')), '/admin/dashboard');
});

test('admin routes render for admin/owner and reject non-admin users', () => {
  for (const path of adminPaths) assert.match(renderAppToHtml({ path, session: createSession('owner') }), /admin-page|Admin/);
  assert.deepEqual(guardRoute('/admin/dashboard', createSession('approved_customer')), { allowed: false, redirect: '/login', reason: 'admin-required' });
});

test('forms call V2 API client boundary and sanitize secrets', async () => {
  const api = createV2PlatformApiClient('/functions/v1/platform-api');
  const cases = [
    ['/login', 'login'], ['/register', 'register'], ['/mpesa', 'submit_mpesa_payment'], ['/app/accounts', 'request_account_setup'], ['/admin/mpesa', 'review_manual_mpesa'], ['/admin/telegram', 'send_telegram_test_message'], ['/admin/executors', 'request_executor_action'], ['/app/settings', 'save_preferences']
  ] as const;
  for (const [path, action] of cases) {
    const [form] = formsFor(path);
    const response = await submitRuntimeForm(api, form, { email: 'user@example.test', password: 'hidden', apiSecret: 'never-render' });
    assert.equal((response as any).action, action);
  }
  assert.equal(api.calls.some(call => Object.keys(call.payload).includes('apiSecret') || Object.keys(call.payload).includes('password')), false);
});

test('M-Pesa and admin approval flows are wired end to end', async () => {
  const api = createV2PlatformApiClient();
  await submitRuntimeForm(api, formsFor('/app/billing')[0], { transaction_code: 'QAB123', amount: 5000 });
  await submitRuntimeForm(api, formsFor('/admin/mpesa')[0], { subscription_id: 'sub_1', decision: 'approve', note: 'paid' });
  assert.deepEqual(api.calls.map(call => call.action), ['submit_mpesa_payment', 'review_manual_mpesa']);
});

test('Telegram manager renders exactly the three default channels and bot/scanner controls render', () => {
  const html = renderAppToHtml({ path: '/admin/telegram', session: createSession('admin') });
  assert.match(html, /FREE/);
  assert.match(html, /VIP/);
  assert.match(html, /ADMIN_OPS/);
  assert.equal((html.match(/<tr/g) ?? []).length, 4);
  const monitoring = renderAppToHtml({ path: '/admin/monitoring', session: createSession('admin') });
  assert.match(monitoring, /control_scanner/);
  assert.match(monitoring, /control_bot/);
});

test('runtime is isolated from root app, root Supabase, exchanges, and trading internals', () => {
  const changed = execSync('git diff --name-only HEAD && git ls-files --others --exclude-standard', { encoding: 'utf8', cwd: '..' }).trim().split('\n').filter(Boolean);
  assert.ok(changed.every(file => file.startsWith('v2/')), changed.join('\n'));
  const forbidden = execSync("rg -n \"(../src/|src/lib/supabase|ExchangeProvider|binanceTruthExecution|tradeManagement|from ['\\\"].*strategies|from ['\\\"].*hashicore|supabase\\.from|createClient\\()\" v2/apps/web-runtime/src || true", { encoding: 'utf8', cwd: '..' });
  assert.equal(forbidden.trim(), '');
});
