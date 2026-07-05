import { alertBanner, card, dataTable, emptyState, formField, metricCard, pageHeader, shellLayout, statusBadge, type NavItem } from '../../packages/ui/index.js';
import { createMockApiClient, mockPendingCustomerProfile } from '../../packages/mock-data/index.js';

export const appName = 'web-customer';
export const status = 'v2-production-ui-descriptor';
export const apiBoundary = 'V2 platform APIs only: no direct exchange, Supabase table, or engine-internal calls';
export const publicRoutes: NavItem[] = [
  { path: '/', label: 'Home' }, { path: '/features', label: 'Features' }, { path: '/pricing', label: 'Pricing' }, { path: '/results', label: 'Performance' }, { path: '/how-it-works', label: 'How it works' }, { path: '/faq', label: 'FAQ' }, { path: '/mpesa', label: 'M-Pesa' }, { path: '/affiliate/exness', label: 'Exness' }, { path: '/login', label: 'Login' }, { path: '/register', label: 'Register' }, { path: '/logout', label: 'Logout' }
];
export const customerRoutes: NavItem[] = [
  { path: '/app/pending', label: 'Pending Approval' }, { path: '/app/suspended', label: 'Suspended' }, { path: '/app/expired', label: 'Expired' }, { path: '/app/dashboard', label: 'Overview' }, { path: '/app/billing', label: 'Subscription & M-Pesa' }, { path: '/app/accounts', label: 'Accounts' }, { path: '/app/executors', label: 'Executors' }, { path: '/app/signals', label: 'Signals' }, { path: '/app/trades', label: 'Trades' }, { path: '/app/risk-profile', label: 'Risk Profile' }, { path: '/app/strategies', label: 'Strategies' }, { path: '/app/telegram', label: 'Telegram' }, { path: '/app/settings', label: 'Settings' }, { path: '/app/support', label: 'Support' }
];
export const routeMap = [...publicRoutes, ...customerRoutes];
const api = createMockApiClient();
const layoutFor = (path: string) => shellLayout(path.startsWith('/app') ? 'customer' : 'public', path.startsWith('/app') ? customerRoutes : publicRoutes);
export function requireCustomerSession(profile = api.getCustomerProfile()) { return profile.role === 'customer' && profile.approvalStatus === 'approved' ? { allowed: true, redirect: null } : { allowed: false, redirect: '/app/pending' }; }
export function roleAwareRedirect(role: 'customer'|'admin'|'visitor', approvalStatus = 'approved') { if (role === 'admin') return '/admin/dashboard'; if (role === 'customer') return approvalStatus === 'approved' ? '/app/dashboard' : '/app/pending'; return '/login'; }
function publicPage(path: string) {
  const base = { layout: layoutFor(path), path, guard: 'public' };
  if (path === '/') return { ...base, header: pageHeader('HashiBot V2 automated trading control room', 'Public'), blocks: [card('Customer-ready signals', 'Clean signal, risk, and Telegram delivery experience backed by V2 platform contracts.'), card('Operator oversight', 'Every account, executor, payment, and alert is visible before automation is enabled.'), card('No direct exchange access in UI', 'Frontend submits setup requests to V2 platform APIs and never exposes secrets.')] };
  if (path === '/features') return { ...base, header: pageHeader('Features', 'Platform'), blocks: [card('Signals & trade history', 'Strategy, grade, confidence, entry, SL, TP, reason codes, execution and protection status.'), card('Protection monitoring', 'Unprotected trades, orphan positions, recovery events, and admin alerts.'), card('Manual M-Pesa workflow', 'No gateway; transaction references are reviewed by operators.')] };
  if (path === '/pricing') return { ...base, header: pageHeader('Pricing and packages', 'Packages'), blocks: [card('Free', 'Community Telegram channel and education.'), card('VIP Signals', 'Signal dashboard, VIP channel delivery, and trade journal.'), card('VIP Execution', 'Account setup requests, executor visibility, and risk governance after approval.')] };
  if (path === '/results') return { ...base, header: pageHeader('Performance track record', 'Future verified stats'), banner: alertBanner('Verification pending', 'Connected to future real V2 stats; mock values are labelled placeholders.', 'amber'), metrics: [metricCard({ label: 'Tracked sample trades', value: String(api.listTrades().length), tone: 'blue' }), metricCard({ label: 'Verified live record', value: 'Coming soon', tone: 'zinc' })] };
  if (path === '/how-it-works') return { ...base, header: pageHeader('How it works', 'Flow'), blocks: [card('1. Register', 'Request access and select a package.'), card('2. Pay manually', 'Submit M-Pesa code and amount for review.'), card('3. Connect accounts safely', 'Request secure credential setup without exposing secrets in the browser.'), card('4. Monitor execution', 'Use dashboards for signals, trades, protection, and Telegram preferences.')] };
  if (path === '/mpesa') return { ...base, header: pageHeader('Manual M-Pesa payments', 'No Daraja gateway'), fields: [formField('mpesa_code', 'Transaction code'), formField('amount', 'Amount', 'number'), formField('reference', 'Screenshot/reference URL', 'url')], blocks: [card('Review process', 'Admins approve, reject, or request clarification before subscription activation.')] };
  if (path === '/faq') return { ...base, header: pageHeader('FAQ', 'Support'), blocks: [card('Do you support MT5?', 'MT5 is displayed as future/coming later only.'), card('Are secrets shown?', 'No. Credentials are requested through secure setup workflows only.'), card('Do you call Binance or Bybit from the UI?', 'No. The UI only uses V2 platform API boundaries.')] };
  if (path === '/affiliate/exness') return { ...base, header: pageHeader('Exness affiliate placeholder', 'Planned'), banner: alertBanner('Coming later', 'Placeholder only because affiliate is part of product planning.', 'amber') };
  if (path === '/login') return { ...base, header: pageHeader('Login', 'Auth'), fields: [formField('email', 'Email', 'email'), formField('password', 'Password', 'password')], redirect: roleAwareRedirect('customer') };
  if (path === '/register') return { ...base, header: pageHeader('Register', 'Auth'), fields: [formField('full_name','Full name'), formField('email','Email','email'), formField('package','Requested package'), formField('telegram_handle','Telegram handle')] };
  return { ...base, header: pageHeader('Logout', 'Auth'), action: 'clear-session-and-return-home' };
}
export function renderCustomerRoute(path: string) {
  if (!path.startsWith('/app')) return publicPage(path);
  const profile = path === '/app/pending' ? mockPendingCustomerProfile : api.getCustomerProfile();
  const subscription = api.getSubscription();
  const accounts = api.listAccounts();
  const binance = accounts.filter(a => a.venue.toLowerCase().includes('binance'));
  const bybit = [{ id: 'acct_bybit_request', venue: 'Bybit Testnet', mode: 'crypto', status: 'setup-requested', equity: 0 }];
  const base = { layout: layoutFor(path), path, guard: 'customer', auth: requireCustomerSession(profile), header: pageHeader(customerRoutes.find(r => r.path === path)?.label ?? 'Customer', profile.approvalStatus) };
  if (path === '/app/pending') return { ...base, banner: alertBanner('Approval pending', 'Your account is waiting for operator review.', 'amber') };
  if (path === '/app/suspended' || path === '/app/expired') return { ...base, banner: alertBanner('Access limited', 'Renew or contact support before using customer tools.', 'red') };
  if (path === '/app/accounts') return { ...base, forms: { binance: [formField('account_label','Binance account label'), formField('environment','Demo/testnet/live'), formField('credential_reference','Secure credential reference')], bybit: [formField('account_label','Bybit account label'), formField('environment','Demo/testnet/live'), formField('credential_reference','Secure credential reference')] }, warnings: ['Enable read/trade permissions only; never withdrawal permissions.', 'Secrets are never displayed back to the frontend.'], cards: [...binance, ...bybit, { id: 'mt5_future', venue: 'MT5', status: 'coming-later' }], actions: ['request-admin-setup','pause-or-disconnect-request'] };
  if (path === '/app/billing') return { ...base, subscription, daysRemaining: 27, mpesa: { status: 'pending', fields: ['transaction_code','amount','reference_or_screenshot'], renewalRequest: true } };
  if (path === '/app/executors') return { ...base, executors: api.listExecutors(), actions: ['pause-request','start-request','stop-request','recover-request'] };
  if (path === '/app/signals') return { ...base, table: dataTable([{ key:'symbol', header:'Symbol' }, { key:'confidence', header:'Confidence' }], api.listSignals()), detailFields: ['strategy','grade','confidence','entry','stop_loss','take_profit','reason_codes'] };
  if (path === '/app/trades') return { ...base, table: dataTable([{ key:'symbol', header:'Symbol' }, { key:'state', header:'Execution' }, { key:'pnl', header:'P/L' }], api.listTrades()), detailFields: ['protection_status','execution_status','closed_result'] };
  return { ...base, metrics: [metricCard({ label: 'Subscription', value: subscription.status, tone: 'green' }), metricCard({ label: 'Days remaining', value: '27', tone: 'blue' }), metricCard({ label: 'P/L sample', value: '$142.20', tone: 'green' })], data: { profile, subscription, accounts: [...binance, ...bybit], executors: api.listExecutors(), signals: api.listSignals(), trades: api.listTrades(), telegramPreferences: api.listTelegramChannels(), riskProfile: 'balanced', tradeProtection: api.listProtectionStates() }, empty: emptyState('No live MT5 bridge', 'MT5 is intentionally future/coming later.') };
}
