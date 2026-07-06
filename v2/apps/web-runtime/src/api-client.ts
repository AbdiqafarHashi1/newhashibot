import { createMockApiClient } from '../../../packages/mock-data/index.js';

export const platformActions = [
  'login', 'register_customer', 'submit_mpesa_payment', 'request_account_setup', 'save_customer_preferences', 'request_executor_action', 'request_account_sync', 'request_telegram_test',
  'review_mpesa_payment', 'approve_customer', 'reject_customer', 'suspend_customer', 'activate_subscription', 'update_package', 'approve_account_setup', 'pause_account', 'request_account_clarification', 'assign_executor', 'approve_executor', 'disable_executor', 'create_notification', 'update_system_settings',
  'executor_heartbeat', 'ingest_engine_event', 'audit_log', 'monitoring_summary', 'retention_cleanup', 'dev_reset'
] as const;
export type PlatformAction = typeof platformActions[number];
export type PlatformRequest = { action: PlatformAction; payload: Record<string, unknown> };
export type PlatformResponse = { ok: boolean; success: boolean; action: PlatformAction; requestId?: string; message?: string; error?: string; [key: string]: unknown };
export type TokenProvider = () => string | null | undefined | Promise<string | null | undefined>;
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type V2PlatformApiClientOptions = { platformApiBaseUrl?: string; endpoint?: string; getAuthToken?: TokenProvider; fetchImpl?: FetchLike; mode?: 'real' | 'mock'; onLocalLog?: (request: PlatformRequest) => void };
export type V2PlatformApiClient = ReturnType<typeof createV2PlatformApiClient>;

const mock = createMockApiClient('local-demo');
const emptyReads = {
  getCustomerProfile: () => null,
  getSubscription: () => null,
  listAccounts: () => [],
  listExecutors: () => [],
  listSignals: () => [],
  listTrades: () => [],
  listTelegramChannels: () => [],
  listAdminApprovals: () => [],
  getRuntimeHealth: () => ({ status: 'empty', message: 'No runtime events have been recorded yet.' }),
  listProtectionStates: () => [],
  listAllExecutors: () => [],
  getMonitoringSummary: () => ({ runtime: {}, executors: [], alerts: [], capacity: [], empty: true })
};
const blockedSecretKeys = new Set(['apiKey', 'apiSecret', 'secret', 'password', 'privateKey', 'api_key', 'api_secret', 'credential_value', 'token']);
export function sanitizePlatformPayload(payload: Record<string, unknown>) { return Object.fromEntries(Object.entries(payload).filter(([key]) => !blockedSecretKeys.has(key))); }
function normalizeOptions(input?: string | V2PlatformApiClientOptions): V2PlatformApiClientOptions { return typeof input === 'string' ? { platformApiBaseUrl: input, mode: 'real' } : input ?? {}; }
function targetUrl(base: string) { return base.endsWith('/platform-api') ? base : `${base.replace(/\/$/, '')}/platform-api`; }

