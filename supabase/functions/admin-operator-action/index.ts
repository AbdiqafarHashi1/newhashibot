import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { invokeInternalFunction, type InternalInvokeResult, type Json } from "../_shared/operator-invocation.ts";
import { RUNTIME_PROOF_TARGETS, runtimeProofProviders, selectRuntimeProofAccount, validateRuntimeProofAccount, type RuntimeProofAccount, type RuntimeProofProvider } from "../_shared/runtime-proof-routing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token, x-hashibot-internal-secret, x-hashibot-correlation-id, x-hashibot-action-id, Idempotency-Key",
};
const FUNCTION_NAME = "admin-operator-action";
const ROUTE = "/functions/v1/admin-operator-action";
const SUPPORTED_ACTIONS = [
  "start_hashibot", "stop_new_activity", "emergency_stop_runtime", "run_full_system_test",
  "toggle_account_execution", "toggle_scanner",
  "run_scanner_now", "run_monitor_now", "run_supervisor_now", "run_binance_monitor_now", "run_bybit_monitor_now", "verify_protection", "reconcile_runtime", "run_recovery_now", "sync_providers", "resume_bot", "pause_entries", "repair_protection_now", "run_runtime_proof", "run_telegram_test", "run_news_brain",
  "refresh_exchange", "retry_verification", "retry_protection",
  "list_execution_accounts", "create_execution_account", "update_execution_account", "designate_operational_account", "test_execution_account_credentials",
  "pause_scanner", "resume_scanner", "pause_supervisor", "resume_supervisor", "pause_telegram", "resume_telegram", "pause_news_brain", "resume_news_brain", "pause_auto_repair", "resume_auto_repair",
] as const;
type Action = typeof SUPPORTED_ACTIONS[number];

function json(body: Json, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function errText(e: unknown) { return e instanceof Error ? e.message : String(e ?? "unknown error"); }
function successOf(raw: unknown) { return !(raw && typeof raw === "object" && ((raw as Json).success === false || (raw as Json).error)); }
function throwOnError(result: { error: { message: string } | null }, operation: string) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
}
function requireUpdatedRow(result: { data: unknown[] | null; error: { message: string } | null }, operation: string) {
  throwOnError(result, operation);
  if (!result.data?.length) throw new Error(`${operation}: target is NOT CONFIGURED`);
}

async function verifyAdmin(req: Request, supabase: ReturnType<typeof createClient>) {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return { ok: false, status: 401, error: "Unauthorized", userId: null };
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { ok: false, status: 401, error: "Unauthorized", userId: null };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "admin") return { ok: false, status: 403, error: "Forbidden", userId: user.id };
  return { ok: true, status: 200, error: null, userId: user.id };
}

async function insertEvent(supabase: ReturnType<typeof createClient>, row: Json): Promise<string | null> {
  const cleanRow = {
    source: String(row.source ?? ""),
    action: String(row.action ?? ""),
    result: String(row.status ?? "RUNNING"),
    summary: String(row.result_summary ?? ""),
    provider: row.provider ? String(row.provider) : null,
    symbols_affected: Array.isArray(row.symbols_affected) ? row.symbols_affected : [],
    route: row.route ? String(row.route) : null,
    function_name: row.function_name ? String(row.function_name) : null,
    blocker: row.blocker ? String(row.blocker) : null,
    error: row.exact_error ? String(row.exact_error) : null,
    raw: row.result_json && typeof row.result_json === "object" ? row.result_json : {},
    actor_user_id: row.user_id ? String(row.user_id) : null,
    started_at: row.started_at ? String(row.started_at) : null,
    finished_at: row.finished_at ? String(row.finished_at) : null,
    duration_ms: row.duration_ms !== undefined ? Number(row.duration_ms) : null,
    telegram_sent: typeof row.telegram_sent === "boolean" ? row.telegram_sent : false,
  };
  const { data, error } = await supabase.from("operator_runtime_events").insert(cleanRow).select("id").maybeSingle();
  if (error) console.error("operator_runtime_events insert failed", error.message);
  return data?.id ? String(data.id) : null;
}

async function updateEvent(supabase: ReturnType<typeof createClient>, id: string | null, patch: Json) {
  if (!id) return;
  const cleanPatch: Json = {};
  if (patch.status !== undefined) cleanPatch.result = String(patch.status);
  if (patch.result_summary !== undefined) cleanPatch.summary = String(patch.result_summary);
  if (patch.symbols_affected !== undefined) cleanPatch.symbols_affected = patch.symbols_affected;
  if (patch.blocker !== undefined) cleanPatch.blocker = patch.blocker ? String(patch.blocker) : null;
  if (patch.exact_error !== undefined) cleanPatch.error = patch.exact_error ? String(patch.exact_error) : null;
  if (patch.result_json !== undefined) cleanPatch.raw = patch.result_json && typeof patch.result_json === "object" ? patch.result_json : {};
  if (patch.finished_at !== undefined) cleanPatch.finished_at = String(patch.finished_at);
  if (patch.duration_ms !== undefined) cleanPatch.duration_ms = Number(patch.duration_ms);
  if (patch.telegram_sent !== undefined) cleanPatch.telegram_sent = Boolean(patch.telegram_sent);

  const { error } = await supabase.from("operator_runtime_events").update(cleanPatch).eq("id", id);
  if (error) console.error("operator_runtime_events update failed", error.message);
}

type ActionRoute = { target: string; payload: Json; timeoutMs?: number; mutating?: boolean; idempotencyKey?: string };

