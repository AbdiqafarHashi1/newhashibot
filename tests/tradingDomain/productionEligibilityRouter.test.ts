import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pinnedClaimFromQualifiedSet, routeProductionEligibility, type EligibilityClaim, type RuntimeQualifiedSet } from "../../supabase/functions/_shared/trading-domain/production-eligibility-router.ts";

const entry = Object.freeze({ strategyId: "forex.london-breakout", strategyVersion: "1.0.0", configId: "config_a", configVersion: "research/grid/v1/1", qualificationStatus: "FORWARD_VALIDATION_CANDIDATE", supportedSymbols: Object.freeze(["EURUSD"]), supportedTimeframes: Object.freeze(["15m"]), strategyParameters: Object.freeze({ bodyAtr: .45, extensionAtr: .9 }) });
const set = (id: RuntimeQualifiedSet["id"], product: RuntimeQualifiedSet["product"], item = entry): RuntimeQualifiedSet => Object.freeze({ version: "qualified-strategy-set/v1", id, setVersion: `${id}/v7`, product, researchPolicyVersion: "research-policy/v3", entries: Object.freeze([item]) });
const forexPersonal = set("FOREX_PERSONAL_QUALIFIED_SET", "PERSONAL");
const base = pinnedClaimFromQualifiedSet({ product: "FOREX_PERSONAL", market: "FOREX", set: forexPersonal, strategyId: entry.strategyId, strategyVersion: entry.strategyVersion, symbol: "EURUSD", timeframe: "15m", requiredQualification: "FORWARD_VALIDATION_CANDIDATE" });
const decide = (claim: EligibilityClaim, qualifiedSet: RuntimeQualifiedSet | null = forexPersonal) => routeProductionEligibility({ claim, qualifiedSet });

const eligible = decide(base);
assert.equal(eligible.decision, "ELIGIBLE");
assert.deepEqual(eligible.reasonCodes, []);
assert.equal(eligible.qualifiedSetVersion, "FOREX_PERSONAL_QUALIFIED_SET/v7");
assert.deepEqual(eligible.pinnedStrategyParameters, entry.strategyParameters);
assert.deepEqual(decide(base), eligible, "routing is deterministic");
assert.deepEqual(decide({ ...base, qualifiedSetVersion: "stale" }).reasonCodes, ["QUALIFIED_SET_VERSION_MISMATCH"]);

const propClaim = { ...base, product: "FOREX_PROP" as const };
assert.deepEqual(decide(propClaim).reasonCodes, ["WRONG_QUALIFIED_SET_PRODUCT"], "Personal qualification cannot leak into Prop");
assert.deepEqual(decide({ ...base, product: "CRYPTO_PERSONAL", market: "CRYPTO" }, forexPersonal).reasonCodes, ["WRONG_QUALIFIED_SET_PRODUCT"], "Forex qualification cannot leak into Crypto");
assert.deepEqual(decide({ ...base, market: "CRYPTO" }).reasonCodes, ["WRONG_PRODUCT_MARKET"]);
assert.deepEqual(decide(base, null).reasonCodes, ["QUALIFIED_SET_MISSING"]);
assert.deepEqual(decide({ ...base, strategyVersion: "stale" }).reasonCodes, ["STRATEGY_VERSION_MISMATCH"]);
assert.deepEqual(decide({ ...base, configVersion: "stale" }).reasonCodes, ["CONFIG_VERSION_MISMATCH"]);
assert.deepEqual(decide({ ...base, strategyParameters: { bodyAtr: .5, extensionAtr: .9 } }).reasonCodes, ["STRATEGY_PARAMETER_MISMATCH"]);
assert.deepEqual(decide({ ...base, symbol: "GBPUSD" }).reasonCodes, ["UNSUPPORTED_SYMBOL"]);
assert.deepEqual(decide({ ...base, timeframe: "1h" }).reasonCodes, ["UNSUPPORTED_TIMEFRAME"]);
assert.deepEqual(decide({ ...base, requiredQualification: "PRODUCTION_APPROVED" }).reasonCodes, ["INSUFFICIENT_APPROVAL_STATE"]);

const mutableDefaults = { bodyAtr: 99, extensionAtr: 99 };
const before = decide(base); mutableDefaults.bodyAtr = 1;
assert.deepEqual(decide(base), before, "mutable defaults are outside the pinned routing contract");
assert.deepEqual(base.strategyParameters, entry.strategyParameters);

const signalClaim: EligibilityClaim = { ...base, product: "SIGNAL_ONLY", configId: "", configVersion: "", strategyParameters: {} };
const signalPolicy = { version: "signal-policy/v2", enabled: true, markets: ["FOREX"] as const, strategyIds: [entry.strategyId] };
assert.equal(routeProductionEligibility({ claim: signalClaim, signalPolicy }).decision, "ELIGIBLE", "the same global scanner signal may follow its explicit signal policy");
assert.equal(routeProductionEligibility({ claim: propClaim, qualifiedSet: forexPersonal }).decision, "INELIGIBLE");

const source = readFileSync("supabase/functions/_shared/trading-domain/production-eligibility-router.ts", "utf8");
for (const forbidden of ["fetch(", ".from(", "submitOrder", "placeOrder", "createOrder"]) assert.doesNotMatch(source, new RegExp(forbidden.replace("(", "\\(")), "router has no order or persistence capability");
const scanner = readFileSync("supabase/functions/market-scanner/index.ts", "utf8");
assert.match(scanner, /routeProductionEligibility/);
assert.match(scanner, /qualification_campaign/);
assert.match(scanner, /if \(eligibility\.decision === "INELIGIBLE"\)/);
assert.equal((scanner.match(/async function runScanPipeline/g) ?? []).length, 1, "one global scanner pipeline remains");
console.log("production eligibility router tests passed");
