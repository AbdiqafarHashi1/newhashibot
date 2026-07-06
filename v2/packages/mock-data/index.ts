export type CustomerProfile = { id: string; name: string; email: string; approvalStatus: 'pending' | 'approved' | 'suspended' | 'expired'; role: 'customer' | 'admin' };

export const emptyCustomerProfile: CustomerProfile = { id: 'current-customer', name: 'Customer', email: 'customer@example.com', approvalStatus: 'approved', role: 'customer' };
export const pendingCustomerProfile: CustomerProfile = { ...emptyCustomerProfile, approvalStatus: 'pending' };
export const emptySubscription = { plan: 'Not active', status: 'pending', renewsOn: null, exnessLinked: false };
export const emptyRuntimeHealth = { marketData: 'waiting-for-scanner', eventBus: 'ready', commandQueue: 'idle', adapters: 'not-configured', HashiCore: 'ready', Scanner: 'not-started', 'Execution Worker': 'not-started', 'Command Queue': 'idle', 'Trade Truth': 'ready', 'Protection Engine': 'ready', 'Recovery Engine': 'ready', 'Telegram Platform': 'not-configured', 'Platform API': 'ready', 'Provider Health': 'waiting-for-connections', 'Customer Executors': 'none-configured', 'Customer Accounts': 'none-connected', queueDepth: 0, workerHeartbeat: null, providerLatencyMs: null, runtimeLatencyMs: null };

export function createMockApiClient(mode: 'production-empty' | 'local-demo' = 'production-empty') {
  const isDemo = mode === 'local-demo';
  const accounts = isDemo ? [{ id: 'local_acct_1', venue: 'Binance Testnet', mode: 'crypto', status: 'connected', equity: null }] : [];
  const executors = isDemo ? [{ id: 'local_exec_1', customerId: 'current-customer', accountId: 'local_acct_1', runtime: 'cloud', provider: 'binance', state: 'Running', health: 'Healthy', queueDepth: 0 }] : [];
  const signals: unknown[] = isDemo ? [{ id: 'local_sig_1', symbol: 'BTCUSDT', direction: 'long', state: 'local-only', confidence: null }] : [];
  const trades: unknown[] = isDemo ? [{ id: 'local_trade_1', symbol: 'BTCUSDT', state: 'local-only', pnl: null }] : [];
  const telegramChannels = isDemo ? [{ id: 'free', name: 'Free Community', health: 'ready' }] : [];
  const approvals: unknown[] = [];
  const protectionStates: unknown[] = [];
  return {
    mode,
    getCustomerProfile: () => emptyCustomerProfile,
    getSubscription: () => emptySubscription,
    listAccounts: () => accounts,
    listExecutors: () => executors.filter((executor: any) => executor.customerId === emptyCustomerProfile.id),
    listAllExecutors: () => executors,
    listSignals: () => signals,
    listTrades: () => trades,
    listTelegramChannels: () => telegramChannels,
    listAdminApprovals: () => approvals,
    getRuntimeHealth: () => emptyRuntimeHealth,
    listProtectionStates: () => protectionStates,
    getMonitoringSummary: () => ({ runtime: emptyRuntimeHealth, executors, alerts: [], capacity: [] })
  };
}

export const mockCustomerProfile = emptyCustomerProfile;
export const mockPendingCustomerProfile = pendingCustomerProfile;
