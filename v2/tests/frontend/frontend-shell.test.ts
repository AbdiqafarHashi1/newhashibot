import test from 'node:test';
import assert from 'node:assert/strict';
import { routeMap as customerRoutes, renderCustomerRoute } from '../../apps/web-customer/index.js';
import { routeMap as adminRoutes, renderAdminRoute } from '../../apps/web-admin/index.js';
import { pageHeader, statusBadge } from '../../packages/ui/index.js';
import { createMockApiClient } from '../../packages/mock-data/index.js';

test('customer route map exists and required pages are reachable', () => {
  const paths = customerRoutes.map(route => route.path);
  for (const path of ['/','/pricing','/results','/faq','/affiliate/exness','/login','/register','/app/pending','/app/dashboard','/app/signals','/app/accounts','/app/executors','/app/risk-profile','/app/strategies','/app/billing','/app/telegram','/app/support','/app/settings']) assert.ok(paths.includes(path), path);
  assert.equal(renderCustomerRoute('/app/dashboard').layout.kind, 'customer');
});

test('admin route map exists and required pages are reachable', () => {
  const paths = adminRoutes.map(route => route.path);
  for (const path of ['/admin/dashboard','/admin/customers','/admin/approvals','/admin/executors','/admin/signals','/admin/strategies','/admin/telegram','/admin/affiliates','/admin/billing','/admin/runtime','/admin/monitoring','/admin/protection','/admin/recovery','/admin/reports','/admin/audit-logs','/admin/feature-flags','/admin/system-settings']) assert.ok(paths.includes(path), path);
  assert.equal(renderAdminRoute('/admin/runtime').layout.kind, 'admin');
});

test('shared UI exports compile and return serializable descriptors', () => {
  assert.equal(pageHeader('Title', 'Eyebrow').component, 'PageHeader');
  assert.equal(statusBadge('Healthy', 'green').tone, 'green');
});

test('mock data providers compile and replace direct Supabase access', () => {
  const api = createMockApiClient();
  assert.equal(api.getCustomerProfile().approvalStatus, 'approved');
  assert.ok(api.listAccounts().length > 0);
  assert.equal(api.getRuntimeHealth().marketData, 'mocked');
});
