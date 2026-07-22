import type { AccountScopedCredentialResolver } from './accountCredentialResolver.js';
import type { ExchangeProvider, ExchangeProviderId } from './exchangeProvider.js';
import { createExecutionOwnership, type ExecutionOwnership } from './executionOwnership.js';
import type { ExecutionIsolationScope } from './executionRouter.js';

export type SecretProviderConstructor = (secrets: Readonly<{ apiKey: string; apiSecret: string }>) => ExchangeProvider;

export interface ScopedProvider {
  readonly ownership: ExecutionOwnership;
  readonly provider: ExchangeProvider;
}

/** Credential material crosses exactly one boundary: resolver -> provider constructor. */
export class AccountProviderFactory {
  constructor(
    private readonly credentials: AccountScopedCredentialResolver,
    private readonly constructors: Readonly<Partial<Record<ExchangeProviderId, SecretProviderConstructor>>>,
  ) {}

  async create(providerId: ExchangeProviderId, scope: ExecutionIsolationScope): Promise<ScopedProvider> {
    const ownership = createExecutionOwnership(providerId, scope);
    const construct = this.constructors[providerId];
    if (!construct) throw new Error(`execution_provider_factory_unavailable:${providerId}`);
    const credential = await this.credentials.resolve(providerId, scope);
    const provider = construct({ apiKey: credential.apiKey, apiSecret: credential.apiSecret });
    if (provider.metadata.id !== providerId) throw new Error(`execution_provider_factory_mismatch:${providerId}`);
    return Object.freeze({ ownership, provider });
  }
}
