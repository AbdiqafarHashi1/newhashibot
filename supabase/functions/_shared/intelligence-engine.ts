import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

type ContentKind = "morning_brief" | "news_digest" | "watchlist_pattern_update" | "market_wrap";
type Regime = "risk_on" | "risk_off" | "neutral" | "volatile" | "compressed" | "breakout_watch";

type Candle = { symbol: string; timeframe: string; open_time: string; open: number | string; high: number | string; low: number | string; close: number | string; volume?: number | string | null; source?: string | null };
type Candidate = { symbol: string; direction: string; confidence_score?: number | null; grade?: string | null; regime?: string | null; strategy_name?: string | null; reason?: string | null; created_at: string };
type Signal = { symbol: string; direction: string; status: string; grade?: string | null; confidence_score?: number | null; created_at: string };

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

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pct(from: number | null, to: number | null): number | null {
  if (!from || !to) return null;
  return ((to - from) / from) * 100;
}

function fmtPct(value: number | null): string {
  return value === null ? "Data unavailable" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function ageLabel(iso?: string | null): string {
  if (!iso) return "Data unavailable";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function title(kind: ContentKind): string {
  if (kind === "morning_brief") return "🌅 HashiBot Morning Brief";
  if (kind === "news_digest") return "📰 HashiBot News Intelligence Digest";
  if (kind === "watchlist_pattern_update") return "📡 HashiBot Watchlist + Pattern Update";
  return "🌙 HashiBot Market Wrap";
}

function snapshotFromCandles(symbol: string, candles: Candle[]): SymbolSnapshot {
  const rows = candles.filter((c) => c.symbol === symbol).sort((a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime());
  if (rows.length < 2) return { symbol, last: null, changePct: null, rangePct: null, trend: "unavailable", volatility: "unavailable", freshness: "Data unavailable", dataSource: "unavailable" };
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstClose = num(first.close);
  const lastClose = num(last.close);
  const highs = rows.map((r) => num(r.high)).filter((v): v is number => v !== null);
  const lows = rows.map((r) => num(r.low)).filter((v): v is number => v !== null);
  const high = highs.length ? Math.max(...highs) : null;
  const low = lows.length ? Math.min(...lows) : null;
  const changePct = pct(firstClose, lastClose);
  const rangePct = high !== null && low !== null && lastClose ? ((high - low) / lastClose) * 100 : null;
  const trend = changePct === null ? "unavailable" : changePct > 0.7 ? "up" : changePct < -0.7 ? "down" : "flat";
  const volatility = rangePct === null ? "unavailable" : rangePct < 1.8 ? "compressed" : rangePct > 5 ? "high" : "normal";
  return { symbol, last: lastClose, changePct, rangePct, trend, volatility, freshness: ageLabel(last.open_time), dataSource: last.source ?? "candles" };
}

function deriveRegime(btc: SymbolSnapshot, eth: SymbolSnapshot, snapshots: SymbolSnapshot[]): Regime {
  const highVol = snapshots.filter((s) => s.volatility === "high").length;
  const compressed = snapshots.filter((s) => s.volatility === "compressed").length;
  if (highVol >= Math.max(2, Math.ceil(snapshots.length * 0.35))) return "volatile";
  if (compressed >= Math.max(2, Math.ceil(snapshots.length * 0.45))) return "compressed";
  if (btc.volatility === "compressed" && eth.volatility === "compressed") return "breakout_watch";
  if (btc.trend === "up" && eth.trend === "up") return "risk_on";
  if (btc.trend === "down" && eth.trend === "down") return "risk_off";
  return "neutral";
}

function confidenceFromData(snapshots: SymbolSnapshot[], newsConfigured: boolean, sentimentLive: boolean): number {
  const liveCount = snapshots.filter((s) => s.dataSource !== "unavailable").length;
  const marketScore = snapshots.length ? (liveCount / snapshots.length) * 70 : 0;
  return Math.round(Math.min(95, marketScore + (sentimentLive ? 15 : 0) + (newsConfigured ? 10 : 0)));
}

async function fetchCandles(supabase: SupabaseClient): Promise<Candle[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("candles")
    .select("symbol,timeframe,open_time,open,high,low,close,volume,source")
    .eq("market_type", "crypto")
    .eq("timeframe", "1h")
    .gte("open_time", since)
    .order("open_time", { ascending: true });
  return (data ?? []) as Candle[];
}

async function fetchCandidates(supabase: SupabaseClient): Promise<Candidate[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("strategy_candidates")
    .select("symbol,direction,confidence_score,grade,regime,strategy_name,reason,created_at")
    .eq("market_type", "crypto")
    .gte("created_at", since)
    .order("confidence_score", { ascending: false })
    .limit(40);
  return (data ?? []) as Candidate[];
}

async function fetchSignals(supabase: SupabaseClient): Promise<Signal[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("signals")
    .select("symbol,direction,status,grade,confidence_score,created_at")
    .eq("market_type", "crypto")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);
  return (data ?? []) as Signal[];
}

async function buildSentiment(): Promise<{ summary: string; data: Record<string, unknown>; live: boolean }> {
  const fearGreedUrl = Deno.env.get("FEAR_GREED_API_URL") ?? "";
  if (!fearGreedUrl) {
    return {
      summary: "External sentiment provider: Data unavailable. Fallback uses only BTC/ETH trend and volatility from stored candles.",
      data: { fear_greed: "Data unavailable", funding_bias: "Data unavailable", open_interest: "Data unavailable", liquidations: "Data unavailable", btc_dominance: "Data unavailable", data_source: "unavailable" },
      live: false,
    };
  }
  try {
    const res = await fetch(fearGreedUrl, { signal: AbortSignal.timeout(5000) });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { summary: "External sentiment provider responded. Funding, OI and liquidation adapters remain optional.", data: { fear_greed: json, funding_bias: "Data unavailable", open_interest: "Data unavailable", liquidations: "Data unavailable", btc_dominance: "Data unavailable", data_source: "fear_greed_api" }, live: res.ok };
  } catch (e) {
    return { summary: `Sentiment provider error: ${e instanceof Error ? e.message : "unknown"}.`, data: { fear_greed: "Data unavailable", data_source: "provider_error" }, live: false };
  }
}

function buildNews(): { summary: string; providerConfigured: boolean; data: Record<string, unknown> } {
  const providerConfigured = Boolean(Deno.env.get("CRYPTO_NEWS_API_URL") || Deno.env.get("NEWS_API_KEY"));
  if (!providerConfigured) {
    return { summary: "News provider not configured. No ETF, regulatory, exchange, macro, or ecosystem headlines were generated.", providerConfigured, data: { data_source: "unavailable", etf_news: [], regulatory_news: [], exchange_news: [], ecosystem_news: [], macro_headlines: [] } };
  }
  return { summary: "News provider configuration detected. Live headline adapter is staged for the next provider integration pass.", providerConfigured, data: { data_source: "configured_pending_adapter", etf_news: [], regulatory_news: [], exchange_news: [], ecosystem_news: [], macro_headlines: [] } };
}

function topList(items: Candidate[], direction: "buy" | "sell", max = 4): string[] {
  return items.filter((c) => c.direction === direction).slice(0, max).map((c) => `${c.symbol} (${c.grade ?? "—"}, ${c.confidence_score ?? "—"}%)`);
}

function patternAlerts(snapshots: SymbolSnapshot[]): string[] {
  return snapshots.filter((s) => s.dataSource !== "unavailable").slice(0, 8).map((s) => {
    if (s.volatility === "compressed") return `${s.symbol}: compression / breakout watch`;
    if (s.volatility === "high") return `${s.symbol}: high volatility expansion`;
    if (s.trend === "up") return `${s.symbol}: trend continuation watch`;
    if (s.trend === "down") return `${s.symbol}: pullback / downside continuation risk`;
    return `${s.symbol}: neutral structure`;
  });
}

function lineList(values: string[], empty = "Data unavailable"): string {
  return values.length ? values.map((v) => `• ${v}`).join("\n") : `• ${empty}`;
}

function render(kind: ContentKind, snapshots: SymbolSnapshot[], candidates: Candidate[], signals: Signal[], regime: Regime, sentimentSummary: string, newsSummary: string): string {
  const btc = snapshots.find((s) => s.symbol === "BTCUSDT") ?? snapshotFromCandles("BTCUSDT", []);
  const eth = snapshots.find((s) => s.symbol === "ETHUSDT") ?? snapshotFromCandles("ETHUSDT", []);
  const bullish = topList(candidates, "buy");
  const bearish = topList(candidates, "sell");
  const highVol = snapshots.filter((s) => s.volatility === "high").slice(0, 4).map((s) => `${s.symbol} (${fmtPct(s.rangePct)} range)`);
  const breakout = snapshots.filter((s) => s.volatility === "compressed").slice(0, 4).map((s) => `${s.symbol} (${fmtPct(s.rangePct)} range)`);
  const patterns = patternAlerts(snapshots);
  const activeSignals = signals.filter((s) => ["new", "approved", "waiting", "active", "tp1_hit"].includes(s.status));

  if (kind === "news_digest") {
    return [title(kind), "", `Data source: ${newsSummary.includes("not configured") ? "unavailable" : "configured"}`, `Freshness: ${new Date().toISOString()}`, "Confidence: conservative", "", "News Intelligence", `• ${newsSummary}`, "", "Market Impact", `• BTC: ${btc.trend} (${fmtPct(btc.changePct)}, ${btc.freshness})`, `• ETH: ${eth.trend} (${fmtPct(eth.changePct)}, ${eth.freshness})`, `• Regime: ${regime}`, "", "Truth Note", "• No headlines are invented when provider data is unavailable."].join("\n");
  }

  if (kind === "watchlist_pattern_update") {
    return [title(kind), "", "Data source: candles + scanner candidates", `Freshness: BTC ${btc.freshness}; ETH ${eth.freshness}`, `Confidence: ${snapshots.some((s) => s.dataSource !== "unavailable") ? "moderate" : "low"}`, "", "Bullish Watchlist", lineList(bullish), "", "Bearish Watchlist", lineList(bearish), "", "High Volatility Watchlist", lineList(highVol), "", "Breakout Watchlist", lineList(breakout), "", "Pattern Alerts", lineList(patterns)].join("\n");
  }

  if (kind === "market_wrap") {
    return [title(kind), "", "Data source: candles + scanner candidates + signals", `Freshness: BTC ${btc.freshness}; ETH ${eth.freshness}`, "", "Market Summary", `• Regime: ${regime}`, `• BTC: ${btc.trend} (${fmtPct(btc.changePct)})`, `• ETH: ${eth.trend} (${fmtPct(eth.changePct)})`, "", "Strongest Movers", lineList([...snapshots].sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0)).slice(0, 5).map((s) => `${s.symbol}: ${fmtPct(s.changePct)}`)), "", "Signals Summary", `• Active/recent qualified signals: ${activeSignals.length}`, `• Recent scanner candidates: ${candidates.length}`, "", "Next-Session Focus", lineList([...breakout, ...highVol].slice(0, 5), "No high-priority focus from available data")].join("\n");
  }

  return [title(kind), "", "Data source: candles + scanner candidates + sentiment status", `Freshness: BTC ${btc.freshness}; ETH ${eth.freshness}`, "", "Market Bias", `• Regime: ${regime}`, `• BTC: ${btc.trend} (${fmtPct(btc.changePct)})`, `• ETH: ${eth.trend} (${fmtPct(eth.changePct)})`, "", "Sentiment", `• ${sentimentSummary}`, "", "Key Watchlist", lineList([...bullish, ...breakout].slice(0, 5)), "", "Risks", lineList([newsSummary.includes("not configured") ? "News provider not configured" : "News provider configured", highVol.length ? "High volatility names require smaller exposure and patience" : "Volatility not elevated from available data"]), "", "Today’s Focus", lineList([...breakout, ...bullish].slice(0, 4), "Wait for cleaner confirmation; no forced trades")].join("\n");
}

