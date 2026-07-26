import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";
import { OperatorCredentialResolutionError, resolveOperatorProviderCredential, withEdgeProviderCredential } from "../_shared/execution-ownership.ts";
import { classifyBybitFailure, clockDeltaMs, normalizedQuery, resolveBybitBaseUrl, resolveBybitEnvironment, safeFingerprint, signBybitV5Get } from "../_shared/bybit-v5-auth.ts";

type Json = Record<string, unknown>;
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, x-hashibot-internal-secret, x-hashibot-action-id, x-hashibot-correlation-id", "Content-Type": "application/json" };
const readEnv = (name: string) => Deno.env.get(name);

class BybitReadError extends Error {
  constructor(readonly receipt: Json) { super(String(receipt.blocker)); }
}

async function credentialMetadata(apiKey: string, apiSecret: string, source: string, secretNames: { apiKey: string; apiSecret: string }): Promise<Json> {
  const candidates = await Promise.all([
    ["BYBIT_DEMO_API_KEY", "BYBIT_DEMO_API_SECRET"], ["BYBIT_TESTNET_API_KEY", "BYBIT_TESTNET_API_SECRET"], ["BYBIT_API_KEY", "BYBIT_API_SECRET"],
  ].map(async ([keyName, secretName]) => {
    const key = readEnv(keyName) ?? ""; const secret = readEnv(secretName) ?? "";
    return { secret_name_pair: [keyName, secretName], api_key_present: Boolean(key), api_key_length: key.length, api_key_fingerprint: await safeFingerprint(key), secret_present: Boolean(secret), secret_length: secret.length, secret_fingerprint: await safeFingerprint(secret) };
  }));
  return { source, selected_secret_name_pair: [secretNames.apiKey, secretNames.apiSecret], api_key_present: Boolean(apiKey), api_key_length: apiKey.length, api_key_fingerprint: await safeFingerprint(apiKey), secret_present: Boolean(apiSecret), secret_length: apiSecret.length, secret_fingerprint: await safeFingerprint(apiSecret), system_secret_candidates: candidates };
}

async function serverClock(baseUrl: string): Promise<{ delta: number | null; status: number | null }> {
  const local = Date.now();
  try {
    const response = await fetch(`${baseUrl}/v5/market/time`, { signal: AbortSignal.timeout(5000) });
    const body = await response.json().catch(() => ({})) as Json;
    const result = (body.result ?? {}) as Json;
    const server = Number(result.timeSecond) * 1000 || Number(result.timeNano) / 1_000_000 || Number(body.time);
    return { delta: clockDeltaMs(server, local), status: response.status };
  } catch { return { delta: null, status: null }; }
}

