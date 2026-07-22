import assert from "node:assert/strict";
import { FOREX_INSTRUMENT_IDS, FOREX_INSTRUMENTS, forexSessionContext } from "../../supabase/functions/_shared/forex-domain.js";
import { detectCandleGaps, TwelveDataForexProvider } from "../../supabase/functions/_shared/forex-provider.js";
import { forexRiskAdapter, qualifyForexSignal } from "../../supabase/functions/_shared/forex-signal.js";

assert.deepEqual(FOREX_INSTRUMENT_IDS, ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "EURJPY", "GBPJPY", "XAUUSD"]);
for (const instrument of Object.values(FOREX_INSTRUMENTS)) assert.ok(instrument.pipSize && instrument.pricePrecision && instrument.expectedSpreadPips.maximum && instrument.tradingSessions.length);
assert.deepEqual(forexSessionContext("2026-07-18T12:00:00Z"), { primary: "CLOSED", active: [], overlap: false, marketOpen: false, weekend: true, holiday: false, volatility: "closed", reason: "weekly_close" });
assert.equal(forexSessionContext("2026-07-15T12:30:00Z").primary, "LONDON_NEW_YORK_OVERLAP");
assert.equal(forexSessionContext("2026-12-25T14:00:00Z", ["2026-12-25"]).reason, "market_holiday");

const base = { symbol: "EURUSD", market_type: "forex", timeframe: "15m", open: 1, high: 1.2, low: .9, close: 1.1, volume: 1, source: "fixture" };
assert.equal(detectCandleGaps([{ ...base, open_time: "2026-01-01T00:00:00Z" }, { ...base, open_time: "2026-01-01T00:45:00Z" }], "15m")[0].missingBars, 2);
let calls = 0;
const provider = new TwelveDataForexProvider({ apiKey: "test", attempts: 2, now: () => new Date("2026-01-01T00:30:00Z"), fetcher: async () => { calls++; if (calls === 1) throw new Error("temporary"); return new Response(JSON.stringify({ values: [{ datetime: "2026-01-01 00:15:00", open: "1", high: "1.2", low: ".9", close: "1.1" }, { datetime: "2026-01-01 00:00:00", open: "1", high: "1.1", low: ".9", close: "1" }] }), { status: 200 }); } });
const fetched = await provider.candles({ symbol: "EURUSD", timeframe: "15m", limit: 2 }); assert.equal(fetched.diagnostics.attempts, 2); assert.equal(fetched.candles.length, 2); assert.equal(fetched.diagnostics.ok, true);

const qualified = qualifyForexSignal({ symbol: "EURUSD", direction: "BUY", entry: 1.1, stopLoss: 1.095, tp1: 1.106, tp2: 1.11, tp3: 1.115, confidence: 82, evidence: ["trend", "closed candle", "spread"], session: "LONDON", strategy: "forex.trend-continuation", expiresAt: "2026-01-01T12:00:00Z", marketRegime: "trend_up", qualityScore: 84, invalidation: "15m close below 1.095" }, new Date("2026-01-01T10:00:00Z"));
assert.equal(qualified.ok, true); if (qualified.ok) assert.equal(qualified.signal.riskReward, 2);
assert.equal(qualifyForexSignal({ symbol: "EURUSD", direction: "BUY", entry: 1.1, stopLoss: 1.09, tp1: 1.101, tp2: 1.102, confidence: 20, evidence: [], session: "CLOSED", strategy: "", expiresAt: "2020-01-01", marketRegime: "", qualityScore: 10, invalidation: "" }).ok, false);
const size = forexRiskAdapter({ symbol: "EURUSD", equity: 10000, riskPercent: 1, entry: 1.1, stopLoss: 1.095, profile: "personal", availableExposure: 100000 }); assert.ok(size && size.lots > 0 && size.riskAmount <= 100);
console.log("Phase 7 Forex engine tests passed");
