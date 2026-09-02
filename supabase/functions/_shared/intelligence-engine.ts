import { createClient } from "npm:@supabase/supabase-js@2";
import {
  HMMRegimeClassifier,
  calculateGarmanKlassVolatility,
  type MarketRegimeToken,
  type RegimeProbabilityVector,
} from "./hmm-regime-classifier.ts";

type SupabaseClient = ReturnType<typeof createClient>;
type ContentKind = "morning_brief" | "news_digest" | "watchlist_pattern_update" | "market_wrap";
type Regime = "risk_on" | "risk_off" | "neutral" | "volatile" | "compressed" | "breakout_watch" | MarketRegimeToken;
type FeedStatus = "available" | "unavailable" | "failed";
type FeedQualityStatus = "healthy" | "degraded" | "fallback" | "unavailable" | "insufficient_data";

type Candle = { symbol: string; timeframe: string; open_time: string; open: number | string; high: number | string; low: number | string; close: number | string; volume?: number | string | null; source?: string | null };
type Candidate = { symbol: string; direction: string; confidence_score?: number | null; grade?: string | null; regime?: string | null; strategy_name?: string | null; reason?: string | null; created_at: string };
type Signal = { symbol: string; direction: string; status: string; grade?: string | null; confidence_score?: number | null; created_at: string };

type FeedResult = {
  feed_type: string;
  value: unknown;
  classification: string;
  source: string;
  freshness: string;
  status: FeedStatus;
  error_message: string | null;
  quality_status: FeedQualityStatus;
  quality_score: number;
  ranking_eligible: boolean;
  failure_reason: string | null;
  provider: string;
  endpoint: string;
  update_frequency: string;
  fallback_source: string | null;
  historical_coverage: string;
  created_at: string;
};

type SymbolSnapshot = {
  symbol: string;
  last: number | null;
  changePct: number | null;
  rangePct: number | null;
  trend: "up" | "down" | "flat" | "unavailable";
  volatility: "compressed" | "normal" | "high" | "unavailable";
  freshness: string;
  dataSource: string;
};

export interface IntelligenceOutput {
  event_id: string;
  event_type: ContentKind;
  title: string;
  summary: string;
  market: string;
  symbols: string[];
  sentiment: Record<string, unknown>;
  regime: Regime;
  confidence: number;
  data_sources: Record<string, unknown>;
  freshness: Record<string, unknown>;
  output_channel: string[];
  status: "generated" | "partial" | "failed";
  metadata: Record<string, unknown>;
}

const MAJORS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const NEWS_BUCKETS = ["etf", "regulatory", "exchange", "ecosystem", "macro"] as const;

