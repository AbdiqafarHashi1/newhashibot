export type ClaimState = "claimed" | "duplicate-complete" | "in-progress";
export interface Claim<T = unknown> { state: ClaimState; result?: T; leaseExpiresAt?: number; }
export interface IdempotencyStore<T = unknown> {
  claim(key: string, truthVersion: number, leaseMs: number): Promise<Claim<T>>;
  complete(key: string, result: T): Promise<void>;
  fail(key: string, errorCode: string): Promise<void>;
  retrieve(key: string): Promise<T | undefined>;
}
export const idempotencyKey = (kind: "event"|"command"|"execution"|"provider-order", scope: string, identity: string) => `${kind}:v1:${scope}:${identity}`;

interface Row<T> { state: "claimed"|"complete"|"failed"; truthVersion: number; leaseExpiresAt: number; result?: T; errorCode?: string; }
export class InMemoryIdempotencyStore<T = unknown> implements IdempotencyStore<T> {
  private rows = new Map<string, Row<T>>();
  constructor(private now: () => number = Date.now) {}
  async claim(key: string, truthVersion: number, leaseMs: number): Promise<Claim<T>> {
    const prior = this.rows.get(key);
    if (prior?.state === "complete") return { state:"duplicate-complete", result:prior.result };
    if (prior?.state === "claimed" && prior.leaseExpiresAt > this.now()) return { state:"in-progress", leaseExpiresAt:prior.leaseExpiresAt };
    if (prior && truthVersion < prior.truthVersion) throw new Error("STALE_TRUTH_VERSION");
    const leaseExpiresAt=this.now()+leaseMs; this.rows.set(key,{state:"claimed",truthVersion,leaseExpiresAt}); return {state:"claimed",leaseExpiresAt};
  }
  async complete(key: string, result: T) { const row=this.rows.get(key); if (!row) throw new Error("IDEMPOTENCY_CLAIM_REQUIRED"); this.rows.set(key,{...row,state:"complete",result}); }
  async fail(key: string, errorCode: string) { const row=this.rows.get(key); if (!row) throw new Error("IDEMPOTENCY_CLAIM_REQUIRED"); this.rows.set(key,{...row,state:"failed",errorCode,leaseExpiresAt:0}); }
  async retrieve(key: string) { return this.rows.get(key)?.state === "complete" ? this.rows.get(key)?.result : undefined; }
}

// Production adapter contract: implementations persist claims/results in Supabase.
// In-memory state is test/local-only and is never production truth.
export interface SupabaseIdempotencyRpc {
  claimRpc(input: { key:string; truthVersion:number; leaseMs:number }): Promise<Claim>;
  completeRpc(input: { key:string; result:unknown }): Promise<void>;
}
