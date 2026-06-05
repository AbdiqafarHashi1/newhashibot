import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TESTNET_BASE_URL = "https://demo-fapi.binance.com";
const ACTIVE_STATUSES = ["pending", "entry_submitted", "entry_filled", "sl_submitted", "tp_submitted", "partially_closed"];

type Action = "status" | "test_connection" | "validate_symbol" | "dry_run" | "execute_signal" | "positions" | "cancel_orders" | "sync_execution";
type Json = Record<string, unknown>;
type Side = "BUY" | "SELL";

interface SignalRow {
  id: string;
  symbol: string;
  market_type: string;
  timeframe: string;
  direction: "buy" | "sell";
  entry_low: number | null;
  entry_high: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  grade: string;
  strategy_name: string;
  status: string;
  data_source: string | null;
  source: string | null;
  recommended_risk_pct: number | null;
  suggested_leverage_min: number | null;
  suggested_leverage_max: number | null;
  leverage_cap: number | null;
  created_at: string;
}

interface ExecutionSettings {
  execution_mode: "signal_only" | "testnet";
  exchange: string;
  testnet_enabled: boolean;
  live_trading_enabled: boolean;
  kill_switch_enabled: boolean;
  max_open_testnet_positions: number;
  one_active_execution_per_symbol: boolean;
  testnet_enabled_at: string | null;
  fallback_account_balance: number;
}

interface SymbolRules {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
}

interface OrderPlan {
  signalId: string;
  symbol: string;
  side: "long" | "short";
  entrySide: Side;
  closeSide: Side;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  leverage: number;
  riskPct: number;
  accountBalance: number;
  quantity: number;
  tp1Quantity: number;
  tp2Quantity: number;
  notional: number;
  rules: SymbolRules;
  adjustments: string[];
}

