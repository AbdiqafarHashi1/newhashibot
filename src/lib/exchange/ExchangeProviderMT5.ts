import type { ExchangeAccountState, ExchangeBalance, ExchangeOrder, ExchangePosition, ExchangeProvider, ExchangeProviderMetadata, ProviderResult, ReconcileRequest } from './exchangeProvider.js';

const provider = 'mt5' as const;
const notImplemented = (action: string): ProviderResult => ({ provider, ok: false, status: 'not_implemented', error: `MT5 ${action} is a Phase X-D foundation stub only` });

export class ExchangeProviderMT5 implements ExchangeProvider {
  readonly metadata: ExchangeProviderMetadata = { id: provider, label: 'MT5', environment: 'future', supportsNativeProtection: false, supportsProfitLock: false };
  async getAccountState(): Promise<ExchangeAccountState> { return { provider, balances: [], positions: [], openOrders: [], raw: { status: 'not_implemented' } }; }
  async getBalances(): Promise<ExchangeBalance[]> { return []; }
  async getPositions(): Promise<ExchangePosition[]> { return []; }
  async getOpenOrders(): Promise<ExchangeOrder[]> { return []; }
  async fetchAccount() { return this.getAccountState(); }
  async fetchOpenPositions() { return this.getPositions(); }
  async fetchOpenOrders() { return this.getOpenOrders(); }
  async placeEntry() { return notImplemented('placeEntry'); }
  async placeEntryOrder() { return this.placeEntry(); }
  async cancelEntry() { return notImplemented('cancelEntry'); }
  async cancelOrder() { return this.cancelEntry(); }
  async closePosition() { return notImplemented('closePosition'); }
  async placeSL() { return notImplemented('placeSL'); }
  async placeStopLoss() { return this.placeSL(); }
  async placeTP1() { return notImplemented('placeTP1'); }
  async placeTP2() { return notImplemented('placeTP2'); }
  async placeTakeProfit(_request?: unknown, target: 'tp1' | 'tp2' = 'tp1') { return target === 'tp1' ? this.placeTP1() : this.placeTP2(); }
  async verifyProtection() { return { provider, ok: false, data: { verified: false, missing: ['sl', 'tp1', 'tp2'] }, status: 'not_implemented' }; }
  async classifyProtectionState() { return { provider, ok: true, data: { state: 'unknown' as const, reason: 'mt5_stub_not_active' } }; }
  async repairProtection() { return notImplemented('repairProtection'); }
  async replaceSL() { return notImplemented('replaceSL'); }
  async reconcilePosition(request: ReconcileRequest) { return { provider, ok: true, status: 'not_implemented', metadata: { request } }; }
  async reconcileProtection() { return { provider, ok: false, data: { verified: false, missing: ['sl', 'tp1', 'tp2'] }, status: 'not_implemented' }; }
  async syncPositionProtection() { return this.reconcileProtection(); }
  async classifySafetyState() { return { provider, ok: true, data: { state: 'unknown' as const, reason: 'mt5_stub_not_active' } }; }
  async evaluateProfitLock() { return { provider, ok: true, data: { shouldLock: false, reason: 'mt5_stub_not_active' } }; }
  async executeProfitLock() { return notImplemented('executeProfitLock'); }
}
