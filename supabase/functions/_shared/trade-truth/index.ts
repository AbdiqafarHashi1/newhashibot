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

export async function upsertTradeManagementTruth(supabase: SupabaseLike, payload: Record<string, unknown>): Promise<TradeTruthAdapterResult> {
  try {
    assertPayload(payload);
    const side = normalizeTradeTruthSide(payload.p_direction ?? payload.direction ?? payload.side);
    await supabase.rpc("upsert_trade_management_truth", { ...payload, p_direction: side });
    return { ok: true, retryable: false, classification: "non_retryable_contract" };
  } catch (error) {
    return classifyError(error);
  }
}

export async function upsertTradeManagementTruthRow(supabase: SupabaseLike, row: Record<string, unknown>, options: { onConflict?: string } = {}): Promise<TradeTruthAdapterResult> {
  try {
    assertPayload(row);
    const side = normalizeTradeTruthSide(row.side ?? row.direction);
    await supabase.from("trade_management_truth").upsert({ ...row, side, direction: undefined }, { onConflict: options.onConflict ?? "provider,environment,symbol,side" });
    return { ok: true, retryable: false, classification: "non_retryable_contract" };
  } catch (error) {
    return classifyError(error);
  }
}

export async function updateTradeManagementTruthByIdentity(supabase: SupabaseLike, identity: { provider: string; environment: string; symbol: string; side: unknown }, update: Record<string, unknown>): Promise<TradeTruthAdapterResult> {
  try {
    const side = normalizeTradeTruthSide(identity.side);
    if (!side) throw new Error(`trade_truth_contract:invalid_side:${String(identity.side ?? "")}`);
    const status = update.status ?? update.protection_status ?? "closed";
    assertPayload({ provider: identity.provider, environment: identity.environment, symbol: identity.symbol, side, status });
    await supabase.from("trade_management_truth").update(update).eq("provider", identity.provider).eq("environment", identity.environment).eq("symbol", identity.symbol).eq("side", side);
    return { ok: true, retryable: false, classification: "non_retryable_contract" };
  } catch (error) {
    return classifyError(error);
  }
}
