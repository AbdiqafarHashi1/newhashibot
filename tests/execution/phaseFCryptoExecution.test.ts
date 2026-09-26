import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCryptoSubmissionEnvelope, CryptoPhaseFRejection, projectCryptoLifecycle, safeCryptoExecutionProjection } from "../../supabase/functions/_shared/crypto-phase-f-execution.ts";

const now = "2026-09-25T12:00:00.000Z";
const lineage = (provider: "BINANCE"|"BYBIT", account = provider.toLowerCase(), customer = "customer-a", overrides: Record<string,unknown> = {}) => ({ decisionId:`decision-${account}`, intentId:`intent-${account}`, signalId:"signal-shared", customerId:customer, executionAccountId:account, immutableAccountIdentity:`${provider}:sandbox:${account}`, provider, decision:"ALLOW" as const, policyProfileId:"balanced", policyVersion:"7", brainVersion:"crypto-personal/v1", authorizedRiskPct:.4, approvedQuantity:.012345, evaluatedAt:"2026-09-25T11:59:30.000Z", ...overrides });
const route = (provider: "BINANCE"|"BYBIT", account = provider.toLowerCase(), customer = "customer-a", overrides: Record<string,unknown> = {}) => ({ provider, executionAccountId:account, customerId:customer, immutableAccountIdentity:`${provider}:sandbox:${account}`, environment:(provider === "BINANCE" ? "TESTNET" : "DEMO") as "TESTNET"|"DEMO", executionEnabled:true, operational:true, providerHealth:"HEALTHY" as const, symbol:"BTCUSDT", symbolStatus:"TRADING", symbolObservedAt:"2026-09-25T11:59:55.000Z", tickSize:.1, stepSize:.001, minimumQuantity:.001, minimumNotional:5, permissions:{trading:true,withdrawal:false,verified:true}, ...overrides });
const make = (provider: "BINANCE"|"BYBIT", l=lineage(provider), r=route(provider)) => createCryptoSubmissionEnvelope({ lineage:l, route:r, deterministicClientOrderId:`entry-${provider.toLowerCase()}`, requestedPrice:60123.456, now, maximumIntentAgeMs:120_000, maximumSymbolAgeMs:60_000 });
const rejects = (code:string, fn:()=>unknown) => assert.throws(fn, (error:unknown) => error instanceof CryptoPhaseFRejection && error.code === code);

// One canonical signal is independently scoped and submitted to both accounts.
const binance = make("BINANCE"), bybit = make("BYBIT");
assert.equal(binance.lineage.signalId, bybit.lineage.signalId);
assert.notEqual(binance.idempotencyKey, bybit.idempotencyKey);
assert.equal(binance.environment, "TESTNET"); assert.equal(bybit.environment, "DEMO");
assert.equal(binance.requestedQuantity, .012345); assert.equal(binance.submittedQuantity, .012);
assert.equal(binance.requestedPrice, 60123.456); assert.equal(binance.submittedPrice, 60123.5);
assert.deepEqual(binance.normalization.map(x=>x.field), ["quantity","price"]);
assert.match(binance.normalization[0].reason, /STEP_SIZE/); // precision only; authorized risk is untouched.
const reduced = make("BYBIT", lineage("BYBIT","bybit","customer-a",{decision:"REDUCE",approvedQuantity:.0078}));
assert.equal(reduced.requestedQuantity,.0078); assert.equal(reduced.submittedQuantity,.007); assert.equal(reduced.authorizedRiskPct,.4);

