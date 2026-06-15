import type { ExchangeAccountState, ExchangeBalance, ExchangeOrder, ExchangePosition, ExchangeProvider, ExchangeProviderMetadata, EntryRequest, ProfitLockRequest, ProtectionRequest, ProviderResult, ReconcileRequest, ReplaceStopRequest, SafetyState } from './exchangeProvider.js';
import { calculateProfitLockPrice } from '../binanceTestnetMonitor.js';
import { decideProfitLockAction } from '../binanceTruthExecution.js';

export type BybitCategory = 'linear' | 'inverse';

type BybitConfig = {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  category?: BybitCategory;
  recvWindow?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type BybitResponse<T> = { retCode: number; retMsg: string; result: T; time?: number };

const provider = 'bybit' as const;
const TESTNET_URL = 'https://api-testnet.bybit.com';

function side(side: 'long' | 'short'): 'Buy' | 'Sell' { return side === 'long' ? 'Buy' : 'Sell'; }
function closeSide(sideValue: 'long' | 'short'): 'Buy' | 'Sell' { return sideValue === 'long' ? 'Sell' : 'Buy'; }
function safeNumber(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function jsonQuery(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params).filter(([, value]) => value !== undefined && value !== '').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
}
async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class ExchangeProviderBybit implements ExchangeProvider {
  readonly metadata: ExchangeProviderMetadata = { id: provider, label: 'Bybit USDT Perpetual', environment: 'testnet', supportsNativeProtection: true, supportsProfitLock: true };
  private readonly baseUrl: string;
  private readonly category: BybitCategory;
  private readonly recvWindow: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: BybitConfig = {}) {
    this.baseUrl = config.baseUrl ?? TESTNET_URL;
    if (!this.baseUrl.includes('testnet')) throw new Error('Bybit provider is testnet-only in Phase X-D');
    this.category = config.category ?? 'linear';
    this.recvWindow = config.recvWindow ?? 5000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
  }

  private ensureKeys(): void {
    if (!this.config.apiKey || !this.config.apiSecret) throw new Error('BYBIT_TESTNET_API_KEY and BYBIT_TESTNET_API_SECRET are required');
  }

  private async request<T>(method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}): Promise<T> {
    this.ensureKeys();
    const timestamp = String(this.now());
    const body = method === 'POST' ? JSON.stringify(params) : '';
    const query = method === 'GET' ? jsonQuery(params as Record<string, string | number | boolean | undefined>) : '';
    const payload = `${timestamp}${this.config.apiKey}${this.recvWindow}${method === 'GET' ? query : body}`;
    const signature = await hmacSha256(this.config.apiSecret as string, payload);
    const res = await this.fetchImpl(`${this.baseUrl}${path}${query ? `?${query}` : ''}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-BAPI-API-KEY': this.config.apiKey as string,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': String(this.recvWindow),
        'X-BAPI-SIGN': signature,
      },
      body: method === 'POST' ? body : undefined,
    });
    const data = await res.json() as BybitResponse<T>;
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
    const result = await this.request<{ list?: Array<Record<string, unknown>> }>('GET', '/v5/order/realtime', { category: this.category, symbol, openOnly: 0 });
    return (result.list ?? []).map((row) => ({ providerOrderId: String(row.orderId), symbol: String(row.symbol), side: String(row.side), type: String(row.orderType ?? row.stopOrderType ?? row.orderFilter), status: String(row.orderStatus), quantity: safeNumber(row.qty), price: safeNumber(row.price), triggerPrice: safeNumber(row.triggerPrice), reduceOnly: row.reduceOnly === true || row.reduceOnly === 'true', metadata: row }));
  }

  async placeEntry(request: EntryRequest): Promise<ProviderResult> {
    const result = await this.request<{ orderId: string; orderLinkId?: string }>('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: side(request.side), orderType: request.entryPrice ? 'Limit' : 'Market', qty: String(request.quantity), price: request.entryPrice ? String(request.entryPrice) : undefined, timeInForce: request.entryPrice ? 'GTC' : 'IOC', orderLinkId: request.signalId ? `hb-${request.signalId}-bybit-entry` : undefined });
    return { provider, ok: true, providerOrderId: result.orderId, status: 'entry_submitted', metadata: result };
  }
  async cancelEntry(request: ReconcileRequest): Promise<ProviderResult> {
    const result = await this.request<Record<string, unknown>>('POST', '/v5/order/cancel', { category: this.category, symbol: request.symbol, orderId: request.providerOrderId });
    return { provider, ok: true, providerOrderId: request.providerOrderId, status: 'cancelled', metadata: result };
  }
  async closePosition(request: ReconcileRequest & { quantity?: number; reason?: string }): Promise<ProviderResult> {
    const position = (await this.getPositions()).find((row) => row.symbol === request.symbol);
    if (!position) return { provider, ok: true, status: 'no_position' };
    const result = await this.request<{ orderId: string }>('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: closeSide(position.side === 'long' ? 'long' : 'short'), orderType: 'Market', qty: String(request.quantity ?? position.quantity), reduceOnly: true, timeInForce: 'IOC', orderLinkId: `hb-${request.executionId ?? request.symbol}-bybit-close` });
    return { provider, ok: true, providerOrderId: result.orderId, status: 'close_submitted', metadata: { ...result, reason: request.reason } };
  }
  private async placeProtection(request: ProtectionRequest, label: 'sl' | 'tp1' | 'tp2'): Promise<ProviderResult> {
    const triggerPrice = label === 'sl' ? request.stopLoss : label === 'tp1' ? request.tp1 : request.tp2;
    const result = await this.request<{ orderId: string; orderLinkId?: string }>('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: closeSide(request.side), orderType: 'Market', qty: String(request.quantity), triggerPrice: String(triggerPrice), triggerDirection: request.side === 'long' ? (label === 'sl' ? 2 : 1) : (label === 'sl' ? 1 : 2), reduceOnly: true, orderFilter: 'StopOrder', orderLinkId: `hb-${request.metadata?.executionId ?? request.symbol}-bybit-${label}` });
    return { provider, ok: true, providerOrderId: result.orderId, status: `${label}_submitted`, metadata: { ...result, label } };
  }
  async placeSL(request: ProtectionRequest) { return this.placeProtection(request, 'sl'); }
  async placeTP1(request: ProtectionRequest) { return this.placeProtection(request, 'tp1'); }
  async placeTP2(request: ProtectionRequest) { return this.placeProtection(request, 'tp2'); }
  async verifyProtection(request: ReconcileRequest): Promise<ProviderResult<{ verified: boolean; missing: string[] }>> {
    const open = await this.getOpenOrders(request.symbol);
    const ids = ['sl', 'tp1', 'tp2'].map((label) => String(request.metadata?.[`${label}_order_id`] ?? request.metadata?.[`${label}_algo_id`] ?? '')).filter(Boolean);
    const missing = ids.length === 0 ? ['sl', 'tp1', 'tp2'] : ids.filter((id) => !open.some((order) => order.providerOrderId === id));
    return { provider, ok: missing.length === 0, data: { verified: missing.length === 0, missing }, metadata: { openOrders: open.length } };
  }
  async classifyProtectionState(request: ReconcileRequest): Promise<ProviderResult<{ state: SafetyState; reason: string }>> { return this.classifySafetyState(request); }
  async repairProtection(request: ProtectionRequest): Promise<ProviderResult> { const sl = await this.placeSL(request); const tp1 = await this.placeTP1(request); const tp2 = await this.placeTP2(request); return { provider, ok: sl.ok && tp1.ok && tp2.ok, metadata: { sl, tp1, tp2 } }; }
  async replaceSL(request: ReplaceStopRequest): Promise<ProviderResult> { return this.placeProtection({ symbol: request.symbol, side: request.side, quantity: request.quantity, stopLoss: request.stopLoss, tp1: Number(request.metadata?.tp1 ?? 0), tp2: Number(request.metadata?.tp2 ?? 0), metadata: request.metadata }, 'sl'); }
  async reconcilePosition(request: ReconcileRequest): Promise<ProviderResult> { const positions = await this.getPositions(); return { provider, ok: true, metadata: { positions: positions.filter((position) => position.symbol === request.symbol) } }; }
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
