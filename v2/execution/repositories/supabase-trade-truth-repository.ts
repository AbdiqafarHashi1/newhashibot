import type { ExchangeProviderId } from '../exchange-provider.js';
import type { ArchiveReason, TradeTruthCreate, TradeTruthPatch, TradeTruthQuery, TradeTruthRecord, TradeTruthRepository } from '../trade-truth-store.js';

type Query = { select(c?: string): Query; eq(c: string, v: unknown): Query; neq(c: string, v: unknown): Query; in(c: string, v: unknown[]): Query; order(c: string, o?: { ascending?: boolean }): Query; limit(n: number): Query; maybeSingle(): Promise<{ data: TradeTruthRecord | null; error: unknown }>; insert(v: unknown): Query; update(v: unknown): Query; upsert(v: unknown, o?: unknown): Query; } & PromiseLike<{ data: TradeTruthRecord[] | null; error: unknown }>;
export interface SupabaseLike { from(table: string): Query; rpc?(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>; }

function throwIf(error: unknown): void { if (error) throw new Error(typeof error === 'object' && error && 'message' in error ? String((error as {message:unknown}).message) : String(error)); }
function active(q: Query, include = false): Query { return include ? q : q.eq('archived_at', null); }

export class SupabaseTradeTruthRepository implements TradeTruthRepository {
  constructor(private readonly supabase: SupabaseLike, private readonly table = 'v2_trade_truth') {}
  private tableQ(): Query { return this.supabase.from(this.table); }
  private async one(q: Query): Promise<TradeTruthRecord> { const { data, error } = await q.select('*').maybeSingle(); throwIf(error); if (!data) throw new Error('trade_truth_not_found'); return data; }
  private async many(q: Query): Promise<TradeTruthRecord[]> { const { data, error } = await q.select('*').order('updated_at', { ascending: false }); throwIf(error); return data ?? []; }
  createTradeTruth(record: TradeTruthCreate): Promise<TradeTruthRecord> { return this.one(this.tableQ().upsert(record, { onConflict: 'trade_id' })); }
  updateExecutionState(tradeId: string, patch: TradeTruthPatch): Promise<TradeTruthRecord> { return this.patch(tradeId, patch); }
  updateProtectionState(tradeId: string, patch: TradeTruthPatch): Promise<TradeTruthRecord> { return this.patch(tradeId, patch); }
  updatePositionState(tradeId: string, patch: TradeTruthPatch): Promise<TradeTruthRecord> { return this.patch(tradeId, patch); }
  updateRecoveryState(tradeId: string, patch: TradeTruthPatch): Promise<TradeTruthRecord> { return this.patch(tradeId, patch); }
  updateVerificationState(tradeId: string, patch: TradeTruthPatch): Promise<TradeTruthRecord> { return this.patch(tradeId, patch); }
  private patch(tradeId: string, patch: TradeTruthPatch): Promise<TradeTruthRecord> { return this.one(this.tableQ().update({ ...patch, updated_at: new Date().toISOString() }).eq('trade_id', tradeId)); }
  readByTradeId(tradeId: string): Promise<TradeTruthRecord | null> { return this.tableQ().select('*').eq('trade_id', tradeId).maybeSingle().then(r => { throwIf(r.error); return r.data; }); }
  readByProvider(provider: ExchangeProviderId): Promise<TradeTruthRecord[]> { return this.many(active(this.tableQ(), false).eq('provider', provider)); }
  readByCustomer(customerId: string): Promise<TradeTruthRecord[]> { return this.many(active(this.tableQ(), false).eq('customer_id', customerId)); }
  readBySymbol(symbol: string): Promise<TradeTruthRecord[]> { return this.many(active(this.tableQ(), false).eq('symbol', symbol)); }
  readByPositionId(positionId: string): Promise<TradeTruthRecord[]> { return this.many(active(this.tableQ(), false).eq('position_id', positionId)); }
  readActiveTrades(query: TradeTruthQuery = {}): Promise<TradeTruthRecord[]> { let q = active(this.tableQ(), query.includeArchived).neq('status', 'closed').neq('status', 'archived'); if (query.provider) q = q.eq('provider', query.provider); if (query.customerId) q = q.eq('customer_id', query.customerId); if (query.symbol) q = q.eq('symbol', query.symbol); if (query.positionId) q = q.eq('position_id', query.positionId); return this.many(q); }
  readOrphanTrades(): Promise<TradeTruthRecord[]> { return this.many(active(this.tableQ()).eq('protection_status', 'orphan')); }
  readUnprotectedTrades(): Promise<TradeTruthRecord[]> { return this.many(active(this.tableQ()).eq('protection_missing', true).neq('status', 'closed')); }
  readFailedTrades(): Promise<TradeTruthRecord[]> { return this.many(active(this.tableQ()).eq('status', 'failed')); }
  async archiveClosedTrades(before = new Date().toISOString()): Promise<number> { if (this.supabase.rpc) { const { data, error } = await this.supabase.rpc('v2_archive_closed_trade_truth', { p_before: before }); throwIf(error); return Number(data ?? 0); } const rows = await this.many(this.tableQ().eq('status', 'closed').eq('archived_at', null)); await Promise.all(rows.map(r => this.patch(r.trade_id, { status: 'archived', archived_at: before, archive_reason: 'closed' as ArchiveReason }))); return rows.length; }
  findForReconciliation(query: { tradeId?: string; exchangeOrderId?: string; clientOrderId?: string; provider?: ExchangeProviderId; customerId?: string; positionId?: string; symbol?: string }): Promise<TradeTruthRecord[]> { let q = active(this.tableQ()); if (query.tradeId) q = q.eq('trade_id', query.tradeId); if (query.exchangeOrderId) q = q.eq('exchange_order_id', query.exchangeOrderId); if (query.clientOrderId) q = q.eq('client_order_id', query.clientOrderId); if (query.provider) q = q.eq('provider', query.provider); if (query.customerId) q = q.eq('customer_id', query.customerId); if (query.positionId) q = q.eq('position_id', query.positionId); if (query.symbol) q = q.eq('symbol', query.symbol); return this.many(q); }
}
