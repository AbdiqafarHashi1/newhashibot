import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret",
};

const ACTIVE_STATUSES = ["pending", "entry_submitted", "entry_filled", "protected", "pending_protection", "protected_managed", "pending_managed_protection", "partially_closed"];
const TERMINAL_ORDER_STATUSES = ["CANCELED", "EXPIRED"];

type SupabaseClient = ReturnType<typeof createClient>;
type Row = Record<string, unknown> & { id: string; symbol: string; direction: string; status: string; signal_id?: string | null };
type BinanceOrder = Record<string, unknown> & { orderId?: string | number; status?: string; symbol?: string };
type BinancePosition = Record<string, unknown> & { symbol?: string; positionAmt?: string; markPrice?: string; unRealizedProfit?: string; unrealizedProfit?: string };

type MonitorStats = {
  checked: number;
  updated: number;
  events: number;
  telegram_sent: number;
  stale_cleaned: number;
  reduce_only_orders: number;
  cancelled_orders: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function boolEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

function n(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
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

async function binanceRequest(path: string, params: Record<string, string>, method = "GET") {
  const apiKey = Deno.env.get("BINANCE_TESTNET_API_KEY") ?? "";
  const apiSecret = Deno.env.get("BINANCE_TESTNET_API_SECRET") ?? "";
  if (!apiKey || !apiSecret) throw new Error("Binance testnet API keys are not configured");
  const baseUrl = Deno.env.get("BINANCE_TESTNET_FAPI_BASE_URL") ?? "https://testnet.binancefuture.com";
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
    const { data } = await supabase.from("scanner_config").select("cron_pg_token").eq("id", 1).maybeSingle();
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

async function cancelOrder(symbol: string, orderId: string) {
  await binanceRequest("/fapi/v1/order", { symbol, orderId }, "DELETE");
}

async function closeReduceOnly(row: Row, quantity: number, reason: string) {
  if (quantity <= 0) return;
  await binanceRequest("/fapi/v1/order", {
    symbol: row.symbol,
    side: sideToClose(row.direction),
    type: "MARKET",
    quantity: String(quantity),
    reduceOnly: "true",
    newClientOrderId: `hashibot_${reason}_${row.id.slice(0, 8)}_${Date.now()}`,
  }, "POST");
}

async function monitorRow(supabase: SupabaseClient, row: Row, stats: MonitorStats) {
  stats.checked += 1;
  const [positionBody, openOrdersBody] = await Promise.all([
    binanceRequest("/fapi/v2/positionRisk", { symbol: row.symbol }),
    binanceRequest("/fapi/v1/openOrders", { symbol: row.symbol }),
  ]);
  const position = (Array.isArray(positionBody) ? positionBody : []).find((p: BinancePosition) => p.symbol === row.symbol) as BinancePosition | undefined;
  const openOrders = (Array.isArray(openOrdersBody) ? openOrdersBody : []) as BinanceOrder[];
  const positionAmt = n(position?.positionAmt);
  const markPrice = n(position?.markPrice);
  const unrealizedPnl = n(position?.unRealizedProfit ?? position?.unrealizedProfit);
  const hasPosition = Math.abs(positionAmt) > 0;
  const hasOpenOrders = openOrders.length > 0;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { current_position_size: positionAmt, latest_mark_price: markPrice, latest_unrealized_pnl: unrealizedPnl, latest_sync_at: now };

  if (ACTIVE_STATUSES.includes(row.status) && !hasPosition && !hasOpenOrders) {
    Object.assign(update, { status: "stale_closed", stale_cleanup_reason: "binance_truth_no_position_no_orders", stale_checked_at: now });
    await supabase.from("execution_orders").update(update).eq("id", row.id);
    await logEvent(supabase, row, "stale_closed", `${row.symbol} stale execution cleaned: Binance has no position and no open orders.`, { positionAmt, open_orders: 0 }, stats);
    stats.updated += 1;
    stats.stale_cleaned += 1;
    return;
  }

  const orderIds = [row.binance_entry_order_id, row.binance_sl_order_id, row.binance_tp1_order_id, row.binance_tp2_order_id].filter(Boolean).map(String);
  const orderStatus: Record<string, BinanceOrder> = {};
  for (const orderId of orderIds) {
    orderStatus[orderId] = await binanceRequest("/fapi/v1/order", { symbol: row.symbol, orderId }) as BinanceOrder;
  }

  const entryId = row.binance_entry_order_id ? String(row.binance_entry_order_id) : "";
  const entry = entryId ? orderStatus[entryId] : null;
  if (entry?.status === "FILLED" && ["pending", "entry_submitted"].includes(row.status)) {
    update.status = row.protection_status === "protected" ? "protected" : "entry_filled";
    const avg = n(entry.avgPrice);
    if (avg > 0) update.entry_price = avg;
    await logEvent(supabase, row, "entry_filled", `${row.symbol} entry filled${avg > 0 ? ` at ${avg}` : ""}.`, { entry }, stats);
  } else if (entry && TERMINAL_ORDER_STATUSES.includes(String(entry.status)) && ["pending", "entry_submitted"].includes(row.status)) {
    update.status = "cancelled";
    await logEvent(supabase, row, "entry_cancelled", `${row.symbol} entry order ${entry.status}.`, { entry }, stats);
  } else if (entry?.status === "REJECTED" && ["pending", "entry_submitted"].includes(row.status)) {
    update.status = "failed";
    await logEvent(supabase, row, "entry_failed", `${row.symbol} entry order rejected.`, { entry }, stats);
  }

  if (row.bracket_mode === "exchange_native") {
    const tp1 = row.binance_tp1_order_id ? orderStatus[String(row.binance_tp1_order_id)] : null;
    const tp2 = row.binance_tp2_order_id ? orderStatus[String(row.binance_tp2_order_id)] : null;
    const sl = row.binance_sl_order_id ? orderStatus[String(row.binance_sl_order_id)] : null;
    if (!row.tp1_closed_at && tp1?.status === "FILLED") {
      Object.assign(update, { status: "partially_closed", tp1_closed_at: now, sl_moved_to_be: true });
      await logEvent(supabase, row, "native_tp1_filled", `${row.symbol} TP1 filled; SL moved/confirmed at break-even.`, { tp1 }, stats);
    }
    if (!row.tp2_closed_at && tp2?.status === "FILLED") {
      Object.assign(update, { status: "closed_tp", tp2_closed_at: now, remaining_quantity: 0 });
      if (row.binance_sl_order_id) { await cancelOrder(row.symbol, String(row.binance_sl_order_id)); stats.cancelled_orders += 1; }
      await logEvent(supabase, row, "native_tp2_filled", `${row.symbol} TP2 filled; position closed in profit.`, { tp2 }, stats);
    }
    if (!row.sl_closed_at && sl?.status === "FILLED") {
      Object.assign(update, { status: "closed_sl", sl_closed_at: now, remaining_quantity: 0 });
      for (const oid of [row.binance_tp1_order_id, row.binance_tp2_order_id].filter(Boolean).map(String)) { await cancelOrder(row.symbol, oid); stats.cancelled_orders += 1; }
      await logEvent(supabase, row, "native_sl_filled", `${row.symbol} SL filled; position closed.`, { sl }, stats);
    }
  }

  if (row.bracket_mode === "managed_exit_fallback" || row.protection_status === "protected_managed") {
    const remaining = n(row.remaining_quantity) || n(row.volume) || Math.abs(positionAmt);
    const tp1Qty = n(row.tp1_quantity) || (remaining / 2);
    const activeStop = row.sl_moved_to_be ? n(row.entry_price) : n(row.intended_sl);
    if (!row.tp1_closed_at && n(row.intended_tp1) > 0 && targetHit(row.direction, markPrice, n(row.intended_tp1))) {
      const qty = Math.min(tp1Qty, remaining);
      await closeReduceOnly(row, qty, "tp1");
      Object.assign(update, { status: "partially_closed", tp1_closed_at: now, remaining_quantity: Math.max(remaining - qty, 0), sl_moved_to_be: true });
      stats.reduce_only_orders += 1;
      await logEvent(supabase, row, "managed_tp1_closed", `${row.symbol} managed TP1 hit; closed 50% reduce-only and moved SL to BE.`, { markPrice, qty }, stats);
    } else if (n(row.intended_tp2) > 0 && targetHit(row.direction, markPrice, n(row.intended_tp2))) {
      await closeReduceOnly(row, remaining, "tp2");
      Object.assign(update, { status: "closed_tp", tp2_closed_at: now, remaining_quantity: 0 });
      stats.reduce_only_orders += 1;
      await logEvent(supabase, row, "managed_tp2_closed", `${row.symbol} managed TP2 hit; closed remaining reduce-only.`, { markPrice, remaining }, stats);
    } else if (activeStop > 0 && stopHit(row.direction, markPrice, activeStop)) {
      await closeReduceOnly(row, remaining, "sl");
      Object.assign(update, { status: "closed_sl", sl_closed_at: now, remaining_quantity: 0 });
      stats.reduce_only_orders += 1;
      await logEvent(supabase, row, "managed_sl_closed", `${row.symbol} managed SL hit; closed remaining reduce-only.`, { markPrice, remaining, activeStop }, stats);
    }
  }

  if (Object.keys(update).length > 4 || update.current_position_size !== undefined) {
    const { error } = await supabase.from("execution_orders").update(update).eq("id", row.id);
    if (error) throw error;
    stats.updated += 1;
  }
}

async function refreshAccountState(supabase: SupabaseClient, stats: MonitorStats) {
  const [accountBody, positionsBody, allOrdersBody] = await Promise.all([
    binanceRequest("/fapi/v2/account", {}),
    binanceRequest("/fapi/v2/positionRisk", {}),
    binanceRequest("/fapi/v1/openOrders", {}),
  ]);
  const assets = (accountBody as Record<string, unknown>).assets as Array<Record<string, unknown>> | undefined;
  const usdt = assets?.find((a) => a.asset === "USDT");
  const usdc = assets?.find((a) => a.asset === "USDC");
  const positions = (Array.isArray(positionsBody) ? positionsBody : []).filter((p: BinancePosition) => Math.abs(n(p.positionAmt)) > 0);
  const orders = Array.isArray(allOrdersBody) ? allOrdersBody : [];
  const totalMargin = n((accountBody as Record<string, unknown>).totalMarginBalance);
  const totalWallet = n((accountBody as Record<string, unknown>).totalWalletBalance);
  const unrealized = positions.reduce((sum: number, p: BinancePosition) => sum + n(p.unRealizedProfit ?? p.unrealizedProfit), 0);
  const currentPositionSize = positions.reduce((sum: number, p: BinancePosition) => sum + Math.abs(n(p.positionAmt)), 0);
  const openNotional = positions.reduce((sum: number, p: BinancePosition) => sum + Math.abs(n((p as Record<string, unknown>).notional)), 0);
  const currentOpenRiskPct = totalWallet > 0 ? (openNotional / totalWallet) * 100 : 0;
  await supabase.from("execution_settings").update({
    latest_monitor_run_at: new Date().toISOString(),
    latest_monitor_status: "completed",
    latest_monitor_result: stats,
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const stats: MonitorStats = { checked: 0, updated: 0, events: 0, telegram_sent: 0, stale_cleaned: 0, reduce_only_orders: 0, cancelled_orders: 0 };
  let supabase: SupabaseClient | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) return jsonResponse({ success: false, error: "Monitor is not configured" }, 500);
    supabase = createClient(supabaseUrl, serviceRole);
    if (!(await verifyCronOrService(req, supabase, serviceRole))) return jsonResponse({ success: false, error: "Forbidden" }, 403);

    const { data: settings } = await supabase.from("execution_settings").select("*").eq("id", 1).maybeSingle();
    if (boolEnv(Deno.env.get("LIVE_TRADING_ENABLED")) || settings?.live_trading_enabled === true) return jsonResponse({ success: false, aborted: true, reason: "live_trading_enabled_abort" }, 409);
    if (String(Deno.env.get("EXECUTION_MODE") ?? "").toLowerCase() !== "testnet") return jsonResponse({ success: true, skipped: true, reason: "env_execution_mode_not_testnet" });
    if (!boolEnv(Deno.env.get("TESTNET_ENABLED"))) return jsonResponse({ success: true, skipped: true, reason: "env_testnet_disabled" });
    if (!settings || settings.execution_mode !== "testnet" || settings.testnet_enabled !== true || settings.kill_switch_enabled === true) {
      return jsonResponse({ success: true, skipped: true, reason: "execution_settings_gate_closed" });
    }

    const { data: rows, error } = await supabase.from("execution_orders").select("*").in("status", ACTIVE_STATUSES).order("created_at", { ascending: true }).limit(100);
    if (error) throw error;
    for (const row of (rows ?? []) as Row[]) await monitorRow(supabase, row, stats);
    await refreshAccountState(supabase, stats);
    return jsonResponse({ success: true, action: "binance_testnet_monitor", ...stats });
  } catch (err) {
    if (supabase) {
      await supabase.from("execution_settings").update({ latest_monitor_run_at: new Date().toISOString(), latest_monitor_status: "error", latest_monitor_result: { error: err instanceof Error ? err.message : "Unknown error", ...stats }, updated_at: new Date().toISOString() }).eq("id", 1);
    }
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : "Unknown error", ...stats }, 500);
  }
});