function num(value: unknown): number | null { const n = Number(value); return Number.isFinite(n) ? n : null; }
function pct(from: number | null, to: number | null): number | null { if (!from || !to) return null; return ((to - from) / from) * 100; }
function fmtPct(value: number | null): string { return value === null ? "Data unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }
function ageLabel(iso?: string | null): string { if (!iso) return "Data unavailable"; const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`; }
function title(kind: ContentKind): string { return kind === "morning_brief" ? "🌅 HashiBot Morning Brief" : kind === "news_digest" ? "📰 HashiBot News Intelligence Digest" : kind === "watchlist_pattern_update" ? "📡 HashiBot Watchlist + Pattern Update" : "🌙 HashiBot Market Wrap"; }
function qualityFromStatus(status: FeedStatus, source: string, rankingEligible = true): { quality_status: FeedQualityStatus; quality_score: number; ranking_eligible: boolean } {
  if (status === "available" && source.includes("fallback")) return { quality_status: "fallback", quality_score: 65, ranking_eligible: false };
  if (status === "available") return { quality_status: "healthy", quality_score: 90, ranking_eligible: rankingEligible };
  if (status === "failed") return { quality_status: "degraded", quality_score: 25, ranking_eligible: false };
  return { quality_status: "unavailable", quality_score: 0, ranking_eligible: false };
}
function feedResult(input: Omit<FeedResult, "quality_status" | "quality_score" | "ranking_eligible" | "failure_reason" | "provider" | "endpoint" | "update_frequency" | "fallback_source" | "historical_coverage" | "created_at"> & Partial<Pick<FeedResult, "provider" | "endpoint" | "update_frequency" | "fallback_source" | "historical_coverage" | "ranking_eligible">>): FeedResult {
  const q = qualityFromStatus(input.status, input.source, input.ranking_eligible ?? true);
  return { ...input, ...q, failure_reason: input.status === "available" ? null : input.error_message, provider: input.provider ?? input.source, endpoint: input.endpoint ?? input.source, update_frequency: input.update_frequency ?? "per intelligence run", fallback_source: input.fallback_source ?? null, historical_coverage: input.historical_coverage ?? "latest snapshot only", created_at: new Date().toISOString() };
}
function unavailable(feed_type: string, source = "unavailable", message: string | null = null): FeedResult { return feedResult({ feed_type, value: null, classification: "unavailable", source, freshness: "Data unavailable", status: "unavailable", error_message: message, ranking_eligible: false }); }
function failed(feed_type: string, source: string, e: unknown): FeedResult { return feedResult({ feed_type, value: null, classification: "failed", source, freshness: "Data unavailable", status: "failed", error_message: e instanceof Error ? e.message : "provider failed", ranking_eligible: false }); }
async function fetchJson(url: string, headers?: HeadersInit): Promise<unknown> { const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) }); if (!res.ok) { const body = await res.text().catch(() => ""); const authHint = res.status === 401 ? "auth_failure_or_missing_api_key" : res.status === 403 ? "forbidden_or_quota_exceeded" : res.status === 429 ? "quota_or_rate_limit_exceeded" : "provider_http_error"; throw new Error(`${authHint}: HTTP ${res.status}${body ? ` ${body.slice(0, 180)}` : ""}`); } return await res.json(); }

function snapshotFromCandles(symbol: string, candles: Candle[]): SymbolSnapshot {
  const rows = candles.filter((c) => c.symbol === symbol).sort((a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime());
  if (rows.length < 2) return { symbol, last: null, changePct: null, rangePct: null, trend: "unavailable", volatility: "unavailable", freshness: "Data unavailable", dataSource: "unavailable" };
  const first = rows[0], last = rows[rows.length - 1];
  const firstClose = num(first.close), lastClose = num(last.close);
  const highs = rows.map((r) => num(r.high)).filter((v): v is number => v !== null), lows = rows.map((r) => num(r.low)).filter((v): v is number => v !== null);
  const high = highs.length ? Math.max(...highs) : null, low = lows.length ? Math.min(...lows) : null;
  const changePct = pct(firstClose, lastClose), rangePct = high !== null && low !== null && lastClose ? ((high - low) / lastClose) * 100 : null;
  const trend = changePct === null ? "unavailable" : changePct > 0.7 ? "up" : changePct < -0.7 ? "down" : "flat";
  const volatility = rangePct === null ? "unavailable" : rangePct < 1.8 ? "compressed" : rangePct > 5 ? "high" : "normal";
  return { symbol, last: lastClose, changePct, rangePct, trend, volatility, freshness: ageLabel(last.open_time), dataSource: last.source ?? "candles" };
}
function deriveRegime(btc: SymbolSnapshot, eth: SymbolSnapshot, snapshots: SymbolSnapshot[], feeds: FeedResult[]): Regime {
  const funding = feeds.find((f) => f.feed_type === "funding");
  const highVol = snapshots.filter((s) => s.volatility === "high").length;
  const compressed = snapshots.filter((s) => s.volatility === "compressed").length;
  if (highVol >= Math.max(2, Math.ceil(snapshots.length * 0.35))) return "volatile";
  if (compressed >= Math.max(2, Math.ceil(snapshots.length * 0.45))) return "compressed";
  if (btc.volatility === "compressed" && eth.volatility === "compressed") return "breakout_watch";
  if (btc.trend === "up" && eth.trend === "up" && funding?.classification !== "bearish") return "risk_on";
  if (btc.trend === "down" && eth.trend === "down") return "risk_off";
  return "neutral";
}
function confidenceFromData(snapshots: SymbolSnapshot[], feeds: FeedResult[]): number { const live = snapshots.filter((s) => s.dataSource !== "unavailable").length; const avail = feeds.filter((f) => f.status === "available").length; return Math.round(Math.min(95, (snapshots.length ? live / snapshots.length : 0) * 55 + (avail / Math.max(1, feeds.length)) * 40)); }

async function fetchCandles(supabase: SupabaseClient): Promise<Candle[]> { const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); const { data } = await supabase.from("candles").select("symbol,timeframe,open_time,open,high,low,close,volume,source").eq("market_type", "crypto").eq("timeframe", "1h").gte("open_time", since).order("open_time", { ascending: true }); return (data ?? []) as Candle[]; }
async function fetchCandidates(supabase: SupabaseClient): Promise<Candidate[]> { const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); const { data } = await supabase.from("strategy_candidates").select("symbol,direction,confidence_score,grade,regime,strategy_name,reason,created_at").eq("market_type", "crypto").gte("created_at", since).order("confidence_score", { ascending: false }).limit(40); return (data ?? []) as Candidate[]; }
async function fetchSignals(supabase: SupabaseClient): Promise<Signal[]> { const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); const { data } = await supabase.from("signals").select("symbol,direction,status,grade,confidence_score,created_at").eq("market_type", "crypto").gte("created_at", since).order("created_at", { ascending: false }).limit(25); return (data ?? []) as Signal[]; }

async function fearGreed(): Promise<FeedResult> {
  const configured = Deno.env.get("FEAR_GREED_API_URL");
  const url = configured || "https://api.alternative.me/fng/?limit=1&format=json";
  try {
    const json = await fetchJson(url) as Record<string, unknown>;
    const item = Array.isArray(json.data) ? json.data[0] as Record<string, unknown> : json;
    const value = num(item?.value);
    return feedResult({ feed_type: "fear_greed", value, classification: String(item?.value_classification ?? (value === null ? "unavailable" : value >= 55 ? "greed" : value <= 45 ? "fear" : "neutral")), source: configured ? "FEAR_GREED_API_URL" : "alternative.me", provider: configured ? "configured_fear_greed_provider" : "alternative.me", endpoint: configured ?? "https://api.alternative.me/fng/", freshness: item?.timestamp ? ageLabel(new Date(Number(item.timestamp) * 1000).toISOString()) : "live fetch", status: value === null ? "unavailable" : "available", error_message: value === null ? "provider returned no value" : null, update_frequency: "per intelligence run", historical_coverage: "latest Alternative.me index point" });
  } catch (e) { return failed("fear_greed", configured ? "FEAR_GREED_API_URL" : "alternative.me", e); }
}
async function btcDominance(): Promise<FeedResult> {
  try {
    const json = await fetchJson("https://api.coingecko.com/api/v3/global") as { data?: { market_cap_percentage?: Record<string, number> } };
    const value = num(json.data?.market_cap_percentage?.btc);
    return feedResult({ feed_type: "btc_dominance", value, classification: value === null ? "unavailable" : value >= 55 ? "high" : value <= 45 ? "low" : "neutral", source: "coingecko_global", provider: "coingecko", endpoint: "https://api.coingecko.com/api/v3/global", freshness: "live fetch", status: value === null ? "unavailable" : "available", error_message: value === null ? "provider returned no BTC dominance" : null, update_frequency: "per intelligence run", historical_coverage: "latest global market-cap snapshot" });
  } catch (e) { return failed("btc_dominance", "coingecko_global", e); }
}
async function funding(): Promise<FeedResult> {
  try {
    const rows = await Promise.all(MAJORS.map(async (symbol) => { const json = await fetchJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`) as Record<string, unknown>; return { symbol, fundingRate: num(json.lastFundingRate), nextFundingTime: json.nextFundingTime }; }));
    const avg = rows.reduce((sum, row) => sum + (row.fundingRate ?? 0), 0) / rows.length;
    return feedResult({ feed_type: "funding", value: rows, classification: avg > 0.0001 ? "bullish_long_crowding" : avg < -0.0001 ? "bearish_short_crowding" : "neutral", source: "binance_usdm_futures", provider: "binance", endpoint: "/fapi/v1/premiumIndex", freshness: "live fetch", status: "available", error_message: null, update_frequency: "per intelligence run", historical_coverage: "latest funding snapshot for BTC/ETH/SOL" });
  } catch (e) { return failed("funding", "binance_usdm_futures", e); }
}
async function openInterest(): Promise<FeedResult> {
  try {
    const rows = await Promise.all(MAJORS.map(async (symbol) => { const [now, hist] = await Promise.all([fetchJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`) as Promise<Record<string, unknown>>, fetchJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=2`) as Promise<Record<string, unknown>[]>]); const current = num(now.openInterest); const prev = Array.isArray(hist) && hist.length > 1 ? num(hist[0].sumOpenInterest) : null; return { symbol, openInterest: current, changePct: pct(prev, current) }; }));
    const avg = rows.reduce((sum, row) => sum + (row.changePct ?? 0), 0) / rows.length;
    return feedResult({ feed_type: "open_interest", value: rows, classification: avg > 1 ? "rising" : avg < -1 ? "falling" : "flat", source: "binance_usdm_futures", provider: "binance", endpoint: "/fapi/v1/openInterest + /futures/data/openInterestHist", freshness: "live fetch", status: "available", error_message: null, update_frequency: "per intelligence run", historical_coverage: "latest snapshot plus 1h two-point change" });
  } catch (e) { return failed("open_interest", "binance_usdm_futures", e); }
}
async function liquidations(): Promise<FeedResult> {
  const url = Deno.env.get("LIQUIDATIONS_API_URL") ?? "";
  if (!url) return feedResult({ feed_type: "liquidations", value: null, classification: "provider_not_configured", source: "LIQUIDATIONS_API_URL", provider: "not_configured", endpoint: "LIQUIDATIONS_API_URL", freshness: "Data unavailable", status: "unavailable", error_message: "LIQUIDATIONS_API_URL missing; expected an authenticated liquidation provider endpoint. No fake liquidation data is used.", ranking_eligible: false, update_frequency: "provider dependent", fallback_source: null, historical_coverage: "none until provider configured" });
  try {
    const json = await fetchJson(url);
    return feedResult({ feed_type: "liquidations", value: json, classification: "provider_data", source: "LIQUIDATIONS_API_URL", provider: "configured_liquidations_provider", endpoint: "LIQUIDATIONS_API_URL", freshness: "live fetch", status: "available", error_message: null, update_frequency: "per intelligence run", historical_coverage: "provider response only" });
  } catch (e) { return failed("liquidations", "LIQUIDATIONS_API_URL", e); }
}
function marketBreadth(snapshots: SymbolSnapshot[]): FeedResult {
  const live = snapshots.filter((snapshot) => snapshot.dataSource !== "unavailable");
  if (!live.length) return unavailable("market_breadth", "candles", "No tracked crypto candles available");
  const bullish = live.filter((snapshot) => snapshot.trend === "up").length;
  const bearish = live.filter((snapshot) => snapshot.trend === "down").length;
  const flat = live.length - bullish - bearish;
  const aboveShortTrendPct = (bullish / live.length) * 100;
  const participationPct = ((bullish + bearish) / live.length) * 100;
  const breadthScore = Math.round(Math.max(0, Math.min(100, aboveShortTrendPct * 0.7 + participationPct * 0.3)));
  return feedResult({ feed_type: "market_breadth", value: { universe: "tracked_crypto_candle_universe", tracked: live.length, bullish, bearish, flat, aboveShortTrendPct, participationPct, breadthScore }, classification: aboveShortTrendPct >= 60 ? "broad_strength" : aboveShortTrendPct <= 40 ? "broad_weakness" : "mixed", source: "tracked_crypto_candles", provider: "supabase_candles", endpoint: "candles 1h crypto rows", freshness: "last stored 1h candles", status: "available", error_message: null, update_frequency: "per intelligence run from stored 1h candles", historical_coverage: "last 48h tracked crypto candle window" });
}
const SECTOR_GROUPS: Record<string, string[]> = {
  "Layer 1": ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "ADAUSDT", "AVAXUSDT", "SUIUSDT"],
  DeFi: ["UNIUSDT", "AAVEUSDT", "LINKUSDT"],
  AI: ["FETUSDT", "RNDRUSDT", "TAOUSDT", "NEARUSDT"],
  Infrastructure: ["LINKUSDT", "MATICUSDT", "DOTUSDT", "ATOMUSDT"],
  Meme: ["DOGEUSDT", "SHIBUSDT", "PEPEUSDT", "WIFUSDT"],
  Gaming: ["SANDUSDT", "AXSUSDT", "GALAUSDT", "IMXUSDT"],
  RWA: ["ONDOUSDT", "MKRUSDT"],
};
function sectorRotation(snapshots: SymbolSnapshot[]): FeedResult {
  const live = snapshots.filter((snapshot) => snapshot.dataSource !== "unavailable");
  const sectors = Object.entries(SECTOR_GROUPS).map(([sector, symbols]) => {
    const members = live.filter((snapshot) => symbols.includes(snapshot.symbol));
    const avgChangePct = members.length ? members.reduce((sum, snapshot) => sum + (snapshot.changePct ?? 0), 0) / members.length : null;
    const participationPct = members.length ? (members.filter((snapshot) => snapshot.trend === "up").length / members.length) * 100 : null;
    return { sector, symbols: members.map((member) => member.symbol), avgChangePct, participationPct, memberCount: members.length };
  }).filter((sector) => sector.memberCount > 0);
  if (sectors.length < 2) return feedResult({ feed_type: "sector_rotation", value: { sectors }, classification: "insufficient_data", source: "tracked_crypto_candles_sector_groups", provider: "research_sector_groups", endpoint: "candles 1h crypto rows", freshness: "Data unavailable", status: "unavailable", error_message: "Need at least two populated sector groups from real tracked candles", ranking_eligible: false, update_frequency: "per intelligence run", historical_coverage: "last 48h tracked crypto candle window" });
  const sorted = [...sectors].sort((a, b) => (b.avgChangePct ?? -999) - (a.avgChangePct ?? -999));
  const strongest = sorted[0], weakest = sorted[sorted.length - 1];
  const sectorRotationScore = Math.round(Math.max(0, Math.min(100, 50 + ((strongest.avgChangePct ?? 0) - (weakest.avgChangePct ?? 0)) * 5)));
  return feedResult({ feed_type: "sector_rotation", value: { sectors, strongest, weakest, sectorRotationScore }, classification: "research_only_sector_rotation", source: "tracked_crypto_candles_sector_groups", provider: "research_sector_groups", endpoint: "candles 1h crypto rows", freshness: "last stored 1h candles", status: "available", error_message: null, ranking_eligible: false, update_frequency: "per intelligence run", historical_coverage: "last 48h tracked crypto candle window" });
}
function stablecoinFlow(feeds: FeedResult[]): FeedResult {
  const dom = feeds.find((f) => f.feed_type === "btc_dominance");
  const oi = feeds.find((f) => f.feed_type === "open_interest");
  const fund = feeds.find((f) => f.feed_type === "funding");
  const breadth = feeds.find((f) => f.feed_type === "market_breadth");
  const supported = [dom, oi, fund, breadth].filter((f): f is FeedResult => Boolean(f) && f.status === "available");
  if (supported.length < 3) return feedResult({ feed_type: "stablecoin_flow", value: { supportedFeeds: supported.map((f) => f.feed_type) }, classification: "insufficient_proxy_support", source: "derived_proxy", provider: "derived_from_btc_dominance_oi_funding_breadth", endpoint: "derived", freshness: "Data unavailable", status: "unavailable", error_message: "Stablecoin flow requires at least three healthy proxy feeds; no direct stablecoin-flow provider configured and no fabricated values used.", ranking_eligible: false, update_frequency: "per intelligence run", historical_coverage: "derived latest snapshot only" });
  const breadthValue = breadth?.value as { breadthScore?: number } | null;
  const oiRows = Array.isArray(oi?.value) ? oi.value as Array<{ changePct?: number | null }> : [];
  const avgOi = oiRows.length ? oiRows.reduce((sum, row) => sum + (row.changePct ?? 0), 0) / oiRows.length : 0;
  const fundingRows = Array.isArray(fund?.value) ? fund.value as Array<{ fundingRate?: number | null }> : [];
  const avgFunding = fundingRows.length ? fundingRows.reduce((sum, row) => sum + (row.fundingRate ?? 0), 0) / fundingRows.length : 0;
  const riskAppetite = Math.max(0, Math.min(100, (breadthValue?.breadthScore ?? 50) + Math.max(-15, Math.min(15, avgOi * 2)) + Math.max(-10, Math.min(10, avgFunding * 100000))));
  return feedResult({ feed_type: "stablecoin_flow", value: { stablecoinFlowConfidenceScore: Math.round(riskAppetite), proxyInputs: supported.map((f) => f.feed_type), directStablecoinFlow: false }, classification: riskAppetite >= 60 ? "risk_appetite_proxy_positive" : riskAppetite <= 40 ? "risk_appetite_proxy_negative" : "neutral_proxy", source: "derived_proxy", provider: "derived_from_btc_dominance_oi_funding_breadth", endpoint: "derived", freshness: "latest healthy proxy feeds", status: "available", error_message: null, ranking_eligible: false, update_frequency: "per intelligence run", historical_coverage: "derived latest snapshot only" });
}
function newsSourceName(source: unknown, fallback: unknown): string { if (source && typeof source === "object" && "title" in source) return String((source as { title?: unknown }).title ?? fallback ?? "news_provider"); return String(source ?? fallback ?? "news_provider"); }
function normalizeNewsHeadlines(json: Record<string, unknown>): Array<{ title: string; url: string; source: string; published_at: string }> { const raw = (Array.isArray(json.results) ? json.results : Array.isArray(json.articles) ? json.articles : Array.isArray(json.Data) ? json.Data : Array.isArray(json.data) ? json.data : []) as Record<string, unknown>[]; return raw.slice(0, 20).map((h) => ({ title: String(h.title ?? "").slice(0, 220), url: String(h.url ?? h.guid ?? h.domain ?? ""), source: newsSourceName(h.source_info ?? h.source, h.domain), published_at: String(h.published_at ?? h.publishedAt ?? h.created_at ?? (h.published_on ? new Date(Number(h.published_on) * 1000).toISOString() : "")) })).filter((h) => h.title); }
async function news(): Promise<FeedResult> {
  const configuredUrl = Deno.env.get("CRYPTO_NEWS_API_URL") ?? "";
  const primaryUrl = configuredUrl || "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
  const fallbackUrl = "https://cryptopanic.com/api/free/v1/posts/?public=true";
  const key = Deno.env.get("NEWS_API_KEY") ?? "";
  function buildHeadlineUrl(url: string): string { const sep = url.includes("?") ? "&" : "?"; return key && !url.includes("auth_token") && !url.includes("apiKey") ? `${url}${sep}auth_token=${encodeURIComponent(key)}` : url; }
  async function tryFetch(url: string): Promise<Array<{ title: string; url: string; source: string; published_at: string }>> {
    const json = await fetchJson(buildHeadlineUrl(url)) as Record<string, unknown>;
    if (String(json.Response ?? "") === "Error" || (json.Type !== undefined && Number(json.Type) !== 100 && !Array.isArray(json.Data))) throw new Error(String(json.Message ?? json.Reason ?? "provider_error_response"));
    const headlines = normalizeNewsHeadlines(json);
    if (headlines.length === 0) throw new Error("no_headlines_returned");
    return headlines;
  }
  let headlines: Array<{ title: string; url: string; source: string; published_at: string }> = [];
  let usedSource = configuredUrl ? "CRYPTO_NEWS_API_URL" : "cryptocompare_public_news";
  let usedEndpoint = primaryUrl;
  let fallbackError: string | null = null;
  try {
    headlines = await tryFetch(primaryUrl);
  } catch (primaryErr) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : "primary_failed";
    if (configuredUrl) { const exact = primaryMsg.includes("HTTP 401") ? new Error(`${primaryMsg}; auth failure: invalid CRYPTO_NEWS_API_URL token`) : primaryErr instanceof Error ? primaryErr : new Error(primaryMsg); return failed("news", "CRYPTO_NEWS_API_URL", exact); }
    try {
      headlines = await tryFetch(fallbackUrl);
      usedSource = "cryptopanic_public";
      usedEndpoint = fallbackUrl;
    } catch (fallbackErr) {
      fallbackError = `primary: ${primaryMsg}; fallback: ${fallbackErr instanceof Error ? fallbackErr.message : "fallback_failed"}`;
      return failed("news", "cryptocompare_and_cryptopanic", new Error(fallbackError));
    }
  }
  const buckets: Record<string, typeof headlines> = Object.fromEntries(NEWS_BUCKETS.map((bucket) => [bucket, []]));
  for (const headline of headlines) {
    const text = headline.title.toLowerCase();
    const bucket = text.includes("etf") ? "etf" : /sec|cftc|regulat|law|court|policy/.test(text) ? "regulatory" : /binance|coinbase|kraken|exchange/.test(text) ? "exchange" : /fed|cpi|rates|dollar|macro/.test(text) ? "macro" : "ecosystem";
    buckets[bucket].push(headline);
  }
  return feedResult({ feed_type: "news", value: { headlines, buckets }, classification: "headlines_available", source: usedSource, provider: usedSource, endpoint: usedEndpoint, freshness: "live fetch", status: "available", error_message: fallbackError, update_frequency: "per intelligence run", fallback_source: configuredUrl ? null : fallbackUrl, historical_coverage: "latest provider headlines" });
}
async function buildFeeds(snapshots: SymbolSnapshot[]): Promise<FeedResult[]> { const coreFeeds = await Promise.all([fearGreed(), btcDominance(), funding(), openInterest(), liquidations(), news()]); const breadth = marketBreadth(snapshots); const sector = sectorRotation(snapshots); const stablecoin = stablecoinFlow([...coreFeeds, breadth]); return [...coreFeeds, breadth, sector, stablecoin]; }
function feed(feeds: FeedResult[], type: string): FeedResult { return feeds.find((f) => f.feed_type === type) ?? unavailable(type); }
function feedLine(f: FeedResult): string { return `${f.feed_type.replaceAll("_", " ")}: ${f.status}${f.status === "available" ? ` (${f.classification})` : f.error_message ? ` — ${f.error_message}` : ""}`; }
function fundingLine(f: FeedResult): string { const rows = Array.isArray(f.value) ? f.value as Array<{ symbol: string; fundingRate?: number | null }> : []; return f.status === "available" ? rows.map((r) => `${r.symbol} ${(Number(r.fundingRate ?? 0) * 100).toFixed(4)}%`).join(" · ") : "Funding unavailable"; }
function oiLine(f: FeedResult): string { const rows = Array.isArray(f.value) ? f.value as Array<{ symbol: string; changePct?: number | null }> : []; return f.status === "available" ? rows.map((r) => `${r.symbol} ${fmtPct(r.changePct ?? null)}`).join(" · ") : "Open interest unavailable"; }
function newsLines(f: FeedResult): string[] { if (f.status !== "available") return ["News provider unavailable."]; const val = f.value as { headlines?: Array<{ title: string; source: string }> } | null; const heads = val?.headlines ?? []; return heads.length ? heads.slice(0, 8).map((h) => `${h.title} (${h.source})`) : ["No provider headlines returned."]; }
function topList(items: Candidate[], direction: "buy" | "sell", max = 4): string[] { return items.filter((c) => c.direction === direction).slice(0, max).map((c) => `${c.symbol} (${c.grade ?? "—"}, ${c.confidence_score ?? "—"}%)`); }
function lineList(values: string[], empty = "Data unavailable"): string { return values.length ? values.map((v) => `• ${v}`).join("\n") : `• ${empty}`; }
function patternAlerts(snapshots: SymbolSnapshot[]): string[] { return snapshots.filter((s) => s.dataSource !== "unavailable").slice(0, 8).map((s) => s.volatility === "compressed" ? `${s.symbol}: compression / breakout watch` : s.volatility === "high" ? `${s.symbol}: high volatility expansion` : s.trend === "up" ? `${s.symbol}: trend continuation watch` : s.trend === "down" ? `${s.symbol}: downside continuation risk` : `${s.symbol}: neutral structure`); }

