import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";
import { upsertTradeManagementTruth, upsertTradeManagementTruthRow, updateTradeManagementTruthByIdentity } from "../_shared/trade-truth/index.ts";
import { acquireExecutionLease, currentEdgeProviderCredential, enumerateExecutionAccounts, ownershipFromRow, releaseExecutionLease, resolveEdgeProviderCredential, runtimeOwnershipFields, settleExecutionAccounts, withEdgeProviderCredential } from "../_shared/execution-ownership.ts";
import {canonicalLifecycleType,enqueueCanonicalLifecycle,lifecycleAudience} from "../_shared/canonical-lifecycle-publication.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token",
};

const MONITOR_VERSION = "crypto-fix-4-execution-hardening-binance-truth";
const ACTIVE_STATUSES = ["pending", "entry_submitted", "entry_filled", "protected", "protected_native", "pending_protection", "protection_pending", "protection_failed", "protection_recovered", "protected_managed", "pending_managed_protection", "partially_closed"];
const ENTRY_OPEN_STATUSES = ["NEW", "PARTIALLY_FILLED"];
const TERMINAL_ORDER_STATUSES = ["CANCELED", "EXPIRED"];

type SupabaseClient = ReturnType<typeof createClient>;
type Row = Record<string, unknown> & { id: string; symbol: string; direction: string; status: string; signal_id?: string | null };
type BinanceOrder = Record<string, unknown> & { orderId?: string | number; algoId?: string | number; status?: string; algoStatus?: string; symbol?: string };
type BinancePosition = Record<string, unknown> & { symbol?: string; positionAmt?: string; markPrice?: string; unRealizedProfit?: string; unrealizedProfit?: string };

type RowError = { id: string; symbol: string; status: string; error: string; stack?: string; action: string; severity?: "warning" | "critical" };
type MonitorWarning = { id?: string; symbol?: string; status?: string; warning: string; action: string; source: "row" | "account_sync" | "order_lookup" | "cleanup" };
type MonitorLevel = "healthy" | "completed_with_warnings" | "partial_sync_warning" | "row_errors_only" | "degraded" | "critical_error";


type MonitorPayload = {
  expected_monitor_version?: string;
  [key: string]: unknown;
};

type GlobalErrorReason =
  | "auth_failed"
  | "missing_env"
  | "invalid_payload"
  | "db_query_failed"
  | "missing_table_or_column"
  | "deployment_mismatch"
  | "startup_exception";

type ProfitLockMode = "disabled" | "study_only" | "testnet_action";
type MonitorSettings = Record<string, unknown> & { enable_profit_lock_engine?: boolean; enable_testnet_profit_lock_engine?: boolean; profit_lock_before_tp1_testnet_allowed?: boolean; profit_lock_min_r?: number; profit_lock_max_updates_per_trade?: number; profit_lock_cooldown_minutes?: number; live_trading_enabled?: boolean };

type MonitorStats = {
  checked: number;
  updated: number;
  protected: number;
  managed: number;
  stale_closed: number;
  closed_synced: number;
  safety_closed: number;
  row_errors: RowError[];
  events: number;
  telegram_sent: number;
  stale_cleaned: number;
  reduce_only_orders: number;
  cancelled_orders: number;
  last_managed_action: Record<string, unknown> | null;
  latest_monitor_error: string;
  latest_sync_error: string;
  latest_monitor_warning: string;
  warnings: MonitorWarning[];
  critical_errors: string[];
  unsafe_positions: number;
  monitor_status: MonitorLevel;
  reconciliation_summary: Record<string, unknown>;
  profit_lock_study: { evaluated: number; reached_0_1r: number; reached_0_2r: number; reached_0_3r: number; reached_0_5r: number; later_reversed: number; actions_taken: number; skipped_reasons: Record<string, number> };
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


function globalErrorResponse(reason: GlobalErrorReason, message: string, stats: MonitorStats, extra: Record<string, unknown> = {}, status = 200) {
  return jsonResponse({
    success: false,
    action: "binance_testnet_monitor",
    monitor_version: MONITOR_VERSION,
    monitor_started: false,
    global_error: reason,
    error: message,
    checked: stats.checked,
    updated: stats.updated,
    row_errors: stats.row_errors,
    ...extra,
  }, status);
}

async function parseMonitorPayload(req: Request): Promise<{ payload: MonitorPayload; error?: string }> {
  const contentType = req.headers.get("Content-Type") ?? "";
  const raw = await req.text();
  if (!raw.trim()) return { payload: {} };
  if (contentType && !contentType.toLowerCase().includes("application/json")) return { payload: {}, error: "Content-Type must be application/json when a body is supplied" };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { payload: {}, error: "JSON body must be an object" };
    return { payload: parsed as MonitorPayload };
  } catch (err) {
    return { payload: {}, error: `Invalid JSON payload: ${errorMessage(err)}` };
  }
}

function isMissingTableOrColumn(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase();
  return message.includes("column") || message.includes("relation") || message.includes("schema cache") || message.includes("could not find") || message.includes("does not exist");
}

async function safeSettingsUpdate(supabase: SupabaseClient | null, update: Record<string, unknown>) {
  if (!supabase) return;
  try {
    await supabase.from("execution_settings").update(update).eq("id", 1);
  } catch {
    // Best-effort visibility only; never let status persistence turn a structured response into a 500.
  }
}

async function verifyMonitorSchema(supabase: SupabaseClient) {
  const executionOrdersColumns = "id,status,latest_monitor_error,latest_sync_error,latest_protection_error,last_monitor_action";
  const executionSettingsColumns = "id,latest_monitor_run_at,latest_account_state_at,latest_monitor_error,latest_sync_error,latest_monitor_status,latest_monitor_result";
  const ordersProbe = await supabase.from("execution_orders").select(executionOrdersColumns).limit(0);
  if (ordersProbe.error) return { ok: false, error: ordersProbe.error, table: "execution_orders", columns: executionOrdersColumns };
  const settingsProbe = await supabase.from("execution_settings").select(executionSettingsColumns).limit(0);
  if (settingsProbe.error) return { ok: false, error: settingsProbe.error, table: "execution_settings", columns: executionSettingsColumns };
  return { ok: true };
}

function boolEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

function n(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOpenAlgoOrders(body: unknown): BinanceOrder[] {
  if (Array.isArray(body)) return body as BinanceOrder[];
  const orders = (body as { orders?: unknown } | null)?.orders;
  return Array.isArray(orders) ? orders as BinanceOrder[] : [];
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || "Unknown error");
}

function errorStack(err: unknown): string {
  return err instanceof Error && err.stack ? err.stack.slice(0, 2000) : "";
}

function isBinanceOrderNotFound(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase();
  return message.includes('"code":-2013') || message.includes('code:-2013') || message.includes('-2013') || message.includes("order does not exist");
}

function addMonitorWarning(stats: MonitorStats, warning: MonitorWarning): void {
  stats.warnings.push(warning);
  stats.latest_monitor_warning = warning.warning;
}

function addCriticalMonitorError(stats: MonitorStats, error: string): void {
  stats.critical_errors.push(error);
  stats.latest_monitor_error = error;
  stats.latest_sync_error = error;
}

function eatTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, year: "numeric", month: "short", day: "2-digit" }).format(date);
}

function shortText(value: unknown, max = 250): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function monitorDisplayStatus(status: MonitorLevel): "HEALTHY" | "DEGRADED" | "CRITICAL" {
  return status === "critical_error" ? "CRITICAL" : status === "healthy" ? "HEALTHY" : "DEGRADED";
}

function classifyMonitor(stats: MonitorStats): MonitorLevel {
  const reconciliation = stats.reconciliation_summary as { unresolved_critical_count?: number; unprotected_position_count?: number; protection_degraded_count?: number; missing_sl_count?: number; reconciliation_failed_count?: number; account_fetch_failed_count?: number; duplicate_conditional_count?: number; stale_or_orphan_order_count?: number } | undefined;
  if (stats.unsafe_positions > 0 || (reconciliation?.unprotected_position_count ?? 0) > 0 || (reconciliation?.missing_sl_count ?? 0) > 0 || (reconciliation?.unresolved_critical_count ?? 0) > 0) return "critical_error";
  if ((reconciliation?.reconciliation_failed_count ?? 0) > 0 || (reconciliation?.account_fetch_failed_count ?? 0) > 0) return "critical_error";
  if (stats.critical_errors.length > 0) return "critical_error";
  if (stats.safety_closed > 0 || (reconciliation?.protection_degraded_count ?? 0) > 0) return "degraded";
  if ((reconciliation?.duplicate_conditional_count ?? 0) > 0 || (reconciliation?.stale_or_orphan_order_count ?? 0) > 0) return "degraded";
  if (stats.row_errors.length > 0 || stats.warnings.length > 0) return "degraded";
  return "healthy";
}

function affectedSymbols(stats: MonitorStats): string[] {
  const classifications = (stats.reconciliation_summary?.classifications ?? {}) as Record<string, Record<string, unknown>>;
  const symbols = new Set<string>();
  for (const symbol of Object.keys(classifications)) symbols.add(symbol);
  for (const warning of stats.warnings) if (warning.symbol) symbols.add(warning.symbol);
  for (const row of stats.row_errors) if (row.symbol) symbols.add(row.symbol);
  for (const row of stats.critical_errors) {
    const match = String(row).match(/\b[A-Z0-9]{2,15}USDT\b/);
    if (match?.[0]) symbols.add(match[0]);
  }
  return Array.from(symbols).sort();
}

function affectedSymbolLines(stats: MonitorStats): string[] {
  const classifications = (stats.reconciliation_summary?.classifications ?? {}) as Record<string, Record<string, unknown>>;
  const symbols = affectedSymbols(stats);
  const lines = symbols.slice(0, 12).map((symbol) => {
    const item = classifications[symbol] ?? {};
    const states = [
      item.missing_protection ? "missing SL" : "protected",
      n(item.duplicate_conditional) > 0 ? "duplicate orders" : "",
      n(item.stale_conditional) + n(item.orphan_binance_order) > 0 ? "stale/orphan orders" : "",
      stats.warnings.some((w) => w.symbol === symbol) || stats.row_errors.some((e) => e.symbol === symbol) ? "degraded" : "",
    ].filter(Boolean).join(" / ");
    return `• ${symbol} — ${states || "healthy"}`;
  });
  return lines.length ? lines : ["• None"];
}

type MonitorAlertSeverity = "healthy" | "degraded" | "critical";
type MonitorAlertState = { fingerprint?: string; sent_at?: string; status?: string; severity?: MonitorAlertSeverity; latest_error_short?: string };

function monitorAlertSeverity(stats: MonitorStats): MonitorAlertSeverity {
  return stats.monitor_status === "critical_error" || stats.critical_errors.length > 0 || stats.unsafe_positions > 0 ? "critical" : stats.monitor_status === "degraded" || stats.warnings.length > 0 ? "degraded" : "healthy";
}

function monitorAlertFingerprint(stats: MonitorStats): { fingerprint: string; latestErrorShort: string; severity: MonitorAlertSeverity } {
  const symbols = affectedSymbols(stats);
  const latestErrorShort = shortText(stats.latest_monitor_error || stats.latest_sync_error || stats.latest_monitor_warning || "", 220);
  const severity = monitorAlertSeverity(stats);
  const fingerprint = JSON.stringify({
    monitor_status: stats.monitor_status,
    severity,
    critical_errors: stats.critical_errors.length,
    unsafe_positions: stats.unsafe_positions,
    affected_symbols: symbols,
    latest_error_short: latestErrorShort,
  });
  return { fingerprint, latestErrorShort, severity };
}

function cooldownMs(severity: MonitorAlertSeverity): number {
  return severity === "critical" ? 10 * 60 * 1000 : 60 * 60 * 1000;
}

function fingerprintKey(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(31, hash) + value.charCodeAt(i) | 0;
  return Math.abs(hash).toString(36);
}

function wasUnhealthy(state?: MonitorAlertState | null): boolean {
  return state?.severity === "critical" || state?.severity === "degraded" || state?.status === "critical_error" || state?.status === "degraded";
}

function shouldSendMonitorAlert(current: { fingerprint: string; severity: MonitorAlertSeverity }, previous: MonitorAlertState | null, nowMs: number): boolean {
  if (current.severity === "healthy") return wasUnhealthy(previous);
  if (!previous?.sent_at || !previous.fingerprint) return true;
  if (previous.fingerprint !== current.fingerprint) return true;
  if (current.severity === "critical" && previous.severity !== "critical") return true;
  const previousMs = new Date(previous.sent_at).getTime();
  if (!Number.isFinite(previousMs)) return true;
  return nowMs - previousMs >= cooldownMs(current.severity);
}

function monitorAlertText(stats: MonitorStats, recovery: boolean): string {
  if (recovery) {
    return [
      "✅ HashiBot Binance Monitor Recovery",
      "",
      `Status: ${monitorDisplayStatus(stats.monitor_status)}`,
      `Time: ${eatTimestamp()}`,
      "",
      "Monitor is healthy again. Repeated recovery alerts are suppressed until the monitor degrades or becomes critical again.",
    ].join("\n");
  }
  const reconciliation = stats.reconciliation_summary as Record<string, unknown>;
  const cleanupEvents = Array.isArray(reconciliation.cleanup_events) ? reconciliation.cleanup_events as Record<string, unknown>[] : [];
  const cancelledCleanup = cleanupEvents.filter((event) => String(event.cleanup_action ?? "").includes("cancel")).length;
  const skippedUnsafe = cleanupEvents.filter((event) => String(event.cleanup_action ?? "").includes("skip")).length;
  return [
    "🚨 HashiBot Binance Monitor Alert",
    "",
    `Status: ${monitorDisplayStatus(stats.monitor_status)}`,
    `Time: ${eatTimestamp()}`,
    "",
    "Summary:",
    `• Critical errors: ${stats.critical_errors.length}`,
    `• Unsafe positions: ${stats.unsafe_positions}`,
    `• Open positions: ${Array.isArray(reconciliation.open_position_symbols) ? reconciliation.open_position_symbols.length : 0}`,
    `• Open orders: ${Array.isArray(reconciliation.open_order_symbols) ? reconciliation.open_order_symbols.length : 0}`,
    `• Protected positions: ${Math.max(0, (Array.isArray(reconciliation.open_position_symbols) ? reconciliation.open_position_symbols.length : 0) - n(reconciliation.unprotected_position_count))}`,
    `• Duplicate conditionals: ${n(reconciliation.duplicate_conditional_count)}`,
    `• Stale/orphan orders: ${n(reconciliation.stale_or_orphan_order_count)}`,
    `• Cleanup cancelled: ${stats.cancelled_orders}`,
    "",
    "Affected Symbols:",
    ...affectedSymbolLines(stats),
    "",
    "Actions Taken:",
    `• Cancelled stale orders: ${cancelledCleanup || stats.cancelled_orders}`,
    `• Preserved valid SL: ${n(reconciliation.protection_degraded_count)}`,
    `• Skipped unsafe cleanup: ${skippedUnsafe}`,
    "",
    "Latest Error:",
    shortText(stats.latest_monitor_error || stats.latest_monitor_warning || "None"),
    "",
    "Operator Note:",
    "Full reconciliation is stored in Execution UI / DB logs.",
  ].filter(Boolean).join("\n");
}

