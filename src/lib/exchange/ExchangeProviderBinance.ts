import type { ExchangeAccountState, ExchangeBalance, ExchangeOrder, ExchangePosition, ExchangeProvider, ExchangeProviderMetadata, EntryRequest, ProfitLockRequest, ProtectionRequest, ProviderResult, ReconcileRequest, ReplaceStopRequest } from './exchangeProvider.js';
import type { BinanceOpenOrder, NativeProtectionClient, ManagedExitClient } from '../binanceTruthExecution.js';
import { createProtectionPlan, decideProfitLockAction, verifyNativeProtectionOpenOrders } from '../binanceTruthExecution.js';
import { calculateProfitLockPrice } from '../binanceTestnetMonitor.js';

type BinanceAdapterClients = {
  account?: { getAccountState(): Promise<ExchangeAccountState>; getBalances?(): Promise<ExchangeBalance[]>; getPositions?(): Promise<ExchangePosition[]>; getOpenOrders?(symbol?: string): Promise<ExchangeOrder[]> };
  execution?: { placeEntry?(request: EntryRequest): Promise<ProviderResult>; cancelEntry?(request: ReconcileRequest): Promise<ProviderResult>; closePosition?(request: ReconcileRequest & { quantity?: number; reason?: string }): Promise<ProviderResult> };
  protection?: NativeProtectionClient;
  managedExit?: ManagedExitClient;
};

const provider = 'binance' as const;
const notWired = (action: string): ProviderResult => ({ provider, ok: false, status: 'not_wired', error: `${action} must be supplied by the existing Binance edge-function client`, metadata: { adapter: 'ExchangeProviderBinance' } });
const sideToDirection = (side: 'long' | 'short') => side === 'long' ? 'buy' : 'sell';

export class ExchangeProviderBinance implements ExchangeProvider {
  readonly metadata: ExchangeProviderMetadata = { id: provider, label: 'Binance USD-M', environment: 'testnet', supportsNativeProtection: true, supportsProfitLock: true };
  constructor(private readonly clients: BinanceAdapterClients = {}) {}

  async getAccountState() { return this.clients.account?.getAccountState?.() ?? { provider, balances: [], positions: [], openOrders: [], raw: null }; }
  async getBalances() { return this.clients.account?.getBalances?.() ?? (await this.getAccountState()).balances; }
  async getPositions() { return this.clients.account?.getPositions?.() ?? (await this.getAccountState()).positions; }
  async getOpenOrders(symbol?: string) { return this.clients.account?.getOpenOrders?.(symbol) ?? (await this.getAccountState()).openOrders.filter(o => !symbol || o.symbol === symbol); }
  async placeEntry(request: EntryRequest) { return this.clients.execution?.placeEntry?.(request) ?? notWired('placeEntry'); }
  async cancelEntry(request: ReconcileRequest) { return this.clients.execution?.cancelEntry?.(request) ?? notWired('cancelEntry'); }
  async closePosition(request: ReconcileRequest & { quantity?: number; reason?: string }) { return this.clients.execution?.closePosition?.(request) ?? notWired('closePosition'); }

