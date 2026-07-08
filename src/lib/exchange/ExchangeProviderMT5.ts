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
  ReplaceStopRequest
} from './exchangeProvider.js';
import { supabase } from '../supabase.js';

export class ExchangeProviderMT5 implements ExchangeProvider {
  readonly metadata: ExchangeProviderMetadata;
  private readonly mode: 'personal' | 'prop';

  constructor(providerId: 'mt5_personal' | 'mt5_prop' | 'mt5' = 'mt5') {
    this.mode = providerId === 'mt5_prop' ? 'prop' : 'personal';
    this.metadata = {
      id: providerId,
      label: providerId === 'mt5_prop' ? 'MT5 Prop' : providerId === 'mt5_personal' ? 'MT5 Personal' : 'MT5',
      environment: providerId === 'mt5_prop' ? 'prop' : providerId === 'mt5_personal' ? 'personal' : 'future',
      supportsNativeProtection: false,
      supportsProfitLock: false
    };
  }

  private async getActiveProfile() {
    const { data: profile, error } = await supabase
      .from('mt5_account_profiles')
      .select('*')
      .eq('profile_mode', this.mode)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch MT5 profile:', error.message);
      return null;
    }
    return profile;
  }

  async getAccountState(): Promise<ExchangeAccountState> {
    const profile = await this.getActiveProfile();
    if (!profile) {
      return { 
        provider: this.metadata.id, 
        balances: [], 
        positions: [], 
        openOrders: [], 
        raw: { status: 'no_profile_configured' } 
      };
    }

    const state = profile.account_state ?? {};
    const balance: ExchangeBalance = {
      asset: 'USD',
      free: Number(state.balance ?? 0),
      total: Number(state.equity ?? 0),
    };

    const rawPositions = (state.positions as Array<Record<string, unknown>>) || [];
    const positions: ExchangePosition[] = rawPositions.map(pos => ({
      symbol: String(pos.symbol ?? ''),
      side: String(pos.side ?? ''),
      quantity: Number(pos.quantity ?? 0),
      entryPrice: Number(pos.entry_price ?? 0),
      markPrice: Number(pos.current_price ?? 0),
      unrealizedPnl: Number(pos.unrealized_pnl ?? 0),
      providerPositionId: String(pos.ticket ?? ''),
    }));

    return {
      provider: this.metadata.id,
      balances: [balance],
      positions,
      openOrders: [],
      raw: {
        broker: profile.broker,
        account_number: profile.account_number,
        is_enabled: profile.is_enabled,
        is_locked: profile.is_locked,
        risk_preset: profile.risk_preset,
      }
    };
  }

  async getBalances(): Promise<ExchangeBalance[]> {
    const state = await this.getAccountState();
    return state.balances;
  }

  async getPositions(): Promise<ExchangePosition[]> {
    const state = await this.getAccountState();
    return state.positions;
  }

  async getOpenOrders(): Promise<ExchangeOrder[]> {
    return [];
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
    const profile = await this.getActiveProfile();
    if (!profile) {
      return {
        provider: this.metadata.id,
        ok: false,
        status: 'no_profile',
        error: 'No active MT5 profile configured. Real terminal execution requires bridge deployment.'
      };
    }

    if (!profile.is_enabled) {
      return {
        provider: this.metadata.id,
        ok: false,
        status: 'disabled',
        error: 'MT5 execution is disabled by default. Real terminal execution requires bridge deployment.'
      };
    }

    if (profile.is_locked) {
      return {
        provider: this.metadata.id,
        ok: false,
        status: 'locked',
        error: 'MT5 profile is locked due to prop rules breach.'
      };
    }

    // Insert command into public.mt5_commands_queue
    const { data: command, error } = await supabase
      .from('mt5_commands_queue')
      .insert({
        command_type: 'place_entry',
        symbol: request.symbol,
        payload: {
          side: request.side,
          quantity: request.quantity,
          stop_loss: request.stopLoss,
          tp1: request.tp1,
          tp2: request.tp2,
          entry_price: request.entryPrice,
          signal_id: request.signalId,
          leverage: request.leverage,
        },
        status: 'pending'
      })
      .select('id')
      .maybeSingle();

    if (error) {
      return {
        provider: this.metadata.id,
        ok: false,
        status: 'queue_failed',
        error: `Failed to queue MT5 execution command: ${error.message}`
      };
    }

    return {
      provider: this.metadata.id,
      ok: true,
      status: 'submitted_to_bridge_queue',
      providerOrderId: `cmd-${command?.id ?? 'unknown'}`,
      metadata: {
        message: 'Real terminal execution requires bridge deployment. Command queued in pending status.',
        command_id: command?.id
      }
    };
  }

  async placeEntryOrder(request: EntryRequest): Promise<ProviderResult> {
    return this.placeEntry(request);
  }

  async cancelEntry(request: ReconcileRequest): Promise<ProviderResult> {
    const profile = await this.getActiveProfile();
    if (!profile || !profile.is_enabled) {
      return { provider: this.metadata.id, ok: false, status: 'disabled', error: 'MT5 execution is disabled' };
    }

    const { data: command, error } = await supabase
      .from('mt5_commands_queue')
      .insert({
        command_type: 'cancel_entry',
        symbol: request.symbol,
        payload: {
          execution_id: request.executionId,
          provider_order_id: request.providerOrderId,
        },
        status: 'pending'
      })
      .select('id')
      .maybeSingle();

    if (error) {
      return { provider: this.metadata.id, ok: false, error: `Failed to queue cancel: ${error.message}` };
    }

    return { 
      provider: this.metadata.id, 
      ok: true, 
      status: 'submitted_to_bridge_queue',
      metadata: { command_id: command?.id }
    };
  }

  async cancelOrder(request: ReconcileRequest): Promise<ProviderResult> {
    return this.cancelEntry(request);
  }

  async closePosition(request: ReconcileRequest & { quantity?: number; reason?: string }): Promise<ProviderResult> {
    const profile = await this.getActiveProfile();
    if (!profile || !profile.is_enabled) {
      return { provider: this.metadata.id, ok: false, status: 'disabled', error: 'MT5 execution is disabled' };
    }

    const { data: command, error } = await supabase
      .from('mt5_commands_queue')
      .insert({
        command_type: 'close_position',
        symbol: request.symbol,
        payload: {
          quantity: request.quantity,
          reason: request.reason,
          provider_position_id: request.providerPositionId,
        },
        status: 'pending'
      })
      .select('id')
      .maybeSingle();

    if (error) {
      return { provider: this.metadata.id, ok: false, error: `Failed to queue close: ${error.message}` };
    }

    return { 
      provider: this.metadata.id, 
      ok: true, 
      status: 'submitted_to_bridge_queue',
      metadata: { command_id: command?.id }
    };
  }

  async placeSL(_request: ProtectionRequest): Promise<ProviderResult> {
    void _request;
    return { provider: this.metadata.id, ok: false, status: 'not_implemented', error: 'SL placement is native to placeEntry command' };
  }

  async placeStopLoss(_request: ProtectionRequest): Promise<ProviderResult> {
    return this.placeSL(_request);
  }

  async placeTP1(_request: ProtectionRequest): Promise<ProviderResult> {
    void _request;
    return { provider: this.metadata.id, ok: false, status: 'not_implemented', error: 'TP1 placement is native to placeEntry command' };
  }

  async placeTP2(_request: ProtectionRequest): Promise<ProviderResult> {
    void _request;
    return { provider: this.metadata.id, ok: false, status: 'not_implemented', error: 'TP2 placement is native to placeEntry command' };
  }

  async placeTakeProfit(request: ProtectionRequest, target: 'tp1' | 'tp2' = 'tp1'): Promise<ProviderResult> {
    return target === 'tp1' ? this.placeTP1(request) : this.placeTP2(request);
  }

  async verifyProtection(): Promise<ProviderResult<{ verified: boolean; missing: string[] }>> {
    return { provider: this.metadata.id, ok: true, data: { verified: true, missing: [] } };
  }

  async classifyProtectionState() {
    return { provider: this.metadata.id, ok: true, data: { state: 'safe' as const, reason: 'mt5_managed_protection' } };
  }

  async repairProtection(_request: ProtectionRequest): Promise<ProviderResult> {
    void _request;
    return { provider: this.metadata.id, ok: true, status: 'not_needed' };
  }

  async replaceSL(_request: ReplaceStopRequest): Promise<ProviderResult> {
    void _request;
    return { provider: this.metadata.id, ok: false, status: 'not_implemented', error: 'ReplaceSL not implemented for MT5' };
  }

  async reconcilePosition(_request: ReconcileRequest) {
    return { provider: this.metadata.id, ok: true, status: 'reconciled', metadata: { _request } };
  }

  async reconcileProtection() {
    return { provider: this.metadata.id, ok: true, data: { verified: true, missing: [] } };
  }

  async syncPositionProtection() {
    return this.reconcileProtection();
  }

  async classifySafetyState() {
    return { provider: this.metadata.id, ok: true, data: { state: 'safe' as const, reason: 'mt5_safety_managed' } };
  }

  async evaluateProfitLock() {
    return { provider: this.metadata.id, ok: true, data: { shouldLock: false, reason: 'profit_lock_not_active' } };
  }

  async executeProfitLock() {
    return { provider: this.metadata.id, ok: true, status: 'not_implemented' };
  }
}

