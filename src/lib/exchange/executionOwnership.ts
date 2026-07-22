import type { ExchangeProviderId } from './exchangeProvider.js';
import type { ExecutionIsolationScope } from './executionRouter.js';

export interface ExecutionOwnership {
  readonly customerId: string;
  readonly provider: ExchangeProviderId;
  readonly accountId: string;
  readonly instanceId: string;
  readonly credentialRef: string;
  readonly scopeKey: string;
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`execution_ownership_required:${field}`);
  return normalized;
}

/** The sole constructor for the immutable identity carried by execution truth. */
export function createExecutionOwnership(provider: ExchangeProviderId, scope: ExecutionIsolationScope): ExecutionOwnership {
  const customerId = required(scope.customerId, 'customer_id');
  const accountId = required(scope.accountId, 'account_id');
  const instanceId = required(scope.instanceId, 'execution_instance_id');
  const credentialRef = required(scope.credentialRef, 'credential_ref');
  const normalizedProvider = required(provider, 'provider');
  if ([customerId, normalizedProvider, accountId, instanceId].some((value) => value.includes(':'))) throw new Error('execution_ownership_reserved_delimiter');
  return Object.freeze({
    customerId,
    provider: normalizedProvider,
    accountId,
    instanceId,
    credentialRef,
    scopeKey: [customerId, normalizedProvider, accountId, instanceId].join(':'),
  });
}

export function ownershipMetadata(ownership: ExecutionOwnership): Readonly<Record<string, string>> {
  return Object.freeze({
    customer_id: ownership.customerId,
    execution_provider: ownership.provider,
    account_id: ownership.accountId,
    execution_instance_id: ownership.instanceId,
    credential_ref: ownership.credentialRef,
    execution_scope_key: ownership.scopeKey,
  });
}

export function assertSameOwnership(expected: ExecutionOwnership, actual: ExecutionOwnership): void {
  if (expected.scopeKey !== actual.scopeKey || expected.credentialRef !== actual.credentialRef) {
    throw new Error(`mixed_execution_ownership:${expected.scopeKey}`);
  }
}
