import {synchronizeCanonicalMonitor} from '../_shared/canonical-monitor-observations.ts';
import {admitProviderPositions} from "../_shared/provider-snapshot-admission.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { authJsonResponse, authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";
import { persistTradeManagementTruth as upsertTradeManagementTruth, persistTradeManagementTruthRow as upsertTradeManagementTruthRow, persistTradeManagementTruthByIdentity as updateTradeManagementTruthByIdentity } from "../_shared/trade-truth/index.ts";
import { acquireExecutionLease, enumerateExecutionAccounts, ownershipFields, releaseExecutionLease, resolveEdgeProviderCredential, runtimeOwnershipFields, settleExecutionAccounts, type EdgeExecutionOwnership, type EdgeProviderCredential } from "../_shared/execution-ownership.ts";
import {collectBybitPages,confirmedBybitTp1,reconcileBybitStop} from "../_shared/bybit-managed-protection.ts";
import {canonicalLifecycleType,enqueueCanonicalLifecycle,lifecycleAudience} from "../_shared/canonical-lifecycle-publication.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token",
};

type SupabaseClient = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
const ACTIVE_STATUSES = ["pending", "failed", "entry_submitted", "entry_filled", "protected", "protected_native", "partially_closed", "pending_protection", "protection_pending", "protection_failed", "protection_recovered", "protected_managed", "pending_managed_protection"];

const MONITOR_TIMEOUT_MS = 25000;
const MONITOR_ROW_LIMIT = 25;
const MONITOR_CANCEL_LIMIT = 25;
const MONITOR_REPAIR_LIMIT = 30;
const RECENT_LEASE_MS = 45000;

function elapsedMs(startedMs: number): number { return Date.now() - startedMs; }
function assertMonitorBudget(startedMs: number, stage: string) {
  if (elapsedMs(startedMs) > MONITOR_TIMEOUT_MS) throw new Error(`BYBIT_MONITOR_TIMEOUT:${stage}:${elapsedMs(startedMs)}ms`);
}
function markStage(stageTimings: Json, stage: string, startedMs: number) {
  stageTimings[stage] = elapsedMs(startedMs);
}
async function withStage<T>(stageTimings: Json, stage: string, startedMs: number, fn: () => Promise<T>): Promise<T> {
  assertMonitorBudget(startedMs, `${stage}:start`);
  const t0 = Date.now();
  try { return await fn(); } finally { stageTimings[stage] = Date.now() - t0; assertMonitorBudget(startedMs, `${stage}:end`); }
}
function latestBybitLease(settings: Json | null): { state: string; run_id: string; started_at: string } | null {
  const result = (settings?.bybit_latest_monitor_result ?? {}) as Json;
  const lease = (result.bybit_monitor_lease ?? {}) as Json;
  const state = String(lease.state ?? '');
  const run_id = String(lease.run_id ?? '');
  const started_at = String(lease.started_at ?? '');
  return state && run_id && started_at ? { state, run_id, started_at } : null;
}
function isRecentRunningBybitLease(settings: Json | null): boolean {
  const lease = latestBybitLease(settings);
  if (!lease || lease.state !== 'running') return false;
  const ts = Date.parse(lease.started_at);
  return Number.isFinite(ts) && Date.now() - ts < RECENT_LEASE_MS;
}
async function acquireBybitMonitorLease(supabase: SupabaseClient, runId: string, startedAt: string, triggerSource: string): Promise<boolean> {
  const { data } = await supabase.from('execution_settings').select('bybit_latest_monitor_result').eq('id', 1).maybeSingle();
  const settings = (data as Json | null) ?? null;
  if (isRecentRunningBybitLease(settings)) return false;
  await supabase.from('execution_settings').update({ bybit_latest_monitor_result: { ...((settings?.bybit_latest_monitor_result ?? {}) as Json), bybit_monitor_lease: { state: 'running', run_id: runId, started_at: startedAt, trigger_source: triggerSource, timeout_ms: MONITOR_TIMEOUT_MS } }, updated_at: new Date().toISOString() }).eq('id', 1);
  return true;
}
function releaseBybitMonitorLease(result: Json, state: 'completed' | 'failed' | 'rejected', runId: string, startedAt: string): Json {
  return { ...result, bybit_monitor_lease: { state, run_id: runId, started_at: startedAt, completed_at: new Date().toISOString(), timeout_ms: MONITOR_TIMEOUT_MS } };
}

interface ProtectionViolation {
  missing_sl: boolean;
  missing_tp: boolean;
  duplicate_position: boolean;
  orphan_position: boolean;
  stale_order: boolean;
  illegal_state: boolean;
  reason: string;
}

function detectProtectionViolations(
  hasPosition: boolean,
  hasOrders: boolean,
  verifiedSl: boolean,
  verifiedTp1: boolean,
  verifiedTp2: boolean
): ProtectionViolation {
  const missing_sl = hasPosition && !verifiedSl;
  const missing_tp = hasPosition && (!verifiedTp1 || !verifiedTp2);
  const stale_order = !hasPosition && hasOrders;
  const illegal_state = missing_sl || missing_tp || stale_order;

  let reason = "Ok";
  if (stale_order) reason = "stale_order";
  else if (missing_sl) reason = "missing_sl";
  else if (missing_tp) reason = "missing_tp";

  return {
    missing_sl,
    missing_tp,
    duplicate_position: false,
    orphan_position: false,
    stale_order,
    illegal_state,
    reason
  };
}

function evaluateLifecycleState(
  status: string,
  protection_status: string,
  violations: ProtectionViolation
): string {
  if (violations.illegal_state) {
    return 'RECOVERY_REQUIRED';
  }
  const s = String(status).toUpperCase();
  if (s.includes('CLOSED_TP2') || s.includes('TP2_FILLED') || s.includes('CLOSED_TP')) {
    return 'CLOSED';
  }
  if (s.includes('CLOSED') || s.includes('EXITED') || s.includes('CANCEL')) {
    return 'CLOSED';
  }
  if (s.includes('FAILED')) {
    return 'FAILED';
  }
  if (s.includes('TP1')) {
    return 'TP1';
  }
  if (s.includes('BREAKEVEN') || s.includes('BE_HIT')) {
    return 'BREAKEVEN';
  }
  if (protection_status === 'protected' || protection_status === 'protected_native') {
    return 'PROTECTED';
  }
  if (s.includes('FILLED')) {
    return 'FILLED';
  }
  if (s.includes('SUBMITTED') || s.includes('ORDER')) {
    return 'ORDER_SUBMITTED';
  }
  if (s.includes('SIZE')) {
    return 'POSITION_SIZED';
  }
  if (s.includes('QUALIFIED')) {
    return 'QUALIFIED';
  }
  return 'SIGNAL_CREATED';
}

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stringifyParams(params: Record<string, string | number | boolean>) {
  return new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, String(v)])).toString();
}

type BybitEnvironment = "demo" | "testnet" | "live";

function bybitEnvironment(): BybitEnvironment {
  const raw = String(Deno.env.get("BYBIT_ENVIRONMENT") || Deno.env.get("BYBIT_MODE") || "testnet").toLowerCase().trim();
  if (raw === "demo" || raw === "bybit_demo") return "demo";
  if (raw === "live" || raw === "mainnet" || raw === "bybit_live") throw new Error("LIVE_EXECUTION_PROHIBITED");
  return "testnet";
}

