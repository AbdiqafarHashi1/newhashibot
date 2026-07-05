import { shellLayout, pageHeader, metricCard, card, alertBanner, type NavItem } from '../../packages/ui/index.js';
import { createMockApiClient, mockPendingCustomerProfile } from '../../packages/mock-data/index.js';

export const appName = 'web-customer';
export const status = 'v2-standalone-mock-shell';
export const publicRoutes: NavItem[] = [
  { path: '/', label: 'Landing' }, { path: '/pricing', label: 'Pricing' }, { path: '/results', label: 'Performance' }, { path: '/faq', label: 'FAQ' }, { path: '/affiliate/exness', label: 'Exness Affiliate' }, { path: '/login', label: 'Login' }, { path: '/register', label: 'Register' }
];
export const customerRoutes: NavItem[] = [
  { path: '/app/pending', label: 'Pending Approval' }, { path: '/app/dashboard', label: 'Dashboard' }, { path: '/app/signals', label: 'Signals' }, { path: '/app/accounts', label: 'Accounts' }, { path: '/app/executors', label: 'Executors' }, { path: '/app/risk-profile', label: 'Risk Profile' }, { path: '/app/strategies', label: 'Strategies' }, { path: '/app/billing', label: 'Billing' }, { path: '/app/telegram', label: 'Telegram' }, { path: '/app/support', label: 'Support' }, { path: '/app/settings', label: 'Settings' }
];
const api = createMockApiClient();
export function renderCustomerRoute(path: string) {
  const profile = path === '/app/pending' ? mockPendingCustomerProfile : api.getCustomerProfile();
  const base = { layout: shellLayout(path.startsWith('/app') ? 'customer' : 'public', path.startsWith('/app') ? customerRoutes : publicRoutes), path };
  switch (path) {
    case '/': return { ...base, header: pageHeader('Automated trading intelligence with human-grade controls', 'HashiBot V2'), blocks: [card('Signal Mode', 'Crypto and forex signal workflows inspired by V1 marketing pages.'), card('Execution waits for certification', 'No production Supabase or live trading wiring in this shell.')] };
    case '/pricing': return { ...base, header: pageHeader('Pricing', 'Packages'), blocks: [card('Free', 'Community education and previews'), card('VIP Signals', 'Curated signals and Telegram delivery'), card('VIP Execution', 'Future executor automation after approval')] };
    case '/results': return { ...base, header: pageHeader('Performance and results', 'Proof'), metrics: [metricCard({ label: 'Mock win rate', value: '64%', tone: 'green' }), metricCard({ label: 'Tracked trades', value: String(api.listTrades().length), tone: 'blue' })] };
    case '/faq': return { ...base, header: pageHeader('FAQ', 'Help'), blocks: [card('Is trading live?', 'No. V2 frontend uses mock providers until backend APIs are certified.')] };
    case '/affiliate/exness': return { ...base, header: pageHeader('Exness affiliate placeholder', 'Affiliate'), banner: alertBanner('Pending integration', 'Affiliate verification will be API-driven in a future prompt.', 'amber') };
    case '/login': return { ...base, header: pageHeader('Login', 'Auth'), fields: ['email', 'password'] };
    case '/register': return { ...base, header: pageHeader('Request access', 'Signup'), fields: ['name', 'email', 'package', 'telegram'] };
    default: return { ...base, header: pageHeader(customerRoutes.find(r => r.path === path)?.label ?? 'Customer page', profile.approvalStatus), data: { profile, subscription: api.getSubscription(), accounts: api.listAccounts(), executors: api.listExecutors(), signals: api.listSignals(), trades: api.listTrades(), telegram: api.listTelegramChannels() } };
  }
}
export const routeMap = [...publicRoutes, ...customerRoutes];
