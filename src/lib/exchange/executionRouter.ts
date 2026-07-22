import type { EntryRequest, ExchangeProvider, ExchangeProviderId, ProviderResult } from './exchangeProvider.js';
import { createExecutionOwnership, ownershipMetadata } from './executionOwnership.js';

export type ProviderExecutionMode = 'single' | 'parallel';

export interface ExecutionIsolationScope {
  customerId: string;
  accountId: string;
  credentialRef: string;
  instanceId: string;
}

export interface ProviderExecutionTarget {
  provider: ExchangeProvider;
  enabled: boolean;
  readonly?: boolean;
  primary?: boolean;
  scope?: ExecutionIsolationScope;
}

export interface ParallelExecutionResult {
  executionGroupId: string;
  signalId?: string;
  results: Array<ProviderResult & { provider: ExchangeProviderId; isolated: true; scopeKey?: string }>;
  primaryProvider?: ExchangeProviderId;
}

export function executionScopeKey(provider: ExchangeProviderId, scope: ExecutionIsolationScope): string {
  return createExecutionOwnership(provider, scope).scopeKey;
}

export function validateExecutionTargets(targets: ProviderExecutionTarget[], requireIsolationScope = false): void {
  const seen = new Set<string>();
  for (const target of targets.filter((item) => item.enabled && !item.readonly)) {
    if (!target.scope) {
      if (requireIsolationScope) throw new Error(`execution_scope_required:${target.provider.metadata.id}`);
      continue;
    }
    const values = [target.scope.customerId, target.scope.accountId, target.scope.credentialRef, target.scope.instanceId];
    if (values.some((value) => !value.trim())) throw new Error(`execution_scope_incomplete:${target.provider.metadata.id}`);
    const key = executionScopeKey(target.provider.metadata.id, target.scope);
    if (seen.has(key)) throw new Error(`duplicate_execution_scope:${key}`);
    seen.add(key);
  }
}

export function createExecutionGroupId(signalId?: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `hb-${signalId ?? 'signal'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function executeSignalAcrossProviders(
  request: EntryRequest,
  targets: ProviderExecutionTarget[],
  options: { mode: ProviderExecutionMode; executionGroupId?: string; requireIsolationScope?: boolean } = { mode: 'parallel' },
): Promise<ParallelExecutionResult> {
  validateExecutionTargets(targets, options.requireIsolationScope === true);
  const executionGroupId = options.executionGroupId ?? createExecutionGroupId(request.signalId);
  const enabledTargets = targets.filter((target) => target.enabled && !target.readonly);
  const selectedTargets = options.mode === 'parallel' ? enabledTargets : enabledTargets.filter((target) => target.primary).slice(0, 1);
  const settled = await Promise.allSettled(selectedTargets.map(async (target) => {
    const ownership = target.scope ? createExecutionOwnership(target.provider.metadata.id, target.scope) : undefined;
    const scopeKey = ownership?.scopeKey;
    const result = await target.provider.placeEntry({ ...request, metadata: { ...request.metadata, executionGroupId, ...(ownership ? ownershipMetadata(ownership) : { execution_provider: target.provider.metadata.id }) } });
    return { target, result, scopeKey };
  }));
  const results = settled.map((entry, idx) => {
    if (entry.status === 'fulfilled') return { ...entry.value.result, provider: entry.value.target.provider.metadata.id, isolated: true as const, scopeKey: entry.value.scopeKey };
    const target = selectedTargets[idx];
    return { provider: target?.provider.metadata.id ?? 'unknown', ok: false, error: entry.reason instanceof Error ? entry.reason.message : 'provider_execution_failed', isolated: true as const, scopeKey: target?.scope ? executionScopeKey(target.provider.metadata.id, target.scope) : undefined };
  });
  return { executionGroupId, signalId: request.signalId, results, primaryProvider: selectedTargets.find((target) => target.primary)?.provider.metadata.id };
}

export function executeSignalForIsolatedAccounts(request: EntryRequest, targets: ProviderExecutionTarget[], options: { mode: ProviderExecutionMode; executionGroupId?: string } = { mode: 'parallel' }): Promise<ParallelExecutionResult> {
  return executeSignalAcrossProviders(request, targets, { ...options, requireIsolationScope: true });
}
