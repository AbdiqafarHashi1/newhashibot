type Json = Record<string, unknown>;
import { AsyncLocalStorage } from "node:async_hooks";

export type ExecutionProvider = "binance" | "bybit";

export interface EdgeExecutionOwnership {
  customer_id: string;
  provider: ExecutionProvider;
  account_id: string;
  execution_instance_id: string;
  credential_ref: string;
  execution_scope_key: string;
  environment: "testnet" | "demo" | "live";
}

export interface EdgeProviderCredential {
  apiKey: string;
  apiSecret: string;
  ownership: EdgeExecutionOwnership;
}

export type OperatorCredentialSource = "explicit_account" | "operational_account" | "system_secret";
export interface OperatorCredentialResolution {
  credential: EdgeProviderCredential;
  source: OperatorCredentialSource;
  secretNames: Readonly<{ apiKey: string; apiSecret: string }>;
  attempts: Readonly<{ explicit_account: boolean; operational_account: boolean; system_secret: boolean }>;
}
export class OperatorCredentialResolutionError extends Error {
  constructor(message: string, readonly attempts: OperatorCredentialResolution["attempts"]) { super(message); }
}

const providerCredentialContext = new AsyncLocalStorage<EdgeProviderCredential>();

/** Provider-client factory scope; concurrent accounts receive independent async context. */
export function withEdgeProviderCredential<T>(credential: EdgeProviderCredential, work: () => Promise<T>): Promise<T> {
  return providerCredentialContext.run(credential, work);
}

export function currentEdgeProviderCredential(provider: ExecutionProvider): EdgeProviderCredential {
  const credential = providerCredentialContext.getStore();
  if (!credential || credential.ownership.provider !== provider) throw new Error(`execution_credentials_context_required:${provider}`);
  return credential;
}

export function currentEdgeOwnership(provider: ExecutionProvider): EdgeExecutionOwnership {
  return currentEdgeProviderCredential(provider).ownership;
}

function required(value: unknown, field: string): string {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`execution_ownership_required:${field}`);
  return result;
}

export function edgeScopeKey(input: Pick<EdgeExecutionOwnership, "customer_id" | "provider" | "account_id" | "execution_instance_id">): string {
  const parts = [input.customer_id, input.provider, input.account_id, input.execution_instance_id].map((value) => required(value, "scope"));
  if (parts.some((value) => value.includes(":"))) throw new Error("execution_ownership_reserved_delimiter");
  return parts.join(":");
}

export function ownershipFromRow(row: Json, provider?: ExecutionProvider): EdgeExecutionOwnership {
  const ownership = {
    customer_id: required(row.customer_id, "customer_id"),
    provider: required(provider ?? row.execution_provider ?? row.provider, "provider") as ExecutionProvider,
    account_id: required(row.account_id, "account_id"),
    execution_instance_id: required(row.execution_instance_id, "execution_instance_id"),
    credential_ref: required(row.credential_ref, "credential_ref"),
    environment: required(row.environment, "environment") as EdgeExecutionOwnership["environment"],
  } as EdgeExecutionOwnership;
  const atomicFields = ["customer_id", "provider", "account_id", "execution_instance_id"] as const;
  const incompatibleField = atomicFields.find((field) => String(ownership[field]).includes(":"));
  if (incompatibleField) {
    const canonicalUuid = String(row.id ?? row.canonical_account_id ?? "unknown");
    throw new Error(
      `EXECUTION_ACCOUNT_IDENTITY_NOT_ATOMIC provider=${ownership.provider} environment=${ownership.environment} canonical_account_uuid=${canonicalUuid} identity_field=${incompatibleField} failing_stage=execution_scope_construction`,
    );
  }
  ownership.execution_scope_key = edgeScopeKey(ownership);
  if (row.execution_scope_key && row.execution_scope_key !== ownership.execution_scope_key) throw new Error("mixed_execution_ownership:scope_key");
  return Object.freeze(ownership);
}

export function ownershipFields(ownership: EdgeExecutionOwnership): Json {
  return {
    customer_id: ownership.customer_id,
    execution_provider: ownership.provider,
    account_id: ownership.account_id,
    execution_instance_id: ownership.execution_instance_id,
    credential_ref: ownership.credential_ref,
    execution_scope_key: ownership.execution_scope_key,
  };
}

