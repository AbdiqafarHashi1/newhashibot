import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scanner = readFileSync("supabase/functions/market-scanner/index.ts", "utf8");
const provider = readFileSync("supabase/functions/_shared/mt5-market-data-provider.ts", "utf8");
const health = readFileSync("src/pages/admin/ProviderHealth.tsx", "utf8");

assert.match(scanner, /const C2_FOREX_PROVIDER = "mt5"/);
assert.match(scanner, /loadMT5Candles\(supabase, testSymbol, testTf, 110, \{ feedIdentity:/);
assert.match(scanner, /runtime_provider_policy: "mt5_durable_only_no_fallback"/);
assert.match(scanner, /fallback_attempted: false/);
assert.doesNotMatch(scanner, /api\.twelvedata\.com/);
assert.doesNotMatch(scanner, /fetchTwelveData/);
assert.doesNotMatch(scanner, /fetchMT5BridgeCandles/);
assert.match(provider, /from\("mt5_market_data_latest"\)/);
assert.match(provider, /from\("mt5_market_candles"\)/);
assert.match(health, /Twelve Data runtime disabled/);
assert.match(health, /MT5MarketDataProvider supplies Forex\/Gold/);
assert.match(health, /s\.market_type === 'crypto' \? 'binance' : 'mt5'/);

console.log("canonical MT5 provider truth tests passed");
