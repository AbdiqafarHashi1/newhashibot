import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMt5EntryCommand, Mt5PhaseERejection, projectMt5Lifecycle } from "../../supabase/functions/_shared/mt5-phase-e-execution.ts";

const now = "2026-09-25T12:00:00.000Z";
const lineage = (overrides: Record<string, unknown> = {}) => ({
  decisionId: "decision-personal", intentId: "intent-shared-signal", signalId: "10000000-0000-4000-8000-000000000001",
  customerId: "customer-a", executionAccountId: "execution-personal", immutableAccountIdentity: "MT5_PERSONAL:demo:101",
  provider: "MT5_PERSONAL" as const, decision: "ALLOW" as const, policyProfileId: "personal-safe", policyVersion: "4",
  brainVersion: "mt5-personal/v1", authorizedRiskPct: 0.5, approvedQuantity: 0.12, evaluatedAt: "2026-09-25T11:59:30.000Z", ...overrides,
});
const route = (overrides: Record<string, unknown> = {}) => ({
  provider: "MT5_PERSONAL" as const,
  executionAccountId: "execution-personal", mt5AccountId: "mt5-personal", customerId: "customer-a",
  immutableAccountIdentity: "MT5_PERSONAL:demo:101", bridgeId: "bridge-a", assignedBridgeId: "bridge-a",
  accountMode: "PERSONAL" as const, environment: "DEMO" as const, executionEnabled: true, operational: true,
  providerHealth: "HEALTHY" as const, lastHeartbeatAt: "2026-09-25T11:59:50.000Z", ...overrides,
});
const command = (l = lineage(), r = route()) => createMt5EntryCommand({ lineage:l, route:r, executionPlanId:"plan-1", deterministicOrderId:"order-entry", symbol:"EURUSD", side:"BUY", stopLoss:1.09, takeProfit1:1.11, takeProfit2:1.12, now, maximumIntentAgeMs:120_000 });
const rejects = (code: string, fn: () => unknown) => assert.throws(fn, (error: unknown) => error instanceof Mt5PhaseERejection && error.code === code);

// One canonical signal fans out independently; account identity is part of idempotency.
const personal = command();
const prop = command(lineage({ decisionId:"decision-prop", executionAccountId:"execution-prop", immutableAccountIdentity:"MT5_PROP:demo:202", provider:"MT5_PROP", policyProfileId:"prop-safe", brainVersion:"mt5-prop/v1", approvedQuantity:0.04 }), route({ provider:"MT5_PROP", executionAccountId:"execution-prop", mt5AccountId:"mt5-prop", immutableAccountIdentity:"MT5_PROP:demo:202", accountMode:"PROP_EVALUATION" }));
assert.notEqual(personal.idempotencyKey, prop.idempotencyKey);
assert.equal(personal.payload.signal_id, prop.payload.signal_id);
assert.equal(personal.payload.quantity, 0.12);
assert.equal(prop.payload.quantity, 0.04); // REDUCE/Prop-approved size is preserved, not recomputed.

rejects("PHASE_D_DECISION_NOT_EXECUTABLE", () => command(lineage({ decision:"BLOCK" }) as ReturnType<typeof lineage>));
rejects("PHASE_D_DECISION_NOT_EXECUTABLE", () => command(lineage({ decision:"LOCK" }) as ReturnType<typeof lineage>));
rejects("CUSTOMER_SCOPE_MISMATCH", () => command(lineage(), route({ customerId:"customer-b" }) as ReturnType<typeof route>));
rejects("ACCOUNT_SCOPE_MISMATCH", () => command(lineage(), route({ executionAccountId:"execution-other" }) as ReturnType<typeof route>));
rejects("BRIDGE_ACCOUNT_SCOPE_MISMATCH", () => command(lineage(), route({ assignedBridgeId:"bridge-b" }) as ReturnType<typeof route>));
rejects("MT5_INTENT_STALE", () => command(lineage({ evaluatedAt:"2026-09-25T11:00:00.000Z" }) as ReturnType<typeof lineage>));
rejects("MT5_BRIDGE_HEARTBEAT_STALE", () => command(lineage(), route({ lastHeartbeatAt:"2026-09-25T11:50:00.000Z" }) as ReturnType<typeof route>));
rejects("MT5_ACCOUNT_NOT_READY", () => command(lineage(), route({ providerHealth:"UNHEALTHY" }) as ReturnType<typeof route>));
rejects("LIVE_EXECUTION_FORBIDDEN", () => command(lineage(), route({ environment:"LIVE" }) as ReturnType<typeof route>));
rejects("MT5_ACCOUNT_MODE_MISMATCH", () => command(lineage(), route({ accountMode:"PROP_FUNDED" }) as ReturnType<typeof route>));

// Duplicate calls are byte-for-byte deterministic; DB uniqueness makes delivery a no-op.
assert.deepEqual(command(), command());
assert.equal(projectMt5Lifecycle("QUEUED", { type:"COMMAND_REJECTED" }), "REJECTED");
assert.equal(projectMt5Lifecycle("QUEUED", { type:"SUBMISSION_UNCERTAIN" }), "SUBMISSION_UNCERTAIN");
assert.equal(projectMt5Lifecycle("QUEUED", { type:"PARTIAL_FILL" }), "PARTIALLY_FILLED");
assert.equal(projectMt5Lifecycle("QUEUED", { type:"FILL_CONFIRMED" }), "FILLED_PROTECTION_PENDING");
assert.equal(projectMt5Lifecycle("FILLED_PROTECTION_PENDING", { type:"PROTECTION_MISSING" }), "PROTECTION_INCIDENT");
assert.equal(projectMt5Lifecycle("FILLED_PROTECTION_PENDING", { type:"PROTECTION_FAILED" }), "PROTECTION_INCIDENT");
assert.equal(projectMt5Lifecycle("PROTECTION_INCIDENT", { type:"RECONCILIATION_STARTED" }), "RECONCILING");
assert.equal(projectMt5Lifecycle("FILLED_PROTECTION_PENDING", { type:"PROTECTION_CONFIRMED" }), "PROTECTED");
assert.equal(projectMt5Lifecycle("PROTECTED", { type:"TP1_FILLED" }), "TP1_PROTECTED");
assert.equal(projectMt5Lifecycle("TP1_PROTECTED", { type:"BREAKEVEN_CONFIRMED" }), "BREAKEVEN");
assert.equal(projectMt5Lifecycle("BREAKEVEN", { type:"TP2_FILLED" }), "TP2_CLOSED");

const serialized = JSON.stringify(personal);
for (const secret of ["password", "credential", "account_number", "secret", "token"]) assert.equal(serialized.toLowerCase().includes(secret), false);

const migration = readFileSync("supabase/migrations/20260925180000_phase_e_mt5_demo_execution.sql", "utf8");
assert.match(migration, /unique\(execution_account_id,intent_id\)/i);
assert.match(migration, /LIVE_EXECUTION_FORBIDDEN/);
assert.match(migration, /FILLED_PROTECTION_PENDING/);
assert.match(migration, /PROTECTION_INCIDENT/);
assert.match(migration, /lease_expires_at/);
assert.match(migration, /service_role/);

console.log("Phase E MT5 Personal + Prop demo execution tests passed");
