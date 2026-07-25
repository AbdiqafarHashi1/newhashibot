import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";
import { OperatorCredentialResolutionError, resolveOperatorProviderCredential, withEdgeProviderCredential } from "../_shared/execution-ownership.ts";

type Json = Record<string, unknown>;
type Environment = "demo" | "testnet";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, x-hashibot-internal-secret, x-hashibot-action-id, x-hashibot-correlation-id", "Content-Type": "application/json" };

function environment(): Environment {
  const value = String(Deno.env.get("BYBIT_ENVIRONMENT") || Deno.env.get("BYBIT_MODE") || "testnet").toLowerCase();
  return value === "demo" || value === "bybit_demo" ? "demo" : "testnet";
}
function baseUrl(env: Environment): string {
  return (Deno.env.get("BYBIT_BASE_URL") || Deno.env.get("BYBIT_TESTNET_BASE_URL") || (env === "demo" ? "https://api-demo.bybit.com" : "https://api-testnet.bybit.com")).replace(/\/$/, "");
}
async function signedGet<T>(apiKey: string, apiSecret: string, path: string, params: Record<string, string | number>): Promise<T> {
  const timestamp = String(Date.now());
  const recvWindow = "5000";
  const query = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, String(value)])).toString();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}${apiKey}${recvWindow}${query}`));
  const signature = Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const response = await fetch(`${baseUrl(environment())}${path}?${query}`, { method: "GET", headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": recvWindow, "X-BAPI-SIGN": signature, "X-BAPI-SIGN-TYPE": "2" }, signal: AbortSignal.timeout(10000) });
  const body = await response.json().catch(() => ({})) as { retCode?: number; retMsg?: string; result?: T };
  if (!response.ok || body.retCode !== 0) throw new Error(`bybit_read_failed:${path}:${body.retCode ?? response.status}:${body.retMsg ?? response.statusText}`);
  return body.result as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return new Response(JSON.stringify({ success: false, blocker: auth.error }), { status: auth.status, headers });
  const body = await req.json().catch(() => ({})) as Json;
  if (body.action !== "prove_bybit_trade_management") return new Response(JSON.stringify({ success: false, blocker: "read_only_action_required" }), { status: 400, headers });
  const env = environment();
  try {
    const resolved = await resolveOperatorProviderCredential(supabase, "bybit", env, { customerId: body.customer_id ? String(body.customer_id) : undefined, accountId: body.account_id ? String(body.account_id) : undefined });
    const result = await withEdgeProviderCredential(resolved.credential, async () => {
      const { apiKey, apiSecret, ownership } = resolved.credential;
      const [wallet, positionsResult, ordersResult] = await Promise.all([
        signedGet<Json>(apiKey, apiSecret, "/v5/account/wallet-balance", { accountType: "UNIFIED" }),
        signedGet<Json>(apiKey, apiSecret, "/v5/position/list", { category: "linear", settleCoin: "USDT" }),
        signedGet<Json>(apiKey, apiSecret, "/v5/order/realtime", { category: "linear", settleCoin: "USDT", openOnly: 0 }),
      ]);
      const positions = ((positionsResult.list ?? []) as Json[]).filter((row) => Number(row.size ?? 0) > 0);
      const orders = (ordersResult.list ?? []) as Json[];
      const protection = positions.map((position) => {
        const symbol = String(position.symbol ?? "");
        const protective = orders.filter((order) => order.symbol === symbol && (order.reduceOnly === true || String(order.reduceOnly) === "true"));
        const sl = Boolean(position.stopLoss) || protective.some((order) => /stop|sl/i.test(String(order.orderType ?? order.stopOrderType ?? order.orderLinkId ?? "")));
        const tp = Boolean(position.takeProfit) || protective.some((order) => /take|tp/i.test(String(order.orderType ?? order.stopOrderType ?? order.orderLinkId ?? "")));
        return { symbol, state: sl && tp ? "protected" : sl || tp ? "partially_protected" : "unsafe", sl_present: sl, tp_present: tp };
      });
      return { success: true, target: "bybit-demo-execution", provider: "bybit", environment: env, read_only: true, mutations_attempted: 0, wallet_reachable: Boolean(wallet), balances_fetch_success: true, positions_fetch_success: true, orders_fetch_success: true, positions_found: positions.length, open_orders_found: orders.length, protection, credential_resolution: { source: resolved.source, attempted: resolved.attempts }, account: { account_id: ownership.account_id, execution_scope_key: ownership.execution_scope_key } };
    });
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error) {
    const blocker = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, target: "bybit-demo-execution", provider: "bybit", environment: env, read_only: true, mutations_attempted: 0, blocker, credential_resolution: { attempted: error instanceof OperatorCredentialResolutionError ? error.attempts : { explicit_account: Boolean(body.account_id), operational_account: !body.account_id, system_secret: !body.account_id } } }), { status: 200, headers });
  }
});
