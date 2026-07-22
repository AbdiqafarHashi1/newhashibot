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
  const { data, error } = await supabase.from("connected_execution_accounts").select("customer_id,provider,account_id,credential_ref,environment,execution_instance_id").eq("provider", provider).eq("enabled", true);
  if (error) throw new Error(`connected_execution_accounts_query_failed:${error.message}`);
  return (data ?? []).map((row: Json) => ownershipFromRow({ ...row, execution_provider: provider }, provider));
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
