import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { routeMap as customerRoutes, renderCustomerRoute, requireCustomerSession, roleAwareRedirect } from '../../apps/web-customer/index.js';
import { routeMap as adminRoutes, renderAdminRoute, requireAdminSession } from '../../apps/web-admin/index.js';

const customerPaths = customerRoutes.map(r => r.path);
const adminPaths = adminRoutes.map(r => r.path);

test('public routes cover production website, auth, M-Pesa, and affiliate placeholder', () => {
  for (const path of ['/', '/features', '/pricing', '/results', '/how-it-works', '/faq', '/mpesa', '/affiliate/exness', '/login', '/register', '/logout']) assert.ok(customerPaths.includes(path), path);
  assert.equal(renderCustomerRoute('/').layout.kind, 'public');
  assert.equal((renderCustomerRoute('/results') as any).banner.tone, 'amber');
});

test('auth guards handle role redirects and customer pending state', () => {
  assert.deepEqual(requireAdminSession('customer'), { allowed: false, redirect: '/login' });
  assert.equal(roleAwareRedirect('admin'), '/admin/dashboard');
  assert.equal(roleAwareRedirect('customer', 'pending'), '/app/pending');
  assert.equal(requireCustomerSession({ id: 'x', name: 'P', email: 'p@test', approvalStatus: 'pending', role: 'customer' }).redirect, '/app/pending');
});

test('customer dashboard, billing, M-Pesa, account forms, executors, signals, and trades render', () => {
  for (const path of ['/app/pending', '/app/suspended', '/app/expired', '/app/dashboard', '/app/billing', '/app/accounts', '/app/executors', '/app/signals', '/app/trades', '/app/risk-profile', '/app/telegram', '/app/settings']) assert.ok(customerPaths.includes(path), path);
  assert.equal(renderCustomerRoute('/app/dashboard').layout.kind, 'customer');
  assert.ok((renderCustomerRoute('/app/billing') as any).mpesa.fields.includes('transaction_code'));
  assert.ok((renderCustomerRoute('/app/accounts') as any).forms.binance.length > 0);
  assert.ok((renderCustomerRoute('/app/accounts') as any).cards.some((c: any) => c.venue === 'MT5' && c.status === 'coming-later'));
  assert.ok((renderCustomerRoute('/app/executors') as any).actions.includes('recover-request'));
  assert.ok((renderCustomerRoute('/app/signals') as any).detailFields.includes('reason_codes'));
  assert.ok((renderCustomerRoute('/app/trades') as any).detailFields.includes('closed_result'));
});

test('admin dashboard covers payments, telegram manager, executors, monitoring, protection, signals, and trades', () => {
  for (const path of ['/admin/dashboard','/admin/customers','/admin/approvals','/admin/subscriptions','/admin/mpesa','/admin/packages','/admin/accounts','/admin/executors','/admin/executors/detail','/admin/signals','/admin/trades','/admin/telegram','/admin/telegram/queue','/admin/runtime','/admin/monitoring','/admin/protection','/admin/recovery','/admin/notifications','/admin/audit-logs','/admin/system-settings']) assert.ok(adminPaths.includes(path), path);
  assert.equal(renderAdminRoute('/admin/dashboard').layout.kind, 'admin');
  assert.ok((renderAdminRoute('/admin/mpesa') as any).actions.includes('approve'));
  assert.deepEqual((renderAdminRoute('/admin/telegram') as any).channels, ['FREE','VIP','ADMIN_OPS']);
  assert.ok((renderAdminRoute('/admin/executors/detail') as any).detail.includes('heartbeat'));
  assert.ok((renderAdminRoute('/admin/monitoring') as any).sections.includes('queue metrics'));
  assert.ok((renderAdminRoute('/admin/protection') as any).sections.includes('orphan positions'));
});

test('Step 17 did not add forbidden UI imports or root app changes', () => {
  const changed = execSync('git diff --name-only HEAD && git ls-files --others --exclude-standard', { encoding: 'utf8', cwd: '..' }).trim().split('\n').filter(Boolean);
  assert.ok(changed.every(file => file.startsWith('v2/')), changed.join('\n'));
  for (const expected of ['v2/apps/web-customer/index.ts', 'v2/apps/web-admin/index.ts', 'v2/tests/frontend/step17-ui.test.ts']) assert.ok(execSync(`git ls-files ${expected}`, { encoding: 'utf8', cwd: '..' }).includes(expected) || changed.includes(expected));
  const imports = execSync("rg -n \"(from ['\\\"](.*binance|.*bybit|.*ExchangeProvider|.*tradeManagement|.*strategies)|supabase\\.from|createClient\\()\" v2/apps v2/packages/ui v2/tests/frontend || true", { encoding: 'utf8', cwd: '..' });
  assert.equal(imports.trim(), '');
});