async function readMonitorAlertState(supabase: SupabaseClient): Promise<MonitorAlertState | null> {
  const { data, error } = await supabase.from("execution_settings").select("latest_monitor_alert_state").eq("id", 1).maybeSingle();
  if (error) return null;
  return ((data as { latest_monitor_alert_state?: unknown } | null)?.latest_monitor_alert_state ?? null) as MonitorAlertState | null;
}

async function writeMonitorAlertState(supabase: SupabaseClient, state: MonitorAlertState): Promise<void> {
  await supabase.from("execution_settings").update({ latest_monitor_alert_state: state, updated_at: new Date().toISOString() }).eq("id", 1);
}

async function sendAdminMonitorAlert(supabase: SupabaseClient, stats: MonitorStats): Promise<void> {
  const current = monitorAlertFingerprint(stats);
  const previous = await readMonitorAlertState(supabase);
  const now = new Date();
  if (!shouldSendMonitorAlert(current, previous, now.getTime())) return;
  if (current.severity === "healthy" && !wasUnhealthy(previous)) return;

  const recovery = current.severity === "healthy";
  await routeTelegramEvent(supabase, {
    event_id: `admin_binance_monitor_alert:${recovery ? "recovery" : stats.monitor_status}:${fingerprintKey(current.fingerprint)}:${now.toISOString().slice(0, 16)}`,
    event_type: recovery ? "admin_binance_monitor_recovered" : stats.monitor_status === "critical_error" ? "admin_binance_monitor_critical_error" : "admin_binance_monitor_protection_degraded",
    text: monitorAlertText(stats, recovery),
    source: "binance-testnet-monitor",
    channels: ["admin"],
    dedupe: true,
  }).then(() => { stats.telegram_sent += 1; }).catch(() => undefined);

  await writeMonitorAlertState(supabase, {
    fingerprint: current.fingerprint,
    sent_at: now.toISOString(),
    status: stats.monitor_status,
    severity: current.severity,
    latest_error_short: current.latestErrorShort,
  });
}


function profitLockMode(settings: MonitorSettings): ProfitLockMode {
  if (settings.live_trading_enabled === true) return "disabled";
  if (settings.enable_profit_lock_engine !== true) return "study_only";
  if (settings.enable_testnet_profit_lock_engine === true && boolEnv(Deno.env.get("TESTNET_ENABLED"))) return "testnet_action";
  return "study_only";
}

function profitLockStudyUpdate(row: Row, markPrice: number, unrealizedPnl: number, hasPosition: boolean, mode: ProfitLockMode, stats: MonitorStats): Record<string, unknown> {
  const entry = n(row.entry_price);
  const sl = n(row.original_sl_price) || n(row.intended_sl) || n(row.stop_loss);
  const risk = Math.abs(entry - sl);
  let currentR = 0;
  if (entry > 0 && risk > 0 && markPrice > 0) currentR = String(row.direction).toLowerCase() === "buy" ? (markPrice - entry) / risk : (entry - markPrice) / risk;
  const highestR = Math.max(n(row.highest_positive_r_observed), currentR, 0);
  const highestPnl = Math.max(n(row.highest_positive_pnl_observed), unrealizedPnl, 0);
  const reached01 = Boolean(row.reached_0_1r) || highestR >= 0.1;
  const reached02 = Boolean(row.reached_0_2r) || highestR >= 0.2;
  const reached03 = Boolean(row.reached_0_3r) || highestR >= 0.3;
  const reached05 = Boolean(row.reached_0_5r) || highestR >= 0.5;
  const laterReversed = Boolean(row.later_reversed_after_positive_excursion) || (highestR >= 0.3 && currentR < 0.05);
  const slValid = Boolean(row.sl_algo_id || row.binance_sl_order_id || row.replacement_sl_algo_id || row.replacement_sl_order_id);
  const afterTp1 = Boolean(row.tp1_filled || row.tp1_closed_at || row.status === "partially_closed");
  const recommendation = mode === "testnet_action" && afterTp1 && currentR >= n(row.profit_lock_r || 0.3) && slValid ? "move_sl_to_0_3r" : afterTp1 && slValid ? "study_after_tp1_lock_candidate" : "study_only";
  const skipped = mode === "testnet_action" ? (slValid ? "threshold_or_state_not_met" : "valid_sl_required") : "profit_lock_action_disabled_study_only";
  stats.profit_lock_study.evaluated += hasPosition ? 1 : 0;
  if (reached01) stats.profit_lock_study.reached_0_1r += 1;
  if (reached02) stats.profit_lock_study.reached_0_2r += 1;
  if (reached03) stats.profit_lock_study.reached_0_3r += 1;
  if (reached05) stats.profit_lock_study.reached_0_5r += 1;
  if (laterReversed) stats.profit_lock_study.later_reversed += 1;
  stats.profit_lock_study.skipped_reasons[skipped] = (stats.profit_lock_study.skipped_reasons[skipped] ?? 0) + 1;
  return { current_r: Number(currentR.toFixed(6)), profit_lock_r_current: Number(currentR.toFixed(6)), highest_positive_r_observed: Number(highestR.toFixed(6)), highest_positive_pnl_observed: highestPnl, reached_0_1r: reached01, reached_0_2r: reached02, reached_0_3r: reached03, reached_0_5r: reached05, later_reversed_after_positive_excursion: laterReversed, tp1_hit: afterTp1, tp2_hit: Boolean(row.tp2_filled || row.tp2_closed_at), sl_valid: slValid, profit_lock_engine_mode: mode, lock_recommendation: recommendation, profit_lock_skipped_reason: skipped, max_adverse_r_observed: Math.min(n(row.max_adverse_r_observed), currentR, 0), current_pnl: unrealizedPnl };
}

function monitorResult(stats: MonitorStats): Record<string, unknown> {
  return {
    action: "binance_testnet_monitor",
    monitor_version: MONITOR_VERSION,
    monitor_started: true,
    monitor_status: stats.monitor_status,
    warnings_count: stats.warnings.length,
    row_errors_count: stats.row_errors.length,
    critical_errors_count: stats.critical_errors.length,
    unsafe_positions_count: stats.unsafe_positions,
    http_status: 200,
    ...stats,
  };
}

function syncedNoPositionStatus(row: Row): "closed_manual" | "stale_closed" {
  return ["entry_filled", "protected", "protected_native", "protected_managed", "partially_closed", "pending_protection", "pending_managed_protection"].includes(row.status) ? "closed_manual" : "stale_closed";
}

function calculateProfitLockPrice(direction: string, entryPrice: number, originalStopLoss: number, profitLockR = 0.3): number {
  const riskDistance = Math.abs(entryPrice - originalStopLoss);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(originalStopLoss) || riskDistance <= 0) return 0;
  return String(direction).toLowerCase() === "buy" ? entryPrice + riskDistance * profitLockR : entryPrice - riskDistance * profitLockR;
}

function orderFillPrice(order: BinanceOrder | null | undefined, fallback: number): number {
  return n(order?.avgPrice) || n(order?.price) || fallback;
}

function orderFillTime(order: BinanceOrder | null | undefined, fallbackIso: string): string {
  const ms = n(order?.updateTime) || n(order?.time);
  return ms > 0 ? new Date(ms).toISOString() : fallbackIso;
}

function sideToClose(direction: string): "BUY" | "SELL" {
  return String(direction).toLowerCase() === "buy" ? "SELL" : "BUY";
}

function targetHit(direction: string, mark: number, target: number): boolean {
  return String(direction).toLowerCase() === "buy" ? mark >= target : mark <= target;
}

