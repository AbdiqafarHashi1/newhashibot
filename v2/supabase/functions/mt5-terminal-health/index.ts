import { assertScope, EdgeError, getBridgeOrThrow, handleEdge, insertBridgeEvent, insertBridgeLog, jsonResponse, nowIso, numberValue, optionalString, parseSignedBridgeRequest, requiredString, serviceClient } from "../_shared/hashibridge-edge.ts";

Deno.serve((req) => handleEdge(req, async (request) => {
  const { body, signature } = await parseSignedBridgeRequest(request);
  const bridgeId = optionalString(body, "bridge_id") || signature.deviceId;
  const mt5AccountId = requiredString(body, "mt5_account_id");
  const terminalId = requiredString(body, "terminal_id");
  const supabase = serviceClient();
  const bridge = await getBridgeOrThrow(supabase, bridgeId);
  assertScope(bridge.executor_id, optionalString(body, "executor_id"), "executor_id");
  const account = await supabase.from("v2_mt5_accounts").select("id,customer_id,executor_id,bridge_id").eq("id", mt5AccountId).maybeSingle();
  if (account.error) throw account.error;
  if (!account.data) throw new EdgeError("mt5_account_not_found", "MT5 account is not registered", 404);
  assertScope(account.data.bridge_id, bridgeId, "bridge_id"); assertScope(account.data.customer_id, bridge.customer_id, "customer_id"); assertScope(account.data.executor_id, bridge.executor_id, "executor_id");
  const connected = body.connected !== false;
  const tradeAllowed = body.trade_allowed !== false;
  const terminalStatus = connected && tradeAllowed ? "healthy" : connected ? "warning" : "offline";
  await supabase.from("v2_mt5_terminals").upsert({ id: terminalId, bridge_id: bridgeId, server: optionalString(body, "server"), status: terminalStatus, last_heartbeat_at: nowIso() });
  await supabase.from("v2_mt5_health").insert({ id: crypto.randomUUID(), bridge_id: bridgeId, account_id: mt5AccountId, status: terminalStatus, latency_ms: numberValue(body, "latency_ms"), reconnect_count: 0, offline_duration_ms: connected ? 0 : 30000, version: optionalString(body, "ea_version") });
  await supabase.from("v2_mt5_runtime").upsert({ id: `${bridgeId}:${mt5AccountId}`, bridge_id: bridgeId, account_id: mt5AccountId, state: { terminal_id: terminalId, ea_version: optionalString(body, "ea_version"), terminal_build: body.terminal_build, broker: optionalString(body, "broker"), connected, trade_allowed: tradeAllowed, dll_allowed: body.dll_allowed !== false, account_equity: body.account_equity, account_balance: body.account_balance, margin_level: body.margin_level, open_positions_count: numberValue(body, "open_positions_count"), open_orders_count: numberValue(body, "open_orders_count"), last_tick_at: optionalString(body, "last_tick_at"), metadata: body.metadata ?? {} }, updated_at: nowIso() });
  await insertBridgeEvent(supabase, bridgeId, bridge.customer_id, "mt5.terminal_heartbeat", terminalStatus === "healthy" ? "info" : "warning", { account_id: mt5AccountId, terminal_id: terminalId, status: terminalStatus });
  await insertBridgeLog(supabase, bridgeId, terminalStatus === "healthy" ? "info" : "warn", "mt5 terminal health accepted", { account_id: mt5AccountId, terminal_id: terminalId, status: terminalStatus });
  return jsonResponse({ terminal_status: terminalStatus, accepted_at: nowIso(), next_heartbeat_seconds: terminalStatus === "healthy" ? 30 : 10, server_time: nowIso() });
}));
