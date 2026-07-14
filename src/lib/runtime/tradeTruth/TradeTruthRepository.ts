import type { TradeTruthAuditEvent, TradeTruthRecord, TradeTruthRepository } from './types.js';

export class InMemoryTradeTruthRepository implements TradeTruthRepository {
  private records = new Map<string, TradeTruthRecord>();
  readonly auditEvents: TradeTruthAuditEvent[] = [];

  async getByTradeId(tradeId: string): Promise<TradeTruthRecord | null> {
    return this.records.get(tradeId) ?? null;
  }

  async getActiveByProviderAccountSymbol(providerId: string, accountId: string, symbol: string): Promise<TradeTruthRecord[]> {
    return Array.from(this.records.values()).filter((record) =>
      String(record.provider_id) === providerId
      && String(record.account_id) === accountId
      && record.symbol === symbol
      && record.trade_lifecycle_state !== 'closed'
      && record.trade_lifecycle_state !== 'archived'
    );
  }

  async create(record: TradeTruthRecord): Promise<TradeTruthRecord> {
    this.records.set(String(record.trade_id), record);
    return record;
  }

  async updateWithVersion(record: TradeTruthRecord, expectedVersion: number): Promise<TradeTruthRecord> {
    const current = this.records.get(String(record.trade_id));
    if (current && current.version !== expectedVersion) throw new Error(`version_conflict:${String(record.trade_id)}:${expectedVersion}:${current.version}`);
    this.records.set(String(record.trade_id), record);
    return record;
  }

  async upsertCompatibilityRecord(record: TradeTruthRecord): Promise<TradeTruthRecord> {
    const current = this.records.get(String(record.trade_id));
    const next = current ? { ...record, created_at: current.created_at, version: current.version + 1 } : record;
    this.records.set(String(record.trade_id), next);
    return next;
  }

  async appendAuditEvent(event: TradeTruthAuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }
}
