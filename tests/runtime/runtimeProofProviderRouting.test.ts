import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  runtimeProofProviders,
  selectRuntimeProofAccount,
  validateRuntimeProofAccount,
  type RuntimeProofAccount,
} from "../../supabase/functions/_shared/runtime-proof-routing.ts";

const account = (provider: "binance" | "bybit", overrides: Partial<RuntimeProofAccount> = {}): RuntimeProofAccount => ({
  customer_id: "customer-a",
  account_id: provider === "binance" ? "canonical-binance-testnet-system" : "native-bybit-demo-system",
  provider,
  environment: provider === "binance" ? "testnet" : "demo",
  enabled: true,
  is_operational: true,
  execution_enabled: false,
  ...overrides,
});

assert.deepEqual(runtimeProofProviders("binance"), ["binance"], "Binance scope invokes Binance only");
assert.deepEqual(runtimeProofProviders("bybit"), ["bybit"], "Bybit scope invokes Bybit only");
assert.deepEqual(runtimeProofProviders("all"), ["binance", "bybit"], "all scope resolves both providers");

assert.equal(validateRuntimeProofAccount(account("binance"), "binance").account_id, "canonical-binance-testnet-system");
assert.equal(validateRuntimeProofAccount(account("bybit"), "bybit").account_id, "native-bybit-demo-system");
assert.throws(() => validateRuntimeProofAccount(account("binance"), "bybit"), /RUNTIME_PROOF_ACCOUNT_PROVIDER_MISMATCH/);
assert.throws(() => validateRuntimeProofAccount(account("bybit"), "binance"), /RUNTIME_PROOF_ACCOUNT_PROVIDER_MISMATCH/);
assert.throws(() => validateRuntimeProofAccount(account("binance", { environment: "demo" }), "binance"), /RUNTIME_PROOF_ACCOUNT_ENVIRONMENT_MISMATCH/);
assert.throws(() => validateRuntimeProofAccount(undefined, "binance"), /RUNTIME_PROOF_ACCOUNT_NOT_FOUND/);
assert.throws(() => validateRuntimeProofAccount(account("binance", { execution_enabled: true }), "binance"), /RUNTIME_PROOF_EXECUTION_ENABLED/);
assert.throws(() => validateRuntimeProofAccount(account("binance", { enabled: false, is_operational: false }), "binance"), /RUNTIME_PROOF_ACCOUNT_NOT_SELECTABLE/);

const selectedBybit = selectRuntimeProofAccount([
  account("bybit", { account_id: "selectable", is_operational: false }),
  account("bybit", { account_id: "operational" }),
], "bybit");
assert.equal(selectedBybit.account_id, "operational", "operational account wins within provider/environment scope");

const coordinator = readFileSync("supabase/functions/admin-operator-action/index.ts", "utf8");
assert.match(coordinator, /providers\.length === 1/, "explicit account is used only for a single-provider proof");
assert.match(coordinator, /\.eq\("provider", provider\)\.eq\("environment", expected\.environment\)/, "fallback lookup is provider/environment scoped");
assert.doesNotMatch(coordinator, /const selection = \{ customer_id:[\s\S]*\.\.\.selection[\s\S]*bybit-demo-execution/, "one explicit selection is never spread into both targets");
assert.match(coordinator, /mutations_attempted: 0/, "proof declares zero mutations");

console.log("runtime proof provider routing tests passed");