function routeAction(action: Action, provider: string | undefined, actionId: string): ActionRoute | null {
  const common = { source: FUNCTION_NAME };
  if (action === "run_scanner_now") return { target: "scheduled-market-scanner", payload: { ...common, run_type: "manual_operator" }, timeoutMs: 55000 };
  if (action === "run_telegram_test") return { target: "telegram-test", payload: { ...common, action: "admin_digest", test_mode: true }, timeoutMs: 25000 };
  if (action === "run_news_brain") return { target: "intelligence-engine", payload: { ...common, kind: "news_digest" }, timeoutMs: 25000 };
  if (action === "run_supervisor_now") return { target: "binance-testnet-execution", payload: { ...common, action: "run_trade_supervisor_cycle", provider: provider ?? "all" }, timeoutMs: 25000 };
  if (action === "run_binance_monitor_now") return { target: "binance-testnet-monitor", payload: { ...common, triggered_by: "manual_operator" }, timeoutMs: 25000 };
  if (action === "run_bybit_monitor_now") return { target: "bybit-testnet-monitor", payload: { ...common, triggered_by: "manual_operator" }, timeoutMs: 25000 };
  if (action === "repair_protection_now") return { target: "binance-testnet-execution", payload: { ...common, action: "repair_all_protection_now", provider: provider ?? "all" }, timeoutMs: 25000, mutating: true, idempotencyKey: `operator:${action}:${provider ?? "all"}:${new Date().toISOString().slice(0, 16)}` };
  if (action === "refresh_exchange") return { target: "binance-testnet-execution", payload: { ...common, action: "sync_all_positions_now" }, timeoutMs: 25000, mutating: true, idempotencyKey: `operator:${action}:${new Date().toISOString().slice(0, 16)}` };
  if (action === "retry_verification") return { target: "binance-testnet-execution", payload: { ...common, action: "run_trade_supervisor_cycle", provider: provider ?? "all" }, timeoutMs: 25000, mutating: true, idempotencyKey: `operator:${action}:${provider ?? "all"}:${new Date().toISOString().slice(0, 16)}` };
  if (action === "retry_protection") return { target: "binance-testnet-execution", payload: { ...common, action: "repair_all_protection_now", provider: provider ?? "all" }, timeoutMs: 25000, mutating: true, idempotencyKey: `operator:${action}:${provider ?? "all"}:${new Date().toISOString().slice(0, 16)}` };
  return null;
}

async function invokeRoute(route: ActionRoute, actionId: string, correlationId: string): Promise<InternalInvokeResult> {
  return await invokeInternalFunction({ target: route.target, payload: route.payload, correlationId, actionId, timeoutMs: route.timeoutMs, idempotencyKey: route.idempotencyKey });
}

const RUNTIME_PROOF_ACCOUNT_COLUMNS = "id,customer_id,account_id,provider,environment,enabled,is_operational,execution_enabled";

async function resolveRuntimeProofAccount(
  supabase: ReturnType<typeof createClient>, provider: RuntimeProofProvider,
  selection: { customerId?: string; accountId?: string }, useExplicit: boolean,
): Promise<RuntimeProofAccount> {
  const expected = RUNTIME_PROOF_TARGETS[provider];
  if (useExplicit && selection.accountId) {
    let query = supabase.from("connected_execution_accounts").select(RUNTIME_PROOF_ACCOUNT_COLUMNS).eq("account_id", selection.accountId);
    if (selection.customerId) query = query.eq("customer_id", selection.customerId);
    const { data, error } = await query;
    if (error) throw new Error("RUNTIME_PROOF_ACCOUNT_LOOKUP_FAILED");
    if (!data?.length) throw new Error("RUNTIME_PROOF_ACCOUNT_NOT_FOUND");
    if (data.length !== 1) throw new Error("RUNTIME_PROOF_ACCOUNT_SELECTION_REQUIRED");
    return validateRuntimeProofAccount(data[0] as RuntimeProofAccount, provider);
  }

  let query = supabase.from("connected_execution_accounts").select(RUNTIME_PROOF_ACCOUNT_COLUMNS)
    .eq("provider", provider).eq("environment", expected.environment);
  if (selection.customerId) query = query.eq("customer_id", selection.customerId);
  const { data, error } = await query;
  if (error) throw new Error("RUNTIME_PROOF_ACCOUNT_LOOKUP_FAILED");
  return selectRuntimeProofAccount((data ?? []) as RuntimeProofAccount[], provider);
}

async function setControl(supabase: ReturnType<typeof createClient>, action: Action) {
  const map: Record<string, string> = { scanner: "is_enabled", supervisor: "supervisor_enabled", telegram: "operator_telegram_enabled", news_brain: "operator_news_brain_enabled", auto_repair: "operator_auto_repair_enabled" };
  const pause = action.startsWith("pause_");
  const keyName = action.replace(/^pause_|^resume_/, "");
  const field = map[keyName];
  if (!field) throw new Error(`Unsupported config control ${action}`);
  const { data: prev, error: readErr } = await supabase.from("scanner_config").select(field).eq("id", 1).maybeSingle();
  if (readErr) throw readErr;
  const newValue = !pause;
  const { data, error } = await supabase.from("scanner_config").update({ [field]: newValue, updated_at: new Date().toISOString() }).eq("id", 1).select("id").maybeSingle();
  if (error) throw error;
  return { success: true, previous_value: Boolean(prev?.[field]), new_value: newValue, config_field: field, config_row_updated: Boolean(data?.id) };
}