export function createV2PlatformApiClient(input?: string | V2PlatformApiClientOptions) {
  const options = normalizeOptions(input);
  const endpoint = options.endpoint ?? options.platformApiBaseUrl ?? '/functions/v1/platform-api';
  const calls: PlatformRequest[] = [];
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  async function request(action: PlatformAction, payload: Record<string, unknown> = {}): Promise<PlatformResponse> {
    const safePayload = sanitizePlatformPayload(payload);
    calls.push({ action, payload: safePayload });
    options.onLocalLog?.({ action, payload: safePayload });
    if (options.mode === 'mock') return { ok: true, success: true, action, requestId: `ui_${action}_${calls.length}`, message: `Mock queued ${action} through ${endpoint}` };
    if (!fetchImpl) return { ok: false, success: false, action, error: 'fetch is not available for V2 platform API client' };
    const token = await options.getAuthToken?.();
    const response = await fetchImpl(targetUrl(endpoint), { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, payload: safePayload }) });
    let body: Record<string, unknown> = {};
    try { body = await response.json() as Record<string, unknown>; } catch { body = {}; }
    if (!response.ok || body.ok === false || body.success === false) return { ok: false, success: false, action, error: String(body.error ?? response.statusText), status: response.status, ...body };
    return { ok: true, success: true, action, status: response.status, ...body };
  }
  const executor = (executor_action: string, payload: Record<string, unknown>) => request('request_executor_action', { ...payload, executor_action });
  return {
    endpoint,
    calls,
    mode: options.mode ?? 'real',
    supportedActions: platformActions,
    request,
    read: {
      customerProfile: (options.mode === 'mock' ? mock : emptyReads).getCustomerProfile,
      subscription: (options.mode === 'mock' ? mock : emptyReads).getSubscription,
      accounts: (options.mode === 'mock' ? mock : emptyReads).listAccounts,
      executors: (options.mode === 'mock' ? mock : emptyReads).listExecutors,
      signals: (options.mode === 'mock' ? mock : emptyReads).listSignals,
      trades: (options.mode === 'mock' ? mock : emptyReads).listTrades,
      telegramChannels: (options.mode === 'mock' ? mock : emptyReads).listTelegramChannels,
      approvals: (options.mode === 'mock' ? mock : emptyReads).listAdminApprovals,
      runtimeHealth: (options.mode === 'mock' ? mock : emptyReads).getRuntimeHealth,
      protectionStates: (options.mode === 'mock' ? mock : emptyReads).listProtectionStates,
      allExecutors: (options.mode === 'mock' ? mock : emptyReads).listAllExecutors,
      monitoringSummary: (options.mode === 'mock' ? mock : emptyReads).getMonitoringSummary
    },
    login: (payload: Record<string, unknown>) => request('login', payload),
    register: (payload: Record<string, unknown>) => request('register_customer', payload),
    registerCustomer: (payload: Record<string, unknown>) => request('register_customer', payload),
    logout: () => Promise.resolve({ ok: true, success: true, action: 'login' as PlatformAction, message: 'frontend session cleared' }),
    submitMpesaPayment: (payload: Record<string, unknown>) => request('submit_mpesa_payment', payload),
    requestAccountSetup: (payload: Record<string, unknown>) => request('request_account_setup', payload),
    reviewManualMpesa: (payload: Record<string, unknown>) => request('review_mpesa_payment', payload),
    reviewMpesaPayment: (payload: Record<string, unknown>) => request('review_mpesa_payment', payload),
    sendTelegramTestMessage: (payload: Record<string, unknown>) => request('request_telegram_test', payload),
    requestExecutorAction: (payload: Record<string, unknown>) => request('request_executor_action', payload),
    savePreferences: (payload: Record<string, unknown>) => request('save_customer_preferences', payload),
    saveCustomerPreferences: (payload: Record<string, unknown>) => request('save_customer_preferences', payload),
    controlBot: (payload: Record<string, unknown>) => request('request_executor_action', { ...payload, executor_action: 'recover_runtime' }),
    controlScanner: (payload: Record<string, unknown>) => request('request_executor_action', { ...payload, executor_action: 'recover_runtime' }),
    startExecutor: (payload: Record<string, unknown>) => executor('start', payload),
    pauseExecutor: (payload: Record<string, unknown>) => executor('pause', payload),
    resumeExecutor: (payload: Record<string, unknown>) => executor('resume', payload),
    stopExecutor: (payload: Record<string, unknown>) => executor('stop', payload),
    restartExecutor: (payload: Record<string, unknown>) => executor('restart', payload),
    recoverExecutor: (payload: Record<string, unknown>) => executor('recovery', payload),
    syncExecutorAccount: (payload: Record<string, unknown>) => request('request_account_sync', payload),
    testExecutorTelegram: (payload: Record<string, unknown>) => request('request_telegram_test', payload),
    approveCustomer: (payload: Record<string, unknown>) => request('approve_customer', payload),
    rejectCustomer: (payload: Record<string, unknown>) => request('reject_customer', payload),
    suspendCustomer: (payload: Record<string, unknown>) => request('suspend_customer', payload),
    activateSubscription: (payload: Record<string, unknown>) => request('activate_subscription', payload),
    updatePackage: (payload: Record<string, unknown>) => request('update_package', payload),
    approveAccountSetup: (payload: Record<string, unknown>) => request('approve_account_setup', payload),
    pauseAccount: (payload: Record<string, unknown>) => request('pause_account', payload),
    requestAccountClarification: (payload: Record<string, unknown>) => request('request_account_clarification', payload),
    assignExecutor: (payload: Record<string, unknown>) => request('assign_executor', payload),
    approveExecutor: (payload: Record<string, unknown>) => request('approve_executor', payload),
    disableExecutor: (payload: Record<string, unknown>) => request('disable_executor', payload),
    createNotification: (payload: Record<string, unknown>) => request('create_notification', payload),
    updateSystemSettings: (payload: Record<string, unknown>) => request('update_system_settings', payload),
    executorHeartbeat: (payload: Record<string, unknown>) => request('executor_heartbeat', payload),
    ingestEngineEvent: (payload: Record<string, unknown>) => request('ingest_engine_event', payload),
    auditLog: (payload: Record<string, unknown>) => request('audit_log', payload),
    monitoringSummary: (payload: Record<string, unknown> = {}) => request('monitoring_summary', payload),
    retentionCleanup: (payload: Record<string, unknown>) => request('retention_cleanup', payload),
    devReset: (payload: Record<string, unknown>) => request('dev_reset', payload)
  };
}
