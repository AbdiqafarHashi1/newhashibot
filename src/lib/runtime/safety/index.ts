export interface LeaseRecord { lease_key: string; owner_id: string; run_id: string; acquired_at: string; heartbeat_at: string; expires_at: string; }
export interface SupabaseRpcLike { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message?: string } | null }>; }
export interface LeaseAcquireInput { leaseKey: string; ownerId: string; runId: string; ttlSeconds: number; now?: string; }

export class SupabaseWorkerLeaseRepository {
  constructor(private readonly supabase: SupabaseRpcLike) {}
  async acquire(input: LeaseAcquireInput): Promise<LeaseRecord | null> { const { data, error } = await this.supabase.rpc('acquire_runtime_worker_lease', { p_lease_key: input.leaseKey, p_owner_id: input.ownerId, p_run_id: input.runId, p_ttl_seconds: input.ttlSeconds, p_now: input.now ?? new Date().toISOString() }); if (error) throw new Error(error.message ?? 'lease_acquire_failed'); return (data as LeaseRecord | null) ?? null; }
  async renew(input: LeaseAcquireInput): Promise<LeaseRecord | null> { const { data, error } = await this.supabase.rpc('renew_runtime_worker_lease', { p_lease_key: input.leaseKey, p_owner_id: input.ownerId, p_run_id: input.runId, p_ttl_seconds: input.ttlSeconds, p_now: input.now ?? new Date().toISOString() }); if (error) throw new Error(error.message ?? 'lease_renew_failed'); return (data as LeaseRecord | null) ?? null; }
  async release(input: Pick<LeaseAcquireInput, 'leaseKey' | 'ownerId' | 'runId'>): Promise<boolean> { const { data, error } = await this.supabase.rpc('release_runtime_worker_lease', { p_lease_key: input.leaseKey, p_owner_id: input.ownerId, p_run_id: input.runId }); if (error) throw new Error(error.message ?? 'lease_release_failed'); return Boolean(data); }
}

export interface RuntimeEventInput { event_type: string; canonical_event_id: string; idempotency_key: string; trade_id?: string | null; provider_id?: string | null; payload?: Record<string, unknown>; }
export interface RuntimeEventRecord extends RuntimeEventInput { first_seen_at: string; last_seen_at: string; occurrence_count: number; }
export class PersistentRuntimeEventStore {
  constructor(private readonly supabase: SupabaseRpcLike) {}
  async recordEvent(input: RuntimeEventInput): Promise<{ inserted: boolean; event: RuntimeEventRecord }> { const { data, error } = await this.supabase.rpc('record_runtime_event_idempotency', { p_event_type: input.event_type, p_canonical_event_id: input.canonical_event_id, p_idempotency_key: input.idempotency_key, p_trade_id: input.trade_id ?? null, p_provider_id: input.provider_id ?? null, p_payload: input.payload ?? {} }); if (error) throw new Error(error.message ?? 'runtime_event_record_failed'); return data as { inserted: boolean; event: RuntimeEventRecord }; }
}

export interface IncidentInput { fingerprint: string; severity: 'low' | 'medium' | 'high' | 'critical'; source: string; retryable: boolean; message: string; details?: Record<string, unknown>; }
export interface IncidentRecord extends IncidentInput { incident_id: string; first_seen_at: string; last_seen_at: string; occurrence_count: number; status: 'open' | 'acknowledged' | 'resolved'; }
export class PersistentIncidentRepository {
  constructor(private readonly supabase: SupabaseRpcLike) {}
  async recordIncident(input: IncidentInput): Promise<IncidentRecord> { const { data, error } = await this.supabase.rpc('record_runtime_incident', { p_fingerprint: input.fingerprint, p_severity: input.severity, p_source: input.source, p_retryable: input.retryable, p_message: input.message, p_details: input.details ?? {} }); if (error) throw new Error(error.message ?? 'runtime_incident_record_failed'); return data as IncidentRecord; }
}
