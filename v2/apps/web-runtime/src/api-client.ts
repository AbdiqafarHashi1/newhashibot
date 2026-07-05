import { createMockApiClient } from '../../../packages/mock-data/index.js';

export type PlatformAction =
  | 'login'
  | 'register'
  | 'logout'
  | 'submit_mpesa_payment'
  | 'request_account_setup'
  | 'review_manual_mpesa'
  | 'send_telegram_test_message'
  | 'request_executor_action'
  | 'save_preferences'
  | 'control_bot'
  | 'control_scanner'
  | 'executor_start'
  | 'executor_pause'
  | 'executor_resume'
  | 'executor_stop'
  | 'executor_restart'
  | 'executor_recovery'
  | 'executor_account_sync'
  | 'executor_telegram_test';

export type PlatformRequest = { action: PlatformAction; payload: Record<string, unknown> };
export type PlatformResponse = { ok: true; action: PlatformAction; requestId: string; message: string };
export type V2PlatformApiClient = ReturnType<typeof createV2PlatformApiClient>;

const mock = createMockApiClient();

function sanitize(payload: Record<string, unknown>) {
  const blocked = new Set(['apiKey', 'apiSecret', 'secret', 'password', 'privateKey']);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !blocked.has(key)));
}

export function createV2PlatformApiClient(endpoint = '/functions/v1/platform-api') {
  const calls: PlatformRequest[] = [];
  async function request(action: PlatformAction, payload: Record<string, unknown> = {}): Promise<PlatformResponse> {
    const safePayload = sanitize(payload);
    calls.push({ action, payload: safePayload });
    return { ok: true, action, requestId: `ui_${action}_${calls.length}`, message: `Queued ${action} through ${endpoint}` };
  }
  return {
    endpoint,
    calls,
    read: {
      customerProfile: mock.getCustomerProfile,
      subscription: mock.getSubscription,
      accounts: mock.listAccounts,
      executors: mock.listExecutors,
      signals: mock.listSignals,
      trades: mock.listTrades,
      telegramChannels: mock.listTelegramChannels,
      approvals: mock.listAdminApprovals,
      runtimeHealth: mock.getRuntimeHealth,
      protectionStates: mock.listProtectionStates,
      allExecutors: mock.listAllExecutors,
      monitoringSummary: mock.getMonitoringSummary
    },
    login: (payload: Record<string, unknown>) => request('login', payload),
    register: (payload: Record<string, unknown>) => request('register', payload),
    logout: () => request('logout'),
    submitMpesaPayment: (payload: Record<string, unknown>) => request('submit_mpesa_payment', payload),
    requestAccountSetup: (payload: Record<string, unknown>) => request('request_account_setup', payload),
    reviewManualMpesa: (payload: Record<string, unknown>) => request('review_manual_mpesa', payload),
    sendTelegramTestMessage: (payload: Record<string, unknown>) => request('send_telegram_test_message', payload),
    requestExecutorAction: (payload: Record<string, unknown>) => request('request_executor_action', payload),
    savePreferences: (payload: Record<string, unknown>) => request('save_preferences', payload),
    controlBot: (payload: Record<string, unknown>) => request('control_bot', payload),
    controlScanner: (payload: Record<string, unknown>) => request('control_scanner', payload),
    startExecutor: (payload: Record<string, unknown>) => request('executor_start', payload),
    pauseExecutor: (payload: Record<string, unknown>) => request('executor_pause', payload),
    resumeExecutor: (payload: Record<string, unknown>) => request('executor_resume', payload),
    stopExecutor: (payload: Record<string, unknown>) => request('executor_stop', payload),
    restartExecutor: (payload: Record<string, unknown>) => request('executor_restart', payload),
    recoverExecutor: (payload: Record<string, unknown>) => request('executor_recovery', payload),
    syncExecutorAccount: (payload: Record<string, unknown>) => request('executor_account_sync', payload),
    testExecutorTelegram: (payload: Record<string, unknown>) => request('executor_telegram_test', payload)
  };
}
