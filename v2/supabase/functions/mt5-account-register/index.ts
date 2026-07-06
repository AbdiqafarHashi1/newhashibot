import { arrayValue, assertScope, EdgeError, getBridgeOrThrow, handleEdge, insertBridgeEvent, insertBridgeLog, jsonResponse, newId, nowIso, optionalString, parseJsonBody, requiredString, serviceClient } from "../_shared/hashibridge-edge.ts";

Deno.serve((req) => handleEdge(req, async (request) => {
  const body = await parseJsonBody(request);
  const customerId = requiredString(body, "customer_id");
  const executorId = requiredString(body, "executor_id");
  const bridgeId = requiredString(body, "bridge_id");
  const accountId = optionalString(body, "account_id") || newId("mt5acct");
  const credentialRef = requiredString(body, "credential_ref");
  if ("password" in body || "credential_value" in body) throw new EdgeError("secret_rejected", "Plaintext MT5 passwords or credential values are not accepted", 400);
  const supabase = serviceClient();
  const bridge = await getBridgeOrThrow(supabase, bridgeId);
  assertScope(bridge.customer_id, customerId, "customer_id");
  assertScope(bridge.executor_id, executorId, "executor_id");
  const row = { id: accountId, customer_id: customerId, executor_id: executorId, bridge_id: bridgeId, login: requiredString(body, "login"), server: requiredString(body, "server"), environment: optionalString(body, "environment") || "demo", credential_ref: credentialRef, investor_credential_ref: optionalString(body, "investor_credential_ref"), metadata: { broker: optionalString(body, "broker"), account_type: optionalString(body, "account_type"), currency: optionalString(body, "currency"), leverage: body.leverage, capabilities: arrayValue(body, "capabilities"), metadata: body.metadata ?? {} } };
  const { error } = await supabase.from("v2_mt5_accounts").upsert(row);
  if (error) throw error;
  await insertBridgeEvent(supabase, bridgeId, customerId, "mt5.account_registered", "info", { account_id: accountId, executor_id: executorId, environment: row.environment });
  await insertBridgeLog(supabase, bridgeId, "info", "mt5 account registration accepted", { account_id: accountId, environment: row.environment });
  return jsonResponse({ mt5_account_id: accountId, status: "registered", environment: row.environment, registered_at: nowIso() });
}));
