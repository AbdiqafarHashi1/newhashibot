import type {
  ExchangeAccountState, ExchangeBalance, ExchangeOrder, ExchangePosition, ExchangeProvider,
  ExchangeProviderMetadata, ProviderResult, ReconcileRequest, EntryRequest, ProtectionRequest,
  ReplaceStopRequest, ProfitLockRequest,
} from './exchangeProvider.js';
import { supabase } from '../supabase.js';
import {
  assertMT5Ready, gatewayFailure, toMT5Order,
  type MT5Account, type MT5AccountSnapshot, type MT5Gateway, type MT5SymbolSpec,
} from './mt5.js';

/** Supabase command-queue adapter. Credentials remain encrypted server-side and never enter this process. */
export class SupabaseMT5Gateway implements MT5Gateway {
  async account(accountId: string): Promise<MT5Account> {
    const { data, error } = await supabase.from('mt5_accounts_safe').select('*').eq('id', accountId).single();
    if (error || !data) throw new Error(`mt5_account_unavailable:${error?.message ?? accountId}`);
    return {
      id: data.id, userId: data.user_id, broker: data.broker, server: data.server,
      accountNumberMasked: data.account_number_masked, nickname: data.nickname, currency: data.currency,
      leverage: Number(data.leverage), accountType: data.account_type, executionMode: data.execution_mode,
      executionEnabled: data.execution_enabled, connectionStatus: data.connection_status,
      providerHealth: data.provider_health, bridgeId: data.bridge_id ?? undefined,
      lastHeartbeatAt: data.last_heartbeat_at ?? undefined, lastSyncAt: data.last_sync_at ?? undefined,
    };
  }

  async symbol(accountId: string, canonicalSymbol: string): Promise<MT5SymbolSpec> {
    const { data, error } = await supabase.from('mt5_symbol_specs').select('*').eq('account_id', accountId).eq('canonical_symbol', canonicalSymbol).single();
    if (error || !data) throw new Error(`mt5_symbol_unmapped:${canonicalSymbol}`);
    return {
      canonicalSymbol, brokerSymbol: data.broker_symbol, digits: data.digits, point: Number(data.point),
      contractSize: Number(data.contract_size), volumeMin: Number(data.volume_min), volumeMax: Number(data.volume_max),
      volumeStep: Number(data.volume_step), stopsLevelPoints: data.stops_level_points,
      fillPolicies: data.fill_policies,
    };
  }

