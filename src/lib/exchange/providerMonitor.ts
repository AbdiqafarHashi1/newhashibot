import type { ExchangeProvider, ProfitLockRequest, ProtectionRequest, ProviderResult, ReconcileRequest } from './exchangeProvider.js';
import { assertSameOwnership, type ExecutionOwnership } from './executionOwnership.js';

export interface ProviderMonitorSnapshot {
  provider: string;
  reconciliation: ProviderResult;
  protection: ProviderResult;
  safety: ProviderResult;
  profitLock?: ProviderResult;
  recovery?: ProviderResult;
  stale: boolean;
  orphan: boolean;
}

export class ProviderMonitor {
  constructor(readonly provider: ExchangeProvider, readonly ownership?: ExecutionOwnership) {}

  async run(input: ReconcileRequest & { ownership?: ExecutionOwnership; protection?: ProtectionRequest; profitLock?: ProfitLockRequest; lastCheckedAt?: string | null }): Promise<ProviderMonitorSnapshot> {
    if (!this.ownership || !input.ownership) throw new Error('monitor_execution_ownership_required');
    assertSameOwnership(this.ownership, input.ownership);
    const [reconciliation, protection, safety] = await Promise.all([
      this.provider.reconcilePosition(input),
      this.provider.reconcileProtection(input),
      this.provider.classifySafetyState(input),
    ]);
    const stale = input.lastCheckedAt ? Date.now() - new Date(input.lastCheckedAt).getTime() > 2 * 60_000 : false;
    const orphan = safety.data?.state === 'unsafe' && protection.ok === false;
    const recovery = input.protection && protection.ok === false ? await this.provider.repairProtection(input.protection) : undefined;
    const profitLock = input.profitLock ? await this.provider.executeProfitLock(input.profitLock) : undefined;
    return { provider: this.provider.metadata.id, reconciliation, protection, safety, recovery, profitLock, stale, orphan };
  }
}

export interface MonitorLeaseStore {
  acquire(scopeKey: string, runId: string, expiresAt: string): Promise<boolean>;
  release(scopeKey: string, runId: string, state: 'completed' | 'failed'): Promise<void>;
}

/** Account failures settle independently and leases can never collide across accounts. */
export async function monitorOwnedExecutions(
  jobs: ReadonlyArray<{ monitor: ProviderMonitor; input: Parameters<ProviderMonitor['run']>[0] }>,
  leases: MonitorLeaseStore,
  runId: string,
): Promise<PromiseSettledResult<ProviderMonitorSnapshot>[]> {
  return Promise.allSettled(jobs.map(async ({ monitor, input }) => {
    if (!monitor.ownership || !input.ownership) throw new Error('monitor_execution_ownership_required');
    assertSameOwnership(monitor.ownership, input.ownership);
    const scopeKey = monitor.ownership.scopeKey;
    if (!await leases.acquire(scopeKey, runId, new Date(Date.now() + 45_000).toISOString())) throw new Error(`monitor_lease_unavailable:${scopeKey}`);
    try {
      const result = await monitor.run(input);
      await leases.release(scopeKey, runId, 'completed');
      return result;
    } catch (error) {
      await leases.release(scopeKey, runId, 'failed');
      throw error;
    }
  }));
}

export class BinanceMonitor extends ProviderMonitor {}
export class BybitMonitor extends ProviderMonitor {}
