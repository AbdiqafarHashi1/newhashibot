const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Logical execution accounts and terminal accounts are separate identities. */
export function resolveMt5TerminalRoute(account: Record<string, unknown>, customerId: string) {
  if (!customerId || account.customer_id !== customerId || !['MT5_PERSONAL', 'MT5_PROP'].includes(String(account.provider)) || !['demo','live'].includes(String(account.environment).toLowerCase())) throw new Error('MT5_ACCOUNT_SCOPE_MISMATCH');
  const overrides = account.policy_overrides as Record<string, unknown> | null;
  const pairedId = overrides?.mt5_account_id;
  const physicalId = typeof pairedId === 'string' ? pairedId : String(account.account_id ?? '');
  if (!uuid.test(physicalId) || account.provider_account_identity !== physicalId) throw new Error('MT5_VERIFIED_PAIRING_REQUIRED');
  // Legacy accounts may already use the physical UUID as account_id. New logical
  // accounts require the verified pairing's bridge as well as terminal identity.
  const bridgeId = typeof overrides?.bridge_id === 'string' && overrides.bridge_id ? overrides.bridge_id : null;
  if (pairedId && !bridgeId) throw new Error('MT5_VERIFIED_PAIRING_REQUIRED');
  return Object.freeze({ mt5AccountId: physicalId, bridgeId });
}
