export type CustomerProfile = { id: string; name: string; email: string; approvalStatus: 'pending' | 'approved'; role: 'customer' | 'admin' };
export const mockCustomerProfile: CustomerProfile = { id: 'cus_mock_001', name: 'Ava Patel', email: 'ava@example.test', approvalStatus: 'approved', role: 'customer' };
export const mockPendingCustomerProfile: CustomerProfile = { ...mockCustomerProfile, id: 'cus_pending_001', approvalStatus: 'pending' };
export const mockSubscription = { plan: 'VIP Execution', status: 'trialing', renewsOn: '2026-08-01', exnessLinked: false };
export const mockAccounts = [{ id: 'acct_binance_1', venue: 'Binance Testnet', mode: 'crypto', status: 'connected', equity: 25000 }, { id: 'acct_mt5_1', venue: 'MT5 Demo', mode: 'forex', status: 'setup-required', equity: 10000 }];
export const mockExecutors = [{ id: 'exec_1', accountId: 'acct_binance_1', runtime: 'cloud', state: 'healthy' }, { id: 'exec_2', accountId: 'acct_mt5_1', runtime: 'hashibridge', state: 'offline' }];
export const mockSignals = [{ id: 'sig_1', symbol: 'BTCUSDT', direction: 'long', state: 'approved', confidence: 82 }, { id: 'sig_2', symbol: 'EURUSD', direction: 'short', state: 'watching', confidence: 71 }];
export const mockTrades = [{ id: 'trd_1', signalId: 'sig_1', symbol: 'BTCUSDT', state: 'managed', pnl: 142.2 }];
export const mockTelegramChannels = [{ id: 'free', name: 'Free Community', health: 'ready' }, { id: 'vip', name: 'VIP Signals', health: 'ready' }, { id: 'admin', name: 'Admin Alerts', health: 'degraded' }];
export const mockAdminApprovals = [{ id: 'apr_1', customer: 'Nina Stone', package: 'VIP Signals', status: 'pending' }, { id: 'apr_2', customer: 'Marco Lee', package: 'Execution', status: 'approved' }];
export const mockRuntimeHealth = { marketData: 'mocked', eventBus: 'planned', commandQueue: 'idle', adapters: 'disabled' };
export const mockProtectionStates = [{ accountId: 'acct_binance_1', desired: 'sl-tp-trailing', actual: 'verified', repairNeeded: false }, { accountId: 'acct_mt5_1', desired: 'not-started', actual: 'offline', repairNeeded: true }];
export function createMockApiClient() { return { getCustomerProfile: () => mockCustomerProfile, getSubscription: () => mockSubscription, listAccounts: () => mockAccounts, listExecutors: () => mockExecutors, listSignals: () => mockSignals, listTrades: () => mockTrades, listTelegramChannels: () => mockTelegramChannels, listAdminApprovals: () => mockAdminApprovals, getRuntimeHealth: () => mockRuntimeHealth, listProtectionStates: () => mockProtectionStates }; }
