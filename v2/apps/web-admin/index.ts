import { shellLayout, pageHeader, metricCard, card, type NavItem } from '../../packages/ui/index.js';
import { createMockApiClient } from '../../packages/mock-data/index.js';
export const appName = 'web-admin';
export const status = 'v2-standalone-mock-shell';
export const adminRoutes: NavItem[] = [
  { path: '/admin/dashboard', label: 'Admin Dashboard' }, { path: '/admin/customers', label: 'Customers' }, { path: '/admin/approvals', label: 'Approvals' }, { path: '/admin/executors', label: 'Executors' }, { path: '/admin/signals', label: 'Signals' }, { path: '/admin/strategies', label: 'Strategies' }, { path: '/admin/telegram', label: 'Telegram Manager' }, { path: '/admin/affiliates', label: 'Affiliate Manager' }, { path: '/admin/billing', label: 'Billing & Subscriptions' }, { path: '/admin/runtime', label: 'Runtime' }, { path: '/admin/monitoring', label: 'Monitoring' }, { path: '/admin/protection', label: 'Protection Center' }, { path: '/admin/recovery', label: 'Recovery Center' }, { path: '/admin/reports', label: 'Reports' }, { path: '/admin/audit-logs', label: 'Audit Logs' }, { path: '/admin/feature-flags', label: 'Feature Flags' }, { path: '/admin/system-settings', label: 'System Settings' }
];
const api = createMockApiClient();
export function renderAdminRoute(path: string) {
  const label = adminRoutes.find(r => r.path === path)?.label ?? 'Admin Page';
  return { layout: shellLayout('admin', adminRoutes), path, header: pageHeader(label, 'Operator Panel'), metrics: [metricCard({ label: 'Approvals', value: String(api.listAdminApprovals().length), tone: 'amber' }), metricCard({ label: 'Executors', value: String(api.listExecutors().length), tone: 'blue' })], data: { approvals: api.listAdminApprovals(), runtime: api.getRuntimeHealth(), protection: api.listProtectionStates(), telegram: api.listTelegramChannels() }, blocks: [card('V2 mock data only', 'This page intentionally avoids V1 raw Supabase table reads and production trading logic.')] };
}
export const routeMap = adminRoutes;