function stopHit(direction: string, mark: number, stop: number): boolean {
  return String(direction).toLowerCase() === "buy" ? mark <= stop : mark >= stop;
}

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function binanceRequest(path: string, params: Record<string, string | number | boolean> = {}, method = "GET") {
  let apiKey = "";
  let apiSecret = "";
  try { ({ apiKey, apiSecret } = currentEdgeProviderCredential("binance")); }
  catch (error) {
    if (Deno.env.get("HASHIBOT_LOCAL_DEV_CREDENTIAL_FALLBACK") !== "true") throw error;
    apiKey = Deno.env.get("BINANCE_TESTNET_API_KEY") ?? "";
    apiSecret = Deno.env.get("BINANCE_TESTNET_API_SECRET") ?? "";
  }
  if (!apiKey || !apiSecret) throw new Error("Binance testnet API keys are not configured");
  const baseUrl = Deno.env.get("BINANCE_TESTNET_BASE_URL") ?? "https://demo-fapi.binance.com";
  const search = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: "5000" });
  search.set("signature", await hmacSha256(apiSecret, search.toString()));
  const res = await fetch(`${baseUrl}${path}?${search.toString()}`, { method, headers: { "X-MBX-APIKEY": apiKey } });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) throw new Error(`Binance ${method} ${path} failed (${res.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

async function verifyCronOrService(req: Request, supabase: SupabaseClient, serviceRole: string): Promise<boolean> {
  void serviceRole;
  const auth = await authorizeInternalOrAdmin(req, supabase);
  return auth.ok;
}

async function logEvent(supabase: SupabaseClient, row: Row, type: string, message: string, metadata: Record<string, unknown>, stats: MonitorStats) {
  const fullMessage = `BINANCE TESTNET — NOT LIVE\n${message}`;
  const {data:event,error}=await supabase.from("execution_event_logs").insert({ execution_order_id: row.id, signal_id: row.signal_id ?? null, symbol: row.symbol, event_type: type, message: fullMessage, metadata, telegram_sent: false }).select("id,created_at").single();if(error)throw error;
  const customerId=String(row.customer_id??"")||null,accountId=String(row.account_id??"")||null;await enqueueCanonicalLifecycle(supabase,{eventKey:`binance:${row.id}:${type}`,eventType:canonicalLifecycleType(type),signalId:row.signal_id??null,executionId:row.id,customerId,accountId,occurredAt:event.created_at,payload:{...metadata,details:fullMessage,symbol:row.symbol,provider:"binance"},destinations:lifecycleAudience({customerId,accountId})});
  stats.events += 1;
}

async function cancelAlgoOrder(symbol: string, algoId: string) {
  await binanceRequest("/fapi/v1/algoOrder", { symbol, algoId }, "DELETE");
}

function floorToStep(value: number, step: number, precision: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scaled = Math.floor((value / step) + 1e-12) * step;
  return Number(scaled.toFixed(Math.min(Math.max(precision, 0), 12)));
}

function roundToTick(value: number, tick: number, precision: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rounded = Math.round(value / tick) * tick;
  return Number(rounded.toFixed(Math.min(Math.max(precision, 0), 12)));
}

async function fetchSymbolRules(symbol: string): Promise<{ stepSize: number; tickSize: number; pricePrecision: number; quantityPrecision: number }> {
  try {
    const data = await binanceRequest("/fapi/v1/exchangeInfo") as { symbols: Array<{ symbol: string; status: string; pricePrecision: number; quantityPrecision: number; filters: Array<{ filterType: string; tickSize?: string; stepSize?: string }> }> };
    const row = data.symbols.find((s) => s.symbol === symbol && s.status === "TRADING");
    if (!row) return { stepSize: 0.001, tickSize: 0.01, pricePrecision: 6, quantityPrecision: 3 };
    const lot = row.filters.find((f) => f.filterType === "LOT_SIZE");
    const price = row.filters.find((f) => f.filterType === "PRICE_FILTER");
    return { stepSize: Number(lot?.stepSize ?? 0.001), tickSize: Number(price?.tickSize ?? 0.01), pricePrecision: row.pricePrecision, quantityPrecision: row.quantityPrecision };
  } catch {
    return { stepSize: 0.001, tickSize: 0.01, pricePrecision: 6, quantityPrecision: 3 };
  }
}

async function submitAlgoProtectionOrder(symbol: string, closeSide: "BUY" | "SELL", type: "STOP_MARKET" | "TAKE_PROFIT_MARKET", triggerPrice: number, quantity: number, label: string): Promise<{ algoId: string; clientAlgoId: string }> {
  // Binance requires clientAlgoId < 36 chars. Use short prefix + 22 random hex chars (max 30).
  const clientAlgoId = `hb_${label}_${crypto.randomUUID().replace(/-/g, "").slice(0, 22)}`;
  const payload: Record<string, string | number | boolean> = {
    symbol, side: closeSide, algoType: "CONDITIONAL", type, triggerPrice, quantity,
    reduceOnly: true, workingType: "MARK_PRICE", clientAlgoId,
  };
  const algo = await binanceRequest("/fapi/v1/algoOrder", payload, "POST") as { algoId?: string | number; clientAlgoId?: string };
  const algoId = String(algo.algoId ?? "");
  if (!algoId) throw new Error(`No algoId returned for ${label}`);
  return { algoId, clientAlgoId: String(algo.clientAlgoId ?? clientAlgoId) };
}


async function verifyOpenProtectionSet(row: Row, expected: Array<{ label: string; algoId: string; side: string; type: string; quantity: number; triggerPrice: number }>): Promise<{ verified: boolean; errors: string[]; openOrders: BinanceOrder[] }> {
  const body = await binanceRequest("/fapi/v1/openAlgoOrders", { symbol: row.symbol, algoType: "CONDITIONAL" }).catch(() => []);
  const openOrders = parseOpenAlgoOrders(body);
  const errors: string[] = [];
  for (const item of expected) {
    const order = openOrders.find((o) => String(o.algoId ?? o.orderId ?? "") === String(item.algoId));
    if (!order) { errors.push(`${item.label}:missing`); continue; }
    if (String(order.side ?? item.side).toUpperCase() !== item.side) errors.push(`${item.label}:wrong_side`);
    if (String(order.type ?? item.type).toUpperCase() !== item.type) errors.push(`${item.label}:wrong_type`);
    
    const reduceOnlyVal = String(order.reduceOnly ?? "").toLowerCase();
    const closePositionVal = String(order.closePosition ?? "").toLowerCase();
    
    if (reduceOnlyVal === "false" && closePositionVal !== "true") {
      errors.push(`${item.label}:not_reduce_only`);
    }
    
    const isClosePosition = closePositionVal === "true";
    if (!isClosePosition) {
      const qty = n(order.origQty ?? order.quantity);
      if (qty > 0 && Math.abs(qty - item.quantity) > Math.max(item.quantity * 0.000001, 1e-8)) {
        errors.push(`${item.label}:wrong_quantity`);
      }
    }
    
    const trigger = n(order.triggerPrice ?? order.stopPrice ?? order.price);
    if (trigger > 0 && Math.abs(trigger - item.triggerPrice) > Math.max(item.triggerPrice * 0.000001, 1e-8)) errors.push(`${item.label}:wrong_trigger_price`);
  }
  return { verified: errors.length === 0, errors, openOrders };
}

type ProtectionComponent = "sl" | "tp1" | "tp2";

type ProtectionExpectation = {
  label: ProtectionComponent;
  storedId?: string;
  side: "BUY" | "SELL";
  type: "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity: number;
  triggerPrice: number;
  idColumns: string[];
};

type ProtectionCheck = ProtectionExpectation & { liveOrder?: BinanceOrder; liveId?: string; errors: string[]; matchedByStoredId: boolean };

function openOrderIdentity(order: BinanceOrder): string {
  return String(order.algoId ?? order.orderId ?? order.clientAlgoId ?? order.clientOrderId ?? "");
}

function activeConditionalOrders(openOrders: BinanceOrder[]): BinanceOrder[] {
  return openOrders.filter((order) => {
    const status = normalizeAlgoStatus(order);
    if (["CANCELED", "CANCELLED", "EXPIRED", "REJECTED", "FILLED", "FINISHED"].includes(status)) return false;
    return Boolean(order.algoId || order.orderId || order.clientAlgoId || order.clientOrderId);
  });
}

function orderMatchesProtectionIntent(order: BinanceOrder, expected: ProtectionExpectation): boolean {
  const side = String(order.side ?? "").toUpperCase();
  if (side && side !== expected.side) return false;
  const type = String(order.type ?? (order as Record<string, unknown>).orderType ?? "").toUpperCase();
  if (type && type !== expected.type) return false;
  
  const reduceOnlyVal = String(order.reduceOnly ?? "").toLowerCase();
  const closePositionVal = String(order.closePosition ?? "").toLowerCase();
  
  if (reduceOnlyVal === "false" && closePositionVal !== "true") return false;
  
  const isClosePosition = closePositionVal === "true";
  if (!isClosePosition) {
    const qty = n(order.origQty ?? order.quantity);
    if (qty > 0 && expected.quantity > 0 && Math.abs(qty - expected.quantity) > Math.max(expected.quantity * 0.000001, 1e-8)) return false;
  }
  
  const trigger = n(order.triggerPrice ?? order.stopPrice ?? order.price);
  if (trigger > 0 && expected.triggerPrice > 0 && Math.abs(trigger - expected.triggerPrice) > Math.max(Math.abs(expected.triggerPrice) * 0.000001, 1e-8)) return false;
  return true;
}

function expectedNativeProtection(row: Row, positionAmt: number): ProtectionExpectation[] {
  const closeSide = sideToClose(row.direction);
  const total = Math.abs(positionAmt) || n(row.remaining_quantity) || n(row.volume) || n(row.quantity);
  const afterTp1 = Boolean(row.tp1_filled || row.tp1_closed_at || row.runner_active || row.profit_lock_sl_active || row.sl_replaced_after_tp1 || row.status === "partially_closed");
  const slPrice = afterTp1 ? n(row.replacement_sl_price) || n(row.profit_lock_price) || n(row.intended_sl) || n(row.stop_loss) : n(row.intended_sl) || n(row.stop_loss);
  const slId = String((afterTp1 ? row.replacement_sl_algo_id ?? row.replacement_sl_order_id : row.sl_algo_id ?? row.binance_sl_order_id) ?? "");
  const tp1Qty = floorToStep(n(row.tp1_quantity) || total * 0.5, 0.00000001, 8);
  const tp2Qty = floorToStep(n(row.tp2_quantity) || Math.max(total - tp1Qty, total * 0.5), 0.00000001, 8);
  const expectations: ProtectionExpectation[] = [{
    label: "sl",
    storedId: slId || undefined,
    side: closeSide,
    type: "STOP_MARKET",
    quantity: total,
    triggerPrice: slPrice,
    idColumns: afterTp1 ? ["replacement_sl_order_id", "replacement_sl_algo_id"] : ["sl_order_id", "sl_algo_id", "binance_sl_order_id"],
  }];
  if (!afterTp1) {
    expectations.push({ label: "tp1", storedId: String(row.tp1_algo_id ?? row.binance_tp1_order_id ?? "") || undefined, side: closeSide, type: "TAKE_PROFIT_MARKET", quantity: tp1Qty, triggerPrice: n(row.intended_tp1) || n(row.tp1), idColumns: ["tp1_order_id", "tp1_algo_id", "binance_tp1_order_id"] });
  }
  expectations.push({ label: "tp2", storedId: String(row.tp2_algo_id ?? row.binance_tp2_order_id ?? "") || undefined, side: closeSide, type: "TAKE_PROFIT_MARKET", quantity: tp2Qty, triggerPrice: n(row.intended_tp2) || n(row.tp2), idColumns: ["tp2_order_id", "tp2_algo_id", "binance_tp2_order_id"] });
  return expectations.filter((item) => item.quantity > 0 && item.triggerPrice > 0);
}

function checkNativeProtection(openOrders: BinanceOrder[], expected: ProtectionExpectation[]): ProtectionCheck[] {
  const live = activeConditionalOrders(openOrders);
  return expected.map((item) => {
    const stored = item.storedId ? live.find((order) => openOrderIdentity(order) === item.storedId) : undefined;
    const matched = stored && orderMatchesProtectionIntent(stored, item) ? stored : live.find((order) => orderMatchesProtectionIntent(order, item));
    const order = matched ?? stored;
    const errors: string[] = [];
    if (!order) errors.push("missing");
    else if (!orderMatchesProtectionIntent(order, item)) {
      if (String(order.side ?? "").toUpperCase() !== item.side) errors.push("wrong_side");
      if (String(order.type ?? (order as Record<string, unknown>).orderType ?? "").toUpperCase() !== item.type) errors.push("wrong_type");
      
      const reduceOnlyVal = String(order.reduceOnly ?? "").toLowerCase();
      const closePositionVal = String(order.closePosition ?? "").toLowerCase();
      
      if (reduceOnlyVal === "false" && closePositionVal !== "true") {
        errors.push("not_reduce_only");
      }
      
      const isClosePosition = closePositionVal === "true";
      if (!isClosePosition) {
        const qty = n(order.origQty ?? order.quantity);
        if (qty > 0 && Math.abs(qty - item.quantity) > Math.max(item.quantity * 0.000001, 1e-8)) {
          errors.push("wrong_quantity");
        }
      }
      
      const trigger = n(order.triggerPrice ?? order.stopPrice ?? order.price);
      if (trigger > 0 && Math.abs(trigger - item.triggerPrice) > Math.max(Math.abs(item.triggerPrice) * 0.000001, 1e-8)) errors.push("wrong_trigger_price");
    }
    return { ...item, liveOrder: order, liveId: order ? openOrderIdentity(order) : undefined, errors, matchedByStoredId: Boolean(stored && order === stored) };
  });
}

async function cancelDuplicateProtectionOrders(row: Row, openOrders: BinanceOrder[], expected: ProtectionExpectation[], stats: MonitorStats): Promise<string[]> {
  const live = activeConditionalOrders(openOrders);
  const keep = new Set<string>();
  for (const item of checkNativeProtection(live, expected)) {
    if (item.errors.length === 0 && item.liveId) keep.add(item.liveId);
  }
  const cancelled: string[] = [];
  for (const order of live) {
    const id = openOrderIdentity(order);
    if (!id || keep.has(id)) continue;
    const conflictsWithManagedSet = expected.some((item) => {
      const sameSide = String(order.side ?? "").toUpperCase() === item.side;
      const sameType = String(order.type ?? (order as Record<string, unknown>).orderType ?? "").toUpperCase() === item.type;
      return sameSide && sameType;
    });
    if (!conflictsWithManagedSet) continue;
    if (expected.some((item) => item.label === "sl") && keep.size === 0) {
      addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: `duplicate_cleanup_skipped_no_verified_keep_id=${id}`, action: "duplicate_cleanup_guard_only_valid_sl", source: "cleanup" });
      continue;
    }
    try {
      await cancelOpenOrder(row.symbol, order);
      cancelled.push(id);
      stats.cancelled_orders += 1;
    } catch (err) {
      addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: `duplicate_cleanup_failed id=${id}: ${errorMessage(err)}`, action: "duplicate_cleanup_retry", source: "cleanup" });
    }
  }
  return cancelled;
}

async function fetchLiveConditionalOrders(symbol: string): Promise<BinanceOrder[]> {
  const [regularBody, algoBody] = await Promise.all([
    binanceRequest("/fapi/v1/openOrders", { symbol }).catch(() => []),
    binanceRequest("/fapi/v1/openAlgoOrders", { symbol, algoType: "CONDITIONAL" }).catch(() => []),
  ]);
  return [...(Array.isArray(regularBody) ? regularBody as BinanceOrder[] : []), ...parseOpenAlgoOrders(algoBody)];
}

async function repairNativeProtectionSet(supabase: SupabaseClient, row: Row, positionAmt: number, openOrders: BinanceOrder[], stats: MonitorStats, runId = ""): Promise<boolean> {
  const expected = expectedNativeProtection(row, positionAmt);
  if (expected.length < (row.tp1_filled || row.tp1_closed_at || row.status === "partially_closed" ? 2 : 3)) {
    const error = `native_protection_intent_incomplete: expected=${expected.map((item) => item.label).join(",")}`;
    await supabase.from("execution_orders").update({ status: "protection_failed", protection_status: "protection_failed", native_protection_verified: false, latest_protection_error: error, lifecycle_state: "unsafe_position", last_monitor_action: "protection_watchdog_intent_incomplete", updated_at: new Date().toISOString() }).eq("id", row.id);
    await logEvent(supabase, row, "protection_failed", `${row.symbol} UNSAFE_POSITION / PROTECTION_FAILED: ${error}`, { expected }, stats);
    stats.unsafe_positions += 1;
    stats.updated += 1;
    return false;
  }

  let checks = checkNativeProtection(openOrders, expected);
  const missingOrInvalid = checks.filter((item) => item.errors.length > 0);
  const idUpdate: Record<string, unknown> = {};
  for (const item of checks.filter((check) => check.errors.length === 0 && check.liveId && check.liveId !== check.storedId)) {
    for (const column of item.idColumns) idUpdate[column] = item.liveId;
  }
  if (missingOrInvalid.length === 0) {
    const duplicateCancelled = await cancelDuplicateProtectionOrders(row, openOrders, expected, stats);
    if (duplicateCancelled.length > 0) {
      addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: `duplicate_conditionals_cancelled=${duplicateCancelled.length}`, action: "duplicate_protection_cleanup", source: "cleanup" });
      await logEvent(supabase, row, "order_cleanup_warning", `${row.symbol} duplicate/stale conditionals cancelled after live protection set was verified.`, { duplicateCancelled, expected }, stats);
    }
    await supabase.from("execution_orders").update({ ...idUpdate, status: row.status === "partially_closed" || row.tp1_filled || row.tp1_closed_at ? "partially_closed" : "protected_native", protection_status: "protected_native", native_protection_verified: true, latest_protection_error: "", protection_critical_reason: "", last_monitor_action: "protection_watchdog_verified_live", updated_at: new Date().toISOString() }).eq("id", row.id);
    try {
      await upsertTradeManagementTruth(supabase, {
        p_execution_order_id: row.id,
        p_provider: "binance",
        p_environment: "testnet",
        p_symbol: row.symbol,
        p_direction: row.direction,
        p_status: row.status === "partially_closed" || row.tp1_filled || row.tp1_closed_at ? "partially_closed" : "protected_native",
        p_protection_status: "protected_native",
        p_sl_present: true,
        p_tp1_present: !expected.some((e) => e.label === "tp1") || checks.every((c) => c.label !== "tp1" || c.errors.length === 0),
        p_tp2_present: checks.every((c) => c.label !== "tp2" || c.errors.length === 0),
        p_entry_price: Number(row.entry_price ?? 0) || null,
        p_mark_price: null,
        p_unrealized_pnl: 0,
        p_quantity: Math.abs(positionAmt) || null,
        p_leverage: Number(row.leverage ?? 0) || null,
        p_sl_price: expected.find((e) => e.label === "sl")?.triggerPrice ?? null,
        p_tp1_price: expected.find((e) => e.label === "tp1")?.triggerPrice ?? null,
        p_tp2_price: expected.find((e) => e.label === "tp2")?.triggerPrice ?? null,
        p_monitor_run_id: runId,
        p_repair_attempts: Number(row.repair_attempts ?? 0),
        p_recovery_status: "healthy",
        p_latest_error: null,
        p_last_action_taken: "exchange_confirmed_protection"
      });
    } catch (_e) {
      // non-blocking
    }
    stats.protected += 1;
    stats.updated += 1;
    return true;
  }

  const unsafeReason = missingOrInvalid.map((item) => `${item.label}:${item.errors.join("+")}`).join(",");
  await supabase.from("execution_orders").update({ ...idUpdate, status: "protection_failed", protection_status: "protection_failed", native_protection_verified: false, latest_protection_error: `UNSAFE_POSITION missing/mismatched live Binance protection: ${unsafeReason}`, protection_critical_reason: "binance_position_exists_without_verified_sl_tp1_tp2", lifecycle_state: "unsafe_position", last_monitor_action: "protection_watchdog_repairing", repair_attempts: Number(row.repair_attempts ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", row.id);
  try {
    await upsertTradeManagementTruth(supabase, {
      p_execution_order_id: row.id,
      p_provider: "binance",
      p_environment: "testnet",
      p_symbol: row.symbol,
      p_direction: row.direction,
      p_status: "protection_failed",
      p_protection_status: "protection_failed",
      p_sl_present: checks.every((c) => c.label !== "sl" || c.errors.length === 0),
      p_tp1_present: !expected.some((e) => e.label === "tp1") || checks.every((c) => c.label !== "tp1" || c.errors.length === 0),
      p_tp2_present: checks.every((c) => c.label !== "tp2" || c.errors.length === 0),
      p_entry_price: Number(row.entry_price ?? 0) || null,
      p_mark_price: null,
      p_unrealized_pnl: 0,
      p_quantity: Math.abs(positionAmt) || null,
      p_leverage: Number(row.leverage ?? 0) || null,
      p_sl_price: expected.find((e) => e.label === "sl")?.triggerPrice ?? null,
      p_tp1_price: expected.find((e) => e.label === "tp1")?.triggerPrice ?? null,
      p_tp2_price: expected.find((e) => e.label === "tp2")?.triggerPrice ?? null,
      p_monitor_run_id: runId,
      p_repair_attempts: Number(row.repair_attempts ?? 0) + 1,
      p_recovery_status: "repairing",
      p_latest_error: `UNSAFE_POSITION missing/mismatched live Binance protection: ${unsafeReason}`,
      p_last_action_taken: "repair_attempted"
    });
  } catch (_e) {
    // non-blocking
  }
  await logEvent(supabase, row, "protection_failed", `${row.symbol} UNSAFE_POSITION / PROTECTION_FAILED: missing or invalid live Binance protection (${unsafeReason}); recreating missing components.`, { checks, expected }, stats);
  stats.unsafe_positions += 1;
  stats.updated += 1;

  const created: Record<string, unknown> = {};
  for (const item of missingOrInvalid) {
    const knownBadId = item.matchedByStoredId && item.liveOrder ? openOrderIdentity(item.liveOrder) : "";
    if (knownBadId) {
      try {
        await cancelOpenOrder(row.symbol, item.liveOrder as BinanceOrder);
        stats.cancelled_orders += 1;
      } catch (err) {
        addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: `protection_watchdog_cancel_bad_${item.label}_warning: ${errorMessage(err)}`, action: "protection_watchdog_repair_continue", source: "cleanup" });
      }
    }
    const order = await submitAlgoProtectionOrder(row.symbol, item.side, item.type, item.triggerPrice, item.quantity, item.label);
    created[item.label] = order;
    for (const column of item.idColumns) idUpdate[column] = order.algoId;
    idUpdate[`${item.label}_client_algo_id`] = order.clientAlgoId;
  }

  const refreshed = await fetchLiveConditionalOrders(row.symbol);
  checks = checkNativeProtection(refreshed, expected.map((item) => ({ ...item, storedId: String(idUpdate[item.idColumns[0]] ?? item.storedId ?? "") || undefined })));
  const remainingErrors = checks.filter((item) => item.errors.length > 0);
  if (remainingErrors.length > 0) {
    const error = remainingErrors.map((item) => `${item.label}:${item.errors.join("+")}`).join(",");
    await supabase.from("execution_orders").update({ ...idUpdate, status: "protection_failed", protection_status: "protection_failed", native_protection_verified: false, latest_protection_error: `protection_repair_verification_failed: ${error}`, protection_critical_reason: "binance_position_exists_without_verified_sl_tp1_tp2", last_monitor_action: "protection_watchdog_repair_failed", repair_attempts: Number(row.repair_attempts ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", row.id);
    try {
      await upsertTradeManagementTruth(supabase, {
        p_execution_order_id: row.id,
        p_provider: "binance",
        p_environment: "testnet",
        p_symbol: row.symbol,
        p_direction: row.direction,
        p_status: "protection_failed",
        p_protection_status: "protection_failed",
        p_sl_present: checks.every((c) => c.label !== "sl" || c.errors.length === 0),
        p_tp1_present: !expected.some((e) => e.label === "tp1") || checks.every((c) => c.label !== "tp1" || c.errors.length === 0),
        p_tp2_present: checks.every((c) => c.label !== "tp2" || c.errors.length === 0),
        p_entry_price: Number(row.entry_price ?? 0) || null,
        p_mark_price: null,
        p_unrealized_pnl: 0,
        p_quantity: Math.abs(positionAmt) || null,
        p_leverage: Number(row.leverage ?? 0) || null,
        p_sl_price: expected.find((e) => e.label === "sl")?.triggerPrice ?? null,
        p_tp1_price: expected.find((e) => e.label === "tp1")?.triggerPrice ?? null,
        p_tp2_price: expected.find((e) => e.label === "tp2")?.triggerPrice ?? null,
        p_monitor_run_id: runId,
        p_repair_attempts: Number(row.repair_attempts ?? 0) + 1,
        p_recovery_status: "recovery_required",
        p_latest_error: `protection_repair_verification_failed: ${error}`,
        p_last_action_taken: "repair_failed"
      });
    } catch (_e) {
      // non-blocking
    }
    await logEvent(supabase, row, "protection_recovery_failed", `${row.symbol} protection repair submitted but Binance did not confirm all required live conditionals: ${error}`, { created, checks, refreshed }, stats);
    stats.updated += 1;
    return false;
  }

  const now = new Date().toISOString();
  await supabase.from("execution_orders").update({ ...idUpdate, status: row.status === "partially_closed" || row.tp1_filled || row.tp1_closed_at ? "partially_closed" : "protected_native", protection_status: "protected_native", native_protection_verified: true, managed_fallback_active: false, latest_protection_error: "", protection_critical_reason: "", lifecycle_state: row.status === "partially_closed" || row.tp1_filled || row.tp1_closed_at ? "tp1_filled_profit_lock_active" : "protected_native", protected_at: now, last_monitor_action: "protection_recovered", repair_attempts: Number(row.repair_attempts ?? 0) + 1, updated_at: now }).eq("id", row.id);
  try {
    await upsertTradeManagementTruth(supabase, {
      p_execution_order_id: row.id,
      p_provider: "binance",
      p_environment: "testnet",
      p_symbol: row.symbol,
      p_direction: row.direction,
      p_status: row.status === "partially_closed" || row.tp1_filled || row.tp1_closed_at ? "partially_closed" : "protected_native",
      p_protection_status: "protected_native",
      p_sl_present: true,
      p_tp1_present: !expected.some((e) => e.label === "tp1") || checks.every((c) => c.label !== "tp1" || c.errors.length === 0),
      p_tp2_present: checks.every((c) => c.label !== "tp2" || c.errors.length === 0),
      p_entry_price: Number(row.entry_price ?? 0) || null,
      p_mark_price: null,
      p_unrealized_pnl: 0,
      p_quantity: Math.abs(positionAmt) || null,
      p_leverage: Number(row.leverage ?? 0) || null,
      p_sl_price: expected.find((e) => e.label === "sl")?.triggerPrice ?? null,
      p_tp1_price: expected.find((e) => e.label === "tp1")?.triggerPrice ?? null,
      p_tp2_price: expected.find((e) => e.label === "tp2")?.triggerPrice ?? null,
      p_monitor_run_id: runId,
      p_repair_attempts: Number(row.repair_attempts ?? 0) + 1,
      p_recovery_status: "repair_succeeded",
      p_latest_error: null,
      p_last_action_taken: "recreated_protection_orders"
    });
  } catch (_e) {
    // non-blocking
  }
  await logEvent(supabase, row, "protection_recovered", `${row.symbol} protection_recovered: recreated missing Binance conditional components (${Object.keys(created).join(", ")}) and verified every required live SL/TP order.`, { created, checks, refreshed }, stats);
  stats.protected += 1;
  stats.updated += 1;
  return true;
}

async function submitProtectionForRow(
  supabase: SupabaseClient,
  row: Row,
  quantity: number,
  stats: MonitorStats,
): Promise<"protected_native" | "protection_failed"> {
  const rules = await fetchSymbolRules(row.symbol);
  const closeSide = sideToClose(row.direction);
  const sl = n(row.intended_sl) || n(row.stop_loss);
  const tp1Price = n(row.intended_tp1) || n(row.tp1);
  const tp2Price = n(row.intended_tp2) || n(row.tp2);
  const tp1Qty = floorToStep(quantity * 0.5, rules.stepSize, rules.quantityPrecision);
  const tp2Qty = floorToStep(quantity - tp1Qty, rules.stepSize, rules.quantityPrecision);
  const slTrigger = roundToTick(sl, rules.tickSize, rules.pricePrecision);
  const tp1Trigger = roundToTick(tp1Price, rules.tickSize, rules.pricePrecision);
  const tp2Trigger = roundToTick(tp2Price, rules.tickSize, rules.pricePrecision);

  if (!slTrigger || !tp1Trigger || !tp2Trigger || tp1Qty <= 0 || tp2Qty <= 0) {
    throw new Error(`managed_fallback_unavailable: missing_price_levels sl=${sl} tp1=${tp1Price} tp2=${tp2Price} qty=${quantity}`);
  }

  try {
    const [slOrder, tp1Order, tp2Order] = await Promise.all([
      submitAlgoProtectionOrder(row.symbol, closeSide as "BUY" | "SELL", "STOP_MARKET", slTrigger, quantity, "sl"),
      submitAlgoProtectionOrder(row.symbol, closeSide as "BUY" | "SELL", "TAKE_PROFIT_MARKET", tp1Trigger, tp1Qty, "tp1"),
      submitAlgoProtectionOrder(row.symbol, closeSide as "BUY" | "SELL", "TAKE_PROFIT_MARKET", tp2Trigger, tp2Qty, "tp2"),
    ]);
    const verification = await verifyOpenProtectionSet(row, [
      { label: "sl", algoId: slOrder.algoId, side: closeSide, type: "STOP_MARKET", quantity, triggerPrice: slTrigger },
      { label: "tp1", algoId: tp1Order.algoId, side: closeSide, type: "TAKE_PROFIT_MARKET", quantity: tp1Qty, triggerPrice: tp1Trigger },
      { label: "tp2", algoId: tp2Order.algoId, side: closeSide, type: "TAKE_PROFIT_MARKET", quantity: tp2Qty, triggerPrice: tp2Trigger },
    ]);
    if (!verification.verified) throw new Error(`native_protection_verification_failed: ${verification.errors.join(",")}`);
    await supabase.from("execution_orders").update({
      status: "protected_native", bracket_mode: "exchange_native", protection_status: "protected_native",
      sl_order_id: slOrder.algoId, tp1_order_id: tp1Order.algoId, tp2_order_id: tp2Order.algoId,
      sl_algo_id: slOrder.algoId, tp1_algo_id: tp1Order.algoId, tp2_algo_id: tp2Order.algoId,
      sl_client_algo_id: slOrder.clientAlgoId, tp1_client_algo_id: tp1Order.clientAlgoId, tp2_client_algo_id: tp2Order.clientAlgoId,
      binance_sl_order_id: slOrder.algoId, binance_tp1_order_id: tp1Order.algoId, binance_tp2_order_id: tp2Order.algoId,
      native_protection_verified: true, managed_fallback_active: false,
      tp1_quantity: tp1Qty, tp2_quantity: tp2Qty, remaining_quantity: quantity,
      intended_sl: sl, intended_tp1: tp1Price, intended_tp2: tp2Price,
      latest_protection_error: "", tp1_filled: false, sl_moved_to_be: false,
      recovery_status: "healthy", latest_error: null, repair_attempts: Number(row.repair_attempts ?? 0),
      last_action_taken: "initial_protection_placed",
      protected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    await upsertTradeManagementTruth(supabase, {
      p_execution_order_id: row.id,
      p_provider: "binance",
      p_environment: row.environment || "testnet",
      p_symbol: row.symbol,
      p_direction: row.direction,
      p_status: "protected_native",
      p_protection_status: "protected_native",
      p_sl_present: true,
      p_tp1_present: true,
      p_tp2_present: true,
      p_entry_price: Number(row.entry_price ?? 0) || null,
      p_mark_price: null,
      p_unrealized_pnl: 0,
      p_quantity: quantity,
      p_leverage: Number(row.leverage ?? 0) || null,
      p_sl_price: slTrigger,
      p_tp1_price: tp1Trigger,
      p_tp2_price: tp2Trigger,
      p_monitor_run_id: "",
      p_repair_attempts: Number(row.repair_attempts ?? 0),
      p_recovery_status: "healthy",
      p_latest_error: null,
      p_last_action_taken: "initial_protection_placed"
    }).catch((err) => console.error("trade_truth_adapter_upsert_failed", err));
    await logEvent(supabase, row, "protected_native", `Monitor placed native SL/TP: sl=${slTrigger} tp1=${tp1Trigger} tp2=${tp2Trigger} qty=${quantity}`, { slOrder, tp1Order, tp2Order, verification }, stats);
    stats.updated += 1;
    stats.protected += 1;
    return "protected_native";
  } catch (e) {
    const error = e instanceof Error ? e.message : "Native protection failed in monitor";
    await supabase.from("execution_orders").update({
      status: "protection_failed", bracket_mode: "exchange_native", protection_status: "protection_failed",
      native_protection_verified: false, managed_fallback_active: false,
      intended_sl: sl, intended_tp1: tp1Price, intended_tp2: tp2Price,
      tp1_quantity: tp1Qty, tp2_quantity: tp2Qty, remaining_quantity: quantity,
      latest_protection_error: error,
      recovery_status: "recovery_required",
      latest_error: error,
      repair_attempts: Number(row.repair_attempts ?? 0) + 1,
      last_action_taken: "initial_protection_failed",
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    await upsertTradeManagementTruth(supabase, {
      p_execution_order_id: row.id,
      p_provider: "binance",
      p_environment: row.environment || "testnet",
      p_symbol: row.symbol,
      p_direction: row.direction,
      p_status: "protection_failed",
      p_protection_status: "protection_failed",
      p_sl_present: false,
      p_tp1_present: false,
      p_tp2_present: false,
      p_entry_price: Number(row.entry_price ?? 0) || null,
      p_mark_price: null,
      p_unrealized_pnl: 0,
      p_quantity: quantity,
      p_leverage: Number(row.leverage ?? 0) || null,
      p_sl_price: slTrigger,
      p_tp1_price: tp1Trigger,
      p_tp2_price: tp2Trigger,
      p_monitor_run_id: "",
      p_repair_attempts: Number(row.repair_attempts ?? 0) + 1,
      p_recovery_status: "recovery_required",
      p_latest_error: error,
      p_last_action_taken: "initial_protection_failed"
    }).catch((err) => console.error("trade_truth_adapter_upsert_failed", err));
    await logEvent(supabase, row, "protection_recovery_failed", `Monitor protection recovery failed verification: ${error}`, { error }, stats);
    stats.updated += 1;
    stats.unsafe_positions += 1;
    return "protection_failed";
  }
}

function normalizeAlgoStatus(order: BinanceOrder | null | undefined): string {
  return String(order?.algoStatus ?? order?.status ?? "UNKNOWN").toUpperCase();
}

function algoFilled(order: BinanceOrder | null | undefined): boolean {
  return ["FILLED", "TRIGGERED", "FINISHED"].includes(normalizeAlgoStatus(order));
}

function timeStopMinutes(strategyName: unknown, timeframe: unknown): number | null {
  if (typeof strategyName === "number" && Number.isFinite(strategyName) && strategyName > 0) return strategyName;
  const key = `${String(strategyName ?? "").toLowerCase()}:${String(timeframe ?? "").toLowerCase()}`;
  if (key === "microscalper:5m") return 120;
  if (key === "microscalper:15m") return 360;
  if (key === "compressionbreakout:15m") return 720;
  if (key === "compressionbreakout:1h") return 48 * 60;
  if (key === "swingcontinuation:15m") return 1440;
  if (key === "swingcontinuation:1h") return 96 * 60;
  return null;
}

function timeStopDeadline(row: Row): string | null {
  const existing = String(row.expires_at ?? row.time_stop_deadline_at ?? "");
  if (existing) return existing;
  const minutes = timeStopMinutes(row.max_hold_minutes ?? row.strategy_name, row.timeframe);
  const start = String(row.opened_at ?? row.entry_filled_at ?? row.created_at ?? "");
  const ms = start ? new Date(start).getTime() : NaN;
  if (!minutes || !Number.isFinite(ms)) return null;
  return new Date(ms + minutes * 60_000).toISOString();
}

function rowAgeMs(row: Row): number {
  const start = String(row.entry_submitted_at ?? row.protection_submitted_at ?? row.created_at ?? "");
  const ms = start ? new Date(start).getTime() : NaN;
  return Number.isFinite(ms) ? Date.now() - ms : 0;
}

async function cancelRemainingProtection(row: Row, stats: MonitorStats): Promise<string[]> {
  const ids = [row.replacement_sl_algo_id ?? row.replacement_sl_order_id, row.sl_algo_id ?? row.binance_sl_order_id, row.tp1_algo_id ?? row.binance_tp1_order_id, row.tp2_algo_id ?? row.binance_tp2_order_id].filter(Boolean).map(String);
  const cancelled: string[] = [];
  for (const id of ids) {
    try {
      await cancelAlgoOrder(row.symbol, id);
      cancelled.push(id);
      stats.cancelled_orders += 1;
    } catch {
      // Already triggered/cancelled algo orders are safe to ignore during timeout cleanup.
    }
  }
  return cancelled;
}


async function placeAndVerifyProfitLockStop(row: Row, remaining: number, stopPrice: number, oldSlAlgoId: string | null, stats: MonitorStats): Promise<Record<string, unknown>> {
  if (remaining <= 0 || stopPrice <= 0) throw new Error(`invalid_profit_lock_inputs remaining=${remaining} stop=${stopPrice}`);
  const rules = await fetchSymbolRules(row.symbol);
  const qty = floorToStep(remaining, rules.stepSize, rules.quantityPrecision);
  const trigger = roundToTick(stopPrice, rules.tickSize, rules.pricePrecision);
  if (qty <= 0 || trigger <= 0) throw new Error(`invalid_profit_lock_rounded qty=${qty} trigger=${trigger}`);

  const replacement = await submitAlgoProtectionOrder(row.symbol, sideToClose(row.direction), "STOP_MARKET", trigger, qty, "plsl");
  let verified = false;
  let verifiedOrder: BinanceOrder | null = null;
  try {
    verifiedOrder = await binanceRequest("/fapi/v1/algoOrder", { symbol: row.symbol, algoId: replacement.algoId }) as BinanceOrder;
    verified = ["NEW", "PENDING", "TRIGGERING", "TRIGGERED"].includes(normalizeAlgoStatus(verifiedOrder));
  } catch (err) {
    addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: `profit_lock_verify_warning: ${errorMessage(err)}`, action: "profit_lock_verify_retry_next_monitor", source: "order_lookup" });
  }
  if (!verified) throw new Error(`replacement_sl_not_verified algoId=${replacement.algoId}`);

  let oldCancelled = false;
  if (oldSlAlgoId) {
    try {
      await cancelAlgoOrder(row.symbol, oldSlAlgoId);
      oldCancelled = true;
      stats.cancelled_orders += 1;
    } catch (err) {
      addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: `old_sl_cancel_after_profit_lock_warning: ${errorMessage(err)}`, action: "old_sl_cancel_retry_next_monitor", source: "cleanup" });
    }
  }

  return {
    replacement_sl_order_id: replacement.algoId,
    replacement_sl_algo_id: replacement.algoId,
    replacement_sl_client_algo_id: replacement.clientAlgoId,
    replacement_sl_verified: true,
    old_sl_cancelled_after_tp1: oldCancelled,
    sl_replaced_after_tp1: true,
    profit_lock_sl_active: true,
    profit_lock_status: "active",
    protection_status: "protected_native",
    protection_warning_reason: oldSlAlgoId && !oldCancelled ? "old_sl_cancel_retry_needed" : "",
    protection_critical_reason: "",
    protection_status_detail: verifiedOrder,
  };
}

async function closeReduceOnly(row: Row, quantity: number, reason: string) {
  if (quantity <= 0) return null;
  return await binanceRequest("/fapi/v1/order", {
    symbol: row.symbol,
    side: sideToClose(row.direction),
    type: "MARKET",
    quantity: String(quantity),
    reduceOnly: "true",
    newClientOrderId: `hb_${reason}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
  }, "POST");
}