function render(kind: ContentKind, snapshots: SymbolSnapshot[], candidates: Candidate[], signals: Signal[], regime: Regime, feeds: FeedResult[]): string {
  const btc = snapshots.find((s) => s.symbol === "BTCUSDT") ?? snapshotFromCandles("BTCUSDT", []), eth = snapshots.find((s) => s.symbol === "ETHUSDT") ?? snapshotFromCandles("ETHUSDT", []);
  const bullish = topList(candidates, "buy"), bearish = topList(candidates, "sell"), highVol = snapshots.filter((s) => s.volatility === "high").slice(0, 4).map((s) => `${s.symbol} (${fmtPct(s.rangePct)} range)`), breakout = snapshots.filter((s) => s.volatility === "compressed").slice(0, 4).map((s) => `${s.symbol} (${fmtPct(s.rangePct)} range)`);
  const fg = feed(feeds, "fear_greed"), dom = feed(feeds, "btc_dominance"), fund = feed(feeds, "funding"), oi = feed(feeds, "open_interest"), breadth = feed(feeds, "market_breadth"), newsFeed = feed(feeds, "news");
  const breadthValue = breadth.value as { bullish?: number; bearish?: number; aboveShortTrendPct?: number } | null;
  if (kind === "news_digest") return [title(kind), "", "News Intelligence", lineList(newsLines(newsFeed)), "", "Truth Note", "• Headlines are only shown when returned by the configured provider. No fake news is generated.", "", "Market Impact", `• BTC: ${btc.trend} (${fmtPct(btc.changePct)})`, `• ETH: ${eth.trend} (${fmtPct(eth.changePct)})`, `• Regime: ${regime}`].join("\n");
  if (kind === "watchlist_pattern_update") return [title(kind), "", "Breadth", `• Bullish: ${breadthValue?.bullish ?? "—"} · Bearish: ${breadthValue?.bearish ?? "—"} · Above short trend: ${breadthValue?.aboveShortTrendPct?.toFixed(1) ?? "—"}%`, "", "Bullish Watchlist", lineList(bullish), "", "Bearish Watchlist", lineList(bearish), "", "Volatility / Breakout Watch", lineList([...highVol, ...breakout]), "", "Pattern Alerts", lineList(patternAlerts(snapshots))].join("\n");
  if (kind === "market_wrap") { const activeSignals = signals.filter((s) => ["new", "approved", "waiting", "active", "tp1_hit"].includes(s.status)); return [title(kind), "", "Market Summary", `• Regime: ${regime}`, `• Sentiment: ${fg.status === "available" ? `${fg.value} ${fg.classification}` : "unavailable"}`, `• BTC Dominance: ${dom.status === "available" ? `${Number(dom.value).toFixed(2)}% (${dom.classification})` : "unavailable"}`, "", "Strongest / Weakest", lineList([...snapshots].sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999)).slice(0, 3).map((s) => `${s.symbol}: ${fmtPct(s.changePct)}`)), lineList([...snapshots].sort((a, b) => (a.changePct ?? 999) - (b.changePct ?? 999)).slice(0, 3).map((s) => `${s.symbol}: ${fmtPct(s.changePct)}`)), "", "Signals Summary", `• Active/recent qualified signals: ${activeSignals.length}`, `• Recent scanner candidates: ${candidates.length}`, "", "Next-Session Focus", lineList([...breakout, ...highVol].slice(0, 5), "No high-priority focus from available data")].join("\n"); }
  return [title(kind), "", "BTC / ETH Context", `• BTC: ${btc.trend} (${fmtPct(btc.changePct)}, ${btc.freshness})`, `• ETH: ${eth.trend} (${fmtPct(eth.changePct)}, ${eth.freshness})`, "", "Real Intelligence Feeds", `• Fear & Greed: ${fg.status === "available" ? `${fg.value} (${fg.classification})` : "unavailable"}`, `• BTC Dominance: ${dom.status === "available" ? `${Number(dom.value).toFixed(2)}% (${dom.classification})` : "unavailable"}`, `• Funding: ${fundingLine(fund)}`, `• Open Interest: ${oiLine(oi)}`, `• Breadth: ${breadthValue?.bullish ?? "—"} bullish / ${breadthValue?.bearish ?? "—"} bearish`, "", "Market Regime", `• ${regime}`, "", "Watchlist", lineList([...bullish, ...breakout].slice(0, 5)), "", "Risks", lineList([feedLine(feed(feeds, "liquidations")), feedLine(newsFeed), highVol.length ? "High volatility names require smaller exposure" : "No elevated volatility from available candles"])].join("\n");
}

