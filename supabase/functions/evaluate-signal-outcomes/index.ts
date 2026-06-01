import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret",
};

const TERMINAL = new Set(["tp2_hit", "sl_hit", "expired", "cancelled"]);
const EVALUATED_STATUSES = ["waiting", "active", "new", "approved", "tp1_hit"];
const EXPIRY_MINS = 360;

type SupabaseClient = ReturnType<typeof createClient>;

type SignalRow = Record<string, unknown> & {
  id: string;
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
  if (status === "sl_hit") return -1;
  const entry = entryMidpoint(sig);
  const stop = numberField(sig, "stop_loss", "sl");
  const risk = entry !== null && stop !== null ? Math.abs(entry - stop) : 0;
  if (!Number.isFinite(risk) || risk <= 0 || entry === null) return null;
  if (status === "tp1_hit") {
    const tp1 = numberField(sig, "tp1");
    return tp1 !== null ? Math.abs(tp1 - entry) / risk : null;
  }
  if (status === "tp2_hit") {
    const tp2 = numberField(sig, "tp2");
    return tp2 !== null ? Math.abs(tp2 - entry) / risk : numberField(sig, "risk_reward");
  }
  if (status === "expired") return 0;
  return null;
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

const TWELVEDATA_SYMBOL_MAP: Record<string, string> = {
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
};

function normalizeForexSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

async function twelveDataForexPrice(symbol: string): Promise<number | null> {
  const key = Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY") ?? "";
  if (!key) return null;
  const normalized = normalizeForexSymbol(symbol);
  const mapped = TWELVEDATA_SYMBOL_MAP[normalized];
  if (!mapped) return null;
  try {
    const res = await fetch(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(mapped)}&apikey=${key}&format=JSON`, {
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const j = await res.json() as { price?: string; status?: string; code?: number };
    if (j.status === "error" || j.code) return null;
    const price = Number(j.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function twelveDataForexCandles(symbol: string, timeframe: string, sinceIso: string): Promise<{ candles: OutcomeCandle[] | null; source: string; reason?: string }> {
  const key = Deno.env.get("TWELVEDATA_API_KEY") ?? Deno.env.get("FOREX_DATA_API_KEY") ?? "";
  if (!key) return { candles: null, source: "twelvedata_forex_candles", reason: "provider_data_unavailable" };

  const normalized = normalizeForexSymbol(symbol);
  const mapped = TWELVEDATA_SYMBOL_MAP[normalized];
  if (!mapped) return { candles: null, source: "twelvedata_forex_candles", reason: "unsupported_symbol" };

  const interval = toTwelveDataInterval(timeframe);
  if (!interval) return { candles: null, source: "twelvedata_forex_candles", reason: "unsupported_timeframe" };

  try {
    const res = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(mapped)}&interval=${interval}&outputsize=120&apikey=${key}&format=JSON`, {
      signal: AbortSignal.timeout(9000),
    });
    const text = await res.text();
    if (!res.ok) return { candles: null, source: "twelvedata_forex_candles", reason: res.status === 429 ? "provider_rate_limited" : "provider_data_unavailable" };

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { candles: null, source: "twelvedata_forex_candles", reason: "provider_invalid_response" };
    }

    if (data.status === "error" || data.code) {
      return { candles: null, source: "twelvedata_forex_candles", reason: classifyProviderFailure(String(data.message ?? data.code ?? "provider error")) };
    }

    const values = data.values as Array<Record<string, string>>;
    if (!Array.isArray(values) || values.length === 0) return { candles: null, source: "twelvedata_forex_candles", reason: "provider_data_unavailable" };

    const sinceMs = new Date(sinceIso).getTime();
    const candles = values
      .map((v) => ({
        open_time: parseTwelveDataDate(v.datetime),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
      }))
      .filter((c) => Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && c.high >= c.low)
      .sort((a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime())
      .filter((c) => !Number.isFinite(sinceMs) || new Date(c.open_time).getTime() >= sinceMs - 60_000);

    if (candles.length === 0) return { candles: null, source: "twelvedata_forex_candles", reason: "insufficient_candles" };
    return { candles, source: "twelvedata_forex_candles" };
  } catch (e) {
    return { candles: null, source: "twelvedata_forex_candles", reason: classifyProviderFailure(e instanceof Error ? e.message : "provider error") };
  }
}