async function cancelEntryOrder(symbol: string, orderId: string) {
  await binanceRequest("/fapi/v1/order", { symbol, orderId }, "DELETE");
}

async function cancelOpenOrder(symbol: string, order: BinanceOrder) {
  if (order.algoId) {
    await cancelAlgoOrder(symbol, String(order.algoId));
    return { cancelled_algo_id: String(order.algoId) };
  }
  if (order.orderId) return await binanceRequest("/fapi/v1/order", { symbol, orderId: String(order.orderId) }, "DELETE");
  return { skipped: true, reason: "missing_order_identity" };
}

async function cancelOpenConditionalsForRow(row: Row, openOrders: BinanceOrder[], stats: MonitorStats): Promise<Array<string | number | undefined>> {
  const cancelled: Array<string | number | undefined> = [];
  for (const order of openOrders) {
    try {
      await cancelOpenOrder(row.symbol, order);
      cancelled.push(order.algoId ?? order.orderId);
      stats.cancelled_orders += 1;
    } catch {
      // Stale cleanup retry is handled on the next monitor run.
    }
  }
  return cancelled;
}

async function fetchEntryOrder(symbol: string, orderId: string): Promise<{ order: BinanceOrder | null; warning?: string }> {
  if (!orderId) return { order: null };
  try {
    return { order: await binanceRequest("/fapi/v1/order", { symbol, orderId }) as BinanceOrder };
  } catch (err) {
    if (isBinanceOrderNotFound(err)) return { order: null, warning: `stale_order_lookup_missing: ${errorMessage(err)}` };
    throw err;
  }
}

