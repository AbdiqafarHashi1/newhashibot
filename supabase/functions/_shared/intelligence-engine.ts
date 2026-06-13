import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;
type ContentKind = "morning_brief" | "news_digest" | "watchlist_pattern_update" | "market_wrap";
type Regime = "risk_on" | "risk_off" | "neutral" | "volatile" | "compressed" | "breakout_watch";
type FeedStatus = "available" | "unavailable" | "failed";

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
function unavailable(feed_type: string, source = "unavailable", message: string | null = null): FeedResult { return { feed_type, value: null, classification: "unavailable", source, freshness: "Data unavailable", status: "unavailable", error_message: message, created_at: new Date().toISOString() }; }
function failed(feed_type: string, source: string, e: unknown): FeedResult { return { ...unavailable(feed_type, source, e instanceof Error ? e.message : "provider failed"), status: "failed" }; }
async function fetchJson(url: string, headers?: HeadersInit): Promise<unknown> { const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return await res.json(); }

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

async function fearGreed(): Promise<FeedResult> { const url = Deno.env.get("FEAR_GREED_API_URL") || "https://api.alternative.me/fng/?limit=1&format=json"; try { const json = await fetchJson(url) as Record<string, unknown>; const item = Array.isArray(json.data) ? json.data[0] as Record<string, unknown> : json; const value = num(item?.value); return { feed_type: "fear_greed", value, classification: String(item?.value_classification ?? (value === null ? "unavailable" : value >= 55 ? "greed" : value <= 45 ? "fear" : "neutral")), source: Deno.env.get("FEAR_GREED_API_URL") ? "FEAR_GREED_API_URL" : "alternative.me", freshness: item?.timestamp ? ageLabel(new Date(Number(item.timestamp) * 1000).toISOString()) : "live fetch", status: value === null ? "unavailable" : "available", error_message: null, created_at: new Date().toISOString() }; } catch (e) { return failed("fear_greed", "fear_greed_provider", e); } }
async function btcDominance(): Promise<FeedResult> { try { const json = await fetchJson("https://api.coingecko.com/api/v3/global") as { data?: { market_cap_percentage?: Record<string, number> } }; const value = num(json.data?.market_cap_percentage?.btc); return { feed_type: "btc_dominance", value, classification: value === null ? "unavailable" : value >= 55 ? "high" : value <= 45 ? "low" : "neutral", source: "coingecko_global", freshness: "live fetch", status: value === null ? "unavailable" : "available", error_message: null, created_at: new Date().toISOString() }; } catch (e) { return failed("btc_dominance", "coingecko_global", e); } }
async function funding(): Promise<FeedResult> { try { const rows = await Promise.all(MAJORS.map(async (symbol) => { const json = await fetchJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`) as Record<string, unknown>; return { symbol, fundingRate: num(json.lastFundingRate), nextFundingTime: json.nextFundingTime }; })); const avg = rows.reduce((s, r) => s + (r.fundingRate ?? 0), 0) / rows.length; return { feed_type: "funding", value: rows, classification: avg > 0.0001 ? "bullish_long_crowding" : avg < -0.0001 ? "bearish_short_crowding" : "neutral", source: "binance_usdm_futures", freshness: "live fetch", status: "available", error_message: null, created_at: new Date().toISOString() }; } catch (e) { return failed("funding", "binance_usdm_futures", e); } }
async function openInterest(): Promise<FeedResult> { try { const rows = await Promise.all(MAJORS.map(async (symbol) => { const [now, hist] = await Promise.all([fetchJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`) as Promise<Record<string, unknown>>, fetchJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=2`) as Promise<Record<string, unknown>[]>]); const current = num(now.openInterest); const prev = Array.isArray(hist) && hist.length > 1 ? num(hist[0].sumOpenInterest) : null; return { symbol, openInterest: current, changePct: pct(prev, current) }; })); const avg = rows.reduce((s, r) => s + (r.changePct ?? 0), 0) / rows.length; return { feed_type: "open_interest", value: rows, classification: avg > 1 ? "rising" : avg < -1 ? "falling" : "flat", source: "binance_usdm_futures", freshness: "live fetch", status: "available", error_message: null, created_at: new Date().toISOString() }; } catch (e) { return failed("open_interest", "binance_usdm_futures", e); } }
async function liquidations(): Promise<FeedResult> { const url = Deno.env.get("LIQUIDATIONS_API_URL") ?? ""; if (!url) return unavailable("liquidations", "provider_not_configured", "LIQUIDATIONS_API_URL missing"); try { const json = await fetchJson(url); return { feed_type: "liquidations", value: json, classification: "provider_data", source: "LIQUIDATIONS_API_URL", freshness: "live fetch", status: "available", error_message: null, created_at: new Date().toISOString() }; } catch (e) { return failed("liquidations", "LIQUIDATIONS_API_URL", e); } }
function marketBreadth(snapshots: SymbolSnapshot[]): FeedResult { const live = snapshots.filter((s) => s.dataSource !== "unavailable"); if (!live.length) return unavailable("market_breadth", "candles", "No tracked candles available"); const bullish = live.filter((s) => s.trend === "up").length, bearish = live.filter((s) => s.trend === "down").length; const aboveShortTrendPct = (bullish / live.length) * 100; return { feed_type: "market_breadth", value: { tracked: live.length, bullish, bearish, aboveShortTrendPct }, classification: aboveShortTrendPct >= 60 ? "broad_strength" : aboveShortTrendPct <= 40 ? "broad_weakness" : "mixed", source: "candles", freshness: "last stored 1h candles", status: "available", error_message: null, created_at: new Date().toISOString() }; }
function sectorRotation(): FeedResult { return unavailable("sector_rotation", "symbol_categories", "Category data unavailable for tracked symbols"); }
async function stablecoinFlow(): Promise<FeedResult> { const url = Deno.env.get("STABLECOIN_FLOW_API_URL") ?? ""; if (!url) return unavailable("stablecoin_flow", "provider_not_configured", "STABLECOIN_FLOW_API_URL missing"); try { const json = await fetchJson(url); return { feed_type: "stablecoin_flow", value: json, classification: "provider_data", source: "STABLECOIN_FLOW_API_URL", freshness: "live fetch", status: "available", error_message: null, created_at: new Date().toISOString() }; } catch (e) { return failed("stablecoin_flow", "STABLECOIN_FLOW_API_URL", e); } }
function newsSourceName(source: unknown, fallback: unknown): string { if (source && typeof source === "object" && "title" in source) return String((source as { title?: unknown }).title ?? fallback ?? "news_provider"); return String(source ?? fallback ?? "news_provider"); }
async function news(): Promise<FeedResult> { const url = Deno.env.get("CRYPTO_NEWS_API_URL") ?? ""; const key = Deno.env.get("NEWS_API_KEY") ?? ""; if (!url) return unavailable("news", "provider_not_configured", "News provider unavailable"); try { const sep = url.includes("?") ? "&" : "?"; const full = key && !url.includes("auth_token") && !url.includes("apiKey") ? `${url}${sep}auth_token=${encodeURIComponent(key)}` : url; const json = await fetchJson(full) as Record<string, unknown>; const raw = (Array.isArray(json.results) ? json.results : Array.isArray(json.articles) ? json.articles : Array.isArray(json.data) ? json.data : []) as Record<string, unknown>[]; const headlines = raw.slice(0, 20).map((h) => ({ title: String(h.title ?? "").slice(0, 220), url: String(h.url ?? h.domain ?? ""), source: newsSourceName(h.source, h.domain), published_at: String(h.published_at ?? h.publishedAt ?? h.created_at ?? "") })).filter((h) => h.title); const buckets: Record<string, typeof headlines> = Object.fromEntries(NEWS_BUCKETS.map((b) => [b, []])); for (const h of headlines) { const t = h.title.toLowerCase(); const bucket = t.includes("etf") ? "etf" : /sec|cftc|regulat|law|court|policy/.test(t) ? "regulatory" : /binance|coinbase|kraken|exchange/.test(t) ? "exchange" : /fed|cpi|rates|dollar|macro/.test(t) ? "macro" : "ecosystem"; buckets[bucket].push(h); } return { feed_type: "news", value: { headlines, buckets }, classification: headlines.length ? "headlines_available" : "no_headlines", source: "CRYPTO_NEWS_API_URL", freshness: "live fetch", status: "available", error_message: null, created_at: new Date().toISOString() }; } catch (e) { return failed("news", "CRYPTO_NEWS_API_URL", e); } }
async function buildFeeds(snapshots: SymbolSnapshot[]): Promise<FeedResult[]> { const asyncFeeds = await Promise.all([fearGreed(), btcDominance(), funding(), openInterest(), liquidations(), news(), stablecoinFlow()]); return [...asyncFeeds, marketBreadth(snapshots), sectorRotation()]; }
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
  const regime = deriveRegime(btc, eth, snapshots, feeds);
  const confidence = confidenceFromData(snapshots, feeds);
  const summary = render(kind, snapshots, candidates, signals, regime, feeds);
  const dataSources = Object.fromEntries(feeds.map((f) => [f.feed_type, f.source]));
  return { event_id: crypto.randomUUID(), event_type: kind, title: title(kind), summary, market: "crypto", symbols, sentiment: Object.fromEntries(feeds.map((f) => [f.feed_type, { value: f.value, classification: f.classification, status: f.status }])), regime, confidence, data_sources: { ...dataSources, candles: snapshots.some((s) => s.dataSource !== "unavailable") ? "candles" : "unavailable", candidates: candidates.length ? "strategy_candidates" : "unavailable", signals: signals.length ? "signals" : "unavailable" }, freshness: { generated_at: new Date().toISOString(), btc: btc.freshness, eth: eth.freshness, feeds: Object.fromEntries(feeds.map((f) => [f.feed_type, f.freshness])) }, output_channel: ["admin", "free", "vip"], status: confidence >= 50 ? "generated" : "partial", metadata: { snapshots, candidates: candidates.slice(0, 10), signals: signals.slice(0, 10), feed_health: feeds } };
}

export async function storeIntelligenceEvent(supabase: SupabaseClient, output: IntelligenceOutput): Promise<void> {
  await supabase.from("intelligence_events").insert({ event_id: output.event_id, event_type: output.event_type, module: output.event_type === "news_digest" ? "news" : output.event_type === "watchlist_pattern_update" ? "watchlist_pattern" : "brief_generator", title: output.title, summary: output.summary, market: output.market, symbols: output.symbols, sentiment: output.sentiment, regime: output.regime, confidence: output.confidence, data_sources: output.data_sources, freshness: output.freshness, output_channel: output.output_channel, status: output.status, metadata: output.metadata });
  const rows = ((output.metadata.feed_health ?? []) as FeedResult[]).map((f) => ({ event_id: output.event_id, feed_type: f.feed_type, value: f.value, classification: f.classification, source: f.source, freshness: f.freshness, status: f.status, error_message: f.error_message, created_at: f.created_at }));
  if (rows.length) await supabase.from("intelligence_feed_results").insert(rows);
}
