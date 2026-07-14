import type { ProviderId, PositionSide } from '../runtimeContracts';

export type ExchangeProviderId = ProviderId;
export type ExchangeSide = PositionSide;
export type SafetyState = 'safe' | 'degraded' | 'unsafe' | 'unknown';

export interface ExchangeProviderMetadata {
  id: ExchangeProviderId;
  label: string;
  environment: import('../runtimeContracts').EnvironmentId;
  supportsNativeProtection: boolean;
  supportsProfitLock: boolean;
}

export interface ExchangeBalance { asset: string; free: number; locked?: number; total?: number; }
export interface ExchangePosition { providerPositionId?: string; symbol: string; side: ExchangeSide | string; quantity: number; entryPrice?: number; markPrice?: number; unrealizedPnl?: number; metadata?: Record<string, unknown>; }
export interface ExchangeOrder { providerOrderId: string; symbol: string; side?: string; type?: string; status: string; quantity?: number; price?: number; triggerPrice?: number; reduceOnly?: boolean; metadata?: Record<string, unknown>; }
export interface ExchangeAccountState { provider: ExchangeProviderId; balances: ExchangeBalance[]; positions: ExchangePosition[]; openOrders: ExchangeOrder[]; raw?: unknown; }
export interface ProviderResult<T = Record<string, unknown>> { provider: ExchangeProviderId; ok: boolean; data?: T; providerOrderId?: string; providerPositionId?: string; fillPrice?: number; fee?: number; slippage?: number; status?: string; error?: string; metadata?: Record<string, unknown>; }

export interface EntryRequest { signalId?: string; symbol: string; side: ExchangeSide; quantity: number; entryPrice?: number; stopLoss: number; tp1: number; tp2: number; leverage?: number; metadata?: Record<string, unknown>; }
export interface ProtectionRequest { symbol: string; side: ExchangeSide; quantity: number; stopLoss: number; tp1: number; tp2: number; entryPrice?: number; metadata?: Record<string, unknown>; }
export interface ReplaceStopRequest { symbol: string; side: ExchangeSide; quantity: number; stopLoss: number; reason: 'profit_lock' | 'breakeven' | 'manual' | string; metadata?: Record<string, unknown>; }
export interface ReconcileRequest { executionId?: string; symbol: string; providerOrderId?: string; providerPositionId?: string; metadata?: Record<string, unknown>; }
export interface ProfitLockRequest extends ReconcileRequest { entryPrice: number; stopLoss: number; currentPrice?: number; highestPositiveR?: number; quantity: number; side: ExchangeSide; }

export interface ExchangeProvider {
  readonly metadata: ExchangeProviderMetadata;
  getAccountState(): Promise<ExchangeAccountState>;
  getBalances(): Promise<ExchangeBalance[]>;
  getPositions(): Promise<ExchangePosition[]>;
  getOpenOrders(symbol?: string): Promise<ExchangeOrder[]>;
  fetchAccount(): Promise<ExchangeAccountState>;
  fetchOpenPositions(): Promise<ExchangePosition[]>;
  fetchOpenOrders(symbol?: string): Promise<ExchangeOrder[]>;
  placeEntry(request: EntryRequest): Promise<ProviderResult>;
  placeEntryOrder(request: EntryRequest): Promise<ProviderResult>;
  cancelEntry(request: ReconcileRequest): Promise<ProviderResult>;
  cancelOrder(request: ReconcileRequest): Promise<ProviderResult>;
  closePosition(request: ReconcileRequest & { quantity?: number; reason?: string }): Promise<ProviderResult>;
  placeSL(request: ProtectionRequest): Promise<ProviderResult>;
  placeStopLoss(request: ProtectionRequest): Promise<ProviderResult>;
  placeTP1(request: ProtectionRequest): Promise<ProviderResult>;
  placeTP2(request: ProtectionRequest): Promise<ProviderResult>;
  placeTakeProfit(request: ProtectionRequest, target: 'tp1' | 'tp2'): Promise<ProviderResult>;
  verifyProtection(request: ReconcileRequest): Promise<ProviderResult<{ verified: boolean; missing: string[] }>>;
  classifyProtectionState(request: ReconcileRequest): Promise<ProviderResult<{ state: SafetyState; reason: string }>>;
  repairProtection(request: ProtectionRequest): Promise<ProviderResult>;
  replaceSL(request: ReplaceStopRequest): Promise<ProviderResult>;
  reconcilePosition(request: ReconcileRequest): Promise<ProviderResult>;
  reconcileProtection(request: ReconcileRequest): Promise<ProviderResult>;
  syncPositionProtection(request: ReconcileRequest): Promise<ProviderResult>;
  classifySafetyState(request: ReconcileRequest): Promise<ProviderResult<{ state: SafetyState; reason: string }>>;
  evaluateProfitLock(request: ProfitLockRequest): Promise<ProviderResult<{ shouldLock: boolean; replacementStop?: number; reason: string }>>;
  executeProfitLock(request: ProfitLockRequest): Promise<ProviderResult>;
}