async function latestPrice(sig: SignalRow): Promise<{ price: number | null; source: string; reason?: string }> {
  const marketType = String(sig.market_type ?? "").toLowerCase();
  if (marketType === "crypto") return { price: await binancePrice(sig.symbol), source: "binance_latest_price" };
  if (marketType === "forex") {
    if (!parseBooleanEnv("SIGNAL_ENABLE_FOREX", false)) return { price: null, source: "twelvedata_forex_price", reason: "forex_disabled" };
    return { price: await twelveDataForexPrice(sig.symbol), source: "twelvedata_forex_price" };
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

function expiryStatus(sig: SignalRow): { expired: boolean; reason: string } {
  const now = Date.now();
  const expiresAt = sig.expires_at ? new Date(String(sig.expires_at)).getTime() : NaN;
  if (Number.isFinite(expiresAt) && now > expiresAt) return { expired: true, reason: "expires_at_passed" };

  const createdAt = sig.created_at ? new Date(sig.created_at).getTime() : NaN;
  if (Number.isFinite(createdAt) && (now - createdAt) / 60000 > EXPIRY_MINS) {
    return { expired: true, reason: "max_age_expired" };
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

  if (marketType === "forex") {
    const rResult = rMultipleForStatus(sig, newStatus);
    return [
      "📣 HashiBot Forex Signal Update",
      "",
      `Pair: ${sig.symbol}`,
      "Market: FOREX",
      `Event: ${eventLabel(newStatus)}`,
      `Direction: ${String(sig.direction ?? "unknown").toUpperCase()}`,
      `Entry: ${formatPriceForMarket(sig, entry)}`,
      `Stop Loss: ${formatPriceForMarket(sig, stopLoss)} (${formatPips(pipDistance(sig, entry, stopLoss))})`,
      `TP1: ${formatPriceForMarket(sig, tp1)} (${formatPips(pipDistance(sig, entry, tp1))})`,
      ...(tp2 !== null ? [`TP2: ${formatPriceForMarket(sig, tp2)} (${formatPips(pipDistance(sig, entry, tp2))})`] : []),
      `Outcome Price: ${formatPriceForMarket(sig, price)}`,
      `Result: ${rResult === null ? "—" : `${rResult >= 0 ? "+" : ""}${rResult.toFixed(2)}R`}`,
      `Original Signal Time: ${sig.created_at ? new Date(sig.created_at).toISOString() : "—"}`,
      `Update Time: ${new Date().toISOString()}`,
      "",
      "Signal only. Manage lot size, spread, slippage, and risk. Not financial advice.",
    ].join("\n");
  }

  return [
    "📣 HashiBot Signal Update",
    "",
    `Symbol: ${sig.symbol}`,
    `Market: ${String(sig.market_type ?? "unknown").toUpperCase()}`,
    `Event: ${eventLabel(newStatus)}`,
    `Direction: ${String(sig.direction ?? "unknown").toUpperCase()}`,
    `Entry: ${formatPriceForMarket(sig, entry)}`,
    `Stop Loss: ${formatPriceForMarket(sig, stopLoss)}`,
    `TP1: ${formatPriceForMarket(sig, tp1)}`,
    ...(tp2 !== null ? [`TP2: ${formatPriceForMarket(sig, tp2)}`] : []),
    `Current Price: ${formatPriceForMarket(sig, price)}`,
    `Original Signal Time: ${sig.created_at ? new Date(sig.created_at).toISOString() : "—"}`,
    `Update Time: ${new Date().toISOString()}`,
    "",
    "Disclaimer: Signal Mode only. Not financial advice.",
  ].join("\n");
}

async function insertTelegramDelivery(
  supabase: SupabaseClient,
  signalId: string,
  type: string,
  chatId: string,
  status: "sent" | "failed" | "skipped",
  errorMessage = "",
  messageId = "",
): Promise<string | undefined> {
  const { data } = await supabase.from("telegram_deliveries").insert({
    signal_id: signalId,
    delivery_type: type,
    chat_id: chatId,
    status,
    telegram_message_id: messageId,
    error_message: errorMessage,
  }).select("id").maybeSingle();
  return data?.id as string | undefined;
}

async function sendOutcomeNotification(
  supabase: SupabaseClient,
  sig: SignalRow,
  newStatus: string,
  price: number | null,
): Promise<TelegramResult> {
  const type = deliveryType(newStatus);
  const chatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID") ?? "";

  const skip = async (reason: string): Promise<TelegramResult> => {
    const deliveryId = chatId ? await insertTelegramDelivery(supabase, sig.id, type, chatId, "skipped", reason) : undefined;
    return { sent: false, skipped: true, failed: false, reason, delivery_id: deliveryId };
  };

  if (!parseBooleanEnv("TELEGRAM_ENABLED", false)) return skip("telegram_disabled_env");
  if (!parseBooleanEnv("ENABLE_SIGNAL_MODE_OUTPUT", false)) return skip("signal_mode_output_disabled");
  const marketType = String(sig.market_type ?? "").toLowerCase();
  if (marketType === "forex" && !parseBooleanEnv("SIGNAL_ENABLE_FOREX", false)) return skip("forex_disabled");
  if (!["crypto", "forex"].includes(marketType)) return skip("unsupported_market_type");
  if (String(sig.data_source ?? "").toUpperCase() !== "REAL DATA") return skip("not_real_data");

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!botToken) return skip("TELEGRAM_BOT_TOKEN missing");
  if (!chatId) return { sent: false, skipped: true, failed: false, reason: "TELEGRAM_DEFAULT_CHANNEL_ID missing" };

  const { data: existing } = await supabase
    .from("telegram_deliveries")
    .select("id")
    .eq("signal_id", sig.id)
    .eq("chat_id", chatId)
    .eq("delivery_type", type)
    .eq("status", "sent")
    .maybeSingle();
  if (existing?.id) return { sent: false, skipped: true, failed: false, reason: "already_sent_outcome", delivery_id: existing.id as string };

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatOutcomeMessage(sig, newStatus, price), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    const tgData = await res.json() as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (res.ok && tgData.ok) {
      const deliveryId = await insertTelegramDelivery(supabase, sig.id, type, chatId, "sent", "", String(tgData.result?.message_id ?? ""));
      return { sent: true, skipped: false, failed: false, delivery_id: deliveryId };
    }
    const reason = `telegram_api_error:${tgData.description ?? res.statusText}`;
    const deliveryId = await insertTelegramDelivery(supabase, sig.id, type, chatId, "failed", reason);
    return { sent: false, skipped: false, failed: true, reason, delivery_id: deliveryId };
  } catch (e) {
    const reason = `telegram_send_exception:${e instanceof Error ? e.message : "unknown"}`;
    const deliveryId = await insertTelegramDelivery(supabase, sig.id, type, chatId, "failed", reason);
    return { sent: false, skipped: false, failed: true, reason, delivery_id: deliveryId };
  }
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
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("SCANNER_CRON_SECRET") ?? "";
    const suppliedSecret = req.headers.get("x-scanner-cron-secret") ?? "";
    const isServiceInvocation = Boolean(serviceRole) && token === serviceRole;
    const isCronSecretInvocation = Boolean(cronSecret) && suppliedSecret === cronSecret;

    if (!isServiceInvocation && !isCronSecretInvocation) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const signalEnableCrypto = parseBooleanEnv("SIGNAL_ENABLE_CRYPTO", true);
    const signalEnableForex = parseBooleanEnv("SIGNAL_ENABLE_FOREX", false);
    const marketMode = signalEnableCrypto && !signalEnableForex ? "crypto_only" : signalEnableForex ? "mixed" : "disabled";

    const { data: signals, error: signalError } = await supabase
      .from("signals")
      .select("*")
      .in("status", EVALUATED_STATUSES)
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
      updates: [] as Array<{ signal_id: string; symbol: string; from: string; to: string; price: number | null; reason: string; telegram_status?: string; telegram_reason?: string }>,
      telegram_sent: 0,
      telegram_skipped: 0,
      telegram_failed: 0,
      telegram_skip_reasons: [] as string[],
      forex_skipped: !signalEnableForex,
      forex_skipped_count: 0,
      price_unavailable: 0,
      expired: 0,
      skipped: 0,
      skipped_reasons: [] as string[],
      price_source: signalEnableForex ? "binance_latest_price+twelvedata_forex_candles" : "binance_latest_price",
      price_source_limitation: "Crypto uses latest ticker price. Forex uses TwelveData candles and conservative same-candle handling: if TP and SL are both touched in one candle, SL wins.",
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
        const candleResult = await twelveDataForexCandles(sig.symbol, String(sig.timeframe ?? "15m"), sinceForOutcome);
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
        const priceResult = await latestPrice(sig);
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
      if (existing) continue;

      const telegramResult = ["tp1_hit", "tp2_hit", "sl_hit", "expired"].includes(next)
        ? await sendOutcomeNotification(supabase, sig, next, price)
        : { sent: false, skipped: false, failed: false } as TelegramResult;

      if (telegramResult.sent) out.telegram_sent++;
      if (telegramResult.skipped) {
        out.telegram_skipped++;
        if (telegramResult.reason) out.telegram_skip_reasons.push(telegramResult.reason);
      }
      if (telegramResult.failed) {
        out.telegram_failed++;
        if (telegramResult.reason) out.telegram_skip_reasons.push(telegramResult.reason);
      }

      await supabase.from("signals").update({ status: next, updated_at: new Date().toISOString() }).eq("id", sig.id);
      await supabase.from("signal_updates").insert({
        signal_id: sig.id,
        update_type: "outcome_status_change",
        previous_status: currentStatus,
        old_status: currentStatus,
        new_status: next,
        message: `${eventLabel(next)} via ${reason} (source: ${source})`,
        price,
        reason,
        telegram_sent: telegramResult.sent,
        created_at: new Date().toISOString(),
      });

      out.signals_updated++;
      out.updates.push({
        signal_id: sig.id,
        symbol: sig.symbol,
        from: currentStatus,
        to: next,
        price,
        reason,
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