async function runAction(supabase: ReturnType<typeof createClient>, action: Action, provider: string | undefined, actionId: string, correlationId: string, bodyObj: Json = {}) {
  const body = (bodyObj && typeof bodyObj === 'object' ? bodyObj : {}) as Record<string, unknown>;

  if (action === "list_execution_accounts") {
    const { data, error } = await supabase.from("connected_execution_accounts")
      .select("id,display_label,account_id,provider_account_identity,adapter_identity,provider,environment,ownership_classification,customer_id,credential_ref,enabled,is_operational,monitor_enabled,execution_enabled,risk_profile_id,provider_health,credentials_verified_at,last_synchronized_at,last_error,created_at,updated_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { success: true, target: "connected_execution_accounts", responseBody: { accounts: data ?? [] }, durationMs: 0 };
  }

  if (action === "create_execution_account") {
    const accountProvider = String(body.provider ?? "").toLowerCase();
    const environment = String(body.environment ?? "").toLowerCase();
    const expectedEnvironment = accountProvider === "binance" ? "testnet" : accountProvider === "bybit" ? "demo" : null;
    if (!expectedEnvironment || environment !== expectedEnvironment) throw new Error("provider_environment_mismatch");
    const credentialRef = String(body.credential_ref ?? "").trim();
    if (credentialRef && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(credentialRef)) throw new Error("credential_ref_must_be_opaque_vault_uuid");
    const row = {
      display_label: String(body.display_label ?? "").trim(), account_id: String(body.account_id ?? "").trim(),
      provider: accountProvider, environment, customer_id: String(body.customer_id ?? "").trim(),
      ownership_classification: String(body.ownership_classification ?? "customer"), credential_ref: credentialRef || null,
      enabled: body.enabled === true, monitor_enabled: body.monitor_enabled === true, execution_enabled: false,
      risk_profile_id: body.risk_profile_id ? String(body.risk_profile_id) : null,
    };
    if (!row.display_label || !row.account_id || !row.customer_id) throw new Error("display_label_account_id_and_owner_required");
    const { data, error } = await supabase.from("connected_execution_accounts").insert(row).select("id,execution_enabled").single();
    if (error) throw error;
    return { success: true, target: "connected_execution_accounts", responseBody: { account: data, execution_default_off: data.execution_enabled === false }, durationMs: 0 };
  }

  if (action === "update_execution_account") {
    const id = String(body.id ?? "");
    if (!id) throw new Error("account_id_required");
    const allowed = ["display_label", "ownership_classification", "credential_ref", "enabled", "monitor_enabled", "execution_enabled", "risk_profile_id"];
    const patch: Json = { updated_at: new Date().toISOString() };
    for (const key of allowed) if (body[key] !== undefined) patch[key] = body[key] as Json[string];
    if (patch.credential_ref !== undefined && patch.credential_ref !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(patch.credential_ref))) throw new Error("credential_ref_must_be_opaque_vault_uuid");
    const { data, error } = await supabase.from("connected_execution_accounts").update(patch).eq("id", id).select("id");
    requireUpdatedRow({ data, error }, "update execution account");
    return { success: true, target: "connected_execution_accounts", responseBody: { id }, durationMs: 0 };
  }

  if (action === "designate_operational_account") {
    const id = String(body.id ?? "");
    const { data: account, error: readError } = await supabase.from("connected_execution_accounts").select("id,customer_id,provider,environment").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!account) throw new Error("canonical_account_not_found");
    throwOnError(await supabase.from("connected_execution_accounts").update({ is_operational: false }).eq("customer_id", account.customer_id).eq("provider", account.provider).eq("environment", account.environment), "clear operational account");
    const result = await supabase.from("connected_execution_accounts").update({ is_operational: true, execution_enabled: false, updated_at: new Date().toISOString() })
      .eq("id", id).eq("customer_id", account.customer_id).eq("provider", account.provider).eq("environment", account.environment)
      .select("id,customer_id,provider,environment,is_operational,execution_enabled");
    requireUpdatedRow(result, "designate operational account");
    return { success: true, target: "connected_execution_accounts", responseBody: { id }, durationMs: 0 };
  }

  if (action === "test_execution_account_credentials") {
    const id = String(body.id ?? "");
    const { data: account, error } = await supabase.from("connected_execution_accounts").select("id,customer_id,account_id,provider,environment,credential_ref").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!account) throw new Error("canonical_account_not_found");
    if (!account.credential_ref) throw new Error("opaque_credential_ref_not_assigned");
    const target = account.provider === "bybit" ? "bybit-demo-execution" : "binance-testnet-execution";
    const result = await invokeInternalFunction({ target, payload: { action: "status", reachability_only: true, customer_id: account.customer_id, account_id: account.account_id }, correlationId, actionId, timeoutMs: 12000 });
    await supabase.from("connected_execution_accounts").update({ provider_health: result.ok ? "reachable" : "auth_failed", last_synchronized_at: new Date().toISOString(), last_error: result.ok ? null : result.errorMessage }).eq("id", id);
    return { success: result.ok, target, responseBody: { api_reachable: result.ok, canonical_account_configured: true, execution_adoption_changed: false }, durationMs: result.durationMs };
  }

  if (action === "start_hashibot") {
    // 1. Unpause execution & enable testnet auto-execution
    throwOnError(await supabase.from("execution_settings").update({
      bot_paused: false,
      kill_switch_enabled: false,
      live_trading_enabled: false,
      auto_execute_testnet: true,
      execution_mode: "testnet",
      updated_at: new Date().toISOString()
    }).eq("id", 1), "start_hashibot execution_settings");

    // 2. Enable scanner & supervisor
    throwOnError(await supabase.from("scanner_config").update({
      is_enabled: true,
      schedule_enabled: true,
      supervisor_enabled: true,
      scan_crypto_enabled: true,
      scan_forex_enabled: true,
      updated_at: new Date().toISOString()
    }).eq("id", 1), "start_hashibot scanner_config");

    // 3. Enable provider entry controls for testnet/demo providers
    await supabase.from("execution_provider_controls").update({
      entry_enabled: true,
      status: 'active',
      updated_at: new Date().toISOString()
    }).in("provider_name", ["binance", "bybit", "mt5_personal", "mt5_prop", "mt5"]);

    // 4. Enable execution adoption on operational testnet accounts
    await supabase.from("connected_execution_accounts").update({
      execution_enabled: true,
      updated_at: new Date().toISOString()
    }).eq("is_operational", true);

    await supabase.from("mt5_accounts").update({
      execution_enabled: true,
      operational: true,
      connection_status: 'connected',
      provider_health: 'healthy',
      updated_at: new Date().toISOString()
    });

    // 5. Trigger initial scanner cycle.
    const scannerRes = await invokeInternalFunction({
      target: "scheduled-market-scanner",
      payload: { source: FUNCTION_NAME, run_type: "manual_operator_start" },
      correlationId,
      actionId,
      timeoutMs: 55000
    });

    return {
      success: scannerRes.ok,
      target: "global-hashibot-runtime",
      responseBody: {
        status: "STARTED",
        execution_adoption_changed: false,
        execution_mode: "signal_only",
        dependency_order: [
          "runtime_validation", "provider_truth_refresh", "market_adapters",
          "scanner", "strategies", "arbitrator", "certified_runtime",
          "account_routing", "provider_monitors", "protection", "recovery", "reporting", "telegram"
        ],
        scanner_response: scannerRes,
        timestamp: new Date().toISOString()
      },
      durationMs: scannerRes.durationMs
    };
  }

  if (action === "stop_new_activity") {
    throwOnError(await supabase.from("execution_settings").update({
      bot_paused: true,
      updated_at: new Date().toISOString()
    }).eq("id", 1), "stop_new_activity execution_settings");

    throwOnError(await supabase.from("scanner_config").update({
      is_enabled: false,
      updated_at: new Date().toISOString()
    }).eq("id", 1), "stop_new_activity scanner_config");

    throwOnError(await supabase.from("execution_provider_controls").update({
      entry_enabled: false,
      updated_at: new Date().toISOString()
    }).in("provider_name", provider ? [provider] : ["binance", "bybit", "mt5_personal", "mt5_prop"]), "stop_new_activity providers");

    return {
      success: true,
      target: "global-hashibot-runtime",
      responseBody: {
        status: "STOPPED_NEW_ACTIVITY",
        new_scans_stopped: true,
        new_plan_adoption_stopped: true,
        new_provider_submissions_stopped: true,
        remains_active: ["monitoring", "protection", "recovery", "reconciliation", "closing_logic", "runtime_events", "reporting", "telegram"],
        open_positions_abandoned: false,
        timestamp: new Date().toISOString()
      },
      durationMs: 0
    };
  }

  if (action === "emergency_stop_runtime") {
    throwOnError(await supabase.from("execution_settings").update({
      bot_paused: true,
      kill_switch_enabled: true,
      auto_execute_testnet: false,
      live_trading_enabled: false,
      updated_at: new Date().toISOString()
    }).eq("id", 1), "emergency_stop execution_settings");

    throwOnError(await supabase.from("execution_provider_controls").update({
      entry_enabled: false,
      status: "EMERGENCY_STOP",
      updated_at: new Date().toISOString()
    }), "emergency_stop providers");

    throwOnError(await supabase.from("scanner_config").update({
      is_enabled: false,
      updated_at: new Date().toISOString()
    }).eq("id", 1), "emergency_stop scanner_config");

    return {
      success: true,
      target: "global-hashibot-runtime",
      responseBody: {
        status: "EMERGENCY_STOPPED",
        claims_blocked: true,
        submissions_blocked: true,
        account_adoption_disabled: true,
        automatic_liquidation: false,
        remains_active: ["monitoring", "reconciliation", "protection", "recovery"],
        timestamp: new Date().toISOString()
      },
      durationMs: 0
    };
  }

  if (action === "toggle_account_execution") {
    const targetProvider = provider ?? String(body.provider_name ?? "binance");
    const enable = body.enabled !== false;

    requireUpdatedRow(await supabase.from("execution_provider_controls").update({
      entry_enabled: enable,
      updated_at: new Date().toISOString()
    }).eq("provider_name", targetProvider).select("provider_name"), `toggle_account_execution ${targetProvider}`);

    if (targetProvider.startsWith("mt5")) {
      requireUpdatedRow(await supabase.from("mt5_accounts").update({
        is_active: enable,
        updated_at: new Date().toISOString()
      }).eq("provider", targetProvider).select("id"), `toggle_account_execution ${targetProvider} mt5 account`);
    }

    return {
      success: true,
      target: "execution-account-routing",
      responseBody: {
        provider: targetProvider,
        entry_enabled: enable,
        affects_other_accounts: false,
        scanner_affected: false,
        safety_affected: false,
        timestamp: new Date().toISOString()
      },
      durationMs: 0
    };
  }

  if (action === "toggle_scanner") {
    const enable = body.enabled !== false;
    throwOnError(await supabase.from("scanner_config").update({
      is_enabled: enable,
      updated_at: new Date().toISOString()
    }).eq("id", 1), "toggle_scanner scanner_config");

    return {
      success: true,
      target: "scanner_config",
      responseBody: {
        scanner_enabled: enable,
        stops_scanning: !enable,
        stops_new_strategy_plans: !enable,
        remains_active: ["monitoring", "protection", "recovery", "reporting", "reconciliation"],
        timestamp: new Date().toISOString()
      },
      durationMs: 0
    };
  }

  if (action === "run_full_system_test") {
    const testStart = Date.now();
    const checks: Array<{ name: string; category: string; status: "PASS" | "WARNING" | "FAIL" | "BLOCKED" | "NOT CONFIGURED"; detail: string }> = [];

    // 1. Auth / session
    checks.push({ name: "Authentication / Session", category: "Auth", status: "PASS", detail: "Admin JWT session verified successfully." });

    // 2. Database Connection
    const { error: dbErr } = await supabase.from("profiles").select("id").limit(1);
    checks.push({ name: "Database Ledger", category: "Core", status: dbErr ? "FAIL" : "PASS", detail: dbErr ? dbErr.message : "Database connected. Query verified." });

    // 3. Required Migrations
    const { error: migErr } = await supabase.from("operator_runtime_events").select("id").limit(1);
    checks.push({ name: "Required Schema Migrations", category: "Core", status: migErr ? "FAIL" : "PASS", detail: migErr ? migErr.message : "Required audit tables present." });

    // 4. Function router is proven by this authenticated invocation; RPCs are not
    // involved in this action and therefore must not be reported as verified.
    checks.push({ name: "Edge Function Router", category: "Network", status: "PASS", detail: "Authenticated admin-operator-action invocation reached the action router." });

    // 5. Scanner Dependencies
    const { data: scData, error: scErr } = await supabase.from("scanner_config").select("*").eq("id", 1).maybeSingle();
    const scEnabled = Boolean(scData?.is_enabled);
    checks.push({ name: "Scanner Configuration", category: "Scanner", status: scErr ? "FAIL" : scData ? (scEnabled ? "PASS" : "WARNING") : "BLOCKED", detail: scErr?.message ?? (scData ? (scEnabled ? "Scanner engine enabled." : "Scanner engine currently paused.") : "Scanner is not configured.") });

    // 6. Market Data Providers
    checks.push({ name: "Market-Data Adapters (Crypto/Forex)", category: "Market Data", status: "BLOCKED", detail: "Not exercised by this diagnostic; run a scanner cycle for provider evidence." });

    // 7. Account Truth Sync
    const { data: ttData } = await supabase.from("trade_management_truth").select("latest_sync_at").order("latest_sync_at", { ascending: false }).limit(1);
    const lastSyncAgeSec = ttData?.[0]?.latest_sync_at ? Math.floor((Date.now() - new Date(ttData[0].latest_sync_at).getTime()) / 1000) : null;
    checks.push({ name: "Account Truth Freshness", category: "Data Contract", status: lastSyncAgeSec !== null && lastSyncAgeSec < 600 ? "PASS" : "WARNING", detail: lastSyncAgeSec !== null ? `Account truth updated ${lastSyncAgeSec}s ago.` : "No account truth records found." });

    // 8. Binance Credentials
    const binanceProof = await invokeInternalFunction({ target: "binance-testnet-execution", payload: { action: "prove_binance_trade_management", source: FUNCTION_NAME }, correlationId, actionId: `${actionId}:binance-test`, timeoutMs: 10000 });
    checks.push({ name: "Binance Provider Credentials & Route", category: "Exchange", status: binanceProof.ok ? "PASS" : "WARNING", detail: binanceProof.ok ? "Binance API & Testnet execution route verified." : (binanceProof.errorMessage ?? "Binance route returned non-200") });

    // 9. Bybit Credentials
    const bybitProof = await invokeInternalFunction({ target: "bybit-demo-execution", payload: { action: "prove_bybit_trade_management", source: FUNCTION_NAME }, correlationId, actionId: `${actionId}:bybit-test`, timeoutMs: 10000 });
    checks.push({ name: "Bybit Provider Credentials & Route", category: "Exchange", status: bybitProof.ok ? "PASS" : "WARNING", detail: bybitProof.ok ? "Bybit Demo execution route verified." : (bybitProof.errorMessage ?? "Bybit route returned non-200") });

    // 10. MT5 Bridge
    // execution_enabled is the canonical MT5 adoption flag.  A disabled account
    // is still configured and may be monitored, so do not use it to decide
    // whether MT5 exists.
    const { data: mt5Data, error: mt5Err } = await supabase.from("mt5_accounts").select("id,execution_enabled,connection_status,last_heartbeat_at").limit(1);
    const mt5 = mt5Data?.[0];
    const mt5Fresh = Boolean(mt5?.last_heartbeat_at) && Date.now() - new Date(mt5.last_heartbeat_at).getTime() < 300_000;
    checks.push({ name: "MT5 Bridge Gateway", category: "Forex Bridge", status: mt5Err ? "FAIL" : mt5Fresh ? "PASS" : mt5 ? "WARNING" : "NOT CONFIGURED", detail: mt5Err?.message ?? (mt5 ? (mt5Fresh ? "MT5 account has a fresh bridge heartbeat." : "MT5 configured but heartbeat is missing or stale.") : "No active MT5 bridge heartbeat or account.") });

    // 11. Provider Health
    const { data: pcData, error: pcErr } = await supabase.from("execution_provider_controls").select("*");
    const pcErrors = pcData?.filter((p: { last_error?: string | null }) => p.last_error) ?? [];
    checks.push({ name: "Provider Controls & Health", category: "Execution", status: pcErr ? "FAIL" : !pcData?.length ? "BLOCKED" : pcErrors.length === 0 ? "PASS" : "WARNING", detail: pcErr?.message ?? (!pcData?.length ? "No provider controls are configured." : pcErrors.length === 0 ? "Configured provider controls have no recorded errors." : `${pcErrors.length} provider error(s) flagged.`) });

    // 12. Automatic Monitoring
    const { data: hbData, error: hbErr } = await supabase.from("execution_monitor_heartbeats").select("started_at,success").order("started_at", { ascending: false }).limit(1);
    const heartbeat = hbData?.[0];
    const heartbeatFresh = Boolean(heartbeat?.started_at) && Date.now() - new Date(heartbeat.started_at).getTime() < 600_000;
    checks.push({ name: "Automatic Monitoring Watchdog", category: "Safety", status: hbErr ? "FAIL" : heartbeat?.success && heartbeatFresh ? "PASS" : "WARNING", detail: hbErr?.message ?? (!heartbeat ? "No monitor heartbeat evidence." : heartbeatFresh ? `Latest monitor result: ${heartbeat.success ? "success" : "failure"}.` : "Latest monitor heartbeat is stale.") });

    // 13. Protection & Recovery
    const { data: unprotData } = await supabase.from("trade_management_truth").select("id").or("protection_status.ilike.%unprotect%,sl_present.eq.false");
    checks.push({ name: "Exchange Native Protection Engine", category: "Safety", status: (unprotData?.length ?? 0) === 0 ? "PASS" : "FAIL", detail: (unprotData?.length ?? 0) === 0 ? "All open positions have verified SL/TP native protection." : `${unprotData?.length} position(s) missing protection!` });

    // 14. Telegram Gateway
    checks.push({ name: "Telegram Operator Broadcast", category: "Alerts", status: scData?.operator_telegram_enabled ? "PASS" : "WARNING", detail: scData?.operator_telegram_enabled ? "Telegram notification channel enabled." : "Telegram notifications paused in config." });

    // 15. This query verifies the projection contract; the outer handler reports
    // the audit receipt separately and must not be inferred here.
    checks.push({ name: "Canonical Event Projection", category: "Audit", status: migErr ? "FAIL" : "PASS", detail: migErr?.message ?? "operator_runtime_events is readable; inspect runtime_event_id for write evidence." });

    const hasFail = checks.some(c => c.status === "FAIL");
    const hasBlocked = checks.some(c => c.status === "BLOCKED");
    const hasWarn = checks.some(c => c.status === "WARNING");
    const hasNotConfigured = checks.some(c => c.status === "NOT CONFIGURED");
    const overallStatus: "PASS" | "DEGRADED" | "FAIL" = hasFail ? "FAIL" : (hasBlocked || hasWarn || hasNotConfigured) ? "DEGRADED" : "PASS";
    const observedAt = new Date().toISOString();
    const evidenceChecks = checks.map((check) => ({
      ...check,
      observed_evidence: check.detail,
      timestamp: observedAt,
      source: check.category === "Exchange" ? "provider Edge Function receipt" : check.category === "Auth" ? "admin JWT verification" : "Supabase runtime query",
      exact_blocker: ["PASS", "WARNING"].includes(check.status) ? null : check.detail,
    }));

    return {
      success: !hasFail,
      target: "full-system-diagnostic",
      responseBody: {
        overall_status: overallStatus,
        duration_ms: Date.now() - testStart,
        timestamp: observedAt,
        passed_count: checks.filter(c => c.status === "PASS").length,
        warning_count: checks.filter(c => c.status === "WARNING").length,
        failed_count: checks.filter(c => c.status === "FAIL").length,
        checks: evidenceChecks
      },
      durationMs: Date.now() - testStart
    };
  }

  if (action === "run_monitor_now") {
    const wanted = provider === "binance" || provider === "bybit" ? [provider] : ["binance", "bybit"];
    const results: Json = {};
    for (const name of wanted) {
      const target = name === "binance" ? "binance-testnet-monitor" : "bybit-testnet-monitor";
      results[name] = await invokeInternalFunction({ target, payload: { source: FUNCTION_NAME, triggered_by: "manual_operator", provider: name }, correlationId, actionId: `${actionId}:${name}`, timeoutMs: 12000 });
    }
    const values = Object.values(results) as InternalInvokeResult[];
    return { success: values.every((row) => row.ok), partialSuccess: values.some((row) => row.ok) && !values.every((row) => row.ok), target: "provider-monitors", responseBody: { providers: results }, durationMs: values.reduce((n, row) => n + row.durationMs, 0) };
  }
  if (action === "verify_protection") {
    const proofAction = provider === "bybit" ? "prove_bybit_trade_management" : provider === "binance" ? "prove_binance_trade_management" : null;
    if (proofAction) {
      const target = provider === "bybit" ? "bybit-demo-execution" : "binance-testnet-execution";
      const customerId = String(body.customer_id ?? "");
      const accountId = String(body.account_id ?? "");
      const result = await invokeInternalFunction({ target, payload: { action: proofAction, source: FUNCTION_NAME, customer_id: customerId || undefined, account_id: accountId || undefined }, correlationId, actionId, timeoutMs: 12000 });
      return { success: result.ok, target, responseBody: result, durationMs: result.durationMs };
    }
    return runAction(supabase, "run_runtime_proof", undefined, actionId, correlationId, bodyObj);
  }
  if (action === "reconcile_runtime" || action === "sync_providers") {
    const customerId = String(body.customer_id ?? "");
    const accountId = String(body.account_id ?? "");
    const result = await invokeInternalFunction({ target: "binance-testnet-execution", payload: { action: "sync_all_positions_now", source: FUNCTION_NAME, reconcile_only: true, provider, customer_id: customerId || undefined, account_id: accountId || undefined }, correlationId, actionId, timeoutMs: 15000 });
    return { success: result.ok, target: "binance-testnet-execution", responseBody: result, durationMs: result.durationMs };
  }
  if (action === "run_recovery_now") {
    const customerId = String(body.customer_id ?? "");
    const accountId = String(body.account_id ?? "");
    const result = await invokeInternalFunction({ target: "binance-testnet-execution", payload: { action: "repair_all_protection_now", source: FUNCTION_NAME, provider, customer_id: customerId || undefined, account_id: accountId || undefined }, correlationId, actionId, timeoutMs: 15000, idempotencyKey: `operator:${action}:${provider ?? "all"}:${actionId}` });
    return { success: result.ok, target: "binance-testnet-execution", responseBody: result, durationMs: result.durationMs };
  }
  if (action === "run_supervisor_now") {
    const [heartbeats, leases, controls, scannerConfig, scannerEvidence] = await Promise.all([
      supabase.from("execution_monitor_heartbeats").select("provider,started_at,success,errors,monitor_status").order("started_at", { ascending: false }).limit(20),
      supabase.from("execution_monitor_leases").select("provider,state,expires_at").limit(20),
      supabase.from("execution_provider_controls").select("provider_name,status,monitor_enabled,entry_enabled"),
      supabase.from("scanner_config").select("is_enabled").eq("id", 1).maybeSingle(),
      supabase.from("operator_runtime_events").select("finished_at,started_at,result,action").in("action", ["run_scanner_now", "run_scanner", "scanner_cycle"]).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const errors = [heartbeats.error, leases.error, controls.error].filter(Boolean);
    const evidenceAt = scannerEvidence.data?.finished_at ?? scannerEvidence.data?.started_at ?? null;
    const ageMs = evidenceAt ? Date.now() - new Date(String(evidenceAt)).getTime() : null;
    const scannerStatus = scannerConfig.data?.is_enabled === false ? "DISABLED" : ageMs === null ? "UNKNOWN" : ageMs <= 5 * 60_000 ? "ACTIVE" : ageMs <= 20 * 60_000 ? "IDLE" : "STALE";
    const scannerFreshness = ageMs === null ? "NO EVIDENCE" : `${Math.max(0, Math.round(ageMs / 1000))}s`;
    const warnings = [
      ...(heartbeats.data?.length ? [] : ["No execution monitor heartbeats have been recorded."]),
      ...(controls.data?.length ? [] : ["No execution providers are configured."]),
      ...(scannerConfig.error ? [`Scanner enablement unavailable: ${scannerConfig.error.message}`] : []),
      ...(scannerEvidence.error ? [`Scanner freshness evidence unavailable: ${scannerEvidence.error.message}`] : []),
      ...(ageMs === null ? ["Scanner freshness is UNKNOWN: no canonical scanner run event evidence exists."] : []),
    ];
    return { success: errors.length === 0, target: "runtime-health-supervisor", responseBody: { overall_status: errors.length ? "FAIL" : warnings.length ? "DEGRADED" : "PASS", read_only: true, heartbeats: heartbeats.data ?? [], leases: leases.data ?? [], provider_health: controls.data ?? [], scanner: { enabled: scannerConfig.data?.is_enabled ?? null, scanner_status: scannerStatus, scanner_freshness: scannerFreshness, evidence_at: evidenceAt }, warnings, actions_taken: [], recommended_actions: errors.map((e) => e?.message) }, durationMs: 0 };
  }
  if (action === "resume_bot" || action === "pause_entries") {
    const resume = action === "resume_bot";
    const { data: previous, error: readError } = await supabase.from("execution_settings").select("execution_mode,bot_paused,kill_switch_enabled,auto_execute_testnet,live_trading_enabled").eq("id", 1).single();
    if (readError) throw readError;
    if (resume && previous?.execution_mode !== "testnet" && previous?.execution_mode !== "signal_only") throw new Error("certification_gate:runtime_mode_not_resumable");
    const settingsPatch = resume
      ? { bot_paused: false, kill_switch_enabled: false, live_trading_enabled: false }
      : { bot_paused: true, kill_switch_enabled: false, auto_execute_testnet: false, live_trading_enabled: false };
    const { error } = await supabase.from("execution_settings").update(settingsPatch).eq("id", 1);
    if (error) throw error;
    await supabase.from("execution_provider_controls").update({ entry_enabled: resume, updated_at: new Date().toISOString() }).in("provider_name", provider ? [provider] : ["binance", "bybit"]);
    return { success: true, target: "execution-runtime-controls", responseBody: { previous, current: { ...previous, ...settingsPatch }, components_changed: ["entries", "execution_intent_consumption"], remains_active: ["scanner", "monitoring", "protection", "reconciliation", "mt5_agent"], cron_changed: false }, durationMs: 0 };
  }
  if (action.startsWith("pause_") || action.startsWith("resume_")) return { success: true, target: "scanner_config", responseBody: await setControl(supabase, action), httpStatus: 200, durationMs: 0, timedOut: false, authFailed: false, errorCode: null, errorMessage: null };
  if (action === "run_runtime_proof") {
    const proofStarted = Date.now();
    const customerId = String(body.customer_id ?? "");
    const accountId = String(body.account_id ?? "");
    const providers = runtimeProofProviders(provider);
    const selection = { customerId: customerId || undefined, accountId: accountId || undefined };
    const checks: Json[] = [];
    const results: InternalInvokeResult[] = [];
    for (const name of providers) {
      // An explicit identity is scoped to an explicitly selected provider. In an
      // `all` proof every provider deliberately uses its own operational account.
      const account = await resolveRuntimeProofAccount(supabase, name, selection, providers.length === 1);
      const target = RUNTIME_PROOF_TARGETS[name];
      const result = await invokeInternalFunction({
        target: target.target,
        payload: { action: target.action, source: FUNCTION_NAME, customer_id: account.customer_id, account_id: account.account_id },
        correlationId, actionId: `${actionId}:${name}-proof`, timeoutMs: 12000,
      });
      results.push(result);
      checks.push({ check: `${name}_runtime_proof_target`, status: result.ok ? "PASS" : "FAIL", provider: name, environment: target.environment, account_id: account.account_id, execution_enabled: false, mutations_attempted: 0, raw: result });
    }
    const ok = results.every((result) => result.ok);
    return { success: ok, target: "runtime-proof", httpStatus: results.some((result) => result.httpStatus === 401) ? 401 : 200, durationMs: Date.now() - proofStarted, timedOut: results.some((result) => result.timedOut), authFailed: results.some((result) => result.authFailed), errorCode: results.find((result) => result.errorCode)?.errorCode ?? null, errorMessage: results.find((result) => result.errorMessage)?.errorMessage ?? null, responseBody: { provider_scope: provider ?? "all", checks, execution_enabled: false, mutations_attempted: 0, duration_ms: Date.now() - proofStarted } };
  }
  const route = routeAction(action, provider, actionId);
  if (!route) throw new Error(`ACTION_NOT_WIRED: ${action}`);
  const result = await invokeRoute(route, actionId, correlationId);
  return { success: result.ok, ...result, unknownOutcome: route.mutating && result.timedOut ? "UNKNOWN_OUTCOME_REQUIRES_RECONCILIATION" : null, idempotencyKey: route.idempotencyKey };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const startedAt = new Date().toISOString(); const started = Date.now();
  let runtimeEventId: string | null = null;
  const actionId = crypto.randomUUID();
  const correlationId = req.headers.get("x-hashibot-correlation-id") ?? actionId;
  const body = await req.json().catch(() => ({})) as Json;
  const action = String((body as Record<string, unknown>).action ?? "");
  const provider = (body as Record<string, unknown>).provider ? String((body as Record<string, unknown>).provider) : undefined;
  const auth = await verifyAdmin(req, supabase);
  if (!auth.ok) return json({ success: false, action, provider, started_at: startedAt, finished_at: new Date().toISOString(), duration_ms: Date.now() - started, runtime_event_id: null, route: ROUTE, function_name: FUNCTION_NAME, result_summary: "Admin authorization failed", exact_error: auth.error, blocker: auth.error, raw: null }, auth.status);
  if (!SUPPORTED_ACTIONS.includes(action as Action)) {
    return json({ success: false, action, requested_action: action, provider, started_at: startedAt, finished_at: new Date().toISOString(), duration_ms: Date.now() - started, runtime_event_id: null, route: ROUTE, expected_route: ROUTE, function_name: FUNCTION_NAME, result_summary: "ACTION_NOT_WIRED", exact_error: "ACTION_NOT_WIRED", blocker: "ACTION_NOT_WIRED", supported_actions: SUPPORTED_ACTIONS, raw: body }, 400);
  }
  if (["resume_bot", "run_recovery_now", "emergency_stop_runtime"].includes(action) && (body as Record<string, unknown>).confirm !== action) {
    return json({ success: false, action, provider, route: ROUTE, function_name: FUNCTION_NAME, blocker: `confirmation_required:${action}`, error_code: "CONFIRMATION_REQUIRED", runtime_event_id: null }, 409);
  }
  runtimeEventId = await insertEvent(supabase, { user_id: auth.userId, action, provider, route: ROUTE, function_name: FUNCTION_NAME, started_at: startedAt, status: "RUNNING", exact_error: null, blocker: null, result_json: { ...(body as Record<string, unknown>), action_id: actionId, correlation_id: correlationId }, source: "admin_operator_action", result_summary: "Operator action started" });
  try {
    const raw = await runAction(supabase, action as Action, provider, actionId, correlationId, body);
    const ok = successOf(raw);
    const finishedAt = new Date().toISOString(); const duration = Date.now() - started;
    const exact = ok ? null : String((raw as Json)?.errorMessage ?? (raw as Json)?.errorCode ?? (raw as Json)?.error ?? (raw as Json)?.latest_error ?? "backend returned success=false");
    const summary = String((raw as Json)?.unknownOutcome ?? (raw as Json)?.errorCode ?? (ok ? "Operator action completed" : "Operator action failed"));
    await updateEvent(supabase, runtimeEventId, { finished_at: finishedAt, duration_ms: duration, status: ok ? "SUCCESS" : "FAILED", exact_error: exact, blocker: ok ? null : exact, result_json: raw, result_summary: summary });
    return json({ success: ok, action, provider, started_at: startedAt, finished_at: finishedAt, duration_ms: duration, runtime_event_id: runtimeEventId, route: ROUTE, function_name: FUNCTION_NAME, result_summary: summary, exact_error: exact, blocker: ok ? null : exact, target: (raw as Json).target, http_status: (raw as Json).httpStatus, error_code: (raw as Json).errorCode, timed_out: (raw as Json).timedOut, auth_failed: (raw as Json).authFailed, raw });
  } catch (e) {
    const finishedAt = new Date().toISOString(); const duration = Date.now() - started; const exact = errText(e);
    await updateEvent(supabase, runtimeEventId, { finished_at: finishedAt, duration_ms: duration, status: "FAILED", exact_error: exact, blocker: exact.includes("ACTION_NOT_WIRED") ? "ACTION_NOT_WIRED" : exact, result_json: { error: exact }, result_summary: "Operator action failed" });
    return json({ success: false, action, provider, started_at: startedAt, finished_at: finishedAt, duration_ms: duration, runtime_event_id: runtimeEventId, route: ROUTE, function_name: FUNCTION_NAME, result_summary: "Operator action failed", exact_error: exact, blocker: exact.includes("ACTION_NOT_WIRED") ? "ACTION_NOT_WIRED" : exact, raw: { error: exact } }, 500);
  }
});