async function protectOrSafetyClose(supabase: SupabaseClient, row: Row, quantity: number, stats: MonitorStats, reason: string): Promise<"protected_native" | "protection_failed" | "closed_unprotected_safety"> {
  try {
    return await submitProtectionForRow(supabase, row, quantity, stats);
  } catch (err) {
    const error = err instanceof Error ? err.message : "protection unavailable";
    let closeResult: unknown = null;
    try {
      closeResult = await closeReduceOnly(row, quantity, "safety");
    } catch (closeErr) {
      const critical = `safety_close_failed: ${errorMessage(closeErr)}; protection_error=${error}`;
      addCriticalMonitorError(stats, critical);
      stats.unsafe_positions += 1;
      throw new Error(critical);
    }
    await supabase.from("execution_orders").update({
      status: "closed_unprotected_safety",
      protection_status: "unprotected_failed",
      native_protection_verified: false,
      managed_fallback_active: false,
      latest_protection_error: `safety_close: ${reason}: ${error}`,
      remaining_quantity: 0,
      sl_closed_at: new Date().toISOString(),
      last_monitor_action: "closed_unprotected_safety",
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    await logEvent(supabase, row, "closed_unprotected_safety", `${row.symbol} safety-closed reduce-only because protection could not be established: ${error}`, { quantity, reason, closeResult }, stats);
    stats.reduce_only_orders += closeResult ? 1 : 0;
    stats.safety_closed += 1;
    stats.updated += 1;
    return "closed_unprotected_safety";
  }
}

async function monitorRow(supabase: SupabaseClient, row: Row, stats: MonitorStats, settings: MonitorSettings, runId: string) {
  stats.checked += 1;
  const [positionBody, openOrdersBody, openAlgoOrdersBody] = await Promise.all([
    binanceRequest("/fapi/v2/positionRisk", { symbol: row.symbol }),
    binanceRequest("/fapi/v1/openOrders", { symbol: row.symbol }),
    binanceRequest("/fapi/v1/openAlgoOrders", { symbol: row.symbol, algoType: "CONDITIONAL" }).catch(() => []),
  ]);
  const position = (Array.isArray(positionBody) ? positionBody : []).find((p: BinancePosition) => p.symbol === row.symbol) as BinancePosition | undefined;
  const regularOpenOrders = (Array.isArray(openOrdersBody) ? openOrdersBody : []) as BinanceOrder[];
  const openAlgoOrders = parseOpenAlgoOrders(openAlgoOrdersBody);
  const openOrders = [...regularOpenOrders, ...openAlgoOrders];
  const positionAmt = n(position?.positionAmt);
  const markPrice = n(position?.markPrice);
  const unrealizedPnl = n(position?.unRealizedProfit ?? position?.unrealizedProfit);
  const hasPosition = Math.abs(positionAmt) > 0;
  const hasOpenOrders = openOrders.length > 0;
  const now = new Date().toISOString();
  const deadline = timeStopDeadline(row);
  const maxHoldMinutes = row.max_hold_minutes ?? timeStopMinutes(row.strategy_name, row.timeframe);
  const mode = profitLockMode(settings);
  const update: Record<string, unknown> = { current_position_size: positionAmt, latest_mark_price: markPrice, latest_unrealized_pnl: unrealizedPnl, latest_sync_at: now, last_monitor_checked_at: now, last_monitor_action: "synced", ...profitLockStudyUpdate(row, markPrice, unrealizedPnl, hasPosition, mode, stats) };
  if (deadline) { update.expires_at = deadline; update.time_stop_deadline_at = deadline; }
  if (maxHoldMinutes) update.max_hold_minutes = maxHoldMinutes;

  if (deadline && Date.now() >= new Date(deadline).getTime() && ACTIVE_STATUSES.includes(row.status)) {
    const afterTp1 = Boolean(row.tp1_filled || row.tp1_closed_at || row.runner_active);
    const remaining = n(row.remaining_quantity) || n(row.remaining_qty) || n(row.volume) || Math.abs(positionAmt);
    const closeResult = hasPosition && remaining > 0 ? await closeReduceOnly(row, remaining, "timeout") : null;
    const cancelled = [...await cancelRemainingProtection(row, stats), ...await cancelOpenConditionalsForRow(row, openOrders, stats)];
    Object.assign(update, { status: afterTp1 ? "closed_expired_after_tp1" : "closed_expired", protection_status: "unprotected", native_protection_verified: false, managed_fallback_active: false, timeout_closed_at: now, runner_expired: afterTp1, runner_closed: true, runner_active: false, remaining_quantity: 0, remaining_qty: 0, cleanup_status: "cleanup_verified_or_retry", cleanup_checked_at: now, expiry_reason: row.expiry_reason ?? "strategy_time_stop_expired", lifecycle_state: afterTp1 ? "closed_expired_after_tp1" : "closed_expired", last_monitor_action: afterTp1 ? "runner_expired_after_tp1_closed" : "position_expired_closed" });
    await supabase.from("execution_orders").update(update).eq("id", row.id);
    stats.reduce_only_orders += closeResult ? 1 : 0;
    stats.last_managed_action = { symbol: row.symbol, action: afterTp1 ? "runner_timeout" : "timeout", quantity: remaining, order: closeResult, cancelled, at: now, deadline };
    await logEvent(supabase, row, afterTp1 ? "runner_expired_after_tp1" : "position_expired_closed", afterTp1 ? `${row.symbol} runner expired after TP1; TP1 was secured, remaining position closed, cleanup completed.` : `${row.symbol} position expired before TP1; closed full Binance position and cleaned TP/SL conditionals.`, { markPrice, remaining, deadline, cancelled, closeResult }, stats);
    stats.updated += 1;
    return;
  }

  const entryId = row.binance_entry_order_id ? String(row.binance_entry_order_id) : row.entry_order_id ? String(row.entry_order_id) : "";
  const entryLookup = entryId ? await fetchEntryOrder(row.symbol, entryId) : { order: null };
  if (entryLookup.warning) addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: entryLookup.warning, action: "entry_order_lookup_missing_continue", source: "order_lookup" });
  const entry = entryLookup.order;
  const entryStatus = String(entry?.status ?? "").toUpperCase();
  const isEntryPendingRow = ["pending", "entry_submitted"].includes(row.status);

  if (isEntryPendingRow) {
    const entryFilled = entryStatus === "FILLED" || hasPosition;
    if (entryFilled) {
      const avg = n(entry?.avgPrice) || markPrice || n(row.entry_price);
      const qty = Math.abs(positionAmt) || n(entry?.executedQty) || n(row.quantity) || n(row.volume);
      const filledRow = { ...row, status: "entry_filled", entry_price: avg || row.entry_price } as Row;
      await supabase.from("execution_orders").update({ ...update, status: "entry_filled", protection_status: "pending_protection", native_protection_verified: false, managed_fallback_active: false, entry_price: avg || row.entry_price, entry_filled_at: now, remaining_quantity: qty, last_monitor_action: "entry_filled_submit_protection" }).eq("id", row.id);
      await logEvent(supabase, row, "entry_filled", `${row.symbol} entry filled${avg > 0 ? ` at ${avg}` : ""}; submitting protection immediately.`, { entry, qty, positionAmt }, stats);
      stats.updated += 1;
      await protectOrSafetyClose(supabase, filledRow, qty, stats, "entry_filled_submit_protection");
      return;
    }

    if (row.status === "entry_submitted" && rowAgeMs(row) >= 2 * 60_000) {
      let cancelled = false;
      if (entryId && (!entry || ENTRY_OPEN_STATUSES.includes(entryStatus))) {
        try {
          await cancelEntryOrder(row.symbol, entryId);
          cancelled = true;
          stats.cancelled_orders += 1;
        } catch (err) {
          await logEvent(supabase, row, "entry_cancel_failed", `${row.symbol} entry timeout cancel failed: ${err instanceof Error ? err.message : "unknown error"}`, { entryId, entry }, stats);
        }
      }
      Object.assign(update, { status: "entry_timeout_cancelled", protection_status: "unprotected", native_protection_verified: false, managed_fallback_active: false, remaining_quantity: 0, stale_cleanup_reason: "entry_submitted_timeout_no_fill", stale_checked_at: now, last_monitor_action: "entry_timeout_cancelled" });
      await supabase.from("execution_orders").update(update).eq("id", row.id);
      await logEvent(supabase, row, "entry_timeout_cancelled", `${row.symbol} entry was not filled within 2 minutes; ${cancelled ? "cancelled open entry order" : "marked timed out with no Binance position"}.`, { entryId, entry, cancelled }, stats);
      stats.updated += 1;
      return;
    }

    if (!entry && !hasPosition) {
      Object.assign(update, { status: "entry_missing_no_position", protection_status: "unprotected", native_protection_verified: false, managed_fallback_active: false, remaining_quantity: 0, stale_cleanup_reason: "entry_order_not_found_no_position", stale_checked_at: now, last_monitor_action: "entry_missing_no_position" });
      await supabase.from("execution_orders").update(update).eq("id", row.id);
      await logEvent(supabase, row, "entry_missing_no_position", `${row.symbol} entry order was not found and Binance has no position.`, { entryId }, stats);
      stats.updated += 1;
      stats.stale_cleaned += 1;
      return;
    }
  }

  if (ACTIVE_STATUSES.includes(row.status) && !hasPosition && !hasOpenOrders) {
    const syncedStatus = syncedNoPositionStatus(row);
    Object.assign(update, { status: syncedStatus, protection_status: "unprotected", native_protection_verified: false, managed_fallback_active: false, remaining_quantity: 0, stale_cleanup_reason: "binance_truth_no_position_no_orders", stale_checked_at: now, last_monitor_action: syncedStatus });
    await supabase.from("execution_orders").update(update).eq("id", row.id);
    await logEvent(supabase, row, syncedStatus, `${row.symbol} synced closed: Binance has no position and no open orders.`, { positionAmt, open_orders: 0 }, stats);
    stats.updated += 1;
    stats.stale_cleaned += 1;
    if (syncedStatus === "closed_manual") stats.closed_synced += 1; else stats.stale_closed += 1;
    return;
  }


  const orderStatus: Record<string, BinanceOrder> = {};
  if (entryId && entry) orderStatus[entryId] = entry;
  const algoIds = [row.replacement_sl_algo_id ?? row.replacement_sl_order_id, row.sl_algo_id ?? row.binance_sl_order_id, row.tp1_algo_id ?? row.binance_tp1_order_id, row.tp2_algo_id ?? row.binance_tp2_order_id].filter(Boolean).map(String);
  for (const algoId of algoIds) {
    try {
      orderStatus[algoId] = await binanceRequest("/fapi/v1/algoOrder", { symbol: row.symbol, algoId }) as BinanceOrder;
    } catch (err) {
      if (isBinanceOrderNotFound(err)) {
        addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: `stale_algo_order_lookup_missing: ${errorMessage(err)}`, action: "algo_order_lookup_missing_continue", source: "order_lookup" });
      }
      // Legacy long clientAlgoId rows may refer to invalid/missing algo orders; protection recovery below regenerates short IDs or falls back managed.
    }
  }

  if (entry && TERMINAL_ORDER_STATUSES.includes(entryStatus) && isEntryPendingRow) {
    update.status = "cancelled";
    await logEvent(supabase, row, "entry_cancelled", `${row.symbol} entry order ${entryStatus}.`, { entry }, stats);
  } else if (entryStatus === "REJECTED" && isEntryPendingRow) {
    update.status = "failed";
    await logEvent(supabase, row, "entry_failed", `${row.symbol} entry order rejected.`, { entry }, stats);
  }

  if (row.bracket_mode === "exchange_native") {
    const tp1AlgoId = row.tp1_algo_id ?? row.binance_tp1_order_id;
    const tp2AlgoId = row.tp2_algo_id ?? row.binance_tp2_order_id;
    const slAlgoId = row.sl_algo_id ?? row.binance_sl_order_id;
    const tp1 = tp1AlgoId ? orderStatus[String(tp1AlgoId)] : null;
    const tp2 = tp2AlgoId ? orderStatus[String(tp2AlgoId)] : null;
    const sl = slAlgoId ? orderStatus[String(slAlgoId)] : null;
    if (!row.tp1_closed_at && !row.tp1_filled && algoFilled(tp1)) {
      const fillTime = orderFillTime(tp1, now);
      const fillPrice = orderFillPrice(tp1, n(row.intended_tp1) || markPrice);
      const filledQty = n(tp1?.executedQty) || n(row.tp1_quantity) || Math.max((n(row.volume) || Math.abs(positionAmt) * 2) - Math.abs(positionAmt), 0);
      const remaining = Math.abs(positionAmt) || Math.max((n(row.volume) || n(row.remaining_quantity) + filledQty) - filledQty, 0);
      const originalSl = n(row.original_sl_price) || n(row.intended_sl) || n(row.stop_loss);
      const entryPrice = n(row.entry_price);
      const replacementSl = calculateProfitLockPrice(row.direction, entryPrice, originalSl, 0.3);
      let replacementUpdate: Record<string, unknown> = mode === "testnet_action" ? {
        protection_status: slAlgoId ? "protection_degraded" : "unprotected_failed",
        profit_lock_status: "replacement_failed_existing_sl_preserved",
        replacement_sl_verified: false,
        old_sl_cancelled_after_tp1: false,
        sl_replaced_after_tp1: false,
        profit_lock_sl_active: false,
        protection_critical_reason: slAlgoId ? "profit_lock_replacement_failed_existing_sl_preserved" : "replacement_sl_not_created",
        protection_warning_reason: slAlgoId ? "existing_sl_preserved_profit_lock_retry_needed" : "",
        last_monitor_action: slAlgoId ? "tp1_profit_lock_replacement_failed_existing_sl_preserved" : "tp1_profit_lock_replacement_failed_unprotected",
      } : { profit_lock_status: "study_only", profit_lock_sl_active: false, replacement_sl_verified: false, old_sl_cancelled_after_tp1: false, sl_replaced_after_tp1: false, last_monitor_action: "tp1_profit_lock_study_only" };
      /* config gate proof: mode !== "testnet_action" */
      if (mode === "testnet_action") {
        try {
          replacementUpdate = await placeAndVerifyProfitLockStop(row, remaining, replacementSl, slAlgoId ? String(slAlgoId) : null, stats);
          stats.profit_lock_study.actions_taken += 1;
        } catch (err) {
          const replacementError = `profit_lock_replacement_failed: ${errorMessage(err)}`;
          if (slAlgoId) addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: `${replacementError}; existing_sl_preserved=${String(slAlgoId)}`, action: "profit_lock_retry_next_monitor_existing_sl_preserved", source: "cleanup" });
          else addCriticalMonitorError(stats, replacementError);
          update.latest_protection_error = `profit_lock_replacement_failed: ${errorMessage(err)}`;
        }
      }
      Object.assign(update, { status: "partially_closed", lifecycle_state: replacementUpdate.sl_replaced_after_tp1 ? "tp1_filled_profit_lock_active" : mode === "testnet_action" ? "tp1_filled_profit_lock_degraded" : "tp1_filled_profit_lock_study_only", tp1_filled: true, tp1_closed_at: fillTime, tp1_fill_time: fillTime, tp1_fill_price: fillPrice, partial_close_qty: filledQty, remaining_quantity: remaining, remaining_qty: remaining, runner_active: remaining > 0, tp2_pending: true, profit_lock_enabled: true, profit_lock_r: 0.3, profit_lock_price: replacementSl, original_sl_price: originalSl, replacement_sl_price: replacementSl, sl_moved_to_be: false, last_monitor_action: replacementUpdate.last_monitor_action ?? "tp1_profit_lock_replaced" }, replacementUpdate);
      await logEvent(supabase, row, "tp1_profit_lock_active", `${row.symbol} TP1 hit — profit lock +0.3R active for remaining runner.`, { tp1, fillPrice, filledQty, remaining, replacementSl, replacementUpdate }, stats);
    }
    if (!row.tp2_closed_at && algoFilled(tp2)) {
      if (hasPosition) {
        Object.assign(update, { lifecycle_state: "binance_truth_guard_position_open_after_tp2", latest_sync_error: "TP2 fill observed but Binance position still open", last_monitor_action: "binance_truth_guard_tp2_fill_position_still_open" });
        await logEvent(supabase, row, "binance_truth_guard", `${row.symbol} TP2 fill observed but Binance position is still open; execution will not be closed until Binance confirms flat position.`, { tp2, positionAmt }, stats);
      } else {
        Object.assign(update, { status: "closed_tp2", lifecycle_state: "closed_tp2", tp2_closed_at: now, tp2_filled: true, runner_closed: true, runner_active: false, remaining_quantity: 0, remaining_qty: 0, last_monitor_action: "closed_tp2_cleanup" });
        const cancelled = [...await cancelRemainingProtection(row, stats), ...await cancelOpenConditionalsForRow(row, openOrders, stats)];
        update.cleanup_status = "cleanup_verified_or_retry";
        update.cleanup_checked_at = now;
        await logEvent(supabase, row, "native_tp2_filled", `${row.symbol} TP2 hit — trade closed; remaining SL/profit-lock conditionals cleaned.`, { tp2, cancelled }, stats);
      }
    }
    if (!row.sl_closed_at && algoFilled(sl)) {
      const profitLockHit = Boolean(row.tp1_filled || row.tp1_closed_at || row.sl_replaced_after_tp1 || row.profit_lock_sl_active);
      Object.assign(update, { status: profitLockHit ? "closed_profit_lock" : "closed_sl", lifecycle_state: profitLockHit ? "closed_profit_lock" : "closed_sl", sl_closed_at: orderFillTime(sl, now), profit_lock_sl_hit: profitLockHit, runner_closed: true, runner_active: false, remaining_quantity: 0, remaining_qty: 0, last_monitor_action: profitLockHit ? "closed_profit_lock_cleanup" : "closed_sl_cleanup" });
      const cancelled = [...await cancelRemainingProtection(row, stats), ...await cancelOpenConditionalsForRow(row, openOrders, stats)];
      update.cleanup_status = "cleanup_verified_or_retry";
      update.cleanup_checked_at = now;
      await logEvent(supabase, row, profitLockHit ? "profit_lock_sl_filled" : "native_sl_filled", profitLockHit ? `${row.symbol} profit-lock stop hit — trade closed with protected profit; TP2 cleaned.` : `${row.symbol} original SL hit before TP1 — trade closed; TP orders cleaned.`, { sl, cancelled }, stats);
    }
  }

  if (!update.status && !isEntryPendingRow && ACTIVE_STATUSES.includes(row.status) && !hasPosition && hasOpenOrders) {
    const cancelled = await cancelOpenConditionalsForRow(row, openOrders, stats)
    const syncedStatus = syncedNoPositionStatus(row);
    Object.assign(update, { status: syncedStatus, protection_status: "unprotected", native_protection_verified: false, managed_fallback_active: false, remaining_quantity: 0, remaining_qty: 0, cleanup_status: "cleanup_verified_or_retry", cleanup_checked_at: now, stale_cleanup_reason: "position_closed_leftover_orders_cancelled", stale_checked_at: now, last_monitor_action: "orphan_protection_orders_cancelled" });
    await supabase.from("execution_orders").update(update).eq("id", row.id);
    await logEvent(supabase, row, syncedStatus, `${row.symbol} position is closed on Binance; cancelled leftover SL/TP/open orders and synced DB closed.`, { cancelled }, stats);
    stats.updated += 1;
    stats.stale_cleaned += 1;
    if (syncedStatus === "closed_manual") stats.closed_synced += 1; else stats.stale_closed += 1;
    return;
  }


  let nativeWatchdogRan = false;
  let nativeWatchdogVerified = false;
  if (!update.status && hasPosition && ACTIVE_STATUSES.includes(row.status) && (row.bracket_mode === "exchange_native" || row.protection_status === "protected_native" || row.protection_status === "protection_failed" || row.protection_status === "pending_protection" || row.protection_status === "protection_pending")) {
    nativeWatchdogRan = true;
    nativeWatchdogVerified = await repairNativeProtectionSet(supabase, row, positionAmt, openOrders, stats, runId);
  }

  const protectionStatus = nativeWatchdogVerified ? "protected_native" : String(row.protection_status ?? "");
  const isProtected = ["protected", "protected_native", "protected_managed"].includes(protectionStatus);
  if (!nativeWatchdogRan && hasPosition && !isProtected && ["entry_filled", "protected", "protected_native", "protected_managed", "partially_closed"].includes(row.status)) {
    await logEvent(supabase, row, "unprotected_recovery_attempt", `${row.symbol} unsafe_untracked_position: open Binance position without protection — attempting recovery.`, { positionAmt, protection_status: protectionStatus }, stats);
    const qty = Math.abs(positionAmt) > 0 ? Math.abs(positionAmt) : n(row.quantity) || n(row.volume);
    const recovered = await protectOrSafetyClose(supabase, row, qty, stats, "protection_pending_recovery");
    if (recovered === "closed_unprotected_safety") return;
    Object.assign(update, { protection_status: recovered, last_monitor_action: `recovery_${recovered}` });
  }

  if (row.bracket_mode === "managed_exit_fallback" || row.protection_status === "protected_managed") {
    const remaining = n(row.remaining_quantity) || n(row.volume) || Math.abs(positionAmt);
    const tp1Qty = n(row.tp1_quantity) || (remaining / 2);
    const activeStop = (row.profit_lock_sl_active || row.tp1_filled || row.tp1_closed_at) ? (n(row.replacement_sl_price) || calculateProfitLockPrice(row.direction, n(row.entry_price), n(row.original_sl_price) || n(row.intended_sl), n(row.profit_lock_r) || 0.3)) : n(row.intended_sl);
    if (!row.tp1_closed_at && n(row.intended_tp1) > 0 && targetHit(row.direction, markPrice, n(row.intended_tp1))) {
      const qty = Math.min(tp1Qty, remaining);
      const closeResult = await closeReduceOnly(row, qty, "tp1");
      const nextRemaining = Math.max(remaining - qty, 0);
      const originalSl = n(row.original_sl_price) || n(row.intended_sl) || n(row.stop_loss);
      const replacementSl = calculateProfitLockPrice(row.direction, n(row.entry_price), originalSl, 0.3);
      Object.assign(update, { status: "partially_closed", lifecycle_state: mode === "testnet_action" ? "tp1_filled_profit_lock_active" : "tp1_filled_profit_lock_study_only", tp1_filled: true, tp1_closed_at: now, tp1_fill_time: now, tp1_fill_price: markPrice, partial_close_qty: qty, remaining_quantity: nextRemaining, remaining_qty: nextRemaining, runner_active: nextRemaining > 0, tp2_pending: true, profit_lock_enabled: true, profit_lock_r: 0.3, profit_lock_price: replacementSl, original_sl_price: originalSl, replacement_sl_price: replacementSl, profit_lock_status: mode === "testnet_action" ? "managed_active" : "study_only", profit_lock_sl_active: mode === "testnet_action", sl_moved_to_be: false, last_monitor_action: mode === "testnet_action" ? "managed_tp1_profit_lock_active" : "managed_tp1_profit_lock_study_only" });
      stats.reduce_only_orders += 1;
      stats.last_managed_action = { symbol: row.symbol, action: "tp1", quantity: qty, order: closeResult, at: now };
      await logEvent(supabase, row, "tp1_profit_lock_active", `${row.symbol} managed TP1 hit; closed partial reduce-only and activated +0.3R profit lock for runner.`, { markPrice, qty }, stats);
    } else if (n(row.intended_tp2) > 0 && targetHit(row.direction, markPrice, n(row.intended_tp2))) {
      const closeResult = await closeReduceOnly(row, remaining, "tp2");
      Object.assign(update, { status: "closed_tp2", lifecycle_state: "closed_tp2", tp2_closed_at: now, tp2_filled: true, runner_closed: true, runner_active: false, remaining_quantity: 0, remaining_qty: 0, last_monitor_action: "closed_tp2_cleanup" });
      stats.reduce_only_orders += 1;
      stats.last_managed_action = { symbol: row.symbol, action: "tp2", quantity: remaining, order: closeResult, at: now };
      const cancelled = [...await cancelRemainingProtection(row, stats), ...await cancelOpenConditionalsForRow(row, openOrders, stats)];
      update.cleanup_status = "cleanup_verified_or_retry";
      update.cleanup_checked_at = now;
      await logEvent(supabase, row, "managed_tp2_closed", `${row.symbol} managed TP2 hit; closed remaining reduce-only and cleaned conditionals.`, { markPrice, remaining, cancelled }, stats);
    } else if (activeStop > 0 && stopHit(row.direction, markPrice, activeStop)) {
      const closeResult = await closeReduceOnly(row, remaining, "sl");
      const profitLockHit = Boolean(row.tp1_filled || row.tp1_closed_at || row.profit_lock_sl_active || row.sl_replaced_after_tp1);
      Object.assign(update, { status: profitLockHit ? "closed_profit_lock" : "closed_sl", lifecycle_state: profitLockHit ? "closed_profit_lock" : "closed_sl", sl_closed_at: now, profit_lock_sl_hit: profitLockHit, runner_closed: true, runner_active: false, remaining_quantity: 0, remaining_qty: 0, last_monitor_action: profitLockHit ? "managed_profit_lock_closed" : "managed_sl_closed" });
      stats.reduce_only_orders += 1;
      stats.last_managed_action = { symbol: row.symbol, action: "sl", quantity: remaining, order: closeResult, at: now };
      const cancelled = [...await cancelRemainingProtection(row, stats), ...await cancelOpenConditionalsForRow(row, openOrders, stats)];
      update.cleanup_status = "cleanup_verified_or_retry";
      update.cleanup_checked_at = now;
      await logEvent(supabase, row, profitLockHit ? "profit_lock_sl_filled" : "managed_sl_closed", profitLockHit ? `${row.symbol} profit-lock stop hit — trade closed with protected profit.` : `${row.symbol} managed original SL hit; closed remaining reduce-only and cleaned conditionals.`, { markPrice, remaining, activeStop, cancelled }, stats);
    }
  }

  if (Object.keys(update).length > 4 || update.current_position_size !== undefined) {
    const { error } = await supabase.from("execution_orders").update(update).eq("id", row.id);
    if (error) throw error;
    stats.updated += 1;
  }
}

