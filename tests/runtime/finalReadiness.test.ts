import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reduceAuthResilience, INITIAL_AUTH_RESILIENCE_STATE } from '../../src/lib/auth/authResilience.js';
import { PersistentIncidentRepository, PersistentRuntimeEventStore, SupabaseWorkerLeaseRepository } from '../../src/lib/runtime/safety/index.js';
import { ReportingPipeline, telegramDeliveryKey } from '../../src/lib/runtime/reporting/index.js';

class FakeSupabase {
  leases = new Map<string, any>(); events = new Map<string, any>(); incidents = new Map<string, any>();
  async rpc(fn: string, args: Record<string, any>) {
    if (fn === 'acquire_runtime_worker_lease') { const now = new Date(args.p_now); const key = args.p_lease_key; const current = this.leases.get(key); if (current && new Date(current.expires_at) > now && current.owner_id !== args.p_owner_id) return { data: null, error: null }; const row = { lease_key: key, owner_id: args.p_owner_id, run_id: args.p_run_id, acquired_at: now.toISOString(), heartbeat_at: now.toISOString(), expires_at: new Date(now.getTime() + args.p_ttl_seconds * 1000).toISOString() }; this.leases.set(key, row); return { data: row, error: null }; }
    if (fn === 'renew_runtime_worker_lease') { const row = this.leases.get(args.p_lease_key); if (!row || row.owner_id !== args.p_owner_id || row.run_id !== args.p_run_id) return { data: null, error: null }; row.heartbeat_at = args.p_now; row.expires_at = new Date(new Date(args.p_now).getTime() + args.p_ttl_seconds * 1000).toISOString(); return { data: row, error: null }; }
    if (fn === 'release_runtime_worker_lease') { const row = this.leases.get(args.p_lease_key); const ok = Boolean(row && row.owner_id === args.p_owner_id && row.run_id === args.p_run_id); if (ok) this.leases.delete(args.p_lease_key); return { data: ok, error: null }; }
    if (fn === 'record_runtime_event_idempotency') { const key = `${args.p_event_type}:${args.p_idempotency_key}`; const row = this.events.get(key) ?? { event_type: args.p_event_type, canonical_event_id: args.p_canonical_event_id, idempotency_key: args.p_idempotency_key, trade_id: args.p_trade_id, provider_id: args.p_provider_id, payload: args.p_payload, first_seen_at: 't1', last_seen_at: 't1', occurrence_count: 0 }; row.occurrence_count += 1; row.last_seen_at = `t${row.occurrence_count}`; this.events.set(key, row); return { data: { inserted: row.occurrence_count === 1, event: row }, error: null }; }
    if (fn === 'record_runtime_incident') { const row = this.incidents.get(args.p_fingerprint) ?? { incident_id: 'incident-1', fingerprint: args.p_fingerprint, severity: args.p_severity, source: args.p_source, retryable: args.p_retryable, message: args.p_message, details: args.p_details, first_seen_at: 't1', last_seen_at: 't1', occurrence_count: 0, status: 'open' }; row.occurrence_count += 1; this.incidents.set(args.p_fingerprint, row); return { data: row, error: null }; }
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  }
}

const fake = new FakeSupabase();
const leases = new SupabaseWorkerLeaseRepository(fake);
assert(await leases.acquire({ leaseKey: 'monitor:binance', ownerId: 'a', runId: 'run-a', ttlSeconds: 30, now: '2026-07-14T00:00:00Z' }));
assert.equal(await leases.acquire({ leaseKey: 'monitor:binance', ownerId: 'b', runId: 'run-b', ttlSeconds: 30, now: '2026-07-14T00:00:01Z' }), null);
assert(await leases.acquire({ leaseKey: 'monitor:binance', ownerId: 'b', runId: 'run-b', ttlSeconds: 30, now: '2026-07-14T00:01:00Z' }));
assert(await leases.renew({ leaseKey: 'monitor:binance', ownerId: 'b', runId: 'run-b', ttlSeconds: 30, now: '2026-07-14T00:01:10Z' }));
assert.equal(await leases.release({ leaseKey: 'monitor:binance', ownerId: 'b', runId: 'run-b' }), true);

const events = new PersistentRuntimeEventStore(fake);
const first = await events.recordEvent({ event_type: 'telegram_delivery', canonical_event_id: 'evt-1', idempotency_key: 'telegram:trade-1:tp1', trade_id: null, provider_id: 'binance' });
const second = await events.recordEvent({ event_type: 'telegram_delivery', canonical_event_id: 'evt-1', idempotency_key: 'telegram:trade-1:tp1', trade_id: null, provider_id: 'binance' });
assert.equal(first.inserted, true); assert.equal(second.inserted, false); assert.equal(second.event.occurrence_count, 2);

const incidents = new PersistentIncidentRepository(fake);
const i1 = await incidents.recordIncident({ fingerprint: 'contract:missing_status:binance', severity: 'critical', source: 'trade_truth', retryable: false, message: 'missing status' });
const i2 = await incidents.recordIncident({ fingerprint: 'contract:missing_status:binance', severity: 'critical', source: 'trade_truth', retryable: false, message: 'missing status' });
assert.equal(i1.retryable, false); assert.equal(i2.occurrence_count, 2);

let auth = reduceAuthResilience(INITIAL_AUTH_RESILIENCE_STATE, 'SIGNED_IN', { id: 'admin-1', role: 'admin' });
auth = reduceAuthResilience(auth, 'PROFILE_TIMEOUT');
assert.equal(auth.authenticated, true); assert.equal(auth.profile?.role, 'admin'); assert.equal(auth.degraded, true);
auth = reduceAuthResilience(auth, 'TEMPORARY_NULL_SESSION');
assert.equal(auth.authenticated, true); assert.equal(auth.profile?.role, 'admin');
auth = reduceAuthResilience(auth, 'CONFIRMED_INVALID_SESSION');
assert.equal(auth.authenticated, false); assert.equal(auth.clearAuth, true);

auth = reduceAuthResilience(INITIAL_AUTH_RESILIENCE_STATE, 'SIGNED_IN', { id: 'admin-2', role: 'admin' });
auth = reduceAuthResilience(auth, 'EXPLICIT_LOGOUT');
assert.equal(auth.clearAuth, true);

const adminLiveState = readFileSync('src/hooks/useAdminLiveState.ts', 'utf8');
assert(!/functions\/v1\/market-scanner/.test(adminLiveState));
assert(!/run_binance_monitor_now|run_bybit_monitor_now|run_supervisor_now|telegram-send|evaluate-signal-outcomes/.test(adminLiveState));

const pipeline = new ReportingPipeline();
const binance = pipeline.event({ event_id: 'binance-fill-1', trade_id: 'trade-1', provider_id: 'binance', environment_id: 'testnet', event_type: 'filled', payload: { source: 'binance' }, created_at: '2026-07-14T00:00:00Z' });
const bybit = pipeline.event({ event_id: 'bybit-fill-1', trade_id: 'trade-2', provider_id: 'bybit', environment_id: 'testnet', event_type: 'filled', payload: { source: 'bybit' }, created_at: '2026-07-14T00:00:00Z' });
assert.equal(binance.event_type, bybit.event_type);
assert.equal(telegramDeliveryKey(binance), 'telegram:trade-1:filled:binance-fill-1');

console.log('final readiness tests passed');