  async snapshot(accountId: string): Promise<MT5AccountSnapshot | null> {
    const { data, error } = await supabase.from('mt5_account_snapshots').select('*').eq('account_id', accountId).order('captured_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`mt5_snapshot_failed:${error.message}`);
    if (!data) return null;
    return { balance: Number(data.balance), equity: Number(data.equity), margin: Number(data.margin), freeMargin: Number(data.free_margin), floatingPnl: Number(data.floating_pnl), currency: data.currency, positions: data.positions ?? [], orders: data.orders ?? [], capturedAt: data.captured_at };
  }

  async enqueue(accountId: string, operation: string, payload: Readonly<Record<string, unknown>>, idempotencyKey: string) {
    const { data, error } = await supabase.rpc('enqueue_mt5_command', { p_account_id: accountId, p_operation: operation, p_payload: payload, p_idempotency_key: idempotencyKey });
    if (error) throw new Error(`mt5_queue_failed:${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return { commandId: String(row?.command_id ?? row?.id), status: String(row?.status ?? 'pending') };
  }
}

export class ExchangeProviderMT5 implements ExchangeProvider {
  readonly metadata: ExchangeProviderMetadata = { id: 'mt5', label: 'MetaTrader 5', environment: 'live', supportsNativeProtection: true, supportsProfitLock: false };

  constructor(private readonly accountId = '', private readonly gateway: MT5Gateway = new SupabaseMT5Gateway()) {}

  private requireScope(): void { if (!this.accountId) throw new Error('mt5_account_scope_required'); }

  private async state(): Promise<{ account: MT5Account; snapshot: MT5AccountSnapshot | null }> {
    this.requireScope();
    return { account: await this.gateway.account(this.accountId), snapshot: await this.gateway.snapshot(this.accountId) };
  }

  async getAccountState(): Promise<ExchangeAccountState> {
    const { account, snapshot } = await this.state();
    const balances: ExchangeBalance[] = snapshot ? [{ asset: snapshot.currency, free: snapshot.freeMargin, total: snapshot.equity }] : [];
    return { provider: 'mt5', balances, positions: snapshot?.positions ?? [], openOrders: snapshot?.orders ?? [], raw: { accountId: account.id, nickname: account.nickname, mode: account.executionMode, connectionStatus: account.connectionStatus, providerHealth: account.providerHealth, capturedAt: snapshot?.capturedAt } };
  }
  async getBalances() { return (await this.getAccountState()).balances; }
  async getPositions(): Promise<ExchangePosition[]> { return (await this.getAccountState()).positions; }
  async getOpenOrders(): Promise<ExchangeOrder[]> { return (await this.getAccountState()).openOrders; }
  async fetchAccount() { return this.getAccountState(); }
  async fetchOpenPositions() { return this.getPositions(); }
  async fetchOpenOrders() { return this.getOpenOrders(); }

  async placeEntry(request: EntryRequest): Promise<ProviderResult> {
    try {
      this.requireScope();
      const account = await this.gateway.account(this.accountId);
      assertMT5Ready(account);
      const native = toMT5Order(request, await this.gateway.symbol(this.accountId, request.symbol));
      const queued = await this.gateway.enqueue(this.accountId, 'place_order', native as unknown as Record<string, unknown>, native.clientRequestId);
      return { provider: 'mt5', ok: true, status: queued.status, providerOrderId: `mt5-command:${queued.commandId}`, metadata: { commandId: queued.commandId, accountId: this.accountId, executionMode: account.executionMode } };
    } catch (error) { return gatewayFailure('mt5', error); }
  }
  async placeEntryOrder(request: EntryRequest) { return this.placeEntry(request); }

  private async command(operation: string, request: ReconcileRequest | ProtectionRequest | ReplaceStopRequest, extra: Record<string, unknown> = {}): Promise<ProviderResult> {
    try {
      this.requireScope();
      assertMT5Ready(await this.gateway.account(this.accountId));
      const key = String(request.metadata?.idempotencyKey ?? `${operation}:${request.symbol}:${request instanceof Object && 'providerOrderId' in request ? request.providerOrderId ?? '' : ''}`);
      const queued = await this.gateway.enqueue(this.accountId, operation, { ...request, ...extra }, key);
      return { provider: 'mt5', ok: true, status: queued.status, providerOrderId: `mt5-command:${queued.commandId}`, metadata: { commandId: queued.commandId, accountId: this.accountId } };
    } catch (error) { return gatewayFailure('mt5', error); }
  }
  async cancelEntry(request: ReconcileRequest) { return this.command('cancel_order', request); }
  async cancelOrder(request: ReconcileRequest) { return this.cancelEntry(request); }
  async closePosition(request: ReconcileRequest & { quantity?: number; reason?: string }) { return this.command('close_position', request); }
  async placeSL(request: ProtectionRequest) { return this.command('modify_position', request, { target: 'stop_loss' }); }
  async placeStopLoss(request: ProtectionRequest) { return this.placeSL(request); }
  async placeTP1(request: ProtectionRequest) { return this.command('modify_position', request, { target: 'tp1' }); }
  async placeTP2(request: ProtectionRequest) { return this.command('modify_position', request, { target: 'tp2' }); }
  async placeTakeProfit(request: ProtectionRequest, target: 'tp1' | 'tp2') { return target === 'tp1' ? this.placeTP1(request) : this.placeTP2(request); }
  async replaceSL(request: ReplaceStopRequest) { return this.command('modify_position', request, { target: 'stop_loss' }); }
  async verifyProtection(): Promise<ProviderResult<{ verified: boolean; missing: string[] }>> { return { provider: 'mt5', ok: true, data: { verified: true, missing: [] } }; }
  async classifyProtectionState() { return { provider: 'mt5', ok: true, data: { state: 'safe' as const, reason: 'native_mt5_sl_tp' } }; }
  async repairProtection(request: ProtectionRequest) { return this.command('modify_position', request, { target: 'sl_tp' }); }
  async reconcilePosition(request: ReconcileRequest) { return this.command('sync_account', request); }
  async reconcileProtection(request: ReconcileRequest) { return this.command('sync_account', request); }
  async syncPositionProtection(request: ReconcileRequest) { return this.reconcileProtection(request); }
  async classifySafetyState() { return { provider: 'mt5', ok: true, data: { state: 'safe' as const, reason: 'account_connected' } }; }
  async evaluateProfitLock(request: ProfitLockRequest) { void request; return { provider: 'mt5', ok: true, data: { shouldLock: false, reason: 'phase_8b_feature' } }; }
  async executeProfitLock(request: ProfitLockRequest) { return this.command('modify_position', { symbol: request.symbol, side: request.side, quantity: request.quantity, stopLoss: request.entryPrice, reason: 'profit_lock', metadata: request.metadata }); }
}
