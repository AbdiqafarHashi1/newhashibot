import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { authJsonResponse, authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token",
};

type SupabaseClient = ReturnType<typeof createClient>;
type Json = Record<string, unknown>;
const ACTIVE_STATUSES = ["pending", "entry_submitted", "entry_filled", "protected", "protected_native", "partially_closed", "pending_protection", "protection_pending", "protection_failed", "protection_recovered", "protected_managed", "pending_managed_protection"];

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
  if (raw === "live" || raw === "mainnet" || raw === "bybit_live") return "live";
  return "testnet";
}

function bybitBaseUrl(): string {
  const environment = bybitEnvironment();
  const explicit = Deno.env.get("BYBIT_BASE_URL") || Deno.env.get("BYBIT_TESTNET_BASE_URL") || "";
  const fallback = environment === "demo" ? "https://api-demo.bybit.com" : environment === "live" ? "https://api.bybit.com" : "https://api-testnet.bybit.com";
  const base = (explicit || fallback).replace(/\/$/, "");
  if (environment === "demo" && !base.includes("api-demo.bybit.com")) throw new Error("Bybit Demo Trading requires BYBIT_BASE_URL=https://api-demo.bybit.com or no override");
  if (environment === "testnet" && !base.includes("testnet")) throw new Error("Bybit testnet requires a testnet base URL");
  if (environment === "live" && (base.includes("testnet") || base.includes("api-demo"))) throw new Error("Bybit live requires the mainnet base URL");
  return base;
}

function bybitCredentials(): { apiKey: string; apiSecret: string } {
  const demoOrLiveKey = Deno.env.get("BYBIT_API_KEY") ?? "";
  const demoOrLiveSecret = Deno.env.get("BYBIT_API_SECRET") ?? "";
  const testnetKey = Deno.env.get("BYBIT_TESTNET_API_KEY") ?? "";
  const testnetSecret = Deno.env.get("BYBIT_TESTNET_API_SECRET") ?? "";
  return bybitEnvironment() === "testnet" ? { apiKey: testnetKey || demoOrLiveKey, apiSecret: testnetSecret || demoOrLiveSecret } : { apiKey: demoOrLiveKey || testnetKey, apiSecret: demoOrLiveSecret || testnetSecret };
}

async function bybitRequest<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const { apiKey, apiSecret } = bybitCredentials();
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


