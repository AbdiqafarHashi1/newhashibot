export type RuntimeProofProvider = "binance" | "bybit";

export interface RuntimeProofAccount {
  id?: string;
  customer_id: string;
  account_id: string;
  provider: string;
  environment: string;
  enabled: boolean;
  is_operational: boolean;
  execution_enabled: boolean;
}

export const RUNTIME_PROOF_TARGETS = {
  binance: { environment: "testnet", target: "binance-testnet-execution", action: "prove_binance_trade_management" },
  bybit: { environment: "demo", target: "bybit-demo-execution", action: "prove_bybit_trade_management" },
} as const;

/** A provider-scoped request runs one provider; `all` resolves both independently. */
export function runtimeProofProviders(provider?: string): RuntimeProofProvider[] {
  const normalized = (provider ?? "all").toLowerCase();
  if (normalized === "all") return ["binance", "bybit"];
  if (normalized === "binance" || normalized === "bybit") return [normalized];
  throw new Error("RUNTIME_PROOF_PROVIDER_UNSUPPORTED");
}

export function validateRuntimeProofAccount(account: RuntimeProofAccount | undefined, provider: RuntimeProofProvider): RuntimeProofAccount {
  if (!account) throw new Error("RUNTIME_PROOF_ACCOUNT_NOT_FOUND");
  const expected = RUNTIME_PROOF_TARGETS[provider];
  if (account.provider.toLowerCase() !== provider) throw new Error("RUNTIME_PROOF_ACCOUNT_PROVIDER_MISMATCH");
  if (account.environment.toLowerCase() !== expected.environment) throw new Error("RUNTIME_PROOF_ACCOUNT_ENVIRONMENT_MISMATCH");
  if (!account.enabled && !account.is_operational) throw new Error("RUNTIME_PROOF_ACCOUNT_NOT_SELECTABLE");
  if (account.execution_enabled) throw new Error("RUNTIME_PROOF_EXECUTION_ENABLED");
  return account;
}

export function selectRuntimeProofAccount(accounts: RuntimeProofAccount[], provider: RuntimeProofProvider): RuntimeProofAccount {
  const valid = accounts.filter((account) => account.enabled || account.is_operational);
  const operational = valid.filter((account) => account.is_operational);
  const candidates = operational.length ? operational : valid;
  if (!candidates.length) throw new Error("RUNTIME_PROOF_ACCOUNT_NOT_FOUND");
  if (candidates.length !== 1) throw new Error("RUNTIME_PROOF_ACCOUNT_SELECTION_REQUIRED");
  return validateRuntimeProofAccount(candidates[0], provider);
}
