import type { ExchangeAccountState, ExchangeBalance, ExchangeOrder, ExchangePosition, ExchangeProvider, ExchangeProviderMetadata, EntryRequest, ProfitLockRequest, ProtectionRequest, ProviderResult, ReconcileRequest, ReplaceStopRequest, SafetyState } from './exchangeProvider.js';
import { calculateProfitLockPrice } from '../binanceTestnetMonitor.js';
import { decideProfitLockAction } from '../binanceTruthExecution.js';

export type BybitCategory = 'linear' | 'inverse';

export type BybitEnvironment = 'demo' | 'testnet' | 'live';

type BybitConfig = {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  environment?: BybitEnvironment;
  category?: BybitCategory;
  recvWindow?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  debugAuth?: boolean;
  logger?: Pick<Console, 'debug'>;
};

type BybitResponse<T> = { retCode: number; retMsg: string; result: T; time?: number };

export type BybitAuthRootCause = 'A_BAD_CREDENTIALS' | 'B_BAD_SIGNING_FORMULA' | 'C_BAD_QUERY_ORDERING' | 'D_BAD_TIMESTAMP' | 'E_BAD_RECV_WINDOW' | 'F_BAD_HEADERS' | 'G_SECRET_MISMATCH' | 'UNKNOWN';

export interface BybitAuthValidationReport {
  auth_ok: boolean;
  root_cause: BybitAuthRootCause | null;
  endpoint: '/v5/account/wallet-balance';
  method: 'GET';
  timestamp: string;
  recv_window: number;
  query_string: string;
  pre_sign_payload_redacted: string;
  header_names: string[];
  signature_length: number;
  response_code: number;
  retCode?: number;
  retMsg?: string;
  key_audit: { exists: boolean; length: number; has_spaces: boolean; has_quotes: boolean; has_line_breaks: boolean };
  secret_audit: { exists: boolean; length: number; has_spaces: boolean; has_quotes: boolean; has_line_breaks: boolean };
  official_contract: 'timestamp + apiKey + recvWindow + queryString';
  exact_reason: string;
}


const provider = 'bybit' as const;
const BYBIT_URLS: Record<BybitEnvironment, string> = { demo: 'https://api-demo.bybit.com', testnet: 'https://api-testnet.bybit.com', live: 'https://api.bybit.com' };

const BYBIT_ORDER_LINK_ID_MAX_LENGTH = 45;
const BYBIT_ORDER_LINK_ID_SHORT_ID_LENGTH = 16;

function sanitizeOrderLinkIdPart(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, BYBIT_ORDER_LINK_ID_SHORT_ID_LENGTH);
}

export function createBybitOrderLinkId(sourceId: unknown, purpose: 'entry' | 'close' | 'sl' | 'tp1' | 'tp2', timestamp: number = Date.now()): string {
  const shortId = sanitizeOrderLinkIdPart(sourceId) || 'na';
  const timestampPart = Math.max(0, Math.floor(timestamp)).toString(36);
  const purposePart = sanitizeOrderLinkIdPart(purpose) || 'ord';
  const orderLinkId = `hb_${shortId}_${purposePart}_${timestampPart}`;
  return orderLinkId.length <= BYBIT_ORDER_LINK_ID_MAX_LENGTH ? orderLinkId : orderLinkId.slice(0, BYBIT_ORDER_LINK_ID_MAX_LENGTH);
}

