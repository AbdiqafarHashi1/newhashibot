/** Phase 6 content domain. This module is deliberately transport-agnostic: the
 * ROOT telegram router remains the only delivery mechanism. */
export type EvidencePoint = { label: string; value: string | number; source: string; observed_at: string; confidence?: number };
export type NewsInput = { title: string; source: string; url?: string; published_at: string; symbols?: string[]; summary?: string; importance?: number };
export type RankedNews = NewsInput & { fingerprint: string; score: number; freshness: "fresh" | "recent" | "stale"; confidence: number; symbols: string[] };
export type AnalysisSection = { facts: string[]; evidence: string[]; interpretation: string[]; possibilities: string[]; invalidation: string[] };
export type ContentCategory = "briefing" | "news" | "analysis" | "signal" | "trade_lifecycle" | "performance" | "education" | "customer" | "admin" | "broadcast" | "alert";

const SPAM = /(?:guaranteed profit|100x|airdrop now|send (?:us|me) crypto|risk[- ]free|click here)/i;
const SYMBOL = /\b(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|AVAX|XAUUSD|EURUSD|GBPUSD|USDJPY)(?:USDT)?\b/gi;
const clean = (value: string) => value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
const fingerprint = (value: string) => clean(value).toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 14).sort().join("-");
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Removes spam and near-identical headlines, then ranks only source-attributed facts. */
export function processNews(items: readonly NewsInput[], now = new Date()): RankedNews[] {
  const unique = new Map<string, RankedNews>();
  for (const raw of items) {
    const title = clean(raw.title), source = clean(raw.source);
    const timestamp = Date.parse(raw.published_at);
    if (!title || !source || SPAM.test(`${title} ${raw.summary ?? ""}`) || !Number.isFinite(timestamp) || timestamp > now.getTime() + 300_000) continue;
    const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
    if (ageHours > 168) continue;
    const key = fingerprint(title);
    const symbols = [...new Set([...(raw.symbols ?? []), ...(title.match(SYMBOL) ?? [])].map((s) => s.toUpperCase().replace(/USDT$/, "")))];
    const importance = clamp(raw.importance ?? 50);
    const timeScore = Math.max(0, 35 - ageHours * 1.5);
    const score = clamp(importance * .6 + timeScore + Math.min(10, symbols.length * 2));
    const item: RankedNews = { ...raw, title, source, summary: raw.summary ? clean(raw.summary).slice(0, 420) : undefined, symbols, fingerprint: key, score, freshness: ageHours <= 6 ? "fresh" : ageHours <= 24 ? "recent" : "stale", confidence: clamp(55 + (raw.url ? 15 : 0) + Math.min(20, importance / 5)) };
    if (!unique.has(key) || score > unique.get(key)!.score) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || Date.parse(b.published_at) - Date.parse(a.published_at));
}

export function buildEvidenceAnalysis(points: readonly EvidencePoint[], possibilities: readonly string[] = []): AnalysisSection {
  const valid = points.filter((p) => clean(p.label) && clean(String(p.value)) && clean(p.source) && Number.isFinite(Date.parse(p.observed_at)));
  if (!valid.length) return { facts: ["Insufficient verified market data."], evidence: [], interpretation: ["No evidence-based conclusion is available."], possibilities: [], invalidation: ["Reassess when fresh, attributed observations are available."] };
  return {
    facts: valid.map((p) => `${clean(p.label)}: ${clean(String(p.value))}.`),
    evidence: valid.map((p) => `${clean(p.source)} · ${new Date(p.observed_at).toISOString()} · confidence ${clamp(p.confidence ?? 70)}%`),
    interpretation: [valid.every((p) => (p.confidence ?? 70) >= 70) ? "The available observations are mutually usable; interpretation remains non-predictive." : "Some observations have limited confidence; treat the interpretation cautiously."],
    possibilities: possibilities.map(clean).filter(Boolean).slice(0, 3),
    invalidation: ["This interpretation is invalid if the cited observations become stale, are corrected, or materially reverse."],
  };
}

export function renderAnalysis(title: string, section: AnalysisSection, at: string): string {
  const block = (name: string, rows: readonly string[]) => rows.length ? [`${name}`, ...rows.map((x) => `• ${clean(x)}`)] : [];
  return ["◆ HASHIBOT INTELLIGENCE", clean(title), "", ...block("FACTS", section.facts), "", ...block("EVIDENCE", section.evidence), "", ...block("INTERPRETATION", section.interpretation), "", ...block("POSSIBLE SCENARIOS — NOT PREDICTIONS", section.possibilities), "", ...block("INVALIDATION", section.invalidation), "", `Updated: ${new Date(at).toISOString()}`, "Educational market commentary; not financial advice."].filter((v, i, a) => v !== "" || a[i - 1] !== "").join("\n").slice(0, 4096);
}

export const TEMPLATE_CATALOG: Readonly<Record<ContentCategory, readonly string[]>> = Object.freeze({
  briefing: ["morning_brief", "midday_update", "evening_wrap", "weekend_outlook", "weekly_outlook", "market_pulse", "watchlist", "economic_calendar", "news_digest"],
  news: ["breaking_news", "ranked_news_digest", "macro_event", "etf_activity", "whale_activity", "liquidation_alert"],
  analysis: ["asset_explainer", "market_regime", "funding_oi", "support_resistance", "volatility", "correlation"],
  signal: ["signal_published", "signal_explanation", "signal_waiting", "signal_invalidated"],
  trade_lifecycle: ["entry_filled", "protection_attached", "break_even", "tp1", "tp2", "manual_close", "recovery", "cancelled", "expired", "missed", "closed"],
  performance: ["daily", "weekly", "monthly", "strategy", "symbol", "provider", "execution", "telegram_delivery", "customer"],
  education: ["risk_management", "psychology", "technical_analysis", "strategy_spotlight", "glossary", "faq", "beginner_lesson", "professional_lesson"],
  customer: ["welcome", "trial", "subscription", "renewal", "expiry", "execution_ready", "execution_disabled", "maintenance", "feature_announcement", "service_update", "support"],
  admin: ["operational_digest", "health_summary", "incident", "deployment", "maintenance", "emergency", "test", "internal_report"],
  broadcast: ["announcement", "service_notice"], alert: ["volatility", "risk_condition", "data_quality"],
});

export function renderEducation(topic: string, principle: string, practice: string, at: string): string {
  return ["◆ HASHIBOT ACADEMY", clean(topic), "", "PRINCIPLE", clean(principle), "", "PRACTICAL APPLICATION", clean(practice), "", "Risk is uncertain; examples are educational, not personalized advice.", `Published: ${new Date(at).toISOString()}`].join("\n").slice(0, 4096);
}
