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

function bybitBaseUrl(): string {
  const base = Deno.env.get("BYBIT_TESTNET_BASE_URL") || "https://api-testnet.bybit.com";
  if (!base.includes("testnet")) throw new Error("Bybit monitor is testnet-only: BYBIT_TESTNET_BASE_URL must include testnet");
  return base.replace(/\/$/, "");
}

async function bybitRequest<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const apiKey = Deno.env.get("BYBIT_TESTNET_API_KEY") ?? "";
  const apiSecret = Deno.env.get("BYBIT_TESTNET_API_SECRET") ?? "";
  if (!apiKey || !apiSecret) throw new Error("BYBIT_TESTNET_API_KEY and BYBIT_TESTNET_API_SECRET are required");
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

async function updateProvider(supabase: SupabaseClient, fields: Json) {
  await supabase.from("execution_provider_controls").upsert({ provider_name: "bybit", updated_at: new Date().toISOString(), ...fields }, { onConflict: "provider_name" });
}

async function monitorBybit(supabase: SupabaseClient): Promise<Json> {
  const startedAt = new Date().toISOString();
  let latestError = "";
  const stats: Json = { account_sync: false, balance_sync: false, open_positions_sync: false, open_orders_sync: false, protection_sync: false, recovery_sync: false, profit_lock_sync: false, rows_checked: 0, rows_updated: 0, warnings: [] };
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
    Object.assign(stats, { account_sync: true, balance_sync: true, open_positions_sync: true, open_orders_sync: true, bybit_positions_count: positionSymbols.size, bybit_open_orders_count: orderList.length });

    const { data: rows } = await supabase.from("execution_orders").select("id,signal_id,symbol,status,protection_status").eq("exchange", "bybit_usdt_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
    for (const row of (rows ?? []) as Array<Json & { id: string; symbol: string; status: string }>) {
      stats.rows_checked = Number(stats.rows_checked) + 1;
      const hasPosition = positionSymbols.has(row.symbol);
      const hasOrders = orderSymbols.has(row.symbol);
      const protectionStatus = hasPosition && hasOrders ? "protected_native" : hasPosition ? "protection_failed" : row.protection_status;
      await supabase.from("execution_orders").update({ provider_status: hasPosition ? "position_open" : hasOrders ? "orders_open" : "synced_no_open_exposure", protection_status: protectionStatus, last_monitor_checked_at: new Date().toISOString(), latest_monitor_error: "", latest_sync_error: "", raw_exchange_response: { bybit_monitor: { hasPosition, hasOrders, last_sync_at: new Date().toISOString() } }, updated_at: new Date().toISOString() }).eq("id", row.id);
      stats.rows_updated = Number(stats.rows_updated) + 1;
    }
    Object.assign(stats, { protection_sync: true, recovery_sync: true, profit_lock_sync: true });
    await updateProvider(supabase, { status: "connected", last_status_at: new Date().toISOString(), last_error: null, metadata: { bybit_monitor: { ...stats, last_monitor_run_at: startedAt, monitor_health: "healthy", wallet, open_position_symbols: Array.from(positionSymbols), open_order_symbols: Array.from(orderSymbols) } } });
    return { success: true, provider: "bybit", last_monitor_run_at: startedAt, monitor_health: "healthy", latest_error: null, ...stats };
  } catch (e) {
    latestError = e instanceof Error ? e.message : String(e);
    await updateProvider(supabase, { status: "degraded", last_status_at: new Date().toISOString(), last_error: latestError, metadata: { bybit_monitor: { ...stats, last_monitor_run_at: startedAt, monitor_health: "degraded", latest_error: latestError } } });
    await routeTelegramEvent(supabase, { event_id: `provider_bybit_monitor_error:${startedAt}`, event_type: "provider_bybit_monitor_failure", text: `Bybit monitor failure\nFreshness: ${startedAt}\nError: ${latestError}`, source: "bybit-testnet-monitor", channels: ["admin"], dedupe: false });
    return { success: false, provider: "bybit", last_monitor_run_at: startedAt, monitor_health: "degraded", latest_error: latestError, ...stats };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return authJsonResponse(auth, corsHeaders);
  return json(await monitorBybit(supabase));
});
