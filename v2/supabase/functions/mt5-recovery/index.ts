import { assertScope, EdgeError, getBridgeOrThrow, handleEdge, insertBridgeEvent, insertBridgeLog, jsonResponse, newId, nowIso, optionalString, parseJsonBody, requiredString, serviceClient } from "../_shared/hashibridge-edge.ts";

const allowedActions = new Set(["reconnect_bridge", "reconnect_terminal", "replay_queue", "reconcile_positions", "repair_protection", "resync_account", "stop_mt5_executor", "restart_mt5_executor"]);
const runtimeActionMap: Record<string, string> = { reconnect_bridge: "recovery", reconnect_terminal: "recovery", replay_queue: "recover_queue", reconcile_positions: "recovery", repair_protection: "recover_protection", resync_account: "account_sync", stop_mt5_executor: "stop", restart_mt5_executor: "restart" };

Deno.serve((req) => handleEdge(req, async (request) => {
  const body = await parseJsonBody(request);
  const action = requiredString(body, "action");
  if (!allowedActions.has(action)) throw new EdgeError("invalid_recovery_action", "Unsupported MT5 recovery action", 400, { action });
  const customerId = requiredString(body, "customer_id");
  const executorId = requiredString(body, "executor_id");
  const bridgeId = requiredString(body, "bridge_id");
  const accountId = optionalString(body, "mt5_account_id") || optionalString(body, "account_id");
  const actorRole = optionalString(body, "actor_role") || "customer";
  if (!['customer','admin','owner','system'].includes(actorRole)) throw new EdgeError("invalid_actor", "Invalid recovery actor role", 403);
  const supabase = serviceClient();
  const bridge = await getBridgeOrThrow(supabase, bridgeId);
  assertScope(bridge.customer_id, customerId, "customer_id"); assertScope(bridge.executor_id, executorId, "executor_id");
  if (accountId) { const account = await supabase.from("v2_mt5_accounts").select("id,customer_id,executor_id,bridge_id").eq("id", accountId).maybeSingle(); if (account.error) throw account.error; if (!account.data) throw new EdgeError("mt5_account_not_found", "MT5 account is not registered", 404); assertScope(account.data.customer_id, customerId, "customer_id"); assertScope(account.data.executor_id, executorId, "executor_id"); assertScope(account.data.bridge_id, bridgeId, "bridge_id"); }
  const recoveryId = newId("mt5rec");
  const nextSteps = ["recorded", "queued_for_worker", "verify_bridge_heartbeat", "verify_trade_truth_after_recovery"];
  const { error } = await supabase.from("v2_mt5_recovery").insert({ id: recoveryId, bridge_id: bridgeId, account_id: accountId, reason: optionalString(body, "reason") || action, status: "queued", actions: [action, ...nextSteps] });
  if (error) throw error;
  const runtime = await supabase.from("executor_runtime").select("id,customer_id").eq("executor_key", executorId).maybeSingle();
  await supabase.from("runtime_actions").insert({ executor_id: runtime.data?.id ?? null, customer_id: customerId, actor_role: actorRole === "owner" ? "admin" : actorRole, actor_id: body.actor_id ?? null, action: runtimeActionMap[action] ?? "recovery", status: "queued", payload: { recovery_id: recoveryId, bridge_id: bridgeId, mt5_account_id: accountId, action, metadata: body.metadata ?? {} } });
  await insertBridgeEvent(supabase, bridgeId, customerId, "mt5.recovery_requested", "warning", { recovery_id: recoveryId, account_id: accountId, action });
  await insertBridgeLog(supabase, bridgeId, "warn", "mt5 recovery queued", { recovery_id: recoveryId, action, account_id: accountId });
  return jsonResponse({ recovery_id: recoveryId, action, status: "queued", queued_at: nowIso(), next_steps: nextSteps });
}));
