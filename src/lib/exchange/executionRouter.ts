import type { EntryRequest, ExchangeProvider, ExchangeProviderId, ProviderResult } from './exchangeProvider.js';

export type ProviderExecutionMode = 'single' | 'parallel';

export interface ProviderExecutionTarget {
  provider: ExchangeProvider;
  enabled: boolean;
  readonly?: boolean;
  primary?: boolean;
}

export interface ParallelExecutionResult {
  executionGroupId: string;
  signalId?: string;
  results: Array<ProviderResult & { provider: ExchangeProviderId; isolated: true }>;
  primaryProvider?: ExchangeProviderId;
}

export function createExecutionGroupId(signalId?: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `hb-${signalId ?? 'signal'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function executeSignalAcrossProviders(
  request: EntryRequest,
  targets: ProviderExecutionTarget[],
  options: { mode: ProviderExecutionMode; executionGroupId?: string } = { mode: 'parallel' },
): Promise<ParallelExecutionResult> {
  const executionGroupId = options.executionGroupId ?? createExecutionGroupId(request.signalId);
  const enabledTargets = targets.filter((target) => target.enabled && !target.readonly);
  const selectedTargets = options.mode === 'parallel' ? enabledTargets : enabledTargets.filter((target) => target.primary).slice(0, 1);
  const settled = await Promise.allSettled(selectedTargets.map(async (target) => ({ target, result: await target.provider.placeEntry({ ...request, metadata: { ...request.metadata, executionGroupId, execution_provider: target.provider.metadata.id } }) })));
  const results = settled.map((entry, idx) => {
    if (entry.status === 'fulfilled') return { ...entry.value.result, provider: entry.value.target.provider.metadata.id, isolated: true as const };
    const target = selectedTargets[idx];
    return { provider: target?.provider.metadata.id ?? 'unknown', ok: false, error: entry.reason instanceof Error ? entry.reason.message : 'provider_execution_failed', isolated: true as const };
  });
  return { executionGroupId, signalId: request.signalId, results, primaryProvider: selectedTargets.find((target) => target.primary)?.provider.metadata.id };
}
