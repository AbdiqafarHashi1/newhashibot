export interface WorkerLease { key: string; owner: string; acquired_at: string; expires_at: string; heartbeat_at: string; }
export interface RetryPolicy { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; maxRunMs: number; maxBatchSize: number; }
export const DEFAULT_RUNTIME_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 10_000, maxRunMs: 120_000, maxBatchSize: 50 };
export function retryDelayMs(attempt: number, policy = DEFAULT_RUNTIME_RETRY_POLICY): number { return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1)); }
export function incidentFingerprint(parts: Array<string | number | null | undefined>): string { return parts.map((part) => String(part ?? 'none').toLowerCase().trim()).join(':'); }
export class InMemoryWorkerLeaseManager {
  private leases = new Map<string, WorkerLease>();
  acquire(key: string, owner: string, ttlMs: number, now = new Date()): WorkerLease | null { const current = this.leases.get(key); if (current && new Date(current.expires_at).getTime() > now.getTime()) return null; const lease = { key, owner, acquired_at: now.toISOString(), heartbeat_at: now.toISOString(), expires_at: new Date(now.getTime() + ttlMs).toISOString() }; this.leases.set(key, lease); return lease; }
  heartbeat(key: string, owner: string, ttlMs: number, now = new Date()): boolean { const current = this.leases.get(key); if (!current || current.owner !== owner) return false; current.heartbeat_at = now.toISOString(); current.expires_at = new Date(now.getTime() + ttlMs).toISOString(); return true; }
  release(key: string, owner: string): boolean { const current = this.leases.get(key); if (!current || current.owner !== owner) return false; return this.leases.delete(key); }
}