function bybitBaseUrl(): string {
  const environment = bybitEnvironment();
  const explicit = Deno.env.get("BYBIT_BASE_URL") || Deno.env.get("BYBIT_TESTNET_BASE_URL") || "";
  const fallback = environment === "demo" ? "https://api-demo.bybit.com" : environment === "live" ? "https://api.bybit.com" : "https://api-testnet.bybit.com";
  const base = (explicit || fallback).replace(/\/$/, "");
  const parsed=new URL(base);const expected=environment==="demo"?"api-demo.bybit.com":"api-testnet.bybit.com";if(parsed.protocol!=="https:"||parsed.hostname!==expected||parsed.pathname!=="/"||parsed.search||parsed.username||parsed.password)throw new Error("SANDBOX_PROVIDER_HOST_REQUIRED");
  if (environment === "demo" && !base.includes("api-demo.bybit.com")) throw new Error("Bybit Demo Trading requires BYBIT_BASE_URL=https://api-demo.bybit.com or no override");
  if (environment === "testnet" && !base.includes("testnet")) throw new Error("Bybit testnet requires a testnet base URL");
  if (environment === "live" && (base.includes("testnet") || base.includes("api-demo"))) throw new Error("Bybit live requires the mainnet base URL");
  return base;
}

async function bybitRequest<T>(credential: EdgeProviderCredential, path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const { apiKey, apiSecret } = credential;
  if (!apiKey || !apiSecret) throw new Error(`Bybit API credentials are required for ${bybitEnvironment()}`);
  const recvWindow = 5000;
  const timestamp = String(Date.now());
  const query = stringifyParams(params);
  const signature = await hmacSha256Hex(apiSecret, `${timestamp}${apiKey}${recvWindow}${query}`);
  const res = await fetch(`${bybitBaseUrl()}${path}${query ? `?${query}` : ""}`, {
    headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": String(recvWindow), "X-BAPI-SIGN": signature, "X-BAPI-SIGN-TYPE": "2" },
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({})) as { retCode?: number; retMsg?: string; result?: T };
  if (!res.ok || data.retCode !== 0) throw new Error(`Bybit ${path} failed: ${data.retCode ?? res.status} ${data.retMsg ?? res.statusText}`);
  return data.result as T;
}


async function bybitPost<T>(credential: EdgeProviderCredential, path: string, bodyParams: Record<string, string | number | boolean>): Promise<T> {
  const { apiKey, apiSecret } = credential;
  if (!apiKey || !apiSecret) throw new Error(`Bybit API credentials are required for ${bybitEnvironment()}`);
  const recvWindow = 5000;
  const timestamp = String(Date.now());
  const body = JSON.stringify(bodyParams);
  const signature = await hmacSha256Hex(apiSecret, `${timestamp}${apiKey}${recvWindow}${body}`);
  const res = await fetch(`${bybitBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BAPI-API-KEY": apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": String(recvWindow), "X-BAPI-SIGN": signature, "X-BAPI-SIGN-TYPE": "2" },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({})) as { retCode?: number; retMsg?: string; result?: T };
  if (!res.ok || data.retCode !== 0) throw new Error(`Bybit ${path} failed: ${data.retCode ?? res.status} ${data.retMsg ?? res.statusText}`);
  return data.result as T;
}


type SymbolFailureReason = "EXCHANGE_MAX_QTY_EXCEEDED" | "MIN_NOTIONAL_NOT_MET" | "INVALID_TRIGGER_DIRECTION" | "UNSUPPORTED_CONDITIONAL_ORDER" | "PROTECTION_VERIFICATION_FAILED" | "PRECISION_RULE_VIOLATION" | "STALE_ORDER_LOOP" | "REPEATED_REPAIR_FAILURE" | "EXCHANGE_REJECT" | "UNKNOWN_PROVIDER_FAILURE";
function classifySymbolFailure(error: unknown): SymbolFailureReason {
  const text = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
  if (text.includes("trigger")) return "INVALID_TRIGGER_DIRECTION";
  if (text.includes("notional")) return "MIN_NOTIONAL_NOT_MET";
  if (text.includes("precision") || text.includes("step")) return "PRECISION_RULE_VIOLATION";
  if (text.includes("protection")) return "PROTECTION_VERIFICATION_FAILED";
  if (text.includes("repair")) return "REPEATED_REPAIR_FAILURE";
  if (text.includes("reject") || text.includes("retcode")) return "EXCHANGE_REJECT";
  return "UNKNOWN_PROVIDER_FAILURE";
}
async function activeQuarantine(supabase: SupabaseClient, symbol: string, purpose: "execution" | "repair"): Promise<Json | null> {
  const { data } = await supabase.from("problem_symbol_quarantine").select("*").eq("provider", "bybit").eq("symbol", symbol.toUpperCase()).eq(purpose === "execution" ? "disabled_for_execution" : "disabled_for_repair", true).gt("cooldown_until", new Date().toISOString()).order("last_seen", { ascending: false }).limit(1).maybeSingle();
  return (data as Json | null) ?? null;
}
async function recordSymbolFailure(supabase: SupabaseClient, symbol: string, reason: SymbolFailureReason, metadata: Json = {}) {
  try {
    await supabase.rpc("record_symbol_failure", { p_provider: "bybit", p_symbol: symbol.toUpperCase(), p_reason: reason, p_metadata: metadata });
  } catch (_e) {
    // Ignore RPC failure
  }
}
function n(value: unknown): number { const x = Number(value ?? 0); return Number.isFinite(x) ? x : 0; }
function near(a: number, b: number): boolean { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(Math.abs(b) * 0.000001, 1e-8); }
function activeBybitOrder(order: Json): boolean { return !["Filled", "Cancelled", "Rejected", "Deactivated"].includes(String(order.orderStatus ?? order.stopOrderStatus ?? "")); }
function strictBybitProtectionIssues(order: Json | undefined, expected: { symbol: string; side: "LONG" | "SHORT"; close: "Buy" | "Sell"; qty: number; trigger: number; label: "sl" | "tp1" | "tp2" }): string[] {
  if (!order) return [`${expected.label}:missing`];
  const errors: string[] = [];
  if (String(order.symbol ?? "") !== expected.symbol) errors.push(`${expected.label}:wrong_symbol`);
  if (String(order.side ?? "") !== expected.close) errors.push(`${expected.label}:wrong_side`);
  if (!activeBybitOrder(order)) errors.push(`${expected.label}:inactive`);
  if (String(order.reduceOnly ?? "").toLowerCase() !== "true") errors.push(`${expected.label}:not_reduce_only`);
  if (String(order.closeOnTrigger ?? "").toLowerCase() !== "true") errors.push(`${expected.label}:not_close_on_trigger`);
  if (!near(n(order.qty ?? order.leavesQty), expected.qty)) errors.push(`${expected.label}:wrong_qty`);
  if (!near(n(order.triggerPrice), expected.trigger)) errors.push(`${expected.label}:wrong_trigger`);
  const expectedDirection = expected.side === "LONG" ? (expected.label === "sl" ? 2 : 1) : (expected.label === "sl" ? 1 : 2);
  if (n(order.triggerDirection) !== expectedDirection) errors.push(`${expected.label}:wrong_trigger_direction`);
  return errors;
}

function isActiveOrder(order: Json): boolean {
  return !["Filled", "Cancelled", "Rejected", "Deactivated"].includes(String(order.orderStatus ?? order.stopOrderStatus ?? ""));
}
function orderId(order: Json): string { return String(order.orderId ?? order.orderLinkId ?? ""); }
function orderKind(order: Json): "sl" | "tp" | "other" {
  const link = String(order.orderLinkId ?? "").toLowerCase();
  const stop = String(order.stopOrderType ?? order.orderType ?? "").toLowerCase();
  if (link.includes(":sl") || link.includes("-sl") || stop.includes("stoploss")) return "sl";
  if (link.includes(":tp") || link.includes("-tp") || stop.includes("takeprofit") || Number(order.triggerPrice ?? 0) > 0) return "tp";
  return "other";
}
function compactId(value: unknown): string { return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24); }
function closeSide(position: Json, row: Json): "Buy" | "Sell" {
  const side = String(position.side ?? row.side ?? row.direction ?? "").toLowerCase();
  return side.includes("buy") || side.includes("long") ? "Sell" : "Buy";
}
function positionSideText(position: Json, row: Json): string {
  const side = String(position.side ?? row.side ?? row.direction ?? "").toLowerCase();
  return side.includes("buy") || side.includes("long") ? "LONG" : "SHORT";
}
function splitQty(total: number, part: 1 | 2): string {
  const q = part === 1 ? total / 2 : total - total / 2;
  return String(Math.max(q, 0));
}
function lifecycleEventKey(row: Json, event: string) { return `bybit:${row.id}:${event}`; }
function telegramText(row: Json, event: string, state: Json) {
  return [
    `Bybit Testnet lifecycle: ${event}`,
    `Provider: Bybit Testnet (not live trading)`,
    `Symbol: ${row.symbol}`,
    `Side: ${String(state.side ?? row.side ?? row.direction ?? "—").toUpperCase()}`,
    `Entry: ${row.entry_price ?? "—"}`,
    `SL: ${state.sl_price ?? row.intended_sl ?? row.stop_loss ?? "—"}`,
    `TP1: ${state.tp1_price ?? row.intended_tp1 ?? row.tp1 ?? "—"}`,
    `TP2: ${state.tp2_price ?? row.intended_tp2 ?? row.tp2 ?? "—"}`,
    `Quantity: ${state.qty ?? row.quantity ?? row.volume ?? "—"}`,
    `Leverage: ${state.leverage ?? row.leverage ?? "—"}`,
    `Status: ${state.status ?? row.status}`,
    `Protection state: ${state.protection_status ?? row.protection_status ?? "pending"}`,
    `TP1 state: ${state.tp1_status ?? row.tp1_status ?? "pending"}`,
    `TP2 state: ${state.tp2_status ?? row.tp2_status ?? "pending"}`,
    `SL/BE state: ${state.sl_status ?? row.sl_status ?? "pending"}`,
    `Expiry state: ${state.expiry_status ?? row.expiry_status ?? "active"}`,
    `Recovery state: ${state.recovery_status ?? row.recovery_status ?? "none"}`,
    `Current price: ${state.current_price ?? "—"}`,
    `Timestamp: ${new Date().toISOString()}`,
  ].join("\n");
}
async function sendLifecycleTelegram(supabase: SupabaseClient, row: Json, event: string, state: Json) {
  const ownership = ownershipFromMonitoredRow(row);
  await enqueueCanonicalLifecycle(supabase,{eventKey:`${ownership.execution_scope_key}:${lifecycleEventKey(row,event)}`,eventType:canonicalLifecycleType(event),signalId:String(row.signal_id??"")||null,executionId:String(row.id),customerId:ownership.customer_id,accountId:ownership.account_id,payload:{...state,details:telegramText(row,event,state),symbol:row.symbol,provider:"bybit"},destinations:lifecycleAudience({customerId:ownership.customer_id,accountId:ownership.account_id})});
  await supabase.from("execution_orders").update({ latest_telegram_event_at: new Date().toISOString() }).eq("id", row.id);
  return true;
}

function ownershipFromMonitoredRow(row: Json): EdgeExecutionOwnership {
  return {
    customer_id: String(row.customer_id), provider: "bybit", account_id: String(row.account_id),
    execution_instance_id: String(row.execution_instance_id), credential_ref: String(row.credential_ref),
    execution_scope_key: String(row.execution_scope_key), environment: String(row.environment) as EdgeExecutionOwnership["environment"],
  };
}


async function writeMonitorHeartbeat(supabase: SupabaseClient, heartbeat: Json) {
  await supabase.from("execution_monitor_heartbeats").upsert({
    provider: "bybit",
    trigger_source: String(heartbeat.trigger_source ?? "unknown"),
    is_automatic: heartbeat.is_automatic === true,
    environment: bybitEnvironment() === "live" ? "live" : bybitEnvironment(),
    updated_at: new Date().toISOString(),
    ...heartbeat,
  }, { onConflict: "provider,environment,run_id" });
}

async function updateProvider(supabase: SupabaseClient, fields: Json) {
  await supabase.from("execution_provider_controls").upsert({ provider_name: "bybit", updated_at: new Date().toISOString(), ...fields }, { onConflict: "provider_name" });
}

async function monitorBybit(supabase: SupabaseClient, payload: Json, ownership: EdgeExecutionOwnership, credential: EdgeProviderCredential): Promise<Json> {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  const triggerSource = String(payload.source ?? payload.triggered_by ?? "manual");
  const isAutomatic = triggerSource === "pg_cron" || payload.is_automatic === true;
  let latestError = "";
  const startedMs = Date.now();
  const stageTimings: Json = {};
  const stats: Json = { account_sync: false, balance_sync: false, open_positions_sync: false, open_orders_sync: false, protection_sync: false, recovery_sync: false, profit_lock_sync: false, rows_checked: 0, rows_updated: 0, protections_created: 0, protections_missing: 0, stale_orders_cleaned: 0, positions_closed: 0, warnings: [], stage_timings: stageTimings, bounded_limits: { timeout_ms: MONITOR_TIMEOUT_MS, row_limit: MONITOR_ROW_LIMIT, cancel_limit: MONITOR_CANCEL_LIMIT, repair_limit: MONITOR_REPAIR_LIMIT } };

  const providerControl = await supabase.from("execution_provider_controls").select("enabled").eq("provider_name", "bybit").maybeSingle().then((r) => r.data).catch(() => null);
  const hasKeys = Boolean(credential.apiKey && credential.apiSecret);
  markStage(stageTimings, "bootstrap", startedMs);

  const leaseAcquired = await withStage(stageTimings, "lease_acquire", startedMs, () => acquireExecutionLease(supabase, ownership, runId));
  if (!leaseAcquired) {
    const completedAt = new Date().toISOString();
    await synchronizeCanonicalMonitor({store:supabase,ownership:runtimeOwnershipFields(ownership),provider:'BYBIT',positions:activePositions,orders:orderList.filter(isActiveOrder),complete:true,observedAt:completedAt,lookupEntry:async(symbol,id)=>{const result=await bybitRequest<{list:Json[]}>(credential,'/v5/order/history',{category:'linear',symbol,orderId:id,limit:1});const order=result.list?.[0];return order?{id:String(order.orderId??''),symbol:String(order.symbol??''),side:String(order.side??'').toUpperCase(),status:order.orderStatus==='Filled'?'FILLED':order.orderStatus==='PartiallyFilled'?'PARTIALLY_FILLED':String(order.orderStatus),filledQuantity:Number(order.cumExecQty)}:null}});
    const result = releaseBybitMonitorLease({ success: false, provider: "bybit", run_id: runId, last_monitor_run_at: startedAt, monitor_health: "rejected", latest_error: "MONITOR_ALREADY_RUNNING", blocker: "MONITOR_ALREADY_RUNNING", stage_timings: stageTimings }, "rejected", runId, startedAt);
    await writeMonitorHeartbeat(supabase, { run_id: runId, trigger_source: triggerSource, is_automatic: isAutomatic, started_at: startedAt, completed_at: completedAt, success: false, monitor_status: "rejected", latest_recovery_action: null, errors: ["MONITOR_ALREADY_RUNNING"], metadata: result });
    return result;
  }

  // Entry controls never suspend supervision of existing positions.
  if(providerControl&&!providerControl.enabled)(stats.warnings as unknown[]).push({warning:"NEW_ENTRIES_DISABLED_PROTECTION_MONITORING_CONTINUES"});

  if (!hasKeys) {
    const completedAt = new Date().toISOString();
    await synchronizeCanonicalMonitor({store:supabase,ownership:runtimeOwnershipFields(ownership),provider:'BYBIT',positions:activePositions,orders:orderList.filter(isActiveOrder),complete:true,observedAt:completedAt,lookupEntry:async(symbol,id)=>{const result=await bybitRequest<{list:Json[]}>(credential,'/v5/order/history',{category:'linear',symbol,orderId:id,limit:1});const order=result.list?.[0];return order?{id:String(order.orderId??''),symbol:String(order.symbol??''),side:String(order.side??'').toUpperCase(),status:order.orderStatus==='Filled'?'FILLED':order.orderStatus==='PartiallyFilled'?'PARTIALLY_FILLED':String(order.orderStatus),filledQuantity:Number(order.cumExecQty)}:null}});
    const result = releaseBybitMonitorLease({ success: false, provider: "bybit", last_monitor_run_at: startedAt, monitor_health: "healthy", latest_error: "NO_API_KEYS", blocker: "NO_API_KEYS", stage_timings: stageTimings }, "completed", runId, startedAt);
    await writeMonitorHeartbeat(supabase, { run_id: runId, trigger_source: triggerSource, is_automatic: isAutomatic, started_at: startedAt, completed_at: completedAt, success: false, monitor_status: "healthy", latest_recovery_action: null, errors: ["NO_API_KEYS"], metadata: result });
    await updateProvider(supabase, { status: "disconnected", last_status_at: new Date().toISOString(), last_error: "NO_API_KEYS", metadata: { bybit_monitor: result } });
    await releaseExecutionLease(supabase, ownership, runId, "completed");
    return result;
  }

  try {
    const [wallet, positions, orders] = await withStage(stageTimings, "provider_snapshot", startedMs, () => Promise.all([
      bybitRequest<Json>(credential, "/v5/account/wallet-balance", { accountType: "UNIFIED" }),
      collectBybitPages(cursor=>bybitRequest(credential,"/v5/position/list",{category:"linear",settleCoin:"USDT",limit:200,...(cursor?{cursor}:{})})),
      collectBybitPages(cursor=>bybitRequest(credential,"/v5/order/realtime",{category:"linear",settleCoin:"USDT",openOnly:0,limit:50,...(cursor?{cursor}:{})})),
    ]));
    const positionList = admitProviderPositions(positions,"bybit") as Json[];
    const orderList = orders as Json[];
    const positionSymbols = new Set(positionList.filter((p) => Math.abs(Number(p.size ?? 0)) > 0).map((p) => String(p.symbol ?? "")));
    const orderSymbols = new Set(orderList.map((o) => String(o.symbol ?? "")));
    const walletList = Array.isArray((wallet as { list?: unknown[] }).list) ? (wallet as { list: Json[] }).list : [];
    const coinList = Array.isArray((walletList[0] as { coin?: unknown[] } | undefined)?.coin) ? (walletList[0] as { coin: Json[] }).coin : [];
    const usdt = coinList.find((c) => String(c.coin) === "USDT") ?? {};
    const activePositions = positionList.filter((p) => Math.abs(Number(p.size ?? 0)) > 0);
    const unrealizedPnl = activePositions.reduce((sum, p) => sum + Number(p.unrealisedPnl ?? 0), 0);
    Object.assign(stats, { account_sync: true, balance_sync: true, open_positions_sync: true, open_orders_sync: true, wallet_balance: Number((usdt as Json).walletBalance ?? 0), available_balance: Number((usdt as Json).availableToWithdraw ?? (usdt as Json).availableToBorrow ?? 0), equity: Number((usdt as Json).equity ?? 0), unrealized_pnl: unrealizedPnl, bybit_positions_count: positionSymbols.size, bybit_open_orders_count: orderList.length, active_symbols: Array.from(new Set([...positionSymbols, ...orderSymbols])), positions: activePositions.map((p) => ({ symbol: p.symbol, side: p.side, size: p.size, leverage: p.leverage, margin_mode: p.tradeMode ?? p.marginMode, entry_price: p.avgPrice, mark_price: p.markPrice, liquidation_price: p.liqPrice, unrealized_pnl: p.unrealisedPnl })), open_orders: orderList.map((o) => ({ symbol: o.symbol, order_id: o.orderId, side: o.side, type: o.orderType ?? o.stopOrderType, qty: o.qty, price: o.price, trigger_price: o.triggerPrice, reduce_only: o.reduceOnly })) });

    const { data: rows } = await supabase.from("execution_orders").select("*").eq("execution_scope_key", ownership.execution_scope_key).eq("exchange", `bybit_usdt_${bybitEnvironment()}`).eq("environment", bybitEnvironment() === "live" ? "live" : bybitEnvironment()).in("status", ACTIVE_STATUSES).order("updated_at", { ascending: true }).limit(MONITOR_ROW_LIMIT);
    markStage(stageTimings, "load_execution_rows", startedMs);
    let cancelBudget = MONITOR_CANCEL_LIMIT;
    let repairBudget = MONITOR_REPAIR_LIMIT;
    const localSymbols = new Set(((rows ?? []) as Json[]).map((row) => String(row.symbol ?? "")));
    const untrackedPositions = activePositions.filter((position) => !localSymbols.has(String(position.symbol ?? "")));
    for (const position of untrackedPositions) {
      const symbol = String(position.symbol ?? "");
      const symbolOrders = orderList.filter((order) => String(order.symbol ?? "") === symbol && isActiveOrder(order));
      const reduceOrders = symbolOrders.filter((order) => order.reduceOnly === true || String(order.reduceOnly) === "true");
      const slPresent = reduceOrders.some((order) => orderKind(order) === "sl");
      const takeOrders = reduceOrders.filter((order) => orderKind(order) === "tp");
      const side = String(position.side ?? "").toLowerCase() === "sell" ? "short" : "long";
      await upsertTradeManagementTruthRow(supabase, {
        ...runtimeOwnershipFields(ownership), provider: "bybit", environment: bybitEnvironment(), symbol, side,
        protection_status: slPresent && takeOrders.length >= 2 ? "protected" : "unprotected_failed",
        sl_present: slPresent, tp1_present: takeOrders.length >= 1, tp2_present: takeOrders.length >= 2,
        entry_price: Number(position.avgPrice ?? 0) || null, mark_price: Number(position.markPrice ?? 0) || null,
        qty: Number(position.size ?? 0), unrealized_pnl: Number(position.unrealisedPnl ?? 0), monitor_status: "untracked_position",
        recovery_status: "manual_row_recovery_required", latest_error: "unsafe_untracked_position", latest_sync_at: new Date().toISOString(), last_action_taken: "reconcile_untracked_bybit_position",
      }, { onConflict: "execution_scope_key,provider,environment,symbol,side" });
      (stats.warnings as Json[]).push({ symbol, warning: "unsafe_untracked_position", action: "manual_row_recovery_required" });
    }
    const positionSymbolSet = new Set(activePositions.map((position) => String(position.symbol ?? "")));
    const orphanOrders = orderList.filter((order) => isActiveOrder(order) && String(order.orderLinkId??" ").startsWith("hb:") && !positionSymbolSet.has(String(order.symbol ?? "")) && !localSymbols.has(String(order.symbol ?? "")));
    for (const order of orphanOrders.slice(0, cancelBudget)) {
      try {
        await bybitPost<Json>(credential, "/v5/order/cancel", { category: "linear", symbol: String(order.symbol), orderId: orderId(order) });
        cancelBudget--;
        stats.stale_orders_cleaned = Number(stats.stale_orders_cleaned) + 1;
      } catch (error) {
        (stats.warnings as Json[]).push({ symbol: order.symbol, warning: error instanceof Error ? error.message : String(error), action: "orphan_provider_order_cleanup_retry" });
      }
    }
    Object.assign(stats, { untracked_positions_found: untrackedPositions.length, orphan_provider_orders_found: orphanOrders.length, reconciliation_sync: true });
    for (const row of (rows ?? []) as Array<Json & { id: string; symbol: string; status: string }>) {
      assertMonitorBudget(startedMs, `row:${row.symbol}`);
      stats.rows_checked = Number(stats.rows_checked) + 1;
      const position = activePositions.find((p) => String(p.symbol) === row.symbol) ?? null;
      const symbolOrders = orderList.filter((o) => String(o.symbol) === row.symbol && isActiveOrder(o) && (String(o.orderLinkId??"").startsWith(`hb:${compactId(row.id)}:`)||[row.sl_order_id,row.replacement_sl_order_id,row.tp1_order_id,row.tp2_order_id,row.entry_order_id].filter(Boolean).map(String).includes(orderId(o))));
      const reduceOrders = symbolOrders.filter((o) => String(o.reduceOnly) === "true" || o.reduceOnly === true);
      const slOrders = reduceOrders.filter((o) => orderKind(o) === "sl");
      const tpOrders = reduceOrders.filter((o) => orderKind(o) === "tp");
      const hasPosition = Boolean(position);
      const hasOrders = symbolOrders.length > 0;
      const now = new Date().toISOString();
      const qty = Math.abs(Number(position?.size ?? row.quantity ?? row.volume ?? 0));
      const slPrice = Number(row.replacement_sl_price ?? row.profit_lock_price ?? row.intended_sl ?? row.stop_loss ?? 0);
      const tp1Price = Number(row.intended_tp1 ?? row.tp1 ?? 0);
      const tp2Price = Number(row.intended_tp2 ?? row.tp2 ?? 0);
      const side = positionSideText(position ?? {}, row);
      const currentPrice = Number(position?.markPrice ?? 0) || null;
      const raw = { ...(row.raw_exchange_response as Json ?? {}), bybit_monitor: { hasPosition, open_order_count: symbolOrders.length, sl_order_ids: slOrders.map(orderId), tp_order_ids: tpOrders.map(orderId), last_sync_at: now } };
      const update: Json = { last_monitor_run_id: runId, last_monitor_checked_at: now, latest_monitor_error: "", latest_sync_error: "", raw_exchange_response: raw, updated_at: now, position_size: qty || null, latest_unrealized_pnl: Number(position?.unrealisedPnl ?? 0), current_price: currentPrice };

      // A provider acknowledgement followed by no position is not evidence of a fill/exit.
      // Canonical submission reconciliation owns the uncertain entry; never cancel it as an orphan.
      const canonicalPlanId=(row.raw_exchange_response as Json|undefined)?.certified_execution_plan_id;
      if(!hasPosition&&canonicalPlanId&&row.position_confirmed!==true){
        const {error:pendingError}=await supabase.from("execution_orders").update({...update,lifecycle_state:"RECONCILING",provider_status:"entry_requires_order_reconciliation"}).eq("id",row.id).eq("execution_scope_key",ownership.execution_scope_key);
        if(pendingError)throw new Error("ENTRY_RECONCILIATION_NOT_PERSISTED");
        stats.rows_updated=Number(stats.rows_updated)+1;continue;
      }

      if (!hasPosition && !hasOrders) {
        Object.assign(update, { status: "synced_closed", lifecycle_state: "CLOSED", protection_status: "closed", provider_status: "synced_no_open_exposure", expiry_status: row.expiry_status ?? "closed" });
        stats.positions_closed = Number(stats.positions_closed) + 1;
        await supabase.from("execution_orders").update(update).eq("id", row.id);
        await sendLifecycleTelegram(supabase, row, "position_synced_closed", { ...update, side });
        stats.rows_updated = Number(stats.rows_updated) + 1;
        continue;
      }

      if (!hasPosition && hasOrders) {
        let cancelled = 0;
        for (const o of symbolOrders.slice(0, cancelBudget)) {
          try { await bybitPost<Json>(credential, "/v5/order/cancel", { category: "linear", symbol: row.symbol, orderId: orderId(o) }); cancelBudget--; cancelled++; } catch (e) { (stats.warnings as unknown[]).push({ symbol: row.symbol, warning: e instanceof Error ? e.message : String(e), action: "cancel_stale_bybit_order" }); }
        }
        Object.assign(update, { status: "synced_closed", lifecycle_state: "CLOSED", protection_status: "closed", provider_status: "stale_orders_cleaned", cleanup_status: cancelled ? "stale_orders_cleaned" : "stale_order_cleanup_failed", recovery_status: cancelled ? "recovered" : "cleanup_failed" });
        stats.stale_orders_cleaned = Number(stats.stale_orders_cleaned) + cancelled;
        await supabase.from("execution_orders").update(update).eq("id", row.id);
        await sendLifecycleTelegram(supabase, row, "stale_orders_cleaned", { ...update, side });
        stats.rows_updated = Number(stats.rows_updated) + 1;
        continue;
      }

      if (hasPosition && row.status === "entry_submitted") await sendLifecycleTelegram(supabase, row, "entry_filled", { ...update, status: "entry_filled", side, qty, leverage: position?.leverage, current_price: currentPrice });

      const close = closeSide(position ?? {}, row);
      const baseLink = `hb:${compactId(row.id)}`;
      const expiryAt = row.expires_at ?? row.time_stop_deadline_at;
      const expired = expiryAt ? Date.parse(String(expiryAt)) <= Date.now() : false;
      if (hasPosition && expired && qty > 0) {
        try {
          if(row.expiry_status!=="CLOSE_SUBMITTED_AWAITING_RECONCILIATION")await bybitPost<Json>(credential, "/v5/order/create", { category: "linear", symbol: row.symbol, side: closeSide(position ?? {}, row), orderType: "Market", qty: String(qty), reduceOnly: true, closeOnTrigger: false, orderLinkId: `${baseLink}:expire` });
          Object.assign(update,{expiry_status:"CLOSE_SUBMITTED_AWAITING_RECONCILIATION",lifecycle_state:"SAFETY_CLOSING",provider_status:"close_submission_pending"});
          // Keep all protective orders until a complete provider snapshot confirms zero position.
          await supabase.from("execution_orders").update(update).eq("id",row.id).eq("execution_scope_key",ownership.execution_scope_key);
          stats.rows_updated=Number(stats.rows_updated)+1;continue;
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          Object.assign(update, { expiry_status: "expired_close_failed", latest_protection_error: error, last_exchange_error: error, recovery_status: "expiry_close_failed" });
        }
      }

      const repairQuarantine = await activeQuarantine(supabase, row.symbol, "repair");
      const entry = Number(row.entry_price ?? 0);
      const originalStop = Number(row.intended_sl ?? row.stop_loss ?? 0);
      const riskDistance = Math.abs(entry - originalStop);
      const favorableR = currentPrice && riskDistance > 0 ? (side === "LONG" ? currentPrice - entry : entry - currentPrice) / riskDistance : 0;
      const tp1History=await bybitRequest<{list:Json[]}>(credential,"/v5/order/history",{category:"linear",symbol:row.symbol,...(row.tp1_order_id?{orderId:String(row.tp1_order_id)}:{orderLinkId:`${baseLink}:tp1`}),limit:1}).catch(()=>({list:[]}));
      const tp1Transition=confirmedBybitTp1(tp1History.list?.[0],{symbol:row.symbol,orderId:row.tp1_order_id?String(row.tp1_order_id):undefined,orderLinkId:`${baseLink}:tp1`});
      let transitionAttempted = false;
      let managedStopPrice = slPrice;
      if (tp1Transition && entry > 0 && riskDistance > 0 && currentPrice && slOrders.length) {
        const profitLock=side==="LONG"?entry+riskDistance*.3:entry-riskDistance*.3;
        const trailing=favorableR>=1?(side==="LONG"?currentPrice-riskDistance*.5:currentPrice+riskDistance*.5):profitLock;
        const desired=side==="LONG"?Math.max(slPrice,profitLock,trailing):Math.min(slPrice,profitLock,trailing);
        const existing=slOrders.find(o=>orderId(o)===String(row.replacement_sl_order_id??row.sl_order_id))??slOrders[0];
        const result=await reconcileBybitStop({symbol:row.symbol,side:side as "LONG"|"SHORT",target:desired,quantity:qty,mark:currentPrice,transport:{
          async read(){const r=await bybitRequest<{list:Json[]}>(credential,"/v5/order/realtime",{category:"linear",symbol:row.symbol,orderId:orderId(existing),openOnly:0});return r.list?.[0]},
          amend:params=>bybitPost(credential,"/v5/order/amend",{category:"linear",symbol:row.symbol,...params})
        }});transitionAttempted=true;
        if(result.state==="VERIFIED"){managedStopPrice=result.price;Object.assign(update,{tp1_filled:true,tp1_status:"filled",replacement_sl_order_id:result.orderId,replacement_sl_price:result.price,profit_lock_price:profitLock,profit_lock_status:"active",profit_lock_sl_active:true,trailing_active:favorableR>=1,sl_moved_to_be:result.price===entry,sl_replaced_after_tp1:true});}
        else Object.assign(update,{tp1_filled:true,tp1_status:"filled",profit_lock_status:result.reason,latest_protection_error:result.reason});
      }
      const missing: string[] = [];
      if (!slOrders.length) missing.push("sl");
      if (!tp1Transition && tpOrders.length < 1) missing.push("tp1");
      if (tpOrders.length < (tp1Transition ? 1 : 2)) missing.push("tp2");
      let repairAttempted = false;
      let repairError = "";
      try {
        if (repairQuarantine) throw new Error("symbol_quarantined");
        if (repairBudget > 0 && !slOrders.length && managedStopPrice > 0 && qty > 0) {
          repairAttempted = true;
          const sl = await bybitPost<Json>(credential, "/v5/order/create", { category: "linear", symbol: row.symbol, side: close, orderType: "Market", qty: String(qty), triggerPrice: String(managedStopPrice), triggerDirection: side === "LONG" ? 2 : 1, reduceOnly: true, closeOnTrigger: true, orderLinkId: `${baseLink}:sl` });
          stats.protections_created = Number(stats.protections_created) + 1; repairBudget--;
          Object.assign(update, { sl_order_id: String(sl.orderId ?? sl.orderLinkId ?? ""), sl_status: "submitted" });
        }
        if (repairBudget > 0 && !tp1Transition && !tpOrders.some(o=>near(n(o.triggerPrice),tp1Price)) && tp1Price > 0 && qty > 0) {
          repairAttempted = true;
          const tp1 = await bybitPost<Json>(credential, "/v5/order/create", { category: "linear", symbol: row.symbol, side: close, orderType: "Market", qty: splitQty(qty, 1), triggerPrice: String(tp1Price), triggerDirection: side === "LONG" ? 1 : 2, reduceOnly: true, closeOnTrigger: true, orderLinkId: `${baseLink}:tp1` });
          stats.protections_created = Number(stats.protections_created) + 1;
          repairBudget--;
          Object.assign(update, { tp1_order_id: String(tp1.orderId ?? tp1.orderLinkId ?? ""), tp1_status: "submitted" });
        }
        if (repairBudget > 0 && !tpOrders.some(o=>near(n(o.triggerPrice),tp2Price)) && tp2Price > 0 && qty > 0) {
          repairAttempted = true;
          const tp2 = await bybitPost<Json>(credential, "/v5/order/create", { category: "linear", symbol: row.symbol, side: close, orderType: "Market", qty: tp1Transition?String(qty):splitQty(qty, 2), triggerPrice: String(tp2Price), triggerDirection: side === "LONG" ? 1 : 2, reduceOnly: true, closeOnTrigger: true, orderLinkId: `${baseLink}:tp2` });
          stats.protections_created = Number(stats.protections_created) + 1;
          repairBudget--;
          Object.assign(update, { tp2_order_id: String(tp2.orderId ?? tp2.orderLinkId ?? ""), tp2_status: "submitted" });
        }
      } catch (e) {
        repairError = e instanceof Error ? e.message : String(e);
        await recordSymbolFailure(supabase, row.symbol, classifySymbolFailure(repairError), { execution_id: row.id, message: repairError });
        Object.assign(update, { latest_protection_error: repairError, last_exchange_error: repairError, recovery_status: "protection_retry_failed" });
        await sendLifecycleTelegram(supabase, row, "protection_failed", { ...update, side, qty, leverage: position?.leverage, current_price: currentPrice, recovery_status: repairError });
      }

      const verificationOrderList = repairAttempted || transitionAttempted ? await withStage(stageTimings, `verify_${row.symbol}`, startedMs, () => collectBybitPages(cursor=>bybitRequest(credential,"/v5/order/realtime",{category:"linear",symbol:row.symbol,openOnly:0,limit:50,...(cursor?{cursor}:{})}))) : orderList;
      const refreshedOrders = verificationOrderList.filter((o) => String(o.symbol) === row.symbol && isActiveOrder(o));
      const refreshedReduce = refreshedOrders.filter((o) => String(o.reduceOnly) === "true" || o.reduceOnly === true);
      const expectedSl = refreshedReduce.find((o) => orderKind(o) === "sl" && near(n(o.triggerPrice), managedStopPrice));
      const expectedTps = refreshedReduce.filter((o) => orderKind(o) === "tp").sort((a, b) => side === "LONG" ? n(a.triggerPrice) - n(b.triggerPrice) : n(b.triggerPrice) - n(a.triggerPrice));
      const strictErrors = [
        ...strictBybitProtectionIssues(expectedSl, { symbol: row.symbol, side: side as "LONG" | "SHORT", close, qty, trigger: managedStopPrice, label: "sl" }),
        ...(tp1Transition ? [] : strictBybitProtectionIssues(expectedTps[0], { symbol: row.symbol, side: side as "LONG" | "SHORT", close, qty: n(splitQty(qty, 1)), trigger: tp1Price, label: "tp1" })),
        ...strictBybitProtectionIssues(expectedTps[tp1Transition ? 0 : 1], { symbol: row.symbol, side: side as "LONG" | "SHORT", close, qty: tp1Transition?qty:n(splitQty(qty, 2)), trigger: tp2Price, label: "tp2" }),
      ];
      const verifiedSl = !strictErrors.some((e) => e.startsWith("sl:"));
      const verifiedTp1 = tp1Transition || !strictErrors.some((e) => e.startsWith("tp1:"));
      const verifiedTp2 = !strictErrors.some((e) => e.startsWith("tp2:"));
      const protectionStatus = strictErrors.length === 0 ? "protected_native" : verifiedSl || verifiedTp1 || verifiedTp2 ? "partially_protected" : missing.includes("sl") ? "missing_sl" : "protection_failed";
      stats.protections_missing = Number(stats.protections_missing) + (verifiedSl ? 0 : 1) + (verifiedTp1 ? 0 : 1) + (verifiedTp2 ? 0 : 1);
      if (strictErrors.length > 0) await recordSymbolFailure(supabase, row.symbol, "PROTECTION_VERIFICATION_FAILED", { execution_id: row.id, strictErrors });
      const statusValue = protectionStatus === "protected_native" ? "protected_native" : "protection_failed";
      const violations = detectProtectionViolations(hasPosition, hasOrders, verifiedSl, verifiedTp1, verifiedTp2);
      const unifiedLifecycle = evaluateLifecycleState(statusValue, protectionStatus, violations);

      let r_repair_attempts = Number(row.repair_attempts ?? 0);
      let r_recovery_status = "healthy";
      let r_latest_error = null;
      let r_last_action_taken = "exchange_confirmed_protection";

      if (protectionStatus === "protected_native") {
        if (repairAttempted) {
          r_repair_attempts += 1;
          r_recovery_status = "repair_succeeded";
          r_last_action_taken = "recreated_protection_orders";
        } else {
          r_repair_attempts = 0;
          r_recovery_status = "healthy";
          r_last_action_taken = "exchange_confirmed_protection";
        }
      } else {
        if (repairAttempted) {
          r_repair_attempts += 1;
          r_recovery_status = repairError ? "recovery_required" : "repairing";
          r_last_action_taken = repairError ? "repair_failed" : "repair_attempted";
          r_latest_error = repairError || strictErrors.join(", ");
        } else {
          r_recovery_status = "recovery_required";
          r_last_action_taken = "orphan_detected";
          r_latest_error = repairQuarantine ? "symbol_quarantined" : strictErrors.join(", ");
        }
      }

      Object.assign(update, { status: statusValue, lifecycle_state: unifiedLifecycle, position_confirmed: hasPosition, sl_confirmed: verifiedSl, tp1_confirmed: verifiedTp1, tp2_confirmed: verifiedTp2, protection_status: protectionStatus, native_protection_verified: protectionStatus === "protected_native", provider_status: "position_open", recovery_status: r_recovery_status, repair_attempts: r_repair_attempts, sl_status: verifiedSl ? "submitted" : "missing", tp1_status: tp1Transition ? "filled" : verifiedTp1 ? "submitted" : "missing", tp2_status: verifiedTp2 ? "submitted" : "missing" });
      const {error:truthWriteError}=await supabase.from("execution_orders").update(update).eq("id", row.id).eq("execution_scope_key",ownership.execution_scope_key).select("id").single();
      if(truthWriteError)throw new Error("EXECUTION_STATE_NOT_PERSISTED");
      // Write unified trade truth so the operator panel can read live protection state
      try {
        await upsertTradeManagementTruth(supabase, {
          p_execution_order_id: row.id,
          p_provider: "bybit",
          p_environment: bybitEnvironment(),
          p_symbol: row.symbol,
          p_direction: side === "LONG" ? "long" : "short",
          p_status: update.status ?? row.status,
          p_protection_status: protectionStatus,
          p_sl_present: verifiedSl,
          p_tp1_present: verifiedTp1,
          p_tp2_present: verifiedTp2,
          p_entry_price: Number(row.entry_price ?? 0) || null,
          p_mark_price: currentPrice,
          p_unrealized_pnl: Number(position?.unrealisedPnl ?? 0),
          p_quantity: qty || null,
          p_leverage: Number(position?.leverage ?? row.leverage ?? 0) || null,
          p_sl_price: slPrice || null,
          p_tp1_price: tp1Price || null,
          p_tp2_price: tp2Price || null,
          p_monitor_run_id: runId,
          p_repair_attempts: r_repair_attempts,
          p_recovery_status: r_recovery_status,
          p_latest_error: r_latest_error,
          p_last_action_taken: r_last_action_taken,
        });
      } catch (_e) {
        throw new Error("TRADE_TRUTH_NOT_PERSISTED");
      }
      if(tp1Transition&&update.profit_lock_sl_active===true&&row.profit_lock_sl_active!==true)await sendLifecycleTelegram(supabase,row,"tp1_profit_lock_activated",{symbol:row.symbol,side,qty,stop_price:managedStopPrice,tp1_order_id:row.tp1_order_id,source:"provider_confirmed"});
      if(update.trailing_active===true&&update.profit_lock_sl_active===true&&row.trailing_active!==true)await sendLifecycleTelegram(supabase,row,"trailing_activated",{symbol:row.symbol,side,qty,stop_price:managedStopPrice,source:"provider_confirmed"});
      if (protectionStatus === "protected_native") await sendLifecycleTelegram(supabase, row, row.protection_status === "protected_native" ? "native_protection_verified" : "native_sl_tp_placed", { ...update, side, qty, leverage: position?.leverage, current_price: currentPrice, sl_price: slPrice, tp1_price: tp1Price, tp2_price: tp2Price });
      else await sendLifecycleTelegram(supabase, row, "protection_failed", { ...update, side, qty, leverage: position?.leverage, current_price: currentPrice, sl_price: slPrice, tp1_price: tp1Price, tp2_price: tp2Price });
      stats.rows_updated = Number(stats.rows_updated) + 1;
    }
    Object.assign(stats, { protection_sync: true, recovery_sync: true, profit_lock_sync: true });
    const completedAt = new Date().toISOString();
    await synchronizeCanonicalMonitor({store:supabase,ownership:runtimeOwnershipFields(ownership),provider:'BYBIT',positions:activePositions,orders:orderList.filter(isActiveOrder),complete:true,observedAt:completedAt,lookupEntry:async(symbol,id)=>{const result=await bybitRequest<{list:Json[]}>(credential,'/v5/order/history',{category:'linear',symbol,orderId:id,limit:1});const order=result.list?.[0];return order?{id:String(order.orderId??''),symbol:String(order.symbol??''),side:String(order.side??'').toUpperCase(),status:order.orderStatus==='Filled'?'FILLED':order.orderStatus==='PartiallyFilled'?'PARTIALLY_FILLED':String(order.orderStatus),filledQuantity:Number(order.cumExecQty)}:null}});
    markStage(stageTimings, "finalize", startedMs);
    const result = releaseBybitMonitorLease({ ...stats, run_id: runId, last_monitor_run_at: startedAt, last_successful_sync_at: completedAt, monitor_health: "healthy", wallet, open_position_symbols: Array.from(positionSymbols), open_order_symbols: Array.from(orderSymbols) }, "completed", runId, startedAt);
    await writeMonitorHeartbeat(supabase, { run_id: runId, trigger_source: triggerSource, is_automatic: isAutomatic, started_at: startedAt, completed_at: completedAt, success: true, monitor_status: "healthy", positions_seen: activePositions.length, orders_seen: orderList.length, executions_checked: Number(stats.rows_checked), protections_created: Number(stats.protections_created), protections_missing: Number(stats.protections_missing), stale_orders_cleaned: Number(stats.stale_orders_cleaned), positions_closed: Number(stats.positions_closed), latest_recovery_action: Number(stats.protections_created) > 0 ? "protection_created" : Number(stats.stale_orders_cleaned) > 0 ? "stale_orders_cleaned" : null, errors: [], metadata: result });
    await updateProvider(supabase, { status: "connected", last_status_at: new Date().toISOString(), last_error: null, metadata: { bybit_monitor: { ...result, environment: bybitEnvironment(), base_url: bybitBaseUrl() } } });
    await supabase.from("execution_account_runtime_proof").upsert({ ...runtimeOwnershipFields(ownership), environment: bybitEnvironment(), monitor_status: "healthy", account_state: {...result,flat_verified:activePositions.length===0&&orderList.filter(isActiveOrder).length===0}, observed_at: completedAt, updated_at: completedAt }, { onConflict: "execution_scope_key" });
    await supabase.from("execution_settings").update({ bybit_latest_monitor_run_at: startedAt, bybit_latest_successful_sync_at: result.last_successful_sync_at, bybit_latest_monitor_error: null, bybit_latest_monitor_result: result, updated_at: new Date().toISOString() }).eq("id", 1);
    await releaseExecutionLease(supabase, ownership, runId, "completed");
    return { success: true, provider: "bybit", ownership: ownershipFields(ownership), last_monitor_run_at: startedAt, last_successful_sync_at: result.last_successful_sync_at, monitor_health: "healthy", latest_error: null, ...stats };
  } catch (e) {
    latestError = e instanceof Error ? e.message : String(e);
    try {
      // A failed provider read means UNKNOWN, not proof that every account lost protection.
      await supabase.from("execution_orders").update({latest_monitor_error:latestError,recovery_status:"provider_unavailable"}).eq("execution_scope_key",ownership.execution_scope_key).in("status",ACTIVE_STATUSES);
    } catch (_rowErr) {
      // non-blocking
    }
    await writeMonitorHeartbeat(supabase, { run_id: runId, trigger_source: triggerSource, is_automatic: isAutomatic, started_at: startedAt, completed_at: new Date().toISOString(), success: false, monitor_status: "degraded", positions_seen: 0, orders_seen: 0, executions_checked: Number(stats.rows_checked), protections_created: Number(stats.protections_created), protections_missing: Number(stats.protections_missing), stale_orders_cleaned: Number(stats.stale_orders_cleaned), positions_closed: Number(stats.positions_closed), latest_recovery_action: null, errors: [latestError], metadata: stats }).catch(() => null);
    await updateProvider(supabase, { status: "degraded", last_status_at: new Date().toISOString(), last_error: latestError, metadata: { bybit_monitor: { ...stats, run_id: runId, environment: bybitEnvironment(), base_url: bybitBaseUrl(), last_monitor_run_at: startedAt, monitor_health: "degraded", latest_error: latestError } } });
    await supabase.from("execution_account_runtime_proof").upsert({ ...runtimeOwnershipFields(ownership), environment: bybitEnvironment(), monitor_status: "degraded", account_state: { ...stats, latest_error: latestError }, observed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "execution_scope_key" }).catch(() => null);
    await supabase.from("execution_settings").update({ bybit_latest_monitor_run_at: startedAt, bybit_latest_monitor_error: latestError, bybit_latest_monitor_result: releaseBybitMonitorLease({ ...stats, last_monitor_run_at: startedAt, monitor_health: "degraded", latest_error: latestError }, "failed", runId, startedAt), updated_at: new Date().toISOString() }).eq("id", 1);
    await routeTelegramEvent(supabase, { event_id: `provider_bybit_monitor_error:${startedAt}`, event_type: "provider_bybit_monitor_failure", text: `Bybit monitor failure\nFreshness: ${startedAt}\nError: ${latestError}`, source: "bybit-testnet-monitor", channels: ["admin"], dedupe: true, cooldown_minutes: 60 });
    await releaseExecutionLease(supabase, ownership, runId, "failed").catch(() => null);
    return { success: false, provider: "bybit", ownership: ownershipFields(ownership), last_monitor_run_at: startedAt, monitor_health: "degraded", latest_error: latestError, ...stats };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const payload = await req.clone().json().catch(() => ({})) as Json;
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return authJsonResponse(auth, corsHeaders);
  const accounts = (await enumerateExecutionAccounts(supabase, "bybit")).filter((account) => account.environment === bybitEnvironment());
  if (accounts.length === 0) {
    return json({ success: true, overall_status: "DEGRADED", provider: "bybit", credential_reachability: "UNKNOWN", account_configuration: "NOT CONFIGURED", execution_adoption: "EXECUTION DISABLED", monitor_status: "NOT CONFIGURED", configured_account: false, writes_skipped: true, first_blocker: "No canonical execution-account identity", accounts_total: 0, accounts_fulfilled: 0, accounts_rejected: 0, results: [] });
  }
  const settled = await settleExecutionAccounts(accounts, async (ownership) => {
    const credential = await resolveEdgeProviderCredential(supabase, ownership);
    return monitorBybit(supabase, payload, ownership, credential);
  });
  return json({ success: true, overall_status: settled.some((result) => result.status === "rejected") ? "DEGRADED" : "PASS", provider: "bybit", account_configuration: "CONFIGURED", execution_adoption: "EXECUTION DISABLED", monitor_status: settled.some((result) => result.status === "rejected") ? "DEGRADED" : "MONITORING", configured_account: true, writes_skipped: false, first_blocker: null, accounts_total: accounts.length, accounts_fulfilled: settled.filter((result) => result.status === "fulfilled").length, accounts_rejected: settled.filter((result) => result.status === "rejected").length, results: settled.map((result, index) => result.status === "fulfilled" ? result.value : { success: false, execution_scope_key: accounts[index]?.execution_scope_key, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }) });
});