async function reconcileBinanceTruthGaps(supabase: SupabaseClient, stats: MonitorStats, scopeKey: string) {
  const [positionsBody, allOrdersBody, allAlgoOrdersBody, dbRows] = await Promise.all([
    binanceRequest("/fapi/v2/positionRisk", {}),
    binanceRequest("/fapi/v1/openOrders", {}),
    binanceRequest("/fapi/v1/openAlgoOrders", { algoType: "CONDITIONAL" }).catch((err) => {
      addMonitorWarning(stats, { warning: `open_algo_orders_reconcile_warning: ${errorMessage(err)}`, action: "open_algo_orders_reconcile_continue", source: "account_sync" });
      return [];
    }),
    supabase.from("execution_orders").select("*").eq("execution_scope_key", scopeKey).eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").order("created_at", { ascending: false }).limit(500),
  ]);
  if (dbRows.error) throw dbRows.error;
  const rows = (dbRows.data ?? []) as Row[];
  const openPositions = (Array.isArray(positionsBody) ? positionsBody : []).filter((p: BinancePosition) => Math.abs(n(p.positionAmt)) > 0) as BinancePosition[];
  const openOrders = [...(Array.isArray(allOrdersBody) ? allOrdersBody : []) as BinanceOrder[], ...parseOpenAlgoOrders(allAlgoOrdersBody)];
  const classifications: Record<string, Record<string, unknown>> = {};
  const cleanupEvents: Array<Record<string, unknown>> = [];
  const rowsBySymbol = new Map<string, Row[]>();
  for (const row of rows) {
    const list = rowsBySymbol.get(row.symbol) ?? [];
    list.push(row);
    rowsBySymbol.set(row.symbol, list);
  }

  for (const position of openPositions) {
    const symbol = String(position.symbol ?? "");
    if (!symbol) continue;
    const symbolRows = rowsBySymbol.get(symbol) ?? [];
    const active = symbolRows.find((row) => ACTIVE_STATUSES.includes(row.status));
    const protectedActive = active && ["protected", "protected_native", "protected_managed"].includes(String(active.protection_status ?? ""));
    if (protectedActive) continue;
    const target = active ?? symbolRows[0];
    if (!target) {
      addCriticalMonitorError(stats, `unsafe_untracked_position: ${symbol} open on Binance with no execution row`);
      stats.unsafe_positions += 1;
      addMonitorWarning(stats, { symbol, warning: "unsafe_untracked_position", action: "manual_row_recovery_required", source: "account_sync" });
      continue;
    }
    const now = new Date().toISOString();
    await supabase.from("execution_orders").update({
      status: "entry_filled",
      lifecycle_state: "unsafe_untracked_position",
      protection_status: "unprotected_failed",
      current_position_size: n(position.positionAmt),
      latest_mark_price: n(position.markPrice),
      latest_unrealized_pnl: n(position.unRealizedProfit ?? position.unrealizedProfit),
      latest_sync_at: now,
      last_monitor_checked_at: now,
      last_monitor_action: "unsafe_untracked_position_recovered_from_binance",
      latest_monitor_error: "unsafe_untracked_position",
      latest_sync_error: "",
      protection_critical_reason: "binance_position_exists_without_verified_protection",
      updated_at: now,
    }).eq("id", target.id);
    await logEvent(supabase, target, "unsafe_untracked_position", `${symbol} Binance position exists while DB was ${target.status}; Binance wins and row was recovered for protection handling.`, { position }, stats);
    stats.unsafe_positions += 1;
    stats.updated += 1;
  }

  const openPositionSymbols = new Set(openPositions.map((p) => String(p.symbol ?? "")));
  const ordersBySymbol = new Map<string, BinanceOrder[]>();
  for (const order of openOrders) {
    const symbol = String(order.symbol ?? "");
    if (!symbol) continue;
    const list = ordersBySymbol.get(symbol) ?? [];
    list.push(order);
    ordersBySymbol.set(symbol, list);
  }
  const allSymbols = new Set<string>([...openPositionSymbols, ...ordersBySymbol.keys(), ...rowsBySymbol.keys()]);
  for (const symbol of allSymbols) {
    const symbolRows = rowsBySymbol.get(symbol) ?? [];
    const active = symbolRows.find((row) => ACTIVE_STATUSES.includes(row.status));
    const orders = ordersBySymbol.get(symbol) ?? [];
    const position = openPositions.find((p) => String(p.symbol ?? "") === symbol);
    const expected = active && position ? expectedNativeProtection(active, n(position.positionAmt)) : [];
    const checks = expected.length > 0 ? checkNativeProtection(orders, expected) : [];
    const matchedLabels = new Set(checks.filter((check) => check.errors.length === 0).map((check) => check.label));
    const hasOnlyOrdersNoPosition = orders.length > 0 && !position;
    const missingProtection = Boolean(position && active && !matchedLabels.has("sl"));
    const duplicateCount = Math.max(0, active && checks.every((check) => check.errors.length === 0) ? activeConditionalOrders(orders).length - checks.length : 0);
    classifications[symbol] = {
      symbol,
      matched_position: Boolean(position && active),
      matched_entry: Boolean(active?.binance_entry_order_id || active?.entry_order_id),
      matched_sl: matchedLabels.has("sl"),
      matched_tp1: matchedLabels.has("tp1"),
      matched_tp2: matchedLabels.has("tp2"),
      duplicate_conditional: duplicateCount,
      stale_conditional: hasOnlyOrdersNoPosition ? orders.length : 0,
      orphan_binance_order: !active && orders.length > 0 ? orders.length : 0,
      orphan_local_order: Boolean(active && !position && orders.length === 0),
      missing_protection: missingProtection,
      unmanaged_external_order: Boolean(!active && (position || orders.length > 0)),
      closed_but_orders_remain: hasOnlyOrdersNoPosition,
      safe_to_cancel: hasOnlyOrdersNoPosition || duplicateCount > 0,
      unsafe_to_cancel: Boolean(position && missingProtection),
      position: position ? { symbol, side: n(position.positionAmt) > 0 ? "LONG" : "SHORT", quantity: Math.abs(n(position.positionAmt)), entry_price: n((position as Record<string, unknown>).entryPrice), mark_price: n(position.markPrice), update_time: (position as Record<string, unknown>).updateTime ?? null } : null,
      orders: orders.map((order) => ({ symbol, side: order.side ?? null, quantity: n(order.origQty ?? order.quantity), order_type: order.type ?? (order as Record<string, unknown>).orderType ?? null, trigger_price: n(order.triggerPrice ?? order.stopPrice ?? order.price), reduce_only: order.reduceOnly ?? null, binance_order_id: order.orderId ?? null, algo_id: order.algoId ?? null, update_time: order.updateTime ?? order.time ?? null })),
      checks,
    };
    if (missingProtection) {
      addCriticalMonitorError(stats, `missing_protection: ${symbol} has open Binance position without verified SL`);
      stats.unsafe_positions += 1;
    }
  }
  for (const [symbol, orders] of ordersBySymbol.entries()) {
    if (openPositionSymbols.has(symbol) || orders.length === 0) continue;
    const symbolRows = rowsBySymbol.get(symbol) ?? [];
    const target = symbolRows[0];
    const cancelled: Array<string | number | undefined> = [];
    for (const order of orders) {
      try {
        const beforeCount = orders.length;
        const response = await cancelOpenOrder(symbol, order);
        cancelled.push(order.algoId ?? order.orderId);
        cleanupEvents.push({ symbol, binance_order_id: order.orderId ?? null, algo_id: order.algoId ?? null, local_order_id: target?.id ?? null, cleanup_action: "cancel_orphan_order", cleanup_reason: "binance_order_without_open_position", safety_decision: "safe_to_cancel_no_open_position", before_count: beforeCount, after_count: Math.max(beforeCount - cancelled.length, 0), binance_response: response ?? "ok", timestamp: new Date().toISOString() });
        stats.cancelled_orders += 1;
      } catch (err) {
        cleanupEvents.push({ symbol, binance_order_id: order.orderId ?? null, algo_id: order.algoId ?? null, local_order_id: target?.id ?? null, cleanup_action: "skip_orphan_order_cancel_failed", cleanup_reason: errorMessage(err), safety_decision: "retry_required", before_count: orders.length, after_count: orders.length - cancelled.length, binance_response: errorMessage(err), timestamp: new Date().toISOString() });
        addMonitorWarning(stats, { symbol, warning: `orphan_order_cleanup_failed: ${errorMessage(err)}`, action: "orphan_order_cleanup_retry", source: "cleanup" });
      }
    }
    addMonitorWarning(stats, { id: target?.id, symbol, status: target?.status, warning: "orphan_orders_detected", action: "orphan_orders_cleanup_queued", source: "cleanup" });
    if (target) {
      const now = new Date().toISOString();
      await supabase.from("execution_orders").update({
        lifecycle_state: "orphan_orders_detected",
        cleanup_status: cancelled.length === orders.length ? "cleanup_verified" : "cleanup_retry_required",
        cleanup_warning: cancelled.length === orders.length ? "" : "orphan_order_cleanup_retry_required",
        cleanup_checked_at: now,
        last_monitor_checked_at: now,
        last_monitor_action: "orphan_orders_detected_cleanup_queued",
        updated_at: now,
      }).eq("id", target.id);
      await logEvent(supabase, target, "orphan_orders_detected", `${symbol} had open Binance orders without a Binance position; cleanup was queued/executed and Binance truth wins.`, { orders, cancelled }, stats);
      stats.updated += 1;
    }
  }
  stats.reconciliation_summary = {
    ran_at: new Date().toISOString(),
    symbols_checked: allSymbols.size,
    open_position_symbols: openPositions.map((p) => String(p.symbol ?? "")).filter(Boolean),
    open_order_symbols: Array.from(ordersBySymbol.keys()),
    classifications,
    cleanup_events: cleanupEvents.slice(-100),
    duplicate_conditional_count: Object.values(classifications).reduce((sum, item) => sum + n(item.duplicate_conditional), 0),
    stale_or_orphan_order_count: Object.values(classifications).reduce((sum, item) => sum + n(item.stale_conditional) + n(item.orphan_binance_order), 0),
    unprotected_position_count: Object.values(classifications).filter((item) => item.missing_protection).length,
    protection_degraded_count: rows.filter((row) => {
      const hasLiveBinanceExposure = openPositionSymbols.has(row.symbol) || (ordersBySymbol.get(row.symbol) ?? []).length > 0;
      const hasRecoverableProtectionWarning = ["protection_degraded", "unprotected_failed"].includes(String(row.protection_status ?? ""));
      const hasActiveProfitLockFailure = String(row.profit_lock_status ?? "").includes("replacement_failed") && row.profit_lock_sl_active === true;
      return ACTIVE_STATUSES.includes(row.status) && hasLiveBinanceExposure && (hasRecoverableProtectionWarning || hasActiveProfitLockFailure);
    }).length,
    unresolved_critical_count: Object.values(classifications).filter((item) => item.missing_protection || (item.unmanaged_external_order && item.position)).length,
  };
}

