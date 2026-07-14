import type { ExecutionStatus, MonitoringStatus, ProtectionStatus, RecoveryStatus, ReportingStatus, TradeLifecycleState } from '../../runtimeContracts/index.js';
import type {
  TradeTruthAuditEvent,
  TradeTruthCreateInput,
  TradeTruthError,
  TradeTruthEventType,
  TradeTruthMutationContext,
  TradeTruthRecord,
  TradeTruthRepository,
  TradeTruthResult,
} from './types.js';
import { assertImmutableIdentity, tradeTruthError, validateCreateInput, validateTransition } from './validation.js';

interface MutateOptions {
  eventType: TradeTruthEventType;
  nextLifecycle?: TradeLifecycleState;
  executionStatus?: ExecutionStatus;
  protectionStatus?: ProtectionStatus;
  monitoringStatus?: MonitoringStatus;
  recoveryStatus?: RecoveryStatus;
  reportingStatus?: ReportingStatus;
  patch?: Partial<TradeTruthRecord>;
}

export class TradeTruthService {
  private readonly idempotencyCache = new Map<string, TradeTruthRecord>();

  constructor(private readonly repository: TradeTruthRepository) {}

  async createTradeTruth(input: TradeTruthCreateInput, context: TradeTruthMutationContext): Promise<TradeTruthResult<TradeTruthRecord>> {
    const timestamp = context.timestamp ?? input.timestamp ?? new Date().toISOString();
    const validated = validateCreateInput({ ...input, timestamp });
    if ('code' in validated) return this.reject(validated, 'create', context, null, input.trade_id ? String(input.trade_id) : null, timestamp);

    const existing = await this.repository.getByTradeId(String(validated.trade_id));
    const idempotencyKey = context.idempotency_key ?? this.key('create', validated);
    if (existing) {
      if (this.sameCoreRecord(existing, validated)) return this.accept(existing, 'create', context, existing.trade_lifecycle_state, existing.trade_lifecycle_state, timestamp, true, idempotencyKey);
      return this.reject(tradeTruthError('immutable_identity_change', 'trade_id already exists with different canonical truth', { trade_id: String(validated.trade_id), writer: context.writer }), 'create', context, existing.trade_lifecycle_state, String(validated.trade_id), timestamp, idempotencyKey);
    }

    try {
      const created = await this.repository.create(validated);
      return this.accept(created, 'create', context, null, created.trade_lifecycle_state, timestamp, false, idempotencyKey);
    } catch (error) {
      return this.reject(this.repositoryError(error, String(validated.trade_id), context), 'create', context, null, String(validated.trade_id), timestamp, idempotencyKey);
    }
  }

