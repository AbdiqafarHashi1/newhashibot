import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TESTNET_BASE_URL = "https://demo-fapi.binance.com";
const ACTIVE_STATUSES = ["pending", "entry_submitted", "entry_filled", "protected", "partially_closed", "pending_protection", "protected_managed", "pending_managed_protection"];
const RETRYABLE_STATUSES = ["skipped", "failed", "cancelled", "stale_closed", "closed_tp", "closed_sl", "closed_breakeven", "closed_timeout"];
const TERMINAL_STATUSES = ["closed_tp", "closed_sl", "closed_breakeven", "closed_timeout", "cancelled", "failed", "skipped", "stale_closed"];

type Action = "status" | "test_connection" | "validate_symbol" | "dry_run" | "execute_signal" | "positions" | "cancel_orders" | "close_position" | "sync_execution" | "update_settings" | "refresh_account_state" | "evaluate_governor" | "reset_testnet_governor" | "clean_stale_execution_rows" | "manual_test_flow";
type Json = Record<string, unknown>;
type Side = "BUY" | "SELL";
type CapitalBasis = "available_usdt" | "available_usdc_plus_usdt" | "total_margin_balance" | "total_wallet_balance" | "manual_override";
type BracketMode = "exchange_native" | "managed_exit_fallback" | "failed";
type ProtectionStatus = "protected" | "pending_protection" | "protected_managed" | "pending_managed_protection" | "unprotected_failed";
type GovernorState = "normal" | "defensive" | "aggressive_allowed" | "paused";

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
  auto_execute_testnet: boolean;
  max_open_testnet_positions: number;
  max_open_testnet_positions_allowed_max: number;
  max_total_open_risk_pct: number;
  one_active_execution_per_symbol: boolean;
  testnet_enabled_at: string | null;
  fallback_account_balance: number;
  capital_basis: CapitalBasis;
  testnet_capital_override_usdt: number | null;
  max_capital_used_usdt: number | null;
  testnet_risk_a: number;
  testnet_risk_a_plus: number;
  max_testnet_risk_pct: number;
  testnet_leverage_a: number;
  testnet_leverage_a_plus: number;
  testnet_max_leverage: number;
  governor_enabled: boolean;
  governor_state: GovernorState;
  daily_start_equity: number | null;
  current_equity: number | null;
  daily_realized_pnl: number | null;
  daily_unrealized_pnl: number | null;
  daily_pnl_pct: number | null;
  max_daily_loss_pct: number;
  max_unrealized_drawdown_pct: number;
  aggressive_allowed_profit_pct: number;
  defensive_loss_pct: number;
  max_consecutive_failed_executions: number;
  max_consecutive_closed_sl: number;
  last_governor_reason: string | null;
  last_governor_checked_at: string | null;
  failed_execution_streak: number;
  closed_sl_streak: number;
}

interface AccountState {
  totalMarginBalance: number;
  totalWalletBalance: number;
  availableBalance: number;
  availableUsdt: number;
  availableUsdc: number;
  unrealizedPnl: number;
  openPositions: number;
  positions: Array<{ symbol: string; positionAmt: number; notional: number; unrealizedPnl: number; markPrice: number }>;
  marginRatio: number | null;
  openOrderCount: number;
  rawAccount: Json;
}

