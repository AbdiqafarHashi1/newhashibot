import React from 'react';
import { renderCustomerRoute } from '../../web-customer/index.js';
import { renderAdminRoute } from '../../web-admin/index.js';
import type { Session } from './auth.js';
import type { V2PlatformApiClient } from './api-client.js';
import { ButtonLink, Card, DataTable, EmptyState, FeatureGrid, MetricCard, RuntimeForm, StatusBadge, type FormModel } from './components.js';

type PageContext = { path: string; session: Session; api: V2PlatformApiClient };
type Descriptor = Record<string, any>;

export function formsFor(path: string): FormModel[] {
  if (path === '/login') return [{ id: 'login', title: 'Login', submitLabel: 'Sign in', fields: [{ name: 'email', label: 'Email', type: 'email' }, { name: 'password', label: 'Password', type: 'password' }], submit: (api, values) => api.login(values) }];
  if (path === '/register') return [{ id: 'register_customer', title: 'Register', submitLabel: 'Request access', fields: [{ name: 'full_name', label: 'Full name' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'package', label: 'Package' }, { name: 'telegram_handle', label: 'Telegram handle' }], submit: (api, values) => api.registerCustomer(values) }];
  if (path === '/mpesa' || path === '/app/billing') return [{ id: 'submit_mpesa_payment', title: 'Submit M-Pesa payment', submitLabel: 'Submit for review', fields: [{ name: 'transaction_code', label: 'Transaction code' }, { name: 'amount', label: 'Amount', type: 'number' }, { name: 'reference_or_screenshot', label: 'Reference or screenshot URL' }], submit: (api, values) => api.submitMpesaPayment(values) }];
  if (['/app/accounts','/app/binance','/app/bybit','/app/mt5'].includes(path)) return [{ id: 'request_account_setup', title: 'Request secure exchange setup', submitLabel: 'Request admin setup', fields: [{ name: 'provider', label: 'Provider' }, { name: 'environment', label: 'Demo/testnet/live' }, { name: 'credential_reference', label: 'Secure credential reference' }], submit: (api, values) => api.requestAccountSetup(values) }];
  if (path.startsWith('/admin/mpesa') || path === '/admin/billing') return [{ id: 'review_mpesa_payment', title: 'Review M-Pesa payment', submitLabel: 'Submit decision', fields: [{ name: 'subscription_id', label: 'Subscription ID' }, { name: 'decision', label: 'Approve/reject/clarify' }, { name: 'note', label: 'Operator note' }], submit: (api, values) => api.reviewMpesaPayment(values) }];
  if (path.startsWith('/admin/telegram')) return [{ id: 'request_telegram_test', title: 'Send Telegram test message', submitLabel: 'Send test', fields: [{ name: 'channel', label: 'FREE/VIP/ADMIN_OPS' }, { name: 'message', label: 'Message' }], submit: (api, values) => api.testExecutorTelegram(values) }];
  if (path === '/admin/approvals' || path === '/admin/customers') return [{ id: 'approve_customer', title: 'Approve customer', submitLabel: 'Approve customer', fields: [{ name: 'customer_id', label: 'Customer ID' }, { name: 'reason', label: 'Operator note' }], submit: (api, values) => api.approveCustomer(values) }];
  if (path === '/admin/packages') return [{ id: 'update_package', title: 'Update package', submitLabel: 'Save package', fields: [{ name: 'package_code', label: 'Package code' }, { name: 'name', label: 'Package name' }, { name: 'price', label: 'Price', type: 'number' }], submit: (api, values) => api.updatePackage(values) }];
  if (path === '/admin/accounts') return [{ id: 'approve_account_setup', title: 'Approve account setup', submitLabel: 'Approve account', fields: [{ name: 'account_id', label: 'Account ID' }, { name: 'note', label: 'Operator note' }], submit: (api, values) => api.approveAccountSetup(values) }, { id: 'request_account_clarification', title: 'Request account clarification', submitLabel: 'Request clarification', fields: [{ name: 'account_id', label: 'Account ID' }, { name: 'note', label: 'Clarification note' }], submit: (api, values) => api.requestAccountClarification(values) }];
  if (path === '/admin/system-settings') return [{ id: 'update_system_settings', title: 'Update system settings', submitLabel: 'Save setting', fields: [{ name: 'key', label: 'Setting key' }, { name: 'value', label: 'JSON value' }], submit: (api, values) => api.updateSystemSettings(values) }];
  if (path.includes('executors')) return [{ id: 'request_executor_action', title: 'Executor action request', submitLabel: 'Queue action', fields: [{ name: 'executor_id', label: 'Executor ID' }, { name: 'action', label: 'pause/start/stop/recover' }], submit: (api, values) => api.requestExecutorAction(values) }];
  if (path.endsWith('/settings')) return [{ id: 'save_customer_preferences', title: 'Save preferences', submitLabel: 'Save', fields: [{ name: 'timezone', label: 'Timezone' }, { name: 'risk_mode', label: 'Risk mode' }], submit: (api, values) => api.saveCustomerPreferences(values) }];
  return [];
}