export function runtimeOwnershipFields(ownership: EdgeExecutionOwnership): Json {
  return {
    customer_id: ownership.customer_id, provider: ownership.provider, account_id: ownership.account_id,
    execution_instance_id: ownership.execution_instance_id, credential_ref: ownership.credential_ref,
    execution_scope_key: ownership.execution_scope_key,
  };
}

export async function enumerateExecutionAccounts(supabase: any, provider: ExecutionProvider): Promise<EdgeExecutionOwnership[]> {
  const { data, error } = await supabase.from("connected_execution_accounts").select("id,customer_id,provider,account_id,credential_ref,environment,execution_instance_id").eq("provider", provider).eq("enabled", true).eq("monitor_enabled", true);
  if (error) throw new Error(`connected_execution_accounts_query_failed:${error.message}`);
  return (data ?? []).map((row: Json) => ownershipFromRow({ ...row, execution_provider: provider }, provider));
}

/**
 * Resolve an account for an administrator initiated provider operation.  This is
 * deliberately separate from the customer execution enumerator: an operator
 * action may never "pick the first customer".  A customer account is eligible
 * only when both its customer and account identifiers were supplied explicitly.
 */
export async function resolveOperationalExecutionAccounts(
  supabase: any,
  provider: ExecutionProvider,
  environment: EdgeExecutionOwnership["environment"],
  selection?: { customerId?: string; accountId?: string },
): Promise<EdgeExecutionOwnership[]> {
  let query = supabase.from("connected_execution_accounts")
    .select("id,customer_id,provider,account_id,credential_ref,environment,execution_instance_id,is_operational")
    .eq("provider", provider).eq("environment", environment).eq("enabled", true);
  const explicitlyCustomerScoped = Boolean(selection?.customerId && selection?.accountId);
  if (explicitlyCustomerScoped) {
    query = query.eq("customer_id", selection!.customerId).eq("account_id", selection!.accountId);
  } else {
    query = query.eq("is_operational", true);
  }
  const { data, error } = await query;
  if (error) throw new Error(`connected_execution_accounts_query_failed:${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) throw new Error(`no_operational_account:${provider}:${environment}`);
  if (!explicitlyCustomerScoped && rows.length > 1) throw new Error(`operational_account_selection_required:${provider}:${environment}`);
  return rows.map((row: Json) => ownershipFromRow({ ...row, execution_provider: provider }, provider));
}

function systemCredential(provider: ExecutionProvider, environment: EdgeExecutionOwnership["environment"]): { credential: EdgeProviderCredential; secretNames: { apiKey: string; apiSecret: string } } | null {
  const candidates = provider === "binance"
    ? [["BINANCE_TESTNET_API_KEY", "BINANCE_TESTNET_API_SECRET"]]
    : environment === "demo"
      ? [["BYBIT_DEMO_API_KEY", "BYBIT_DEMO_API_SECRET"], ["BYBIT_TESTNET_API_KEY", "BYBIT_TESTNET_API_SECRET"]]
      : environment === "testnet"
        ? [["BYBIT_TESTNET_API_KEY", "BYBIT_TESTNET_API_SECRET"]]
        : [["BYBIT_API_KEY", "BYBIT_API_SECRET"]];
  const selected = candidates.find(([keyName, secretName]) => Boolean(Deno.env.get(keyName) && Deno.env.get(secretName)));
  if (!selected) return null;
  const [keyName, secretName] = selected;
  const apiKey = Deno.env.get(keyName) ?? "";
  const apiSecret = Deno.env.get(secretName) ?? "";
  if (!apiKey || !apiSecret) return null;
  const systemId = provider === "binance" ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002";
  const ownership = ownershipFromRow({
    customer_id: "00000000-0000-4000-8000-000000000000", provider,
    account_id: `system-${provider}-${environment}`, execution_instance_id: systemId,
    credential_ref: "edge-function-secret", environment,
  }, provider);
  return { credential: { apiKey, apiSecret, ownership }, secretNames: { apiKey: keyName, apiSecret: secretName } };
}

/** Canonical operator resolution order: explicit account, operational account, system secret. */
export async function resolveOperatorProviderCredential(
  supabase: any,
  provider: ExecutionProvider,
  environment: EdgeExecutionOwnership["environment"],
  selection?: { customerId?: string; accountId?: string },
): Promise<OperatorCredentialResolution> {
  const attempts = { explicit_account: Boolean(selection?.accountId), operational_account: false, system_secret: false };
  if (selection?.accountId) {
    let query = supabase.from("connected_execution_accounts")
      .select("id,customer_id,provider,account_id,credential_ref,environment,execution_instance_id,is_operational")
      .eq("account_id", selection.accountId).eq("provider", provider).eq("environment", environment).eq("enabled", true);
    if (selection.customerId) query = query.eq("customer_id", selection.customerId);
    const { data, error } = await query.limit(2);
    if (error) throw new Error(`explicit_account_query_failed:${provider}:${environment}`);
    if (!data?.length || data.length !== 1) throw new Error(`invalid_explicit_account:${provider}:${environment}:${selection.accountId}`);
    const ownership = ownershipFromRow({ ...data[0], execution_provider: provider }, provider);
    return { credential: await resolveEdgeProviderCredential(supabase, ownership), source: "explicit_account", secretNames: { apiKey: "connected_execution_accounts.api_key", apiSecret: "connected_execution_accounts.api_secret" }, attempts };
  }

  attempts.operational_account = true;
  const { data, error } = await supabase.from("connected_execution_accounts")
    .select("id,customer_id,provider,account_id,credential_ref,environment,execution_instance_id,is_operational")
    .eq("provider", provider).eq("environment", environment).eq("enabled", true).eq("is_operational", true).limit(2);
  if (error) throw new Error(`connected_execution_accounts_query_failed:${error.message}`);
  if ((data?.length ?? 0) > 1) throw new Error(`operational_account_selection_required:${provider}:${environment}`);
  if (data?.length === 1) {
    const ownership = ownershipFromRow({ ...data[0], execution_provider: provider }, provider);
    return { credential: await resolveEdgeProviderCredential(supabase, ownership), source: "operational_account", secretNames: { apiKey: "connected_execution_accounts.api_key", apiSecret: "connected_execution_accounts.api_secret" }, attempts };
  }

  attempts.system_secret = true;
  const credential = systemCredential(provider, environment);
  if (credential) return { credential: credential.credential, source: "system_secret", secretNames: credential.secretNames, attempts };
  throw new OperatorCredentialResolutionError(`no_execution_credentials:${provider}:${environment}`, attempts);
}

/** Only this factory boundary receives decrypted material from the service-role RPC. */
export async function resolveEdgeProviderCredential(supabase: any, ownership: EdgeExecutionOwnership): Promise<EdgeProviderCredential> {
  const { data, error } = await supabase.rpc("resolve_execution_account_credentials", {
    p_customer_id: ownership.customer_id,
    p_provider: ownership.provider,
    p_account_id: ownership.account_id,
    p_execution_instance_id: ownership.execution_instance_id,
    p_credential_ref: ownership.credential_ref,
  });
  if (error) throw new Error(`execution_credentials_unavailable:${ownership.execution_scope_key}`);
  const record = Array.isArray(data) ? data[0] : data;
  const apiKey = required(record?.api_key, "api_key");
  const apiSecret = required(record?.api_secret, "api_secret");
  return { apiKey, apiSecret, ownership };
}

export async function acquireExecutionLease(supabase: any, ownership: EdgeExecutionOwnership, runId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("acquire_execution_monitor_lease", {
    p_execution_scope_key: ownership.execution_scope_key,
    p_customer_id: ownership.customer_id,
    p_provider: ownership.provider,
    p_account_id: ownership.account_id,
    p_execution_instance_id: ownership.execution_instance_id,
    p_run_id: runId,
    p_ttl_seconds: 45,
  });
  if (error) throw new Error(`monitor_lease_failed:${ownership.execution_scope_key}`);
  return data === true;
}

export async function releaseExecutionLease(supabase: any, ownership: EdgeExecutionOwnership, runId: string, state: "completed" | "failed"): Promise<void> {
  const { error } = await supabase.from("execution_monitor_leases").update({ state, completed_at: new Date().toISOString() }).eq("execution_scope_key", ownership.execution_scope_key).eq("run_id", runId);
  if (error) throw new Error(`monitor_lease_release_failed:${ownership.execution_scope_key}`);
}

export function ownedQuery(query: any, ownership: EdgeExecutionOwnership): any {
  return query.eq("customer_id", ownership.customer_id).eq("execution_provider", ownership.provider).eq("account_id", ownership.account_id).eq("execution_instance_id", ownership.execution_instance_id).eq("execution_scope_key", ownership.execution_scope_key);
}

export async function settleExecutionAccounts<T>(accounts: EdgeExecutionOwnership[], work: (ownership: EdgeExecutionOwnership) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(accounts.map(work));
}