async function bybitPost<T>(path: string, bodyParams: Record<string, string | number | boolean>): Promise<T> {
  const { apiKey, apiSecret } = bybitCredentials();
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
  if (String(row.last_telegram_event_sent ?? "") === event) return false;
  await routeTelegramEvent(supabase, { event_id: lifecycleEventKey(row, event), event_type: `bybit_${event}`, text: telegramText(row, event, state), source: "bybit-testnet-monitor", channels: ["admin"], dedupe: true });
  await supabase.from("execution_orders").update({ last_telegram_event_sent: event, latest_telegram_event_at: new Date().toISOString() }).eq("id", row.id);
  return true;
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

async function monitorBybit(supabase: SupabaseClient, payload: Json = {}): Promise<Json> {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  const triggerSource = String(payload.source ?? payload.triggered_by ?? "manual");
  const isAutomatic = triggerSource === "pg_cron" || payload.is_automatic === true;
  let latestError = "";
  const stats: Json = { account_sync: false, balance_sync: false, open_positions_sync: false, open_orders_sync: false, protection_sync: false, recovery_sync: false, profit_lock_sync: false, rows_checked: 0, rows_updated: 0, protections_created: 0, protections_missing: 0, stale_orders_cleaned: 0, positions_closed: 0, warnings: [] };
  try {
    const [wallet, positions, orders] = await Promise.all([
      bybitRequest<Json>("/v5/account/wallet-balance", { accountType: "UNIFIED" }),
      bybitRequest<Json>("/v5/position/list", { category: "linear", settleCoin: "USDT" }),
      bybitRequest<Json>("/v5/order/realtime", { category: "linear", settleCoin: "USDT", openOnly: 0 }),
    ]);
    const positionList = Array.isArray((positions as { list?: unknown[] }).list) ? (positions as { list: Json[] }).list : [];
    const orderList = Array.isArray((orders as { list?: unknown[] }).list) ? (orders as { list: Json[] }).list : [];
    const positionSymbols = new Set(positionList.filter((p) => Math.abs(Number(p.size ?? 0)) > 0).map((p) => String(p.symbol ?? "")));
    const orderSymbols = new Set(orderList.map((o) => String(o.symbol ?? "")));
    const walletList = Array.isArray((wallet as { list?: unknown[] }).list) ? (wallet as { list: Json[] }).list : [];
    const coinList = Array.isArray((walletList[0] as { coin?: unknown[] } | undefined)?.coin) ? (walletList[0] as { coin: Json[] }).coin : [];
    const usdt = coinList.find((c) => String(c.coin) === "USDT") ?? {};
    const activePositions = positionList.filter((p) => Math.abs(Number(p.size ?? 0)) > 0);
    const unrealizedPnl = activePositions.reduce((sum, p) => sum + Number(p.unrealisedPnl ?? 0), 0);
    Object.assign(stats, { account_sync: true, balance_sync: true, open_positions_sync: true, open_orders_sync: true, wallet_balance: Number((usdt as Json).walletBalance ?? 0), available_balance: Number((usdt as Json).availableToWithdraw ?? (usdt as Json).availableToBorrow ?? 0), equity: Number((usdt as Json).equity ?? 0), unrealized_pnl: unrealizedPnl, bybit_positions_count: positionSymbols.size, bybit_open_orders_count: orderList.length, active_symbols: Array.from(new Set([...positionSymbols, ...orderSymbols])), positions: activePositions.map((p) => ({ symbol: p.symbol, side: p.side, size: p.size, leverage: p.leverage, margin_mode: p.tradeMode ?? p.marginMode, entry_price: p.avgPrice, mark_price: p.markPrice, liquidation_price: p.liqPrice, unrealized_pnl: p.unrealisedPnl })), open_orders: orderList.map((o) => ({ symbol: o.symbol, order_id: o.orderId, side: o.side, type: o.orderType ?? o.stopOrderType, qty: o.qty, price: o.price, trigger_price: o.triggerPrice, reduce_only: o.reduceOnly })) });

    const { data: rows } = await supabase.from("execution_orders").select("*").eq("exchange", `bybit_usdt_${bybitEnvironment()}`).eq("environment", bybitEnvironment() === "live" ? "live" : bybitEnvironment()).in("status", ACTIVE_STATUSES);
    for (const row of (rows ?? []) as Array<Json & { id: string; symbol: string; status: string }>) {
      stats.rows_checked = Number(stats.rows_checked) + 1;
      const position = activePositions.find((p) => String(p.symbol) === row.symbol) ?? null;
      const symbolOrders = orderList.filter((o) => String(o.symbol) === row.symbol && isActiveOrder(o));
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

      if (!hasPosition && !hasOrders) {
        Object.assign(update, { status: "synced_closed", lifecycle_state: "synced_closed", protection_status: "closed", provider_status: "synced_no_open_exposure", expiry_status: row.expiry_status ?? "closed" });
        stats.positions_closed = Number(stats.positions_closed) + 1;
        await supabase.from("execution_orders").update(update).eq("id", row.id);
        await sendLifecycleTelegram(supabase, row, "position_synced_closed", { ...update, side });
        stats.rows_updated = Number(stats.rows_updated) + 1;
        continue;
      }

      if (!hasPosition && hasOrders) {
        let cancelled = 0;
        for (const o of symbolOrders) {
          try { await bybitPost<Json>("/v5/order/cancel", { category: "linear", symbol: row.symbol, orderId: orderId(o) }); cancelled++; } catch (e) { (stats.warnings as unknown[]).push({ symbol: row.symbol, warning: e instanceof Error ? e.message : String(e), action: "cancel_stale_bybit_order" }); }
        }
        Object.assign(update, { status: "synced_closed", lifecycle_state: "synced_closed", protection_status: "closed", provider_status: "stale_orders_cleaned", cleanup_status: cancelled ? "stale_orders_cleaned" : "stale_order_cleanup_failed", recovery_status: cancelled ? "recovered" : "cleanup_failed" });
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
          await bybitPost<Json>("/v5/order/create", { category: "linear", symbol: row.symbol, side: closeSide(position ?? {}, row), orderType: "Market", qty: String(qty), reduceOnly: true, closeOnTrigger: false, orderLinkId: `${baseLink}:expire` });
          for (const o of symbolOrders) await bybitPost<Json>("/v5/order/cancel", { category: "linear", symbol: row.symbol, orderId: orderId(o) }).catch(() => null);
          Object.assign(update, { status: "expired_closed", lifecycle_state: "expired_closed", protection_status: "closed", expiry_status: "expired_closed", provider_status: "expired_position_closed", cleanup_status: "stale_orders_cleaned" });
          stats.positions_closed = Number(stats.positions_closed) + 1;
          await supabase.from("execution_orders").update(update).eq("id", row.id);
          await sendLifecycleTelegram(supabase, row, "expired_closed", { ...update, side, qty, leverage: position?.leverage, current_price: currentPrice });
          stats.rows_updated = Number(stats.rows_updated) + 1;
          continue;
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          Object.assign(update, { expiry_status: "expired_close_failed", latest_protection_error: error, last_exchange_error: error, recovery_status: "expiry_close_failed" });
        }
      }

      const missing: string[] = [];
      if (!slOrders.length) missing.push("sl");
      if (tpOrders.length < 1) missing.push("tp1");
      if (tpOrders.length < 2) missing.push("tp2");
      try {
        if (!slOrders.length && slPrice > 0 && qty > 0) {
          const sl = await bybitPost<Json>("/v5/order/create", { category: "linear", symbol: row.symbol, side: close, orderType: "Market", qty: String(qty), triggerPrice: String(slPrice), triggerDirection: side === "LONG" ? 2 : 1, reduceOnly: true, closeOnTrigger: true, orderLinkId: `${baseLink}:sl` });
          stats.protections_created = Number(stats.protections_created) + 1;
          Object.assign(update, { sl_order_id: String(sl.orderId ?? sl.orderLinkId ?? ""), sl_status: "submitted" });
        }
        if (tpOrders.length < 1 && tp1Price > 0 && qty > 0) {
          const tp1 = await bybitPost<Json>("/v5/order/create", { category: "linear", symbol: row.symbol, side: close, orderType: "Market", qty: splitQty(qty, 1), triggerPrice: String(tp1Price), triggerDirection: side === "LONG" ? 1 : 2, reduceOnly: true, closeOnTrigger: false, orderLinkId: `${baseLink}:tp1` });
          stats.protections_created = Number(stats.protections_created) + 1;
          Object.assign(update, { tp1_order_id: String(tp1.orderId ?? tp1.orderLinkId ?? ""), tp1_status: "submitted" });
        }
        if (tpOrders.length < 2 && tp2Price > 0 && qty > 0) {
          const tp2 = await bybitPost<Json>("/v5/order/create", { category: "linear", symbol: row.symbol, side: close, orderType: "Market", qty: splitQty(qty, 2), triggerPrice: String(tp2Price), triggerDirection: side === "LONG" ? 1 : 2, reduceOnly: true, closeOnTrigger: false, orderLinkId: `${baseLink}:tp2` });
          stats.protections_created = Number(stats.protections_created) + 1;
          Object.assign(update, { tp2_order_id: String(tp2.orderId ?? tp2.orderLinkId ?? ""), tp2_status: "submitted" });
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        Object.assign(update, { latest_protection_error: error, last_exchange_error: error, recovery_status: "protection_retry_failed" });
        await sendLifecycleTelegram(supabase, row, "protection_failed", { ...update, side, qty, leverage: position?.leverage, current_price: currentPrice, recovery_status: error });
      }

      const verifiedSl = slOrders.length > 0 || Boolean(update.sl_order_id);
      const verifiedTp1 = tpOrders.length >= 1 || Boolean(update.tp1_order_id);
      const verifiedTp2 = tpOrders.length >= 2 || Boolean(update.tp2_order_id);
      const protectionStatus = verifiedSl && verifiedTp1 && verifiedTp2 ? "protected_native" : verifiedSl || verifiedTp1 || verifiedTp2 ? "partially_protected" : missing.includes("sl") ? "missing_sl" : "protection_failed";
      stats.protections_missing = Number(stats.protections_missing) + (verifiedSl ? 0 : 1) + (verifiedTp1 ? 0 : 1) + (verifiedTp2 ? 0 : 1);
      Object.assign(update, { status: protectionStatus === "protected_native" ? "protected_native" : "protection_failed", lifecycle_state: protectionStatus === "protected_native" ? "protected_native" : "partially_protected", protection_status: protectionStatus, native_protection_verified: protectionStatus === "protected_native", provider_status: "position_open", recovery_status: protectionStatus === "protected_native" && row.protection_status !== "protected_native" ? "recovered" : row.recovery_status ?? "none", sl_status: verifiedSl ? "submitted" : "missing", tp1_status: verifiedTp1 ? "submitted" : "missing", tp2_status: verifiedTp2 ? "submitted" : "missing" });
      await supabase.from("execution_orders").update(update).eq("id", row.id);
      if (protectionStatus === "protected_native") await sendLifecycleTelegram(supabase, row, row.protection_status === "protected_native" ? "native_protection_verified" : "native_sl_tp_placed", { ...update, side, qty, leverage: position?.leverage, current_price: currentPrice, sl_price: slPrice, tp1_price: tp1Price, tp2_price: tp2Price });
      else await sendLifecycleTelegram(supabase, row, "protection_failed", { ...update, side, qty, leverage: position?.leverage, current_price: currentPrice, sl_price: slPrice, tp1_price: tp1Price, tp2_price: tp2Price });
      stats.rows_updated = Number(stats.rows_updated) + 1;
    }
    Object.assign(stats, { protection_sync: true, recovery_sync: true, profit_lock_sync: true });
    const completedAt = new Date().toISOString();
    const result = { ...stats, run_id: runId, last_monitor_run_at: startedAt, last_successful_sync_at: completedAt, monitor_health: "healthy", wallet, open_position_symbols: Array.from(positionSymbols), open_order_symbols: Array.from(orderSymbols) };
    await writeMonitorHeartbeat(supabase, { run_id: runId, trigger_source: triggerSource, is_automatic: isAutomatic, started_at: startedAt, completed_at: completedAt, success: true, monitor_status: "healthy", positions_seen: activePositions.length, orders_seen: orderList.length, executions_checked: Number(stats.rows_checked), protections_created: Number(stats.protections_created), protections_missing: Number(stats.protections_missing), stale_orders_cleaned: Number(stats.stale_orders_cleaned), positions_closed: Number(stats.positions_closed), latest_recovery_action: Number(stats.protections_created) > 0 ? "protection_created" : Number(stats.stale_orders_cleaned) > 0 ? "stale_orders_cleaned" : null, errors: [], metadata: result });
    await updateProvider(supabase, { status: "connected", last_status_at: new Date().toISOString(), last_error: null, metadata: { bybit_monitor: { ...result, environment: bybitEnvironment(), base_url: bybitBaseUrl() } } });
    await supabase.from("execution_settings").update({ bybit_latest_monitor_run_at: startedAt, bybit_latest_successful_sync_at: result.last_successful_sync_at, bybit_latest_monitor_error: null, bybit_latest_monitor_result: result, updated_at: new Date().toISOString() }).eq("id", 1);
    return { success: true, provider: "bybit", last_monitor_run_at: startedAt, last_successful_sync_at: result.last_successful_sync_at, monitor_health: "healthy", latest_error: null, ...stats };
  } catch (e) {
    latestError = e instanceof Error ? e.message : String(e);
    await writeMonitorHeartbeat(supabase, { run_id: runId, trigger_source: triggerSource, is_automatic: isAutomatic, started_at: startedAt, completed_at: new Date().toISOString(), success: false, monitor_status: "degraded", positions_seen: 0, orders_seen: 0, executions_checked: Number(stats.rows_checked), protections_created: Number(stats.protections_created), protections_missing: Number(stats.protections_missing), stale_orders_cleaned: Number(stats.stale_orders_cleaned), positions_closed: Number(stats.positions_closed), latest_recovery_action: null, errors: [latestError], metadata: stats }).catch(() => null);
    await updateProvider(supabase, { status: "degraded", last_status_at: new Date().toISOString(), last_error: latestError, metadata: { bybit_monitor: { ...stats, run_id: runId, environment: bybitEnvironment(), base_url: bybitBaseUrl(), last_monitor_run_at: startedAt, monitor_health: "degraded", latest_error: latestError } } });
    await supabase.from("execution_settings").update({ bybit_latest_monitor_run_at: startedAt, bybit_latest_monitor_error: latestError, bybit_latest_monitor_result: { ...stats, last_monitor_run_at: startedAt, monitor_health: "degraded", latest_error: latestError }, updated_at: new Date().toISOString() }).eq("id", 1);
    await routeTelegramEvent(supabase, { event_id: `provider_bybit_monitor_error:${startedAt}`, event_type: "provider_bybit_monitor_failure", text: `Bybit monitor failure\nFreshness: ${startedAt}\nError: ${latestError}`, source: "bybit-testnet-monitor", channels: ["admin"], dedupe: false });
    return { success: false, provider: "bybit", last_monitor_run_at: startedAt, monitor_health: "degraded", latest_error: latestError, ...stats };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const payload = await req.clone().json().catch(() => ({})) as Json;
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return authJsonResponse(auth, corsHeaders);
  return json(await monitorBybit(supabase, payload));
});