const text = (value: any) => typeof value === 'string' ? value : value?.body ?? value?.message ?? value?.description ?? '';
function Header({ d, fallback }: { d: Descriptor; fallback: string }) { return React.createElement('div', { className: 'hb-page-head' }, React.createElement('p', { className: 'hb-eyebrow' }, d.header?.eyebrow ?? d.guard ?? 'HashiBot V2'), React.createElement('h1', null, d.header?.title ?? fallback), d.banner ? React.createElement(StatusBadge, { label: d.banner.title, tone: d.banner.tone }) : null); }
function Metrics({ d }: { d: Descriptor }) { return d.metrics?.length ? React.createElement('div', { className: 'hb-grid hb-grid-4' }, d.metrics.map((m: any) => React.createElement(MetricCard, { key: m.label, label: m.label, value: String(m.value), tone: m.tone, helper: m.empty ? 'Live data pending' : undefined }))) : null; }
function Forms({ path }: { path: string }) { const forms = formsFor(path); return forms.length ? React.createElement('div', { className: 'hb-grid hb-grid-2' }, forms.map(form => React.createElement(RuntimeForm, { key: form.id, model: form }))) : null; }
function DescriptorSections({ d }: { d: Descriptor }) {
  const items = [...(d.blocks ?? []), ...(d.sections ?? [])].map((item: any, i: number) => typeof item === 'string' ? { title: item, body: 'Ready for live V2 platform data.' } : { title: item.title ?? `Section ${i + 1}`, body: text(item) || 'Ready for live V2 platform data.' });
  return items.length ? React.createElement(FeatureGrid, { items }) : null;
}
function DescriptorTable({ d, api, path }: { d: Descriptor; api: V2PlatformApiClient; path: string }) {
  if (d.table?.columns) return React.createElement(DataTable, { columns: d.table.columns, rows: d.table.rows ?? [], emptyMessage: d.table.empty?.title ?? d.empty?.title ?? 'No records yet' });
  if (path.includes('signals')) return React.createElement(DataTable, { columns: ['symbol','state','confidence'], rows: api.read.signals() as any, emptyMessage: 'No signals generated yet' });
  if (path.includes('trades')) return React.createElement(DataTable, { columns: ['symbol','state','pnl'], rows: api.read.trades() as any, emptyMessage: 'No trades yet' });
  return null;
}

export function PublicPage({ path, api }: PageContext) {
  const d: Descriptor = renderCustomerRoute(path);
  const hero = path === '/' ? React.createElement('section', { className: 'hb-hero' }, React.createElement('div', null, React.createElement('p', { className: 'hb-eyebrow' }, 'Trading operations platform'), React.createElement('h1', null, d.header?.title ?? 'HashiBot 2.0'), React.createElement('p', null, d.hero?.trust ?? 'Signals, execution visibility, M-Pesa onboarding, and operator-grade monitoring.'), React.createElement('div', { className: 'hb-actions' }, React.createElement(ButtonLink, { label: d.hero?.ctaPrimary ?? 'Create account', href: '/register', variant: 'primary' }), React.createElement(ButtonLink, { label: d.hero?.ctaSecondary ?? 'View pricing', href: '/pricing' }))), React.createElement('div', { className: 'hb-hero-card' }, React.createElement('strong', null, 'Production-empty by default'), React.createElement('span', null, 'No invented balances, profits, testimonials, or trades.'))) : null;
  return React.createElement('main', { className: 'page public-page' }, hero ?? React.createElement(Header, { d, fallback: 'HashiBot V2' }), React.createElement(Metrics, { d }), React.createElement(DescriptorSections, { d }), React.createElement(Forms, { path }), path === '/mpesa' ? React.createElement(EmptyState, { title: 'Manual M-Pesa review', message: 'Submit payment details for operator review; no fake subscription state is shown.' }) : null, React.createElement('small', { className: 'hb-api' }, `API boundary: ${api.endpoint}`));
}

export function CustomerPage({ path, api }: PageContext) {
  const d: Descriptor = renderCustomerRoute(path);
  return React.createElement('main', { className: 'page customer-page' }, React.createElement(Header, { d, fallback: 'Customer' }), React.createElement(Metrics, { d }), path.includes('telegram') ? null : React.createElement(DescriptorTable, { d, api, path }), React.createElement(DescriptorSections, { d }), React.createElement(Forms, { path }), d.empty ? React.createElement(EmptyState, { title: d.empty.title, message: d.empty.message }) : null);
}

export function AdminPage({ path, api }: PageContext) {
  const d: Descriptor = renderAdminRoute(path);
  const actions = (d.actions ?? []).slice(0, 8).map((a: string) => ({ label: a, action: a.toLowerCase().replaceAll(' ', '_') }));
  if (path.includes('monitoring') || path.includes('runtime')) actions.unshift({ label: 'Pause scanner', action: 'control_scanner' }, { label: 'Restart bot', action: 'control_bot' });
  return React.createElement('main', { className: 'page admin-page' }, React.createElement(Header, { d, fallback: 'Admin' }), React.createElement(Metrics, { d }), actions.length ? React.createElement(Card, { title: 'Operator actions', actions }, React.createElement('p', null, 'Actions enqueue V2 platform requests and preserve engine boundaries.')) : null, path.includes('telegram') ? React.createElement(Card, { title: 'Telegram channels' }, React.createElement(DataTable, { columns: ['channel'], rows: (d.channels ?? ['FREE','VIP','ADMIN_OPS']).map((channel: string) => ({ channel })) })) : null, path.includes('telegram') ? null : React.createElement(DescriptorTable, { d, api, path }), React.createElement(DescriptorSections, { d }), React.createElement(Forms, { path }), d.empty ? React.createElement(EmptyState, { title: d.empty.title, message: d.empty.message }) : null);
}
