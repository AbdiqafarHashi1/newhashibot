import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runCertifiedRuntime, assertCertifiedExecutionInput } from "../../supabase/functions/_shared/certified-runtime.js";
import { context, cryptoSpec, upstream } from "../execution/professionalExecutionPlanning.test.js";
import { planExecution } from "../../supabase/functions/_shared/professional-execution-planning.js";

const now = new Date("2026-07-26T12:00:00.000Z");
const noTrade = runCertifiedRuntime({ candidates: [], strategy_plans: {}, arbitration: { now }, accounts: [] });
assert.equal(noTrade.arbitration.decision, "NO_TRADE");
assert.equal(noTrade.approved_strategy_plan, null);
assert.deepEqual(noTrade.accounts, []);
assert.ok(Object.isFrozen(noTrade));
const suppliedNoTrade = runCertifiedRuntime({ candidates: [], strategy_plans: {}, arbitration: { now }, arbitration_result: { ...noTrade.arbitration }, accounts: [] });
assert.equal(suppliedNoTrade.arbitration.decision, "NO_TRADE", "scanner-supplied NO_TRADE decisions must return safely without a winner");

const allocation = upstream("BINANCE");
const execution = planExecution(context(allocation, cryptoSpec("BINANCE")));
assert.doesNotThrow(() => assertCertifiedExecutionInput(execution, "binance-account"));
assert.throws(() => assertCertifiedExecutionInput(execution, "another-account"), /account_lineage/);
const mutable = structuredClone(execution);
assert.throws(() => assertCertifiedExecutionInput(mutable, "binance-account"), /not_certified/);

const runtime = readFileSync("supabase/functions/_shared/certified-runtime.ts", "utf8");
assert.equal((runtime.match(/arbitrate\(/g) ?? []).length, 1, "one arbitrator invocation");
assert.equal((runtime.match(/evaluateRisk\(/g) ?? []).length, 1, "one risk authority invocation");
assert.equal((runtime.match(/allocateCapital\(/g) ?? []).length, 1, "one sizing authority invocation");
assert.equal((runtime.match(/planExecution\(/g) ?? []).length, 1, "one execution planning authority invocation");
assert.ok(runtime.includes("capital_context_cross_account_scope"));
assert.ok(runtime.includes("execution_context_lineage_mismatch"));

const migration = readFileSync("supabase/migrations/20260727000000_phase1ga_certified_runtime_preparation.sql", "utf8");
assert.ok(!/cron\.schedule|net\.http_post/i.test(migration));
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("unique (account_id, idempotency_key)"));
assert.ok(migration.includes("normalized_status text not null"));
assert.ok(migration.includes("create table if not exists public.certified_strategy_plans"));

const scanner = readFileSync("supabase/functions/market-scanner/index.ts", "utf8");
const binanceExecutor = readFileSync("supabase/functions/binance-testnet-execution/index.ts", "utf8");
const mt5Bridge = readFileSync("supabase/functions/mt5-bridge/index.ts", "utf8");
assert.ok(!scanner.includes("tryAutoExecuteTestnet"), "scanner only adopts certified execution plans");
assert.ok(scanner.includes('.from("certified_strategy_plans").insert'), "arbitrator winner StrategyPlan is actively persisted");
assert.ok(scanner.includes("certified_strategy_plan_persistence_failed"), "winner persistence fails closed");
assert.ok(!scanner.slice(scanner.indexOf("async function tryAutoExecuteTestnet"), scanner.indexOf("// ─── Heartbeat updater")).includes("fetch("), "scanner cannot invoke a legacy executor");
assert.ok(binanceExecutor.match(/certified_execution_plan_required/g)!.length >= 2, "Binance and Bybit SignalRow execution fail closed");
assert.ok(mt5Bridge.includes('command.payload?.certified !== true') && mt5Bridge.includes('eq("state","completed")'), "MT5 polling requires certified completed claim");
assert.ok(mt5Bridge.includes("legacy_queue_disabled: true"), "legacy MT5 queue is unreachable");

for (const monitor of [
  "supabase/functions/binance-testnet-monitor/index.ts",
  "supabase/functions/bybit-testnet-monitor/index.ts",
  "supabase/functions/mt5-bridge/index.ts",
]) assert.ok(readFileSync(monitor, "utf8").length > 0, `${monitor} remains preserved`);

for (const adapter of [
  "BinanceTestnetAdoptionAdapter",
  "BybitDemoAdoptionAdapter",
  "Mt5PersonalDemoAdoptionAdapter",
  "Mt5PropDemoAdoptionAdapter",
]) assert.ok(readFileSync("supabase/functions/_shared/professional-execution-adapters.ts", "utf8").includes(adapter));

console.log("Phase 1G-A certified runtime golden tests passed");
