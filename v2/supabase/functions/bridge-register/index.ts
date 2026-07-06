import { arrayValue, assertScope, handleEdge, insertBridgeEvent, insertBridgeLog, jsonResponse, newId, nowIso, optionalString, parseSignedBridgeRequest, requiredString, serviceClient } from "../_shared/hashibridge-edge.ts";

Deno.serve((req) => handleEdge(req, async (request) => {
  const { body, signature } = await parseSignedBridgeRequest(request);
  const bridgeId = optionalString(body, "bridge_id") || optionalString(body, "device_id") || signature.deviceId;
  const customerId = requiredString(body, "customer_id");
  const executorId = requiredString(body, "executor_id");
  const machineId = optionalString(body, "machine_fingerprint") || optionalString(body, "machine_id") || bridgeId;
  const agentVersion = optionalString(body, "agent_version") || optionalString(body, "version") || "unknown";
  const supabase = serviceClient();
  const existing = await supabase.from("v2_mt5_bridges").select("id,customer_id,executor_id,status").eq("id", bridgeId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) { assertScope(existing.data.customer_id, customerId, "customer_id"); assertScope(existing.data.executor_id, executorId, "executor_id"); }
  const { error } = await supabase.from("v2_mt5_bridges").upsert({ id: bridgeId, customer_id: customerId, executor_id: executorId, machine_id: machineId, status: "connected", version: agentVersion });
  if (error) throw error;
  await supabase.from("v2_mt5_agents").upsert({ id: optionalString(body, "agent_id") || bridgeId, bridge_id: bridgeId, version: agentVersion, capabilities: arrayValue(body, "capabilities") });
  await insertBridgeEvent(supabase, bridgeId, customerId, existing.data ? "bridge.verified" : "bridge.registered", "info", { executor_id: executorId, platform: optionalString(body, "platform"), hostname: optionalString(body, "hostname"), request: newId("req") });
  await insertBridgeLog(supabase, bridgeId, "info", "bridge registration accepted", { agent_version: agentVersion, platform: optionalString(body, "platform"), hostname: optionalString(body, "hostname") });
  return jsonResponse({ bridge_id: bridgeId, status: existing.data ? "verified" : "registered", registered_at: existing.data ? undefined : nowIso(), verified_at: existing.data ? nowIso() : undefined, next_heartbeat_seconds: 30, server_time: nowIso() });
}));
