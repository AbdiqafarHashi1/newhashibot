import type { ExchangeProviderId } from './exchangeProvider.js';
import type { ExecutionIsolationScope } from './executionRouter.js';

export interface AccountCredentialRecord {
  customerId: string;
  provider: ExchangeProviderId;
  accountId: string;
  credentialRef: string;
  apiKey: string;
  apiSecret: string;
  enabled: boolean;
}

export interface ResolvedAccountCredential {
  apiKey: string;
  apiSecret: string;
  descriptor: Readonly<{ customerId: string; provider: ExchangeProviderId; accountId: string; credentialRef: string }>;
}

export interface AccountCredentialStore {
  resolve(customerId: string, provider: ExchangeProviderId, accountId: string): Promise<AccountCredentialRecord | null>;
}

export class AccountScopedCredentialResolver {
  constructor(private readonly store: AccountCredentialStore) {}

  async resolve(provider: ExchangeProviderId, scope: ExecutionIsolationScope): Promise<ResolvedAccountCredential> {
    const record = await this.store.resolve(scope.customerId, provider, scope.accountId);
    if (!record || !record.enabled) throw new Error(`execution_credentials_unavailable:${provider}:${scope.accountId}`);
    if (record.customerId !== scope.customerId || record.provider !== provider || record.accountId !== scope.accountId || record.credentialRef !== scope.credentialRef) {
      throw new Error(`execution_credential_scope_mismatch:${provider}:${scope.accountId}`);
    }
    if (!record.apiKey || !record.apiSecret) throw new Error(`execution_credentials_incomplete:${provider}:${scope.accountId}`);
    return {
      apiKey: record.apiKey,
      apiSecret: record.apiSecret,
      descriptor: Object.freeze({ customerId: record.customerId, provider, accountId: record.accountId, credentialRef: record.credentialRef }),
    };
  }
}

export function credentialSafeMetadata(credential: ResolvedAccountCredential): ResolvedAccountCredential['descriptor'] {
  return credential.descriptor;
}
