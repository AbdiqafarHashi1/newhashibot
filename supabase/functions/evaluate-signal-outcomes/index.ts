import {signalReferenceR} from '../_shared/signal-level-outcomes.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";
import { publicSignalReference, renderProfessionalTelegramMessage, telegramTypeForSignalStatus } from "../_shared/professional-telegram.ts";
import { paperIntentStatusForSignalStatus } from "../_shared/paper-trade-lifecycle.ts";
import { loadMT5Candles } from "../_shared/mt5-market-data-provider.ts";
import {enqueueCanonicalLifecycle} from "../_shared/canonical-lifecycle-publication.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token",
};

const TERMINAL = new Set(["tp2_hit", "sl_hit", "expired", "cancelled"]);
const EVALUATED_STATUSES = ["waiting", "active", "new", "approved", "tp1_hit"];
const LEGACY_GLOBAL_EXPIRY_MINS = 360;

type SupabaseClient = ReturnType<typeof createClient>;

type SignalRow = Record<string, unknown> & {
  id: string;
  candidate_id?: string | null;
  symbol: string;
  market_type?: string | null;
  direction?: string | null;
  status?: string | null;
  data_source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TelegramResult = {
  sent: boolean;
  skipped: boolean;
  failed: boolean;
  reason?: string;
  delivery_id?: string;
};


interface OutcomeCandle {
  open_time: string;
  high: number;
  low: number;
  close: number;
}

interface CandleOutcomeResult {
  next_status: string;
  reason: string;
  price: number | null;
  source: string;
}

function isJpyPair(symbol: string): boolean {
  return normalizeForexSymbol(symbol).endsWith("JPY");
}

function forexPrecision(symbol: string): number {
  return isJpyPair(symbol) ? 3 : 5;
}

function forexPipSize(symbol: string): number {
  return isJpyPair(symbol) ? 0.01 : 0.0001;
}

function formatPriceForMarket(sig: SignalRow, value: number | null, empty = "—"): string {
  if (value === null || !Number.isFinite(value)) return empty;
  return String(sig.market_type ?? "").toLowerCase() === "forex"
    ? value.toFixed(forexPrecision(sig.symbol))
    : value >= 100 ? value.toFixed(2) : value.toFixed(5);
}

function pipDistance(sig: SignalRow, from: number | null, to: number | null): number | null {
  if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.abs(to - from) / forexPipSize(sig.symbol);
}

function formatPips(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)} pips`;
}

function rMultipleForStatus(sig: SignalRow, status: string): number | null {
  return signalReferenceR({entry:entryMidpoint(sig),stop:numberField(sig,'stop_loss','sl'),tp1:numberField(sig,'tp1'),tp2:numberField(sig,'tp2'),direction:String(sig.direction??'').toLowerCase()},status);
}

function toTwelveDataInterval(tf: string): string | null {
  const map: Record<string, string> = { "5m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "4h": "4h", "1d": "1day" };
  return map[tf] ?? null;
}

function parseTwelveDataDate(value: string): string {
  if (!value) return new Date().toISOString();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value).toISOString();
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

function classifyProviderFailure(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate") || m.includes("limit") || m.includes("429")) return "provider_rate_limited";
  if (m.includes("unsupported") || m.includes("timeframe") || m.includes("interval")) return "unsupported_timeframe";
  if (m.includes("json") || m.includes("invalid") || m.includes("unexpected")) return "provider_invalid_response";
  if (m.includes("no values") || m.includes("no_data") || m.includes("unavailable")) return "provider_data_unavailable";
  return "provider_data_unavailable";
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw === null || raw === "") return fallback;
  return !["false", "0", "off", "no"].includes(raw.trim().toLowerCase());
}

function numberField(sig: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(sig[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function hasFiniteNumber(sig: Record<string, unknown>, ...keys: string[]) {
  return numberField(sig, ...keys) !== null;
}

function entryMidpoint(sig: Record<string, unknown>): number | null {
  const entry = numberField(sig, "entry");
  if (entry !== null) return entry;
  const low = numberField(sig, "entry_low");
  const high = numberField(sig, "entry_high");
  if (low !== null && high !== null) return (low + high) / 2;
  return high ?? low;
}

function normalizeBinanceSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

async function binancePrice(symbol: string): Promise<number | null> {
  try {
    const binanceSymbol = normalizeBinanceSymbol(symbol);
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(binanceSymbol)}`, {
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return null;
    const j = await r.json() as { price?: string };
    const price = Number(j.price);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

function normalizeForexSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

async function mt5ForexPrice(sig: SignalRow, supabase: SupabaseClient): Promise<number | null> {
  const result = await loadMT5Candles(supabase, sig.symbol, String(sig.timeframe ?? "15m"), 1);
  if (result.candles && result.candles.length > 0) {
    const last = result.candles[result.candles.length - 1];
    return last.close > 0 ? last.close : null;
  }
  return null;
}

async function mt5ForexCandles(
  supabase: SupabaseClient,
  symbol: string,
  timeframe: string,
  sinceIso: string
): Promise<{ candles: OutcomeCandle[] | null; source: string; reason?: string }> {
  const result = await loadMT5Candles(supabase, symbol, timeframe, 120);
  if (result.error || !result.candles || result.candles.length === 0) {
    return { candles: null, source: "mt5_durable_candles", reason: result.error ?? "provider_data_unavailable" };
  }
  const sinceMs = new Date(sinceIso).getTime();
  const candles: OutcomeCandle[] = result.candles
    .map((c: any) => ({
      open_time: c.open_time,
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }))
    .filter((c: OutcomeCandle) => Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && c.high >= c.low)
    .sort((a: OutcomeCandle, b: OutcomeCandle) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime())
    .filter((c: OutcomeCandle) => !Number.isFinite(sinceMs) || new Date(c.open_time).getTime() >= sinceMs - 60_000);

  if (candles.length === 0) return { candles: null, source: "mt5_durable_candles", reason: "insufficient_candles" };
  return { candles, source: "mt5_durable_candles" };
}

async function latestPrice(sig: SignalRow, supabase: SupabaseClient): Promise<{ price: number | null; source: string; reason?: string }> {
  const marketType = String(sig.market_type ?? "").toLowerCase();
  if (marketType === "crypto") return { price: await binancePrice(sig.symbol), source: "binance_latest_price" };
  if (marketType === "forex") {
    if (!parseBooleanEnv("SIGNAL_ENABLE_FOREX", false)) return { price: null, source: "mt5_durable_price", reason: "forex_disabled" };
    return { price: await mt5ForexPrice(sig, supabase), source: "mt5_durable_price" };
  }
  return { price: null, source: "unsupported", reason: "unsupported_market_type" };
}

function entryTouched(sig: SignalRow, candle: OutcomeCandle): boolean {
  const direction = String(sig.direction ?? "").toLowerCase();
  const entryLow = numberField(sig, "entry_low", "entry");
  const entryHigh = numberField(sig, "entry_high", "entry");
  if (entryLow === null && entryHigh === null) return false;
  const low = entryLow ?? entryHigh!;
  const high = entryHigh ?? entryLow!;
  if (direction === "sell") return candle.high >= low && candle.low <= high;
  return candle.high >= low && candle.low <= high;
}

function evaluateCandleAfterEntry(sig: SignalRow, candle: OutcomeCandle): { next_status: string; reason: string; price: number | null } | null {
  const direction = String(sig.direction ?? "").toLowerCase();
  const currentStatus = String(sig.status ?? "waiting");
  const sl = numberField(sig, "stop_loss", "sl");
  const tp1 = numberField(sig, "tp1");
  const tp2 = numberField(sig, "tp2");

  if (direction === "buy") {
    const slHit = sl !== null && candle.low <= sl;
    const tp2Hit = tp2 !== null && candle.high >= tp2;
    const tp1Hit = tp1 !== null && candle.high >= tp1;
    // Conservative same-candle handling: if SL and any TP are touched in the same candle, SL wins.
    if (slHit) return { next_status: "sl_hit", reason: tp1Hit || tp2Hit ? "candle_trigger_sl_conservative_same_candle" : "candle_trigger_sl", price: sl };
    if (tp2Hit) return { next_status: "tp2_hit", reason: "candle_trigger_tp2", price: tp2 };
    if (tp1Hit && currentStatus !== "tp1_hit") return { next_status: "tp1_hit", reason: "candle_trigger_tp1", price: tp1 };
    return null;
  }

  if (direction === "sell") {
    const slHit = sl !== null && candle.high >= sl;
    const tp2Hit = tp2 !== null && candle.low <= tp2;
    const tp1Hit = tp1 !== null && candle.low <= tp1;
    // Conservative same-candle handling: if SL and any TP are touched in the same candle, SL wins.
    if (slHit) return { next_status: "sl_hit", reason: tp1Hit || tp2Hit ? "candle_trigger_sl_conservative_same_candle" : "candle_trigger_sl", price: sl };
    if (tp2Hit) return { next_status: "tp2_hit", reason: "candle_trigger_tp2", price: tp2 };
    if (tp1Hit && currentStatus !== "tp1_hit") return { next_status: "tp1_hit", reason: "candle_trigger_tp1", price: tp1 };
  }
  return null;
}

function getForexOutcomeFromCandles(sig: SignalRow, candles: OutcomeCandle[]): CandleOutcomeResult {
  const currentStatus = String(sig.status ?? "waiting");
  let entered = !["waiting", "new", "approved"].includes(currentStatus);
  let entryTriggered = false;
  let lastPrice: number | null = null;

  for (const candle of candles) {
    lastPrice = candle.close;
    if (!entered) {
      if (!entryTouched(sig, candle)) continue;
      entered = true;
      entryTriggered = true;
    }

    const exit = evaluateCandleAfterEntry(sig, candle);
    if (exit) return { ...exit, source: "twelvedata_forex_candles" };
  }

  if (entryTriggered && ["waiting", "new", "approved"].includes(currentStatus)) {
    return { next_status: "active", reason: "candle_entry_trigger", price: lastPrice, source: "twelvedata_forex_candles" };
  }

  return { next_status: currentStatus, reason: "no_change", price: lastPrice, source: "twelvedata_forex_candles" };
}

function getOutcomeForSignal(sig: SignalRow, price: number): { next_status: string; reason: string } {
  const direction = String(sig.direction ?? "").toLowerCase();
  const status = String(sig.status ?? "waiting");
  const sl = numberField(sig, "stop_loss", "sl");
  const tp1 = numberField(sig, "tp1");
  const tp2 = numberField(sig, "tp2");
  const entryLow = numberField(sig, "entry_low", "entry");
  const entryHigh = numberField(sig, "entry_high", "entry");

  // Latest-price evaluation is deterministic but cannot know intrabar ordering.
  if (direction === "buy") {
    if (sl !== null && price <= sl) return { next_status: "sl_hit", reason: "price_trigger_sl" };
    if (tp2 !== null && price >= tp2) return { next_status: "tp2_hit", reason: "price_trigger_tp2" };
    if (tp1 !== null && price >= tp1 && status !== "tp1_hit") return { next_status: "tp1_hit", reason: "price_trigger_tp1" };
    if (["waiting", "new", "approved"].includes(status) && entryLow !== null && price >= entryLow) return { next_status: "active", reason: "entry_trigger" };
    return { next_status: status, reason: "no_change" };
  }

  if (sl !== null && price >= sl) return { next_status: "sl_hit", reason: "price_trigger_sl" };
  if (tp2 !== null && price <= tp2) return { next_status: "tp2_hit", reason: "price_trigger_tp2" };
  if (tp1 !== null && price <= tp1 && status !== "tp1_hit") return { next_status: "tp1_hit", reason: "price_trigger_tp1" };
  if (["waiting", "new", "approved"].includes(status) && entryHigh !== null && price <= entryHigh) return { next_status: "active", reason: "entry_trigger" };
  return { next_status: status, reason: "no_change" };
}


function classifyExpiryCause(sig: SignalRow, price: number | null, candidate: Record<string, unknown> | null): { cause: string; evidence: Record<string, unknown> } {
  const direction = String(sig.direction ?? "").toLowerCase();
  const entry = entryMidpoint(sig);
  const stop = numberField(sig, "stop_loss", "sl");
  const tp1 = numberField(sig, "tp1");
  const tp2 = numberField(sig, "tp2");
  const risk = entry !== null && stop !== null ? Math.abs(entry - stop) : 0;
  const scoreBreakdown = (candidate?.score_breakdown && typeof candidate.score_breakdown === "object" ? candidate.score_breakdown : {}) as Record<string, unknown>;
  const candidateReason = String(candidate?.rejection_reason ?? scoreBreakdown.primary_failed_gate ?? "");
  const strategy = String(sig.strategy_name ?? "");
  const confidence = Number(sig.confidence_score ?? candidate?.confidence_score ?? 0);
  const rr = Number(sig.risk_reward ?? candidate?.risk_reward ?? 0);
  const tp1R = entry !== null && tp1 !== null && risk > 0 ? Math.abs(tp1 - entry) / risk : null;
  const tp2R = entry !== null && tp2 !== null && risk > 0 ? Math.abs(tp2 - entry) / risk : rr;
  const tpProgress = price !== null && entry !== null && tp1 !== null
    ? direction === "sell" ? (entry - price) / Math.max(entry - tp1, 1e-12) : (price - entry) / Math.max(tp1 - entry, 1e-12)
    : null;
  const adverseProgress = price !== null && entry !== null && stop !== null
    ? direction === "sell" ? (price - entry) / Math.max(stop - entry, 1e-12) : (entry - price) / Math.max(entry - stop, 1e-12)
    : null;

  let cause = "chop/no follow-through";
  if (["arbitration_blocked", "duplicate_active_signal"].includes(candidateReason)) cause = "wrong arbitration winner";
  else if (candidateReason && candidateReason !== "passed") cause = "strategy should not have entered";
  else if ((tp1R !== null && tp1R > 1.35) || tp2R > 2.4) cause = "TP too far";
  else if (String(sig.status ?? "") === "waiting" || String(sig.status ?? "") === "new" || String(sig.status ?? "") === "approved") cause = "entry too late";
  else if (confidence < 78 || Number(scoreBreakdown.momentum_score ?? 100) < 45) cause = "weak momentum";
  else if (strategy === "CompressionBreakout" && (Number(scoreBreakdown.breakout_distance_atr ?? 1) < 0.20 || Number(scoreBreakdown.atr_expansion ?? 2) < 1.05)) cause = "fake breakout";
  else if (strategy === "SwingContinuation" && (scoreBreakdown.strict_reclaim_confirmed === false || Number(scoreBreakdown.trend_score ?? 100) < 55)) cause = "bad continuation";
  else if (tpProgress !== null && tpProgress > 0.65) cause = "expiry too short";
  else if (adverseProgress !== null && adverseProgress > 0.55) cause = "strategy should not have entered";

  return {
    cause,
    evidence: {
      price, entry, stop, tp1, tp2, risk_reward: rr, tp1_r: tp1R, tp2_r: tp2R,
      tp_progress_to_tp1: tpProgress !== null && Number.isFinite(tpProgress) ? Number(tpProgress.toFixed(3)) : null,
      adverse_progress_to_sl: adverseProgress !== null && Number.isFinite(adverseProgress) ? Number(adverseProgress.toFixed(3)) : null,
      candidate_rejection_reason: candidateReason || "passed",
      confidence_score: confidence,
      candidate_momentum_score: scoreBreakdown.momentum_score ?? null,
      candidate_breakout_distance_atr: scoreBreakdown.breakout_distance_atr ?? null,
      candidate_atr_expansion: scoreBreakdown.atr_expansion ?? null,
      candidate_strict_reclaim_confirmed: scoreBreakdown.strict_reclaim_confirmed ?? null,
      candidate_trend_score: scoreBreakdown.trend_score ?? null,
    },
  };
}

function expiryStatus(sig: SignalRow): { expired: boolean; reason: string } {
  const now = Date.now();
  const expiresAt = sig.expires_at ? new Date(String(sig.expires_at)).getTime() : NaN;
  if (Number.isFinite(expiresAt) && now > expiresAt) return { expired: true, reason: "expires_at_passed" };

  const createdAt = sig.created_at ? new Date(sig.created_at).getTime() : NaN;
  if (Number.isFinite(createdAt) && (now - createdAt) / 60000 > LEGACY_GLOBAL_EXPIRY_MINS) {
    return { expired: true, reason: "legacy_global_max_age_expired" };
  }
  return { expired: false, reason: "not_expired" };
}

function eventLabel(status: string): string {
  const labels: Record<string, string> = {
    tp1_hit: "TP1 HIT",
    tp2_hit: "TP2 HIT",
    sl_hit: "SL HIT",
    expired: "EXPIRED",
  };
  return labels[status] ?? status.replace(/_/g, " ").toUpperCase();
}

function deliveryType(status: string): string {
  const map: Record<string, string> = {
    tp1_hit: "outcome_tp1_hit",
    tp2_hit: "outcome_tp2_hit",
    sl_hit: "outcome_sl_hit",
    expired: "outcome_expired",
  };
  return map[status] ?? `outcome_${status}`;
}

function formatOutcomeMessage(sig: SignalRow, newStatus: string, price: number | null) {
  const entry = entryMidpoint(sig);
  const stopLoss = numberField(sig, "stop_loss", "sl");
  const tp1 = numberField(sig, "tp1");
  const tp2 = numberField(sig, "tp2");
  const marketType = String(sig.market_type ?? "unknown").toLowerCase();
  return renderProfessionalTelegramMessage({
    type: telegramTypeForSignalStatus(newStatus), signal_reference: publicSignalReference(sig.id), market: marketType, symbol: sig.symbol,
    side: String(sig.direction ?? "buy").toLowerCase() === "sell" ? "sell" : "buy", strategy_display_name: String(sig.strategy_name ?? "HashiBot Strategy"),
    strategy_version: typeof sig.strategy_version === "string" ? sig.strategy_version : undefined, timeframe: String(sig.timeframe ?? "—"), event_price: price,
    entry_low: entry ?? undefined, entry_high: entry ?? undefined, stop_loss: stopLoss ?? undefined, tp1: tp1 ?? undefined, tp2: tp2 ?? undefined,
    realized_r: rMultipleForStatus(sig, newStatus), closure_reason: newStatus, session_context: marketType === "forex" ? String(sig.session_context ?? "Forex session") : undefined,
    evidence: [`Persisted lifecycle status: ${newStatus}`, "Virtual signal-level observation; reference-level R is gross and is not provider fill or net account P&L."], occurred_at: new Date().toISOString(),
  });
}

async function sendOutcomeNotification(
  supabase: SupabaseClient,
  sig: SignalRow,
  newStatus: string,
  price: number | null,
): Promise<TelegramResult> {
  const eventId=await enqueueCanonicalLifecycle(supabase,{eventKey:`signal-outcome:${sig.id}`,eventType:"SIGNAL_OUTCOME",eventVersion:["active","tp1_hit","tp2_hit","sl_hit","expired","cancelled"].indexOf(newStatus)+1,signalId:sig.id,payload:{...sig,status:newStatus,event_price:price,details:formatOutcomeMessage(sig,newStatus,price)},destinations:["vip"]});
  return { sent: false, skipped: true, failed: false, reason: "canonical_publication_queued", delivery_id:eventId };
}


// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const source = typeof body.source === "string" && body.source ? body.source : "manual_button";
    const auth = await authorizeInternalOrAdmin(req, supabase);
    if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

    const { data: cfgRow } = await supabase.from("scanner_config").select("scan_forex_enabled,signal_enable_forex,scan_crypto_enabled,signal_enable_crypto").eq("id", 1).maybeSingle();
    const dbForexEnabled = cfgRow ? (cfgRow.scan_forex_enabled !== false && cfgRow.signal_enable_forex !== false) : true;
    const dbCryptoEnabled = cfgRow ? (cfgRow.scan_crypto_enabled !== false && cfgRow.signal_enable_crypto !== false) : true;

    const signalEnableCrypto = parseBooleanEnv("SIGNAL_ENABLE_CRYPTO", true) && dbCryptoEnabled;
    const signalEnableForex = Deno.env.get("SIGNAL_ENABLE_FOREX") !== undefined
      ? parseBooleanEnv("SIGNAL_ENABLE_FOREX", true)
      : dbForexEnabled;
    const marketMode = signalEnableCrypto && !signalEnableForex ? "crypto_only" : signalEnableForex && !signalEnableCrypto ? "forex_only" : signalEnableForex ? "mixed" : "disabled";

    const { data: signals, error: signalError } = await supabase
      .from("signals")
      .select("*")
      .in("status", EVALUATED_STATUSES)
      .or("mode_slug.is.null,mode_slug.neq.conditional_execution")
      .order("created_at", { ascending: false })
      .limit(200);

    if (signalError) {
      return jsonResponse({ success: false, error: signalError.message }, 500);
    }

    const out = {
      success: true,
      source,
      automatic: source !== "manual_button",
      market_mode: marketMode,
      signals_checked: 0,
      signals_updated: 0,
      paper_intents_updated: 0,
      lifecycle_events: 0,
      invalid_transitions: 0,
      duplicate_events_suppressed: 0,
      updates: [] as Array<{ signal_id: string; symbol: string; from: string; to: string; price: number | null; reason: string; telegram_status?: string; telegram_reason?: string }>,
      telegram_sent: 0,
      telegram_skipped: 0,
      telegram_failed: 0,
      telegram_duplicates_suppressed: 0,
      telegram_skip_reasons: [] as string[],
      forex_skipped: !signalEnableForex,
      forex_skipped_count: 0,
      price_unavailable: 0,
      expired: 0,
      skipped: 0,
      skipped_reasons: [] as string[],
      price_source: signalEnableForex ? "binance_latest_price+mt5_durable_candles" : "binance_latest_price",
      price_source_limitation: "Crypto uses latest ticker price. Forex uses MT5 durable candles and conservative same-candle handling: if TP and SL are both touched in one candle, SL wins.",
    };

    for (const sig of ((signals ?? []) as SignalRow[])) {
      const currentStatus = String(sig.status ?? "waiting");
      if (TERMINAL.has(currentStatus)) continue;

      const marketType = String(sig.market_type ?? "").toLowerCase();
      if (marketType === "crypto" && !signalEnableCrypto) {
        out.skipped++;
        out.skipped_reasons.push("crypto_disabled");
        continue;
      }
      if (marketType === "forex" && !signalEnableForex) {
        out.forex_skipped_count++;
        continue;
      }
      if (!["crypto", "forex"].includes(marketType)) {
        out.skipped++;
        out.skipped_reasons.push("unsupported_market_type");
        continue;
      }
      if (String(sig.data_source ?? "").toUpperCase() !== "REAL DATA") {
        out.skipped++;
        out.skipped_reasons.push("not_real_data");
        continue;
      }
      if (!sig.symbol || !sig.direction || !hasFiniteNumber(sig, "entry_low", "entry") || !hasFiniteNumber(sig, "stop_loss", "sl") || !hasFiniteNumber(sig, "tp1")) {
        out.skipped++;
        out.skipped_reasons.push("invalid_trade_fields");
        continue;
      }

      out.signals_checked++;
      let next = currentStatus;
      let price: number | null = null;
      let reason = "no_change";

      const expiry = expiryStatus(sig);
      if (["waiting", "active", "new", "approved"].includes(currentStatus) && expiry.expired) {
        next = "expired";
        reason = expiry.reason;
        out.expired++;
      } else if (marketType === "forex") {
        const sinceForOutcome = ["active", "tp1_hit"].includes(currentStatus)
          ? String(sig.updated_at ?? sig.created_at ?? new Date().toISOString())
          : String(sig.created_at ?? new Date().toISOString());
        const candleResult = await mt5ForexCandles(supabase, sig.symbol, String(sig.timeframe ?? "15m"), sinceForOutcome);
        if (!candleResult.candles) {
          out.price_unavailable++;
          out.skipped_reasons.push(candleResult.reason ?? "provider_data_unavailable");
          continue;
        }
        const outcome = getForexOutcomeFromCandles(sig, candleResult.candles);
        next = outcome.next_status;
        price = outcome.price;
        reason = outcome.reason;
      } else {
        const priceResult = await latestPrice(sig, supabase);
        price = priceResult.price;
        if (price === null) {
          out.price_unavailable++;
          out.skipped_reasons.push(priceResult.reason ?? `${marketType}_price_unavailable`);
          continue;
        }
        const outcome = getOutcomeForSignal(sig, price);
        next = outcome.next_status;
        reason = outcome.reason;
      }

      if (next === currentStatus) continue;

      const { data: existing } = await supabase
        .from("signal_updates")
        .select("id")
        .eq("signal_id", sig.id)
        .eq("new_status", next)
        .maybeSingle();
      if (existing) { out.duplicate_events_suppressed++; continue; }

      let finalReason = reason;
      let expiryCause: string | null = null;
      let expiryEvidence: Record<string, unknown> | null = null;
      if (next === "expired") {
        let candidate: Record<string, unknown> | null = null;
        if (sig.candidate_id) {
          const { data: candidateData } = await supabase
            .from("strategy_candidates")
            .select("rejection_reason, confidence_score, risk_reward, score_breakdown")
            .eq("id", sig.candidate_id)
            .maybeSingle();
          candidate = (candidateData as Record<string, unknown> | null) ?? null;
        }
        if (price === null) {
          const priceResult = await latestPrice(sig, supabase);
          price = priceResult.price;
        }
        const classified = classifyExpiryCause(sig, price, candidate);
        expiryCause = classified.cause;
        expiryEvidence = classified.evidence;
        finalReason = `${reason}; expiry_cause=${expiryCause}`;
      }

      const truthTimestamp = new Date().toISOString();
      await supabase.from("signals").update({ status: next, updated_at: truthTimestamp }).eq("id", sig.id);
      const { data: updateRow } = await supabase.from("signal_updates").insert({
        signal_id: sig.id, update_type: "outcome_status_change", previous_status: currentStatus, old_status: currentStatus, new_status: next,
        message: `${eventLabel(next)} via ${finalReason} (source: ${source})`, price, reason: finalReason, telegram_sent: false, created_at: truthTimestamp,
      }).select("id").maybeSingle();
      const paperStatus = paperIntentStatusForSignalStatus(next);
      if (paperStatus && sig.paper_execution_intent_id) { await supabase.from("paper_execution_intents").update({ ...paperStatus, updated_at: truthTimestamp }).eq("id", String(sig.paper_execution_intent_id)); out.paper_intents_updated++; }
      out.lifecycle_events++;

      const telegramResult = ["tp1_hit", "tp2_hit", "sl_hit", "expired"].includes(next)
        ? await sendOutcomeNotification(supabase, sig, next, price)
        : { sent: false, skipped: false, failed: false } as TelegramResult;

      if (telegramResult.sent) out.telegram_sent++;
      if (telegramResult.skipped) {
        out.telegram_skipped++;
        if (telegramResult.reason?.includes("already_sent")) out.telegram_duplicates_suppressed++;
        if (telegramResult.reason) out.telegram_skip_reasons.push(telegramResult.reason);
      }
      if (telegramResult.failed) {
        out.telegram_failed++;
        if (telegramResult.reason) out.telegram_skip_reasons.push(telegramResult.reason);
      }

      if (updateRow?.id && telegramResult.sent) await supabase.from("signal_updates").update({ telegram_sent: true }).eq("id", String(updateRow.id));

      out.signals_updated++;
      out.updates.push({
        signal_id: sig.id,
        symbol: sig.symbol,
        from: currentStatus,
        to: next,
        price,
        reason: finalReason,
        ...(expiryCause ? { expiry_cause: expiryCause, expiry_evidence: expiryEvidence } : {}),
        telegram_status: telegramResult.sent ? "sent" : telegramResult.failed ? "failed" : telegramResult.skipped ? "skipped" : "not_required",
        telegram_reason: telegramResult.reason,
      });
    }

    out.telegram_skip_reasons = Array.from(new Set(out.telegram_skip_reasons));
    out.skipped_reasons = Array.from(new Set(out.skipped_reasons));

    return jsonResponse(out);
  } catch (e) {
    return jsonResponse({ success: false, error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
