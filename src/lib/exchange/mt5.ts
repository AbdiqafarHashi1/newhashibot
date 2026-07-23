import type { EntryRequest, ExchangeOrder, ExchangePosition, ProviderResult } from './exchangeProvider.js';

export const MT5_EXECUTION_MODES = ['personal', 'prop_challenge', 'demo'] as const;
export type MT5ExecutionMode = typeof MT5_EXECUTION_MODES[number];
export type MT5AccountKind = 'personal' | 'prop' | 'demo';
export type MT5MarginMode = 'hedging' | 'netting';
export type MT5OrderKind = 'market' | 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop';
export type MT5FillPolicy = 'fok' | 'ioc' | 'return';

export interface MT5Account {
  id: string;
  userId: string;
  broker: string;
  server: string;
  accountNumberMasked: string;
  nickname: string;
  currency: string;
  leverage: number;
  accountType: MT5AccountKind;
  executionMode: MT5ExecutionMode;
  executionEnabled: boolean;
  connectionStatus: 'pending' | 'connected' | 'degraded' | 'disconnected' | 'disabled';
  providerHealth: 'unknown' | 'healthy' | 'degraded' | 'unhealthy';
  bridgeId?: string;
  lastHeartbeatAt?: string;
  lastSyncAt?: string;
}

export interface MT5SymbolSpec {
  canonicalSymbol: string;
  brokerSymbol: string;
  digits: number;
  point: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  stopsLevelPoints: number;
  fillPolicies: MT5FillPolicy[];
}

export interface MT5NativeOrder {
  action: 'deal' | 'pending' | 'modify' | 'remove';
  symbol: string;
  side: 'BUY' | 'SELL';
  orderKind: MT5OrderKind;
  volume: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  fillPolicy: MT5FillPolicy;
  deviationPoints: number;
  clientRequestId: string;
  comment: string;
}

export interface MT5AccountSnapshot {
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

export interface MT5Gateway {
  account(accountId: string): Promise<MT5Account>;
  symbol(accountId: string, canonicalSymbol: string): Promise<MT5SymbolSpec>;
  snapshot(accountId: string): Promise<MT5AccountSnapshot | null>;
  enqueue(accountId: string, operation: string, payload: Readonly<Record<string, unknown>>, idempotencyKey: string): Promise<{ commandId: string; status: string }>;
}

export function normalizeVolume(lots: number, spec: MT5SymbolSpec): number {
  if (!Number.isFinite(lots) || lots <= 0) throw new Error('mt5_invalid_lot_size');
  const steps = Math.floor((lots - spec.volumeMin + 1e-12) / spec.volumeStep);
  const value = Math.min(spec.volumeMax, spec.volumeMin + Math.max(0, steps) * spec.volumeStep);
  return Number(value.toFixed(Math.max(0, (String(spec.volumeStep).split('.')[1] ?? '').length)));
}

export function normalizePrice(price: number | undefined, spec: MT5SymbolSpec): number | undefined {
  if (price === undefined) return undefined;
  if (!Number.isFinite(price) || price <= 0) throw new Error('mt5_invalid_price');
  return Number(price.toFixed(spec.digits));
}

/** Pure translation: the canonical request is read-only and is never mutated. */
export function toMT5Order(request: Readonly<EntryRequest>, spec: MT5SymbolSpec): MT5NativeOrder {
  const kind = (request.metadata?.orderType ?? 'market') as MT5OrderKind;
  const fill = (request.metadata?.fillPolicy as MT5FillPolicy | undefined) ?? spec.fillPolicies[0] ?? 'return';
  if (!spec.fillPolicies.includes(fill)) throw new Error(`mt5_unsupported_fill_policy:${fill}`);
  const sl = normalizePrice(request.stopLoss, spec)!;
  const tp = normalizePrice(request.tp1, spec)!;
  const entry = normalizePrice(request.entryPrice, spec);
  if (entry !== undefined) {
    const minimum = spec.stopsLevelPoints * spec.point;
    if (Math.abs(entry - sl) + spec.point / 10 < minimum || Math.abs(tp - entry) + spec.point / 10 < minimum) {
      throw new Error('mt5_broker_stop_level_violation');
    }
  }
  return Object.freeze({
    action: kind === 'market' ? 'deal' : 'pending',
    symbol: spec.brokerSymbol,
    side: request.side === 'long' ? 'BUY' : 'SELL',
    orderKind: kind,
    volume: normalizeVolume(request.quantity, spec),
    price: kind === 'market' ? undefined : entry,
    stopLoss: sl,
    takeProfit: tp,
    fillPolicy: fill,
    deviationPoints: Number(request.metadata?.deviationPoints ?? 20),
    clientRequestId: String(request.metadata?.idempotencyKey ?? request.signalId ?? crypto.randomUUID()),
    comment: `HashiBot:${request.signalId ?? 'manual'}`.slice(0, 31),
  });
}

export function assertMT5Ready(account: MT5Account): void {
  if (!account.executionEnabled) throw new Error('mt5_execution_disabled');
  if (account.connectionStatus !== 'connected') throw new Error('mt5_account_not_connected');
  if (account.providerHealth !== 'healthy') throw new Error('mt5_provider_unhealthy');
  if (!account.bridgeId) throw new Error('mt5_bridge_unassigned');
}

export function selectMT5Targets(accounts: readonly MT5Account[], customerId: string): MT5Account[] {
  return accounts.filter((account) => account.userId === customerId && account.executionEnabled && account.connectionStatus === 'connected' && account.providerHealth === 'healthy' && Boolean(account.bridgeId));
}

export function gatewayFailure(provider: string, error: unknown): ProviderResult {
  return { provider, ok: false, status: 'rejected', error: error instanceof Error ? error.message : 'mt5_provider_failure' };
}
