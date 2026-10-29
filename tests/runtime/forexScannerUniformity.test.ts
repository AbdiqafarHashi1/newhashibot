import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOREX_RUNTIME_INSTRUMENTS,
  FOREX_RUNTIME_SYMBOLS,
  FOREX_STRATEGY_CONTRACTS,
  MT5_PROVIDER_MARKET_DATA_TIMEFRAMES,
  forexScannerFetchPlan,
  forexStrategyTimeframes,
  forexStrategyEligibility,
  isForexRuntimeSymbol,
  roundRuntimePrice,
  runtimeInstrument,
  runtimePipDistance,
} from "../../supabase/functions/_shared/forex-runtime-contracts.ts";

assert.deepEqual(FOREX_RUNTIME_SYMBOLS, ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"]);
assert.equal(isForexRuntimeSymbol("EUR/USD"), true);
assert.equal(isForexRuntimeSymbol("USDCHF"), false);
assert.equal(FOREX_RUNTIME_INSTRUMENTS.length, FOREX_RUNTIME_SYMBOLS.length);
assert.equal(runtimeInstrument("XAUUSD")?.instrument_class, "metal_gold");
assert.notEqual(runtimeInstrument("XAUUSD")?.pip_size, runtimeInstrument("EURUSD")?.pip_size);
assert.notEqual(runtimeInstrument("XAUUSD")?.price_precision, runtimeInstrument("EURUSD")?.price_precision);
assert.equal(runtimeInstrument("USDJPY")?.instrument_class, "fx_jpy");
assert.equal(runtimeInstrument("USDJPY")?.pip_size, 0.01);
assert.equal(runtimePipDistance("XAUUSD", 2300, 2301), 10);
assert.equal(roundRuntimePrice("XAUUSD", 2300.127), 2300.13);
for (const contract of FOREX_STRATEGY_CONTRACTS) {
  assert.deepEqual(forexStrategyEligibility(contract, "XAUUSD"), contract.id === "gold.volatility-breakout" ? { eligible: true, reason: null } : { eligible: false, reason: "strategy_instrument_class_not_supported" });
  assert.deepEqual(forexStrategyEligibility(contract, "EURUSD"), contract.id === "gold.volatility-breakout" ? { eligible: false, reason: "strategy_instrument_class_not_supported" } : { eligible: true, reason: null });
}
assert.deepEqual(forexScannerFetchPlan(), ["5m", "15m", "1h"]);
assert.equal(new Set(forexScannerFetchPlan()).size, forexScannerFetchPlan().length, "fetch plan is deduplicated");
assert.equal(FOREX_STRATEGY_CONTRACTS.length, 6);
for (const contract of FOREX_STRATEGY_CONTRACTS) {
  assert.equal(contract.lifecycle, "ENABLED");
  assert.equal(contract.version, "1.0.0");
  assert.equal(contract.symbols.includes("XAUUSD"), contract.id === "gold.volatility-breakout");
  assert.deepEqual(contract.eligibleInstrumentClasses, contract.id === "gold.volatility-breakout" ? ["metal_gold"] : ["fx_non_jpy", "fx_jpy"]);
  assert.ok(contract.minimumCandles >= 55);
  assert.ok(contract.requiredIndicators.includes("atr14"));
  assert.ok(forexStrategyTimeframes(contract).every((tf) => MT5_PROVIDER_MARKET_DATA_TIMEFRAMES.includes(tf as never)));
}
assert.deepEqual(FOREX_STRATEGY_CONTRACTS.find((c) => c.id === "forex.micro-scalper")?.primaryTimeframes, ["5m", "15m"]);
assert.deepEqual(FOREX_STRATEGY_CONTRACTS.find((c) => c.id === "forex.swing-continuation")?.primaryTimeframes, ["1h"]);
assert.deepEqual(FOREX_STRATEGY_CONTRACTS.find((c) => c.id === "forex.london-breakout")?.primaryTimeframes, ["15m"]);
assert.deepEqual(FOREX_STRATEGY_CONTRACTS.find((c) => c.id === "forex.new-york-continuation")?.primaryTimeframes, ["15m", "1h"]);
assert.deepEqual(FOREX_STRATEGY_CONTRACTS.find((c) => c.id === "forex.trend-pullback")?.primaryTimeframes, ["15m", "1h"]);
assert.deepEqual(FOREX_STRATEGY_CONTRACTS.find((c) => c.id === "gold.volatility-breakout")?.contextTimeframes, ["1h"]);

const scanner = readFileSync("supabase/functions/market-scanner/index.ts", "utf8");
assert.match(scanner, /const forexScanTimeframes = forexTimeframes\(\)/);
assert.match(scanner, /for \(const contract of FOREX_STRATEGY_CONTRACTS\)/);
assert.match(scanner, /FOREX_EVALUATOR_REGISTRY/);
assert.match(scanner, /FOREX_EVALUATOR_NOT_REGISTERED/);
assert.match(scanner, /FOREX_PRODUCTION_EVALUATORS/);
assert.doesNotMatch(scanner, /contract\.legacyName === "ForexMicroScalper"/);
assert.match(scanner, /gold_strategy_not_certified/);
assert.match(scanner, /loadMT5Candles/);
assert.doesNotMatch(scanner, /api\.twelvedata\.com|api\.finnhub\.io|fetchMT5BridgeCandles/);
assert.match(scanner, /await fetchBinanceCandles\(symbol,\s*tf,\s*111\)/,
  "Legacy Crypto branch retains Binance fetch behavior");
assert.match(scanner, /conditionalWatchFeed\(supabase,symbol,tf as WatchTimeframe/);
assert.match(scanner, /const allEvals:[\s\S]*evaluateActiveStrategies\(registry, strategyContext\)[\s\S]*passingEntries/,
  "Forex evaluations still enter the unified registry and arbitration path");

console.log("forex scanner uniformity tests passed");
