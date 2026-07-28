export type ExecutionProvider = 'binance' | 'bybit';

export const PROVIDER_CONTRACT = {
  binance: { environment: 'testnet', adapter: 'binance_usdm_testnet', path: '/admin/providers/binance' },
  bybit: { environment: 'demo', adapter: 'bybit_demo', path: '/admin/providers/bybit' },
} as const;

export type ExecutionAccount = {
  id: string;
  display_label: string;
  account_id: string;
  provider_account_identity?: string | null;
  adapter_identity?: string | null;
  provider: ExecutionProvider;
  environment: 'testnet' | 'demo';
  ownership_classification: 'customer' | 'system' | 'assigned_test_owner';
  customer_id: string;
  credential_ref: string | null;
  enabled: boolean;
  is_operational: boolean;
  monitor_enabled: boolean;
  execution_enabled: boolean;
  risk_profile_id: string | null;
  provider_health: string;
  last_synchronized_at: string | null;
  credentials_verified_at?: string | null;
  last_error: string | null;
};

export function validateProviderAccount(provider: ExecutionProvider, account: ExecutionAccount | null) {
  const contract = PROVIDER_CONTRACT[provider];
  if (!account) return { valid: false, error: 'No canonical execution-account identity' };
  if (account.provider !== provider) return { valid: false, error: `Account provider ${account.provider} does not match ${provider}` };
  if (account.environment !== contract.environment) return { valid: false, error: `Account environment ${account.environment} does not match ${contract.environment}` };
  return { valid: true, error: null };
}

export function executionAccountStatus(account: ExecutionAccount | null, providerEntryEnabled: boolean, apiReachable: boolean, readOnly = false, killSwitch = false) {
  const configured = Boolean(account);
  const credentialsResolved = Boolean(account?.credential_ref);
  const effectiveExecutionPermission = Boolean(
    providerEntryEnabled && configured && account?.enabled && account.execution_enabled && credentialsResolved && !killSwitch && !readOnly,
  );
  return {
    api: apiReachable ? 'API CONNECTED' : 'API NOT CONNECTED',
    account: configured ? 'CONFIGURED' : 'NOT CONFIGURED',
    execution: account?.execution_enabled ? 'EXECUTION ENABLED' : 'EXECUTION DISABLED',
    write: configured ? (effectiveExecutionPermission ? 'WRITE OPERATIONS PERMITTED' : 'WRITE OPERATIONS BLOCKED') : 'WRITE OPERATIONS BLOCKED',
    firstBlocker: !configured
      ? 'No canonical execution-account identity'
      : !account?.enabled
        ? 'Account is disabled for selection'
        : !account.credential_ref
          ? 'No opaque credential reference'
          : !providerEntryEnabled
            ? 'Provider entry gate is disabled'
            : !account.execution_enabled
              ? 'Canonical execution adoption is disabled'
              : killSwitch
                ? 'Provider kill switch is active'
                : readOnly
                  ? 'Provider is read-only'
                  : null,
    effectiveExecutionPermission,
  };
}

export function providerAccountUrl(account: ExecutionAccount) {
  return `${PROVIDER_CONTRACT[account.provider].path}?account_id=${encodeURIComponent(account.id)}`;
}

export function isOpaqueCredentialRef(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