export async function generateIntelligence(supabase: SupabaseClient, kind: ContentKind): Promise<IntelligenceOutput> {
  const [candles, candidates, signals] = await Promise.all([fetchCandles(supabase), fetchCandidates(supabase), fetchSignals(supabase)]);
  const symbols = Array.from(new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT", ...candles.map((c) => c.symbol)])).slice(0, 20);
  const snapshots = symbols.map((symbol) => snapshotFromCandles(symbol, candles));
  const feeds = await buildFeeds(snapshots);
  const btc = snapshots.find((s) => s.symbol === "BTCUSDT") ?? snapshotFromCandles("BTCUSDT", []), eth = snapshots.find((s) => s.symbol === "ETHUSDT") ?? snapshotFromCandles("ETHUSDT", []);
  
  // HMM Continuous Microstructure Classification for BTC / ETH
  const btcCandles = candles.filter((c) => c.symbol === "BTCUSDT").map((c) => ({ open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) }));
  const btcClassifier = new HMMRegimeClassifier("BTCUSDT");
  const btcGkVol = calculateGarmanKlassVolatility(btcCandles);
  const btcHmm = btcClassifier.classifyObservation({
    symbol: "BTCUSDT",
    garman_klass_volatility: btcGkVol,
    order_book_imbalance: 0.0,
    vwas: 0.00020,
    yield_funding_spread: 0.00010,
  });

  const regime = btcHmm.dominant_regime ?? deriveRegime(btc, eth, snapshots, feeds);
  const confidence = confidenceFromData(snapshots, feeds);
  const summary = render(kind, snapshots, candidates, signals, regime, feeds);
  const dataSources = Object.fromEntries(feeds.map((f) => [f.feed_type, f.source]));
  
  return {
    event_id: crypto.randomUUID(),
    event_type: kind,
    title: title(kind),
    summary,
    market: "crypto",
    symbols,
    sentiment: {
      ...Object.fromEntries(feeds.map((f) => [f.feed_type, { value: f.value, classification: f.classification, status: f.status }])),
      hmm_regime_vector: btcHmm,
    },
    regime,
    confidence,
    data_sources: {
      ...dataSources,
      candles: snapshots.some((s) => s.dataSource !== "unavailable") ? "candles" : "unavailable",
      candidates: candidates.length ? "strategy_candidates" : "unavailable",
      signals: signals.length ? "signals" : "unavailable",
      hmm_predictive_engine: "continuous_hmm_v1",
    },
    freshness: {
      generated_at: new Date().toISOString(),
      btc: btc.freshness,
      eth: eth.freshness,
      feeds: Object.fromEntries(feeds.map((f) => [f.feed_type, f.freshness])),
    },
    output_channel: ["admin", "free", "vip"],
    status: confidence >= 50 ? "generated" : "partial",
    metadata: {
      snapshots,
      candidates: candidates.slice(0, 10),
      signals: signals.slice(0, 10),
      feed_health: feeds,
      predictive_regime: btcHmm,
    },
  };
}