async function signedGet<T>(input: { apiKey: string; apiSecret: string; baseUrl: string; environment: string; credential: Json; clock: { delta: number | null }; path: string; params: Record<string, string | number | boolean> }): Promise<T> {
  const timestamp = String(Date.now()); const recvWindow = "5000"; const query = normalizedQuery(input.params);
  const { signature } = await signBybitV5Get({ timestamp, apiKey: input.apiKey, apiSecret: input.apiSecret, recvWindow, query });
  const url = `${input.baseUrl}${input.path}?${query}`;
  const response = await fetch(url, { method: "GET", headers: { "X-BAPI-API-KEY": input.apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": recvWindow, "X-BAPI-SIGN": signature, "X-BAPI-SIGN-TYPE": "2" }, signal: AbortSignal.timeout(10000) });
  const body = await response.json().catch(() => ({})) as { retCode?: number; retMsg?: string; result?: T };
  if (!response.ok || body.retCode !== 0) {
    const classification = classifyBybitFailure(response.status, body.retCode, body.retMsg);
    throw new BybitReadError({ provider: "bybit", environment: input.environment, hostname: new URL(input.baseUrl).hostname, deployment_version: readEnv("DENO_DEPLOYMENT_ID") ?? readEnv("GIT_COMMIT_SHA") ?? "unknown", credential: input.credential, endpoint: input.path, http_status: response.status, retCode: body.retCode ?? null, retMsg: body.retMsg ?? response.statusText, clock_delta_ms: input.clock.delta, ...classification, request: { method: "GET", path: input.path, normalized_query: query, timestamp_ms: Number(timestamp), receive_window_ms: Number(recvWindow), signer_version: "bybit-v5-hmac-sha256-type-2" }, read_only: true, mutations_attempted: 0 });
  }
  return body.result as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers });
  const supabase = createClient(readEnv("SUPABASE_URL") ?? "", readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) return new Response(JSON.stringify({ success: false, blocker: auth.error }), { status: auth.status, headers });
  const body = await req.json().catch(() => ({})) as Json;
  if (body.action !== "prove_bybit_trade_management") return new Response(JSON.stringify({ success: false, blocker: "read_only_action_required" }), { status: 400, headers });
  const environment = resolveBybitEnvironment(readEnv); const baseUrl = resolveBybitBaseUrl(environment, readEnv); const clock = await serverClock(baseUrl);
  try {
    const resolved = await resolveOperatorProviderCredential(supabase, "bybit", environment, { customerId: body.customer_id ? String(body.customer_id) : undefined, accountId: body.account_id ? String(body.account_id) : undefined });
    const credential = await credentialMetadata(resolved.credential.apiKey, resolved.credential.apiSecret, resolved.source, resolved.secretNames);
    const result = await withEdgeProviderCredential(resolved.credential, async () => {
      const request = <T>(path: string, params: Record<string, string | number | boolean>) => signedGet<T>({ ...resolved.credential, baseUrl, environment, credential, clock, path, params });
      // Authenticate with the smallest account read first, then continue the proof.
      const wallet = await request<Json>("/v5/account/wallet-balance", { accountType: "UNIFIED" });
      const positionsResult = await request<Json>("/v5/position/list", { category: "linear", settleCoin: "USDT" });
      const ordersResult = await request<Json>("/v5/order/realtime", { category: "linear", settleCoin: "USDT", openOnly: 0 });
      const positions = ((positionsResult.list ?? []) as Json[]).filter((row) => Number(row.size ?? 0) > 0); const orders = (ordersResult.list ?? []) as Json[];
      const protection = positions.map((position) => { const symbol = String(position.symbol ?? ""); const protective = orders.filter((order) => order.symbol === symbol && (order.reduceOnly === true || String(order.reduceOnly) === "true")); const sl = Boolean(position.stopLoss) || protective.some((order) => /stop|sl/i.test(String(order.orderType ?? order.stopOrderType ?? order.orderLinkId ?? ""))); const tp = Boolean(position.takeProfit) || protective.some((order) => /take|tp/i.test(String(order.orderType ?? order.stopOrderType ?? order.orderLinkId ?? ""))); return { symbol, state: sl && tp ? "protected" : sl || tp ? "partially_protected" : "unsafe", sl_present: sl, tp_present: tp }; });
      return { success: true, target: "bybit-demo-execution", provider: "bybit", environment, hostname: new URL(baseUrl).hostname, credential, clock_delta_ms: clock.delta, read_only: true, mutations_attempted: 0, wallet_reachable: Boolean(wallet), positions_found: positions.length, open_orders_found: orders.length, protection, credential_resolution: { source: resolved.source, attempted: resolved.attempts }, account: { account_id: resolved.credential.ownership.account_id, execution_scope_key: resolved.credential.ownership.execution_scope_key } };
    });
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error) {
    const receipt = error instanceof BybitReadError ? error.receipt : { blocker: error instanceof Error ? error.message : String(error) };
    return new Response(JSON.stringify({ success: false, target: "bybit-demo-execution", provider: "bybit", environment, hostname: new URL(baseUrl).hostname, ...receipt, read_only: true, mutations_attempted: 0, credential_resolution: { attempted: error instanceof OperatorCredentialResolutionError ? error.attempts : { explicit_account: Boolean(body.account_id), operational_account: !body.account_id, system_secret: !body.account_id } } }), { status: 200, headers });
  }
});