function envBool(name: string, fallback = false): boolean {
  const value = (Deno.env.get(name) ?? "").toLowerCase();
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

function safeBaseUrl(): string {
  const base = Deno.env.get("BINANCE_TESTNET_BASE_URL") || TESTNET_BASE_URL;
  if (base !== TESTNET_BASE_URL) throw new Error("BINANCE_TESTNET_BASE_URL must be https://demo-fapi.binance.com");
  return base;
}

function assertLiveTradingImpossible(): void {
  if (envBool("LIVE_TRADING_ENABLED", false)) throw new Error("Live trading guard blocked execution: LIVE_TRADING_ENABLED must be false");
  const mode = Deno.env.get("EXECUTION_MODE") || "signal_only";
  const exchange = Deno.env.get("EXCHANGE") || "binance_usdm_testnet";
  if (mode !== "testnet") throw new Error("Execution disabled: EXECUTION_MODE is not testnet");
  if (exchange !== "binance_usdm_testnet") throw new Error("Execution disabled: EXCHANGE must be binance_usdm_testnet");
  if (!envBool("TESTNET_ENABLED", false)) throw new Error("Execution disabled: TESTNET_ENABLED is not true");
  safeBaseUrl();
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stringifyParams(params: Record<string, string | number | boolean>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

async function binanceRequest<T>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string | number | boolean> = {}, signed = false): Promise<T> {
  const apiKey = Deno.env.get("BINANCE_TESTNET_API_KEY") ?? "";
  const apiSecret = Deno.env.get("BINANCE_TESTNET_API_SECRET") ?? "";
  const baseUrl = safeBaseUrl();
  if (signed && (!apiKey || !apiSecret)) throw new Error("Binance testnet API key/secret not configured");

  const allParams: Record<string, string | number | boolean> = signed ? { ...params, timestamp: Date.now(), recvWindow: 5000 } : { ...params };
  let qs = stringifyParams(allParams);
  if (signed) qs += `&signature=${await hmacSha256Hex(apiSecret, qs)}`;
  const url = `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { method, headers: apiKey ? { "X-MBX-APIKEY": apiKey } : undefined, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({})) as T & { msg?: string; code?: number };
  if (!res.ok) throw new Error(`Binance ${path} failed (${res.status}): ${data.msg ?? res.statusText}`);
  return data as T;
}

function floorToStep(value: number, step: number, precision: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scaled = Math.floor((value / step) + 1e-12) * step;
  return Number(scaled.toFixed(Math.min(Math.max(precision, 0), 12)));
}

function roundToTick(value: number, tick: number, precision: number): number {
  const rounded = Math.round(value / tick) * tick;
  return Number(rounded.toFixed(Math.min(Math.max(precision, 0), 12)));
}

function leverageForSignal(signal: SignalRow): number {
  const grade = String(signal.grade ?? "").toUpperCase();
  const fallback = grade === "A+" ? 5 : 3;
  const rawSuggested = signal.suggested_leverage_max ?? signal.suggested_leverage_min;
  const suggestedNumber = Number(rawSuggested);
  const suggested = Number.isFinite(suggestedNumber) && suggestedNumber > 0 ? suggestedNumber : fallback;
  const rawCap = Number(signal.leverage_cap);
  const cappedBySignal = Number.isFinite(rawCap) && rawCap > 0 ? Math.min(suggested, rawCap) : suggested;
  return Math.max(1, Math.min(7, Math.floor(Number.isFinite(cappedBySignal) ? cappedBySignal : fallback)));
}

function riskPctForSignal(signal: SignalRow): number {
  const gradeRisk = String(signal.grade ?? "").toUpperCase() === "A+" ? 0.75 : 0.5;
  const recommended = Number(signal.recommended_risk_pct);
  if (Number.isFinite(recommended) && recommended > 0) return Math.min(recommended, gradeRisk);
  return gradeRisk;
}

function entryPrice(signal: SignalRow): number {
  const low = Number(signal.entry_low);
  const high = Number(signal.entry_high);
  if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0) return (low + high) / 2;
  if (Number.isFinite(low) && low > 0) return low;
  if (Number.isFinite(high) && high > 0) return high;
  return 0;
}

function buildPlan(signal: SignalRow, rules: SymbolRules, balance: number): OrderPlan {
  const entry = roundToTick(entryPrice(signal), rules.tickSize, rules.pricePrecision);
  const stopLoss = roundToTick(Number(signal.stop_loss), rules.tickSize, rules.pricePrecision);
  const tp1 = roundToTick(Number(signal.tp1), rules.tickSize, rules.pricePrecision);
  const tp2 = roundToTick(Number(signal.tp2 ?? signal.tp1), rules.tickSize, rules.pricePrecision);
  const riskPct = riskPctForSignal(signal);
  const leverage = leverageForSignal(signal);
  const stopDistance = Math.abs(entry - stopLoss);
  const rawQty = ((balance * (riskPct / 100)) / stopDistance);
  const maxLeveredQty = (balance * leverage) / entry;
  const quantity = floorToStep(Math.min(rawQty, maxLeveredQty), rules.stepSize, rules.quantityPrecision);
  const tp1Quantity = floorToStep(quantity * 0.5, rules.stepSize, rules.quantityPrecision);
  const tp2Quantity = floorToStep(quantity - tp1Quantity, rules.stepSize, rules.quantityPrecision);
  const notional = quantity * entry;
  const adjustments: string[] = [];
  if (tp1Quantity + tp2Quantity < quantity) adjustments.push("TP quantities rounded below full position size to respect step size");
  if (leverage >= 7) adjustments.push("Leverage capped at 7x");
  if (quantity < rules.minQty) throw new Error(`Calculated quantity ${quantity} below minQty ${rules.minQty}`);
  if (notional < rules.minNotional) throw new Error(`Calculated notional ${notional.toFixed(2)} below minNotional ${rules.minNotional}`);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) throw new Error("Invalid stop loss distance");
  if (tp1Quantity <= 0 || tp2Quantity <= 0) throw new Error("TP split invalid after precision rounding");
  const isBuy = signal.direction === "buy";
  return {
    signalId: signal.id,
    symbol: signal.symbol,
    side: isBuy ? "long" : "short",
    entrySide: isBuy ? "BUY" : "SELL",
    closeSide: isBuy ? "SELL" : "BUY",
    entryPrice: entry,
    stopLoss,
    tp1,
    tp2,
    leverage,
    riskPct,
    accountBalance: balance,
    quantity,
    tp1Quantity,
    tp2Quantity,
    notional,
    rules,
    adjustments,
  };
}

async function getSettings(supabase: SupabaseClient): Promise<ExecutionSettings> {
  const { data } = await supabase.from("execution_settings").select("*").eq("id", 1).maybeSingle();
  return (data ?? {
    execution_mode: "signal_only", exchange: "binance_usdm_testnet", testnet_enabled: false, live_trading_enabled: false,
    kill_switch_enabled: false, max_open_testnet_positions: 3, one_active_execution_per_symbol: true,
    testnet_enabled_at: null, fallback_account_balance: 10000,
  }) as ExecutionSettings;
}

async function requireAdminOrInternal(req: Request, supabase: SupabaseClient): Promise<void> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (token && token === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((profile as { role?: string } | null)?.role !== "admin") throw new Error("Admin access required");
}

async function logEvent(supabase: SupabaseClient, executionId: string, eventType: string, message: string, metadata: Json = {}): Promise<void> {
  await supabase.from("execution_event_logs").insert({ execution_id: executionId, event_type: eventType, message, metadata });
}

async function sendExecutionTelegram(supabase: SupabaseClient, signalId: string, eventType: string, lines: string[]): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID") ?? "";
  if (!envBool("TELEGRAM_ENABLED", false) || !botToken || !chatId) return;
  const text = ["BINANCE TESTNET — NOT LIVE", "", ...lines].join("\n");
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    await supabase.from("telegram_deliveries").insert({
      signal_id: signalId, delivery_type: `execution_${eventType}`, chat_id: chatId,
      status: res.ok && data.ok ? "sent" : "failed",
      telegram_message_id: String(data.result?.message_id ?? ""), error_message: res.ok && data.ok ? "" : (data.description ?? res.statusText),
    });
  } catch (e) {
    await supabase.from("telegram_deliveries").insert({ signal_id: signalId, delivery_type: `execution_${eventType}`, chat_id: chatId, status: "failed", error_message: e instanceof Error ? e.message : "unknown" });
  }
}

async function getRules(symbol: string): Promise<SymbolRules> {
  const data = await binanceRequest<{ symbols: Array<{ symbol: string; status: string; pricePrecision: number; quantityPrecision: number; filters: Array<{ filterType: string; tickSize?: string; stepSize?: string; minQty?: string; notional?: string; minNotional?: string }> }> }>("GET", "/fapi/v1/exchangeInfo");
  const row = data.symbols.find((s) => s.symbol === symbol && s.status === "TRADING");
  if (!row) throw new Error(`Symbol ${symbol} is not valid/trading on Binance USD-M testnet`);
  const lot = row.filters.find((f) => f.filterType === "LOT_SIZE");
  const price = row.filters.find((f) => f.filterType === "PRICE_FILTER");
  const minNotional = row.filters.find((f) => f.filterType === "MIN_NOTIONAL" || f.filterType === "NOTIONAL");
  return {
    symbol: row.symbol, pricePrecision: row.pricePrecision, quantityPrecision: row.quantityPrecision,
    tickSize: Number(price?.tickSize ?? 0.01), stepSize: Number(lot?.stepSize ?? 0.001), minQty: Number(lot?.minQty ?? 0.001),
    minNotional: Number(minNotional?.notional ?? minNotional?.minNotional ?? 5),
  };
}

async function accountBalance(settings: ExecutionSettings): Promise<number> {
  try {
    const balances = await binanceRequest<Array<{ asset: string; availableBalance?: string; balance?: string }>>("GET", "/fapi/v2/balance", {}, true);
    const usdt = balances.find((b) => b.asset === "USDT");
    const balance = Number(usdt?.availableBalance ?? usdt?.balance);
    if (Number.isFinite(balance) && balance > 0) return balance;
  } catch {
    // Fallback is intentional and recorded in the dry-run/plan accountBalance.
  }
  return Number(settings.fallback_account_balance ?? 10000);
}

async function createSkipped(supabase: SupabaseClient, signal: SignalRow, reason: string): Promise<Json> {
  const { data } = await supabase.from("execution_orders").insert({
    signal_id: signal.id, exchange: "binance_usdm_testnet", environment: "testnet", symbol: signal.symbol, direction: signal.direction,
    side: signal.direction === "buy" ? "long" : "short", entry_price: entryPrice(signal), stop_loss: signal.stop_loss, tp1: signal.tp1, tp2: signal.tp2,
    volume: 0, quantity: 0, execution_mode: "testnet", status: "skipped", error_message: reason,
  }).select("id").single();
  if (data?.id) {
    await logEvent(supabase, data.id as string, "skipped", reason);
    await sendExecutionTelegram(supabase, signal.id, "skipped", [`Execution skipped: ${reason}`, `Signal: ${signal.symbol} ${signal.direction.toUpperCase()}`]);
  }
  return { success: false, skipped: true, reason };
}

async function executeSignal(supabase: SupabaseClient, signalId: string, manual: boolean): Promise<Json> {
  assertLiveTradingImpossible();
  const settings = await getSettings(supabase);
  if (settings.live_trading_enabled) throw new Error("Live trading impossible guard blocked execution_settings.live_trading_enabled");
  if (settings.kill_switch_enabled) throw new Error("Execution kill switch is enabled");
  if (settings.execution_mode !== "testnet" || !settings.testnet_enabled) throw new Error("Database execution settings are not enabled for testnet");

  const { data: signal, error } = await supabase.from("signals").select("*").eq("id", signalId).maybeSingle();
  if (error || !signal) throw new Error("Signal not found");
  const sig = signal as SignalRow;
  const { data: existing } = await supabase.from("execution_orders").select("id,status").eq("signal_id", signalId).eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").maybeSingle();
  if (existing) return { success: false, skipped: true, reason: "duplicate_execution_for_signal", execution_id: (existing as { id: string }).id };

  if (sig.market_type !== "crypto") return createSkipped(supabase, sig, "Only crypto signals are eligible for Binance testnet execution");
  if (!manual && settings.testnet_enabled_at && new Date(sig.created_at) < new Date(settings.testnet_enabled_at)) return createSkipped(supabase, sig, "Old historical signal predates TESTNET_ENABLED activation");
  if (!manual && sig.source !== "scanner") return createSkipped(supabase, sig, "Automatic execution only accepts scanner signals");

  const { count: openCount } = await supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
  if ((openCount ?? 0) >= settings.max_open_testnet_positions) return createSkipped(supabase, sig, "Max open testnet positions reached");
  if (settings.one_active_execution_per_symbol) {
    const { count: symbolOpen } = await supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("symbol", sig.symbol).eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
    if ((symbolOpen ?? 0) > 0) return createSkipped(supabase, sig, "Active testnet execution already exists for symbol");
  }

  let plan: OrderPlan;
  try { plan = buildPlan(sig, await getRules(sig.symbol), await accountBalance(settings)); }
  catch (e) { return createSkipped(supabase, sig, e instanceof Error ? e.message : "Invalid order plan"); }

  const { data: exec } = await supabase.from("execution_orders").insert({
    signal_id: sig.id, exchange: "binance_usdm_testnet", environment: "testnet", symbol: sig.symbol, direction: sig.direction, side: plan.side,
    leverage: plan.leverage, quantity: plan.quantity, volume: plan.quantity, entry_price: plan.entryPrice, stop_loss: plan.stopLoss, tp1: plan.tp1, tp2: plan.tp2,
    execution_mode: "testnet", status: "pending", testnet_enabled_at: settings.testnet_enabled_at,
  }).select("id").single();
  const executionId = String((exec as { id: string }).id);
  await logEvent(supabase, executionId, "planned", "Order plan created", { plan });

  try {
    await binanceRequest("POST", "/fapi/v1/leverage", { symbol: plan.symbol, leverage: plan.leverage }, true);
    await binanceRequest("POST", "/fapi/v1/marginType", { symbol: plan.symbol, marginType: "ISOLATED" }, true).catch((e) => {
      if (!String(e instanceof Error ? e.message : e).includes("No need to change margin type")) throw e;
    });
    const entry = await binanceRequest<{ orderId: number }>("POST", "/fapi/v1/order", { symbol: plan.symbol, side: plan.entrySide, type: "LIMIT", timeInForce: "GTC", quantity: plan.quantity, price: plan.entryPrice }, true);
    await supabase.from("execution_orders").update({ status: "entry_submitted", entry_order_id: String(entry.orderId), raw_exchange_response: { entry }, updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "entry_submitted", "Entry order placed", { orderId: entry.orderId });
    await sendExecutionTelegram(supabase, sig.id, "entry_submitted", [`Entry order placed: ${plan.symbol} ${plan.entrySide}`, `Qty: ${plan.quantity}`, `Entry: ${plan.entryPrice}`, `Leverage: ${plan.leverage}x`]);
    return { success: true, execution_id: executionId, status: "entry_submitted", plan };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Execution failed";
    await supabase.from("execution_orders").update({ status: "failed", error_message: msg, last_exchange_error: msg, updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "failed", msg);
    await sendExecutionTelegram(supabase, sig.id, "failed", [`Execution failed: ${msg}`, `Signal: ${sig.symbol}`]);
    return { success: false, execution_id: executionId, error: msg };
  }
}

async function syncExecution(supabase: SupabaseClient, executionId: string): Promise<Json> {
  assertLiveTradingImpossible();
  const { data } = await supabase.from("execution_orders").select("*").eq("id", executionId).maybeSingle();
  if (!data) throw new Error("Execution not found");
  const ex = data as { id: string; signal_id: string; symbol: string; direction: string; side: string; quantity: number; leverage: number; entry_price: number; stop_loss: number; tp1: number; tp2: number; entry_order_id?: string; sl_order_id?: string; tp1_order_id?: string; tp2_order_id?: string; status: string };
  const signalId = ex.signal_id;
  const rules = await getRules(ex.symbol);
  const closeSide: Side = ex.direction === "buy" ? "SELL" : "BUY";
  if (ex.entry_order_id && ["entry_submitted", "pending"].includes(ex.status)) {
    const entryStatus = await binanceRequest<{ status: string; executedQty?: string }>("GET", "/fapi/v1/order", { symbol: ex.symbol, orderId: ex.entry_order_id }, true);
    if (entryStatus.status === "FILLED") {
      const qty = floorToStep(Number(entryStatus.executedQty ?? ex.quantity), rules.stepSize, rules.quantityPrecision);
      const tp1Qty = floorToStep(qty * 0.5, rules.stepSize, rules.quantityPrecision);
      const tp2Qty = floorToStep(qty - tp1Qty, rules.stepSize, rules.quantityPrecision);
      const sl = await binanceRequest<{ orderId: number }>("POST", "/fapi/v1/order", { symbol: ex.symbol, side: closeSide, type: "STOP_MARKET", stopPrice: ex.stop_loss, quantity: qty, reduceOnly: true, workingType: "MARK_PRICE" }, true);
      const tp1 = await binanceRequest<{ orderId: number }>("POST", "/fapi/v1/order", { symbol: ex.symbol, side: closeSide, type: "TAKE_PROFIT_MARKET", stopPrice: ex.tp1, quantity: tp1Qty, reduceOnly: true, workingType: "MARK_PRICE" }, true);
      const tp2 = await binanceRequest<{ orderId: number }>("POST", "/fapi/v1/order", { symbol: ex.symbol, side: closeSide, type: "TAKE_PROFIT_MARKET", stopPrice: ex.tp2, quantity: tp2Qty, reduceOnly: true, workingType: "MARK_PRICE" }, true);
      await supabase.from("execution_orders").update({ status: "tp_submitted", quantity: qty, volume: qty, sl_order_id: String(sl.orderId), tp1_order_id: String(tp1.orderId), tp2_order_id: String(tp2.orderId), updated_at: new Date().toISOString() }).eq("id", executionId);
      await logEvent(supabase, executionId, "entry_filled", "Entry filled; SL/TP reduce-only orders submitted", { sl, tp1, tp2, qty, tp1Qty, tp2Qty });
      await sendExecutionTelegram(supabase, signalId, "entry_filled", [`Entry filled: ${ex.symbol}`, `SL placed: ${ex.stop_loss}`, `TP1 placed: ${ex.tp1}`, `TP2 placed: ${ex.tp2}`]);
      return { success: true, status: "tp_submitted", sl_order_id: sl.orderId, tp1_order_id: tp1.orderId, tp2_order_id: tp2.orderId };
    }
    return { success: true, status: ex.status, entry_order_status: entryStatus.status };
  }

  const orderChecks = await Promise.all([
    ex.tp1_order_id ? binanceRequest<{ status: string }>("GET", "/fapi/v1/order", { symbol: ex.symbol, orderId: ex.tp1_order_id }, true).catch(() => null) : null,
    ex.tp2_order_id ? binanceRequest<{ status: string }>("GET", "/fapi/v1/order", { symbol: ex.symbol, orderId: ex.tp2_order_id }, true).catch(() => null) : null,
    ex.sl_order_id ? binanceRequest<{ status: string }>("GET", "/fapi/v1/order", { symbol: ex.symbol, orderId: ex.sl_order_id }, true).catch(() => null) : null,
  ]);
  const [tp1, tp2, sl] = orderChecks;
  if (sl?.status === "FILLED") {
    await binanceRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol: ex.symbol }, true).catch(() => ({}));
    await supabase.from("execution_orders").update({ status: "closed_sl", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "closed_sl", "Stop loss filled; remaining reduce-only orders cancelled");
    await sendExecutionTelegram(supabase, signalId, "closed_sl", [`SL hit: ${ex.symbol}`, "Remaining testnet orders cancelled if open."]);
    return { success: true, status: "closed_sl" };
  }
  if (tp2?.status === "FILLED") {
    await binanceRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol: ex.symbol }, true).catch(() => ({}));
    await supabase.from("execution_orders").update({ status: "closed_tp", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "closed_tp", "TP2 filled; position closed and remaining SL cancelled");
    await sendExecutionTelegram(supabase, signalId, "closed_tp", [`TP2 hit: ${ex.symbol}`, "Position closed on Binance testnet."]);
    return { success: true, status: "closed_tp" };
  }
  if (tp1?.status === "FILLED" && ex.status !== "partially_closed") {
    await supabase.from("execution_orders").update({ status: "partially_closed", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "partially_closed", "TP1 filled; position partially closed");
    await sendExecutionTelegram(supabase, signalId, "partially_closed", [`TP1 hit: ${ex.symbol}`, "Position partially closed on Binance testnet."]);
    return { success: true, status: "partially_closed" };
  }
  return { success: true, status: ex.status, order_statuses: { tp1: tp1?.status, tp2: tp2?.status, sl: sl?.status } };
}

async function statusPayload(supabase: SupabaseClient): Promise<Json> {
  const settings = await getSettings(supabase);
  const [executions, failed, skipped, latestError] = await Promise.all([
    supabase.from("execution_orders").select("*").eq("exchange", "binance_usdm_testnet").order("created_at", { ascending: false }).limit(25),
    supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("status", "skipped"),
    supabase.from("execution_orders").select("last_exchange_error,error_message").eq("exchange", "binance_usdm_testnet").not("error_message", "eq", "").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { success: true, settings, env: { execution_mode: Deno.env.get("EXECUTION_MODE") || "signal_only", exchange: Deno.env.get("EXCHANGE") || "binance_usdm_testnet", testnet_enabled: envBool("TESTNET_ENABLED", false), live_trading_enabled: envBool("LIVE_TRADING_ENABLED", false), base_url: safeBaseUrl(), api_key_configured: Boolean(Deno.env.get("BINANCE_TESTNET_API_KEY")), api_secret_configured: Boolean(Deno.env.get("BINANCE_TESTNET_API_SECRET")) }, executions: executions.data ?? [], failed_count: failed.count ?? 0, skipped_count: skipped.count ?? 0, latest_error: latestError.data ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    await requireAdminOrInternal(req, supabase);
    const body = await req.json().catch(() => ({})) as { action?: Action; signal_id?: string; symbol?: string; execution_id?: string; manual?: boolean };
    const action = body.action ?? "status";
    let payload: Json;
    if (action === "status") payload = await statusPayload(supabase);
    else if (action === "test_connection") { assertLiveTradingImpossible(); payload = { success: true, account: await binanceRequest("GET", "/fapi/v2/account", {}, true), base_url: safeBaseUrl() }; }
    else if (action === "validate_symbol") payload = { success: true, rules: await getRules(body.symbol ?? "BTCUSDT") };
    else if (action === "positions") { assertLiveTradingImpossible(); payload = { success: true, positions: await binanceRequest("GET", "/fapi/v2/positionRisk", {}, true) }; }
    else if (action === "cancel_orders") { assertLiveTradingImpossible(); payload = { success: true, result: await binanceRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol: body.symbol ?? "BTCUSDT" }, true) }; }
    else if (action === "dry_run") {
      const { data: signal } = await supabase.from("signals").select("*").eq("id", body.signal_id ?? "").maybeSingle();
      if (!signal) throw new Error("Signal not found");
      const settings = await getSettings(supabase);
      payload = { success: true, plan: buildPlan(signal as SignalRow, await getRules((signal as SignalRow).symbol), await accountBalance(settings)) };
    }
    else if (action === "execute_signal") payload = await executeSignal(supabase, body.signal_id ?? "", Boolean(body.manual));
    else if (action === "sync_execution") payload = await syncExecution(supabase, body.execution_id ?? "");
    else payload = { success: false, error: "Unsupported action" };
    return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), { status: e instanceof Error && e.message.includes("Unauthorized") ? 401 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