rejects("PHASE_D_DECISION_NOT_EXECUTABLE",()=>make("BINANCE",lineage("BINANCE","binance","customer-a",{decision:"BLOCK"}) as ReturnType<typeof lineage>));
rejects("PHASE_D_DECISION_NOT_EXECUTABLE",()=>make("BYBIT",lineage("BYBIT","bybit","customer-a",{decision:"LOCK"}) as ReturnType<typeof lineage>));
rejects("CUSTOMER_SCOPE_MISMATCH",()=>make("BINANCE",lineage("BINANCE"),route("BINANCE","binance","customer-b") as ReturnType<typeof route>));
rejects("ACCOUNT_SCOPE_MISMATCH",()=>make("BINANCE",lineage("BINANCE"),route("BINANCE","other") as ReturnType<typeof route>));
rejects("CRYPTO_INTENT_STALE",()=>make("BINANCE",lineage("BINANCE","binance","customer-a",{evaluatedAt:"2026-09-25T10:00:00Z"}) as ReturnType<typeof lineage>));
rejects("PROVIDER_ROUTE_NOT_READY",()=>make("BYBIT",lineage("BYBIT"),route("BYBIT","bybit","customer-a",{providerHealth:"UNHEALTHY"}) as ReturnType<typeof route>));
rejects("LIVE_EXECUTION_FORBIDDEN",()=>make("BINANCE",lineage("BINANCE"),route("BINANCE","binance","customer-a",{environment:"LIVE"}) as ReturnType<typeof route>));
rejects("UNSAFE_WITHDRAWAL_PERMISSION",()=>make("BYBIT",lineage("BYBIT"),route("BYBIT","bybit","customer-a",{permissions:{trading:true,withdrawal:true,verified:true}}) as ReturnType<typeof route>));
rejects("SYMBOL_NOT_AVAILABLE",()=>make("BINANCE",lineage("BINANCE"),route("BINANCE","binance","customer-a",{symbolStatus:"BREAK"}) as ReturnType<typeof route>));
rejects("MINIMUM_NOTIONAL_NOT_MET",()=>make("BINANCE",lineage("BINANCE","binance","customer-a",{approvedQuantity:.001}),route("BINANCE","binance","customer-a",{minimumNotional:100}) as ReturnType<typeof route>));
assert.deepEqual(make("BINANCE"),make("BINANCE")); // durable account+intent+client identity is deterministic.

let state = projectCryptoLifecycle("ENTRY_SUBMITTED","PARTIAL_FILL");
state = projectCryptoLifecycle(state,"PROTECTION_REQUESTED"); assert.equal(state,"PROTECTION_PENDING");
state = projectCryptoLifecycle(state,"PROTECTION_VERIFIED"); assert.equal(state,"PROTECTION_VERIFIED");
state = projectCryptoLifecycle(state,"TP1_FILLED"); state=projectCryptoLifecycle(state,"BREAKEVEN_CONFIRMED"); state=projectCryptoLifecycle(state,"PROFIT_LOCK_CONFIRMED"); state=projectCryptoLifecycle(state,"TRAILING_ACTIVE"); state=projectCryptoLifecycle(state,"TP2_FILLED"); assert.equal(state,"CLOSED");
assert.equal(projectCryptoLifecycle("ENTRY_FILLED","PROTECTION_MISSING"),"PROTECTION_INCIDENT");
assert.equal(projectCryptoLifecycle("PROTECTION_INCIDENT","SAFETY_CLOSE_REQUESTED"),"SAFETY_CLOSING");
assert.equal(projectCryptoLifecycle("SUBMISSION_UNCERTAIN","RECONCILIATION_STARTED"),"RECONCILING");
rejects("PROTECTION_VERIFICATION_OUT_OF_SEQUENCE",()=>projectCryptoLifecycle("ENTRY_FILLED","PROTECTION_VERIFIED"));

const serialized=JSON.stringify(safeCryptoExecutionProjection(binance)).toLowerCase();
for (const secret of ["api_key","secret_key","credential_ref","access_token","password"]) assert.equal(serialized.includes(secret),false);
const adoption=readFileSync("supabase/functions/_shared/professional-execution-adoption.ts","utf8");
assert.match(adoption,/lookupByClientId\(order\.client_order_id\)/); assert.match(adoption,/no retry submitted/i); assert.match(adoption,/ENTRY_PARTIALLY_FILLED/); assert.match(adoption,/PROTECTION_VERIFIED/);
const migration=readFileSync("supabase/migrations/20260925210000_phase_f_crypto_execution.sql","utf8");
assert.match(migration,/unique\(execution_account_id,intent_id\)/i); assert.match(migration,/LIVE_EXECUTION_FORBIDDEN/); assert.match(migration,/PROTECTION_PENDING/); assert.match(migration,/service_role/); assert.match(migration,/requested_quantity/);
console.log("Phase F Binance + Bybit execution and unified protection tests passed");
