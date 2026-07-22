import assert from "node:assert/strict";
import { buildEvidenceAnalysis, processNews, renderAnalysis, renderEducation, TEMPLATE_CATALOG } from "../../supabase/functions/_shared/professional-content.js";

const now = new Date("2026-07-22T12:00:00Z");
const news = processNews([
  { title: "BTC ETF flows rise", source: "Desk A", published_at: "2026-07-22T11:00:00Z", importance: 80 },
  { title: "ETF flows rise BTC", source: "Desk B", published_at: "2026-07-22T10:00:00Z", importance: 40 },
  { title: "Guaranteed profit 100x", source: "spam", published_at: "2026-07-22T11:00:00Z" },
], now);
assert.equal(news.length, 1);
assert.deepEqual(news[0].symbols, ["BTC"]);
assert.equal(news[0].freshness, "fresh");

const insufficient = buildEvidenceAnalysis([]);
assert.match(renderAnalysis("BTC context", insufficient, now.toISOString()), /Insufficient verified market data/);
assert.doesNotMatch(renderAnalysis("BTC context", insufficient, now.toISOString()), /undefined|NaN|null/);
const supported = buildEvidenceAnalysis([{ label: "Funding", value: "0.01%", source: "Exchange API", observed_at: now.toISOString(), confidence: 90 }], ["Momentum may persist if funding remains orderly."]);
assert.match(renderAnalysis("Funding context", supported, now.toISOString()), /POSSIBLE SCENARIOS — NOT PREDICTIONS/);
assert.ok(TEMPLATE_CATALOG.trade_lifecycle.includes("missed"));
assert.match(renderEducation("Risk", "Cap risk per trade.", "Define invalidation first.", now.toISOString()), /HASHIBOT ACADEMY/);
console.log("phase6 content tests passed");
