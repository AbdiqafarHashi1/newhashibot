type SupabaseLike = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
  from: (table: string) => any;
};

export type TradeTruthErrorClass = "retryable_provider_or_database" | "non_retryable_contract";

export interface TradeTruthAdapterResult {
  ok: boolean;
  retryable: boolean;
  classification: TradeTruthErrorClass;
  error?: string;
}

export function normalizeTradeTruthSide(value: unknown): "long" | "short" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "long" || normalized === "buy") return "long";
  if (normalized === "short" || normalized === "sell") return "short";
  return null;
}

function classifyError(error: unknown): TradeTruthAdapterResult {
  const message = error instanceof Error ? error.message : String(error ?? "unknown_trade_truth_error");
  const retryable = /timeout|network|connection|fetch|temporar|rate.?limit/i.test(message);
  return { ok: false, retryable, classification: retryable ? "retryable_provider_or_database" : "non_retryable_contract", error: message };
}

function assertPayload(payload: Record<string, unknown>): void {
  const status = String(payload.p_status ?? payload.status ?? "").trim();
  if (!status) throw new Error("trade_truth_contract:null_status");
  const provider = String(payload.p_provider ?? payload.provider ?? "").trim();
  if (!provider) throw new Error("trade_truth_contract:missing_provider");
  const environment = String(payload.p_environment ?? payload.environment ?? "").trim();
  if (!environment) throw new Error("trade_truth_contract:missing_environment");
  const symbol = String(payload.p_symbol ?? payload.symbol ?? "").trim();
  if (!symbol) throw new Error("trade_truth_contract:missing_symbol");
  const direction = payload.p_direction ?? payload.direction ?? payload.side;
  if (!normalizeTradeTruthSide(direction)) throw new Error(`trade_truth_contract:invalid_side:${String(direction ?? "")}`);
}

function confirmedWrite(result: unknown): void {
  if (!result || typeof result !== 'object') throw new Error('trade_truth_store_response_missing');
  const error=(result as {error?:unknown}).error;
  if(error)throw new Error(`trade_truth_store_failed:${typeof error==='object'&&error&&'message' in error?String(error.message):String(error)}`);
}

export async function upsertTradeManagementTruth(supabase: SupabaseLike, payload: Record<string, unknown>): Promise<TradeTruthAdapterResult> {
  try {
    assertPayload(payload);
    if(!payload.p_execution_order_id)throw new Error('trade_truth_contract:execution_order_required');
    const side = normalizeTradeTruthSide(payload.p_direction ?? payload.direction ?? payload.side);
    confirmedWrite(await supabase.rpc("upsert_trade_management_truth", { ...payload, p_direction: side }));
    return { ok: true, retryable: false, classification: "non_retryable_contract" };
  } catch (error) {
    return classifyError(error);
  }
}

export async function upsertTradeManagementTruthRow(supabase: SupabaseLike, row: Record<string, unknown>, options: { onConflict?: string } = {}): Promise<TradeTruthAdapterResult> {
  try {
    assertPayload({...row,status:row.status??row.protection_status});
    if(!row.execution_scope_key||!row.customer_id||!row.account_id||!row.execution_instance_id)throw new Error('trade_truth_contract:account_scope_required');
    const side = normalizeTradeTruthSide(row.side ?? row.direction);
    const conflict='execution_scope_key,provider,environment,symbol,side';
    if(options.onConflict&&options.onConflict!==conflict)throw new Error('trade_truth_contract:unscoped_conflict_forbidden');
    const result=await supabase.from("trade_management_truth").upsert({ ...row, side, direction: undefined }, { onConflict: conflict }).select('id').single();
    confirmedWrite(result);if(!result.data)throw new Error('trade_truth_row_not_persisted');
    return { ok: true, retryable: false, classification: "non_retryable_contract" };
  } catch (error) {
    return classifyError(error);
  }
}

export async function updateTradeManagementTruthByIdentity(supabase: SupabaseLike, identity: { execution_scope_key: string; provider: string; environment: string; symbol: string; side: unknown }, update: Record<string, unknown>): Promise<TradeTruthAdapterResult> {
  try {
    const side = normalizeTradeTruthSide(identity.side);
    if (!side) throw new Error(`trade_truth_contract:invalid_side:${String(identity.side ?? "")}`);
    if(!identity.execution_scope_key)throw new Error('trade_truth_contract:account_scope_required');
    for(const key of ['execution_scope_key','customer_id','account_id','execution_instance_id','provider','environment','symbol','side'])if(key in update)throw new Error('trade_truth_contract:identity_mutation_forbidden');
    const status = update.status ?? update.protection_status ?? "closed";
    assertPayload({ provider: identity.provider, environment: identity.environment, symbol: identity.symbol, side, status });
    const result=await supabase.from("trade_management_truth").update(update).eq('execution_scope_key',identity.execution_scope_key).eq("provider", identity.provider).eq("environment", identity.environment).eq("symbol", identity.symbol).eq("side", side).select('id').maybeSingle();
    confirmedWrite(result);if(!result.data)throw new Error('trade_truth_row_not_persisted');
    return { ok: true, retryable: false, classification: "non_retryable_contract" };
  } catch (error) {
    return classifyError(error);
  }
}

/** Runtime writers must observe failed persistence before reporting success. */
export async function persistTradeManagementTruth(...args:Parameters<typeof upsertTradeManagementTruth>){const result=await upsertTradeManagementTruth(...args);if(!result.ok)throw new Error(result.error??'TRADE_TRUTH_NOT_PERSISTED');return result}
export async function persistTradeManagementTruthRow(...args:Parameters<typeof upsertTradeManagementTruthRow>){const result=await upsertTradeManagementTruthRow(...args);if(!result.ok)throw new Error(result.error??'TRADE_TRUTH_NOT_PERSISTED');return result}
export async function persistTradeManagementTruthByIdentity(...args:Parameters<typeof updateTradeManagementTruthByIdentity>){const result=await updateTradeManagementTruthByIdentity(...args);if(!result.ok)throw new Error(result.error??'TRADE_TRUTH_NOT_PERSISTED');return result}