function side(side: 'long' | 'short'): 'Buy' | 'Sell' { return side === 'long' ? 'Buy' : 'Sell'; }
function closeSide(sideValue: 'long' | 'short'): 'Buy' | 'Sell' { return sideValue === 'long' ? 'Sell' : 'Buy'; }
function safeNumber(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function closeSideMatches(order: ExchangeOrder, requestSide: 'long' | 'short' | string | undefined): boolean {
  if (requestSide !== 'long' && requestSide !== 'short') return true;
  return String(order.side ?? '').toLowerCase() === closeSide(requestSide).toLowerCase();
}
function activeBybitOrder(order: ExchangeOrder): boolean {
  return !['filled', 'cancelled', 'canceled', 'rejected', 'deactivated', 'expired'].includes(String(order.status ?? '').toLowerCase());
}
function nearPrice(a: unknown, b: unknown): boolean {
  const left = safeNumber(a);
  const right = safeNumber(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= Math.max(Math.abs(right) * 0.000001, 1e-8);
}
export function bybitV5QueryString(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}
export async function bybitV5HmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}


function credentialAudit(value: string): { exists: boolean; length: number; has_spaces: boolean; has_quotes: boolean; has_line_breaks: boolean } {
  return { exists: value.length > 0, length: value.length, has_spaces: /\s/.test(value), has_quotes: /['"]/.test(value), has_line_breaks: /[\r\n]/.test(value) };
}

function classifyBybitAuthFailure(status: number, retCode?: number, retMsg?: string, key = '', secret = ''): { root: BybitAuthRootCause; reason: string } {
  const msg = String(retMsg ?? '').toLowerCase();
  if (!key || !secret) return { root: 'A_BAD_CREDENTIALS', reason: 'missing Bybit API key or secret' };
  if (credentialAudit(key).has_spaces || credentialAudit(key).has_quotes || credentialAudit(key).has_line_breaks) return { root: 'A_BAD_CREDENTIALS', reason: 'API key contains spaces, quotes, or line breaks' };
  if (credentialAudit(secret).has_spaces || credentialAudit(secret).has_quotes || credentialAudit(secret).has_line_breaks) return { root: 'G_SECRET_MISMATCH', reason: 'API secret contains spaces, quotes, or line breaks; re-copy the secret exactly from Bybit' };
  if (retCode === 10002 || msg.includes('timestamp')) return { root: 'D_BAD_TIMESTAMP', reason: 'Bybit rejected timestamp/recv-window freshness' };
  if (retCode === 10004 || msg.includes('sign')) return { root: 'G_SECRET_MISMATCH', reason: 'V5 signing formula, sorted query, recv_window, and required headers were used; retCode 10004 therefore indicates the configured secret does not match this key or stale credentials are loaded' };
  if (status === 401 || msg.includes('api key')) return { root: 'A_BAD_CREDENTIALS', reason: 'Bybit rejected API key or account permissions' };
  return { root: 'UNKNOWN', reason: `unclassified Bybit auth response ${retCode ?? status}: ${retMsg ?? ''}`.trim() };
}

export async function validateBybitV5WalletAuth(config: BybitConfig = {}): Promise<BybitAuthValidationReport> {
  const apiKey = config.apiKey ?? '';
  const apiSecret = config.apiSecret ?? '';
  const recvWindow = config.recvWindow ?? 5000;
  const timestamp = String((config.now ?? Date.now)());
  const query = bybitV5QueryString({ accountType: 'UNIFIED' });
  const preSign = `${timestamp}${apiKey}${recvWindow}${query}`;
  const signature = apiSecret ? await bybitV5HmacSha256(apiSecret, preSign) : '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': String(recvWindow), 'X-BAPI-SIGN': signature, 'X-BAPI-SIGN-TYPE': '2' };
  let responseCode = 0;
  let retCode: number | undefined;
  let retMsg: string | undefined;
  try {
    if (!apiKey || !apiSecret) throw new Error('missing Bybit API key or secret');
    const res = await (config.fetchImpl ?? fetch)(`${(config.baseUrl ?? BYBIT_URLS[config.environment ?? 'testnet']).replace(/\/$/, '')}/v5/account/wallet-balance?${query}`, { method: 'GET', headers });
    responseCode = res.status;
    const data = await res.json().catch(() => ({})) as BybitResponse<unknown>;
    retCode = data.retCode;
    retMsg = data.retMsg;
  } catch (error) {
    retMsg = error instanceof Error ? error.message : String(error);
  }
  const ok = responseCode >= 200 && responseCode < 300 && retCode === 0;
  const classified = ok ? null : classifyBybitAuthFailure(responseCode, retCode, retMsg, apiKey, apiSecret);
  return { auth_ok: ok, root_cause: classified?.root ?? null, endpoint: '/v5/account/wallet-balance', method: 'GET', timestamp, recv_window: recvWindow, query_string: query, pre_sign_payload_redacted: preSign.replace(apiKey, '[REDACTED_API_KEY]'), header_names: Object.keys(headers).sort(), signature_length: signature.length, response_code: responseCode, retCode, retMsg, key_audit: credentialAudit(apiKey), secret_audit: credentialAudit(apiSecret), official_contract: 'timestamp + apiKey + recvWindow + queryString', exact_reason: ok ? 'auth_ok=true; Bybit V5 wallet-balance accepted the signature' : classified?.reason ?? 'unknown Bybit auth failure' };
}

export class ExchangeProviderBybit implements ExchangeProvider {
  readonly metadata: ExchangeProviderMetadata;
  private readonly baseUrl: string;
  private readonly category: BybitCategory;
  private readonly recvWindow: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: BybitConfig = {}) {
    const environment = config.environment ?? 'testnet';
    this.metadata = { id: provider, label: 'Bybit USDT Perpetual', environment, supportsNativeProtection: true, supportsProfitLock: true };
    this.baseUrl = config.baseUrl ?? BYBIT_URLS[environment];
    if (environment === 'demo' && !this.baseUrl.includes('api-demo.bybit.com')) throw new Error('Bybit demo provider must use https://api-demo.bybit.com');
    if (environment === 'testnet' && !this.baseUrl.includes('testnet')) throw new Error('Bybit testnet provider must use a testnet domain');
    if (environment === 'live' && (this.baseUrl.includes('testnet') || this.baseUrl.includes('api-demo'))) throw new Error('Bybit live provider must use the mainnet domain');
    this.category = config.category ?? 'linear';
    this.recvWindow = config.recvWindow ?? 5000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
  }

  private ensureKeys(): void {
    if (!this.config.apiKey || !this.config.apiSecret) throw new Error('BYBIT_API_KEY and BYBIT_API_SECRET are required for the configured Bybit environment');
  }

  private async request<T>(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}): Promise<T> {
    this.ensureKeys();
    const timestamp = String(this.now());
    const body = method === 'POST' ? JSON.stringify(params) : '';
    const query = method === 'GET' ? bybitV5QueryString(params as Record<string, string | number | boolean | undefined>) : '';
    const preSign = `${timestamp}${this.config.apiKey}${this.recvWindow}${method === 'GET' ? query : body}`;
    const signature = await bybitV5HmacSha256(this.config.apiSecret as string, preSign);
    if (this.config.debugAuth) {
      (this.config.logger ?? console).debug('Bybit V5 auth debug', {
        endpoint: path,
        method,
        timestamp,
        recv_window: this.recvWindow,
        pre_sign_string: preSign.replace(this.config.apiKey as string, '[REDACTED_API_KEY]'),
        signature_length: signature.length,
      });
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}${query ? `?${query}` : ''}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-BAPI-API-KEY': this.config.apiKey as string,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': String(this.recvWindow),
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
      },
      body: method === 'POST' ? body : undefined,
    });
    const data = await res.json() as BybitResponse<T>;
    (this.config.logger ?? console).debug('Bybit V5 safe debug', { endpoint: path, params, retCode: data.retCode ?? res.status, retMsg: data.retMsg ?? res.statusText });
    if (!res.ok || data.retCode !== 0) throw new Error(`Bybit ${path} failed: ${data.retCode} ${data.retMsg}`);
    return data.result;
  }

  async getAccountState(): Promise<ExchangeAccountState> {
    const [balances, positions, openOrders] = await Promise.all([this.getBalances(), this.getPositions(), this.getOpenOrders()]);
    return { provider, balances, positions, openOrders };
  }
  async getBalances(): Promise<ExchangeBalance[]> {
    const result = await this.request<{ list?: Array<{ coin?: Array<{ coin: string; walletBalance?: string; availableToWithdraw?: string; equity?: string }> }> }>('GET', '/v5/account/wallet-balance', { accountType: 'UNIFIED' });
    return (result.list?.[0]?.coin ?? []).map((coin) => ({ asset: coin.coin, free: safeNumber(coin.availableToWithdraw), total: safeNumber(coin.equity ?? coin.walletBalance) }));
  }
  async getPositions(): Promise<ExchangePosition[]> {
    const result = await this.request<{ list?: Array<Record<string, unknown>> }>('GET', '/v5/position/list', { category: this.category, settleCoin: 'USDT' });
    return (result.list ?? []).filter((row) => safeNumber(row.size) !== 0).map((row) => ({ providerPositionId: String(row.positionIdx ?? row.symbol), symbol: String(row.symbol), side: String(row.side).toLowerCase() === 'buy' ? 'long' : 'short', quantity: safeNumber(row.size), entryPrice: safeNumber(row.avgPrice), markPrice: safeNumber(row.markPrice), unrealizedPnl: safeNumber(row.unrealisedPnl), metadata: row }));
  }
  async getOpenOrders(symbol?: string): Promise<ExchangeOrder[]> {
    const result = await this.request<{ list?: Array<Record<string, unknown>> }>('GET', '/v5/order/realtime', { category: this.category, ...(symbol ? { symbol } : { settleCoin: 'USDT' }), openOnly: 0 });
    return (result.list ?? []).map((row) => ({ providerOrderId: String(row.orderId), symbol: String(row.symbol), side: String(row.side), type: String(row.orderType ?? row.stopOrderType ?? row.orderFilter), status: String(row.orderStatus), quantity: safeNumber(row.qty), price: safeNumber(row.price), triggerPrice: safeNumber(row.triggerPrice), reduceOnly: row.reduceOnly === true || row.reduceOnly === 'true', metadata: row }));
  }

  async fetchAccount() { return this.getAccountState(); }
  async fetchOpenPositions() { return this.getPositions(); }
  async fetchOpenOrders(symbol?: string) { return this.getOpenOrders(symbol); }
  async placeEntryOrder(request: EntryRequest) { return this.placeEntry(request); }
  async placeEntry(request: EntryRequest): Promise<ProviderResult> {
    const result = await this.request<{ orderId: string; orderLinkId?: string }>('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: side(request.side), orderType: request.entryPrice ? 'Limit' : 'Market', qty: String(request.quantity), price: request.entryPrice ? String(request.entryPrice) : undefined, timeInForce: request.entryPrice ? 'GTC' : 'IOC', orderLinkId: request.signalId ? createBybitOrderLinkId(request.signalId, 'entry', this.now()) : undefined });
    return { provider, ok: true, providerOrderId: result.orderId, status: 'entry_submitted', metadata: result };
  }
  async cancelOrder(request: ReconcileRequest) { return this.cancelEntry(request); }
  async cancelEntry(request: ReconcileRequest): Promise<ProviderResult> {
    const result = await this.request<Record<string, unknown>>('POST', '/v5/order/cancel', { category: this.category, symbol: request.symbol, orderId: request.providerOrderId });
    return { provider, ok: true, providerOrderId: request.providerOrderId, status: 'cancelled', metadata: result };
  }
  async closePosition(request: ReconcileRequest & { quantity?: number; reason?: string }): Promise<ProviderResult> {
    const position = (await this.getPositions()).find((row) => row.symbol === request.symbol);
    if (!position) return { provider, ok: true, status: 'no_position' };
    const result = await this.request<{ orderId: string }>('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: closeSide(position.side === 'long' ? 'long' : 'short'), orderType: 'Market', qty: String(request.quantity ?? position.quantity), reduceOnly: true, timeInForce: 'IOC', orderLinkId: createBybitOrderLinkId(request.executionId ?? request.symbol, 'close', this.now()) });
    return { provider, ok: true, providerOrderId: result.orderId, status: 'close_submitted', metadata: { ...result, reason: request.reason } };
  }
  private async placeProtection(request: ProtectionRequest, label: 'sl' | 'tp1' | 'tp2'): Promise<ProviderResult> {
    const triggerPrice = label === 'sl' ? request.stopLoss : label === 'tp1' ? request.tp1 : request.tp2;
    const orderLinkId = createBybitOrderLinkId(request.metadata?.executionId ?? request.symbol, label, this.now());
    const result = await this.request<{ orderId: string; orderLinkId?: string }>('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: closeSide(request.side), orderType: 'Market', qty: String(request.quantity), triggerPrice: String(triggerPrice), triggerDirection: request.side === 'long' ? (label === 'sl' ? 2 : 1) : (label === 'sl' ? 1 : 2), triggerBy: 'MarkPrice', reduceOnly: true, closeOnTrigger: true, orderFilter: 'StopOrder', orderLinkId });
    const open = await this.getOpenOrders(request.symbol);
    const confirmed = open.find((order) => order.providerOrderId === String(result.orderId) || String(order.metadata?.orderLinkId ?? '') === String(result.orderLinkId ?? orderLinkId)) ?? open.find((order) => order.symbol === request.symbol && String(order.side).toLowerCase() === closeSide(request.side).toLowerCase() && Math.abs(Number(order.triggerPrice ?? 0) - Number(triggerPrice)) < 1e-9);
    if (!confirmed) return { provider, ok: false, providerOrderId: result.orderId, status: `${label}_confirmation_missing`, error: 'exchange confirmation missing', metadata: { ...result, orderLinkId, label, openOrders: open.length } };
    return { provider, ok: true, providerOrderId: result.orderId, status: `${label}_submitted`, metadata: { ...result, orderLinkId, label, confirmedStatus: confirmed.status } };
  }
  async placeStopLoss(request: ProtectionRequest) { return this.placeSL(request); }
  async placeSL(request: ProtectionRequest) { return this.placeProtection(request, 'sl'); }
  async placeTP1(request: ProtectionRequest) { return this.placeProtection(request, 'tp1'); }
  async placeTP2(request: ProtectionRequest) { return this.placeProtection(request, 'tp2'); }
  async placeTakeProfit(request: ProtectionRequest, target: 'tp1' | 'tp2') { return target === 'tp1' ? this.placeTP1(request) : this.placeTP2(request); }
  async verifyProtection(request: ReconcileRequest): Promise<ProviderResult<{ verified: boolean; missing: string[] }>> {
    const open = await this.getOpenOrders(request.symbol);
    const metadata = request.metadata ?? {};
    const sideValue = metadata.side === 'long' || metadata.side === 'short' ? metadata.side : undefined;
    const labels = ['sl', 'tp1', 'tp2'] as const;
    const missing = labels.filter((label) => {
      const id = String(metadata[`${label}_order_id`] ?? metadata[`${label}_algo_id`] ?? '').trim();
      const trigger = metadata[label] ?? metadata[`intended_${label}`] ?? metadata[label === 'sl' ? 'stopLoss' : label];
      return !open.some((order) => {
        if (order.symbol !== request.symbol || !activeBybitOrder(order) || order.reduceOnly !== true || !closeSideMatches(order, sideValue)) return false;
        if (id && (order.providerOrderId === id || String(order.metadata?.orderLinkId ?? '') === id)) return true;
        return trigger !== undefined && nearPrice(order.triggerPrice, trigger);
      });
    });
    return { provider, ok: missing.length === 0, data: { verified: missing.length === 0, missing }, metadata: { openOrders: open.length } };
  }
  async classifyProtectionState(request: ReconcileRequest): Promise<ProviderResult<{ state: SafetyState; reason: string }>> { return this.classifySafetyState(request); }
  async repairProtection(request: ProtectionRequest): Promise<ProviderResult> { const sl = await this.placeSL(request); const tp1 = await this.placeTP1(request); const tp2 = await this.placeTP2(request); return { provider, ok: sl.ok && tp1.ok && tp2.ok, metadata: { sl, tp1, tp2 } }; }
  async replaceSL(request: ReplaceStopRequest): Promise<ProviderResult> { return this.placeProtection({ symbol: request.symbol, side: request.side, quantity: request.quantity, stopLoss: request.stopLoss, tp1: Number(request.metadata?.tp1 ?? 0), tp2: Number(request.metadata?.tp2 ?? 0), metadata: request.metadata }, 'sl'); }
  async reconcilePosition(request: ReconcileRequest): Promise<ProviderResult> { const positions = await this.getPositions(); return { provider, ok: true, metadata: { positions: positions.filter((position) => position.symbol === request.symbol) } }; }
  async syncPositionProtection(request: ReconcileRequest) { return this.reconcileProtection(request); }
  async reconcileProtection(request: ReconcileRequest) { return this.verifyProtection(request); }
  async classifySafetyState(request: ReconcileRequest): Promise<ProviderResult<{ state: SafetyState; reason: string }>> {
    const protection = await this.verifyProtection(request);
    const position = (await this.getPositions()).find((row) => row.symbol === request.symbol);
    const state: SafetyState = !position ? 'unknown' : protection.ok ? 'safe' : 'unsafe';
    return { provider, ok: state !== 'unsafe', data: { state, reason: protection.ok ? 'bybit_protection_verified' : 'bybit_protection_missing' }, metadata: protection.metadata };
  }
  async evaluateProfitLock(request: ProfitLockRequest): Promise<ProviderResult<{ shouldLock: boolean; replacementStop?: number; reason: string }>> {
    const action = decideProfitLockAction({ enableProfitLockEngine: request.metadata?.enableProfitLockEngine !== false, enableTestnetProfitLockEngine: request.metadata?.enableTestnetProfitLockEngine !== false, testnetEnabled: true, liveTrading: false, profitLockMinR: Number(request.metadata?.profitLockMinR ?? 0.3), profitLockAggressiveMinR: Number(request.metadata?.profitLockAggressiveMinR ?? 0.5), profitLockBeforeTp1TestnetAllowed: request.metadata?.profitLockBeforeTp1TestnetAllowed === true, profitLockMaxUpdatesPerTrade: Number(request.metadata?.profitLockMaxUpdatesPerTrade ?? 1), profitLockCooldownMinutes: Number(request.metadata?.profitLockCooldownMinutes ?? 15) }, { currentR: Number(request.highestPositiveR ?? 0), currentUnrealizedPnl: Number(request.metadata?.currentUnrealizedPnl ?? 0), tp1Hit: request.metadata?.tp1Hit === true, reversalRisk: (request.metadata?.reversalRisk as 'low' | 'medium' | 'high') ?? 'medium', validSlExists: request.metadata?.validSlExists !== false, existingSlPrice: request.stopLoss, updatesThisTrade: Number(request.metadata?.updatesThisTrade ?? 0), minutesSinceLastUpdate: Number(request.metadata?.minutesSinceLastUpdate ?? 999), stopUpdateAlreadyVerified: request.metadata?.stopUpdateAlreadyVerified === true });
    return { provider, ok: true, data: { shouldLock: action.allowed, replacementStop: action.allowed ? calculateProfitLockPrice(request.side === 'long' ? 'buy' : 'sell', request.entryPrice, request.stopLoss, action.action === 'move_sl_to_be' ? 0 : 0.3) : undefined, reason: action.reason } };
  }
  async executeProfitLock(request: ProfitLockRequest): Promise<ProviderResult> { const decision = await this.evaluateProfitLock(request); if (!decision.data?.shouldLock || !decision.data.replacementStop) return { provider, ok: true, status: 'no_action', metadata: { decision } }; return this.replaceSL({ symbol: request.symbol, side: request.side, quantity: request.quantity, stopLoss: decision.data.replacementStop, reason: 'profit_lock', metadata: request.metadata }); }
}
