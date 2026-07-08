import { calculateProfitLockPrice } from '../binanceTestnetMonitor.js';
import { decideProfitLockAction } from '../binanceTruthExecution.js';
const provider = 'bybit';
const BYBIT_URLS = { demo: 'https://api-demo.bybit.com', testnet: 'https://api-testnet.bybit.com', live: 'https://api.bybit.com' };
const BYBIT_ORDER_LINK_ID_MAX_LENGTH = 45;
const BYBIT_ORDER_LINK_ID_SHORT_ID_LENGTH = 16;
function sanitizeOrderLinkIdPart(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, BYBIT_ORDER_LINK_ID_SHORT_ID_LENGTH);
}
export function createBybitOrderLinkId(sourceId, purpose, timestamp = Date.now()) {
    const shortId = sanitizeOrderLinkIdPart(sourceId) || 'na';
    const timestampPart = Math.max(0, Math.floor(timestamp)).toString(36);
    const purposePart = sanitizeOrderLinkIdPart(purpose) || 'ord';
    const orderLinkId = `hb_${shortId}_${purposePart}_${timestampPart}`;
    return orderLinkId.length <= BYBIT_ORDER_LINK_ID_MAX_LENGTH ? orderLinkId : orderLinkId.slice(0, BYBIT_ORDER_LINK_ID_MAX_LENGTH);
}
function side(side) { return side === 'long' ? 'Buy' : 'Sell'; }
function closeSide(sideValue) { return sideValue === 'long' ? 'Sell' : 'Buy'; }
function safeNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
export function bybitV5QueryString(params) {
    return Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
}
export async function bybitV5HmacSha256(secret, payload) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function credentialAudit(value) {
    return { exists: value.length > 0, length: value.length, has_spaces: /\s/.test(value), has_quotes: /['"]/.test(value), has_line_breaks: /[\r\n]/.test(value) };
}
function classifyBybitAuthFailure(status, retCode, retMsg, key = '', secret = '') {
    const msg = String(retMsg ?? '').toLowerCase();
    if (!key || !secret)
        return { root: 'A_BAD_CREDENTIALS', reason: 'missing Bybit API key or secret' };
    if (credentialAudit(key).has_spaces || credentialAudit(key).has_quotes || credentialAudit(key).has_line_breaks)
        return { root: 'A_BAD_CREDENTIALS', reason: 'API key contains spaces, quotes, or line breaks' };
    if (credentialAudit(secret).has_spaces || credentialAudit(secret).has_quotes || credentialAudit(secret).has_line_breaks)
        return { root: 'G_SECRET_MISMATCH', reason: 'API secret contains spaces, quotes, or line breaks; re-copy the secret exactly from Bybit' };
    if (retCode === 10002 || msg.includes('timestamp'))
        return { root: 'D_BAD_TIMESTAMP', reason: 'Bybit rejected timestamp/recv-window freshness' };
    if (retCode === 10004 || msg.includes('sign'))
        return { root: 'G_SECRET_MISMATCH', reason: 'V5 signing formula, sorted query, recv_window, and required headers were used; retCode 10004 therefore indicates the configured secret does not match this key or stale credentials are loaded' };
    if (status === 401 || msg.includes('api key'))
        return { root: 'A_BAD_CREDENTIALS', reason: 'Bybit rejected API key or account permissions' };
    return { root: 'UNKNOWN', reason: `unclassified Bybit auth response ${retCode ?? status}: ${retMsg ?? ''}`.trim() };
}
export async function validateBybitV5WalletAuth(config = {}) {
    const apiKey = config.apiKey ?? '';
    const apiSecret = config.apiSecret ?? '';
    const recvWindow = config.recvWindow ?? 5000;
    const timestamp = String((config.now ?? Date.now)());
    const query = bybitV5QueryString({ accountType: 'UNIFIED' });
    const preSign = `${timestamp}${apiKey}${recvWindow}${query}`;
    const signature = apiSecret ? await bybitV5HmacSha256(apiSecret, preSign) : '';
    const headers = { 'Content-Type': 'application/json', 'X-BAPI-API-KEY': apiKey, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': String(recvWindow), 'X-BAPI-SIGN': signature, 'X-BAPI-SIGN-TYPE': '2' };
    let responseCode = 0;
    let retCode;
    let retMsg;
    try {
        if (!apiKey || !apiSecret)
            throw new Error('missing Bybit API key or secret');
        const res = await (config.fetchImpl ?? fetch)(`${(config.baseUrl ?? BYBIT_URLS[config.environment ?? 'testnet']).replace(/\/$/, '')}/v5/account/wallet-balance?${query}`, { method: 'GET', headers });
        responseCode = res.status;
        const data = await res.json().catch(() => ({}));
        retCode = data.retCode;
        retMsg = data.retMsg;
    }
    catch (error) {
        retMsg = error instanceof Error ? error.message : String(error);
    }
    const ok = responseCode >= 200 && responseCode < 300 && retCode === 0;
    const classified = ok ? null : classifyBybitAuthFailure(responseCode, retCode, retMsg, apiKey, apiSecret);
    return { auth_ok: ok, root_cause: classified?.root ?? null, endpoint: '/v5/account/wallet-balance', method: 'GET', timestamp, recv_window: recvWindow, query_string: query, pre_sign_payload_redacted: preSign.replace(apiKey, '[REDACTED_API_KEY]'), header_names: Object.keys(headers).sort(), signature_length: signature.length, response_code: responseCode, retCode, retMsg, key_audit: credentialAudit(apiKey), secret_audit: credentialAudit(apiSecret), official_contract: 'timestamp + apiKey + recvWindow + queryString', exact_reason: ok ? 'auth_ok=true; Bybit V5 wallet-balance accepted the signature' : classified?.reason ?? 'unknown Bybit auth failure' };
}
export class ExchangeProviderBybit {
    config;
    metadata;
    baseUrl;
    category;
    recvWindow;
    fetchImpl;
    now;
    constructor(config = {}) {
        this.config = config;
        const environment = config.environment ?? 'testnet';
        this.metadata = { id: provider, label: 'Bybit USDT Perpetual', environment, supportsNativeProtection: true, supportsProfitLock: true };
        this.baseUrl = config.baseUrl ?? BYBIT_URLS[environment];
        if (environment === 'demo' && !this.baseUrl.includes('api-demo.bybit.com'))
            throw new Error('Bybit demo provider must use https://api-demo.bybit.com');
        if (environment === 'testnet' && !this.baseUrl.includes('testnet'))
            throw new Error('Bybit testnet provider must use a testnet domain');
        if (environment === 'live' && (this.baseUrl.includes('testnet') || this.baseUrl.includes('api-demo')))
            throw new Error('Bybit live provider must use the mainnet domain');
        this.category = config.category ?? 'linear';
        this.recvWindow = config.recvWindow ?? 5000;
        this.fetchImpl = config.fetchImpl ?? fetch;
        this.now = config.now ?? Date.now;
    }
    ensureKeys() {
        if (!this.config.apiKey || !this.config.apiSecret)
            throw new Error('BYBIT_API_KEY and BYBIT_API_SECRET are required for the configured Bybit environment');
    }
    async request(method, path, params = {}) {
        this.ensureKeys();
        const timestamp = String(this.now());
        const body = method === 'POST' ? JSON.stringify(params) : '';
        const query = method === 'GET' ? bybitV5QueryString(params) : '';
        const preSign = `${timestamp}${this.config.apiKey}${this.recvWindow}${method === 'GET' ? query : body}`;
        const signature = await bybitV5HmacSha256(this.config.apiSecret, preSign);
        if (this.config.debugAuth) {
            (this.config.logger ?? console).debug('Bybit V5 auth debug', {
                endpoint: path,
                method,
                timestamp,
                recv_window: this.recvWindow,
                pre_sign_string: preSign.replace(this.config.apiKey, '[REDACTED_API_KEY]'),
                signature_length: signature.length,
            });
        }
        const res = await this.fetchImpl(`${this.baseUrl}${path}${query ? `?${query}` : ''}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-BAPI-API-KEY': this.config.apiKey,
                'X-BAPI-TIMESTAMP': timestamp,
                'X-BAPI-RECV-WINDOW': String(this.recvWindow),
                'X-BAPI-SIGN': signature,
                'X-BAPI-SIGN-TYPE': '2',
            },
            body: method === 'POST' ? body : undefined,
        });
        const data = await res.json();
        (this.config.logger ?? console).debug('Bybit V5 safe debug', { endpoint: path, params, retCode: data.retCode ?? res.status, retMsg: data.retMsg ?? res.statusText });
        if (!res.ok || data.retCode !== 0)
            throw new Error(`Bybit ${path} failed: ${data.retCode} ${data.retMsg}`);
        return data.result;
    }
    async getAccountState() {
        const [balances, positions, openOrders] = await Promise.all([this.getBalances(), this.getPositions(), this.getOpenOrders()]);
        return { provider, balances, positions, openOrders };
    }
    async getBalances() {
        const result = await this.request('GET', '/v5/account/wallet-balance', { accountType: 'UNIFIED' });
        return (result.list?.[0]?.coin ?? []).map((coin) => ({ asset: coin.coin, free: safeNumber(coin.availableToWithdraw), total: safeNumber(coin.equity ?? coin.walletBalance) }));
    }
    async getPositions() {
        const result = await this.request('GET', '/v5/position/list', { category: this.category, settleCoin: 'USDT' });
        return (result.list ?? []).filter((row) => safeNumber(row.size) !== 0).map((row) => ({ providerPositionId: String(row.positionIdx ?? row.symbol), symbol: String(row.symbol), side: String(row.side).toLowerCase() === 'buy' ? 'long' : 'short', quantity: safeNumber(row.size), entryPrice: safeNumber(row.avgPrice), markPrice: safeNumber(row.markPrice), unrealizedPnl: safeNumber(row.unrealisedPnl), metadata: row }));
    }
    async getOpenOrders(symbol) {
        const result = await this.request('GET', '/v5/order/realtime', { category: this.category, ...(symbol ? { symbol } : { settleCoin: 'USDT' }), openOnly: 0 });
        return (result.list ?? []).map((row) => ({ providerOrderId: String(row.orderId), symbol: String(row.symbol), side: String(row.side), type: String(row.orderType ?? row.stopOrderType ?? row.orderFilter), status: String(row.orderStatus), quantity: safeNumber(row.qty), price: safeNumber(row.price), triggerPrice: safeNumber(row.triggerPrice), reduceOnly: row.reduceOnly === true || row.reduceOnly === 'true', metadata: row }));
    }
    async fetchAccount() { return this.getAccountState(); }
    async fetchOpenPositions() { return this.getPositions(); }
    async fetchOpenOrders(symbol) { return this.getOpenOrders(symbol); }
    async placeEntryOrder(request) { return this.placeEntry(request); }
    async placeEntry(request) {
        const result = await this.request('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: side(request.side), orderType: request.entryPrice ? 'Limit' : 'Market', qty: String(request.quantity), price: request.entryPrice ? String(request.entryPrice) : undefined, timeInForce: request.entryPrice ? 'GTC' : 'IOC', orderLinkId: request.signalId ? createBybitOrderLinkId(request.signalId, 'entry', this.now()) : undefined });
        return { provider, ok: true, providerOrderId: result.orderId, status: 'entry_submitted', metadata: result };
    }
    async cancelOrder(request) { return this.cancelEntry(request); }
    async cancelEntry(request) {
        const result = await this.request('POST', '/v5/order/cancel', { category: this.category, symbol: request.symbol, orderId: request.providerOrderId });
        return { provider, ok: true, providerOrderId: request.providerOrderId, status: 'cancelled', metadata: result };
    }
    async closePosition(request) {
        const position = (await this.getPositions()).find((row) => row.symbol === request.symbol);
        if (!position)
            return { provider, ok: true, status: 'no_position' };
        const result = await this.request('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: closeSide(position.side === 'long' ? 'long' : 'short'), orderType: 'Market', qty: String(request.quantity ?? position.quantity), reduceOnly: true, timeInForce: 'IOC', orderLinkId: createBybitOrderLinkId(request.executionId ?? request.symbol, 'close', this.now()) });
        return { provider, ok: true, providerOrderId: result.orderId, status: 'close_submitted', metadata: { ...result, reason: request.reason } };
    }
    async placeProtection(request, label) {
        const triggerPrice = label === 'sl' ? request.stopLoss : label === 'tp1' ? request.tp1 : request.tp2;
        const orderLinkId = createBybitOrderLinkId(request.metadata?.executionId ?? request.symbol, label, this.now());
        const result = await this.request('POST', '/v5/order/create', { category: this.category, symbol: request.symbol, side: closeSide(request.side), orderType: 'Market', qty: String(request.quantity), triggerPrice: String(triggerPrice), triggerDirection: request.side === 'long' ? (label === 'sl' ? 2 : 1) : (label === 'sl' ? 1 : 2), triggerBy: 'MarkPrice', reduceOnly: true, closeOnTrigger: true, orderFilter: 'StopOrder', orderLinkId });
        const open = await this.getOpenOrders(request.symbol);
        const confirmed = open.find((order) => order.providerOrderId === String(result.orderId) || String(order.metadata?.orderLinkId ?? '') === String(result.orderLinkId ?? orderLinkId)) ?? open.find((order) => order.symbol === request.symbol && String(order.side).toLowerCase() === closeSide(request.side).toLowerCase() && Math.abs(Number(order.triggerPrice ?? 0) - Number(triggerPrice)) < 1e-9);
        if (!confirmed)
            return { provider, ok: false, providerOrderId: result.orderId, status: `${label}_confirmation_missing`, error: 'exchange confirmation missing', metadata: { ...result, orderLinkId, label, openOrders: open.length } };
        return { provider, ok: true, providerOrderId: result.orderId, status: `${label}_submitted`, metadata: { ...result, orderLinkId, label, confirmedStatus: confirmed.status } };
    }
    async placeStopLoss(request) { return this.placeSL(request); }
    async placeSL(request) { return this.placeProtection(request, 'sl'); }
    async placeTP1(request) { return this.placeProtection(request, 'tp1'); }
    async placeTP2(request) { return this.placeProtection(request, 'tp2'); }
    async placeTakeProfit(request, target) { return target === 'tp1' ? this.placeTP1(request) : this.placeTP2(request); }
    async verifyProtection(request) {
        const open = await this.getOpenOrders(request.symbol);
        const ids = ['sl', 'tp1', 'tp2'].map((label) => String(request.metadata?.[`${label}_order_id`] ?? request.metadata?.[`${label}_algo_id`] ?? '')).filter(Boolean);
        const missing = ids.length === 0 ? ['sl', 'tp1', 'tp2'] : ids.filter((id) => !open.some((order) => order.providerOrderId === id));
        return { provider, ok: missing.length === 0, data: { verified: missing.length === 0, missing }, metadata: { openOrders: open.length } };
    }
    async classifyProtectionState(request) { return this.classifySafetyState(request); }
    async repairProtection(request) { const sl = await this.placeSL(request); const tp1 = await this.placeTP1(request); const tp2 = await this.placeTP2(request); return { provider, ok: sl.ok && tp1.ok && tp2.ok, metadata: { sl, tp1, tp2 } }; }
    async replaceSL(request) { return this.placeProtection({ symbol: request.symbol, side: request.side, quantity: request.quantity, stopLoss: request.stopLoss, tp1: Number(request.metadata?.tp1 ?? 0), tp2: Number(request.metadata?.tp2 ?? 0), metadata: request.metadata }, 'sl'); }
    async reconcilePosition(request) { const positions = await this.getPositions(); return { provider, ok: true, metadata: { positions: positions.filter((position) => position.symbol === request.symbol) } }; }
    async syncPositionProtection(request) { return this.reconcileProtection(request); }
    async reconcileProtection(request) { return this.verifyProtection(request); }
    async classifySafetyState(request) {
        const protection = await this.verifyProtection(request);
        const position = (await this.getPositions()).find((row) => row.symbol === request.symbol);
        const state = !position ? 'unknown' : protection.ok ? 'safe' : 'unsafe';
        return { provider, ok: state !== 'unsafe', data: { state, reason: protection.ok ? 'bybit_protection_verified' : 'bybit_protection_missing' }, metadata: protection.metadata };
    }
    async evaluateProfitLock(request) {
        const action = decideProfitLockAction({ enableProfitLockEngine: request.metadata?.enableProfitLockEngine !== false, enableTestnetProfitLockEngine: request.metadata?.enableTestnetProfitLockEngine !== false, testnetEnabled: true, liveTrading: false, profitLockMinR: Number(request.metadata?.profitLockMinR ?? 0.3), profitLockAggressiveMinR: Number(request.metadata?.profitLockAggressiveMinR ?? 0.5), profitLockBeforeTp1TestnetAllowed: request.metadata?.profitLockBeforeTp1TestnetAllowed === true, profitLockMaxUpdatesPerTrade: Number(request.metadata?.profitLockMaxUpdatesPerTrade ?? 1), profitLockCooldownMinutes: Number(request.metadata?.profitLockCooldownMinutes ?? 15) }, { currentR: Number(request.highestPositiveR ?? 0), currentUnrealizedPnl: Number(request.metadata?.currentUnrealizedPnl ?? 0), tp1Hit: request.metadata?.tp1Hit === true, reversalRisk: request.metadata?.reversalRisk ?? 'medium', validSlExists: request.metadata?.validSlExists !== false, existingSlPrice: request.stopLoss, updatesThisTrade: Number(request.metadata?.updatesThisTrade ?? 0), minutesSinceLastUpdate: Number(request.metadata?.minutesSinceLastUpdate ?? 999), stopUpdateAlreadyVerified: request.metadata?.stopUpdateAlreadyVerified === true });
        return { provider, ok: true, data: { shouldLock: action.allowed, replacementStop: action.allowed ? calculateProfitLockPrice(request.side === 'long' ? 'buy' : 'sell', request.entryPrice, request.stopLoss, action.action === 'move_sl_to_be' ? 0 : 0.3) : undefined, reason: action.reason } };
    }
    async executeProfitLock(request) { const decision = await this.evaluateProfitLock(request); if (!decision.data?.shouldLock || !decision.data.replacementStop)
        return { provider, ok: true, status: 'no_action', metadata: { decision } }; return this.replaceSL({ symbol: request.symbol, side: request.side, quantity: request.quantity, stopLoss: decision.data.replacementStop, reason: 'profit_lock', metadata: request.metadata }); }
}