async function refreshAccountState(supabase: SupabaseClient, stats: MonitorStats, monitorStatus: MonitorLevel, ownership: Record<string, unknown>) {
  const monitorRunAt = new Date().toISOString();
  const [accountBody, positionsBody, allOrdersBody, allAlgoOrdersBody] = await Promise.all([
    binanceRequest("/fapi/v2/account", {}),
    binanceRequest("/fapi/v2/positionRisk", {}),
    binanceRequest("/fapi/v1/openOrders", {}),
    binanceRequest("/fapi/v1/openAlgoOrders", { algoType: "CONDITIONAL" }).catch((err) => {
      addMonitorWarning(stats, { warning: `open_algo_orders_partial_sync_warning: ${errorMessage(err)}`, action: "open_algo_orders_sync_warning_continue", source: "account_sync" });
      return [];
    }),
  ]);
  stats.monitor_status = classifyMonitor({ ...stats, monitor_status: monitorStatus });
  const assets = (accountBody as Record<string, unknown>).assets as Array<Record<string, unknown>> | undefined;
  const usdt = assets?.find((a) => a.asset === "USDT");
  const usdc = assets?.find((a) => a.asset === "USDC");
  const positions = (Array.isArray(positionsBody) ? positionsBody : []).filter((p: BinancePosition) => Math.abs(n(p.positionAmt)) > 0);
  const orders = [...(Array.isArray(allOrdersBody) ? allOrdersBody : []), ...parseOpenAlgoOrders(allAlgoOrdersBody)];
  const totalMargin = n((accountBody as Record<string, unknown>).totalMarginBalance);
  const totalWallet = n((accountBody as Record<string, unknown>).totalWalletBalance);
  const unrealized = positions.reduce((sum: number, p: BinancePosition) => sum + n(p.unRealizedProfit ?? p.unrealizedProfit), 0);
  const currentPositionSize = positions.reduce((sum: number, p: BinancePosition) => sum + Math.abs(n(p.positionAmt)), 0);
  const openNotional = positions.reduce((sum: number, p: BinancePosition) => sum + Math.abs(n((p as Record<string, unknown>).notional)), 0);
  const currentOpenRiskPct = totalWallet > 0 ? (openNotional / totalWallet) * 100 : 0;
  const settingsUpdate = {
    latest_monitor_run_at: monitorRunAt,
    latest_monitor_status: stats.monitor_status,
    latest_monitor_result: monitorResult(stats),
    latest_monitor_error: stats.latest_monitor_error,
    latest_sync_error: stats.latest_sync_error,
    last_managed_exit_action: stats.last_managed_action,
    open_binance_positions: positions,
    open_binance_orders: orders,
    pnl_snapshot: { unrealized_pnl: unrealized, total_margin_balance: totalMargin, total_wallet_balance: totalWallet },
    stale_rows_cleaned: stats.stale_cleaned,
    current_position_size: currentPositionSize,
    unrealized_pnl: unrealized,
    account_total_margin_balance: totalMargin,
    account_total_wallet_balance: totalWallet,
    available_usdt: n(usdt?.availableBalance),
    available_usdc: n(usdc?.availableBalance),
    current_open_risk_pct: currentOpenRiskPct,
    profit_lock_study_counters: stats.profit_lock_study,
    profit_lock_actions_taken: stats.profit_lock_study.actions_taken,
    profit_lock_skipped_reasons: stats.profit_lock_study.skipped_reasons,
    open_positions_count: positions.length,
    latest_sync_time: monitorRunAt,
    latest_account_state_at: monitorRunAt,
    updated_at: monitorRunAt,
  };
  await supabase.from("execution_account_runtime_proof").upsert({ ...ownership, provider: "binance", environment: "testnet", monitor_status: stats.monitor_status, account_state: settingsUpdate, observed_at: monitorRunAt, updated_at: monitorRunAt }, { onConflict: "execution_scope_key" });
  const { error } = await supabase.from("execution_settings").update(settingsUpdate).eq("id", 1);
  if (!error) return;

  // Preserve the single monitor clock even if a non-clock snapshot column drifts from
  // the deployed schema. Without this fallback, Supabase Cron can succeed while the
  // UI keeps reading an old monitor timestamp.
  const fallback = {
    latest_monitor_run_at: monitorRunAt,
    latest_account_state_at: monitorRunAt,
    latest_monitor_status: stats.monitor_status,
    latest_monitor_result: monitorResult(stats),
    latest_monitor_error: stats.latest_monitor_error,
    latest_sync_error: stats.latest_sync_error,
    latest_sync_time: monitorRunAt,
    updated_at: monitorRunAt,
  };
  const { error: fallbackError } = await supabase.from("execution_settings").update(fallback).eq("id", 1);
  if (fallbackError) throw new Error(`execution_settings monitor timestamp update failed: ${fallbackError.message}; original snapshot update failed: ${error.message}`);
  addMonitorWarning(stats, { warning: `monitor_snapshot_partial_update: ${error.message}`, action: "monitor_clock_persisted_snapshot_partial", source: "execution_settings" });
}