export async function storeIntelligenceEvent(supabase: SupabaseClient, output: IntelligenceOutput): Promise<void> {
  await supabase.from("intelligence_events").insert({ event_id: output.event_id, event_type: output.event_type, module: output.event_type === "news_digest" ? "news" : output.event_type === "watchlist_pattern_update" ? "watchlist_pattern" : "brief_generator", title: output.title, summary: output.summary, market: output.market, symbols: output.symbols, sentiment: output.sentiment, regime: output.regime, confidence: output.confidence, data_sources: output.data_sources, freshness: output.freshness, output_channel: output.output_channel, status: output.status, metadata: output.metadata });
  const rows = ((output.metadata.feed_health ?? []) as FeedResult[]).map((f) => ({ event_id: output.event_id, feed_type: f.feed_type, value: f.value, classification: f.classification, source: f.source, freshness: f.freshness, status: f.status, error_message: f.error_message, quality_status: f.quality_status, quality_score: f.quality_score, ranking_eligible: f.ranking_eligible, failure_reason: f.failure_reason, provider: f.provider, endpoint: f.endpoint, update_frequency: f.update_frequency, fallback_source: f.fallback_source, historical_coverage: f.historical_coverage, created_at: f.created_at }));
  if (rows.length) await supabase.from("intelligence_feed_results").insert(rows);
}
