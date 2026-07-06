import { assertScope, getBridgeOrThrow, handleEdge, insertBridgeEvent, insertBridgeLog, jsonResponse, nowIso, numberValue, optionalString, parseSignedBridgeRequest, serviceClient } from "../_shared/hashibridge-edge.ts";

Deno.serve((req) => handleEdge(req, async (request) => {
  const { body, signature } = await parseSignedBridgeRequest(request);
  const bridgeId = optionalString(body, "bridge_id") || optionalString(body, "device_id") || signature.deviceId;
  const supabase = serviceClient();
  const bridge = await getBridgeOrThrow(supabase, bridgeId);
  assertScope(bridge.executor_id, optionalString(body, "executor_id"), "executor_id");
  const status = optionalString(body, "status") || "connected";
  const latencyMs = numberValue(body, "latency_ms");
  const reconnectCount = numberValue(body, "reconnect_count");
  const offlineSeconds = numberValue(body, "offline_duration_seconds");
  await supabase.from("v2_mt5_bridges").update({ status, version: optionalString(body, "agent_version") || "unknown" }).eq("id", bridgeId);
  await supabase.from("v2_mt5_health").insert({ id: crypto.randomUUID(), bridge_id: bridgeId, account_id: null, status, latency_ms: latencyMs, reconnect_count: reconnectCount, offline_duration_ms: Math.round(offlineSeconds * 1000), version: optionalString(body, "agent_version") });
  await insertBridgeEvent(supabase, bridgeId, bridge.customer_id, "bridge.heartbeat", status === "offline" ? "warning" : "info", { executor_id: bridge.executor_id, uptime_seconds: numberValue(body, "uptime_seconds"), queue_depth: numberValue(body, "queue_depth"), terminal_count: numberValue(body, "terminal_count") });
  await insertBridgeLog(supabase, bridgeId, status === "offline" ? "warn" : "info", "bridge heartbeat accepted", { latency_ms: latencyMs, reconnect_count: reconnectCount, offline_duration_seconds: offlineSeconds });
  return jsonResponse({ status, accepted_at: nowIso(), next_heartbeat_seconds: status === "offline" ? 10 : 30, server_time: nowIso() });
}));
