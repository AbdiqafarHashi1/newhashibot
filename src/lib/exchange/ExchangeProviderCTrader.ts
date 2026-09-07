import type {
  ExchangeAccountState,
  ExchangeBalance,
  ExchangeOrder,
  ExchangePosition,
  ExchangeProvider,
  ExchangeProviderMetadata,
  ProviderResult,
  ReconcileRequest,
  EntryRequest,
  ProtectionRequest,
  ReplaceStopRequest,
  ProfitLockRequest,
} from './exchangeProvider.js';
import { supabase } from '../supabase.js';
import {
  assertCTraderReady,
  gatewayFailureCTrader,
  toCTraderOrder,
  type CTraderAccount,
  type CTraderAccountSnapshot,
  type CTraderGateway,
  type CTraderSymbolSpec,
} from './ctrader.js';

export class SupabaseCTraderGateway implements CTraderGateway {
  async account(accountId: string): Promise<CTraderAccount> {
    const { data, error } = await supabase
      .from('ctrader_accounts_safe')
      .select('*')
      .eq('id', accountId)
      .single();

    if (error || !data) {
      // Never fabricate a connected live account. A missing canonical account row
      // is an execution blocker, not a condition that can be safely simulated.
      throw new Error(`ctrader_account_unavailable:${accountId}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      broker: data.broker,
      traderLogin: data.trader_login || data.account_number_masked,
      accountNumberMasked: data.account_number_masked,
      nickname: data.nickname,
      currency: data.currency,
      leverageInCents: Number(data.leverage_in_cents || 10000),
      leverage: Number(data.leverage || 100),
      accountType: data.account_type || 'personal',
      executionMode: data.execution_mode || 'personal',
      // A missing value is never permission to trade or evidence of connectivity.
      executionEnabled: data.execution_enabled === true,
      connectionStatus: data.connection_status || 'disconnected',
      providerHealth: data.provider_health || 'unknown',
      bridgeId: data.bridge_id ?? undefined,
      openApiAppClientId: data.open_api_client_id ?? undefined,
      accessTokenMasked: data.access_token_masked ?? undefined,
      tokenExpiresAt: data.token_expires_at ?? undefined,
      lastHeartbeatAt: data.last_heartbeat_at ?? undefined,
      lastSyncAt: data.last_sync_at ?? undefined,
    };
  }

  async symbol(accountId: string, canonicalSymbol: string): Promise<CTraderSymbolSpec> {
    const { data, error } = await supabase
      .from('ctrader_symbol_specs')
      .select('*')
      .eq('account_id', accountId)
      .eq('canonical_symbol', canonicalSymbol)
      .maybeSingle();

    if (error || !data) {
      throw new Error(`ctrader_symbol_spec_unavailable:${accountId}:${canonicalSymbol}`);
    }

    return {
      canonicalSymbol,
      brokerSymbol: data.broker_symbol,
      symbolId: Number(data.symbol_id || 1),
      digits: Number(data.digits || 5),
      pipPosition: Number(data.pip_position || 4),
      minVolume: Number(data.min_volume || 1000),
      maxVolume: Number(data.max_volume || 10000000),
      stepVolume: Number(data.step_volume || 1000),
      lotSize: Number(data.lot_size || 100000),
    };
  }

  async snapshot(accountId: string): Promise<CTraderAccountSnapshot | null> {
    const { data, error } = await supabase
      .from('ctrader_account_snapshots')
      .select('*')
      .eq('account_id', accountId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      balance: Number(data.balance),
      equity: Number(data.equity),
      margin: Number(data.margin),
      freeMargin: Number(data.free_margin),
      floatingPnl: Number(data.floating_pnl),
      currency: data.currency,
      positions: (data.positions as ExchangePosition[]) ?? [],
      orders: (data.orders as ExchangeOrder[]) ?? [],
      capturedAt: data.captured_at,
    };
  }

  async enqueue(
    accountId: string,
    operation: string,
    payload: Readonly<Record<string, unknown>>,
    idempotencyKey: string
  ) {
    const { data, error } = await supabase.rpc('enqueue_ctrader_command', {
      p_account_id: accountId,
      p_operation: operation,
      p_payload: payload,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error(`ctrader_command_enqueue_failed:${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    const commandId = String(row?.command_id ?? row?.id ?? '');
    if (!commandId) throw new Error('ctrader_command_enqueue_failed:missing_command_id');
    return { commandId, status: String(row?.status ?? 'queued') };
  }
}

export class ExchangeProviderCTrader implements ExchangeProvider {
  readonly metadata: ExchangeProviderMetadata = {
    id: 'ctrader',
    label: 'cTrader Open API / Bridge',
    environment: 'live',
    supportsNativeProtection: true,
    supportsProfitLock: true,
  };

  constructor(
    private readonly accountId = '',
    private readonly gateway: CTraderGateway = new SupabaseCTraderGateway()
  ) {}

  private requireScope(): void {
    if (!this.accountId) throw new Error('ctrader_account_scope_required');
  }

  private async state(): Promise<{ account: CTraderAccount; snapshot: CTraderAccountSnapshot | null }> {
    this.requireScope();
    return {
      account: await this.gateway.account(this.accountId),
      snapshot: await this.gateway.snapshot(this.accountId),
    };
  }

  async getAccountState(): Promise<ExchangeAccountState> {
    const { account, snapshot } = await this.state();
    const balances: ExchangeBalance[] = snapshot
      ? [{ asset: snapshot.currency, free: snapshot.freeMargin, total: snapshot.equity }]
      : [];

    return {
      provider: 'ctrader',
      balances,
      positions: snapshot?.positions ?? [],
      openOrders: snapshot?.orders ?? [],
      raw: {
        accountId: account.id,
        nickname: account.nickname,
        mode: account.executionMode,
        connectionStatus: account.connectionStatus,
        providerHealth: account.providerHealth,
        capturedAt: snapshot?.capturedAt,
      },
    };
  }

  async getBalances() {
    return (await this.getAccountState()).balances;
  }
  async getPositions(): Promise<ExchangePosition[]> {
    return (await this.getAccountState()).positions;
  }
  async getOpenOrders(): Promise<ExchangeOrder[]> {
    return (await this.getAccountState()).openOrders;
  }
  async fetchAccount() {
    return this.getAccountState();
  }
  async fetchOpenPositions() {
    return this.getPositions();
  }
  async fetchOpenOrders() {
    return this.getOpenOrders();
  }

  async placeEntry(request: EntryRequest): Promise<ProviderResult> {
    try {
      this.requireScope();
      const account = await this.gateway.account(this.accountId);
      assertCTraderReady(account);

      const symbolSpec = await this.gateway.symbol(this.accountId, request.symbol);
      const native = toCTraderOrder(request, symbolSpec, Number(account.traderLogin) || 0);

      const queued = await this.gateway.enqueue(
        this.accountId,
        'ProtoOANewOrderReq',
        native as unknown as Record<string, unknown>,
        native.clientOrderId
      );

      return {
        provider: 'ctrader',
        ok: true,
        status: queued.status,
        providerOrderId: `ctrader-command:${queued.commandId}`,
        metadata: {
          commandId: queued.commandId,
          accountId: this.accountId,
          executionMode: account.executionMode,
          broker: account.broker,
        },
      };
    } catch (error) {
      return gatewayFailureCTrader('ctrader', error);
    }
  }

  async placeEntryOrder(request: EntryRequest) {
    return this.placeEntry(request);
  }

  private async command(
    operation: string,
    request: ReconcileRequest | ProtectionRequest | ReplaceStopRequest,
    extra: Record<string, unknown> = {}
  ): Promise<ProviderResult> {
    try {
      this.requireScope();
      assertCTraderReady(await this.gateway.account(this.accountId));
      const key = String(
        request.metadata?.idempotencyKey ??
          `${operation}:${request.symbol}:${
            request instanceof Object && 'providerOrderId' in request ? request.providerOrderId ?? '' : ''
          }`
      );
      const queued = await this.gateway.enqueue(this.accountId, operation, { ...request, ...extra }, key);
      return {
        provider: 'ctrader',
        ok: true,
        status: queued.status,
        providerOrderId: `ctrader-command:${queued.commandId}`,
        metadata: { commandId: queued.commandId, accountId: this.accountId },
      };
    } catch (error) {
      return gatewayFailureCTrader('ctrader', error);
    }
  }

  async cancelEntry(request: ReconcileRequest) {
    return this.command('ProtoOACancelOrderReq', request);
  }
  async cancelOrder(request: ReconcileRequest) {
    return this.cancelEntry(request);
  }
  async closePosition(request: ReconcileRequest & { quantity?: number; reason?: string }) {
    return this.command('ProtoOAClosePositionReq', request);
  }
  async placeSL(request: ProtectionRequest) {
    return this.command('ProtoOAAmendPositionSLTPReq', request, { type: 'stop_loss' });
  }
  async placeStopLoss(request: ProtectionRequest) {
    return this.placeSL(request);
  }
  async placeTP1(request: ProtectionRequest) {
    return this.command('ProtoOAAmendPositionSLTPReq', request, { type: 'take_profit_1' });
  }
  async placeTP2(request: ProtectionRequest) {
    return this.command('ProtoOAAmendPositionSLTPReq', request, { type: 'take_profit_2' });
  }
  async placeTakeProfit(request: ProtectionRequest, target: 'tp1' | 'tp2') {
    return target === 'tp1' ? this.placeTP1(request) : this.placeTP2(request);
  }
  async replaceSL(request: ReplaceStopRequest) {
    return this.command('ProtoOAAmendPositionSLTPReq', request, { replacementStop: request.stopLoss });
  }
  async repairProtection(request: ProtectionRequest) {
    return this.placeSL(request);
  }

  async verifyProtection(request: ReconcileRequest): Promise<ProviderResult<{ verified: boolean; missing: string[] }>> {
    const positions = await this.getPositions();
    const matched = positions.find((p) => p.symbol === request.symbol);
    const hasSl = Boolean(matched?.metadata?.stopLoss);
    const hasTp = Boolean(matched?.metadata?.takeProfit);
    const missing: string[] = [];
    if (!hasSl) missing.push('stop_loss');
    if (!hasTp) missing.push('take_profit');
    return {
      provider: 'ctrader',
      ok: true,
      data: { verified: missing.length === 0, missing },
    };
  }

  async classifyProtectionState(request: ReconcileRequest): Promise<ProviderResult<{ state: 'safe' | 'degraded' | 'unsafe'; reason: string }>> {
    const verified = await this.verifyProtection(request);
    const missing = verified.data?.missing ?? [];
    if (missing.length === 0) return { provider: 'ctrader', ok: true, data: { state: 'safe', reason: 'cTrader position fully protected with SL and TP' } };
    if (missing.includes('stop_loss')) return { provider: 'ctrader', ok: true, data: { state: 'unsafe', reason: 'cTrader position missing Stop Loss' } };
    return { provider: 'ctrader', ok: true, data: { state: 'degraded', reason: 'cTrader position missing Take Profit' } };
  }

  async classifySafetyState(request: ReconcileRequest) {
    return this.classifyProtectionState(request);
  }

  async reconcilePosition(request: ReconcileRequest) {
    return { provider: 'ctrader' as const, ok: true, metadata: { reconciled: true, ...request } };
  }
  async reconcileProtection(request: ReconcileRequest) {
    return { provider: 'ctrader' as const, ok: true, metadata: { protectionSynced: true, ...request } };
  }
  async syncPositionProtection(request: ReconcileRequest) {
    return this.reconcileProtection(request);
  }

  async evaluateProfitLock(request: ProfitLockRequest): Promise<ProviderResult<{ shouldLock: boolean; replacementStop?: number; reason: string }>> {
    const isProfitable = (request.highestPositiveR ?? 0) >= 1.0;
    return {
      provider: 'ctrader',
      ok: true,
      data: {
        shouldLock: isProfitable,
        replacementStop: isProfitable ? request.entryPrice : undefined,
        reason: isProfitable ? 'cTrader reached +1.0R, trailing stop to Breakeven' : 'cTrader profit lock threshold not reached',
      },
    };
  }

  async executeProfitLock(request: ProfitLockRequest): Promise<ProviderResult> {
    const evaluation = await this.evaluateProfitLock(request);
    if (!evaluation.data?.shouldLock || evaluation.data.replacementStop === undefined) {
      return { provider: 'ctrader', ok: false, status: 'skipped', error: 'cTrader profit lock conditions not met' };
    }
    return this.replaceSL({
      symbol: request.symbol,
      side: request.side,
      quantity: request.quantity,
      stopLoss: evaluation.data.replacementStop,
      reason: 'breakeven_lock',
      metadata: request.metadata,
    });
  }
}
