import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret",
};

const MONITOR_VERSION = "b6.7r-monitor-health-classification";
const ACTIVE_STATUSES = ["pending", "entry_submitted", "entry_filled", "protected", "protected_native", "pending_protection", "protected_managed", "pending_managed_protection", "partially_closed"];
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
  const executionSettingsColumns = "id,latest_monitor_error,latest_sync_error,latest_monitor_status,latest_monitor_result";
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

function classifyMonitor(stats: MonitorStats): MonitorLevel {
  if (stats.critical_errors.length > 0 || stats.unsafe_positions > 0) return "critical_error";
  if (stats.safety_closed > 0) return "degraded";
  if (stats.row_errors.length > 0) return "row_errors_only";
  if (stats.warnings.some((warning) => warning.source === "account_sync")) return "partial_sync_warning";
  if (stats.warnings.length > 0) return "completed_with_warnings";
  return "healthy";
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

function syncedNoPositionStatus(row: Row): "closed_synced" | "stale_closed" {
  return ["entry_filled", "protected", "protected_native", "protected_managed", "partially_closed", "pending_protection", "pending_managed_protection"].includes(row.status) ? "closed_synced" : "stale_closed";
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
  const apiKey = Deno.env.get("BINANCE_TESTNET_API_KEY") ?? "";
  const apiSecret = Deno.env.get("BINANCE_TESTNET_API_SECRET") ?? "";
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
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (token && token === serviceRole) return true;
  if (token) {
    const { data, error } = await supabase.from("scanner_config").select("cron_pg_token").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (data?.cron_pg_token && token === data.cron_pg_token) return true;
  }
  const cronSecret = Deno.env.get("SCANNER_CRON_SECRET") ?? "";
  return Boolean(cronSecret && req.headers.get("x-scanner-cron-secret") === cronSecret);
}

async function sendTelegram(supabase: SupabaseClient, executionId: string, signalId: string | null, eventType: string, message: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID") ?? Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
  if (!token || !chatId) {
    await supabase.from("telegram_deliveries").insert({ signal_id: signalId, delivery_type: `binance_testnet_${eventType}`, chat_id: chatId, status: "skipped", error_message: "telegram_not_configured" });
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  await supabase.from("telegram_deliveries").insert({
    signal_id: signalId,
    delivery_type: `binance_testnet_${eventType}`,
    chat_id: chatId,
    status: res.ok ? "sent" : "failed",
    telegram_message_id: String((body.result as Record<string, unknown> | undefined)?.message_id ?? ""),
    error_message: res.ok ? "" : JSON.stringify(body).slice(0, 1000),
  });
  return res.ok;
}

async function logEvent(supabase: SupabaseClient, row: Row, type: string, message: string, metadata: Record<string, unknown>, stats: MonitorStats) {
  const fullMessage = `BINANCE TESTNET — NOT LIVE\n${message}`;
  const telegramSent = await sendTelegram(supabase, row.id, row.signal_id ?? null, type, fullMessage);
  await supabase.from("execution_event_logs").insert({ execution_order_id: row.id, signal_id: row.signal_id ?? null, symbol: row.symbol, event_type: type, message: fullMessage, metadata, telegram_sent: telegramSent });
  stats.events += 1;
  if (telegramSent) stats.telegram_sent += 1;
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

async function submitProtectionForRow(
  supabase: SupabaseClient,
  row: Row,
  quantity: number,
  stats: MonitorStats,
): Promise<"protected_native" | "protected_managed"> {
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
      protected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    await logEvent(supabase, row, "protected_native", `Monitor placed native SL/TP: sl=${slTrigger} tp1=${tp1Trigger} tp2=${tp2Trigger} qty=${quantity}`, { slOrder, tp1Order, tp2Order }, stats);
    stats.updated += 1;
    stats.protected += 1;
    return "protected_native";
  } catch (e) {
    const error = e instanceof Error ? e.message : "Native protection failed in monitor";
    await supabase.from("execution_orders").update({
      status: "protected_managed", bracket_mode: "managed_exit_fallback", protection_status: "protected_managed",
      native_protection_verified: false, managed_fallback_active: true,
      intended_sl: sl, intended_tp1: tp1Price, intended_tp2: tp2Price,
      tp1_quantity: tp1Qty, tp2_quantity: tp2Qty, remaining_quantity: quantity,
      latest_protection_error: error, updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    await logEvent(supabase, row, "managed_exit_fallback_enabled", `Monitor managed fallback: native protection failed: ${error}`, { error }, stats);
    stats.updated += 1;
    stats.managed += 1;
    return "protected_managed";
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
  const ids = [row.sl_algo_id ?? row.binance_sl_order_id, row.tp1_algo_id ?? row.binance_tp1_order_id, row.tp2_algo_id ?? row.binance_tp2_order_id].filter(Boolean).map(String);
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
    return;
  }
  if (order.orderId) await binanceRequest("/fapi/v1/order", { symbol, orderId: String(order.orderId) }, "DELETE");
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

async function protectOrSafetyClose(supabase: SupabaseClient, row: Row, quantity: number, stats: MonitorStats, reason: string): Promise<"protected_native" | "protected_managed" | "closed_unprotected_safety"> {
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

async function monitorRow(supabase: SupabaseClient, row: Row, stats: MonitorStats) {
  stats.checked += 1;
  const [positionBody, openOrdersBody, openAlgoOrdersBody] = await Promise.all([
    binanceRequest("/fapi/v2/positionRisk", { symbol: row.symbol }),
    binanceRequest("/fapi/v1/openOrders", { symbol: row.symbol }),
    binanceRequest("/fapi/v1/openAlgoOrders", { symbol: row.symbol, algoType: "CONDITIONAL" }).catch(() => []),
  ]);
  const position = (Array.isArray(positionBody) ? positionBody : []).find((p: BinancePosition) => p.symbol === row.symbol) as BinancePosition | undefined;
  const regularOpenOrders = (Array.isArray(openOrdersBody) ? openOrdersBody : []) as BinanceOrder[];
  const openAlgoOrders = (Array.isArray(openAlgoOrdersBody) ? openAlgoOrdersBody : []) as BinanceOrder[];
  const openOrders = [...regularOpenOrders, ...openAlgoOrders];
  const positionAmt = n(position?.positionAmt);
  const markPrice = n(position?.markPrice);
  const unrealizedPnl = n(position?.unRealizedProfit ?? position?.unrealizedProfit);
  const hasPosition = Math.abs(positionAmt) > 0;
  const hasOpenOrders = openOrders.length > 0;
  const now = new Date().toISOString();
  const deadline = timeStopDeadline(row);
  const maxHoldMinutes = row.max_hold_minutes ?? timeStopMinutes(row.strategy_name, row.timeframe);
  const update: Record<string, unknown> = { current_position_size: positionAmt, latest_mark_price: markPrice, latest_unrealized_pnl: unrealizedPnl, latest_sync_at: now, last_monitor_checked_at: now, last_monitor_action: "synced" };
  if (deadline) { update.expires_at = deadline; update.time_stop_deadline_at = deadline; }
  if (maxHoldMinutes) update.max_hold_minutes = maxHoldMinutes;

  if (deadline && Date.now() >= new Date(deadline).getTime() && ACTIVE_STATUSES.includes(row.status)) {
    const remaining = n(row.remaining_quantity) || n(row.volume) || Math.abs(positionAmt);
    const cancelled = await cancelRemainingProtection(row, stats);
    const closeResult = hasPosition && remaining > 0 ? await closeReduceOnly(row, remaining, "timeout") : null;
    Object.assign(update, { status: "closed_timeout", protection_status: "unprotected", native_protection_verified: false, managed_fallback_active: false, timeout_closed_at: now, remaining_quantity: 0, expiry_reason: row.expiry_reason ?? "strategy_time_stop_expired", last_monitor_action: "timeout_closed" });
    await supabase.from("execution_orders").update(update).eq("id", row.id);
    stats.reduce_only_orders += closeResult ? 1 : 0;
    stats.last_managed_action = { symbol: row.symbol, action: "timeout", quantity: remaining, order: closeResult, cancelled, at: now, deadline };
    await logEvent(supabase, row, "managed_timeout_closed", `${row.symbol} time-stop expired; cancelled remaining TP/SL orders and closed remaining Binance position reduce-only.`, { markPrice, remaining, deadline, cancelled, closeResult }, stats);
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
      await supabase.from("execution_orders").update({ ...update, status: "entry_filled", entry_price: avg || row.entry_price, entry_filled_at: now, remaining_quantity: qty, last_monitor_action: "entry_filled_submit_protection" }).eq("id", row.id);
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
    if (syncedStatus === "closed_synced") stats.closed_synced += 1; else stats.stale_closed += 1;
    return;
  }


  const orderStatus: Record<string, BinanceOrder> = {};
  if (entryId && entry) orderStatus[entryId] = entry;
  const algoIds = [row.sl_algo_id ?? row.binance_sl_order_id, row.tp1_algo_id ?? row.binance_tp1_order_id, row.tp2_algo_id ?? row.binance_tp2_order_id].filter(Boolean).map(String);
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
    if (!row.tp1_closed_at && algoFilled(tp1)) {
      Object.assign(update, { status: "partially_closed", tp1_closed_at: now, sl_moved_to_be: true });
      await logEvent(supabase, row, "native_tp1_filled", `${row.symbol} TP1 filled; SL moved/confirmed at break-even.`, { tp1 }, stats);
    }
    if (!row.tp2_closed_at && algoFilled(tp2)) {
      Object.assign(update, { status: "closed_tp", tp2_closed_at: now, remaining_quantity: 0, last_monitor_action: "managed_tp2_closed" });
      if (slAlgoId) { await cancelAlgoOrder(row.symbol, String(slAlgoId)); stats.cancelled_orders += 1; }
      await logEvent(supabase, row, "native_tp2_filled", `${row.symbol} TP2 filled; position closed in profit.`, { tp2 }, stats);
    }
    if (!row.sl_closed_at && algoFilled(sl)) {
      Object.assign(update, { status: "closed_sl", sl_closed_at: now, remaining_quantity: 0, last_monitor_action: row.sl_moved_to_be ? "managed_be_closed" : "managed_sl_closed" });
      for (const oid of [tp1AlgoId, tp2AlgoId].filter(Boolean).map(String)) { await cancelAlgoOrder(row.symbol, oid); stats.cancelled_orders += 1; }
      await logEvent(supabase, row, "native_sl_filled", `${row.symbol} SL filled; position closed.`, { sl }, stats);
    }
  }

  if (!update.status && !isEntryPendingRow && ACTIVE_STATUSES.includes(row.status) && !hasPosition && hasOpenOrders) {
    const cancelled: Array<string | number | undefined> = [];
    for (const order of openOrders) {
      try {
        await cancelOpenOrder(row.symbol, order);
        cancelled.push(order.algoId ?? order.orderId);
        stats.cancelled_orders += 1;
      } catch {
        // Stale cleanup must continue even if Binance reports an order already gone.
      }
    }
    const syncedStatus = syncedNoPositionStatus(row);
    Object.assign(update, { status: syncedStatus, protection_status: "unprotected", native_protection_verified: false, managed_fallback_active: false, remaining_quantity: 0, stale_cleanup_reason: "position_closed_leftover_orders_cancelled", stale_checked_at: now, last_monitor_action: "orphan_protection_orders_cancelled" });
    await supabase.from("execution_orders").update(update).eq("id", row.id);
    await logEvent(supabase, row, syncedStatus, `${row.symbol} position is closed on Binance; cancelled leftover SL/TP/open orders and synced DB closed.`, { cancelled }, stats);
    stats.updated += 1;
    stats.stale_cleaned += 1;
    if (syncedStatus === "closed_synced") stats.closed_synced += 1; else stats.stale_closed += 1;
    return;
  }


  const protectionStatus = String(row.protection_status ?? "");
  const isProtected = ["protected", "protected_native", "protected_managed"].includes(protectionStatus);
  if (hasPosition && !isProtected && ["entry_filled", "protected", "protected_native", "protected_managed", "partially_closed"].includes(row.status)) {
    await logEvent(supabase, row, "unprotected_recovery_attempt", `${row.symbol} open position without protection — attempting recovery.`, { positionAmt, protection_status: protectionStatus }, stats);
    const qty = Math.abs(positionAmt) > 0 ? Math.abs(positionAmt) : n(row.quantity) || n(row.volume);
    const recovered = await protectOrSafetyClose(supabase, row, qty, stats, "protection_pending_recovery");
    if (recovered === "closed_unprotected_safety") return;
    Object.assign(update, { protection_status: recovered, last_monitor_action: `recovery_${recovered}` });
  }

  if (row.bracket_mode === "managed_exit_fallback" || row.protection_status === "protected_managed") {
    const remaining = n(row.remaining_quantity) || n(row.volume) || Math.abs(positionAmt);
    const tp1Qty = n(row.tp1_quantity) || (remaining / 2);
    const activeStop = row.sl_moved_to_be ? n(row.entry_price) : n(row.intended_sl);
    if (!row.tp1_closed_at && n(row.intended_tp1) > 0 && targetHit(row.direction, markPrice, n(row.intended_tp1))) {
      const qty = Math.min(tp1Qty, remaining);
      const closeResult = await closeReduceOnly(row, qty, "tp1");
      Object.assign(update, { status: "partially_closed", tp1_closed_at: now, remaining_quantity: Math.max(remaining - qty, 0), sl_moved_to_be: true, be_stop_level: n(row.entry_price), last_monitor_action: "managed_tp1_closed" });
      stats.reduce_only_orders += 1;
      stats.last_managed_action = { symbol: row.symbol, action: "tp1", quantity: qty, order: closeResult, at: now };
      await logEvent(supabase, row, "managed_tp1_closed", `${row.symbol} managed TP1 hit; closed 50% reduce-only and moved SL to BE.`, { markPrice, qty }, stats);
    } else if (n(row.intended_tp2) > 0 && targetHit(row.direction, markPrice, n(row.intended_tp2))) {
      const closeResult = await closeReduceOnly(row, remaining, "tp2");
      Object.assign(update, { status: "closed_tp", tp2_closed_at: now, remaining_quantity: 0, last_monitor_action: "managed_tp2_closed" });
      stats.reduce_only_orders += 1;
      stats.last_managed_action = { symbol: row.symbol, action: "tp2", quantity: remaining, order: closeResult, at: now };
      await logEvent(supabase, row, "managed_tp2_closed", `${row.symbol} managed TP2 hit; closed remaining reduce-only.`, { markPrice, remaining }, stats);
    } else if (activeStop > 0 && stopHit(row.direction, markPrice, activeStop)) {
      const closeResult = await closeReduceOnly(row, remaining, "sl");
      Object.assign(update, { status: "closed_sl", sl_closed_at: now, remaining_quantity: 0, last_monitor_action: row.sl_moved_to_be ? "managed_be_closed" : "managed_sl_closed" });
      stats.reduce_only_orders += 1;
      stats.last_managed_action = { symbol: row.symbol, action: "sl", quantity: remaining, order: closeResult, at: now };
      await logEvent(supabase, row, "managed_sl_closed", `${row.symbol} managed SL hit; closed remaining reduce-only.`, { markPrice, remaining, activeStop }, stats);
    }
  }

  if (Object.keys(update).length > 4 || update.current_position_size !== undefined) {
    const { error } = await supabase.from("execution_orders").update(update).eq("id", row.id);
    if (error) throw error;
    stats.updated += 1;
  }
}

async function refreshAccountState(supabase: SupabaseClient, stats: MonitorStats, monitorStatus: MonitorLevel) {
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
  const orders = [...(Array.isArray(allOrdersBody) ? allOrdersBody : []), ...(Array.isArray(allAlgoOrdersBody) ? allAlgoOrdersBody : [])];
  const totalMargin = n((accountBody as Record<string, unknown>).totalMarginBalance);
  const totalWallet = n((accountBody as Record<string, unknown>).totalWalletBalance);
  const unrealized = positions.reduce((sum: number, p: BinancePosition) => sum + n(p.unRealizedProfit ?? p.unrealizedProfit), 0);
  const currentPositionSize = positions.reduce((sum: number, p: BinancePosition) => sum + Math.abs(n(p.positionAmt)), 0);
  const openNotional = positions.reduce((sum: number, p: BinancePosition) => sum + Math.abs(n((p as Record<string, unknown>).notional)), 0);
  const currentOpenRiskPct = totalWallet > 0 ? (openNotional / totalWallet) * 100 : 0;
  await supabase.from("execution_settings").update({
    latest_monitor_run_at: new Date().toISOString(),
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
    open_positions_count: positions.length,
    latest_sync_time: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
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
  const stats: MonitorStats = { checked: 0, updated: 0, protected: 0, managed: 0, stale_closed: 0, closed_synced: 0, safety_closed: 0, row_errors: [], events: 0, telegram_sent: 0, stale_cleaned: 0, reduce_only_orders: 0, cancelled_orders: 0, last_managed_action: null, latest_monitor_error: "", latest_sync_error: "", latest_monitor_warning: "", warnings: [], critical_errors: [], unsafe_positions: 0, monitor_status: "healthy" };
  let supabase: SupabaseClient | null = null;
  try {
    const parsedPayload = await parseMonitorPayload(req);
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
      return jsonResponse({ success: true, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: false, skipped: true, reason: "execution_settings_gate_closed", global_error: "", ...stats });
    }

    const { data: rows, error } = await supabase.from("execution_orders").select("*").in("status", ACTIVE_STATUSES).order("created_at", { ascending: true }).limit(100);
    if (error) {
      const reason = isMissingTableOrColumn(error) ? "missing_table_or_column" : "db_query_failed";
      return globalErrorResponse(reason, `execution_orders query failed: ${errorMessage(error)}`, stats);
    }
    for (const row of (rows ?? []) as Row[]) {
      try {
        await monitorRow(supabase, row, stats);
      } catch (rowErr) {
        try {
          await recordRowError(supabase, row, rowErr, stats);
        } catch (saveErr) {
          const message = `row_error_save_failed: ${errorMessage(saveErr)}; original=${errorMessage(rowErr)}`;
          stats.row_errors.push({ id: row.id, symbol: row.symbol, status: row.status, error: message, stack: errorStack(saveErr), action: "row_error_save_failed_continue", severity: "critical" });
          addCriticalMonitorError(stats, message);
        }
      }
    }
    stats.monitor_status = classifyMonitor(stats);
    try {
      await refreshAccountState(supabase, stats, stats.monitor_status);
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
      return jsonResponse({ success: true, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: true, monitor_status: stats.monitor_status, global_error: "", ...stats });
    }
    return jsonResponse({ success: true, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: true, monitor_status: stats.monitor_status, global_error: "", ...stats });
  } catch (err) {
    addCriticalMonitorError(stats, errorMessage(err));
    stats.monitor_status = "critical_error";
    await safeSettingsUpdate(supabase, { latest_monitor_run_at: new Date().toISOString(), latest_monitor_status: stats.monitor_status, latest_monitor_error: errorMessage(err), latest_sync_error: errorMessage(err), latest_monitor_result: { error: errorMessage(err), monitor_version: MONITOR_VERSION, ...monitorResult(stats) }, updated_at: new Date().toISOString() });
    return jsonResponse({ success: false, action: "binance_testnet_monitor", monitor_version: MONITOR_VERSION, monitor_started: false, monitor_status: stats.monitor_status, global_error: "startup_exception", error: errorMessage(err), ...stats }, 500);
  }
});
