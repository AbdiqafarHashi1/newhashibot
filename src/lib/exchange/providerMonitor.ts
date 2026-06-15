import type { ExchangeProvider, ProfitLockRequest, ProtectionRequest, ProviderResult, ReconcileRequest } from './exchangeProvider.js';

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
  constructor(readonly provider: ExchangeProvider) {}

  async run(input: ReconcileRequest & { protection?: ProtectionRequest; profitLock?: ProfitLockRequest; lastCheckedAt?: string | null }): Promise<ProviderMonitorSnapshot> {
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

export class BinanceMonitor extends ProviderMonitor {}
export class BybitMonitor extends ProviderMonitor {}
