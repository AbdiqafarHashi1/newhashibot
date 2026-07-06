import { arrayValue, assertScope, getBridgeOrThrow, handleEdge, insertBridgeEvent, insertBridgeLog, jsonResponse, newId, nowIso, numberValue, optionalString, parseSignedBridgeRequest, serviceClient } from "../_shared/hashibridge-edge.ts";

Deno.serve((req) => handleEdge(req, async (request) => {
  const { body, signature } = await parseSignedBridgeRequest(request);
  const bridgeId = optionalString(body, "bridge_id") || optionalString(body, "device_id") || signature.deviceId;
  const executorId = optionalString(body, "executor_id");
  const supabase = serviceClient();
  const bridge = await getBridgeOrThrow(supabase, bridgeId);
  assertScope(bridge.executor_id, executorId, "executor_id");
  for (const ack of arrayValue(body, "acknowledgements")) {
    const row = ack as Record<string, unknown>;
    if (row.command_id) await supabase.from("v2_execution_commands").update({ status: row.ok === false ? "RETRY_SCHEDULED" : "RUNNING", updated_at: nowIso(), metadata: { bridge_ack: row } }).eq("command_id", row.command_id);
  }
  for (const result of arrayValue(body, "results")) {
    const row = result as Record<string, unknown>;
    if (row.command_id) await supabase.from("v2_execution_command_events").insert({ command_id: row.command_id, event_type: row.ok === false ? "BRIDGE_RESULT_FAILED" : "BRIDGE_RESULT_ACCEPTED", payload: row });
  }
  const maxBatchSize = Math.max(0, Math.min(numberValue(body, "max_batch_size", 10), 25));
  const query = supabase.from("v2_execution_commands").select("command_id,idempotency_key,customer_id,account_id,executor_id,provider,environment,symbol,market,side,action,purpose,payload,priority,attempt_count,created_at,metadata").eq("executor_id", bridge.executor_id).in("status", ["QUEUED", "RETRY_SCHEDULED"]).order("priority", { ascending: true }).order("created_at", { ascending: true }).limit(maxBatchSize);
  const { data, error } = await query;
  if (error) throw error;
  const commands = (data ?? []).map((command) => ({ ...command, transport: "hashibridge", bridge_id: bridgeId }));
  if (commands.length) await supabase.from("v2_execution_commands").update({ status: "LOCKED", locked_by: bridgeId, locked_at: nowIso(), lock_expires_at: new Date(Date.now()+60_000).toISOString(), updated_at: nowIso() }).in("command_id", commands.map((c) => c.command_id));
  await supabase.from("v2_mt5_sync").insert({ id: newId("sync"), bridge_id: bridgeId, account_id: optionalString(body, "mt5_account_id"), sync_type: "command_poll", status: "accepted", payload: { command_count: commands.length, last_seen_command_id: optionalString(body, "last_seen_command_id"), terminal_status: body.terminal_status, account_status: body.account_status } });
  await insertBridgeEvent(supabase, bridgeId, bridge.customer_id, "bridge.sync", "info", { command_count: commands.length, acknowledgement_count: arrayValue(body, "acknowledgements").length, result_count: arrayValue(body, "results").length });
  await insertBridgeLog(supabase, bridgeId, "info", "bridge sync accepted", { command_count: commands.length });
  return jsonResponse({ commands, batch_id: newId("batch"), server_time: nowIso(), next_poll_seconds: commands.length ? 1 : 5, sync_status: commands.length ? "commands_available" : "idle" });
}));