interface GovernorDecision {
  state: GovernorState;
  reason: string;
  risk_multiplier: number;
  adjusted_max_leverage: number;
  adjusted_max_open_positions: number;
  daily_pnl_pct: number | null;
  unrealized_pnl: number | null;
  current_equity: number | null;
  blocks_execution: boolean;
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

interface CapitalSnapshot {
  capital_basis: CapitalBasis;
  raw_total_margin_balance: number;
  raw_total_wallet_balance: number;
  raw_available_usdt: number;
  raw_available_usdc: number;
  selected_capital_used: number;
  max_capital_cap_applied: boolean;
  fallback_used: boolean;
}

interface LeverageSelection {
  leverage: number;
  leverage_source: "signal_guidance" | "grade_default" | "admin_setting" | "capped_to_max";
  requested: number;
  max: number;
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
  leverage_source: string;
  riskPct: number;
  riskAmount: number;
  stopDistance: number;
  stopDistancePct: number;
  capital: CapitalSnapshot;
  quantity: number;
  tp1Quantity: number;
  tp2Quantity: number;
  notional: number;
  marginRequired: number;
  rules: SymbolRules;
  adjustments: string[];
  governor_state: GovernorState;
  governor_reason: string;
  risk_multiplier: number;
  adjusted_risk_pct: number;
  adjusted_max_leverage: number;
  total_open_risk_after_trade?: number;
}

interface BinanceSymbolTruth {
  symbol: string;
  positionAmt: number;
  openOrders: Json[];
  hasExposure: boolean;
  positionRisk: Json | null;
}

function truthHasExposure(truth: BinanceSymbolTruth): boolean {
  return Math.abs(truth.positionAmt) > 0 || truth.openOrders.length > 0;
}

async function fetchBinanceSymbolTruth(symbol: string): Promise<BinanceSymbolTruth> {
  const [positionBody, ordersBody] = await Promise.all([
    binanceRequest<Array<Json & { symbol?: string; positionAmt?: string }>>("GET", "/fapi/v2/positionRisk", { symbol }, true),
    binanceRequest<Array<Json>>("GET", "/fapi/v1/openOrders", { symbol }, true),
  ]);
  const positionRisk = (Array.isArray(positionBody) ? positionBody : []).find((row) => row.symbol === symbol) ?? null;
  const openOrders = Array.isArray(ordersBody) ? ordersBody : [];
  const positionAmt = Number(positionRisk?.positionAmt ?? 0);
  const truth = { symbol, positionAmt: Number.isFinite(positionAmt) ? positionAmt : 0, openOrders, hasExposure: false, positionRisk: positionRisk as Json | null };
  truth.hasExposure = truthHasExposure(truth);
  return truth;
}

async function markSymbolRowsStale(supabase: SupabaseClient, symbol: string, reason: string, signalId?: string): Promise<number> {
  const { data, error } = await supabase.rpc("mark_stale_testnet_execution_orders", {
    p_symbol: symbol,
    p_active_statuses: ACTIVE_STATUSES,
    p_stale_status: "stale_closed",
    p_reason: signalId ? `${reason}:${signalId}` : reason,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

async function cleanStaleRowsForSymbols(supabase: SupabaseClient, symbols?: string[]): Promise<Json> {
  assertLiveTradingImpossible();
  const query = supabase.from("execution_orders").select("id,symbol,status").eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
  const { data, error } = symbols && symbols.length > 0 ? await query.in("symbol", symbols) : await query;
  if (error) throw error;
  const activeRows = (data ?? []) as Array<{ id: string; symbol: string; status: string }>;
  const uniqueSymbols = Array.from(new Set(activeRows.map((row) => row.symbol).filter(Boolean)));
  const cleaned_symbols: string[] = [];
  const details: Json[] = [];
  let cleaned_count = 0;
  for (const symbol of uniqueSymbols) {
    const truth = await fetchBinanceSymbolTruth(symbol);
    if (truth.hasExposure) {
      details.push({ symbol, cleaned: 0, blocked_by_binance_truth: true, positionAmt: truth.positionAmt, openOrders: truth.openOrders.length });
      continue;
    }
    const cleaned = await markSymbolRowsStale(supabase, symbol, "manual_clean_stale_execution_rows_binance_empty");
    cleaned_count += cleaned;
    if (cleaned > 0) cleaned_symbols.push(symbol);
    details.push({ symbol, cleaned, blocked_by_binance_truth: false, positionAmt: truth.positionAmt, openOrders: truth.openOrders.length });
  }
  return { success: true, symbols_checked: uniqueSymbols.length, cleaned_count, cleaned_symbols, details };
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
  return Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
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
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rounded = Math.round(value / tick) * tick;
  return Number(rounded.toFixed(Math.min(Math.max(precision, 0), 12)));
}

function entryPrice(signal: SignalRow): number {
  const low = Number(signal.entry_low);
  const high = Number(signal.entry_high);
  if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0) return (low + high) / 2;
  if (Number.isFinite(low) && low > 0) return low;
  if (Number.isFinite(high) && high > 0) return high;
  return 0;
}

function riskPctForSignal(signal: SignalRow, settings: ExecutionSettings, governor?: GovernorDecision): number {
  const grade = String(signal.grade ?? "").toUpperCase();
  const governorState = governor?.state ?? "normal";
  const gradeRisk = governorState === "aggressive_allowed"
    ? (grade === "A+" ? 1.0 : 0.75)
    : (grade === "A+" ? Number(settings.testnet_risk_a_plus ?? 0.75) : Number(settings.testnet_risk_a ?? 0.5));
  const recommended = Number(signal.recommended_risk_pct);
  const selected = Number.isFinite(recommended) && recommended > 0 ? Math.min(recommended, gradeRisk) : gradeRisk;
  const multiplied = selected * Number(governor?.risk_multiplier ?? 1);
  return Math.min(multiplied, Number(settings.max_testnet_risk_pct ?? 1), 1);
}

function leverageForSignal(signal: SignalRow, settings: ExecutionSettings, governor?: GovernorDecision): LeverageSelection {
  const grade = String(signal.grade ?? "").toUpperCase();
  const gradeDefault = grade === "A+" ? Number(settings.testnet_leverage_a_plus ?? 5) : Number(settings.testnet_leverage_a ?? 3);
  const governorMax = Number(governor?.adjusted_max_leverage ?? settings.testnet_max_leverage ?? 7);
  const hardMax = Math.min(Number(settings.testnet_max_leverage ?? 7), governorMax, 7);
  const guidance = Number(signal.suggested_leverage_max ?? signal.suggested_leverage_min);
  let requested = gradeDefault;
  let source: LeverageSelection["leverage_source"] = "grade_default";
  if (Number.isFinite(guidance) && guidance >= 1 && guidance <= hardMax) {
    requested = guidance;
    source = "signal_guidance";
  } else if (Number.isFinite(gradeDefault)) {
    source = "admin_setting";
  }
  const signalCap = Number(signal.leverage_cap);
  const effectiveMax = Number.isFinite(signalCap) && signalCap > 0 ? Math.min(hardMax, signalCap) : hardMax;
  const leverage = Math.max(1, Math.min(effectiveMax, Math.floor(requested)));
  return { leverage, leverage_source: leverage < requested ? "capped_to_max" : source, requested, max: effectiveMax };
}

function zeroCapital(settings: ExecutionSettings): CapitalSnapshot {
  return { capital_basis: settings.capital_basis ?? "available_usdt", raw_total_margin_balance: 0, raw_total_wallet_balance: 0, raw_available_usdt: 0, raw_available_usdc: 0, selected_capital_used: 0, max_capital_cap_applied: false, fallback_used: false };
}

async function fetchAccountState(): Promise<AccountState> {
  const [account, balances, positions, openOrders] = await Promise.all([
    binanceRequest<{ totalMarginBalance?: string; totalWalletBalance?: string; availableBalance?: string; totalUnrealizedProfit?: string; totalMaintMargin?: string; assets?: Array<{ asset: string; availableBalance?: string; walletBalance?: string; marginBalance?: string }> }>("GET", "/fapi/v2/account", {}, true),
    binanceRequest<Array<{ asset: string; availableBalance?: string; balance?: string }>>("GET", "/fapi/v2/balance", {}, true).catch(() => []),
    binanceRequest<Array<{ symbol: string; positionAmt: string; notional?: string; unrealizedProfit?: string; markPrice?: string }>>("GET", "/fapi/v2/positionRisk", {}, true).catch(() => []),
    binanceRequest<Array<Json>>("GET", "/fapi/v1/openOrders", {}, true).catch(() => []),
  ]);
  const accountAssets = account.assets ?? [];
  const findAsset = (asset: string) => ({ ...(balances as Array<Json>).find((b) => b.asset === asset), ...accountAssets.find((b) => b.asset === asset) });
  const usdt = findAsset("USDT") as { availableBalance?: string; balance?: string };
  const usdc = findAsset("USDC") as { availableBalance?: string; balance?: string };
  const openPositions = positions
    .map((p) => ({ symbol: p.symbol, positionAmt: Number(p.positionAmt), notional: Number(p.notional ?? 0), unrealizedPnl: Number(p.unrealizedProfit ?? 0), markPrice: Number(p.markPrice ?? 0) }))
    .filter((p) => Math.abs(p.positionAmt) > 0);
  const totalMarginBalance = Number(account.totalMarginBalance ?? 0);
  const totalMaintMargin = Number(account.totalMaintMargin ?? 0);
  return {
    totalMarginBalance,
    totalWalletBalance: Number(account.totalWalletBalance ?? 0),
    availableBalance: Number(account.availableBalance ?? 0),
    availableUsdt: Number(usdt.availableBalance ?? usdt.balance ?? 0),
    availableUsdc: Number(usdc.availableBalance ?? usdc.balance ?? 0),
    unrealizedPnl: Number(account.totalUnrealizedProfit ?? openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0)),
    openPositions: openPositions.length,
    positions: openPositions,
    marginRatio: totalMarginBalance > 0 && Number.isFinite(totalMaintMargin) ? totalMaintMargin / totalMarginBalance : null,
    openOrderCount: openOrders.length,
    rawAccount: account as Json,
  };
}

async function storeAccountState(supabase: SupabaseClient, settings: ExecutionSettings, account: AccountState): Promise<void> {
  const dailyStart = Number(settings.daily_start_equity ?? account.totalMarginBalance);
  const start = Number.isFinite(dailyStart) && dailyStart > 0 ? dailyStart : account.totalMarginBalance;
  const dailyPnlPct = start > 0 ? ((account.totalMarginBalance - start) / start) * 100 : null;
  await supabase.from("execution_settings").update({
    daily_start_equity: settings.daily_start_equity ?? start,
    current_equity: account.totalMarginBalance,
    daily_unrealized_pnl: account.unrealizedPnl,
    daily_pnl_pct: dailyPnlPct,
    latest_account_state: account as unknown as Json,
    latest_account_state_at: new Date().toISOString(),
    account_total_margin_balance: account.totalMarginBalance,
    account_total_wallet_balance: account.totalWalletBalance,
    account_available_balance: account.availableBalance,
    account_available_usdt: account.availableUsdt,
    account_available_usdc: account.availableUsdc,
    account_unrealized_pnl: account.unrealizedPnl,
    account_open_positions: account.openPositions,
    account_margin_ratio: account.marginRatio,
    account_open_order_count: account.openOrderCount,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
}

async function evaluateGovernor(supabase: SupabaseClient, settings: ExecutionSettings, account?: AccountState): Promise<GovernorDecision> {
  const checkedAccount = account ?? await fetchAccountState().catch(() => null);
  if (checkedAccount) await storeAccountState(supabase, settings, checkedAccount);
  const equity = checkedAccount?.totalMarginBalance ?? Number(settings.current_equity);
  const startRaw = Number(settings.daily_start_equity ?? equity);
  const start = Number.isFinite(startRaw) && startRaw > 0 ? startRaw : null;
  const dailyPnlPct = checkedAccount && start ? ((checkedAccount.totalMarginBalance - start) / start) * 100 : (Number.isFinite(Number(settings.daily_pnl_pct)) ? Number(settings.daily_pnl_pct) : null);
  const unrealizedPnl = checkedAccount?.unrealizedPnl ?? (Number.isFinite(Number(settings.daily_unrealized_pnl)) ? Number(settings.daily_unrealized_pnl) : null);
  const unrealizedDrawdownPct = unrealizedPnl !== null && start ? (unrealizedPnl / start) * 100 : null;
  const [{ data: recent }] = await Promise.all([
    supabase.from("execution_orders").select("status").eq("exchange", "binance_usdm_testnet").order("updated_at", { ascending: false }).limit(25),
  ]);
  const statuses = ((recent ?? []) as Array<{ status: string }>).map((r) => r.status);
  const consecutiveFailed = Math.max(countLeading(statuses, "failed"), Number(settings.failed_execution_streak ?? 0));
  const consecutiveSl = Math.max(countLeading(statuses, "closed_sl"), Number(settings.closed_sl_streak ?? 0));
  let state: GovernorState = "normal";
  let reason = "governor_normal";
  if (!settings.governor_enabled) {
    state = "normal";
    reason = "governor_disabled_normal";
  } else if (settings.kill_switch_enabled) {
    state = "paused";
    reason = "kill_switch_enabled";
  } else if (settings.live_trading_enabled) {
    state = "paused";
    reason = "live_trading_enabled_guard";
  } else if (!Number.isFinite(equity) || equity <= 0 || dailyPnlPct === null) {
    state = "defensive";
    reason = "current_equity_missing";
  } else if (dailyPnlPct <= -Math.abs(Number(settings.max_daily_loss_pct ?? 2))) {
    state = "paused";
    reason = "daily_loss_limit_reached";
  } else if (unrealizedDrawdownPct !== null && unrealizedDrawdownPct <= -Math.abs(Number(settings.max_daily_loss_pct ?? 2))) {
    state = "paused";
    reason = "unrealized_drawdown_severe_pause";
  } else if (consecutiveFailed >= Number(settings.max_consecutive_failed_executions ?? 3)) {
    state = "paused";
    reason = "consecutive_failed_executions_limit";
  } else if (consecutiveSl >= Number(settings.max_consecutive_closed_sl ?? 3)) {
    state = "paused";
    reason = "consecutive_closed_sl_limit";
  } else if (unrealizedDrawdownPct !== null && unrealizedDrawdownPct <= -Math.abs(Number(settings.max_unrealized_drawdown_pct ?? 1.5))) {
    state = "defensive";
    reason = "unrealized_drawdown_defensive";
  } else if (dailyPnlPct <= -Math.abs(Number(settings.defensive_loss_pct ?? 1))) {
    state = "defensive";
    reason = "daily_loss_defensive";
  } else if (dailyPnlPct >= Math.abs(Number(settings.aggressive_allowed_profit_pct ?? 1.5))) {
    state = "aggressive_allowed";
    reason = "profit_threshold_aggressive_allowed";
  }
  const decision: GovernorDecision = {
    state,
    reason,
    risk_multiplier: state === "defensive" ? 0.5 : 1,
    adjusted_max_leverage: state === "defensive" ? Math.min(Number(settings.testnet_max_leverage ?? 7), 3) : Math.min(Number(settings.testnet_max_leverage ?? 7), 7),
    adjusted_max_open_positions: state === "defensive" ? 1 : Number(settings.max_open_testnet_positions ?? 3),
    daily_pnl_pct: dailyPnlPct,
    unrealized_pnl: unrealizedPnl,
    current_equity: Number.isFinite(equity) ? equity : null,
    blocks_execution: state === "paused",
  };
  await supabase.from("execution_settings").update({
    governor_state: decision.state,
    current_equity: decision.current_equity,
    daily_start_equity: settings.daily_start_equity ?? decision.current_equity,
    daily_unrealized_pnl: decision.unrealized_pnl,
    daily_pnl_pct: decision.daily_pnl_pct,
    last_governor_reason: decision.reason,
    last_governor_checked_at: new Date().toISOString(),
    failed_execution_streak: consecutiveFailed,
    closed_sl_streak: consecutiveSl,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  return decision;
}

function countLeading(statuses: string[], wanted: string): number {
  let count = 0;
  for (const status of statuses) {
    if (status !== wanted) break;
    count += 1;
  }
  return count;
}

async function capitalSnapshot(settings: ExecutionSettings): Promise<CapitalSnapshot> {
  let snapshot = zeroCapital(settings);
  try {
    const account = await fetchAccountState();
    snapshot = {
      ...snapshot,
      raw_total_margin_balance: account.totalMarginBalance,
      raw_total_wallet_balance: account.totalWalletBalance,
      raw_available_usdt: account.availableUsdt,
      raw_available_usdc: account.availableUsdc,
    };
  } catch {
    snapshot.fallback_used = true;
  }

  let selected = 0;
  if (settings.capital_basis === "manual_override") selected = Number(settings.testnet_capital_override_usdt ?? 0);
  else if (settings.capital_basis === "available_usdc_plus_usdt") selected = snapshot.raw_available_usdt + snapshot.raw_available_usdc;
  else if (settings.capital_basis === "total_margin_balance") selected = snapshot.raw_total_margin_balance;
  else if (settings.capital_basis === "total_wallet_balance") selected = snapshot.raw_total_wallet_balance;
  else selected = snapshot.raw_available_usdt;
  if (!Number.isFinite(selected) || selected <= 0) {
    selected = Number(settings.fallback_account_balance ?? 10000);
    snapshot.fallback_used = true;
  }
  const cap = Number(settings.max_capital_used_usdt);
  snapshot.max_capital_cap_applied = Number.isFinite(cap) && cap > 0 && selected > cap;
  snapshot.selected_capital_used = snapshot.max_capital_cap_applied ? cap : selected;
  return snapshot;
}

function buildPlan(signal: SignalRow, rules: SymbolRules, capital: CapitalSnapshot, settings: ExecutionSettings, governor?: GovernorDecision): OrderPlan {
  const decision = governor ?? { state: "normal", reason: "governor_not_evaluated", risk_multiplier: 1, adjusted_max_leverage: Math.min(Number(settings.testnet_max_leverage ?? 7), 7), adjusted_max_open_positions: Number(settings.max_open_testnet_positions ?? 3), daily_pnl_pct: null, unrealized_pnl: null, current_equity: null, blocks_execution: false };
  const entry = roundToTick(entryPrice(signal), rules.tickSize, rules.pricePrecision);
  const stopLoss = roundToTick(Number(signal.stop_loss), rules.tickSize, rules.pricePrecision);
  const tp1 = roundToTick(Number(signal.tp1), rules.tickSize, rules.pricePrecision);
  const tp2 = roundToTick(Number(signal.tp2 ?? signal.tp1), rules.tickSize, rules.pricePrecision);
  if (entry <= 0 || stopLoss <= 0 || tp1 <= 0 || tp2 <= 0) throw new Error("skipped_missing_price_levels: entry, SL, TP1, and TP2 are required");
  const isBuy = signal.direction === "buy";
  if (isBuy && !(stopLoss < entry && tp1 > entry && tp2 > entry)) throw new Error("skipped_invalid_sizing: long levels must have SL below entry and TPs above entry");
  if (!isBuy && !(stopLoss > entry && tp1 < entry && tp2 < entry)) throw new Error("skipped_invalid_sizing: short levels must have SL above entry and TPs below entry");
  const riskPct = riskPctForSignal(signal, settings, decision);
  const lev = leverageForSignal(signal, settings, decision);
  const stopDistance = Math.abs(entry - stopLoss);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) throw new Error("skipped_invalid_sizing: Invalid stop loss distance");
  const riskAmount = capital.selected_capital_used * (riskPct / 100);
  const rawQty = riskAmount / stopDistance;
  const maxLeveredQty = (capital.selected_capital_used * lev.leverage) / entry;
  const quantity = floorToStep(Math.min(rawQty, maxLeveredQty), rules.stepSize, rules.quantityPrecision);
  const tp1Quantity = floorToStep(quantity * 0.5, rules.stepSize, rules.quantityPrecision);
  const tp2Quantity = floorToStep(quantity - tp1Quantity, rules.stepSize, rules.quantityPrecision);
  const notional = quantity * entry;
  const adjustments: string[] = [];
  if (rawQty > maxLeveredQty) adjustments.push("Quantity capped by selected leverage and capital margin capacity");
  if (tp1Quantity + tp2Quantity < quantity) adjustments.push("TP quantities rounded below full position size to respect step size");
  if (lev.leverage_source === "capped_to_max") adjustments.push(`Leverage capped to ${lev.leverage}x`);
  if (decision.state === "defensive") adjustments.push("Risk governor defensive mode applied: 0.5x risk, max 3x leverage, max 1 open position");
  if (decision.state === "aggressive_allowed") adjustments.push("Risk governor aggressive_allowed mode applied: A risk 0.75%, A+ risk up to 1.0%, hard cap still enforced");
  if (quantity < rules.minQty) throw new Error(`skipped_invalid_sizing: Calculated quantity ${quantity} below minQty ${rules.minQty}`);
  if (notional < rules.minNotional) throw new Error(`skipped_invalid_sizing: Calculated notional ${notional.toFixed(2)} below minNotional ${rules.minNotional}`);
  if (tp1Quantity <= 0 || tp2Quantity <= 0) throw new Error("skipped_invalid_sizing: TP split invalid after precision rounding");
  return {
    signalId: signal.id, symbol: signal.symbol, side: isBuy ? "long" : "short", entrySide: isBuy ? "BUY" : "SELL", closeSide: isBuy ? "SELL" : "BUY",
    entryPrice: entry, stopLoss, tp1, tp2, leverage: lev.leverage, leverage_source: lev.leverage_source, riskPct, riskAmount, stopDistance,
    stopDistancePct: stopDistance / entry, capital, quantity, tp1Quantity, tp2Quantity, notional, marginRequired: notional / lev.leverage, rules, adjustments,
    governor_state: decision.state, governor_reason: decision.reason, risk_multiplier: decision.risk_multiplier, adjusted_risk_pct: riskPct, adjusted_max_leverage: decision.adjusted_max_leverage,
  };
}

async function getSettings(supabase: SupabaseClient): Promise<ExecutionSettings> {
  const { data } = await supabase.from("execution_settings").select("*").eq("id", 1).maybeSingle();
  return {
    execution_mode: "signal_only", exchange: "binance_usdm_testnet", testnet_enabled: false, live_trading_enabled: false,
    kill_switch_enabled: false, auto_execute_testnet: false, max_open_testnet_positions: 3, max_open_testnet_positions_allowed_max: 10, max_total_open_risk_pct: 3, one_active_execution_per_symbol: true,
    testnet_enabled_at: null, fallback_account_balance: 10000, capital_basis: "available_usdt", testnet_capital_override_usdt: null,
    max_capital_used_usdt: null, testnet_risk_a: 0.5, testnet_risk_a_plus: 0.75, max_testnet_risk_pct: 1,
    testnet_leverage_a: 3, testnet_leverage_a_plus: 5, testnet_max_leverage: 7, governor_enabled: true, governor_state: "normal", daily_start_equity: null, current_equity: null, daily_realized_pnl: null, daily_unrealized_pnl: null, daily_pnl_pct: null, max_daily_loss_pct: 2, max_unrealized_drawdown_pct: 1.5, aggressive_allowed_profit_pct: 1.5, defensive_loss_pct: 1, max_consecutive_failed_executions: 3, max_consecutive_closed_sl: 3, last_governor_reason: null, last_governor_checked_at: null, ...(data ?? {}),
  } as ExecutionSettings;
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
  const { data: execution } = await supabase
    .from("execution_orders")
    .select("signal_id,symbol")
    .eq("id", executionId)
    .maybeSingle();
  const row = (execution ?? {}) as { signal_id?: string | null; symbol?: string | null };
  await supabase.from("execution_event_logs").insert({
    execution_id: executionId,
    execution_order_id: executionId,
    signal_id: row.signal_id ?? null,
    symbol: row.symbol ?? "",
    event_type: eventType,
    message,
    metadata,
  });
}

async function sendExecutionTelegram(supabase: SupabaseClient, signalId: string, eventType: string, lines: string[]): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = Deno.env.get("TELEGRAM_DEFAULT_CHANNEL_ID") ?? "";
  if (!envBool("TELEGRAM_ENABLED", false) || !botToken || !chatId) return;
  const text = ["BINANCE TESTNET — NOT LIVE", "", ...lines].join("\n");
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    await supabase.from("telegram_deliveries").insert({ signal_id: signalId, delivery_type: `execution_${eventType}`, chat_id: chatId, status: res.ok && data.ok ? "sent" : "failed", telegram_message_id: String(data.result?.message_id ?? ""), error_message: res.ok && data.ok ? "" : (data.description ?? res.statusText) });
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
  return { symbol: row.symbol, pricePrecision: row.pricePrecision, quantityPrecision: row.quantityPrecision, tickSize: Number(price?.tickSize ?? 0.01), stepSize: Number(lot?.stepSize ?? 0.001), minQty: Number(lot?.minQty ?? 0.001), minNotional: Number(minNotional?.notional ?? minNotional?.minNotional ?? 5) };
}

function commonExecutionFields(plan: OrderPlan): Json {
  return {
    leverage: plan.leverage, quantity: plan.quantity, volume: plan.quantity, entry_price: plan.entryPrice, stop_loss: plan.stopLoss, tp1: plan.tp1, tp2: plan.tp2,
    capital_basis: plan.capital.capital_basis, raw_total_margin_balance: plan.capital.raw_total_margin_balance, raw_total_wallet_balance: plan.capital.raw_total_wallet_balance,
    raw_available_usdt: plan.capital.raw_available_usdt, raw_available_usdc: plan.capital.raw_available_usdc, selected_capital_used: plan.capital.selected_capital_used,
    max_capital_cap_applied: plan.capital.max_capital_cap_applied, risk_pct: plan.riskPct, risk_amount: plan.riskAmount, notional: plan.notional,
    leverage_source: plan.leverage_source, governor_state: plan.governor_state, governor_reason: plan.governor_reason, risk_multiplier: plan.risk_multiplier, adjusted_risk_pct: plan.adjusted_risk_pct, adjusted_max_leverage: plan.adjusted_max_leverage,
    intended_sl: plan.stopLoss, intended_tp1: plan.tp1, intended_tp2: plan.tp2, tp1_quantity: plan.tp1Quantity, tp2_quantity: plan.tp2Quantity, remaining_quantity: plan.quantity,
  };
}


async function currentOpenRiskPct(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from("execution_orders").select("risk_pct,adjusted_risk_pct,status").eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
  return ((data ?? []) as Array<{ risk_pct?: number; adjusted_risk_pct?: number }>).reduce((sum, row) => sum + Number(row.adjusted_risk_pct ?? row.risk_pct ?? 0), 0);
}

function clampMaxOpenPositions(settings: ExecutionSettings): number {
  return Math.max(1, Math.min(Number(settings.max_open_testnet_positions ?? 3), Number(settings.max_open_testnet_positions_allowed_max ?? 10), 10));
}

function maxTotalOpenRiskPct(settings: ExecutionSettings): number {
  return Math.max(0, Math.min(Number(settings.max_total_open_risk_pct ?? 3), 5));
}

async function cancelExitOrder(symbol: string, orderId?: unknown): Promise<Json> {
  if (!orderId) return { skipped: true };
  return await binanceRequest<Json>("DELETE", "/fapi/v1/order", { symbol, orderId: String(orderId) }, true)
    .catch(async (regularError) => await binanceRequest<Json>("DELETE", "/fapi/v1/algoOrder", { symbol, algoId: String(orderId) }, true)
      .catch((algoError) => ({ regular_error: regularError instanceof Error ? regularError.message : String(regularError), algo_error: algoError instanceof Error ? algoError.message : String(algoError) })));
}

async function fetchExitOrderStatus(symbol: string, orderId?: unknown): Promise<{ status: string; raw?: Json; error?: string } | null> {
  if (!orderId) return null;
  try {
    const regular = await binanceRequest<Json & { status?: string }>("GET", "/fapi/v1/order", { symbol, orderId: String(orderId) }, true);
    return { status: String(regular.status ?? "UNKNOWN"), raw: regular };
  } catch (regularError) {
    try {
      const algo = await binanceRequest<Json & { status?: string }>("GET", "/fapi/v1/algoOrder", { symbol, algoId: String(orderId) }, true);
      return { status: String(algo.status ?? "UNKNOWN"), raw: algo };
    } catch (algoError) {
      return { status: "UNKNOWN", error: `${regularError instanceof Error ? regularError.message : String(regularError)} | ${algoError instanceof Error ? algoError.message : String(algoError)}` };
    }
  }
}

async function submitBreakevenSl(supabase: SupabaseClient, executionId: string, ex: Json, closeSide: Side, quantity: number, rules: SymbolRules): Promise<{ orderId?: string; raw?: Json; error?: string }> {
  const stopPrice = roundToTick(Number(ex.entry_price), rules.tickSize, rules.pricePrecision);
  const planLike = { symbol: String(ex.symbol), closeSide } as OrderPlan;
  const qty = floorToStep(quantity, rules.stepSize, rules.quantityPrecision);
  try {
    await cancelExitOrder(String(ex.symbol), ex.sl_order_id);
    const be = await submitAlgoExitOrder(planLike, "STOP_MARKET", stopPrice, qty);
    await supabase.from("execution_orders").update({ sl_order_id: be.id, binance_sl_order_id: be.id, breakeven_sl_order_id: be.id, tp1_filled: true, sl_moved_to_be: true, be_stop_level: stopPrice, protection_status: "protected", latest_protection_error: "", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "sl_moved_to_be", "TP1 filled; SL moved to break-even for remaining 50%", { be, stopPrice, qty });
    return { orderId: be.id, raw: be.raw };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Failed to move SL to BE";
    await supabase.from("execution_orders").update({ tp1_filled: true, sl_moved_to_be: false, be_stop_level: stopPrice, latest_protection_error: error, protection_status: "unprotected_failed", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "be_sl_failed", error, { stopPrice, qty });
    return { error };
  }
}

async function createSkipped(supabase: SupabaseClient, signal: SignalRow, reason: string, metadata: Json = {}): Promise<Json> {
  const normalized = reason.startsWith("skipped_") ? reason : `skipped_${reason}`;
  const { data } = await supabase.from("execution_orders").insert({
    signal_id: signal.id, exchange: "binance_usdm_testnet", environment: "testnet", symbol: signal.symbol, direction: signal.direction,
    side: signal.direction === "buy" ? "long" : "short", entry_price: entryPrice(signal), stop_loss: signal.stop_loss, tp1: signal.tp1, tp2: signal.tp2,
    volume: 0, quantity: 0, execution_mode: "testnet", status: "skipped", error_message: normalized, latest_auto_skip_reason: normalized, ...metadata,
  }).select("id").single();
  if (data?.id) await logEvent(supabase, data.id as string, normalized, normalized, metadata);
  return { success: false, skipped: true, reason: normalized, ...metadata };
}

function nativeExitPayload(plan: OrderPlan, type: "STOP_MARKET" | "TAKE_PROFIT_MARKET", stopPrice: number, quantity: number): Record<string, string | number | boolean> {
  return {
    symbol: plan.symbol,
    side: plan.closeSide,
    type,
    stopPrice,
    quantity,
    reduceOnly: true,
    workingType: "MARK_PRICE",
  };
}

async function fetchNativeOpenProtection(symbol: string): Promise<Json[]> {
  const [regular, algo] = await Promise.all([
    binanceRequest<Array<Json>>("GET", "/fapi/v1/openOrders", { symbol }, true).catch(() => []),
    binanceRequest<Json>("GET", "/fapi/v1/algoOpenOrders", { symbol }, true).catch(() => ({ orders: [] })),
  ]);
  const algoOrders = Array.isArray(algo) ? algo : Array.isArray((algo as Json).orders) ? (algo as { orders: Json[] }).orders : [];
  return [...regular, ...algoOrders];
}

function openOrderId(order: Json): string {
  return String(order.orderId ?? order.algoId ?? order.clientAlgoId ?? order.clientOrderId ?? "");
}

async function submitAlgoExitOrder(plan: OrderPlan, type: "STOP_MARKET" | "TAKE_PROFIT_MARKET", stopPrice: number, quantity: number): Promise<{ id: string; raw: Json; endpoint: string; payload: Json }> {
  const payload = nativeExitPayload(plan, type, stopPrice, quantity);
  try {
    const regular = await binanceRequest<{ orderId: number }>("POST", "/fapi/v1/order", payload, true);
    return { id: String(regular.orderId), raw: regular as Json, endpoint: "/fapi/v1/order", payload: payload as Json };
  } catch (regularError) {
    const regularMsg = regularError instanceof Error ? regularError.message : String(regularError);
    if (!regularMsg.includes("Order type not supported") && !regularMsg.includes("Algo order API")) throw regularError;
    const algo = await binanceRequest<{ algoId?: number; orderId?: number; clientAlgoId?: string }>("POST", "/fapi/v1/algoOrder", payload, true);
    return { id: String(algo.algoId ?? algo.orderId ?? algo.clientAlgoId), raw: { ...algo as Json, regular_endpoint_error: regularMsg }, endpoint: "/fapi/v1/algoOrder", payload: payload as Json };
  }
}

async function submitBracketOrders(supabase: SupabaseClient, executionId: string, plan: OrderPlan): Promise<{ mode: BracketMode; protection: ProtectionStatus; sl_order_id?: string; tp1_order_id?: string; tp2_order_id?: string; raw: Json; error?: string }> {
  try {
    const sl = await submitAlgoExitOrder(plan, "STOP_MARKET", plan.stopLoss, plan.quantity);
    const tp1 = await submitAlgoExitOrder(plan, "TAKE_PROFIT_MARKET", plan.tp1, plan.tp1Quantity);
    const tp2 = await submitAlgoExitOrder(plan, "TAKE_PROFIT_MARKET", plan.tp2, plan.tp2Quantity);
    const openOrders = await fetchNativeOpenProtection(plan.symbol);
    const orderIds = new Set(openOrders.map(openOrderId));
    const expected = [
      { label: "sl", placed: sl, type: "STOP_MARKET", side: plan.closeSide, quantity: plan.quantity, stopPrice: plan.stopLoss },
      { label: "tp1", placed: tp1, type: "TAKE_PROFIT_MARKET", side: plan.closeSide, quantity: plan.tp1Quantity, stopPrice: plan.tp1 },
      { label: "tp2", placed: tp2, type: "TAKE_PROFIT_MARKET", side: plan.closeSide, quantity: plan.tp2Quantity, stopPrice: plan.tp2 },
    ];
    const mismatches = expected.flatMap((item) => {
      const order = openOrders.find((o) => openOrderId(o) === String(item.placed.id));
      if (!order) return [`${item.label}:missing_open_order`];
      const issues: string[] = [];
      if (String(order.side ?? item.side).toUpperCase() !== item.side) issues.push(`${item.label}:wrong_side`);
      if (String(order.type ?? item.type).toUpperCase() !== item.type) issues.push(`${item.label}:wrong_type`);
      if ((order.reduceOnly as unknown) === false) issues.push(`${item.label}:not_reduce_only`);
      const stop = Number(order.stopPrice ?? item.stopPrice);
      if (Number.isFinite(stop) && Math.abs(stop - item.stopPrice) > Math.max(item.stopPrice * 0.000001, 1e-8)) issues.push(`${item.label}:wrong_stop_price`);
      return issues;
    });
    const missing = [sl.id, tp1.id, tp2.id].filter((id) => !orderIds.has(String(id)));
    const raw = { sl, tp1, tp2, verified_open_orders: openOrders, verification_mismatches: mismatches };
    if (missing.length > 0 || mismatches.length > 0) throw new Error(`Native protection verification failed; missing/mismatched open reduce-only orders: ${[...missing, ...mismatches].join(",")}`);
    await supabase.from("execution_orders").update({ status: "protected", bracket_mode: "exchange_native", protection_status: "protected", sl_order_id: sl.id, tp1_order_id: tp1.id, tp2_order_id: tp2.id, binance_sl_order_id: sl.id, binance_tp1_order_id: tp1.id, binance_tp2_order_id: tp2.id, tp1_filled: false, sl_moved_to_be: false, be_stop_level: null, latest_protection_error: "", raw_exchange_response: raw, updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "protected", "SL/TP reduce-only protection submitted and verified on Binance openOrders", raw);
    return { mode: "exchange_native", protection: "protected", sl_order_id: sl.id, tp1_order_id: tp1.id, tp2_order_id: tp2.id, raw };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Bracket order submission failed";
    const fallbackSafe = plan.stopLoss > 0 && plan.tp1 > 0 && plan.tp2 > 0 && plan.tp1Quantity > 0 && plan.tp2Quantity > 0;
    if (fallbackSafe) {
      const raw = { intended_sl: plan.stopLoss, intended_tp1: plan.tp1, intended_tp2: plan.tp2, tp1_quantity: plan.tp1Quantity, tp2_quantity: plan.tp2Quantity, remaining_quantity: plan.quantity, error };
      await supabase.from("execution_orders").update({ status: "entry_filled", bracket_mode: "managed_exit_fallback", protection_status: "protected_managed", intended_sl: plan.stopLoss, intended_tp1: plan.tp1, intended_tp2: plan.tp2, tp1_quantity: plan.tp1Quantity, tp2_quantity: plan.tp2Quantity, remaining_quantity: plan.quantity, tp1_filled: false, sl_moved_to_be: false, be_stop_level: null, latest_protection_error: error, raw_exchange_response: raw, last_exchange_error: error, updated_at: new Date().toISOString() }).eq("id", executionId);
      await logEvent(supabase, executionId, "managed_exit_fallback_enabled", "Exchange-native SL/TP unavailable or unverified; HashiBot managed exit fallback enabled", raw);
      return { mode: "managed_exit_fallback", protection: "protected_managed", raw, error };
    }
    await supabase.from("execution_orders").update({ status: "failed", bracket_mode: "failed", protection_status: "unprotected_failed", last_exchange_error: error, latest_protection_error: error, error_message: error, updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "failed_bracket_order", error);
    return { mode: "failed", protection: "unprotected_failed", raw: {}, error };
  }
}

async function maybePlaceProtection(supabase: SupabaseClient, executionId: string, signalId: string, plan: OrderPlan): Promise<Json> {
  const bracket = await submitBracketOrders(supabase, executionId, plan);
  await sendExecutionTelegram(supabase, signalId, bracket.mode === "exchange_native" ? "protection_submitted" : bracket.mode === "managed_exit_fallback" ? "managed_exit_fallback_enabled" : "failed_bracket_order", [
    `Protection: ${bracket.protection}`,
    `Bracket mode: ${bracket.mode}`,
    `Entry order: ${executionId}`,
    `SL order: ${bracket.sl_order_id ?? "managed"}`,
    `TP1 order: ${bracket.tp1_order_id ?? "managed"}`,
    `TP2 order: ${bracket.tp2_order_id ?? "managed"}`,
    "TP1 close %: 50%",
    "TP2 close %: 50%",
    "Move SL to BE after TP1: yes",
    bracket.mode === "managed_exit_fallback" ? "Managed fallback protection active — HashiBot will close via reduce-only market order if TP/SL level is reached." : "Exchange-native reduce-only protection submitted.",
    bracket.error ? `Exchange error: ${bracket.error}` : "SL/TP protection submitted",
  ]);
  return bracket;
}

async function executeSignal(supabase: SupabaseClient, signalId: string, manual: boolean): Promise<Json> {
  assertLiveTradingImpossible();
  const settings = await getSettings(supabase);
  if (settings.live_trading_enabled) throw new Error("Live trading impossible guard blocked execution_settings.live_trading_enabled");
  const { data: signal, error } = await supabase.from("signals").select("*").eq("id", signalId).maybeSingle();
  if (error || !signal) throw new Error("Signal not found");
  const sig = signal as SignalRow;
  if (settings.kill_switch_enabled) return createSkipped(supabase, sig, "skipped_kill_switch");
  if (settings.execution_mode !== "testnet" || !settings.testnet_enabled) return createSkipped(supabase, sig, "skipped_auto_disabled");
  if (!manual && !settings.auto_execute_testnet) return createSkipped(supabase, sig, "skipped_auto_disabled");
  const { data: existingRows, error: existingError } = await supabase.from("execution_orders").select("id,status,symbol").eq("signal_id", signalId).eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").order("created_at", { ascending: false });
  if (existingError) throw existingError;
  const existing = (existingRows ?? []) as Array<{ id: string; status: string; symbol: string }>;
  const activeDuplicate = existing.find((row) => ACTIVE_STATUSES.includes(row.status));
  if (activeDuplicate) {
    const truth = await fetchBinanceSymbolTruth(sig.symbol);
    if (truth.hasExposure) {
      return { success: false, skipped: true, reason: "skipped_duplicate_signal", execution_id: activeDuplicate.id, binance_truth: { positionAmt: truth.positionAmt, openOrders: truth.openOrders.length } };
    }
    await markSymbolRowsStale(supabase, sig.symbol, "duplicate_signal_binance_truth_no_position_no_orders", signalId);
    await logEvent(supabase, activeDuplicate.id, "stale_closed", "Duplicate signal blocker marked stale_closed after Binance truth showed no position and no open orders", { symbol: sig.symbol, positionAmt: truth.positionAmt, openOrders: truth.openOrders.length });
  } else if (existing.length > 0 && !existing.every((row) => RETRYABLE_STATUSES.includes(row.status))) {
    return { success: false, skipped: true, reason: "skipped_duplicate_signal_non_retryable", execution_id: existing[0].id, status: existing[0].status };
  }
  if (sig.market_type !== "crypto") return createSkipped(supabase, sig, "skipped_non_crypto");
  if (!manual && settings.testnet_enabled_at && new Date(sig.created_at) < new Date(settings.testnet_enabled_at)) return createSkipped(supabase, sig, "skipped_old_signal");
  if (!manual && sig.source !== "scanner") return createSkipped(supabase, sig, "skipped_old_signal");
  const governor = await evaluateGovernor(supabase, settings);
  if (!manual && governor.blocks_execution) return createSkipped(supabase, sig, "skipped_governor_paused", { governor_state: governor.state, governor_reason: governor.reason, risk_multiplier: governor.risk_multiplier, adjusted_max_leverage: governor.adjusted_max_leverage });
  if (!manual && governor.state === "defensive" && String(sig.grade ?? "").toUpperCase() !== "A+") return createSkipped(supabase, sig, "skipped_governor_defensive_filter", { governor_state: governor.state, governor_reason: governor.reason, risk_multiplier: governor.risk_multiplier, adjusted_max_leverage: governor.adjusted_max_leverage });
  if (settings.one_active_execution_per_symbol) {
    const { data: symbolRows, error: symbolRowsError } = await supabase.from("execution_orders").select("id,status").eq("symbol", sig.symbol).eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
    if (symbolRowsError) throw symbolRowsError;
    if ((symbolRows?.length ?? 0) > 0) {
      const truth = await fetchBinanceSymbolTruth(sig.symbol);
      if (truth.hasExposure) return createSkipped(supabase, sig, "skipped_active_symbol_execution", { binance_position_amt: truth.positionAmt, binance_open_orders: truth.openOrders.length });
      const cleaned = await markSymbolRowsStale(supabase, sig.symbol, "same_symbol_binance_truth_no_position_no_orders", signalId);
      await logEvent(supabase, String((symbolRows?.[0] as { id: string } | undefined)?.id ?? ""), "stale_closed", "Same-symbol execution blocker marked stale_closed after Binance truth showed no position and no open orders", { symbol: sig.symbol, cleaned, positionAmt: truth.positionAmt, openOrders: truth.openOrders.length });
    }
  }
  const maxOpenAllowed = !manual ? Math.min(clampMaxOpenPositions(settings), governor.adjusted_max_open_positions) : clampMaxOpenPositions(settings);
  const { count: openCount } = await supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
  if ((openCount ?? 0) >= maxOpenAllowed) return createSkipped(supabase, sig, "skipped_max_open_positions", { governor_state: governor.state, governor_reason: governor.reason, adjusted_max_open_positions: maxOpenAllowed });
  let plan: OrderPlan;
  try { plan = buildPlan(sig, await getRules(sig.symbol), await capitalSnapshot(settings), settings, governor); }
  catch (e) { return createSkipped(supabase, sig, e instanceof Error ? e.message : "skipped_invalid_sizing"); }
  const currentRisk = await currentOpenRiskPct(supabase);
  const riskCap = maxTotalOpenRiskPct(settings);
  const totalRiskAfter = currentRisk + plan.riskPct;
  if (!manual && totalRiskAfter > riskCap + 1e-9) return createSkipped(supabase, sig, "skipped_total_open_risk_cap", { current_open_risk_pct: currentRisk, proposed_risk_pct: plan.riskPct, max_total_open_risk_pct: riskCap });
  plan.total_open_risk_after_trade = totalRiskAfter;
  const { data: exec } = await supabase.from("execution_orders").insert({ signal_id: sig.id, exchange: "binance_usdm_testnet", environment: "testnet", symbol: sig.symbol, direction: sig.direction, side: plan.side, execution_mode: "testnet", status: "pending", testnet_enabled_at: settings.testnet_enabled_at, current_open_risk_pct: currentRisk, total_open_risk_after_trade: totalRiskAfter, ...commonExecutionFields(plan) }).select("id").single();
  const executionId = String((exec as { id: string }).id);
  await logEvent(supabase, executionId, "planned", "Order plan created", { plan });
  try {
    await binanceRequest("POST", "/fapi/v1/leverage", { symbol: plan.symbol, leverage: plan.leverage }, true);
    await binanceRequest("POST", "/fapi/v1/marginType", { symbol: plan.symbol, marginType: "ISOLATED" }, true).catch((e) => { if (!String(e instanceof Error ? e.message : e).includes("No need to change margin type")) throw e; });
    const entry = await binanceRequest<{ orderId: number; status?: string }>("POST", "/fapi/v1/order", { symbol: plan.symbol, side: plan.entrySide, type: "LIMIT", timeInForce: "GTC", quantity: plan.quantity, price: plan.entryPrice }, true);
    await supabase.from("execution_orders").update({ status: "entry_submitted", entry_order_id: String(entry.orderId), binance_entry_order_id: String(entry.orderId), raw_exchange_response: { entry, plan }, updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "entry_submitted", "Entry LIMIT order placed on /fapi/v1/order", { orderId: entry.orderId, entry_type: "LIMIT" });
    await sendExecutionTelegram(supabase, sig.id, "auto_executed", ["Auto execution submitted", `Symbol: ${plan.symbol}`, `Side: ${plan.side}`, `Strategy: ${sig.strategy_name}`, `Timeframe: ${sig.timeframe}`, `Grade: ${sig.grade}`, `Leverage: ${plan.leverage}x`, `Leverage source: ${plan.leverage_source}`, `Governor: ${plan.governor_state}`, `Governor reason: ${plan.governor_reason}`, `Effective risk %: ${plan.adjusted_risk_pct}`, `Effective max leverage: ${plan.adjusted_max_leverage}x`, `Capital basis: ${plan.capital.capital_basis}`, `Capital used: ${plan.capital.selected_capital_used.toFixed(2)}`, `Risk %: ${plan.riskPct}`, `Daily PnL %: ${governor.daily_pnl_pct ?? "unknown"}`, `Unrealized PnL: ${governor.unrealized_pnl ?? "unknown"}`, `Risk amount: ${plan.riskAmount.toFixed(2)}`, `Notional: ${plan.notional.toFixed(2)}`, `Qty: ${plan.quantity}`, `Entry: ${plan.entryPrice}`, `SL: ${plan.stopLoss}`, `TP1: ${plan.tp1}`, `TP2: ${plan.tp2}`, `Protection: pending`, `Bracket mode: pending`, `Entry order: ${entry.orderId}`, "SL order: pending", "TP1 order: pending", "TP2 order: pending", "TP1 close %: 50%", "TP2 close %: 50%", "Move SL to BE after TP1: yes", `Open risk: ${plan.riskPct}%`, `Total open risk after this trade: ${totalRiskAfter}%`]);
    if (entry.status === "FILLED") await maybePlaceProtection(supabase, executionId, sig.id, plan);
    return { success: true, execution_id: executionId, status: "entry_submitted", plan };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Execution failed";
    await supabase.from("execution_orders").update({ status: "failed", error_message: msg, last_exchange_error: msg, bracket_mode: "failed", protection_status: "unprotected_failed", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "failed_exchange_error", msg);
    await sendExecutionTelegram(supabase, sig.id, "failed", [`Execution failed: ${msg}`, `Signal: ${sig.symbol}`]);
    return { success: false, execution_id: executionId, error: msg };
  }
}

async function getPosition(symbol: string): Promise<{ positionAmt: string; markPrice?: string; entryPrice?: string; unrealizedProfit?: string } | null> {
  const positions = await binanceRequest<Array<{ symbol: string; positionAmt: string; markPrice?: string; entryPrice?: string; unrealizedProfit?: string }>>("GET", "/fapi/v2/positionRisk", { symbol }, true);
  return positions.find((p) => p.symbol === symbol) ?? null;
}

async function closeManaged(supabase: SupabaseClient, ex: Json, closeSide: Side, quantity: number, reason: "closed_tp" | "closed_sl" | "closed_breakeven" | "closed_timeout" | "partially_closed", message: string): Promise<Json> {
  const result = await binanceRequest<{ orderId: number }>("POST", "/fapi/v1/order", { symbol: String(ex.symbol), side: closeSide, type: "MARKET", quantity, reduceOnly: true }, true);
  const update: Json = { status: reason, raw_exchange_response: { managed_close: result }, updated_at: new Date().toISOString() };
  if (reason === "partially_closed") {
    update.tp1_filled = true;
    update.sl_moved_to_be = true;
    update.be_stop_level = Number(ex.entry_price);
    update.protection_status = "protected_managed";
  }
  await supabase.from("execution_orders").update(update).eq("id", String(ex.id));
  await logEvent(supabase, String(ex.id), reason === "partially_closed" ? "managed_tp1_hit" : `managed_${reason}`, message, { result, quantity });
  const lines = reason === "partially_closed"
    ? ["TP1 hit", "Closed: 50%", "SL moved to break-even", "Remaining position: 50%"]
    : reason === "closed_tp"
      ? ["TP2 hit", "Closed remaining position", "Trade closed TP"]
      : reason === "closed_breakeven"
        ? ["Break-even SL hit", "Remaining position closed"]
        : reason === "closed_timeout"
          ? ["Time-stop expired", "Remaining position closed"]
          : ["SL hit", "Full position closed"];
  await sendExecutionTelegram(supabase, String(ex.signal_id), reason, lines);
  return { success: true, status: reason, managed_close_order_id: result.orderId };
}

async function syncExecution(supabase: SupabaseClient, executionId: string): Promise<Json> {
  assertLiveTradingImpossible();
  const { data } = await supabase.from("execution_orders").select("*").eq("id", executionId).maybeSingle();
  if (!data) throw new Error("Execution not found");
  const ex = data as Json;
  const signalId = String(ex.signal_id);
  const closeSide: Side = ex.direction === "buy" ? "SELL" : "BUY";
  const rules = await getRules(String(ex.symbol));
  const raw: Json = {};
  try {
    const entryStatus = ex.entry_order_id ? await binanceRequest<{ status: string; executedQty?: string; orderId?: number }>("GET", "/fapi/v1/order", { symbol: String(ex.symbol), orderId: String(ex.entry_order_id) }, true) : null;
    raw.entry = entryStatus as Json | null;
    const position = await getPosition(String(ex.symbol));
    raw.position = position as Json | null;
    const mark = Number(position?.markPrice ?? 0);
    const openAmt = Math.abs(Number(position?.positionAmt ?? 0));

    if (entryStatus?.status === "FILLED" && ["entry_submitted", "pending"].includes(String(ex.status))) {
      const qty = floorToStep(Number(entryStatus.executedQty ?? ex.quantity), rules.stepSize, rules.quantityPrecision);
      const half = floorToStep(qty * 0.5, rules.stepSize, rules.quantityPrecision);
      const planLike = { symbol: String(ex.symbol), closeSide, stopLoss: Number(ex.stop_loss), tp1: Number(ex.tp1), tp2: Number(ex.tp2), quantity: qty, tp1Quantity: half, tp2Quantity: floorToStep(qty - half, rules.stepSize, rules.quantityPrecision) } as OrderPlan;
      await supabase.from("execution_orders").update({ status: "entry_filled", quantity: qty, volume: qty, raw_exchange_response: raw, updated_at: new Date().toISOString() }).eq("id", executionId);
      await logEvent(supabase, executionId, "entry_filled", "Entry filled; submitting SL/TP protection", raw);
      const bracket = await maybePlaceProtection(supabase, executionId, signalId, planLike);
      return { success: true, status: bracket.mode === "exchange_native" ? "protected" : "entry_filled", bracket };
    }

    if (ex.bracket_mode === "managed_exit_fallback" && !TERMINAL_STATUSES.includes(String(ex.status)) && position) {
      if (openAmt <= 0) {
        await supabase.from("execution_orders").update({ status: ex.tp1_filled ? "closed_tp" : "closed_sl", updated_at: new Date().toISOString() }).eq("id", executionId);
        return { success: true, status: ex.tp1_filled ? "closed_tp" : "closed_sl", position };
      }
      const isLong = ex.direction === "buy";
      const tp1Filled = Boolean(ex.tp1_filled) || String(ex.status) === "partially_closed";
      const activeSl = tp1Filled && ex.sl_moved_to_be ? Number(ex.be_stop_level ?? ex.entry_price) : Number(ex.stop_loss);
      const hitSl = isLong ? mark <= activeSl : mark >= activeSl;
      const hitTp2 = isLong ? mark >= Number(ex.tp2) : mark <= Number(ex.tp2);
      const hitTp1 = isLong ? mark >= Number(ex.tp1) : mark <= Number(ex.tp1);
      if (hitSl && tp1Filled) return closeManaged(supabase, ex, closeSide, floorToStep(openAmt, rules.stepSize, rules.quantityPrecision), "closed_breakeven", "Break-even SL hit / remaining position closed by managed fallback");
      if (hitSl) return closeManaged(supabase, ex, closeSide, floorToStep(openAmt, rules.stepSize, rules.quantityPrecision), "closed_sl", "SL hit / full position closed by managed fallback");
      if (hitTp2) return closeManaged(supabase, ex, closeSide, floorToStep(openAmt, rules.stepSize, rules.quantityPrecision), "closed_tp", "TP2 hit / remaining position closed by managed fallback");
      if (hitTp1 && !tp1Filled) return closeManaged(supabase, ex, closeSide, floorToStep(openAmt * 0.5, rules.stepSize, rules.quantityPrecision), "partially_closed", "TP1 hit / 50% closed by managed fallback; SL moved to break-even");
      await supabase.from("execution_orders").update({ status: tp1Filled ? "partially_closed" : "entry_filled", protection_status: "protected_managed", bracket_mode: "managed_exit_fallback", raw_exchange_response: raw, updated_at: new Date().toISOString() }).eq("id", executionId);
      return { success: true, status: tp1Filled ? "partially_closed" : "entry_filled", bracket_mode: "managed_exit_fallback", protection_status: "protected_managed", mark_price: mark };
    }

    const [tp1, tp2, sl] = await Promise.all([
      fetchExitOrderStatus(String(ex.symbol), ex.tp1_order_id),
      fetchExitOrderStatus(String(ex.symbol), ex.tp2_order_id),
      fetchExitOrderStatus(String(ex.symbol), ex.sl_order_id),
    ]);
    raw.orders = { tp1, tp2, sl } as Json;
    let status = String(ex.status);
    const tp1Filled = Boolean(ex.tp1_filled) || tp1?.status === "FILLED" || status === "partially_closed";
    if (sl?.status === "FILLED" && tp1Filled && ex.sl_moved_to_be) {
      await cancelExitOrder(String(ex.symbol), ex.tp2_order_id);
      status = "closed_breakeven";
      await sendExecutionTelegram(supabase, signalId, "closed_breakeven", ["Break-even SL hit", "Remaining position closed"]);
    } else if (sl?.status === "FILLED") {
      await Promise.all([cancelExitOrder(String(ex.symbol), ex.tp1_order_id), cancelExitOrder(String(ex.symbol), ex.tp2_order_id)]);
      status = "closed_sl";
      await sendExecutionTelegram(supabase, signalId, "closed_sl", ["SL hit", "Full position closed"]);
    } else if (tp2?.status === "FILLED") {
      await cancelExitOrder(String(ex.symbol), ex.sl_order_id);
      status = "closed_tp";
      await sendExecutionTelegram(supabase, signalId, "closed_tp", ["TP2 hit", "Closed remaining position", "Trade closed TP"]);
    } else if (tp1?.status === "FILLED" && !ex.tp1_filled) {
      const remaining = openAmt > 0 ? openAmt : Number(ex.tp2_order_id ? ex.quantity : 0) * 0.5;
      const be = await submitBreakevenSl(supabase, executionId, ex, closeSide, remaining, rules);
      status = "partially_closed";
      await sendExecutionTelegram(supabase, signalId, "partially_closed", ["TP1 hit", "Closed: 50%", be.error ? `SL move failed: ${be.error}` : "SL moved to break-even", "Remaining position: 50%"]);
    } else if (ex.sl_order_id && ex.tp1_order_id && ex.tp2_order_id && !TERMINAL_STATUSES.includes(status)) {
      status = tp1Filled ? "partially_closed" : "protected";
    }
    const protectionStatus = status === "protected" || status === "partially_closed" ? "protected" : ex.protection_status;
    await supabase.from("execution_orders").update({ status, protection_status: protectionStatus, bracket_mode: ex.bracket_mode ?? "exchange_native", raw_exchange_response: raw, last_exchange_error: "", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "sync_result", `Sync result: ${status}`, raw);
    return { success: true, status, order_statuses: raw.orders, position };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    await supabase.from("execution_orders").update({ last_exchange_error: msg, latest_protection_error: msg, raw_exchange_response: raw, updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "sync_failed", msg, raw);
    return { success: false, error: msg };
  }
}

async function invokeMonitorCron(): Promise<Json> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return { success: false, error: "monitor_invocation_not_configured" };
  const res = await fetch(`${supabaseUrl}/functions/v1/binance-testnet-monitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRole}` },
    body: JSON.stringify({ source: "binance-testnet-execution", run_type: "manual_test_flow_monitor_confirmation" }),
  });
  const body = await res.json().catch(() => ({})) as Json;
  return { success: res.ok && body.success !== false, status: res.status, body };
}

function nativeOrderCreated(row: Json | null, key: string): boolean {
  return String(row?.bracket_mode ?? "") === "exchange_native" && Boolean(row?.[key]);
}

function quantityPct(quantity: unknown, total: unknown): number | null {
  const q = Number(quantity ?? NaN);
  const t = Number(total ?? NaN);
  if (!Number.isFinite(q) || !Number.isFinite(t) || t <= 0) return null;
  return Number(((q / t) * 100).toFixed(8));
}

function cleanSignalId(signalId: unknown): string {
  return typeof signalId === "string" ? signalId.trim() : "";
}

function governorPausedPayload(governor: GovernorDecision, settings: ExecutionSettings): Json {
  return {
    success: false,
    error: "governor_paused",
    reason: governor.reason,
    governor_state: governor.state,
    governor_reason: governor.reason,
    last_governor_checked_at: new Date().toISOString(),
    execution_allowed: false,
    admin_action_needed: settings.kill_switch_enabled
      ? "Turn off the execution kill switch after reviewing account state; the function will not unpause automatically."
      : "Review governor thresholds, account PnL, failed execution streaks, and risk settings; the function will not unpause automatically.",
  };
}

async function validateSelectedSignal(supabase: SupabaseClient, signalId: unknown): Promise<SignalRow | Json> {
  const id = cleanSignalId(signalId);
  if (!id) return { success: false, error: "missing_signal_id" };
  const { data, error } = await supabase.from("signals").select("*").eq("id", id).maybeSingle();
  if (error) return { success: false, error: "signal_not_found", details: error.message, signal_id: id };
  if (!data) return { success: false, error: "signal_not_found", signal_id: id };
  const signal = data as SignalRow;
  if (!signal.id || signal.id !== id) return { success: false, error: "invalid_selected_signal", signal_id: id };
  if (signal.market_type !== "crypto" || !signal.symbol || !signal.direction) {
    return { success: false, error: "stale_signal_not_executable", signal_id: id, market_type: signal.market_type, symbol: signal.symbol ?? "", direction: signal.direction ?? "" };
  }
  return signal;
}

function isSignalRow(value: SignalRow | Json): value is SignalRow {
  return typeof (value as SignalRow).id === "string" && typeof (value as SignalRow).symbol === "string";
}

async function manualTestFlow(supabase: SupabaseClient, signalId: string): Promise<Json> {
  assertLiveTradingImpossible();
  const validated = await validateSelectedSignal(supabase, signalId);
  if (!isSignalRow(validated)) return validated;
  const symbol = validated.symbol;
  const settings = await getSettings(supabase);
  const governor = await evaluateGovernor(supabase, settings);
  if (governor.blocks_execution) return governorPausedPayload(governor, settings);
  const clean = await cleanStaleRowsForSymbols(supabase, [symbol]);
  let plan: OrderPlan;
  try {
    plan = buildPlan(validated, await getRules(symbol), await capitalSnapshot(settings), settings, governor);
  } catch (e) {
    return { success: false, error: "stale_signal_not_executable", reason: e instanceof Error ? e.message : "invalid_selected_signal", signal_id: signalId, symbol };
  }
  const execution = await executeSignal(supabase, signalId, true);
  const truth = await fetchBinanceSymbolTruth(symbol);
  const openOrders = await binanceRequest<Json[]>("GET", "/fapi/v1/openOrders", { symbol }, true).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  let sync: Json | null = null;
  if (execution.execution_id) sync = await syncExecution(supabase, String(execution.execution_id));
  const monitor = await invokeMonitorCron().catch((e) => ({ success: false, error: e instanceof Error ? e.message : String(e) }));
  const { data: row } = execution.execution_id
    ? await supabase.from("execution_orders").select("status,quantity,volume,entry_order_id,binance_entry_order_id,sl_order_id,tp1_order_id,tp2_order_id,binance_sl_order_id,binance_tp1_order_id,binance_tp2_order_id,bracket_mode,protection_status,latest_protection_error,tp1_quantity,tp2_quantity,remaining_quantity,raw_exchange_response").eq("id", String(execution.execution_id)).maybeSingle()
    : { data: null };
  const { data: monitorSettings } = await supabase
    .from("execution_settings")
    .select("latest_monitor_run_at,latest_monitor_status,latest_monitor_result,last_managed_exit_action,open_binance_positions,open_binance_orders")
    .eq("id", 1)
    .maybeSingle();
  const resultRow = (row as Json | null) ?? null;
  const totalQuantity = resultRow?.quantity ?? resultRow?.volume ?? plan.quantity;
  const managedFallbackActive = String(resultRow?.bracket_mode ?? "") === "managed_exit_fallback" && String(resultRow?.protection_status ?? "") === "protected_managed";
  const protectedState = ["protected", "protected_managed"].includes(String(resultRow?.protection_status ?? ""));
  const bracketState = ["exchange_native", "managed_exit_fallback"].includes(String(resultRow?.bracket_mode ?? ""));
  const monitorStateConfirmed = Boolean((monitor as Json).success && protectedState && bracketState);
  return {
    success: true,
    signal_id: signalId,
    symbol,
    steps: { clean, dry_run: { success: true, plan }, execute: execution, fetch_binance_truth: { position: truth.positionRisk, open_orders: truth.openOrders }, fetch_binance_open_orders: openOrders, sync, monitor_cron_confirmation: monitor },
    result: {
      entry_submitted: Boolean(resultRow?.entry_order_id ?? resultRow?.binance_entry_order_id),
      entry_order_status: (resultRow as Json | null)?.status ?? execution.status ?? execution.reason ?? "unknown",
      binance_truth_fetched: true,
      position_detected: Math.abs(truth.positionAmt) > 0,
      position_status: truth.hasExposure ? "open_on_binance" : "no_open_binance_position",
      native_sl_order_detected: nativeOrderCreated(resultRow, "binance_sl_order_id") || nativeOrderCreated(resultRow, "sl_order_id"),
      native_tp1_order_detected: nativeOrderCreated(resultRow, "binance_tp1_order_id") || nativeOrderCreated(resultRow, "tp1_order_id"),
      native_tp2_order_detected: nativeOrderCreated(resultRow, "binance_tp2_order_id") || nativeOrderCreated(resultRow, "tp2_order_id"),
      managed_fallback_active: managedFallbackActive,
      tp1_quantity: resultRow?.tp1_quantity ?? plan.tp1Quantity,
      tp2_quantity: resultRow?.tp2_quantity ?? plan.tp2Quantity,
      total_quantity: totalQuantity,
      tp1_quantity_pct: quantityPct(resultRow?.tp1_quantity ?? plan.tp1Quantity, totalQuantity),
      tp2_quantity_pct: quantityPct(resultRow?.tp2_quantity ?? plan.tp2Quantity, totalQuantity),
      protection_status: resultRow?.protection_status ?? null,
      bracket_mode: resultRow?.bracket_mode ?? null,
      protected_or_managed: protectedState,
      monitor_cron_confirmed_protection_state: monitorStateConfirmed,
      monitor_ready: monitorStateConfirmed || managedFallbackActive || protectedState,
      monitor_status: (monitorSettings as Json | null)?.latest_monitor_status ?? null,
      monitor_run_at: (monitorSettings as Json | null)?.latest_monitor_run_at ?? null,
      monitor_result: (monitorSettings as Json | null)?.latest_monitor_result ?? null,
      latest_protection_error: resultRow?.latest_protection_error ?? null,
    },
  };
}

async function statusPayload(supabase: SupabaseClient): Promise<Json> {
  const settings = await getSettings(supabase);
  const [executions, failed, skipped, latestError] = await Promise.all([
    supabase.from("execution_orders").select("*").eq("exchange", "binance_usdm_testnet").order("created_at", { ascending: false }).limit(25),
    supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("status", "skipped"),
    supabase.from("execution_orders").select("last_exchange_error,error_message").eq("exchange", "binance_usdm_testnet").not("error_message", "eq", "").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const capital = await capitalSnapshot(settings).catch(() => zeroCapital(settings));
  const account_state = await fetchAccountState().catch(() => null);
  const governor = await evaluateGovernor(supabase, settings, account_state ?? undefined).catch(() => null);
  const current_open_risk_pct = await currentOpenRiskPct(supabase).catch(() => 0);
  const max_total_open_risk_pct = maxTotalOpenRiskPct(settings);
  return { success: true, settings, capital, account_state, governor, execution_allowed: governor ? !governor.blocks_execution : settings.governor_state !== "paused", current_open_risk_pct, max_total_open_risk_pct, remaining_risk_capacity_pct: Math.max(0, max_total_open_risk_pct - current_open_risk_pct), env: { execution_mode: Deno.env.get("EXECUTION_MODE") || "signal_only", exchange: Deno.env.get("EXCHANGE") || "binance_usdm_testnet", testnet_enabled: envBool("TESTNET_ENABLED", false), live_trading_enabled: envBool("LIVE_TRADING_ENABLED", false), base_url: safeBaseUrl(), api_key_configured: Boolean(Deno.env.get("BINANCE_TESTNET_API_KEY")), api_secret_configured: Boolean(Deno.env.get("BINANCE_TESTNET_API_SECRET")) }, executions: executions.data ?? [], failed_count: failed.count ?? 0, skipped_count: skipped.count ?? 0, latest_error: latestError.data ?? null };
}

async function resetTestnetGovernor(supabase: SupabaseClient): Promise<Json> {
  assertLiveTradingImpossible();
  const settings = await getSettings(supabase);
  if (settings.live_trading_enabled) throw new Error("live_trading_enabled_guard");
  const account_state = await fetchAccountState().catch(() => null);
  const resetEquity = account_state?.totalMarginBalance ?? (Number.isFinite(Number(settings.current_equity)) ? Number(settings.current_equity) : null);
  const resetUnrealized = account_state?.unrealizedPnl ?? (Number.isFinite(Number(settings.daily_unrealized_pnl)) ? Number(settings.daily_unrealized_pnl) : null);
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("execution_settings").update({
    live_trading_enabled: false,
    daily_start_equity: resetEquity,
    current_equity: resetEquity,
    daily_realized_pnl: 0,
    daily_unrealized_pnl: resetUnrealized,
    daily_pnl_pct: 0,
    failed_execution_streak: 0,
    closed_sl_streak: 0,
    governor_state: "normal",
    last_governor_reason: "testnet_governor_reset_start_new_test_day",
    last_governor_checked_at: nowIso,
    latest_account_state: account_state ? account_state as unknown as Json : settings as unknown as Json,
    latest_account_state_at: account_state ? nowIso : settings.last_governor_checked_at,
    updated_at: nowIso,
  }).eq("id", 1);
  if (error) throw new Error(error.message);

  const refreshed = await getSettings(supabase);
  const governor = await evaluateGovernor(supabase, refreshed, account_state ?? undefined);
  return {
    success: true,
    reset_scope: "testnet_governor_only",
    account_state,
    governor,
    execution_allowed: !governor.blocks_execution,
    not_performed: ["performance_history_reset", "signal_delete", "scanner_run_delete", "binance_position_close", "binance_order_cancel", "live_trading_enable"],
  };
}

async function updateSettings(supabase: SupabaseClient, patch: Json): Promise<Json> {
  const allowed = ["auto_execute_testnet", "capital_basis", "testnet_capital_override_usdt", "max_capital_used_usdt", "testnet_risk_a", "testnet_risk_a_plus", "max_testnet_risk_pct", "testnet_leverage_a", "testnet_leverage_a_plus", "testnet_max_leverage", "max_open_testnet_positions", "max_total_open_risk_pct", "one_active_execution_per_symbol", "kill_switch_enabled", "execution_mode", "testnet_enabled", "governor_enabled", "daily_start_equity", "max_daily_loss_pct", "max_unrealized_drawdown_pct", "aggressive_allowed_profit_pct", "defensive_loss_pct", "max_consecutive_failed_executions", "max_consecutive_closed_sl"];
  const update: Json = { updated_at: new Date().toISOString() };
  for (const key of allowed) if (key in patch) update[key] = patch[key];
  update.live_trading_enabled = false;
  const { data, error } = await supabase.from("execution_settings").update(update).eq("id", 1).select("*").single();
  if (error) throw new Error(error.message);
  return { success: true, settings: data as Json };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    await requireAdminOrInternal(req, supabase);
    const body = await req.json().catch(() => ({})) as { action?: Action; signal_id?: string; symbol?: string; execution_id?: string; manual?: boolean; settings?: Json };
    const action = body.action ?? "status";
    let payload: Json;
    if (action === "status") payload = await statusPayload(supabase);
    else if (action === "test_connection") { assertLiveTradingImpossible(); payload = { success: true, account: await binanceRequest("GET", "/fapi/v2/account", {}, true), base_url: safeBaseUrl() }; }
    else if (action === "validate_symbol") payload = { success: true, rules: await getRules(body.symbol ?? "BTCUSDT") };
    else if (action === "positions") { assertLiveTradingImpossible(); payload = { success: true, positions: await binanceRequest("GET", "/fapi/v2/positionRisk", {}, true) }; }
    else if (action === "cancel_orders") { assertLiveTradingImpossible(); payload = { success: true, result: await binanceRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol: body.symbol ?? "BTCUSDT" }, true), algo_result: await binanceRequest("DELETE", "/fapi/v1/algoOpenOrders", { symbol: body.symbol ?? "BTCUSDT" }, true).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })) }; }
    else if (action === "close_position") {
      assertLiveTradingImpossible();
      const sym = body.symbol ?? "BTCUSDT";
      const pos = await getPosition(String(sym));
      const amt = Number(pos?.positionAmt ?? 0);
      if (!Number.isFinite(amt) || Math.abs(amt) <= 0) payload = { success: true, skipped: true, reason: "no_open_position", symbol: sym };
      else payload = { success: true, result: await binanceRequest("POST", "/fapi/v1/order", { symbol: String(sym), side: amt > 0 ? "SELL" : "BUY", type: "MARKET", quantity: Math.abs(amt), reduceOnly: true }, true) };
    }
    else if (action === "dry_run") {
      const validated = await validateSelectedSignal(supabase, body.signal_id);
      if (!isSignalRow(validated)) payload = validated;
      else {
        const settings = await getSettings(supabase);
        const governor = await evaluateGovernor(supabase, settings);
        payload = governor.blocks_execution ? governorPausedPayload(governor, settings) : { success: true, plan: buildPlan(validated, await getRules(validated.symbol), await capitalSnapshot(settings), settings, governor) };
      }
    }
    else if (action === "execute_signal") {
      const validated = await validateSelectedSignal(supabase, body.signal_id);
      if (!isSignalRow(validated)) payload = validated;
      else {
        const settings = await getSettings(supabase);
        const governor = await evaluateGovernor(supabase, settings);
        payload = governor.blocks_execution ? governorPausedPayload(governor, settings) : await executeSignal(supabase, validated.id, Boolean(body.manual));
      }
    }
    else if (action === "clean_stale_execution_rows") payload = await cleanStaleRowsForSymbols(supabase, body.symbol ? [body.symbol] : undefined);
    else if (action === "manual_test_flow") payload = await manualTestFlow(supabase, cleanSignalId(body.signal_id));
    else if (action === "sync_execution") payload = await syncExecution(supabase, body.execution_id ?? "");
    else if (action === "refresh_account_state") { assertLiveTradingImpossible(); const settings = await getSettings(supabase); const account_state = await fetchAccountState(); await storeAccountState(supabase, settings, account_state); payload = { success: true, account_state }; }
    else if (action === "evaluate_governor") { assertLiveTradingImpossible(); const settings = await getSettings(supabase); const account_state = await fetchAccountState().catch(() => null); const governor = await evaluateGovernor(supabase, settings, account_state ?? undefined); payload = { success: true, account_state, governor, execution_allowed: !governor.blocks_execution }; }
    else if (action === "reset_testnet_governor") payload = await resetTestnetGovernor(supabase);
    else if (action === "update_settings") payload = await updateSettings(supabase, body.settings ?? {});
    else payload = { success: false, error: "Unsupported action" };
    return new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }), { status: e instanceof Error && e.message.includes("Unauthorized") ? 401 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