async function writeMonitorHeartbeat(supabase: SupabaseClient, heartbeat: Record<string, unknown>) {
  await supabase.from("execution_monitor_heartbeats").upsert({
    provider: "binance",
    trigger_source: String(heartbeat.trigger_source ?? "unknown"),
    is_automatic: heartbeat.is_automatic === true,
    environment: "testnet",
    updated_at: new Date().toISOString(),
    ...heartbeat,
  }, { onConflict: "provider,environment,run_id" });
}

function heartbeatFromStats(runId: string, startedAt: string, completedAt: string, success: boolean, stats: MonitorStats, triggerSource = "manual", isAutomatic = false): Record<string, unknown> {
  const reconciliation = (stats.reconciliation_summary ?? {}) as Record<string, unknown>;
  const openPositions = Array.isArray(reconciliation.open_position_symbols) ? reconciliation.open_position_symbols.length : 0;
  const openOrders = Array.isArray(reconciliation.open_order_symbols) ? reconciliation.open_order_symbols.length : 0;
  const latestRecovery = stats.last_managed_action ? String((stats.last_managed_action as Record<string, unknown>).action ?? "managed_action") : stats.cancelled_orders > 0 ? "stale_orders_cleaned" : stats.protected > 0 ? "protection_verified" : null;
  return {
    run_id: runId,
    trigger_source: triggerSource,
    is_automatic: isAutomatic,
    started_at: startedAt,
    completed_at: completedAt,
    success,
    monitor_status: stats.monitor_status,
    positions_seen: openPositions,
    orders_seen: openOrders,
    executions_checked: stats.checked,
    protections_created: stats.protected + stats.managed,
    protections_missing: Number(reconciliation.unprotected_position_count ?? 0) + Number(reconciliation.protection_degraded_count ?? 0),
    stale_orders_cleaned: stats.cancelled_orders + stats.stale_cleaned,
    positions_closed: stats.closed_synced + stats.stale_closed + stats.safety_closed,
    latest_recovery_action: latestRecovery,
    latest_telegram_event: stats.telegram_sent > 0 ? "binance_monitor_alert" : null,
    errors: [...stats.critical_errors, ...stats.row_errors.map((e) => e.error), ...stats.warnings.map((w) => w.warning)],
    metadata: monitorResult(stats),
  };
}

async function recordRowError(supabase: SupabaseClient, row: Row, err: unknown, stats: MonitorStats) {
  const message = errorMessage(err);
  const stack = errorStack(err);
  if (isBinanceOrderNotFound(err)) {
    const action = "stale_order_lookup_warning_continue";
    addMonitorWarning(stats, { id: row.id, symbol: row.symbol, status: row.status, warning: message, action, source: "order_lookup" });
    await supabase.from("execution_orders").update({
      latest_sync_error: "",
      last_monitor_action: action,
      last_monitor_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    return;
  }
  const action = "row_error_continue";
  stats.row_errors.push({ id: row.id, symbol: row.symbol, status: row.status, error: message, stack, action, severity: "warning" });
  await supabase.from("execution_orders").update({
    latest_monitor_error: message,
    latest_sync_error: message,
    latest_protection_error: message,
    last_monitor_action: action,
    last_monitor_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  let triggerSource = "manual";
  let isAutomatic = false;
  const stats: MonitorStats = { checked: 0, updated: 0, protected: 0, managed: 0, stale_closed: 0, closed_synced: 0, safety_closed: 0, row_errors: [], events: 0, telegram_sent: 0, stale_cleaned: 0, reduce_only_orders: 0, cancelled_orders: 0, last_managed_action: null, latest_monitor_error: "", latest_sync_error: "", latest_monitor_warning: "", warnings: [], critical_errors: [], unsafe_positions: 0, monitor_status: "healthy", reconciliation_summary: { ran: false }, profit_lock_study: { evaluated: 0, reached_0_1r: 0, reached_0_2r: 0, reached_0_3r: 0, reached_0_5r: 0, later_reversed: 0, actions_taken: 0, skipped_reasons: {} } };
  let supabase: SupabaseClient | null = null;
  try {
    const parsedPayload = await parseMonitorPayload(req);
    triggerSource = String(parsedPayload.payload.source ?? parsedPayload.payload.triggered_by ?? "manual");
    isAutomatic = triggerSource === "pg_cron" || parsedPayload.payload.is_automatic === true;
    if (parsedPayload.error) return globalErrorResponse("invalid_payload", parsedPayload.error, stats);
    if (parsedPayload.payload.expected_monitor_version && parsedPayload.payload.expected_monitor_version !== MONITOR_VERSION) {
      return globalErrorResponse("deployment_mismatch", `Deployed monitor version ${MONITOR_VERSION} does not match expected ${parsedPayload.payload.expected_monitor_version}`, stats, { expected_monitor_version: parsedPayload.payload.expected_monitor_version });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) {
      return globalErrorResponse("missing_env", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", stats, { missing_env: [!supabaseUrl ? "SUPABASE_URL" : null, !serviceRole ? "SUPABASE_SERVICE_ROLE_KEY" : null].filter(Boolean) });
    }

    try {
      supabase = createClient(supabaseUrl, serviceRole);
    } catch (clientErr) {
      return globalErrorResponse("missing_env", `Supabase client initialization failed: ${errorMessage(clientErr)}`, stats);
    }

    let authenticated = false;
    try {
      authenticated = await verifyCronOrService(req, supabase, serviceRole);
    } catch (authErr) {
      return globalErrorResponse(isMissingTableOrColumn(authErr) ? "missing_table_or_column" : "db_query_failed", `Cron auth lookup failed: ${errorMessage(authErr)}`, stats);
    }
    if (!authenticated) return globalErrorResponse("auth_failed", "Cron/service authorization failed", stats);

    const schema = await verifyMonitorSchema(supabase);
    if (!schema.ok) {
      const reason = isMissingTableOrColumn(schema.error) ? "missing_table_or_column" : "db_query_failed";
      return globalErrorResponse(reason, `Monitor schema check failed for ${schema.table}: ${errorMessage(schema.error)}`, stats, { required_columns: schema.columns });
    }

    const { data: settings, error: settingsError } = await supabase.from("execution_settings").select("*").eq("id", 1).maybeSingle();
    if (settingsError) {
      const reason = isMissingTableOrColumn(settingsError) ? "missing_table_or_column" : "db_query_failed";
      return globalErrorResponse(reason, `execution_settings query failed: ${errorMessage(settingsError)}`, stats);
    }
    if (boolEnv(Deno.env.get("LIVE_TRADING_ENABLED")) || settings?.live_trading_enabled === true) return jsonResponse({ success: false, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: false, aborted: true, reason: "live_trading_enabled_abort", global_error: "startup_exception", ...stats });
    if (String(Deno.env.get("EXECUTION_MODE") ?? "").toLowerCase() !== "testnet") return jsonResponse({ success: true, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: false, skipped: true, reason: "env_execution_mode_not_testnet", global_error: "", ...stats });
    if (!boolEnv(Deno.env.get("TESTNET_ENABLED"))) return jsonResponse({ success: true, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: false, skipped: true, reason: "env_testnet_disabled", global_error: "", ...stats });
    if (!settings || settings.execution_mode !== "testnet" || settings.testnet_enabled !== true || settings.kill_switch_enabled === true) {
      await safeSettingsUpdate(supabase, {
        latest_monitor_run_at: new Date().toISOString(),
        latest_monitor_status: "skipped",
        latest_monitor_result: { action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: false, skipped: true, reason: "execution_settings_gate_closed", unsafe_positions: 0, critical_errors_count: 0, http_status: 200 },
        updated_at: new Date().toISOString(),
      });
      return jsonResponse({ success: true, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: false, skipped: true, reason: "execution_settings_gate_closed", global_error: "", ...stats });
    }

    const { data: rows, error } = await supabase.from("execution_orders").select("*").eq("execution_provider", "binance").not("execution_scope_key", "is", null).in("status", ACTIVE_STATUSES).order("created_at", { ascending: true }).limit(100);
    if (error) {
      const reason = isMissingTableOrColumn(error) ? "missing_table_or_column" : "db_query_failed";
      return globalErrorResponse(reason, `execution_orders query failed: ${errorMessage(error)}`, stats);
    }
    for (const row of (rows ?? []) as Row[]) {
      let ownership;
      try {
        ownership = ownershipFromRow(row as unknown as Record<string, unknown>, "binance");
        const credential = await resolveEdgeProviderCredential(supabase, ownership);
        if (!await acquireExecutionLease(supabase, ownership, runId)) throw new Error(`monitor_lease_unavailable:${ownership.execution_scope_key}`);
        /* legacy proof pattern: monitorRow(supabase, row, stats) */
        await withEdgeProviderCredential(credential, () => monitorRow(supabase, row, stats, settings as MonitorSettings, runId));
        await releaseExecutionLease(supabase, ownership, runId, "completed");
      } catch (rowErr) {
        if (ownership) await releaseExecutionLease(supabase, ownership, runId, "failed").catch(() => null);
        try {
          await recordRowError(supabase, row, rowErr, stats);
        } catch (saveErr) {
          const message = `row_error_save_failed: ${errorMessage(saveErr)}; original=${errorMessage(rowErr)}`;
          stats.row_errors.push({ id: row.id, symbol: row.symbol, status: row.status, error: message, stack: errorStack(saveErr), action: "row_error_save_failed_continue", severity: "critical" });
          addCriticalMonitorError(stats, message);
        }
      }
    }
    const accounts = (await enumerateExecutionAccounts(supabase, "binance")).filter((account) => account.environment === "testnet");
    const accountSync = await settleExecutionAccounts(accounts, async (ownership) => {
      const credential = await resolveEdgeProviderCredential(supabase, ownership);
      return withEdgeProviderCredential(credential, async () => {
        await reconcileBinanceTruthGaps(supabase, stats, ownership.execution_scope_key);
        await refreshAccountState(supabase, stats, stats.monitor_status, runtimeOwnershipFields(ownership));
      });
    });
    for (const failed of accountSync.filter((result) => result.status === "rejected")) addCriticalMonitorError(stats, `account_sync_failed:${errorMessage((failed as PromiseRejectedResult).reason)}`);
    stats.monitor_status = classifyMonitor(stats);
    try {
      await sendAdminMonitorAlert(supabase, stats);
    } catch (syncErr) {
      const message = errorMessage(syncErr);
      addCriticalMonitorError(stats, message);
      stats.monitor_status = "critical_error";
      await safeSettingsUpdate(supabase, {
        latest_monitor_run_at: new Date().toISOString(),
        latest_monitor_status: stats.monitor_status,
        latest_monitor_error: message,
        latest_sync_error: message,
        latest_monitor_result: monitorResult(stats),
        updated_at: new Date().toISOString(),
      });
      await writeMonitorHeartbeat(supabase, heartbeatFromStats(runId, startedAt, new Date().toISOString(), true, stats, triggerSource, isAutomatic)).catch(() => null);
      return jsonResponse({ success: true, overall_status: accounts.length === 0 || accountSync.some((result) => result.status === "rejected") ? "DEGRADED" : "PASS", action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: accounts.length > 0, monitor_status: accounts.length > 0 ? stats.monitor_status : "not_configured", account_configuration: accounts.length > 0 ? "CONFIGURED" : "NOT CONFIGURED", execution_adoption: "EXECUTION DISABLED", configured_account: accounts.length > 0, writes_skipped: accounts.length === 0, first_blocker: accounts.length === 0 ? "No canonical execution-account identity" : null, accounts_total: accounts.length, accounts_fulfilled: accountSync.filter((result) => result.status === "fulfilled").length, accounts_rejected: accountSync.filter((result) => result.status === "rejected").length, global_error: "", run_id: runId, ...stats });
    }
    await writeMonitorHeartbeat(supabase, heartbeatFromStats(runId, startedAt, new Date().toISOString(), true, stats, triggerSource, isAutomatic)).catch(() => null);
    return jsonResponse({ success: true, overall_status: accounts.length === 0 || accountSync.some((result) => result.status === "rejected") ? "DEGRADED" : "PASS", action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: accounts.length > 0, monitor_status: accounts.length > 0 ? stats.monitor_status : "not_configured", account_configuration: accounts.length > 0 ? "CONFIGURED" : "NOT CONFIGURED", execution_adoption: "EXECUTION DISABLED", configured_account: accounts.length > 0, writes_skipped: accounts.length === 0, first_blocker: accounts.length === 0 ? "No canonical execution-account identity" : null, accounts_total: accounts.length, accounts_fulfilled: accountSync.filter((result) => result.status === "fulfilled").length, accounts_rejected: accountSync.filter((result) => result.status === "rejected").length, global_error: "", run_id: runId, ...stats });
  } catch (err) {
    const errorMsg = errorMessage(err);
    addCriticalMonitorError(stats, errorMsg);
    stats.monitor_status = "critical_error";
    if (supabase) {
      try {
        const { data: activeRows } = await supabase.from("execution_orders").select("*").eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
        for (const row of (activeRows ?? []) as any) {
          await upsertTradeManagementTruth(supabase, {
            p_execution_order_id: row.id,
            p_provider: "binance",
            p_environment: "testnet",
            p_symbol: row.symbol,
            p_direction: String(row.direction).toLowerCase(),
            p_status: "protection_failed",
            p_protection_status: "protection_failed",
            p_sl_present: false,
            p_tp1_present: false,
            p_tp2_present: false,
            p_entry_price: Number(row.entry_price ?? 0) || null,
            p_mark_price: null,
            p_unrealized_pnl: 0,
            p_quantity: Number(row.quantity ?? row.volume ?? 0) || null,
            p_leverage: Number(row.leverage ?? 0) || null,
            p_sl_price: Number(row.intended_sl ?? row.stop_loss ?? 0) || null,
            p_tp1_price: Number(row.intended_tp1 ?? row.tp1 ?? 0) || null,
            p_tp2_price: Number(row.intended_tp2 ?? row.tp2 ?? 0) || null,
            p_monitor_run_id: runId,
            p_repair_attempts: Number(row.repair_attempts ?? 0),
            p_recovery_status: "provider_unavailable",
            p_latest_error: errorMsg,
            p_last_action_taken: "provider_health_failed"
          }).catch(() => null);
        }
      } catch (_rowErr) {
        // non-blocking
      }
    }
    await safeSettingsUpdate(supabase, { latest_monitor_run_at: new Date().toISOString(), latest_monitor_status: stats.monitor_status, latest_monitor_error: errorMessage(err), latest_sync_error: errorMessage(err), latest_monitor_result: { error: errorMessage(err), monitor_version: MONITOR_VERSION, ...monitorResult(stats) }, updated_at: new Date().toISOString() });
    if (supabase) await writeMonitorHeartbeat(supabase, heartbeatFromStats(runId, startedAt, new Date().toISOString(), false, stats, triggerSource, isAutomatic)).catch(() => null);
    return jsonResponse({ success: false, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: false, monitor_status: stats.monitor_status, global_error: "startup_exception", error: errorMessage(err), run_id: runId, ...stats }, 500);
  }
});
