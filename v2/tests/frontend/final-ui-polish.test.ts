import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { routeMap as customerRoutes, renderCustomerRoute } from '../../apps/web-customer/index.js';
import { routeMap as adminRoutes, renderAdminRoute } from '../../apps/web-admin/index.js';
import { v2Brand } from '../../packages/ui/index.js';

const customerPaths = customerRoutes.map(route => route.path);
const adminPaths = adminRoutes.map(route => route.path);
const forbiddenProductionWords = /\b(mock|demo|sample|fake testimonial|guaranteed profit|profit claim|P\/L sample)\b/i;

function scan(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

test('repository UI changes remain inside v2 and do not import root clients or trading code', () => {
  const changed = execSync('git diff --name-only HEAD && git ls-files --others --exclude-standard', { encoding: 'utf8', cwd: '..' }).trim().split('\n').filter(Boolean);
  assert.ok(changed.length > 0);
  assert.ok(changed.every(file => file.startsWith('v2/')), changed.join('\n'));
  const forbidden = execSync("rg -n \"(from ['\\\"](\\.\\./){2,}src/|src/lib/supabase|createClient\\(|supabase\\.from|ExchangeProvider|tradeManagement|binanceTruthExecution|root business logic)\" v2/apps v2/packages/ui || true", { encoding: 'utf8', cwd: '..' });
  assert.equal(forbidden.trim(), '');
});

test('HashiBot V2 design system exposes brand, responsive shells, and production components', () => {
  assert.equal(v2Brand.name, 'HashiBot');
  assert.equal(v2Brand.favicon, '/favicon.svg');
  assert.ok(v2Brand.classes.page.includes('bg-zinc-950'));
  assert.ok(v2Brand.classes.mobileNav.includes('md:hidden'));
  assert.ok(v2Brand.auditSummary.doNotReuse.includes('root Supabase clients'));
});

test('public website routes render polished V2 content without unverified claims', () => {
  for (const path of ['/', '/features', '/pricing', '/results', '/how-it-works', '/faq', '/mpesa', '/affiliate/exness', '/login', '/register']) assert.ok(customerPaths.includes(path), path);
  const home = renderCustomerRoute('/');
  assert.equal(home.layout.kind, 'public');
  assert.ok(scan(home).includes('HashiBot 2.0'));
  assert.ok(scan(renderCustomerRoute('/results')).includes('Performance will appear after verified history'));
  for (const path of ['/', '/pricing', '/results', '/faq']) assert.doesNotMatch(scan(renderCustomerRoute(path)), forbiddenProductionWords, path);
});

test('customer portal covers setup, runtime, protection, and professional empty states', () => {
  for (const path of ['/app/dashboard','/app/billing','/app/accounts','/app/binance','/app/bybit','/app/mt5','/app/executors','/app/runtime','/app/health','/app/queue','/app/provider','/app/protection','/app/signals','/app/trades','/app/risk-profile','/app/telegram','/app/settings','/app/support']) assert.ok(customerPaths.includes(path), path);
  assert.ok(scan(renderCustomerRoute('/app/signals')).includes('Scanner has not produced signals yet'));
  assert.ok(scan(renderCustomerRoute('/app/accounts')).includes('Connect Binance, Bybit, or configure MT5'));
  assert.ok(scan(renderCustomerRoute('/app/executors')).includes('Monitoring will populate after scanner/executors run'));
  assert.doesNotMatch(scan(renderCustomerRoute('/app/dashboard')), /P\/L sample|sample trades/i);
});

test('admin operations center includes V2-exclusive production surfaces and reset warnings', () => {
  for (const path of ['/admin/dashboard','/admin/customers','/admin/packages','/admin/subscriptions','/admin/mpesa','/admin/accounts','/admin/exchange-connections','/admin/executors','/admin/runtime','/admin/monitoring','/admin/provider-health','/admin/queue-health','/admin/protection','/admin/recovery','/admin/research','/admin/telegram','/admin/mt5','/admin/hashibridge','/admin/runtime-logs','/admin/audit-logs','/admin/notifications','/admin/system-settings','/admin/deployment-status','/admin/environment-status','/admin/platform-reset','/admin/trade-truth','/admin/command-queue']) assert.ok(adminPaths.includes(path), path);
  assert.ok(scan(renderAdminRoute('/admin/dashboard')).includes('Operations center ready'));
  assert.ok(scan(renderAdminRoute('/admin/platform-reset')).includes('Dangerous owner-only action'));
  assert.ok(scan(renderAdminRoute('/admin/hashibridge')).includes('HashiBridge'));
  assert.ok(scan(renderAdminRoute('/admin/provider-health')).includes('Provider Health'));
});

test('Netlify publish path remains valid', () => {
  const netlify = execSync('cat netlify.toml', { encoding: 'utf8', cwd: '../v2' });
  assert.match(netlify, /publish\s*=\s*"apps\/web-runtime\/dist"/);
});