  recordQualified(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'qualified', nextLifecycle: 'qualified' }); }
  recordPositionSized(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'position_sized', nextLifecycle: 'position_sized' }); }
  recordOrderSubmitted(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'order_submitted', nextLifecycle: 'order_submitted', executionStatus: 'submitted' }); }
  recordOrderAccepted(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'order_accepted', nextLifecycle: 'order_accepted', executionStatus: 'accepted' }); }
  recordFill(tradeId: string, context: TradeTruthMutationContext, patch: Partial<TradeTruthRecord> = {}) { return this.mutate(tradeId, context, { eventType: 'filled', nextLifecycle: 'filled', executionStatus: 'filled', patch }); }
  recordProtectionPending(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'protection_pending', nextLifecycle: 'protection_pending', protectionStatus: 'pending' }); }
  recordProtectionVerified(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'protection_verified', nextLifecycle: 'protection_verified', protectionStatus: 'verified', monitoringStatus: 'in_sync' }); }
  recordTp1(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'tp1', nextLifecycle: 'tp1' }); }
  recordBreakEven(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'break_even', nextLifecycle: 'break_even' }); }
  recordTp2(tradeId: string, context: TradeTruthMutationContext) { return this.mutate(tradeId, context, { eventType: 'tp2', nextLifecycle: 'tp2' }); }
  recordClosed(tradeId: string, context: TradeTruthMutationContext, closeReason?: string) { return this.mutate(tradeId, context, { eventType: 'closed', nextLifecycle: 'closed', patch: { closed_at: context.timestamp ?? new Date().toISOString(), close_reason: closeReason ?? null } }); }
  recordArchived(tradeId: string, context: TradeTruthMutationContext, archiveReason?: string) { return this.mutate(tradeId, context, { eventType: 'archived', nextLifecycle: 'archived', patch: { archive_reason: archiveReason ?? null } }); }
  recordMonitorObservation(tradeId: string, context: TradeTruthMutationContext, monitoringStatus: MonitoringStatus, patch: Partial<TradeTruthRecord> = {}) { return this.mutate(tradeId, context, { eventType: 'monitor_observation', monitoringStatus, patch }); }
  recordRecoveryStatus(tradeId: string, context: TradeTruthMutationContext, recoveryStatus: RecoveryStatus) { return this.mutate(tradeId, context, { eventType: 'recovery_status', recoveryStatus }); }
  recordReportingStatus(tradeId: string, context: TradeTruthMutationContext, reportingStatus: ReportingStatus) { return this.mutate(tradeId, context, { eventType: 'reporting_status', reportingStatus }); }

  private async mutate(tradeId: string, context: TradeTruthMutationContext, options: MutateOptions): Promise<TradeTruthResult<TradeTruthRecord>> {
    const timestamp = context.timestamp ?? new Date().toISOString();
    const current = await this.repository.getByTradeId(tradeId);
    const idempotencyKey = context.idempotency_key ?? this.key(options.eventType, current ?? { trade_id: tradeId });
    if (!current) return this.reject(tradeTruthError('missing_trade_id', `Trade not found: ${tradeId}`, { trade_id: tradeId, writer: context.writer }), options.eventType, context, null, tradeId, timestamp, idempotencyKey);

    const cached = this.idempotencyCache.get(idempotencyKey);
    if (cached && String(cached.trade_id) === tradeId) return this.accept(cached, options.eventType, context, current.trade_lifecycle_state, cached.trade_lifecycle_state, timestamp, true, idempotencyKey);

    const nextLifecycle = options.nextLifecycle ?? current.trade_lifecycle_state;
    const transitionError = validateTransition(current.trade_lifecycle_state, nextLifecycle, context, tradeId);
    if (transitionError) return this.reject(transitionError, options.eventType, context, current.trade_lifecycle_state, tradeId, timestamp, idempotencyKey);

    const next: TradeTruthRecord = {
      ...current,
      ...options.patch,
      trade_lifecycle_state: nextLifecycle,
      execution_status: options.executionStatus ?? current.execution_status,
      protection_status: options.protectionStatus ?? current.protection_status,
      monitoring_status: options.monitoringStatus ?? current.monitoring_status,
      recovery_status: options.recoveryStatus ?? current.recovery_status,
      reporting_status: options.reportingStatus ?? current.reporting_status,
      correlation_id: context.correlation_id ?? current.correlation_id ?? null,
      updated_at: timestamp,
      latest_sync_at: options.eventType === 'monitor_observation' ? timestamp : current.latest_sync_at,
      version: current.version + 1,
      metadata: { ...(current.metadata ?? {}), ...(context.metadata ?? {}) },
    };

    const immutableError = assertImmutableIdentity(current, next, context.writer);
    if (immutableError) return this.reject(immutableError, options.eventType, context, current.trade_lifecycle_state, tradeId, timestamp, idempotencyKey);

    try {
      const saved = await this.repository.updateWithVersion(next, current.version);
      this.idempotencyCache.set(idempotencyKey, saved);
      return this.accept(saved, options.eventType, context, current.trade_lifecycle_state, saved.trade_lifecycle_state, timestamp, false, idempotencyKey);
    } catch (error) {
      return this.reject(this.repositoryError(error, tradeId, context), options.eventType, context, current.trade_lifecycle_state, tradeId, timestamp, idempotencyKey);
    }
  }

  private sameCoreRecord(a: TradeTruthRecord, b: TradeTruthRecord): boolean {
    return String(a.trade_id) === String(b.trade_id)
      && String(a.provider_id) === String(b.provider_id)
      && String(a.environment_id) === String(b.environment_id)
      && String(a.account_id) === String(b.account_id)
      && a.symbol === b.symbol
      && a.position_side === b.position_side;
  }

  private key(eventType: string, record: Pick<TradeTruthRecord, 'trade_id'> | { trade_id: string }): string {
    return `${String(record.trade_id)}:${eventType}`;
  }

  private repositoryError(error: unknown, tradeId: string, context: TradeTruthMutationContext): TradeTruthError {
    const message = error instanceof Error ? error.message : String(error);
    return { code: 'repository_error', message, retryable: /timeout|connection|network|temporar/i.test(message), trade_id: tradeId, writer: context.writer };
  }

  private async appendAudit(event: TradeTruthAuditEvent): Promise<void> {
    await this.repository.appendAuditEvent(event).catch(() => undefined);
  }

  private accept(value: TradeTruthRecord, eventType: TradeTruthEventType, context: TradeTruthMutationContext, previous: TradeLifecycleState | null, next: TradeLifecycleState | null, timestamp: string, idempotent: boolean, idempotencyKey?: string | null): TradeTruthResult<TradeTruthRecord> {
    const audit: TradeTruthAuditEvent = { trade_id: String(value.trade_id), correlation_id: context.correlation_id ?? value.correlation_id ?? null, writer: context.writer, previous_state: previous, next_state: next, event_type: eventType, accepted: true, error_code: null, idempotency_key: idempotencyKey ?? null, timestamp, retryable: false, metadata: context.metadata };
    void this.appendAudit(audit);
    return { ok: true, value, audit, idempotent };
  }

  private reject(error: TradeTruthError, eventType: TradeTruthEventType, context: TradeTruthMutationContext, previous: TradeLifecycleState | null, tradeId: string | null, timestamp: string, idempotencyKey?: string | null): TradeTruthResult<TradeTruthRecord> {
    const audit: TradeTruthAuditEvent = { trade_id: tradeId ?? error.trade_id ?? null, correlation_id: context.correlation_id ?? null, writer: context.writer, previous_state: previous, next_state: error.attempted_state ?? null, event_type: eventType, accepted: false, error_code: error.code, idempotency_key: idempotencyKey ?? null, timestamp, retryable: error.retryable, metadata: context.metadata };
    void this.appendAudit(audit);
    return { ok: false, error, audit };
  }
}