  async placeSL(request: ProtectionRequest) {
    if (!this.clients.protection || request.entryPrice == null) return notWired('placeSL');
    const result = await this.clients.protection.placeReduceOnlyStop({ symbol: request.symbol, direction: sideToDirection(request.side), quantity: request.quantity, entryPrice: request.entryPrice, stopLoss: request.stopLoss, tp1: request.tp1, tp2: request.tp2 });
    return { provider, ok: true, providerOrderId: result.algoId, metadata: { ...result } };
  }
  async placeTP1(request: ProtectionRequest) { return this.placeTP(request, 'tp1'); }
  async placeTP2(request: ProtectionRequest) { return this.placeTP(request, 'tp2'); }
  private async placeTP(request: ProtectionRequest, label: 'tp1' | 'tp2') {
    if (!this.clients.protection || request.entryPrice == null) return notWired(`place${label.toUpperCase()}`);
    const result = await this.clients.protection.placeReduceOnlyTakeProfit({ symbol: request.symbol, direction: sideToDirection(request.side), quantity: request.quantity, entryPrice: request.entryPrice, stopLoss: request.stopLoss, tp1: request.tp1, tp2: request.tp2, targetPrice: label === 'tp1' ? request.tp1 : request.tp2, label });
    return { provider, ok: true, providerOrderId: result.algoId, metadata: { ...result } };
  }
  async verifyProtection(request: ReconcileRequest) {
    const orders = (await this.getOpenOrders(request.symbol)).map((o): BinanceOpenOrder => ({ orderId: o.providerOrderId, symbol: o.symbol, status: o.status, side: o.side, triggerPrice: o.triggerPrice, price: o.price, reduceOnly: o.reduceOnly, type: o.type, ...o.metadata }));
    const verified = verifyNativeProtectionOpenOrders({ symbol: request.symbol, direction: sideToDirection((request.metadata?.side as 'long' | 'short') ?? 'long'), quantity: Number(request.metadata?.quantity ?? 0), entryPrice: Number(request.metadata?.entryPrice ?? 0), stopLoss: Number(request.metadata?.stopLoss ?? 0), tp1: Number(request.metadata?.tp1 ?? 0), tp2: Number(request.metadata?.tp2 ?? 0) }, { sl: String(request.metadata?.sl_algo_id ?? request.metadata?.sl_order_id ?? ''), tp1: String(request.metadata?.tp1_algo_id ?? request.metadata?.tp1_order_id ?? ''), tp2: String(request.metadata?.tp2_algo_id ?? request.metadata?.tp2_order_id ?? '') }, orders);
    return { provider, ok: verified.verified, data: { verified: verified.verified, missing: verified.missingLabels }, error: verified.errors.join('; ') || undefined };
  }
  async classifyProtectionState(request: ReconcileRequest) { return this.classifySafetyState(request); }
  async repairProtection(request: ProtectionRequest) { const sl = await this.placeSL(request); const tp1 = await this.placeTP1(request); const tp2 = await this.placeTP2(request); return { provider, ok: sl.ok && tp1.ok && tp2.ok, metadata: { sl, tp1, tp2 } }; }
  async replaceSL(request: ReplaceStopRequest) { return this.placeSL({ symbol: request.symbol, side: request.side, quantity: request.quantity, stopLoss: request.stopLoss, tp1: Number(request.metadata?.tp1 ?? 0), tp2: Number(request.metadata?.tp2 ?? 0), entryPrice: Number(request.metadata?.entryPrice ?? 0), metadata: request.metadata }); }
  async reconcilePosition(request: ReconcileRequest) { return { provider, ok: true, metadata: { request, positions: await this.getPositions() } }; }
  async reconcileProtection(request: ReconcileRequest) { return this.verifyProtection(request); }
  async classifySafetyState(request: ReconcileRequest) {
    const status = String(request.metadata?.status ?? 'unknown');
    const protection = String(request.metadata?.protection_status ?? 'unknown');
    const hasPosition = Boolean(request.providerPositionId ?? request.metadata?.positionAmt ?? request.metadata?.current_position_size);
    const protectedState = ['protected', 'protected_native', 'protected_managed', 'protection_recovered'].includes(protection) || status.startsWith('closed_');
    const state: 'safe' | 'degraded' | 'unsafe' | 'unknown' = !hasPosition ? 'unknown' : protectedState ? 'safe' : ['protection_failed', 'unprotected_failed'].includes(protection) ? 'unsafe' : 'degraded';
    return { provider, ok: state !== 'unsafe', data: { state, reason: `${status}/${protection}` } };
  }
  async evaluateProfitLock(request: ProfitLockRequest) {
    const action = decideProfitLockAction({
      enableProfitLockEngine: request.metadata?.enableProfitLockEngine !== false,
      enableTestnetProfitLockEngine: request.metadata?.enableTestnetProfitLockEngine !== false,
      testnetEnabled: request.metadata?.testnetEnabled !== false,
      liveTrading: request.metadata?.liveTrading === true,
      profitLockMinR: Number(request.metadata?.profitLockMinR ?? 0.3),
      profitLockAggressiveMinR: Number(request.metadata?.profitLockAggressiveMinR ?? 0.5),
      profitLockBeforeTp1TestnetAllowed: request.metadata?.profitLockBeforeTp1TestnetAllowed === true,
      profitLockMaxUpdatesPerTrade: Number(request.metadata?.profitLockMaxUpdatesPerTrade ?? 1),
      profitLockCooldownMinutes: Number(request.metadata?.profitLockCooldownMinutes ?? 15),
    }, {
      currentR: Number(request.highestPositiveR ?? 0),
      currentUnrealizedPnl: Number(request.metadata?.currentUnrealizedPnl ?? 0),
      tp1Hit: request.metadata?.tp1Hit === true,
      reversalRisk: (request.metadata?.reversalRisk as 'low' | 'medium' | 'high') ?? 'medium',
      validSlExists: request.metadata?.validSlExists !== false,
      existingSlPrice: request.stopLoss,
      updatesThisTrade: Number(request.metadata?.updatesThisTrade ?? 0),
      minutesSinceLastUpdate: Number(request.metadata?.minutesSinceLastUpdate ?? 999),
      stopUpdateAlreadyVerified: request.metadata?.stopUpdateAlreadyVerified === true,
    });
    const replacementStop = action.allowed ? calculateProfitLockPrice(sideToDirection(request.side), request.entryPrice, request.stopLoss, action.action === 'move_sl_to_be' ? 0 : 0.3) : undefined;
    return { provider, ok: true, data: { shouldLock: action.allowed, replacementStop, reason: action.reason } };
  }
  async executeProfitLock(request: ProfitLockRequest) { const decision = await this.evaluateProfitLock(request); if (!decision.data?.shouldLock || !decision.data.replacementStop) return { provider, ok: true, status: 'no_action', metadata: { decision } }; return this.replaceSL({ symbol: request.symbol, side: request.side, quantity: request.quantity, stopLoss: decision.data.replacementStop, reason: 'profit_lock', metadata: request.metadata }); }
}

export { createProtectionPlan };
