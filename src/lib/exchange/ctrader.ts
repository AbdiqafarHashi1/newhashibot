import type { EntryRequest, ExchangeOrder, ExchangePosition, ProviderResult } from './exchangeProvider.js';

export const CTRADER_EXECUTION_MODES = ['personal', 'prop_challenge', 'demo'] as const;
export type CTraderExecutionMode = typeof CTRADER_EXECUTION_MODES[number];
export type CTraderAccountKind = 'personal' | 'prop' | 'demo';
export type CTraderOrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type CTraderTimeInForce = 'GTC' | 'IOC' | 'FOK' | 'DAY';

export interface CTraderAccount {
  id: string;
  userId: string;
  broker: string;
  traderLogin: string;
  accountNumberMasked: string;
  nickname: string;
  currency: string;
  leverageInCents: number;
  leverage: number;
  accountType: CTraderAccountKind;
  executionMode: CTraderExecutionMode;
  executionEnabled: boolean;
  connectionStatus: 'pending' | 'connected' | 'degraded' | 'disconnected' | 'disabled';
  providerHealth: 'unknown' | 'healthy' | 'degraded' | 'unhealthy';
  bridgeId?: string;
  openApiAppClientId?: string;
  accessTokenMasked?: string;
  tokenExpiresAt?: string;
  lastHeartbeatAt?: string;
  lastSyncAt?: string;
}

export interface CTraderSymbolSpec {
  canonicalSymbol: string;
  brokerSymbol: string;
  symbolId: number;
  digits: number;
  pipPosition: number;
  minVolume: number;
  maxVolume: number;
  stepVolume: number;
  lotSize: number;
}

export interface CTraderNativeOrder {
  ctidTraderAccountId: number;
  symbolId: number;
  orderType: CTraderOrderType;
  tradeSide: 'BUY' | 'SELL';
  volume: number; // Volume in cents or units depending on symbol lot size
  limitPrice?: number;
  stopPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  timeInForce: CTraderTimeInForce;
  clientOrderId: string;
  comment: string;
  label: string;
}

export interface CTraderAccountSnapshot {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  floatingPnl: number;
  currency: string;
  positions: ExchangePosition[];
  orders: ExchangeOrder[];
  capturedAt: string;
}

export interface CTraderGateway {
  account(accountId: string): Promise<CTraderAccount>;
  symbol(accountId: string, canonicalSymbol: string): Promise<CTraderSymbolSpec>;
  snapshot(accountId: string): Promise<CTraderAccountSnapshot | null>;
  enqueue(accountId: string, operation: string, payload: Readonly<Record<string, unknown>>, idempotencyKey: string): Promise<{ commandId: string; status: string }>;
}

export function normalizeCTraderVolume(lots: number, spec: CTraderSymbolSpec): number {
  if (!Number.isFinite(lots) || lots <= 0) throw new Error('ctrader_invalid_lot_size');
  const units = Math.round(lots * spec.lotSize);
  const minUnits = spec.minVolume;
  const maxUnits = spec.maxVolume;
  const step = spec.stepVolume || 1000;
  const steppedUnits = Math.floor((units - minUnits + 1e-9) / step) * step + minUnits;
  const clampedUnits = Math.min(maxUnits, Math.max(minUnits, steppedUnits));
  // cTrader Open API takes volume in cents of units (units * 100) or raw lots depending on bridge mode
  return clampedUnits;
}

export function normalizeCTraderPrice(price: number | undefined, spec: CTraderSymbolSpec): number | undefined {
  if (price === undefined) return undefined;
  if (!Number.isFinite(price) || price <= 0) throw new Error('ctrader_invalid_price');
  return Number(price.toFixed(spec.digits));
}

/** Pure translation from canonical EntryRequest to cTrader Open API order schema */
export function toCTraderOrder(
  request: Readonly<EntryRequest>,
  spec: CTraderSymbolSpec,
  accountLoginNum = 0
): CTraderNativeOrder {
  const orderType: CTraderOrderType = request.entryPrice ? 'LIMIT' : 'MARKET';
  const sl = normalizeCTraderPrice(request.stopLoss, spec);
  const tp = normalizeCTraderPrice(request.tp1, spec);
  const entry = normalizeCTraderPrice(request.entryPrice, spec);

  const units = normalizeCTraderVolume(request.quantity, spec);

  return Object.freeze({
    ctidTraderAccountId: accountLoginNum,
    symbolId: spec.symbolId,
    orderType,
    tradeSide: request.side === 'long' ? 'BUY' : 'SELL',
    volume: units * 100, // cTrader Open API takes volume in cents
    limitPrice: orderType === 'LIMIT' ? entry : undefined,
    stopLoss: sl,
    takeProfit: tp,
    timeInForce: 'GTC',
    clientOrderId: String(request.metadata?.idempotencyKey ?? request.signalId ?? crypto.randomUUID()),
    comment: `HashiBot:${request.signalId ?? 'algo'}`.slice(0, 31),
    label: 'HashiBot Quant',
  });
}

export function assertCTraderReady(account: CTraderAccount): void {
  if (!account.executionEnabled) throw new Error('ctrader_execution_disabled');
  if (account.connectionStatus !== 'connected') throw new Error('ctrader_account_not_connected');
  if (account.providerHealth !== 'healthy') throw new Error('ctrader_provider_unhealthy');
  if (!account.bridgeId && !account.openApiAppClientId) throw new Error('ctrader_bridge_unassigned');
}

export function gatewayFailureCTrader(provider: string, error: unknown): ProviderResult {
  return {
    provider,
    ok: false,
    status: 'rejected',
    error: error instanceof Error ? error.message : 'ctrader_provider_failure',
  };
}