export async function generateIntelligence(supabase: SupabaseClient, kind: ContentKind): Promise<IntelligenceOutput> {
  const [candles, candidates, signals, sentiment, news] = await Promise.all([
    fetchCandles(supabase),
    fetchCandidates(supabase),
    fetchSignals(supabase),
    buildSentiment(),
    Promise.resolve(buildNews()),
  ]);
  const symbols = Array.from(new Set(["BTCUSDT", "ETHUSDT", ...candles.map((c) => c.symbol)])).slice(0, 12);
  const snapshots = symbols.map((symbol) => snapshotFromCandles(symbol, candles));
  const btc = snapshots.find((s) => s.symbol === "BTCUSDT") ?? snapshotFromCandles("BTCUSDT", []);
  const eth = snapshots.find((s) => s.symbol === "ETHUSDT") ?? snapshotFromCandles("ETHUSDT", []);
  const regime = deriveRegime(btc, eth, snapshots);
  const confidence = confidenceFromData(snapshots, news.providerConfigured, sentiment.live);
  const summary = render(kind, snapshots, candidates, signals, regime, sentiment.summary, news.summary);
  const dataSources = {
    candles: snapshots.some((s) => s.dataSource !== "unavailable") ? "candles" : "unavailable",
    sentiment: sentiment.data.data_source,
    news: news.data.data_source,
    candidates: candidates.length ? "strategy_candidates" : "unavailable",
    signals: signals.length ? "signals" : "unavailable",
  };
  const freshness = {
    generated_at: new Date().toISOString(),
    btc: btc.freshness,
    eth: eth.freshness,
    candles: snapshots.some((s) => s.dataSource !== "unavailable") ? "last stored 1h candles" : "Data unavailable",
  };

  return {
    event_id: crypto.randomUUID(),
    event_type: kind,
    title: title(kind),
    summary,
    market: "crypto",
    symbols,
    sentiment: sentiment.data,
    regime,
    confidence,
    data_sources: dataSources,
    freshness,
    output_channel: ["admin", "free", "vip"],
    status: confidence >= 50 ? "generated" : "partial",
    metadata: { snapshots, candidates: candidates.slice(0, 10), signals: signals.slice(0, 10), news_provider_configured: news.providerConfigured },
  };
}

export async function storeIntelligenceEvent(supabase: SupabaseClient, output: IntelligenceOutput): Promise<void> {
  await supabase.from("intelligence_events").insert({
    event_id: output.event_id,
    event_type: output.event_type,
    module: output.event_type === "news_digest" ? "news" : output.event_type === "watchlist_pattern_update" ? "watchlist_pattern" : "brief_generator",
    title: output.title,
    summary: output.summary,
    market: output.market,
    symbols: output.symbols,
    sentiment: output.sentiment,
    regime: output.regime,
    confidence: output.confidence,
    data_sources: output.data_sources,
    freshness: output.freshness,
    output_channel: output.output_channel,
    status: output.status,
    metadata: output.metadata,
  });
}
