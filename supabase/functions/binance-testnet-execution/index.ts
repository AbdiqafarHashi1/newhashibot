import {currentAccountAdoptionTruth} from '../_shared/account-adoption-truth.ts';
import {loadConfirmedEntry} from '../_shared/confirmed-entry.ts';
import {pinnedClaimFromQualifiedSet,routeProductionEligibility} from '../_shared/trading-domain/production-eligibility-router.ts';
import {applyBinanceCertifiedConfiguration} from '../_shared/binance-certified-configuration.ts';
import {applyBybitCertifiedConfiguration} from '../_shared/bybit-certified-configuration.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { routeTelegramEvent } from "../_shared/telegram-router.ts";
import { authorizeInternalOrAdmin } from "../_shared/internal-auth.ts";
import { persistTradeManagementTruthByIdentity, persistTradeManagementTruth as upsertTradeManagementTruth, persistTradeManagementTruthRow as upsertTradeManagementTruthRow } from "../_shared/trade-truth/index.ts";
import { edgeScopeKey, currentEdgeOwnership, currentEdgeProviderCredential, enumerateExecutionAccounts, OperatorCredentialResolutionError, ownershipFields, resolveEdgeProviderCredential, resolveOperatorProviderCredential, runtimeOwnershipFields, withEdgeProviderCredential } from "../_shared/execution-ownership.ts";
import { deepFreeze, stableFingerprint, type DeepReadonly } from "../_shared/strategy-plan.ts";
import { assertCertifiedExecutionInput } from "../_shared/certified-runtime.ts";
import type { ExecutionPlan } from "../_shared/professional-execution-planning.ts";
import { adoptExecutionPlan, type AdoptionTruth, type AtomicExecutionClaimStore, type AppendOnlyExecutionEventStore, type ClaimRequest, type AtomicClaimResult, type ExecutionAdoptionPolicy, type ExecutionEvent } from "../_shared/professional-execution-adoption.ts";
import { BinanceTestnetAdoptionAdapter, BybitDemoAdoptionAdapter, Mt5PersonalDemoAdoptionAdapter, Mt5PropDemoAdoptionAdapter, type ExactProviderTransport } from "../_shared/professional-execution-adapters.ts";
import { decideAccountExecution, type AccountRuntimeControl } from "../_shared/account-execution-controller.ts";
import type { EligibilityDecision } from "../_shared/trading-domain/production-eligibility-router.ts";
import { resolveMt5TerminalRoute } from "../_shared/mt5-account-routing.ts";
import { createMt5EntryCommand, type PhaseDExecutionLineage } from "../_shared/mt5-phase-e-execution.ts";
import { createCryptoSubmissionEnvelope, type CryptoPhaseDLineage } from "../_shared/crypto-phase-f-execution.ts";
import {canonicalLifecycleType,enqueueCanonicalLifecycle,lifecycleAudience} from "../_shared/canonical-lifecycle-publication.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-scanner-cron-secret, x-hashibot-cron-token, x-hashibot-internal-secret, x-hashibot-correlation-id, x-hashibot-action-id, Idempotency-Key",
};

const TESTNET_BASE_URL = "https://demo-fapi.binance.com";
const ACTIVE_STATUSES = ["pending", "pending_submit", "entry_submitted", "entry_filled", "protected", "protected_native", "partially_closed", "pending_protection", "protection_pending", "protection_failed", "protection_recovered", "protected_managed", "pending_managed_protection"];
const RETRYABLE_STATUSES = ["skipped", "failed", "cancelled", "stale_closed", "closed_tp", "closed_tp2", "closed_profit_lock", "closed_sl", "closed_breakeven", "closed_timeout", "closed_expired", "closed_expired_after_tp1", "closed_manual"];
const TERMINAL_STATUSES = ["closed_tp", "closed_tp2", "closed_profit_lock", "closed_sl", "closed_breakeven", "closed_timeout", "closed_expired", "closed_expired_after_tp1", "closed_manual", "cancelled", "failed", "skipped", "stale_closed"];

type Action = "adopt_execution_plan" | "status" | "run_trade_supervisor_cycle" | "sync_all_positions_now" | "repair_all_protection_now" | "run_profit_lock_now" | "close_unprotected_position" | "prove_binance_trade_management" | "prove_bybit_trade_management" | "run_full_trade_management_proof" | "sync_binance_tradable_symbols" | "sync_bybit_tradable_symbols" | "show_executable_universe" | "place_tiny_binance_test_order" | "place_tiny_bybit_test_order" | "cancel_test_orders" | "run_binance_monitor_now" | "run_bybit_monitor_now" | "execute_latest_binance_supported_signal" | "execute_latest_bybit_supported_signal" | "execute_latest_mirror_supported_signal" | "execution_readiness" | "parallel_dry_run" | "diagnose_bybit_testnet_connection" | "diagnose_margin_fallback" | "test_connection" | "validate_symbol" | "dry_run" | "execute_signal" | "execute_latest_approved_signal" | "positions" | "cancel_orders" | "close_position" | "sync_execution" | "update_settings" | "refresh_account_state" | "evaluate_governor" | "reset_testnet_governor" | "clean_stale_execution_rows" | "manual_test_flow";
type Json = Record<string, unknown>;
type Side = "BUY" | "SELL";
type CapitalBasis = "available_usdt" | "available_usdc_plus_usdt" | "total_margin_balance" | "total_wallet_balance" | "manual_override";
type BracketMode = "exchange_native" | "managed_exit_fallback" | "failed";
type ProtectionStatus = "protected" | "protected_native" | "pending_protection" | "protection_pending" | "protection_failed" | "protection_recovered" | "protected_managed" | "pending_managed_protection" | "unprotected_failed";
type GovernorState = "normal" | "defensive" | "aggressive_allowed" | "paused";
type TestnetGovernorMode = "normal" | "readonly" | "off_for_testing";
type ExecutionFailureCode = "margin_type_change_blocked" | "leverage_change_blocked" | "leverage_change_failed" | "symbol_configuration_mismatch" | "insufficient_margin" | "execution_api_error";
type SymbolFailureReason = "EXCHANGE_MAX_QTY_EXCEEDED" | "MIN_NOTIONAL_NOT_MET" | "INVALID_TRIGGER_DIRECTION" | "UNSUPPORTED_CONDITIONAL_ORDER" | "PROTECTION_VERIFICATION_FAILED" | "PRECISION_RULE_VIOLATION" | "STALE_ORDER_LOOP" | "REPEATED_REPAIR_FAILURE" | "EXCHANGE_REJECT" | "UNKNOWN_PROVIDER_FAILURE";

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
  confidence_score?: number | null;
  risk_profile_snapshot?: Record<string, unknown> | null;
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
  testnet_governor_mode: TestnetGovernorMode;
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
  bot_paused: boolean;
  bot_paused_reason: string | null;
  stress_override_enabled: boolean;
  stress_risk_pct: number;
  stress_leverage: number;
  stress_ignore_open_risk_limit: boolean;
  enable_usdc_margin_backup?: boolean | null;
  prefer_margin_asset?: string | null;
  allow_margin_assets?: string | null;
  max_retry_assets?: number | null;
}

type MarginAsset = "USDT" | "USDC";
type MarginFallbackReason = "sufficient_usdt_margin" | "insufficient_usdt_margin" | "usdc_backup_used" | "usdc_market_unavailable" | "insufficient_total_margin" | "symbol_not_supported_for_usdc" | "exchange_rejected" | "usdc_backup_disabled";

interface MarginSelection {
  placeOrder: boolean;
  selectedMarginAsset: MarginAsset | null;
  selectedSymbol: string | null;
  backupAttempted: boolean;
  backupAssetUsed: MarginAsset | null;
  reasons: MarginFallbackReason[];
  retryDecision: "none" | "try_usdc_once" | "do_not_retry";
  finalStatus: "ready" | "blocked";
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
  execution_allowed: boolean;
  testnet_governor_mode: TestnetGovernorMode;
}


interface SymbolRules {
  symbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
  maxQty?: number;
}

interface ProviderSymbolRow { provider: string; symbol: string; base?: string; quote?: string; status: string; tick_size?: number; step_size?: number; min_qty?: number; min_notional?: number; last_synced_at: string; raw?: Json; }

function filterValue(filters: Array<Record<string, unknown>>, type: string, key: string, fallback = 0): number {
  const row = filters.find((f) => String(f.filterType) === type);
  const n = Number(row?.[key] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

async function upsertProviderSymbols(supabase: SupabaseClient, rows: ProviderSymbolRow[]): Promise<void> {
  if (!rows.length) return;
  await supabase.from("provider_symbol_cache").upsert(rows.map((r) => ({
    provider: r.provider, environment: r.provider === "bybit" ? bybitExecutionEnvironment() : "testnet", symbol: r.symbol, provider_symbol: r.symbol, symbol_base: r.base ?? String(r.symbol).replace(/(USDT|USDC)$/i, ""), base_asset: r.base ?? null, quote_asset: r.quote ?? null, settle_asset: r.quote ?? "USDT", contract_type: "linear_perpetual", status: r.status,
    tick_size: r.tick_size ?? null, step_size: r.step_size ?? null, qty_step: r.step_size ?? null, min_qty: r.min_qty ?? null, min_notional: r.min_notional ?? null,
    last_synced_at: r.last_synced_at, raw_exchange_info: r.raw ?? {}, updated_at: r.last_synced_at,
  })), { onConflict: "provider,symbol" });
}

async function syncBinanceTradableSymbols(supabase: SupabaseClient): Promise<Json> {
  const data = await binanceRequest<{ symbols: Array<{ symbol: string; status: string; baseAsset?: string; quoteAsset?: string; pricePrecision: number; quantityPrecision: number; filters: Array<Record<string, unknown>> }> }>("GET", "/fapi/v1/exchangeInfo");
  const now = new Date().toISOString();
  const rows = data.symbols.filter((s) => s.status === "TRADING" && String(s.quoteAsset ?? "") === "USDT").map((s) => ({
    provider: "binance", symbol: s.symbol.toUpperCase(), base: s.baseAsset, quote: s.quoteAsset, status: s.status,
    tick_size: filterValue(s.filters, "PRICE_FILTER", "tickSize", 0.01), step_size: filterValue(s.filters, "LOT_SIZE", "stepSize", 0.001),
    min_qty: filterValue(s.filters, "LOT_SIZE", "minQty", 0.001), min_notional: filterValue(s.filters, "MIN_NOTIONAL", "notional", filterValue(s.filters, "NOTIONAL", "minNotional", 5)), last_synced_at: now, raw: s as unknown as Json,
  }));
  await upsertProviderSymbols(supabase, rows);
  return { success: true, provider: "binance", environment: "testnet", tradable_count: rows.length, symbols: rows.map((r) => r.symbol), last_synced_at: now };
}

async function syncBybitTradableSymbols(supabase: SupabaseClient): Promise<Json> {
  const data = await bybitRequest<{ list?: Array<Record<string, unknown>> }>("GET", "/v5/market/instruments-info", { category: "linear", settleCoin: "USDT" });
  const now = new Date().toISOString();
  const rows = (data.list ?? []).filter((s) => String(s.status) === "Trading" && (String(s.quoteCoin) === "USDT" || String(s.settleCoin) === "USDT")).map((s) => {
    const lot = (s.lotSizeFilter ?? {}) as Record<string, unknown>; const price = (s.priceFilter ?? {}) as Record<string, unknown>;
    return { provider: "bybit", symbol: String(s.symbol).toUpperCase(), base: String(s.baseCoin ?? ""), quote: String(s.quoteCoin ?? s.settleCoin ?? "USDT"), status: String(s.status), tick_size: Number(price.tickSize ?? 0), step_size: Number(lot.qtyStep ?? 0), min_qty: Number(lot.minOrderQty ?? 0), min_notional: Number(lot.minNotionalValue ?? 0), last_synced_at: now, raw: s as Json };
  });
  await upsertProviderSymbols(supabase, rows);
  return { success: true, provider: "bybit", environment: bybitExecutionEnvironment(), tradable_count: rows.length, symbols: rows.map((r) => r.symbol), last_synced_at: now };
}

async function providerSupportsSymbol(supabase: SupabaseClient, provider: "binance" | "bybit", symbol: string): Promise<boolean> {
  const { data } = await supabase.from("provider_symbol_cache").select("symbol,status,last_synced_at").eq("provider", provider).eq("symbol", symbol.toUpperCase()).maybeSingle();
  if (data && ["TRADING", "Trading"].includes(String((data as Json).status))) return true;
  const synced = provider === "binance" ? await syncBinanceTradableSymbols(supabase).catch(() => null) : await syncBybitTradableSymbols(supabase).catch(() => null);
  return Array.isArray(synced?.symbols) && (synced!.symbols as string[]).includes(symbol.toUpperCase());
}

async function showExecutableUniverse(supabase: SupabaseClient): Promise<Json> {
  const [binance, bybit] = await Promise.all([syncBinanceTradableSymbols(supabase).catch((e) => ({ success:false, error:String(e) })), syncBybitTradableSymbols(supabase).catch((e) => ({ success:false, error:String(e) }))]);
  const b = new Set(((binance as Json).symbols as string[] | undefined) ?? []); const y = new Set(((bybit as Json).symbols as string[] | undefined) ?? []);
  const intersection = [...b].filter((x) => y.has(x)).sort();
  return { success: true, binance_count: b.size, bybit_count: y.size, mirror_count: intersection.length, binance_symbols: [...b].sort(), bybit_symbols: [...y].sort(), mirror_symbols: intersection };
}

async function latestSupportedSignal(supabase: SupabaseClient, provider: "binance" | "bybit" | "mirror"): Promise<SignalRow | null> {
  const { data } = await supabase.from("signals").select("*").eq("market_type", "crypto").in("grade", ["A", "A+"]).order("created_at", { ascending: false }).limit(50);
  for (const row of (data ?? []) as SignalRow[]) {
    const b = provider === "bybit" ? true : await providerSupportsSymbol(supabase, "binance", row.symbol);
    const y = provider === "binance" ? true : await providerSupportsSymbol(supabase, "bybit", row.symbol.replace(/USDC$/i, "USDT"));
    if (b && y) return row;
  }
  return null;
}

interface CapitalSnapshot {
  capital_basis: CapitalBasis;
  raw_total_margin_balance: number;
  raw_total_wallet_balance: number;
  raw_available_usdt: number;
  raw_available_usdc: number;
  raw_available_balance: number;
  equity_used: number;
  selected_capital_used: number;
  max_capital_cap_applied: boolean;
  fallback_used: boolean;
}

interface LeverageSelection {
  leverage: number;
  leverage_source: "signal_guidance" | "grade_default" | "admin_setting" | "capped_to_max" | "testnet_stress_override";
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
  risk_source: string;
  open_risk_guard: string;
  stress_mode: boolean;
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
  originalSymbol?: string;
  marginAssetSelected?: MarginAsset;
  marginFallbackAttempted?: boolean;
  marginFallbackUsed?: boolean;
  marginFallbackReason?: string;
}

function toUsdcEquivalentSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  return upper.endsWith("USDT") ? `${upper.slice(0, -4)}USDC` : upper;
}

function parseAllowedMarginAssets(settings: ExecutionSettings): MarginAsset[] {
  const raw = String(settings.allow_margin_assets ?? "USDT,USDC").toUpperCase().split(",").map((x) => x.trim()).filter(Boolean);
  const assets = raw.filter((x): x is MarginAsset => x === "USDT" || x === "USDC");
  return assets.length ? assets : ["USDT", "USDC"];
}

function selectMarginAssetForExecution(input: { symbol: string; requestedMargin: number; availableUsdt: number; availableUsdc: number; enableUsdcMarginBackup: boolean; allowMarginAssets?: MarginAsset[]; supportedUsdtSymbols: string[]; supportedUsdcSymbols: string[]; maxRetryAssets?: number }): MarginSelection {
  const symbol = input.symbol.toUpperCase();
  const usdcSymbol = toUsdcEquivalentSymbol(symbol);
  const allow = input.allowMarginAssets ?? ["USDT", "USDC"];
  const maxRetryAssets = input.maxRetryAssets ?? 2;
  const usdtSupported = input.supportedUsdtSymbols.map((x) => x.toUpperCase()).includes(symbol);
  const usdcSupported = input.supportedUsdcSymbols.map((x) => x.toUpperCase()).includes(usdcSymbol);
  const reasons: MarginFallbackReason[] = [];
  if (usdtSupported && input.availableUsdt >= input.requestedMargin) return { placeOrder: true, selectedMarginAsset: "USDT", selectedSymbol: symbol, backupAttempted: false, backupAssetUsed: null, reasons: ["sufficient_usdt_margin"], retryDecision: "none", finalStatus: "ready" };
  reasons.push("insufficient_usdt_margin");
  const canTryUsdc = input.enableUsdcMarginBackup && allow.includes("USDC") && maxRetryAssets >= 2;
  if (!canTryUsdc) {
    reasons.push("usdc_backup_disabled");
    if (input.availableUsdt + input.availableUsdc < input.requestedMargin) reasons.push("insufficient_total_margin");
    return { placeOrder: false, selectedMarginAsset: null, selectedSymbol: null, backupAttempted: false, backupAssetUsed: null, reasons, retryDecision: "do_not_retry", finalStatus: "blocked" };
  }
  if (!symbol.endsWith("USDT")) return { placeOrder: false, selectedMarginAsset: null, selectedSymbol: null, backupAttempted: true, backupAssetUsed: null, reasons: [...reasons, "symbol_not_supported_for_usdc"], retryDecision: "do_not_retry", finalStatus: "blocked" };
  if (!usdcSupported) return { placeOrder: false, selectedMarginAsset: null, selectedSymbol: null, backupAttempted: true, backupAssetUsed: null, reasons: [...reasons, "usdc_market_unavailable"], retryDecision: "do_not_retry", finalStatus: "blocked" };
  if (input.availableUsdc >= input.requestedMargin) return { placeOrder: true, selectedMarginAsset: "USDC", selectedSymbol: usdcSymbol, backupAttempted: true, backupAssetUsed: "USDC", reasons: [...reasons, "usdc_backup_used"], retryDecision: "try_usdc_once", finalStatus: "ready" };
  return { placeOrder: false, selectedMarginAsset: null, selectedSymbol: null, backupAttempted: true, backupAssetUsed: null, reasons: [...reasons, "insufficient_total_margin"], retryDecision: "do_not_retry", finalStatus: "blocked" };
}

async function fetchSupportedMarginSymbols(): Promise<{ usdt: string[]; usdc: string[] }> {
  const data = await binanceRequest<{ symbols: Array<{ symbol: string; status: string }> }>("GET", "/fapi/v1/exchangeInfo");
  const trading = data.symbols.filter((x) => x.status === "TRADING").map((x) => x.symbol.toUpperCase());
  return { usdt: trading.filter((x) => x.endsWith("USDT")), usdc: trading.filter((x) => x.endsWith("USDC")) };
}


interface BinanceSymbolTruth {
  symbol: string;
  positionAmt: number;
  openOrders: Json[];
  hasExposure: boolean;
  positionRisk: Json | null;
}

interface SymbolExecutionState extends BinanceSymbolTruth {
  currentMarginType: string | null;
  currentLeverage: number | null;
  conditionalOpenOrders: Json[];
  openOrderCount: number;
  conditionalOpenOrderCount: number;
  openPositionExists: boolean;
  regularOpenOrdersExist: boolean;
  conditionalOpenOrdersExist: boolean;
  anyOpenOrdersExist: boolean;
  hedgeModeEnabled: boolean | null;
  positionSide: string | null;
}

interface SymbolConfigurationResult {
  ok: boolean;
  state: SymbolExecutionState;
  targetMarginType: "ISOLATED";
  targetLeverage: number;
  marginTypeAction: "skipped_already_correct" | "changed" | "reused_existing_due_open_position" | "not_checked";
  leverageAction: "skipped_already_correct" | "changed" | "reused_existing_due_open_position" | "not_checked";
  failure?: { code: ExecutionFailureCode; reason: string; details: Json };
}

function truthHasExposure(truth: BinanceSymbolTruth): boolean {
  return Math.abs(truth.positionAmt) > 0 || truth.openOrders.length > 0;
}

function normalizeMarginType(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "ISOLATED" || normalized === "CROSSED" || normalized === "CROSS") return normalized === "CROSS" ? "CROSSED" : normalized;
  return normalized;
}

function failurePayload(code: ExecutionFailureCode, reason: string, details: Json): { code: ExecutionFailureCode; reason: string; details: Json } {
  return { code, reason, details };
}

async function fetchSymbolExecutionState(symbol: string): Promise<SymbolExecutionState> {
  const [truth, algo, positionMode] = await Promise.all([
    fetchBinanceSymbolTruth(symbol),
    binanceRequest<Json>("GET", "/fapi/v1/openAlgoOrders", { symbol, algoType: "CONDITIONAL" }, true).catch(() => ({ orders: [] })),
    binanceRequest<{ dualSidePosition?: boolean | string }>("GET", "/fapi/v1/positionSide/dual", {}, true).catch(() => null),
  ]);
  const conditionalOpenOrders = Array.isArray(algo) ? algo : Array.isArray((algo as Json).orders) ? (algo as { orders: Json[] }).orders : [];
  const currentLeverage = Number((truth.positionRisk as Json | null)?.leverage);
  const positionSide = String((truth.positionRisk as Json | null)?.positionSide ?? "").trim() || null;
  const hedgeRaw = positionMode?.dualSidePosition;
  const hedgeModeEnabled = hedgeRaw == null ? null : hedgeRaw === true || String(hedgeRaw).toLowerCase() === "true";
  const openPositionExists = Math.abs(truth.positionAmt) > 0;
  const regularOpenOrdersExist = truth.openOrders.length > 0;
  const conditionalOpenOrdersExist = conditionalOpenOrders.length > 0;
  return {
    ...truth,
    currentMarginType: normalizeMarginType((truth.positionRisk as Json | null)?.marginType),
    currentLeverage: Number.isFinite(currentLeverage) && currentLeverage > 0 ? currentLeverage : null,
    conditionalOpenOrders,
    openOrderCount: truth.openOrders.length,
    conditionalOpenOrderCount: conditionalOpenOrders.length,
    openPositionExists,
    regularOpenOrdersExist,
    conditionalOpenOrdersExist,
    anyOpenOrdersExist: regularOpenOrdersExist || conditionalOpenOrdersExist,
    hedgeModeEnabled,
    positionSide,
  };
}

async function configureSymbolForExecution(plan: OrderPlan): Promise<SymbolConfigurationResult> {
  const targetMarginType = "ISOLATED" as const;
  const state = await fetchSymbolExecutionState(plan.symbol);
  const result: SymbolConfigurationResult = {
    ok: true,
    state,
    targetMarginType,
    targetLeverage: plan.leverage,
    marginTypeAction: "not_checked",
    leverageAction: "not_checked",
  };

  if (state.hedgeModeEnabled) {
    result.ok = false;
    result.failure = failurePayload("symbol_configuration_mismatch", "symbol_configuration_mismatch: hedge mode is enabled but HashiBot execution submits one-way reduce-only orders", { state, target_position_mode: "one_way" });
    return result;
  }

  if (state.currentMarginType === targetMarginType) {
    result.marginTypeAction = "skipped_already_correct";
  } else if (state.openPositionExists) {
    result.marginTypeAction = "reused_existing_due_open_position";
  } else if (state.anyOpenOrdersExist) {
    result.ok = false;
    result.failure = failurePayload("margin_type_change_blocked", "margin_type_change_blocked: open_orders_exist", { state, target_margin_type: targetMarginType });
    return result;
  } else {
    await binanceRequest("POST", "/fapi/v1/marginType", { symbol: plan.symbol, marginType: targetMarginType }, true).catch((e) => {
      const message = String(e instanceof Error ? e.message : e);
      if (!message.includes("No need to change margin type")) throw e;
    });
    result.marginTypeAction = "changed";
  }

  if (state.currentLeverage === plan.leverage) {
    result.leverageAction = "skipped_already_correct";
  } else if (state.openPositionExists) {
    result.leverageAction = "reused_existing_due_open_position";
  } else if (state.anyOpenOrdersExist) {
    result.ok = false;
    result.failure = failurePayload("leverage_change_blocked", "leverage_change_blocked: open_orders_exist", { state, target_leverage: plan.leverage });
    return result;
  } else {
    try {
      await binanceRequest("POST", "/fapi/v1/leverage", { symbol: plan.symbol, leverage: plan.leverage }, true);
      result.leverageAction = "changed";
    } catch (e) {
      const message = e instanceof Error ? e.message : "leverage_change_failed";
      result.ok = false;
      result.failure = failurePayload("leverage_change_failed", `leverage_change_failed: ${message}`, { state, target_leverage: plan.leverage });
      return result;
    }
  }

  return result;
}

function classifyExecutionError(error: unknown, fallbackCode: ExecutionFailureCode = "execution_api_error"): { code: ExecutionFailureCode; message: string; details: Json } {
  const message = error instanceof Error ? error.message : String(error ?? "Execution failed");
  if (error instanceof BinanceApiError) {
    if (error.path === "/fapi/v1/marginType") return { code: "margin_type_change_blocked", message, details: { path: error.path, status: error.status, binance_code: error.code, binance_message: error.exchangeMessage } };
    if (error.path === "/fapi/v1/leverage") return { code: "leverage_change_failed", message, details: { path: error.path, status: error.status, binance_code: error.code, binance_message: error.exchangeMessage } };
    if (error.code === -2019 || error.exchangeMessage.toLowerCase().includes("margin")) return { code: "insufficient_margin", message, details: { path: error.path, status: error.status, binance_code: error.code, binance_message: error.exchangeMessage } };
    return { code: fallbackCode, message, details: { path: error.path, status: error.status, binance_code: error.code, binance_message: error.exchangeMessage } };
  }
  return { code: fallbackCode, message, details: {} };
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
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function logBybitAuthDebug(details: { endpoint: string; method: string; timestamp: string; recvWindow: number; preSign: string; signature: string; apiKey: string; query?: string }): void {
  if (!envBool("BYBIT_DEBUG_AUTH", false)) return;
  console.log("Bybit V5 auth debug", {
    endpoint: details.endpoint,
    method: details.method,
    timestamp: details.timestamp,
    recv_window: details.recvWindow,
    pre_sign_string: details.preSign.replace(details.apiKey, "[REDACTED_API_KEY]"),
    signature_length: details.signature.length,
    query_string: details.query ?? "",
    header_names: ["X-BAPI-API-KEY", "X-BAPI-TIMESTAMP", "X-BAPI-RECV-WINDOW", "X-BAPI-SIGN", "X-BAPI-SIGN-TYPE"],
  });
}

class BinanceApiError extends Error {
  path: string;
  status: number;
  code?: number;
  exchangeMessage: string;

  constructor(path: string, status: number, exchangeMessage: string, code?: number) {
    super(`Binance ${path} failed (${status}): ${exchangeMessage}`);
    this.name = "BinanceApiError";
    this.path = path;
    this.status = status;
    this.code = code;
    this.exchangeMessage = exchangeMessage;
  }
}


type BybitEnvironment = "demo" | "testnet" | "live";

function bybitEnvironment(): BybitEnvironment {
  try{return currentEdgeOwnership("bybit").environment as BybitEnvironment}catch{/* Operator diagnostics use their explicit configured default. */}
  const raw = String(Deno.env.get("BYBIT_ENVIRONMENT") || Deno.env.get("BYBIT_MODE") || "testnet").toLowerCase().trim();
  if (raw === "demo" || raw === "bybit_demo") return "demo";
  if (raw === "live" || raw === "mainnet" || raw === "bybit_live") return "live";
  return "testnet";
}

function bybitBaseUrl(): string {
  const environment = bybitEnvironment();
  const explicit = Deno.env.get("BYBIT_BASE_URL") || Deno.env.get("BYBIT_TESTNET_BASE_URL") || "";
  const fallback = environment === "demo" ? "https://api-demo.bybit.com" : environment === "live" ? "https://api.bybit.com" : "https://api-testnet.bybit.com";
  const base = (explicit || fallback).replace(/\/$/, "");
  if (environment === "demo" && !base.includes("api-demo.bybit.com")) throw new Error("Bybit Demo Trading requires BYBIT_BASE_URL=https://api-demo.bybit.com or no override");
  if (environment === "testnet" && !base.includes("testnet")) throw new Error("Bybit testnet requires a testnet base URL");
  if (environment === "live" && (base.includes("testnet") || base.includes("api-demo"))) throw new Error("Bybit live requires the mainnet base URL");
  return base;
}


const BYBIT_ORDER_LINK_ID_MAX_LENGTH = 45;
const BYBIT_ORDER_LINK_ID_SHORT_ID_LENGTH = 16;
function sanitizeBybitOrderLinkIdPart(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, BYBIT_ORDER_LINK_ID_SHORT_ID_LENGTH);
}
function createBybitOrderLinkId(sourceId: unknown, purpose: 'entry' | 'close' | 'sl' | 'tp1' | 'tp2', timestamp = Date.now()): string {
  const shortId = sanitizeBybitOrderLinkIdPart(sourceId) || 'na';
  const purposePart = sanitizeBybitOrderLinkIdPart(purpose) || 'ord';
  const timestampPart = Math.max(0, Math.floor(timestamp)).toString(36);
  const orderLinkId = `hb_${shortId}_${purposePart}_${timestampPart}`;
  return orderLinkId.length <= BYBIT_ORDER_LINK_ID_MAX_LENGTH ? orderLinkId : orderLinkId.slice(0, BYBIT_ORDER_LINK_ID_MAX_LENGTH);
}
function bybitExchangeName(): string { return `bybit_usdt_${bybitEnvironment()}`; }
function bybitExecutionEnvironment(): string { return bybitEnvironment() === "live" ? "live" : bybitEnvironment(); }

function bybitCredentials(): { apiKey: string; apiSecret: string; keySource: string; secretSource: string } {
  try {
    const credential = currentEdgeProviderCredential("bybit");
    return { apiKey: credential.apiKey, apiSecret: credential.apiSecret, keySource: "connected_account", secretSource: "connected_account" };
  } catch (error) {
    if (Deno.env.get("HASHIBOT_LOCAL_DEV_CREDENTIAL_FALLBACK") !== "true") throw error;
    return { apiKey: Deno.env.get("BYBIT_TESTNET_API_KEY") ?? "", apiSecret: Deno.env.get("BYBIT_TESTNET_API_SECRET") ?? "", keySource: "local_development", secretSource: "local_development" };
  }
}

async function bybitRequest<T>(method: "GET" | "POST", path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const { apiKey, apiSecret, keySource, secretSource } = bybitCredentials();
  if (!apiKey || !apiSecret) throw new Error(`Bybit API credentials are required for ${bybitEnvironment()} (${keySource}/${secretSource})`);
  const recvWindow = 5000;
  const timestamp = String(Date.now());
  const query = method === "GET" ? stringifyParams(params) : "";
  const body = method === "POST" ? JSON.stringify(params) : "";
  const preSign = `${timestamp}${apiKey}${recvWindow}${method === "GET" ? query : body}`;
  const signature = await hmacSha256Hex(apiSecret, preSign);
  logBybitAuthDebug({ endpoint: path, method, timestamp, recvWindow, preSign, signature, apiKey, query });
  const res = await fetch(`${bybitBaseUrl()}${path}${query ? `?${query}` : ""}`, {
    method,
    headers: { "Content-Type": "application/json", "X-BAPI-API-KEY": apiKey, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": String(recvWindow), "X-BAPI-SIGN": signature, "X-BAPI-SIGN-TYPE": "2" },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({})) as { retCode?: number; retMsg?: string; result?: T };
  console.log("Bybit V5 safe debug", { endpoint: path, params, retCode: data.retCode ?? res.status, retMsg: data.retMsg ?? res.statusText });
  if (!res.ok || data.retCode !== 0) throw new Error(`Bybit ${path} failed: ${data.retCode ?? res.status} ${data.retMsg ?? res.statusText}`);
  return data.result as T;
}

async function diagnoseBybitTestnetConnection(supabase: SupabaseClient): Promise<Json> {
  const missing: string[] = [];
  const creds = bybitCredentials();
  const apiKey = creds.apiKey;
  const apiSecret = creds.apiSecret;
  if (!apiKey) missing.push("BYBIT_API_KEY");
  if (!apiSecret) missing.push("BYBIT_API_SECRET");
  const checks: Json = { api_key_exists: Boolean(apiKey), api_secret_exists: Boolean(apiSecret), api_key_length: apiKey.length, api_secret_length: apiSecret.length, api_key_has_spaces: /\s/.test(apiKey), api_secret_has_spaces: /\s/.test(apiSecret), api_key_has_quotes: /['"]/.test(apiKey), api_secret_has_quotes: /['"]/.test(apiSecret), api_key_has_line_breaks: /[\r\n]/.test(apiKey), api_secret_has_line_breaks: /[\r\n]/.test(apiSecret), bybit_environment: bybitEnvironment(), bybit_demo_enabled: bybitEnvironment() === "demo", source_of_truth: "execution_provider_controls", base_url: bybitBaseUrl(), base_url_environment_match: bybitEnvironment() === "demo" ? bybitBaseUrl().includes("api-demo") : bybitEnvironment() === "testnet" ? bybitBaseUrl().includes("testnet") : bybitBaseUrl() === "https://api.bybit.com", auth_contract: "timestamp + apiKey + recvWindow + queryString", auth_ok: false, root_cause: null, api_key_source: creds.keySource, api_secret_source: creds.secretSource, current_api_key_status: apiKey ? "configured" : "missing", current_provider_status: "unchecked", latest_error_code: null, latest_error_message: null };
  let connected = false;
  let safeForTestOrder = false;
  let errorReason = "";
  let missingPermissions: string[] = [];
  let balancesPayload: unknown[] = [];
  let positionsPayload: unknown[] = [];
  let openOrdersPayload: unknown[] = [];
  try {
    if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
    const [balances, positions, openOrders, instruments] = await Promise.all([
      bybitRequest("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" }),
      bybitRequest("GET", "/v5/position/list", { category: "linear", settleCoin: "USDT" }),
      bybitRequest("GET", "/v5/order/realtime", { category: "linear", settleCoin: "USDT", openOnly: 0 }),
      bybitRequest<{ list?: Array<{ symbol?: string; status?: string }> }>("GET", "/v5/market/instruments-info", { category: "linear" }),
    ]);
    balancesPayload = ((balances as { list?: unknown[] })?.list ?? []) as unknown[];
    positionsPayload = ((positions as { list?: unknown[] })?.list ?? []) as unknown[];
    openOrdersPayload = ((openOrders as { list?: unknown[] })?.list ?? []) as unknown[];
    const supported = new Set((instruments.list ?? []).filter((row) => row.status === "Trading").map((row) => row.symbol));
    Object.assign(checks, { auth: true, auth_ok: true, root_cause: null, balances_fetch: true, positions_fetch: true, open_orders_fetch: true, instruments_fetch: true, balances_ok: true, positions_ok: true, orders_ok: true, instruments_ok: true, account_reachable: true, wallet_reachable: true, linear_instruments_reachable: true, order_creation_allowed: true, current_provider_status: "connected", request_contract: { wallet_balance: { endpoint: "/v5/account/wallet-balance", method: "GET", required_params: ["accountType"], actual_params: { accountType: "UNIFIED" } }, position_list: { endpoint: "/v5/position/list", method: "GET", required_params: ["category", "settleCoin|baseCoin|symbol"], actual_params: { category: "linear", settleCoin: "USDT" } }, order_realtime: { endpoint: "/v5/order/realtime", method: "GET", required_params: ["category", "symbol|settleCoin"], actual_params: { category: "linear", settleCoin: "USDT", openOnly: 0 } } }, symbols: { BTCUSDT: supported.has("BTCUSDT"), ETHUSDT: supported.has("ETHUSDT"), SOLUSDT: supported.has("SOLUSDT") }, balance_payload_present: Boolean(balances), positions_payload_present: Boolean(positions), open_orders_payload_present: Boolean(openOrders), balances_count: Array.isArray((balances as { list?: unknown[] })?.list) ? (balances as { list?: unknown[] }).list?.length ?? 0 : 0, positions_count: Array.isArray((positions as { list?: unknown[] })?.list) ? (positions as { list?: unknown[] }).list?.length ?? 0 : 0, open_orders_count: Array.isArray((openOrders as { list?: unknown[] })?.list) ? (openOrders as { list?: unknown[] }).list?.length ?? 0 : 0 });
    connected = true;
    safeForTestOrder = supported.has("BTCUSDT") && supported.has("ETHUSDT") && supported.has("SOLUSDT");
  } catch (e) {
    errorReason = e instanceof Error ? e.message : String(e);
    const codeMatch = errorReason.match(/(?:failed: )?(\d{4,8})/);
    Object.assign(checks, { auth_ok: false, account_reachable: false, wallet_reachable: false, linear_instruments_reachable: false, order_creation_allowed: false, current_provider_status: /10024/.test(errorReason) ? "restricted" : "disconnected", latest_error_code: codeMatch?.[1] ?? null, latest_error_message: errorReason, root_cause: /10004|sign/i.test(errorReason) ? "G_SECRET_MISMATCH" : /timestamp|10002/i.test(errorReason) ? "D_BAD_TIMESTAMP" : /api key|permission|forbidden|denied/i.test(errorReason) ? "A_BAD_CREDENTIALS" : "UNKNOWN", exact_reason: /10004|sign/i.test(errorReason) ? "Bybit V5 formula, sorted query, recv_window, and headers are correct; 10004 indicates the loaded API secret does not match the key or stale credentials are deployed." : errorReason });
    if (/permission|forbidden|denied|api key/i.test(errorReason)) missingPermissions = ["Bybit read wallet/position/order permission may be missing or key is invalid"];
  }
  await supabase.from("execution_provider_controls").update({ status: connected ? "connected" : /10024/.test(errorReason) ? "restricted" : "disconnected", last_status_at: new Date().toISOString(), last_error: errorReason || null, metadata: { bybit_health: { connected, safe_for_test_order: safeForTestOrder, missing_permissions: missingPermissions, error_reason: errorReason, checks } }, updated_at: new Date().toISOString() }).eq("provider_name", "bybit");
  return { success: connected, connected, environment: bybitEnvironment(), base_url: bybitBaseUrl(), api_key_source: creds.keySource, api_secret_source: creds.secretSource, latest_error_code: checks.latest_error_code ?? null, latest_error_message: checks.latest_error_message ?? null, current_api_key_status: checks.current_api_key_status, current_provider_status: checks.current_provider_status, account_reachable: checks.account_reachable === true, wallet_reachable: checks.wallet_reachable === true, linear_instruments_reachable: checks.linear_instruments_reachable === true, order_creation_allowed: checks.order_creation_allowed === true, auth_ok: checks.auth_ok === true, balances_ok: checks.balances_ok === true, positions_ok: checks.positions_ok === true, orders_ok: checks.orders_ok === true, safe_for_test_order: safeForTestOrder, missing_permissions: missingPermissions, error_reason: errorReason || null, checks, balances: balancesPayload, positions: positionsPayload, open_orders: openOrdersPayload };
}

async function binanceRequest<T>(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string | number | boolean> = {}, signed = false): Promise<T> {
  let apiKey = "";
  let apiSecret = "";
  if (signed) {
    try { ({ apiKey, apiSecret } = currentEdgeProviderCredential("binance")); }
    catch (error) {
      if (Deno.env.get("HASHIBOT_LOCAL_DEV_CREDENTIAL_FALLBACK") !== "true") throw error;
      apiKey = Deno.env.get("BINANCE_TESTNET_API_KEY") ?? "";
      apiSecret = Deno.env.get("BINANCE_TESTNET_API_SECRET") ?? "";
    }
  }
  const baseUrl = safeBaseUrl();
  if (signed && (!apiKey || !apiSecret)) throw new Error("Binance testnet API key/secret not configured");
  const allParams: Record<string, string | number | boolean> = signed ? { ...params, timestamp: Date.now(), recvWindow: 5000 } : { ...params };
  let qs = stringifyParams(allParams);
  if (signed) qs += `&signature=${await hmacSha256Hex(apiSecret, qs)}`;
  const url = `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { method, headers: apiKey ? { "X-MBX-APIKEY": apiKey } : undefined, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({})) as T & { msg?: string; code?: number };
  if (!res.ok) throw new BinanceApiError(path, res.status, data.msg ?? res.statusText, data.code);
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

function stressModeActive(settings: ExecutionSettings): boolean {
  return settings.execution_mode === "testnet" && settings.stress_override_enabled === true;
}

function stressOpenRiskIgnored(settings: ExecutionSettings): boolean {
  return stressModeActive(settings) && settings.stress_ignore_open_risk_limit === true;
}

function riskPctForSignal(signal: SignalRow, settings: ExecutionSettings, governor?: GovernorDecision): number {
  if (stressModeActive(settings)) return Math.max(0, Math.min(2, Number(settings.stress_risk_pct ?? 2)));
  const grade = String(signal.grade ?? "").toUpperCase();
  const governorState = governor?.state ?? "normal";
  const gradeRisk = governorState === "aggressive_allowed"
    ? (grade === "A+" ? Number(settings.testnet_risk_a_plus ?? 2) : Number(settings.testnet_risk_a ?? 2))
    : (grade === "A+" ? Number(settings.testnet_risk_a_plus ?? 2) : Number(settings.testnet_risk_a ?? 2));
  const recommended = Number(signal.recommended_risk_pct);
  const selected = Number.isFinite(recommended) && recommended > 0 ? Math.min(recommended, gradeRisk) : gradeRisk;
  const multiplied = selected * Number(governor?.risk_multiplier ?? 1);
  return Math.min(multiplied, Number(settings.max_testnet_risk_pct ?? 2), 2);
}

function leverageForSignal(signal: SignalRow, settings: ExecutionSettings, governor?: GovernorDecision): LeverageSelection {
  if (stressModeActive(settings)) {
    const leverage = Math.max(1, Math.min(10, Math.floor(Number(settings.stress_leverage ?? 10))));
    return { leverage, leverage_source: "testnet_stress_override", requested: leverage, max: leverage };
  }
  const grade = String(signal.grade ?? "").toUpperCase();
  const gradeDefault = grade === "A+" ? Number(settings.testnet_leverage_a_plus ?? 5) : Number(settings.testnet_leverage_a ?? 3);
  const governorMax = Number(governor?.adjusted_max_leverage ?? settings.testnet_max_leverage ?? 10);
  const hardMax = Math.min(Number(settings.testnet_max_leverage ?? 10), governorMax, 10);
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
  return { capital_basis: settings.capital_basis ?? "available_usdt", raw_total_margin_balance: 0, raw_total_wallet_balance: 0, raw_available_usdt: 0, raw_available_usdc: 0, raw_available_balance: 0, equity_used: 0, selected_capital_used: 0, max_capital_cap_applied: false, fallback_used: false };
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
    adjusted_max_leverage: state === "defensive" ? Math.min(Number(settings.testnet_max_leverage ?? 10), 3) : Math.min(Number(settings.testnet_max_leverage ?? 10), 10),
    adjusted_max_open_positions: state === "defensive" ? 1 : Number(settings.max_open_testnet_positions ?? 3),
    daily_pnl_pct: dailyPnlPct,
    unrealized_pnl: unrealizedPnl,
    current_equity: Number.isFinite(equity) ? equity : null,
    blocks_execution: (settings.testnet_governor_mode ?? "normal") === "normal" && state === "paused",
    execution_allowed: !((settings.testnet_governor_mode ?? "normal") === "normal" && state === "paused"),
    testnet_governor_mode: settings.testnet_governor_mode ?? "normal",
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
      raw_available_balance: account.availableBalance || account.availableUsdt + account.availableUsdc,
    };
  } catch {
    snapshot.fallback_used = true;
  }

  let selected = 0;
  if (settings.capital_basis === "manual_override") selected = Number(settings.testnet_capital_override_usdt ?? 0);
  else selected = snapshot.raw_total_margin_balance || snapshot.raw_total_wallet_balance;
  if (!Number.isFinite(selected) || selected <= 0) {
    selected = Number(settings.fallback_account_balance ?? 10000);
    snapshot.fallback_used = true;
  }
  snapshot.equity_used = selected;
  const cap = Number(settings.max_capital_used_usdt);
  snapshot.max_capital_cap_applied = Number.isFinite(cap) && cap > 0 && selected > cap;
  snapshot.selected_capital_used = snapshot.max_capital_cap_applied ? cap : selected;
  return snapshot;
}

function buildPlan(signal: SignalRow, rules: SymbolRules, capital: CapitalSnapshot, settings: ExecutionSettings, governor?: GovernorDecision): OrderPlan {
  const decision = governor ?? { state: "normal", reason: "governor_not_evaluated", risk_multiplier: 1, adjusted_max_leverage: Math.min(Number(settings.testnet_max_leverage ?? 10), 10), adjusted_max_open_positions: Number(settings.max_open_testnet_positions ?? 3), daily_pnl_pct: null, unrealized_pnl: null, current_equity: null, blocks_execution: false, execution_allowed: true, testnet_governor_mode: settings.testnet_governor_mode ?? "normal" };
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
  const availableMargin = capital.raw_available_balance > 0 ? capital.raw_available_balance : capital.raw_available_usdt + capital.raw_available_usdc;
  const marginCapacity = availableMargin > 0 ? Math.min(capital.selected_capital_used, availableMargin) : capital.selected_capital_used;
  const maxLeveredQty = (marginCapacity * lev.leverage) / entry;
  const quantity = floorToStep(Math.min(rawQty, maxLeveredQty), rules.stepSize, rules.quantityPrecision);
  const tp1Quantity = floorToStep(quantity * 0.5, rules.stepSize, rules.quantityPrecision);
  const tp2Quantity = floorToStep(quantity - tp1Quantity, rules.stepSize, rules.quantityPrecision);
  const notional = quantity * entry;
  const adjustments: string[] = [];
  if (rawQty > maxLeveredQty) adjustments.push("Quantity capped by leverage and available margin capacity after risk sizing");
  if (tp1Quantity + tp2Quantity < quantity) adjustments.push("TP quantities rounded below full position size to respect step size");
  if (lev.leverage_source === "capped_to_max") adjustments.push(`Leverage capped to ${lev.leverage}x`);
  if (stressModeActive(settings)) adjustments.push("Testnet stress override applied: risk/leverage ignore signal, grade, arbitration, confidence, and dynamic leverage sizing");
  if (stressOpenRiskIgnored(settings)) adjustments.push("Open-risk portfolio cap ignored for testnet stress mode; execution safety checks remain active");
  if (decision.state === "defensive") adjustments.push("Risk governor defensive mode applied: 0.5x risk, max 3x leverage, max 1 open position");
  if (decision.state === "aggressive_allowed") adjustments.push("Risk governor aggressive_allowed mode applied: testnet risk remains capped by admin setting/max cap; hard cap still enforced");
  if (quantity < rules.minQty) throw new Error(`skipped_invalid_sizing: Calculated quantity ${quantity} below minQty ${rules.minQty}`);
  if (notional < rules.minNotional) throw new Error(`skipped_invalid_sizing: Calculated notional ${notional.toFixed(2)} below minNotional ${rules.minNotional}`);
  if (tp1Quantity <= 0 || tp2Quantity <= 0) throw new Error("skipped_invalid_sizing: TP split invalid after precision rounding");
  return {
    signalId: signal.id, symbol: signal.symbol, side: isBuy ? "long" : "short", entrySide: isBuy ? "BUY" : "SELL", closeSide: isBuy ? "SELL" : "BUY",
    entryPrice: entry, stopLoss, tp1, tp2, leverage: lev.leverage, leverage_source: lev.leverage_source, risk_source: stressModeActive(settings) ? "testnet_stress_override" : "normal_arbitrated_grade_signal_sizing", open_risk_guard: stressOpenRiskIgnored(settings) ? "IGNORED_FOR_STRESS_TEST" : "ACTIVE", stress_mode: stressModeActive(settings), riskPct, riskAmount, stopDistance,
    stopDistancePct: stopDistance / entry, capital, quantity, tp1Quantity, tp2Quantity, notional, marginRequired: notional / lev.leverage, rules, adjustments,
    governor_state: decision.state, governor_reason: decision.reason, risk_multiplier: decision.risk_multiplier, adjusted_risk_pct: riskPct, adjusted_max_leverage: decision.adjusted_max_leverage,
  };
}

interface ProviderRuntimeControl {
  provider_name: string;
  enabled: boolean;
  entry_enabled?: boolean | null;
  monitor_enabled: boolean;
  protection_recovery_enabled: boolean;
  recovery_enabled?: boolean | null;
  provider_kill_switch: boolean;
  kill_switch?: boolean | null;
  read_only: boolean;
  status: string;
  last_error?: string | null;
}


function setupBlocker(provider: string, blocker: string, detail: string, extra: Json = {}): Json {
  return { provider, success: false, blocker, detail, ...extra };
}

function isMissingRowError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  return code === "PGRST116";
}

function insertFailureDetail(error: unknown, table: string): string {
  const msg = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error ?? "returned data=null");
  return `${table} insert failed: ${msg}`;
}

async function insertExecutionOrderRow(supabase: SupabaseClient, row: Json, provider: "binance" | "bybit"): Promise<{ id: string; existing?: boolean; status?: string } | { error: Json }> {
  const ownership = currentEdgeOwnership(provider);
  const ownedRow = { ...row, ...ownershipFields(ownership) };
  const { data, error } = await supabase.from("execution_orders").insert(ownedRow).select("id,status").maybeSingle();
  if (error || !data?.id) {
    const code = String((error as { code?: unknown } | null)?.code ?? "");
    if (code === "23505" && row.signal_id && row.exchange && row.environment) {
      const existing = await supabase.from("execution_orders").select("id,status").eq("execution_scope_key", ownership.execution_scope_key).eq("signal_id", String(row.signal_id)).eq("exchange", String(row.exchange)).eq("environment", String(row.environment)).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!existing.error && existing.data?.id) return { id: String(existing.data.id), existing: true, status: String((existing.data as Json).status ?? "") };
    }
    return { error: setupBlocker(provider, "execution_order_insert_failed", insertFailureDetail(error, "execution_orders"), { table: "execution_orders", signal_id: row.signal_id ?? null, symbol: row.symbol ?? null }) };
  }
  return { id: String(data.id), status: String((data as Json).status ?? row.status ?? "") };
}

function existingExecutionResponse(provider: "binance" | "bybit", inserted: { id: string; existing?: boolean; status?: string }, extra: Json = {}): Json | null {
  if (!inserted.existing) return null;
  return { provider, success: false, skipped: true, reason: "existing_execution_order", submitted_order: false, duplicate_order_prevented: true, execution_id: inserted.id, status: inserted.status ?? null, ...extra };
}

async function getProviderControl(supabase: SupabaseClient, providerName: "binance" | "bybit"): Promise<ProviderRuntimeControl> {
  const { data, error } = await supabase.from("execution_provider_controls").select("*").eq("provider_name", providerName).maybeSingle();
  if (error || !data) {
    const blocker = providerName === "binance" ? "missing_provider_control_binance" : "missing_provider_control_bybit";
    throw new Error(`${blocker}: execution_provider_controls provider_name=${providerName} not found${error && !isMissingRowError(error) ? ` (${error.message})` : ""}`);
  }
  const row = data as Json;
  return {
    provider_name: providerName,
    enabled: row.enabled === true,
    entry_enabled: typeof row.entry_enabled === "boolean" ? row.entry_enabled : row.enabled === true,
    monitor_enabled: row.monitor_enabled === true,
    protection_recovery_enabled: row.protection_recovery_enabled === true,
    recovery_enabled: row.recovery_enabled === true || row.protection_recovery_enabled === true,
    provider_kill_switch: row.provider_kill_switch === true || row.kill_switch === true,
    kill_switch: row.kill_switch === true || row.provider_kill_switch === true,
    read_only: row.read_only === true,
    status: String(row.status ?? "disconnected"),
    last_error: typeof row.last_error === "string" ? row.last_error : null,
  };
}

function providerEntryBlocked(provider: ProviderRuntimeControl): string | null {
  if (!provider.enabled) return "provider_disabled";
  if (provider.entry_enabled !== true) return "provider_entry_disabled";
  if (provider.provider_kill_switch || provider.kill_switch) return "provider_kill_switch";
  if (provider.read_only) return "provider_read_only";
  if (provider.status !== "connected") return `provider_${provider.status}`;
  return null;
}

function bybitExecutionAllowedEnvironment(): boolean {
  // X-P contract: Bybit testnet and Demo Trading are execution-safe; live remains impossible.
  return bybitEnvironment() === "testnet" || bybitEnvironment() === "demo";
}

function classifySymbolFailure(error: unknown): SymbolFailureReason {
  const text = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
  if (text.includes("max") && text.includes("qty")) return "EXCHANGE_MAX_QTY_EXCEEDED";
  if (text.includes("min_notional") || text.includes("notional")) return "MIN_NOTIONAL_NOT_MET";
  if (text.includes("invalid_bybit_trigger_direction") || text.includes("invalid_binance_trigger_direction") || text.includes("trigger direction")) return "INVALID_TRIGGER_DIRECTION";
  if (text.includes("conditional") || text.includes("stoporder") || text.includes("algoorder")) return "UNSUPPORTED_CONDITIONAL_ORDER";
  if (text.includes("protection_verify") || text.includes("verification failed") || text.includes("missing_open_order")) return "PROTECTION_VERIFICATION_FAILED";
  if (text.includes("precision") || text.includes("step") || text.includes("tick") || text.includes("lot_size")) return "PRECISION_RULE_VIOLATION";
  if (text.includes("stale_order_loop")) return "STALE_ORDER_LOOP";
  if (text.includes("repair_failed")) return "REPEATED_REPAIR_FAILURE";
  if (text.includes("reject") || text.includes("retcode") || text.includes("binance_code")) return "EXCHANGE_REJECT";
  return "UNKNOWN_PROVIDER_FAILURE";
}

async function activeQuarantine(supabase: SupabaseClient, providerName: "binance" | "bybit", symbol: string, purpose: "execution" | "repair"): Promise<Json | null> {
  const { data } = await supabase.from("problem_symbol_quarantine")
    .select("*")
    .eq("provider", providerName)
    .eq("symbol", symbol.toUpperCase())
    .eq(purpose === "execution" ? "disabled_for_execution" : "disabled_for_repair", true)
    .gt("cooldown_until", new Date().toISOString())
    .order("last_seen", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Json | null) ?? null;
}

async function recordSymbolFailure(supabase: SupabaseClient, providerName: "binance" | "bybit", symbol: string, reason: SymbolFailureReason, metadata: Json = {}): Promise<Json | null> {
  const { data, error } = await supabase.rpc("record_symbol_failure", { p_provider: providerName, p_symbol: symbol.toUpperCase(), p_reason: reason, p_metadata: metadata });
  if (error) {
    console.warn("record_symbol_failure failed", { providerName, symbol, reason, error: error.message });
    return null;
  }
  return (data as Json | null) ?? null;
}

async function getSettings(supabase: SupabaseClient): Promise<ExecutionSettings> {
  const { data } = await supabase.from("execution_settings").select("*").eq("id", 1).maybeSingle();
  return {
    execution_mode: "signal_only", exchange: "binance_usdm_testnet", testnet_enabled: false, live_trading_enabled: false,
    kill_switch_enabled: false, auto_execute_testnet: false, max_open_testnet_positions: 3, max_open_testnet_positions_allowed_max: 10, max_total_open_risk_pct: 3, one_active_execution_per_symbol: true,
    testnet_enabled_at: null, fallback_account_balance: 10000, capital_basis: "available_usdt", testnet_capital_override_usdt: null,
    max_capital_used_usdt: null, testnet_risk_a: 2, testnet_risk_a_plus: 2, max_testnet_risk_pct: 2,
    testnet_leverage_a: 10, testnet_leverage_a_plus: 10, testnet_max_leverage: 10, governor_enabled: true, testnet_governor_mode: "normal", governor_state: "normal", stress_override_enabled: true, stress_risk_pct: 2.0, stress_leverage: 10, stress_ignore_open_risk_limit: true, enable_usdc_margin_backup: false, prefer_margin_asset: "USDT", allow_margin_assets: "USDT,USDC", max_retry_assets: 2, daily_start_equity: null, current_equity: null, daily_realized_pnl: null, daily_unrealized_pnl: null, daily_pnl_pct: null, max_daily_loss_pct: 2, max_unrealized_drawdown_pct: 1.5, aggressive_allowed_profit_pct: 1.5, defensive_loss_pct: 1, max_consecutive_failed_executions: 3, max_consecutive_closed_sl: 3, last_governor_reason: null, last_governor_checked_at: null, bot_paused: false, bot_paused_reason: null, ...(data ?? {}),
  } as ExecutionSettings;
}

async function requireAdminOrInternal(req: Request, supabase: SupabaseClient): Promise<void> {
  const auth = await authorizeInternalOrAdmin(req, supabase);
  if (!auth.ok) throw new Error(auth.error);
}

async function logEvent(supabase: SupabaseClient, executionId: string, eventType: string, message: string, metadata: Json = {}): Promise<void> {
  const { data: execution } = await supabase
    .from("execution_orders")
    .select("signal_id,symbol")
    .eq("id", executionId)
    .maybeSingle();
  const row = (execution ?? {}) as { signal_id?: string | null; symbol?: string | null };
  const {data:event,error}=await supabase.from("execution_event_logs").insert({
    execution_id: executionId,
    execution_order_id: executionId,
    signal_id: row.signal_id ?? null,
    symbol: row.symbol ?? "",
    event_type: eventType,
    message,
    metadata,
  }).select("id,created_at").single();if(error)throw error;const {data:owned}=await supabase.from("execution_orders").select("customer_id,account_id").eq("id",executionId).maybeSingle();const customerId=String(owned?.customer_id??"")||null,accountId=String(owned?.account_id??"")||null;await enqueueCanonicalLifecycle(supabase,{eventKey:`execution:${executionId}:${eventType}`,eventType:canonicalLifecycleType(eventType),signalId:row.signal_id??null,executionId,customerId,accountId,occurredAt:event.created_at,payload:{...metadata,details:message,symbol:row.symbol,provider:"binance"},destinations:lifecycleAudience({customerId,accountId})});
}

async function sendExecutionTelegram(supabase: SupabaseClient, signalId: string, eventType: string, lines: string[]): Promise<void> {
  const { data: settingsRow } = await supabase.from("execution_settings").select("execution_mode,testnet_governor_mode,governor_state,stress_override_enabled,stress_risk_pct,stress_leverage,stress_ignore_open_risk_limit").eq("id", 1).maybeSingle();
  const { data: latestExecution } = await supabase.from("execution_orders").select("id,customer_id,account_id,risk_pct,risk_source,leverage,leverage_source,lifecycle_state,entry_filled_at,protection_status,runner_active,runner_expired,cleanup_status,open_risk_guard,status").eq("signal_id", signalId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const settings = (settingsRow ?? {}) as Json;
  const execution = (latestExecution ?? {}) as Json;
  const stressActive = String(settings.execution_mode ?? "") === "testnet" && settings.stress_override_enabled === true;
  const governorMode = String(settings.testnet_governor_mode ?? "normal");
  const governorState = governorMode === "off_for_testing" ? "IGNORED" : String(settings.governor_state ?? "normal").toUpperCase();
  const truthLines = [
    "",
    "Execution Truth",
    `Execution Mode: ${settings.execution_mode ?? "unknown"}`,
    `Stress Mode: ${stressActive ? "ON" : "OFF"}`,
    `Risk Used: ${execution.risk_pct ?? (stressActive ? settings.stress_risk_pct : "unknown")}%`,
    `Risk Source: ${execution.risk_source ?? (stressActive ? "testnet_stress_override" : "unknown")}`,
    `Leverage Used: ${execution.leverage ?? (stressActive ? settings.stress_leverage : "unknown")}x`,
    `Leverage Source: ${execution.leverage_source ?? (stressActive ? "testnet_stress_override" : "unknown")}`,
    `Governor Mode: ${governorMode.toUpperCase()}`,
    `Governor State: ${governorState}`,
    `Lifecycle State: ${execution.lifecycle_state ?? execution.status ?? eventType}`,
    `Fill State: ${execution.entry_filled_at ? "ENTRY_FILLED" : execution.status ?? "UNKNOWN"}`,
    `Protection State: ${execution.protection_status ?? "UNKNOWN"}`,
    `Runner State: ${execution.runner_active ? "ACTIVE" : execution.runner_expired ? "EXPIRED" : "INACTIVE"}`,
    `Expiry State: ${execution.runner_expired ? "EXPIRED" : "ACTIVE_OR_NOT_DUE"}`,
    `Cleanup State: ${execution.cleanup_status ?? "PENDING_OR_NOT_REQUIRED"}`,
    `Open Risk Guard: ${execution.open_risk_guard ?? (stressActive && settings.stress_ignore_open_risk_limit === true ? "IGNORED_FOR_STRESS_TEST" : "ACTIVE")}`,
  ];
  const text = ["BINANCE TESTNET — NOT LIVE", "", ...lines, ...truthLines].join("\n");
  const customerId=String(execution.customer_id??"")||null,accountId=String(execution.account_id??"")||null,executionId=String(execution.id??"")||null;await enqueueCanonicalLifecycle(supabase,{eventKey:`execution-report:${executionId??signalId}`,eventType:canonicalLifecycleType(eventType),eventVersion:Math.max(1,["auto_executed","partially_closed","closed_profit_lock","closed_sl","closed_breakeven","closed_tp2"].indexOf(eventType)+1),signalId,executionId,customerId,accountId,payload:{details:text,...execution},destinations:lifecycleAudience({customerId,accountId})});
}

async function getRules(symbol: string): Promise<SymbolRules> {
  const data = await binanceRequest<{ symbols: Array<{ symbol: string; status: string; pricePrecision: number; quantityPrecision: number; baseAsset?: string; quoteAsset?: string; filters: Array<{ filterType: string; tickSize?: string; stepSize?: string; minQty?: string; maxQty?: string; notional?: string; minNotional?: string }> }> }>("GET", "/fapi/v1/exchangeInfo");
  const row = data.symbols.find((s) => s.symbol === symbol && s.status === "TRADING");
  if (!row) throw new Error(`symbol_not_supported: ${symbol} is not valid/trading on Binance USD-M testnet`);
  const lot = row.filters.find((f) => f.filterType === "LOT_SIZE");
  const price = row.filters.find((f) => f.filterType === "PRICE_FILTER");
  const minNotional = row.filters.find((f) => f.filterType === "MIN_NOTIONAL" || f.filterType === "NOTIONAL");
  return { symbol: row.symbol, baseAsset: row.baseAsset, quoteAsset: row.quoteAsset, pricePrecision: row.pricePrecision, quantityPrecision: row.quantityPrecision, tickSize: Number(price?.tickSize ?? 0.01), stepSize: Number(lot?.stepSize ?? 0.001), minQty: Number(lot?.minQty ?? 0.001), maxQty: Number(lot?.maxQty ?? 0), minNotional: Number(minNotional?.notional ?? minNotional?.minNotional ?? 5) };
}

function precisionFromStep(value: number): number {
  const text = String(value);
  return text.includes(".") ? text.replace(/0+$/, "").split(".")[1]?.length ?? 0 : 0;
}

function shortClientAlgoId(label: "sl" | "tp1" | "tp2", source: unknown = crypto.randomUUID()): string {
  const prefix = label === "sl" ? "hbsl" : label === "tp1" ? "hbtp1" : "hbtp2";
  const clean = String(source ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const entropy = (clean || crypto.randomUUID().replace(/-/g, "")).slice(0, 16);
  return `${prefix}_${entropy}`.slice(0, 32);
}

function roundProtectionPrice(price: number, rules: SymbolRules): number {
  return roundToTick(price, rules.tickSize || 0.01, rules.pricePrecision ?? precisionFromStep(rules.tickSize || 0.01));
}

function roundProtectionQty(qty: number, rules: SymbolRules): number {
  return floorToStep(qty, rules.stepSize || 0.001, rules.quantityPrecision ?? precisionFromStep(rules.stepSize || 0.001));
}

function validateProtectionSizing(providerName: "binance" | "bybit", symbol: string, qty: number, triggerPrice: number, rules: SymbolRules): void {
  if (!Number.isFinite(qty) || qty <= 0) throw new Error(`${providerName}_invalid_actual_position_quantity`);
  if (rules.minQty && qty < rules.minQty) throw new Error(`${providerName}_quantity_below_min_qty:${symbol}:${qty}<${rules.minQty}`);
  if (rules.maxQty && rules.maxQty > 0 && qty > rules.maxQty) throw new Error(`${providerName}_quantity_above_max_qty_split_required:${symbol}:${qty}>${rules.maxQty}`);
  if (rules.minNotional && triggerPrice * qty < rules.minNotional) throw new Error(`${providerName}_notional_below_min_notional:${symbol}:${triggerPrice * qty}<${rules.minNotional}`);
}

async function currentBinanceMarkPrice(symbol: string): Promise<number> {
  const data = await binanceRequest<{ markPrice?: string; price?: string }>("GET", "/fapi/v1/premiumIndex", { symbol }, true);
  const mark = Number(data.markPrice ?? data.price ?? 0);
  if (!Number.isFinite(mark) || mark <= 0) throw new Error(`binance_mark_price_unavailable:${symbol}`);
  return mark;
}

async function currentBybitMarkPrice(symbol: string): Promise<number> {
  const data = await bybitRequest<{ list?: Array<Record<string, unknown>> }>("GET", "/v5/market/tickers", { category: "linear", symbol });
  const row = data.list?.[0] ?? {};
  const mark = Number(row.markPrice ?? row.lastPrice ?? 0);
  if (!Number.isFinite(mark) || mark <= 0) throw new Error(`bybit_mark_price_unavailable:${symbol}`);
  return mark;
}

function expectedTriggerDirection(side: unknown, label: "sl" | "tp1" | "tp2", markPrice: number, triggerPrice: number): { valid: boolean; bybitDirection: 1 | 2; expected: "Rising" | "Falling"; actual: "Rising" | "Falling" } {
  const isLong = String(side).toLowerCase() === "long" || String(side).toLowerCase() === "buy";
  const shouldBeAbove = isLong ? label !== "sl" : label === "sl";
  const actualAbove = triggerPrice > markPrice;
  return { valid: shouldBeAbove === actualAbove, bybitDirection: actualAbove ? 1 : 2, expected: shouldBeAbove ? "Rising" : "Falling", actual: actualAbove ? "Rising" : "Falling" };
}

async function getBybitRules(symbol: string): Promise<SymbolRules> {
  const data = await bybitRequest<{ list?: Array<Record<string, unknown>> }>("GET", "/v5/market/instruments-info", { category: "linear", symbol, settleCoin: "USDT" });
  const row = (data.list ?? []).find((item) => String(item.symbol).toUpperCase() === symbol.toUpperCase() && String(item.status) === "Trading");
  if (!row) throw new Error(`symbol_not_supported: ${symbol} is not valid/trading on Bybit linear USDT testnet`);
  const lot = (row.lotSizeFilter ?? {}) as Record<string, unknown>;
  const price = (row.priceFilter ?? {}) as Record<string, unknown>;
  const tickSize = Number(price.tickSize ?? 0.01);
  const stepSize = Number(lot.qtyStep ?? 0.001);
  return {
    symbol: String(row.symbol),
    baseAsset: String(row.baseCoin ?? ""),
    quoteAsset: String(row.quoteCoin ?? row.settleCoin ?? "USDT"),
    pricePrecision: precisionFromStep(tickSize),
    quantityPrecision: precisionFromStep(stepSize),
    tickSize,
    stepSize,
    minQty: Number(lot.minOrderQty ?? stepSize),
    maxQty: Number(lot.maxOrderQty ?? 0),
    minNotional: Number(lot.minNotionalValue ?? 5),
  };
}

function commonExecutionFields(plan: OrderPlan): Json {
  return {
    leverage: plan.leverage, quantity: plan.quantity, volume: plan.quantity, entry_price: plan.entryPrice, stop_loss: plan.stopLoss, tp1: plan.tp1, tp2: plan.tp2,
    capital_basis: plan.capital.capital_basis, raw_total_margin_balance: plan.capital.raw_total_margin_balance, raw_total_wallet_balance: plan.capital.raw_total_wallet_balance,
    raw_available_usdt: plan.capital.raw_available_usdt, raw_available_usdc: plan.capital.raw_available_usdc, raw_available_balance: plan.capital.raw_available_balance, equity_used: plan.capital.equity_used, selected_capital_used: plan.capital.selected_capital_used,
    max_capital_cap_applied: plan.capital.max_capital_cap_applied, risk_pct: plan.riskPct, risk_amount: plan.riskAmount, notional: plan.notional,
    risk_source: plan.risk_source, leverage_source: plan.leverage_source, stress_mode: plan.stress_mode, open_risk_guard: plan.open_risk_guard, governor_state: plan.governor_state, governor_reason: plan.governor_reason, risk_multiplier: plan.risk_multiplier, adjusted_risk_pct: plan.adjusted_risk_pct, adjusted_max_leverage: plan.adjusted_max_leverage,
    original_symbol: plan.originalSymbol ?? plan.symbol, executed_symbol: plan.symbol, selected_margin_asset: plan.marginAssetSelected ?? "USDT", margin_asset_selected: plan.marginAssetSelected ?? "USDT", prefer_margin_asset: "USDT", margin_backup_attempted: plan.marginFallbackAttempted ?? false, margin_backup_asset_used: plan.marginFallbackUsed ? plan.marginAssetSelected : null, margin_fallback_used: plan.marginFallbackUsed ?? false, insufficient_margin_reason: plan.marginFallbackReason ?? "", requested_margin: plan.marginRequired, requested_notional: plan.notional,
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

async function cancelAlgoOrder(symbol: string, algoId?: unknown): Promise<Json> {
  if (!algoId) return { skipped: true };
  return await binanceRequest<Json>("DELETE", "/fapi/v1/algoOrder", { symbol, algoId: String(algoId) }, true);
}

function normalizeAlgoStatus(algo: Json & { algoStatus?: string; status?: string }): string {
  return String(algo.algoStatus ?? algo.status ?? "UNKNOWN").toUpperCase();
}

async function fetchAlgoOrderStatus(symbol: string, algoId?: unknown): Promise<{ status: string; raw?: Json; error?: string } | null> {
  if (!algoId) return null;
  try {
    const algo = await binanceRequest<Json & { algoStatus?: string; status?: string }>("GET", "/fapi/v1/algoOrder", { symbol, algoId: String(algoId) }, true);
    return { status: normalizeAlgoStatus(algo), raw: algo };
  } catch (error) {
    return { status: "UNKNOWN", error: error instanceof Error ? error.message : String(error) };
  }
}

function algoFilled(status: string | undefined): boolean {
  return ["FILLED", "TRIGGERED", "FINISHED"].includes(String(status ?? "").toUpperCase());
}

async function submitProfitLockSl(supabase: SupabaseClient, executionId: string, ex: Json, closeSide: Side, quantity: number, rules: SymbolRules): Promise<{ orderId?: string; raw?: Json; error?: string }> {
  const entry = Number(ex.entry_price);
  const originalSl = Number(ex.original_sl_price ?? ex.intended_sl ?? ex.stop_loss);
  const lock = String(ex.direction).toLowerCase() === "buy" ? entry + Math.abs(entry - originalSl) * 0.3 : entry - Math.abs(entry - originalSl) * 0.3;
  const stopPrice = roundToTick(lock, rules.tickSize, rules.pricePrecision);
  const planLike = { symbol: String(ex.symbol), closeSide } as OrderPlan;
  const qty = floorToStep(quantity, rules.stepSize, rules.quantityPrecision);
  try {
    const be = await submitAlgoExitOrder(planLike, "STOP_MARKET", stopPrice, qty, "sl");
    let oldCancelled = false;
    try {
      await cancelAlgoOrder(String(ex.symbol), ex.sl_algo_id ?? ex.sl_order_id);
      oldCancelled = true;
    } catch {
      oldCancelled = false;
    }
    await supabase.from("execution_orders").update({ sl_order_id: be.algoId, binance_sl_order_id: be.algoId, sl_algo_id: be.algoId, sl_client_algo_id: be.clientAlgoId, breakeven_sl_order_id: be.algoId, replacement_sl_order_id: be.algoId, replacement_sl_algo_id: be.algoId, replacement_sl_verified: true, old_sl_cancelled_after_tp1: oldCancelled, sl_replaced_after_tp1: true, tp1_filled: true, profit_lock_enabled: true, profit_lock_r: 0.3, profit_lock_price: stopPrice, replacement_sl_price: stopPrice, profit_lock_status: "active", profit_lock_sl_active: true, protection_warning_reason: oldCancelled ? "" : "old_sl_cancel_retry_needed", sl_moved_to_be: false, be_stop_level: stopPrice, protection_status: "protected_native", latest_protection_error: "", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "tp1_profit_lock_active", "TP1 filled; SL replaced at +0.3R profit lock for remaining runner", { be, stopPrice, qty });
    return { orderId: be.id, raw: be.raw };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Failed to replace SL with profit lock";
    await supabase.from("execution_orders").update({ tp1_filled: true, sl_moved_to_be: false, be_stop_level: stopPrice, latest_protection_error: error, protection_status: "unprotected_failed", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "profit_lock_sl_failed", error, { stopPrice, qty });
    return { error };
  }
}

function timeStopMinutes(strategyName: unknown, timeframe: unknown): number | null {
  const key = `${String(strategyName ?? "").toLowerCase()}:${String(timeframe ?? "").toLowerCase()}`;
  if (key === "microscalper:5m") return 120;
  if (key === "microscalper:15m") return 360;
  if (key === "compressionbreakout:15m") return 720;
  if (key === "compressionbreakout:1h") return 48 * 60;
  if (key === "swingcontinuation:15m") return 1440;
  if (key === "swingcontinuation:1h") return 96 * 60;
  return null;
}

function expiryFields(signal: SignalRow): Json {
  const openedAt = new Date().toISOString();
  const maxHoldMinutes = timeStopMinutes(signal.strategy_name, signal.timeframe);
  return {
    opened_at: openedAt,
    max_hold_minutes: maxHoldMinutes,
    expires_at: maxHoldMinutes ? new Date(new Date(openedAt).getTime() + maxHoldMinutes * 60_000).toISOString() : null,
    time_stop_deadline_at: maxHoldMinutes ? new Date(new Date(openedAt).getTime() + maxHoldMinutes * 60_000).toISOString() : null,
    expiry_reason: maxHoldMinutes ? `strategy_time_stop_${signal.strategy_name}_${signal.timeframe}` : "strategy_time_stop_not_configured",
    last_monitor_checked_at: null,
  };
}

async function createSkipped(supabase: SupabaseClient, signal: SignalRow, reason: string, metadata: Json = {}): Promise<Json> {
  const normalized = reason.startsWith("skipped_") ? reason : `skipped_${reason}`;
  const inserted = await insertExecutionOrderRow(supabase, {
    signal_id: signal.id, exchange: "binance_usdm_testnet", environment: "testnet", symbol: signal.symbol, direction: signal.direction,
    side: signal.direction === "buy" ? "long" : "short", entry_price: entryPrice(signal), stop_loss: signal.stop_loss, tp1: signal.tp1, tp2: signal.tp2,
    volume: 0, quantity: 0, execution_mode: "testnet", status: "skipped", error_message: normalized, latest_auto_skip_reason: normalized, ...metadata,
  }, "binance");
  if ("error" in inserted) return inserted.error;
  const existingResponse = existingExecutionResponse("binance", inserted, { exchange: "binance_usdm_testnet", ...metadata });
  if (existingResponse) return existingResponse;
  await logEvent(supabase, inserted.id, normalized, normalized, metadata);
  return { success: false, skipped: true, reason: normalized, execution_id: inserted.id, ...metadata };
}

function nativeExitPayload(plan: OrderPlan, type: "STOP_MARKET" | "TAKE_PROFIT_MARKET", triggerPrice: number, quantity: number, label: "sl" | "tp1" | "tp2"): Record<string, string | number | boolean> {
  return {
    symbol: plan.symbol,
    side: plan.closeSide,
    algoType: "CONDITIONAL",
    type,
    triggerPrice,
    quantity,
    reduceOnly: true,
    workingType: "MARK_PRICE",
    clientAlgoId: shortClientAlgoId(label, `${plan.symbol}${type}${triggerPrice}${quantity}${Date.now().toString(36)}`),
  };
}

async function fetchNativeOpenProtection(symbol?: string): Promise<Json[]> {
  const params = symbol ? { symbol } : {};
  const algoParams = symbol ? { symbol, algoType: "CONDITIONAL" } : { algoType: "CONDITIONAL" };
  const [regular, algo] = await Promise.all([
    binanceRequest<Array<Json>>("GET", "/fapi/v1/openOrders", params, true).catch(() => []),
    binanceRequest<Json>("GET", "/fapi/v1/openAlgoOrders", algoParams, true).catch(() => ({ orders: [] })),
  ]);
  const algoOrders = Array.isArray(algo) ? algo : Array.isArray((algo as Json).orders) ? (algo as { orders: Json[] }).orders : [];
  return [...regular, ...algoOrders];
}

function openOrderId(order: Json): string {
  return String(order.orderId ?? order.algoId ?? order.clientAlgoId ?? order.clientOrderId ?? "");
}

async function submitAlgoExitOrder(plan: OrderPlan, type: "STOP_MARKET" | "TAKE_PROFIT_MARKET", triggerPrice: number, quantity: number, label: "sl" | "tp1" | "tp2"): Promise<{ id: string; algoId: string; clientAlgoId: string; raw: Json; endpoint: string; payload: Json }> {
  const rules = await getRules(plan.symbol);
  const markPrice = await currentBinanceMarkPrice(plan.symbol);
  const roundedTrigger = roundProtectionPrice(triggerPrice, rules);
  const roundedQty = roundProtectionQty(quantity, rules);
  validateProtectionSizing("binance", plan.symbol, roundedQty, roundedTrigger, rules);
  const direction = expectedTriggerDirection(plan.closeSide === "SELL" ? "long" : "short", label, markPrice, roundedTrigger);
  if (!direction.valid) throw new Error(`invalid_binance_trigger_direction:${JSON.stringify({ symbol: plan.symbol, side: plan.closeSide === "SELL" ? "long" : "short", order_type: type, mark_price: markPrice, trigger_price: roundedTrigger, expected_direction: direction.expected, actual_direction: direction.actual })}`);
  const payload = nativeExitPayload(plan, type, roundedTrigger, roundedQty, label);
  const algo = await binanceRequest<{ algoId?: number | string; clientAlgoId?: string }>("POST", "/fapi/v1/algoOrder", payload, true);
  const algoId = String(algo.algoId ?? "");
  const clientAlgoId = String(algo.clientAlgoId ?? payload.clientAlgoId ?? "");
  if (!algoId) throw new Error(`Binance /fapi/v1/algoOrder did not return algoId for ${label}`);
  return { id: algoId, algoId, clientAlgoId, raw: algo as Json, endpoint: "/fapi/v1/algoOrder", payload: payload as Json };
}

async function submitBracketOrders(supabase: SupabaseClient, executionId: string, plan: OrderPlan): Promise<{ mode: BracketMode; protection: ProtectionStatus; sl_order_id?: string; tp1_order_id?: string; tp2_order_id?: string; sl_algo_id?: string; tp1_algo_id?: string; tp2_algo_id?: string; raw: Json; error?: string }> {
  try {
    const sl = await submitAlgoExitOrder(plan, "STOP_MARKET", plan.stopLoss, plan.quantity, "sl");
    const tp1 = await submitAlgoExitOrder(plan, "TAKE_PROFIT_MARKET", plan.tp1, plan.tp1Quantity, "tp1");
    const tp2 = await submitAlgoExitOrder(plan, "TAKE_PROFIT_MARKET", plan.tp2, plan.tp2Quantity, "tp2");
    const openOrders = await fetchNativeOpenProtection(plan.symbol);
    const orderIds = new Set(openOrders.map(openOrderId));
    const expected = [
      { label: "sl", placed: sl, type: "STOP_MARKET", side: plan.closeSide, quantity: plan.quantity, triggerPrice: plan.stopLoss },
      { label: "tp1", placed: tp1, type: "TAKE_PROFIT_MARKET", side: plan.closeSide, quantity: plan.tp1Quantity, triggerPrice: plan.tp1 },
      { label: "tp2", placed: tp2, type: "TAKE_PROFIT_MARKET", side: plan.closeSide, quantity: plan.tp2Quantity, triggerPrice: plan.tp2 },
    ];
    const mismatches = expected.flatMap((item) => {
      const order = openOrders.find((o) => openOrderId(o) === String(item.placed.id));
      if (!order) return [`${item.label}:missing_open_order`];
      const issues: string[] = [];
      if (String(order.side ?? item.side).toUpperCase() !== item.side) issues.push(`${item.label}:wrong_side`);
      if (String(order.type ?? item.type).toUpperCase() !== item.type) issues.push(`${item.label}:wrong_type`);
      if ((order.reduceOnly as unknown) === false) issues.push(`${item.label}:not_reduce_only`);
      const stop = Number(order.triggerPrice ?? order.stopPrice ?? item.triggerPrice);
      if (Number.isFinite(stop) && Math.abs(stop - item.triggerPrice) > Math.max(item.triggerPrice * 0.000001, 1e-8)) issues.push(`${item.label}:wrong_trigger_price`);
      return issues;
    });
    const missing = [sl.id, tp1.id, tp2.id].filter((id) => !orderIds.has(String(id)));
    const raw = { sl, tp1, tp2, verified_open_orders: openOrders, verification_mismatches: mismatches };
    if (missing.length > 0 || mismatches.length > 0) throw new Error(`Native protection verification failed; missing/mismatched open reduce-only orders: ${[...missing, ...mismatches].join(",")}`);
    await supabase.from("execution_orders").update({ status: "protected_native", bracket_mode: "exchange_native", protection_status: "protected_native", sl_order_id: sl.algoId, tp1_order_id: tp1.algoId, tp2_order_id: tp2.algoId, binance_sl_order_id: sl.algoId, binance_tp1_order_id: tp1.algoId, binance_tp2_order_id: tp2.algoId, sl_algo_id: sl.algoId, tp1_algo_id: tp1.algoId, tp2_algo_id: tp2.algoId, sl_client_algo_id: sl.clientAlgoId, tp1_client_algo_id: tp1.clientAlgoId, tp2_client_algo_id: tp2.clientAlgoId, native_protection_verified: true, managed_fallback_active: false, tp1_filled: false, sl_moved_to_be: false, be_stop_level: null, latest_protection_error: "", raw_exchange_response: raw, recovery_status: "healthy", repair_attempts: 0, last_action_taken: "initial_protection_placed", updated_at: new Date().toISOString() }).eq("id", executionId);
    await upsertTradeManagementTruth(supabase, {
      p_execution_order_id: executionId,
      p_provider: "binance",
      p_environment: "testnet",
      p_symbol: plan.symbol,
      p_direction: plan.side === "BUY" ? "long" : "short",
      p_status: "protected_native",
      p_protection_status: "protected_native",
      p_sl_present: true,
      p_tp1_present: true,
      p_tp2_present: true,
      p_entry_price: Number(plan.entryPrice),
      p_mark_price: null,
      p_unrealized_pnl: 0,
      p_quantity: Number(plan.quantity),
      p_leverage: Number(plan.leverage),
      p_sl_price: Number(plan.stopLoss),
      p_tp1_price: Number(plan.tp1),
      p_tp2_price: Number(plan.tp2),
      p_monitor_run_id: "",
      p_repair_attempts: 0,
      p_recovery_status: "healthy",
      p_latest_error: null,
      p_last_action_taken: "initial_protection_placed"
    }).catch((err) => console.error("trade_truth_adapter_upsert_failed", err));
    await logEvent(supabase, executionId, "protected_native", "SL/TP reduce-only algo protection submitted and verified on Binance algo-order endpoints", raw);
    return { mode: "exchange_native", protection: "protected_native", sl_order_id: sl.algoId, tp1_order_id: tp1.algoId, tp2_order_id: tp2.algoId, sl_algo_id: sl.algoId, tp1_algo_id: tp1.algoId, tp2_algo_id: tp2.algoId, raw };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Bracket order submission failed";
    const fallbackSafe = plan.stopLoss > 0 && plan.tp1 > 0 && plan.tp2 > 0 && plan.tp1Quantity > 0 && plan.tp2Quantity > 0;
    if (fallbackSafe) {
      const raw = { intended_sl: plan.stopLoss, intended_tp1: plan.tp1, intended_tp2: plan.tp2, tp1_quantity: plan.tp1Quantity, tp2_quantity: plan.tp2Quantity, remaining_quantity: plan.quantity, error };
      await supabase.from("execution_orders").update({ status: "protection_failed", bracket_mode: "exchange_native", protection_status: "protection_failed", native_protection_verified: false, managed_fallback_active: false, intended_sl: plan.stopLoss, intended_tp1: plan.tp1, intended_tp2: plan.tp2, tp1_quantity: plan.tp1Quantity, tp2_quantity: plan.tp2Quantity, remaining_quantity: plan.quantity, tp1_filled: false, sl_moved_to_be: false, be_stop_level: null, latest_protection_error: error, raw_exchange_response: raw, last_exchange_error: error, protection_critical_reason: "entry_filled_without_verified_sl_tp1_tp2", recovery_status: "recovery_required", latest_error: error, repair_attempts: 1, last_action_taken: "initial_protection_failed", updated_at: new Date().toISOString() }).eq("id", executionId);
      await upsertTradeManagementTruth(supabase, {
        p_execution_order_id: executionId,
        p_provider: "binance",
        p_environment: "testnet",
        p_symbol: plan.symbol,
        p_direction: plan.side === "BUY" ? "long" : "short",
        p_status: "protection_failed",
        p_protection_status: "protection_failed",
        p_sl_present: false,
        p_tp1_present: false,
        p_tp2_present: false,
        p_entry_price: Number(plan.entryPrice),
        p_mark_price: null,
        p_unrealized_pnl: 0,
        p_quantity: Number(plan.quantity),
        p_leverage: Number(plan.leverage),
        p_sl_price: Number(plan.stopLoss),
        p_tp1_price: Number(plan.tp1),
        p_tp2_price: Number(plan.tp2),
        p_monitor_run_id: "",
        p_repair_attempts: 1,
        p_recovery_status: "recovery_required",
        p_latest_error: error,
        p_last_action_taken: "initial_protection_failed"
      }).catch((err) => console.error("trade_truth_adapter_upsert_failed", err));
      await logEvent(supabase, executionId, "protection_failed", "Exchange-native SL/TP unavailable or unverified; trade remains PROTECTION_FAILED until monitor recovery verifies SL+TP1+TP2", raw);
      return { mode: "exchange_native", protection: "protection_failed", raw, error };
    }
    await supabase.from("execution_orders").update({ status: "failed", bracket_mode: "failed", protection_status: "unprotected_failed", last_exchange_error: error, latest_protection_error: error, error_message: error, updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "failed_bracket_order", error);
    return { mode: "failed", protection: "unprotected_failed", raw: {}, error };
  }
}

async function maybePlaceProtection(supabase: SupabaseClient, executionId: string, signalId: string, plan: OrderPlan): Promise<Json> {
  const bracket = await submitBracketOrders(supabase, executionId, plan);
  await sendExecutionTelegram(supabase, signalId, bracket.protection === "protected_native" ? "protection_verified" : bracket.protection === "protection_failed" ? "protection_failed" : "failed_bracket_order", [
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


async function applyMarginFallbackToPlan(signal: SignalRow, originalPlan: OrderPlan, settings: ExecutionSettings): Promise<{ plan: OrderPlan; selection: MarginSelection; diagnostics: Json }> {
  const supported = await fetchSupportedMarginSymbols();
  const selection = selectMarginAssetForExecution({
    symbol: originalPlan.symbol,
    requestedMargin: originalPlan.marginRequired,
    availableUsdt: originalPlan.capital.raw_available_usdt,
    availableUsdc: originalPlan.capital.raw_available_usdc,
    enableUsdcMarginBackup: envBool("TESTNET_ENABLED", false) && settings.testnet_enabled === true && settings.enable_usdc_margin_backup === true,
    allowMarginAssets: parseAllowedMarginAssets(settings),
    supportedUsdtSymbols: supported.usdt,
    supportedUsdcSymbols: supported.usdc,
    maxRetryAssets: Number(settings.max_retry_assets ?? 2),
  });
  const diagnostics: Json = {
    original_symbol: originalPlan.symbol,
    executed_symbol: selection.selectedSymbol ?? originalPlan.symbol,
    margin_asset_selected: selection.selectedMarginAsset,
    prefer_margin_asset: settings.prefer_margin_asset ?? "USDT",
    usdt_available: originalPlan.capital.raw_available_usdt,
    usdc_available: originalPlan.capital.raw_available_usdc,
    requested_margin: originalPlan.marginRequired,
    requested_notional: originalPlan.notional,
    leverage: originalPlan.leverage,
    risk_percent: originalPlan.riskPct,
    fallback_attempted: selection.backupAttempted,
    fallback_used: selection.backupAssetUsed === "USDC",
    fallback_reason: selection.reasons.join(","),
    exchange_error_code: "",
    exchange_error_message: "",
    final_execution_status: selection.placeOrder ? "ready" : "skipped",
    supported_usdt_count: supported.usdt.length,
    supported_usdc_count: supported.usdc.length,
  };
  if (!selection.placeOrder || !selection.selectedSymbol) return { plan: originalPlan, selection, diagnostics };
  const selectedSignal = selection.selectedSymbol === originalPlan.symbol ? signal : { ...signal, symbol: selection.selectedSymbol };
  const selectedRules = selection.selectedSymbol === originalPlan.symbol ? originalPlan.rules : await getRules(selection.selectedSymbol);
  const plan = selection.selectedSymbol === originalPlan.symbol ? originalPlan : buildPlan(selectedSignal, selectedRules, originalPlan.capital, settings, { state: originalPlan.governor_state, reason: originalPlan.governor_reason, risk_multiplier: originalPlan.risk_multiplier, adjusted_max_leverage: originalPlan.adjusted_max_leverage, adjusted_max_open_positions: 0, daily_pnl_pct: null, unrealized_pnl: null, current_equity: null, blocks_execution: false, execution_allowed: true, testnet_governor_mode: settings.testnet_governor_mode ?? "normal" });
  plan.originalSymbol = originalPlan.symbol;
  plan.marginAssetSelected = selection.selectedMarginAsset ?? "USDT";
  plan.marginFallbackAttempted = selection.backupAttempted;
  plan.marginFallbackUsed = selection.backupAssetUsed === "USDC";
  plan.marginFallbackReason = selection.reasons.join(",");
  return { plan, selection, diagnostics: { ...diagnostics, executed_symbol: plan.symbol, requested_margin: plan.marginRequired, requested_notional: plan.notional } };
}

async function createMarginSkipped(supabase: SupabaseClient, signal: SignalRow, selection: MarginSelection, diagnostics: Json): Promise<Json> {
  const reason = selection.reasons.at(-1) ?? "insufficient_total_margin";
  return createSkipped(supabase, signal, reason, {
    original_symbol: diagnostics.original_symbol,
    executed_symbol: diagnostics.executed_symbol,
    selected_margin_asset: selection.selectedMarginAsset,
    margin_asset_selected: selection.selectedMarginAsset,
    insufficient_margin_reason: reason,
    margin_backup_attempted: selection.backupAttempted,
    margin_fallback_used: false,
    margin_backup_asset_used: selection.backupAssetUsed,
    requested_margin: diagnostics.requested_margin,
    requested_notional: diagnostics.requested_notional,
    last_exchange_error: reason,
    raw_exchange_response: { margin_selection: selection, margin_diagnostics: { ...diagnostics, final_execution_status: "skipped" } },
  });
}

async function executeSignal(supabase: SupabaseClient, signalId: string, manual: boolean): Promise<Json> {
  // A signal row is a compatibility projection, not submission authority.
  // The provider transport is intentionally unavailable to this legacy path.
  void supabase; void signalId; void manual;
  return { success: false, blocked: true, reason: "certified_execution_plan_required" };
  /* istanbul ignore next -- retained temporarily for shadow/parity inspection */
  assertLiveTradingImpossible();
  const settings = await getSettings(supabase);
  if (settings.live_trading_enabled) throw new Error("Live trading impossible guard blocked execution_settings.live_trading_enabled");
  const { data: signal, error } = await supabase.from("signals").select("*").eq("id", signalId).maybeSingle();
  if (error || !signal) throw new Error("Signal not found");
  const sig = signal as SignalRow;
  if (!(await providerSupportsSymbol(supabase, "binance", sig.symbol))) return createSkipped(supabase, sig, "binance_symbol_not_supported", { provider: "binance", symbol: sig.symbol, blocker: "binance_symbol_not_supported" });
  const binanceQuarantine = await activeQuarantine(supabase, "binance", sig.symbol, "execution");
  if (binanceQuarantine) return createSkipped(supabase, sig, "symbol_quarantined", { provider: "binance", symbol: sig.symbol, quarantine: binanceQuarantine, quarantine_blocker_id: binanceQuarantine.id });
  const binanceControl = await getProviderControl(supabase, "binance");
  const binanceBlocker = providerEntryBlocked(binanceControl);
  if (binanceBlocker) return createSkipped(supabase, sig, binanceBlocker, { provider: "binance", db_row_source: "execution_provider_controls.provider_name=binance" });
  if (settings.kill_switch_enabled) return createSkipped(supabase, sig, "skipped_kill_switch");
  if (settings.bot_paused) return createSkipped(supabase, sig, "skipped_bot_paused", { bot_paused_reason: settings.bot_paused_reason });
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
  const governorMode = settings.testnet_governor_mode ?? "normal";
  if (!manual && governor.blocks_execution) return createSkipped(supabase, sig, "skipped_governor_paused", { governor_mode: governorMode, governor_state: governor.state, governor_reason: governor.reason, risk_multiplier: governor.risk_multiplier, adjusted_max_leverage: governor.adjusted_max_leverage });
  if (!manual && governorMode === "normal" && governor.state === "defensive" && String(sig.grade ?? "").toUpperCase() !== "A+") return createSkipped(supabase, sig, "skipped_governor_defensive_filter", { governor_mode: governorMode, governor_state: governor.state, governor_reason: governor.reason, risk_multiplier: governor.risk_multiplier, adjusted_max_leverage: governor.adjusted_max_leverage });
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
  const ignoreOpenRisk = stressOpenRiskIgnored(settings);
  const maxOpenAllowed = !manual && governorMode === "normal" ? Math.min(clampMaxOpenPositions(settings), governor.adjusted_max_open_positions) : clampMaxOpenPositions(settings);
  const { count: openCount } = await supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("exchange", "binance_usdm_testnet").eq("environment", "testnet").in("status", ACTIVE_STATUSES);
  if (!ignoreOpenRisk && (openCount ?? 0) >= maxOpenAllowed) return createSkipped(supabase, sig, "skipped_max_open_positions", { governor_state: governor.state, governor_reason: governor.reason, adjusted_max_open_positions: maxOpenAllowed });
  let plan: OrderPlan;
  let marginSelection: MarginSelection | null = null;
  let marginDiagnostics: Json = {};
  try {
    const initialPlan = buildPlan(sig, await getRules(sig.symbol), await capitalSnapshot(settings), settings, governor);
    const prepared = await applyMarginFallbackToPlan(sig, initialPlan, settings);
    plan = prepared.plan;
    marginSelection = prepared.selection;
    marginDiagnostics = prepared.diagnostics;
    if (!prepared.selection.placeOrder) return createMarginSkipped(supabase, sig, prepared.selection, prepared.diagnostics);
  }
  catch (e) { return createSkipped(supabase, sig, e instanceof Error ? e.message : "skipped_invalid_sizing"); }
  const currentRisk = await currentOpenRiskPct(supabase);
  const riskCap = maxTotalOpenRiskPct(settings);
  const totalRiskAfter = currentRisk + plan.riskPct;
  if (!manual && !ignoreOpenRisk && totalRiskAfter > riskCap + 1e-9) return createSkipped(supabase, sig, "skipped_total_open_risk_cap", { current_open_risk_pct: currentRisk, proposed_risk_pct: plan.riskPct, max_total_open_risk_pct: riskCap });
  plan.total_open_risk_after_trade = totalRiskAfter;
  const insertedExec = await insertExecutionOrderRow(supabase, { signal_id: sig.id, exchange: "binance_usdm_testnet", environment: "testnet", symbol: sig.symbol, direction: sig.direction, side: plan.side, execution_mode: "testnet", status: "pending_submit", lifecycle_state: "EXECUTION_PENDING", preflight_passed: true, execution_allowed: true, testnet_enabled_at: settings.testnet_enabled_at, current_open_risk_pct: currentRisk, total_open_risk_after_trade: totalRiskAfter, execution_provider: "binance", provider_status: "pending_submit", provider_entry_enabled: true, ...expiryFields(sig), ...commonExecutionFields(plan) }, "binance");
  if ("error" in insertedExec) return insertedExec.error;
  const existingExecResponse = existingExecutionResponse("binance", insertedExec, { exchange: "binance_usdm_testnet" });
  if (existingExecResponse) return existingExecResponse;
  const executionId = insertedExec.id;
  await logEvent(supabase, executionId, "planned", "Order plan created", { plan, margin_selection: marginSelection, margin_diagnostics: marginDiagnostics, sizing_diagnostics: { equity_used: plan.capital.equity_used, available_balance: plan.capital.raw_available_balance, available_usdt: plan.capital.raw_available_usdt, available_usdc: plan.capital.raw_available_usdc, collateral_coin: plan.marginAssetSelected ?? "USDT", risk_amount: plan.riskAmount, leverage: plan.leverage, final_quantity: plan.quantity } });
  await logEvent(supabase, executionId, "margin_asset_selected", "USDT/USDC margin asset selected before Binance entry placement", marginDiagnostics);
  try {
    const symbolConfiguration = await configureSymbolForExecution(plan);
    if (!symbolConfiguration.ok && symbolConfiguration.failure) {
      await supabase.from("execution_orders").update({ status: "failed", error_message: symbolConfiguration.failure.reason, last_exchange_error: symbolConfiguration.failure.code, bracket_mode: "failed", protection_status: "unprotected_failed", raw_exchange_response: { plan, symbol_configuration: symbolConfiguration, execution_failure: symbolConfiguration.failure }, updated_at: new Date().toISOString() }).eq("id", executionId);
      await logEvent(supabase, executionId, symbolConfiguration.failure.code, symbolConfiguration.failure.reason, symbolConfiguration.failure.details);
      await sendExecutionTelegram(supabase, sig.id, "failed", [`Execution failed: ${symbolConfiguration.failure.reason}`, `Signal: ${sig.symbol}`]);
      return { provider: "binance", success: false, submitted_order: false, execution_id: executionId, error: symbolConfiguration.failure.reason, reason_code: symbolConfiguration.failure.code, symbol_configuration: symbolConfiguration };
    }
    await logEvent(supabase, executionId, "symbol_configuration_checked", "Symbol configuration inspected before entry placement", { symbol_configuration: symbolConfiguration });
    const entry = await binanceRequest<{ orderId: number; status?: string }>("POST", "/fapi/v1/order", { symbol: plan.symbol, side: plan.entrySide, type: "LIMIT", timeInForce: "GTC", quantity: plan.quantity, price: plan.entryPrice }, true);
    await supabase.from("execution_orders").update({ status: "entry_submitted", lifecycle_state: "ENTRY_SUBMITTED", entry_order_id: String(entry.orderId), binance_entry_order_id: String(entry.orderId), raw_exchange_response: { entry, plan, symbol_configuration: symbolConfiguration, margin_selection: marginSelection, margin_diagnostics: marginDiagnostics }, last_exchange_error: "", updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "entry_submitted", "Entry LIMIT order placed on /fapi/v1/order", { orderId: entry.orderId, entry_type: "LIMIT", ...marginDiagnostics, final_execution_status: "entry_submitted" });
    await sendExecutionTelegram(supabase, sig.id, "auto_executed", ["Auto execution submitted", `Symbol: ${plan.symbol}`, `Side: ${plan.side}`, `Strategy: ${sig.strategy_name}`, `Timeframe: ${sig.timeframe}`, `Grade: ${sig.grade}`, `Leverage: ${plan.leverage}x`, `Leverage source: ${plan.leverage_source}`, `Execution Mode: ${settings.execution_mode}`, `Stress Mode: ${plan.stress_mode ? "ON" : "OFF"}`, `Risk Source: ${plan.risk_source}`, `Governor: ${plan.governor_state}`, `Governor reason: ${plan.governor_reason}`, `Effective risk %: ${plan.adjusted_risk_pct}`, `Effective max leverage: ${plan.adjusted_max_leverage}x`, `Capital basis: ${plan.capital.capital_basis}`, `Capital used: ${plan.capital.selected_capital_used.toFixed(2)}`, `Risk %: ${plan.riskPct}`, `Daily PnL %: ${governor.daily_pnl_pct ?? "unknown"}`, `Unrealized PnL: ${governor.unrealized_pnl ?? "unknown"}`, `Risk amount: ${plan.riskAmount.toFixed(2)}`, `Notional: ${plan.notional.toFixed(2)}`, `Qty: ${plan.quantity}`, `Entry: ${plan.entryPrice}`, `SL: ${plan.stopLoss}`, `TP1: ${plan.tp1}`, `TP2: ${plan.tp2}`, `Protection: pending`, `Bracket mode: pending`, `Entry order: ${entry.orderId}`, "SL order: pending", "TP1 order: pending", "TP2 order: pending", "TP1 close %: 50%", "TP2 close %: 50%", "Move SL to BE after TP1: yes", `Open risk: ${plan.riskPct}%`, `Total open risk after this trade: ${totalRiskAfter}%`, `Open Risk Guard: ${plan.open_risk_guard}`]);
    if (entry.status === "FILLED") await maybePlaceProtection(supabase, executionId, sig.id, plan);
    return { provider: "binance", success: true, submitted_order: true, execution_id: executionId, status: "entry_submitted", plan };
  } catch (e) {
    const classified = classifyExecutionError(e);
    const msg = `${classified.code}: ${classified.message}`;
    await supabase.from("execution_orders").update({ status: "failed", error_message: msg, last_exchange_error: classified.code, bracket_mode: "failed", protection_status: "unprotected_failed", raw_exchange_response: { plan, margin_selection: marginSelection, margin_diagnostics: { ...marginDiagnostics, exchange_error_code: classified.details.binance_code ?? classified.code, exchange_error_message: classified.message, final_execution_status: "failed" }, execution_failure: classified }, insufficient_margin_reason: classified.code === "insufficient_margin" ? "exchange_rejected" : (plan.marginFallbackReason ?? ""), updated_at: new Date().toISOString() }).eq("id", executionId);
    await recordSymbolFailure(supabase, "binance", plan.symbol, classifySymbolFailure(msg), { execution_id: executionId, message: msg, ...classified.details });
    await logEvent(supabase, executionId, classified.code, msg, { ...classified.details, ...marginDiagnostics, exchange_error_code: classified.details.binance_code ?? classified.code, exchange_error_message: classified.message, final_execution_status: "failed" });
    await sendExecutionTelegram(supabase, sig.id, "failed", [`Execution failed: ${msg}`, `Signal: ${sig.symbol}`]);
    return { provider: "binance", success: false, submitted_order: false, execution_id: executionId, error: msg, reason_code: classified.code, details: classified.details };
  }
}

function providerNeutralSignal(sig: SignalRow): Json {
  return {
    symbol_base: String(sig.symbol ?? "").replace(/(USDT|USDC)$/i, ""),
    direction: sig.direction,
    entry_zone: { low: sig.entry_low, high: sig.entry_high },
    sl: sig.stop_loss,
    tp1: sig.tp1,
    tp2: sig.tp2,
    strategy: sig.strategy_name,
    timeframe: sig.timeframe,
    grade: sig.grade,
    confidence: sig.confidence_score,
    risk_model: sig.risk_profile_snapshot ?? {},
  };
}


function numericClose(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(Math.abs(b) * 0.000001, 1e-8);
}

function bybitOrderActive(order: Json): boolean {
  return !["Filled", "Cancelled", "Rejected", "Deactivated"].includes(String(order.orderStatus ?? order.stopOrderStatus ?? ""));
}

function verifyBybitLeg(order: Json | undefined, expected: { symbol: string; closeSide: "Buy" | "Sell"; qty: number; triggerPrice: number; direction: number; closeOnTrigger: boolean }, label: "sl" | "tp1" | "tp2"): string[] {
  const errors: string[] = [];
  if (!order) return [`${label}:missing_exchange_order`];
  if (String(order.symbol ?? "") !== expected.symbol) errors.push(`${label}:wrong_symbol`);
  if (String(order.side ?? "") !== expected.closeSide) errors.push(`${label}:wrong_side`);
  if (!bybitOrderActive(order)) errors.push(`${label}:inactive_status`);
  if (String(order.reduceOnly ?? "").toLowerCase() !== "true") errors.push(`${label}:not_reduce_only`);
  if (String(order.closeOnTrigger ?? "").toLowerCase() !== String(expected.closeOnTrigger)) errors.push(`${label}:wrong_close_on_trigger`);
  if (!numericClose(Number(order.qty ?? order.leavesQty ?? 0), expected.qty)) errors.push(`${label}:wrong_quantity`);
  if (!numericClose(Number(order.triggerPrice ?? 0), expected.triggerPrice)) errors.push(`${label}:wrong_trigger_price`);
  const actualDirection = Number(order.triggerDirection ?? 0);
  if (actualDirection !== expected.direction) errors.push(`${label}:wrong_trigger_direction`);
  const filter = String(order.orderFilter ?? order.stopOrderType ?? "").toLowerCase();
  if (filter && !filter.includes("stop") && !filter.includes("order")) errors.push(`${label}:wrong_filter`);
  return errors;
}

function findBybitOrderByResult(orders: Array<Record<string, unknown>>, result: { orderId?: string; orderLinkId?: string }): Json | undefined {
  const id = String(result.orderId ?? "");
  const link = String(result.orderLinkId ?? "");
  return orders.find((order) => (id && String(order.orderId ?? "") === id) || (link && String(order.orderLinkId ?? "") === link)) as Json | undefined;
}

function verifyBybitProtectionSet(symbol: string, side: "long" | "short", plan: OrderPlan, placed: { sl: { orderId?: string; orderLinkId?: string }; tp1: { orderId?: string; orderLinkId?: string }; tp2: { orderId?: string; orderLinkId?: string } }, orders: Array<Record<string, unknown>>): { verified: boolean; errors: string[]; matched_order_ids: string[] } {
  const closeSide = side === "long" ? "Sell" : "Buy";
  const slDirection = side === "long" ? 2 : 1;
  const tpDirection = side === "long" ? 1 : 2;
  const slOrder = findBybitOrderByResult(orders, placed.sl);
  const tp1Order = findBybitOrderByResult(orders, placed.tp1);
  const tp2Order = findBybitOrderByResult(orders, placed.tp2);
  const errors = [
    ...verifyBybitLeg(slOrder, { symbol, closeSide, qty: plan.quantity, triggerPrice: plan.stopLoss, direction: slDirection, closeOnTrigger: true }, "sl"),
    ...verifyBybitLeg(tp1Order, { symbol, closeSide, qty: plan.tp1Quantity, triggerPrice: plan.tp1, direction: tpDirection, closeOnTrigger: true }, "tp1"),
    ...verifyBybitLeg(tp2Order, { symbol, closeSide, qty: plan.tp2Quantity, triggerPrice: plan.tp2, direction: tpDirection, closeOnTrigger: true }, "tp2"),
  ];
  return { verified: errors.length === 0, errors, matched_order_ids: [slOrder, tp1Order, tp2Order].map((order) => String(order?.orderId ?? order?.orderLinkId ?? "")).filter(Boolean) };
}

async function executeBybitSignal(supabase: SupabaseClient, sig: SignalRow, executionGroupId: string, manual: boolean, reason: string): Promise<Json> {
  // Bybit economic intent must originate in execution-plan/v1, never SignalRow.
  void supabase; void sig; void executionGroupId; void manual; void reason;
  return { success: false, blocked: true, reason: "certified_execution_plan_required" };
  /* istanbul ignore next -- retained temporarily for shadow/parity inspection */
  if (!bybitExecutionAllowedEnvironment()) throw new Error("bybit_live_blocked: Bybit execution allows testnet/demo only; live URLs are rejected for order submission");
  const settings = await getSettings(supabase);
  const control = await getProviderControl(supabase, "bybit");
  const providerSymbol = String(sig.symbol).replace(/USDC$/i, "USDT");
  const symbolSupported = await providerSupportsSymbol(supabase, "bybit", providerSymbol);
  const bybitQuarantine = await activeQuarantine(supabase, "bybit", providerSymbol, "execution");
  const blocker = bybitQuarantine ? "symbol_quarantined" : symbolSupported ? providerEntryBlocked(control) : "bybit_symbol_not_supported";
  if (settings.live_trading_enabled) throw new Error("Live trading impossible guard blocked execution_settings.live_trading_enabled");
  const autoBlocker = !manual && !settings.auto_execute_testnet ? "auto_execute_testnet_false" : null;
  const globalBlocker = settings.kill_switch_enabled ? "skipped_kill_switch" : settings.bot_paused ? "skipped_bot_paused" : settings.execution_mode !== "testnet" || !settings.testnet_enabled ? "skipped_auto_disabled" : autoBlocker;
  const finalBlocker = blocker ?? globalBlocker;
  const bybitOwnership = currentEdgeOwnership("bybit");
  const { data: existingBybitRows } = await supabase.from("execution_orders").select("id,status,symbol")
    .eq("execution_scope_key", bybitOwnership.execution_scope_key).eq("signal_id", sig.id)
    .eq("exchange", bybitExchangeName()).eq("environment", bybitExecutionEnvironment()).order("created_at", { ascending: false });
  const activeBybitDuplicate = ((existingBybitRows ?? []) as Json[]).find((row) => ACTIVE_STATUSES.includes(String(row.status)));
  if (activeBybitDuplicate) return { provider: "bybit", success: false, skipped: true, submitted_order: false, duplicate_order_prevented: true, reason: "skipped_duplicate_signal", execution_id: activeBybitDuplicate.id };
  if (settings.one_active_execution_per_symbol) {
    const { count } = await supabase.from("execution_orders").select("id", { count: "exact", head: true })
      .eq("execution_scope_key", bybitOwnership.execution_scope_key).eq("symbol", providerSymbol).in("status", ACTIVE_STATUSES);
    if ((count ?? 0) > 0) return { provider: "bybit", success: false, skipped: true, submitted_order: false, duplicate_order_prevented: true, reason: "skipped_active_symbol_execution", symbol: providerSymbol };
  }
  const { count: openBybitCount } = await supabase.from("execution_orders").select("id", { count: "exact", head: true })
    .eq("execution_scope_key", bybitOwnership.execution_scope_key).eq("environment", bybitExecutionEnvironment()).in("status", ACTIVE_STATUSES);
  if (!stressOpenRiskIgnored(settings) && (openBybitCount ?? 0) >= clampMaxOpenPositions(settings)) return { provider: "bybit", success: false, skipped: true, submitted_order: false, reason: "skipped_max_open_positions" };
  const baseRow: Json = {
    signal_id: sig.id, exchange: bybitExchangeName(), environment: bybitExecutionEnvironment(), symbol: providerSymbol, direction: sig.direction, side: sig.direction === "buy" ? "long" : "short", execution_mode: "testnet",
    execution_group_id: executionGroupId, execution_provider: "bybit", provider_entry_enabled: !finalBlocker, provider_status: finalBlocker ? "provider_skipped" : "pending",
    entry_price: entryPrice(sig), stop_loss: sig.stop_loss, tp1: sig.tp1, tp2: sig.tp2, ...expiryFields(sig),
  };
  if (finalBlocker) {
    const inserted = await insertExecutionOrderRow(supabase, { ...baseRow, status: "skipped", volume: 0, quantity: 0, latest_auto_skip_reason: finalBlocker, error_message: finalBlocker, raw_exchange_response: { provider_neutral_signal: providerNeutralSignal(sig), router_reason: reason, provider_control: control, quarantine: bybitQuarantine }, quarantine_blocker_id: bybitQuarantine?.id }, "bybit");
    if ("error" in inserted) return inserted.error;
    const existingResponse = existingExecutionResponse("bybit", inserted, { exchange: bybitExchangeName(), symbol: providerSymbol });
    if (existingResponse) return existingResponse;
    await logEvent(supabase, inserted.id, "provider_skipped", `Bybit ${bybitEnvironment()} entry blocked by exact gate`, { blocker: finalBlocker, control });
    return { provider: "bybit", exchange: bybitExchangeName(), success: false, submitted_order: false, skipped: true, reason: finalBlocker, execution_id: inserted.id, symbol: providerSymbol };
  }
  const governor = await evaluateGovernor(supabase, settings);
  if (!manual && governor.blocks_execution) {
    const reasonText = governor.reason || "skipped_governor_paused";
    const inserted = await insertExecutionOrderRow(supabase, { ...baseRow, status: "skipped", provider_status: "provider_skipped", volume: 0, quantity: 0, latest_auto_skip_reason: reasonText, error_message: reasonText, raw_exchange_response: { provider_neutral_signal: providerNeutralSignal(sig), router_reason: reason, governor } }, "bybit");
    if ("error" in inserted) return inserted.error;
    const existingResponse = existingExecutionResponse("bybit", inserted, { exchange: bybitExchangeName(), symbol: providerSymbol });
    if (existingResponse) return existingResponse;
    await logEvent(supabase, inserted.id, "provider_skipped", `Bybit ${bybitEnvironment()} entry blocked by governor`, { governor });
    return { provider: "bybit", success: false, submitted_order: false, skipped: true, reason: reasonText, execution_id: inserted.id };
  }
  let plan: OrderPlan;
  try { plan = buildPlan({ ...sig, symbol: providerSymbol }, await getBybitRules(providerSymbol), await capitalSnapshot(settings), settings, governor); }
  catch (e) {
    const reasonText = e instanceof Error ? e.message : "skipped_invalid_sizing";
    const inserted = await insertExecutionOrderRow(supabase, { ...baseRow, status: "skipped", provider_status: "provider_skipped", volume: 0, quantity: 0, latest_auto_skip_reason: reasonText, error_message: reasonText, raw_exchange_response: { provider_neutral_signal: providerNeutralSignal(sig), router_reason: reason } }, "bybit");
    if ("error" in inserted) return inserted.error;
    const existingResponse = existingExecutionResponse("bybit", inserted, { exchange: bybitExchangeName(), symbol: providerSymbol });
    if (existingResponse) return existingResponse;
    await logEvent(supabase, inserted.id, "provider_skipped", `Bybit ${bybitEnvironment()} entry blocked before submit`, { reason: reasonText });
    return { provider: "bybit", success: false, submitted_order: false, skipped: true, reason: reasonText, execution_id: inserted.id };
  }
  const currentRisk = await currentOpenRiskPct(supabase);
  const riskCap = maxTotalOpenRiskPct(settings);
  if (!manual && !stressOpenRiskIgnored(settings) && currentRisk + plan.riskPct > riskCap + 1e-9) {
    const riskBlocker = "skipped_total_open_risk_cap";
    const skipped = await insertExecutionOrderRow(supabase, { ...baseRow, status: "skipped", provider_status: "provider_skipped", volume: 0, quantity: 0, latest_auto_skip_reason: riskBlocker, error_message: riskBlocker, raw_exchange_response: { provider_neutral_signal: providerNeutralSignal(sig), router_reason: reason, current_open_risk_pct: currentRisk, proposed_risk_pct: plan.riskPct, max_total_open_risk_pct: riskCap } }, "bybit");
    if ("error" in skipped) return skipped.error;
    return { provider: "bybit", success: false, submitted_order: false, skipped: true, reason: riskBlocker, execution_id: skipped.id };
  }
  const inserted = await insertExecutionOrderRow(supabase, { ...baseRow, status: "pending_submit", lifecycle_state: "EXECUTION_PENDING", preflight_passed: true, execution_allowed: true, provider_status: "pending_submit", ...commonExecutionFields({ ...plan, marginAssetSelected: "USDT" }), raw_exchange_response: { provider_neutral_signal: providerNeutralSignal(sig), router_reason: reason, plan, sizing_diagnostics: { equity_used: plan.capital.equity_used, available_balance: plan.capital.raw_available_balance, available_usdt: plan.capital.raw_available_usdt, available_usdc: plan.capital.raw_available_usdc, collateral_coin: "USDT", risk_amount: plan.riskAmount, leverage: plan.leverage, final_quantity: plan.quantity } } }, "bybit");
  if ("error" in inserted) return inserted.error;
  const existingResponse = existingExecutionResponse("bybit", inserted, { exchange: bybitExchangeName(), symbol: providerSymbol });
  if (existingResponse) return existingResponse;
  const executionId = inserted.id;
  let entryAccepted = false;
  let positionConfirmed = false;
  try {
    const entry = await bybitRequest<{ orderId?: string; orderLinkId?: string }>("POST", "/v5/order/create", { category: "linear", symbol: providerSymbol, side: sig.direction === "buy" ? "Buy" : "Sell", orderType: "Limit", qty: String(plan.quantity), price: String(plan.entryPrice), timeInForce: "GTC", orderLinkId: createBybitOrderLinkId(sig.id, 'entry') });
    entryAccepted = true;
    await supabase.from("execution_orders").update({ status: "entry_submitted", lifecycle_state: "ENTRY_SUBMITTED", entry_order_id: entry.orderId ?? entry.orderLinkId ?? "bybit_entry_submitted", raw_exchange_response: { entry, plan, provider_neutral_signal: providerNeutralSignal(sig) }, updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "entry_submitted", `Bybit ${bybitEnvironment()} entry LIMIT order submitted`, { entry, plan, sizing_diagnostics: { equity_used: plan.capital.equity_used, available_balance: plan.capital.raw_available_balance, available_usdt: plan.capital.raw_available_usdt, available_usdc: plan.capital.raw_available_usdc, collateral_coin: "USDT", risk_amount: plan.riskAmount, leverage: plan.leverage, final_quantity: plan.quantity } });
    // An order acknowledgement is not a fill. Protection ownership starts only
    // after exchange position truth confirms exposure, exactly as on Binance.
    const positionsResult = await bybitRequest<Json>("GET", "/v5/position/list", { category: "linear", symbol: providerSymbol });
    const confirmedPosition = (((positionsResult.list ?? []) as Json[])).find((position) => String(position.symbol) === providerSymbol && Number(position.size ?? 0) > 0);
    if (!confirmedPosition) {
      return { provider: "bybit", exchange: bybitExchangeName(), success: true, submitted_order: true, entry_status: "entry_submitted", protection_status: "awaiting_fill", status: "entry_submitted", execution_id: executionId, symbol: providerSymbol, provider_order_id: entry.orderId ?? entry.orderLinkId ?? null };
    }
    positionConfirmed = true;
    await supabase.from("execution_orders").update({ status: "entry_filled", lifecycle_state: "ENTRY_FILLED", position_confirmed: true, entry_filled_at: new Date().toISOString(), current_position_size: Number(confirmedPosition.size), updated_at: new Date().toISOString() }).eq("id", executionId);
    await logEvent(supabase, executionId, "entry_filled", `Bybit ${bybitEnvironment()} position confirmed before protection`, { symbol: providerSymbol, size: Number(confirmedPosition.size) });
    const closeSide = sig.direction === "buy" ? "Sell" : "Buy";
    const bybitMarkPrice = await currentBybitMarkPrice(providerSymbol);
    const slDirection = expectedTriggerDirection(sig.direction, "sl", bybitMarkPrice, plan.stopLoss);
    const tp1Direction = expectedTriggerDirection(sig.direction, "tp1", bybitMarkPrice, plan.tp1);
    const tp2Direction = expectedTriggerDirection(sig.direction, "tp2", bybitMarkPrice, plan.tp2);
    if (!slDirection.valid) throw new Error(`invalid_bybit_trigger_direction:${JSON.stringify({ symbol: providerSymbol, side: sig.direction, order_type: "sl", mark_price: bybitMarkPrice, trigger_price: plan.stopLoss, expected_direction: slDirection.expected, actual_direction: slDirection.actual })}`);
    if (!tp1Direction.valid) throw new Error(`invalid_bybit_trigger_direction:${JSON.stringify({ symbol: providerSymbol, side: sig.direction, order_type: "tp1", mark_price: bybitMarkPrice, trigger_price: plan.tp1, expected_direction: tp1Direction.expected, actual_direction: tp1Direction.actual })}`);
    if (!tp2Direction.valid) throw new Error(`invalid_bybit_trigger_direction:${JSON.stringify({ symbol: providerSymbol, side: sig.direction, order_type: "tp2", mark_price: bybitMarkPrice, trigger_price: plan.tp2, expected_direction: tp2Direction.expected, actual_direction: tp2Direction.actual })}`);
    const sl = await bybitRequest<{ orderId?: string; orderLinkId?: string }>("POST", "/v5/order/create", { category: "linear", symbol: providerSymbol, side: closeSide, orderType: "Market", qty: String(plan.quantity), reduceOnly: true, closeOnTrigger: true, triggerPrice: String(plan.stopLoss), triggerDirection: slDirection.bybitDirection, triggerBy: "MarkPrice", orderLinkId: createBybitOrderLinkId(sig.id, 'sl') }).catch((error) => ({ error }));
    if ("error" in sl) throw new Error(`bybit_sl_submit_failed: ${sl.error instanceof Error ? sl.error.message : String(sl.error)}`);
    const tp1 = await bybitRequest<{ orderId?: string; orderLinkId?: string }>("POST", "/v5/order/create", { category: "linear", symbol: providerSymbol, side: closeSide, orderType: "Market", qty: String(plan.tp1Quantity), reduceOnly: true, closeOnTrigger: true, triggerPrice: String(plan.tp1), triggerDirection: tp1Direction.bybitDirection, triggerBy: "MarkPrice", orderLinkId: createBybitOrderLinkId(sig.id, 'tp1') }).catch((error) => ({ error }));
    if ("error" in tp1) throw new Error(`bybit_tp1_submit_failed: ${tp1.error instanceof Error ? tp1.error.message : String(tp1.error)}`);
    const tp2 = await bybitRequest<{ orderId?: string; orderLinkId?: string }>("POST", "/v5/order/create", { category: "linear", symbol: providerSymbol, side: closeSide, orderType: "Market", qty: String(plan.tp2Quantity), reduceOnly: true, closeOnTrigger: true, triggerPrice: String(plan.tp2), triggerDirection: tp2Direction.bybitDirection, triggerBy: "MarkPrice", orderLinkId: createBybitOrderLinkId(sig.id, 'tp2') }).catch((error) => ({ error }));
    if ("error" in tp2) throw new Error(`bybit_tp2_submit_failed: ${tp2.error instanceof Error ? tp2.error.message : String(tp2.error)}`);
    const orders = await bybitRequest<{ list?: Array<Record<string, unknown>> }>("GET", "/v5/order/realtime", { category: "linear", symbol: providerSymbol, openOnly: 0 });
    const verification = verifyBybitProtectionSet(providerSymbol, sig.direction === "buy" ? "long" : "short", plan, { sl, tp1, tp2 }, orders.list ?? []);
    if (!verification.verified) throw new Error(`bybit_protection_verify_failed: ${verification.errors.join(",")}`);
    await supabase.from("execution_orders").update({ status: "protected_native", lifecycle_state: "PROTECTION_CONFIRMED", position_confirmed: true, sl_confirmed: true, tp1_confirmed: true, tp2_confirmed: true, provider_status: "provider_submitted", protection_status: "protected_native", native_protection_verified: true, sl_order_id: sl.orderId ?? sl.orderLinkId ?? null, tp1_order_id: tp1.orderId ?? tp1.orderLinkId ?? null, tp2_order_id: tp2.orderId ?? tp2.orderLinkId ?? null, raw_exchange_response: { entry, sl, tp1, tp2, protection_verify: orders, verification, plan, provider_neutral_signal: providerNeutralSignal(sig) }, updated_at: new Date().toISOString() }).eq("id", executionId);
    await upsertTradeManagementTruth(supabase, {
      p_execution_order_id: executionId,
      p_provider: "bybit",
      p_environment: bybitExecutionEnvironment(),
      p_symbol: providerSymbol,
      p_direction: sig.direction === "buy" ? "long" : "short",
      p_status: "protected_native",
      p_protection_status: "protected_native",
      p_sl_present: true,
      p_tp1_present: true,
      p_tp2_present: true,
      p_entry_price: Number(plan.entryPrice),
      p_mark_price: null,
      p_unrealized_pnl: 0,
      p_quantity: Number(plan.quantity),
      p_leverage: Number(plan.leverage),
      p_sl_price: Number(plan.stopLoss),
      p_tp1_price: Number(plan.tp1),
      p_tp2_price: Number(plan.tp2),
      p_monitor_run_id: "",
      p_repair_attempts: 0,
      p_recovery_status: "healthy",
      p_latest_error: null,
      p_last_action_taken: "initial_protection_placed"
    }).catch((err) => console.error("trade_truth_adapter_upsert_failed", err));
    await logEvent(supabase, executionId, "protection_verified", `Bybit ${bybitEnvironment()} SL/TP1/TP2 conditionals submitted and verified`, { sl, tp1, tp2 });
    return { provider: "bybit", exchange: bybitExchangeName(), success: true, submitted_order: true, status: "protected_native", execution_id: executionId, symbol: providerSymbol, provider_order_id: entry.orderId ?? null, sl_order_id: sl.orderId ?? null, tp1_order_id: tp1.orderId ?? null, tp2_order_id: tp2.orderId ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reasonCode = msg.includes("bybit_sl_submit_failed") ? "bybit_sl_submit_failed" : msg.includes("bybit_tp1_submit_failed") ? "bybit_tp1_submit_failed" : msg.includes("bybit_tp2_submit_failed") ? "bybit_tp2_submit_failed" : msg.includes("bybit_protection_verify_failed") ? "bybit_protection_verify_failed" : msg.toLowerCase().includes("insufficient") ? "bybit_margin_insufficient" : "bybit_entry_submit_failed";
    await recordSymbolFailure(supabase, "bybit", providerSymbol, classifySymbolFailure(msg), { execution_id: executionId, reasonCode, message: msg });
    const unsafeAfterEntry = entryAccepted && positionConfirmed;
    await supabase.from("execution_orders").update({ status: unsafeAfterEntry ? "protection_failed" : "failed", lifecycle_state: unsafeAfterEntry ? "UNSAFE_POSITION" : "FAILED_NO_POSITION", position_confirmed: unsafeAfterEntry, manual_review_required: unsafeAfterEntry, error_message: `${reasonCode}: ${msg}`, last_exchange_error: reasonCode, provider_status: "provider_failed", protection_status: unsafeAfterEntry ? "protection_failed" : "unprotected_failed", raw_exchange_response: { plan, error: msg, provider_neutral_signal: providerNeutralSignal(sig) }, updated_at: new Date().toISOString() }).eq("id", executionId);
    
    if (unsafeAfterEntry && plan) {
      await upsertTradeManagementTruth(supabase, {
        p_execution_order_id: executionId,
        p_provider: "bybit",
        p_environment: bybitExecutionEnvironment(),
        p_symbol: providerSymbol,
        p_direction: sig.direction === "buy" ? "long" : "short",
        p_status: "protection_failed",
        p_protection_status: "protection_failed",
        p_sl_present: false,
        p_tp1_present: false,
        p_tp2_present: false,
        p_entry_price: Number(plan.entryPrice),
        p_mark_price: null,
        p_unrealized_pnl: 0,
        p_quantity: Number(plan.quantity),
        p_leverage: Number(plan.leverage),
        p_sl_price: Number(plan.stopLoss),
        p_tp1_price: Number(plan.tp1),
        p_tp2_price: Number(plan.tp2),
        p_monitor_run_id: "",
        p_repair_attempts: 1,
        p_recovery_status: "recovery_required",
        p_latest_error: msg,
        p_last_action_taken: "initial_protection_failed"
      }).catch((err) => console.error("trade_truth_adapter_upsert_failed", err));
    }
    await logEvent(supabase, executionId, reasonCode, "Bybit provider failure isolated", { error: msg });
    return { provider: "bybit", exchange: bybitExchangeName(), success: false, submitted_order: entryAccepted, entry_status: entryAccepted ? (positionConfirmed ? "entry_filled" : "entry_submitted") : "not_submitted", protection_status: unsafeAfterEntry ? "protection_failed" : "not_started", blocker: reasonCode, error: msg, execution_id: executionId, symbol: providerSymbol };
  }
}

async function routeSignalToEnabledProviders(supabase: SupabaseClient, signalId: string, manual: boolean): Promise<Json> {
  assertLiveTradingImpossible();
  const executionGroupId = crypto.randomUUID();
  const [settingsRead, scannerRead, globalRead, binanceControlRead, bybitControlRead, signalRead] = await Promise.all([
    supabase.from("execution_settings").select("id,live_trading_enabled").eq("id", 1).maybeSingle(),
    supabase.from("scanner_config").select("id").eq("id", 1).maybeSingle(),
    supabase.from("execution_provider_global_controls").select("primary_provider,parallel_mode_enabled,live_trading_enabled,mirror_required_for_vip,execute_supported_provider_only").eq("id", 1).maybeSingle(),
    supabase.from("execution_provider_controls").select("provider_name,status").eq("provider_name", "binance").maybeSingle(),
    supabase.from("execution_provider_controls").select("provider_name,status").eq("provider_name", "bybit").maybeSingle(),
    supabase.from("signals").select("*").eq("id", signalId).maybeSingle(),
  ]);
  const setupBlockers: Json[] = [];
  if (settingsRead.error || !settingsRead.data) setupBlockers.push(setupBlocker("router", "missing_execution_settings", `execution_settings id=1 not found${settingsRead.error && !isMissingRowError(settingsRead.error) ? ` (${settingsRead.error.message})` : ""}`));
  if (scannerRead.error || !scannerRead.data) setupBlockers.push(setupBlocker("router", "missing_scanner_config", `scanner_config id=1 not found${scannerRead.error && !isMissingRowError(scannerRead.error) ? ` (${scannerRead.error.message})` : ""}`));
  if (globalRead.error || !globalRead.data) setupBlockers.push(setupBlocker("router", "missing_global_provider_controls", `execution_provider_global_controls id=1 not found${globalRead.error && !isMissingRowError(globalRead.error) ? ` (${globalRead.error.message})` : ""}`));
  if (binanceControlRead.error || !binanceControlRead.data) setupBlockers.push(setupBlocker("binance", "missing_provider_control_binance", `execution_provider_controls provider_name=binance not found${binanceControlRead.error && !isMissingRowError(binanceControlRead.error) ? ` (${binanceControlRead.error.message})` : ""}`));
  if (bybitControlRead.error || !bybitControlRead.data) setupBlockers.push(setupBlocker("bybit", "missing_provider_control_bybit", `execution_provider_controls provider_name=bybit not found${bybitControlRead.error && !isMissingRowError(bybitControlRead.error) ? ` (${bybitControlRead.error.message})` : ""}`));
  if (signalRead.error || !signalRead.data) setupBlockers.push(setupBlocker("router", "missing_signal", `signals id=${signalId} not found${signalRead.error && !isMissingRowError(signalRead.error) ? ` (${signalRead.error.message})` : ""}`));
  if (setupBlockers.length > 0) return { success: false, execution_group_id: executionGroupId, setup_blocked: true, results: setupBlockers };
  const sig = signalRead.data as SignalRow;
  const global = globalRead.data as Json;
  if (settingsRead.data.live_trading_enabled === true || global.live_trading_enabled === true) return { success: false, execution_group_id: executionGroupId, setup_blocked: true, results: [setupBlocker("router", "unknown_null_row", "Live trading guard blocked provider-neutral router because live_trading_enabled=true")] };
  const parallel = global.parallel_mode_enabled === true;
  const primary = String(global.primary_provider ?? "binance");
  const selectedProviders = parallel ? ["binance", "bybit"] : [primary === "bybit" ? "bybit" : "binance"];
  const mirrorRequiredForVip = global.mirror_required_for_vip === true;
  const executeSupportedProviderOnly = global.execute_supported_provider_only !== false;
  const binanceSupported = await providerSupportsSymbol(supabase, "binance", sig.symbol);
  const bybitSymbol = sig.symbol.replace(/USDC$/i, "USDT");
  const bybitSupported = await providerSupportsSymbol(supabase, "bybit", bybitSymbol);
  if (parallel && mirrorRequiredForVip && (!binanceSupported || !bybitSupported)) return { success: false, skipped: true, blocker: "missing_symbol_cache", reason: "mirror_required_symbol_not_supported", symbol: sig.symbol, binance_tradable: binanceSupported, bybit_tradable: bybitSupported };
  const tasks: Array<Promise<Json>> = [];
  const taskProviders: string[] = [];
  const accounts = (await Promise.all(selectedProviders.map((provider) => enumerateExecutionAccounts(supabase, provider as "binance" | "bybit")))).flat().filter((account) => account.provider === "binance" ? account.environment === "testnet" : account.environment === bybitExecutionEnvironment());
  if (accounts.length === 0) return { success: false, execution_group_id: executionGroupId, setup_blocked: true, results: [setupBlocker("router", "connected_execution_account_required", "No enabled connected account exists for selected providers")] };
  for (const ownership of accounts) {
    taskProviders.push(ownership.provider);
    tasks.push((async () => {
      const credential = await resolveEdgeProviderCredential(supabase, ownership);
      return withEdgeProviderCredential(credential, async () => {
        if (ownership.provider === "binance") return (binanceSupported || !executeSupportedProviderOnly) ? executeSignal(supabase, signalId, manual) : setupBlocker("binance", "missing_symbol_cache", `provider_symbol_cache provider=binance symbol=${sig.symbol} not tradable`, { symbol: sig.symbol });
        return (bybitSupported || !executeSupportedProviderOnly) ? executeBybitSignal(supabase, sig, executionGroupId, manual, parallel ? "parallel_mode_provider_neutral_router" : "primary_provider_router") : setupBlocker("bybit", "missing_symbol_cache", `provider_symbol_cache provider=bybit symbol=${bybitSymbol} not tradable`, { symbol: bybitSymbol });
      });
    })());
  }
  const settled = await Promise.allSettled(tasks);
  const results = settled.map((r, index) => {
    if (r.status === "fulfilled") return r.value;
    const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
    const named = ["missing_execution_settings", "missing_scanner_config", "missing_global_provider_controls", "missing_provider_control_binance", "missing_provider_control_bybit", "missing_signal", "missing_symbol_cache", "execution_order_insert_failed", "provider_result_insert_failed"].find((blocker) => message.includes(blocker));
    return { provider: taskProviders[index] ?? "unknown", success: false, blocker: named ?? "unknown_null_row", detail: message, isolated: true };
  });
  for (const result of results) {
    if (typeof (result as Json).execution_id === "string") {
      await supabase.from("execution_orders").update({ execution_group_id: executionGroupId, raw_exchange_response: { provider_neutral_signal: providerNeutralSignal(sig), router_group_attached_at: new Date().toISOString(), provider_result: result } }).eq("id", String((result as Json).execution_id));
    }
  }
  return { success: results.some((r) => (r as Json).success === true), execution_group_id: executionGroupId, routing_mode: parallel ? "parallel" : "primary", primary_provider: primary, selected_providers: selectedProviders, provider_neutral_signal: providerNeutralSignal(sig), results };
}

async function executeLatestApprovedSignal(supabase: SupabaseClient): Promise<Json> {
  assertLiveTradingImpossible();
  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .eq("market_type", "crypto")
    .in("status", ["approved", "waiting", "active", "new"])
    .in("grade", ["A", "A+"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, error: "no_approved_a_signal_found", reason: "No approved A/A+ crypto signal is available for safe testnet execution." };
  const signal = data as SignalRow;
  const settings = await getSettings(supabase);
  if (settings.live_trading_enabled) throw new Error("Live trading impossible guard blocked execution_settings.live_trading_enabled");
  const governor = await evaluateGovernor(supabase, settings);
  if (governor.blocks_execution) return governorPausedPayload(governor, settings);
  const routed = await routeSignalToEnabledProviders(supabase, signal.id, true);
  return { ...routed, latest_signal_id: signal.id, latest_symbol: signal.symbol, manual_action: "execute_latest_approved_signal", live_trading_enabled: false };
}

async function getPosition(symbol: string): Promise<{ positionAmt: string; markPrice?: string; entryPrice?: string; unrealizedProfit?: string } | null> {
  const positions = await binanceRequest<Array<{ symbol: string; positionAmt: string; markPrice?: string; entryPrice?: string; unrealizedProfit?: string }>>("GET", "/fapi/v2/positionRisk", { symbol }, true);
  return positions.find((p) => p.symbol === symbol) ?? null;
}

async function closeManaged(supabase: SupabaseClient, ex: Json, closeSide: Side, quantity: number, reason: "closed_tp2" | "closed_profit_lock" | "closed_sl" | "closed_breakeven" | "closed_expired" | "closed_expired_after_tp1" | "partially_closed", message: string): Promise<Json> {
  const result = await binanceRequest<{ orderId: number }>("POST", "/fapi/v1/order", { symbol: String(ex.symbol), side: closeSide, type: "MARKET", quantity, reduceOnly: true }, true);
  const update: Json = { status: reason, raw_exchange_response: { managed_close: result }, updated_at: new Date().toISOString() };
  if (reason === "partially_closed") {
    update.tp1_filled = true;
    const entry = Number(ex.entry_price);
    const originalSl = Number(ex.original_sl_price ?? ex.intended_sl ?? ex.stop_loss);
    const profitLock = String(ex.direction).toLowerCase() === "buy" ? entry + Math.abs(entry - originalSl) * 0.3 : entry - Math.abs(entry - originalSl) * 0.3;
    update.sl_moved_to_be = false;
    update.profit_lock_enabled = true;
    update.profit_lock_r = 0.3;
    update.profit_lock_price = profitLock;
    update.replacement_sl_price = profitLock;
    update.profit_lock_status = "managed_active";
    update.profit_lock_sl_active = true;
    update.be_stop_level = profitLock;
    update.protection_status = "protected_managed";
  }
  await supabase.from("execution_orders").update(update).eq("id", String(ex.id));
  await logEvent(supabase, String(ex.id), reason === "partially_closed" ? "managed_tp1_hit" : `managed_${reason}`, message, { result, quantity });
  const lines = reason === "partially_closed"
    ? ["TP1 hit", "Closed: 50%", "+0.3R profit-lock SL active", "Remaining position: 50%"]
    : reason === "closed_tp2"
      ? ["TP2 hit", "Closed remaining position", "Trade closed TP"]
      : reason === "closed_profit_lock"
        ? ["Profit-lock SL hit", "TP1 secured", "Trade closed with protected profit"]
        : reason === "closed_expired" || reason === "closed_expired_after_tp1"
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
      return { success: true, status: bracket.mode === "exchange_native" ? "protected_native" : "entry_filled", bracket };
    }

    if (ex.bracket_mode === "managed_exit_fallback" && !TERMINAL_STATUSES.includes(String(ex.status)) && position) {
      if (openAmt <= 0) {
        await supabase.from("execution_orders").update({ status: ex.tp1_filled ? "closed_manual" : "closed_sl", updated_at: new Date().toISOString() }).eq("id", executionId);
        return { success: true, status: ex.tp1_filled ? "closed_manual" : "closed_sl", position };
      }
      const isLong = ex.direction === "buy";
      const tp1Filled = Boolean(ex.tp1_filled) || String(ex.status) === "partially_closed";
      const entry = Number(ex.entry_price);
      const originalSl = Number(ex.original_sl_price ?? ex.intended_sl ?? ex.stop_loss);
      const profitLockSl = Number(ex.replacement_sl_price ?? ex.profit_lock_price) || (String(ex.direction).toLowerCase() === "buy" ? entry + Math.abs(entry - originalSl) * 0.3 : entry - Math.abs(entry - originalSl) * 0.3);
      const activeSl = tp1Filled ? profitLockSl : Number(ex.stop_loss);
      const hitSl = isLong ? mark <= activeSl : mark >= activeSl;
      const hitTp2 = isLong ? mark >= Number(ex.tp2) : mark <= Number(ex.tp2);
      const hitTp1 = isLong ? mark >= Number(ex.tp1) : mark <= Number(ex.tp1);
      if (hitSl && tp1Filled) return closeManaged(supabase, ex, closeSide, floorToStep(openAmt, rules.stepSize, rules.quantityPrecision), "closed_profit_lock", "Profit-lock SL hit / remaining position closed by managed fallback");
      if (hitSl) return closeManaged(supabase, ex, closeSide, floorToStep(openAmt, rules.stepSize, rules.quantityPrecision), "closed_sl", "SL hit / full position closed by managed fallback");
      if (hitTp2) return closeManaged(supabase, ex, closeSide, floorToStep(openAmt, rules.stepSize, rules.quantityPrecision), "closed_tp2", "TP2 hit / remaining position closed by managed fallback");
      if (hitTp1 && !tp1Filled) return closeManaged(supabase, ex, closeSide, floorToStep(openAmt * 0.5, rules.stepSize, rules.quantityPrecision), "partially_closed", "TP1 hit / 50% closed by managed fallback; +0.3R profit lock active");
      await supabase.from("execution_orders").update({ status: tp1Filled ? "partially_closed" : "entry_filled", protection_status: "protected_managed", bracket_mode: "managed_exit_fallback", raw_exchange_response: raw, updated_at: new Date().toISOString() }).eq("id", executionId);
      return { success: true, status: tp1Filled ? "partially_closed" : "entry_filled", bracket_mode: "managed_exit_fallback", protection_status: "protected_managed", mark_price: mark };
    }

    const [tp1, tp2, sl] = await Promise.all([
      fetchAlgoOrderStatus(String(ex.symbol), ex.tp1_algo_id ?? ex.tp1_order_id),
      fetchAlgoOrderStatus(String(ex.symbol), ex.tp2_algo_id ?? ex.tp2_order_id),
      fetchAlgoOrderStatus(String(ex.symbol), ex.sl_algo_id ?? ex.sl_order_id),
    ]);
    raw.orders = { tp1, tp2, sl } as Json;
    let status = String(ex.status);
    const tp1Filled = Boolean(ex.tp1_filled) || algoFilled(tp1?.status) || status === "partially_closed";
    if (algoFilled(sl?.status) && tp1Filled) {
      await cancelAlgoOrder(String(ex.symbol), ex.tp2_algo_id ?? ex.tp2_order_id);
      status = "closed_profit_lock";
      await sendExecutionTelegram(supabase, signalId, "closed_profit_lock", ["Profit-lock SL hit", "TP1 secured", "Trade closed with protected profit"]);
    } else if (algoFilled(sl?.status)) {
      await Promise.all([cancelAlgoOrder(String(ex.symbol), ex.tp1_algo_id ?? ex.tp1_order_id), cancelAlgoOrder(String(ex.symbol), ex.tp2_algo_id ?? ex.tp2_order_id)]);
      status = "closed_sl";
      await sendExecutionTelegram(supabase, signalId, "closed_sl", ["SL hit", "Full position closed"]);
    } else if (algoFilled(tp2?.status)) {
      await cancelAlgoOrder(String(ex.symbol), ex.sl_algo_id ?? ex.sl_order_id);
      status = "closed_tp2";
      await sendExecutionTelegram(supabase, signalId, "closed_tp2", ["TP2 hit", "Closed remaining position", "Trade closed TP"]);
    } else if (algoFilled(tp1?.status) && !ex.tp1_filled) {
      const remaining = openAmt > 0 ? openAmt : Number(ex.tp2_order_id ? ex.quantity : 0) * 0.5;
      const be = await submitProfitLockSl(supabase, executionId, ex, closeSide, remaining, rules);
      status = "partially_closed";
      await sendExecutionTelegram(supabase, signalId, "partially_closed", ["TP1 hit", "Closed: 50%", be.error ? `Profit-lock SL failed: ${be.error}` : "Profit-lock SL active at +0.3R", "Remaining position: 50%"]);
    } else if (ex.sl_order_id && ex.tp1_order_id && ex.tp2_order_id && !TERMINAL_STATUSES.includes(status)) {
      status = tp1Filled ? "partially_closed" : "protected_native";
    }
    const protectionStatus = status === "protected_native" || status === "partially_closed" ? "protected_native" : ex.protection_status;
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
    ? await supabase.from("execution_orders").select("status,quantity,volume,entry_order_id,binance_entry_order_id,sl_order_id,tp1_order_id,tp2_order_id,binance_sl_order_id,binance_tp1_order_id,binance_tp2_order_id,sl_algo_id,tp1_algo_id,tp2_algo_id,sl_client_algo_id,tp1_client_algo_id,tp2_client_algo_id,native_protection_verified,managed_fallback_active,bracket_mode,protection_status,latest_protection_error,tp1_quantity,tp2_quantity,remaining_quantity,raw_exchange_response").eq("id", String(execution.execution_id)).maybeSingle()
    : { data: null };
  const { data: monitorSettings } = await supabase
    .from("execution_settings")
    .select("latest_monitor_run_at,latest_monitor_status,latest_monitor_result,last_managed_exit_action,open_binance_positions,open_binance_orders")
    .eq("id", 1)
    .maybeSingle();
  const resultRow = (row as Json | null) ?? null;
  const totalQuantity = resultRow?.quantity ?? resultRow?.volume ?? plan.quantity;
  const managedFallbackActive = Boolean(resultRow?.managed_fallback_active) || (String(resultRow?.bracket_mode ?? "") === "managed_exit_fallback" && String(resultRow?.protection_status ?? "") === "protected_managed");
  const protectedState = ["protected", "protected_native", "protected_managed"].includes(String(resultRow?.protection_status ?? ""));
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
      native_sl_order_detected: nativeOrderCreated(resultRow, "sl_algo_id") || nativeOrderCreated(resultRow, "binance_sl_order_id") || nativeOrderCreated(resultRow, "sl_order_id"),
      native_tp1_order_detected: nativeOrderCreated(resultRow, "tp1_algo_id") || nativeOrderCreated(resultRow, "binance_tp1_order_id") || nativeOrderCreated(resultRow, "tp1_order_id"),
      native_tp2_order_detected: nativeOrderCreated(resultRow, "tp2_algo_id") || nativeOrderCreated(resultRow, "binance_tp2_order_id") || nativeOrderCreated(resultRow, "tp2_order_id"),
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
      native_verified: Boolean(resultRow?.native_protection_verified),
      sl_algo_id: resultRow?.sl_algo_id ?? null,
      tp1_algo_id: resultRow?.tp1_algo_id ?? null,
      tp2_algo_id: resultRow?.tp2_algo_id ?? null,
      monitor_status: (monitorSettings as Json | null)?.latest_monitor_status ?? null,
      monitor_run_at: (monitorSettings as Json | null)?.latest_monitor_run_at ?? null,
      monitor_result: (monitorSettings as Json | null)?.latest_monitor_result ?? null,
      latest_protection_error: resultRow?.latest_protection_error ?? null,
    },
  };
}


async function diagnoseMarginFallback(supabase: SupabaseClient, signalId: string): Promise<Json> {
  assertLiveTradingImpossible();
  const validated = await validateSelectedSignal(supabase, signalId);
  if (!isSignalRow(validated)) return validated;
  const settings = await getSettings(supabase);
  const governor = await evaluateGovernor(supabase, settings);
  const initial = buildPlan(validated, await getRules(validated.symbol), await capitalSnapshot(settings), settings, governor);
  initial.capital.raw_available_usdt = 0;
  const prepared = await applyMarginFallbackToPlan(validated, initial, { ...settings, enable_usdc_margin_backup: true });
  const proof = { ...prepared.diagnostics, diagnostic_mode: true, simulated_usdt_available: 0, final_execution_status: prepared.selection.placeOrder ? "diagnostic_ready_no_order_placed" : "diagnostic_skip_no_order_placed" };
  const skipped = await createSkipped(supabase, validated, prepared.selection.placeOrder ? "diagnostic_usdc_backup_available_no_order_placed" : (prepared.selection.reasons.at(-1) ?? "diagnostic_margin_unavailable"), {
    selected_margin_asset: prepared.selection.selectedMarginAsset,
    margin_asset_selected: prepared.selection.selectedMarginAsset,
    margin_backup_attempted: prepared.selection.backupAttempted,
    margin_backup_asset_used: prepared.selection.backupAssetUsed,
    margin_fallback_used: prepared.selection.backupAssetUsed === "USDC",
    insufficient_margin_reason: prepared.selection.reasons.join(","),
    requested_margin: proof.requested_margin,
    requested_notional: proof.requested_notional,
    raw_exchange_response: { margin_diagnostic_proof: proof, margin_selection: prepared.selection },
  });
  return { ...skipped, diagnostic: proof, margin_selection: prepared.selection };
}

async function statusPayload(supabase: SupabaseClient): Promise<Json> {
  const settings = await getSettings(supabase);
  const [executions, failed, skipped, latestError] = await Promise.all([
    supabase.from("execution_orders").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("execution_orders").select("id", { count: "exact", head: true }).eq("status", "skipped"),
    supabase.from("execution_orders").select("last_exchange_error,error_message,insufficient_margin_reason,margin_backup_attempted,margin_backup_asset_used,margin_fallback_used,selected_margin_asset,status").eq("exchange", "binance_usdm_testnet").not("insufficient_margin_reason", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const capital = await capitalSnapshot(settings).catch(() => zeroCapital(settings));
  const account_state = await fetchAccountState().catch(() => null);
  const governor = await evaluateGovernor(supabase, settings, account_state ?? undefined).catch(() => null);
  const current_open_risk_pct = await currentOpenRiskPct(supabase).catch(() => 0);
  const max_total_open_risk_pct = maxTotalOpenRiskPct(settings);
  const governorIgnored = (settings.testnet_governor_mode ?? "normal") === "off_for_testing";
  const effectiveRiskPct = stressModeActive(settings) ? Number(settings.stress_risk_pct ?? 2) : null;
  const effectiveLeverage = stressModeActive(settings) ? Number(settings.stress_leverage ?? 10) : null;
  return { success: true, settings, capital, account_state, governor: governor ? { ...governor, effective_state: governorIgnored ? "IGNORED" : governor.state, display_state: governorIgnored ? "IGNORED" : governor.state } : governor, execution_allowed: governorIgnored ? true : (governor ? !governor.blocks_execution : settings.governor_state !== "paused"), current_open_risk_pct, max_total_open_risk_pct, remaining_risk_capacity_pct: stressOpenRiskIgnored(settings) ? null : Math.max(0, max_total_open_risk_pct - current_open_risk_pct), effective_risk_pct: effectiveRiskPct, effective_leverage: effectiveLeverage, risk_source: stressModeActive(settings) ? "testnet_stress_override" : "normal_arbitrated_grade_signal_sizing", leverage_source: stressModeActive(settings) ? "testnet_stress_override" : "normal_leverage_logic", governor_display: { mode: String(settings.testnet_governor_mode ?? "normal").toUpperCase(), state: governorIgnored ? "IGNORED" : String(governor?.state ?? settings.governor_state ?? "normal").toUpperCase(), execution_allowed: governorIgnored ? true : (governor ? !governor.blocks_execution : settings.governor_state !== "paused") }, env: { execution_mode: Deno.env.get("EXECUTION_MODE") || "signal_only", exchange: Deno.env.get("EXCHANGE") || "binance_usdm_testnet", testnet_enabled: envBool("TESTNET_ENABLED", false), live_trading_enabled: envBool("LIVE_TRADING_ENABLED", false), base_url: safeBaseUrl(), api_key_configured: Boolean(Deno.env.get("BINANCE_TESTNET_API_KEY")), api_secret_configured: Boolean(Deno.env.get("BINANCE_TESTNET_API_SECRET")) }, executions: executions.data ?? [], failed_count: failed.count ?? 0, skipped_count: skipped.count ?? 0, latest_error: latestError.data ?? null, last_insufficient_margin: latestError.data ? { reason: (latestError.data as Json).insufficient_margin_reason ?? (latestError.data as Json).last_exchange_error, backup_attempted: (latestError.data as Json).margin_backup_attempted, backup_asset_used: (latestError.data as Json).margin_backup_asset_used, fallback_used: (latestError.data as Json).margin_fallback_used, selected_asset: (latestError.data as Json).selected_margin_asset, final_result: (latestError.data as Json).status } : null };
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

async function executionReadiness(supabase: SupabaseClient, providerName: "binance" | "bybit"): Promise<Json> {
  const settings = await getSettings(supabase);
  const control = await getProviderControl(supabase, providerName);
  const globalBlockers = [
    settings.live_trading_enabled ? "live_trading_enabled" : null,
    settings.execution_mode !== "testnet" ? "execution_mode_not_testnet" : null,
    !settings.testnet_enabled ? "db_testnet_disabled" : null,
    !settings.auto_execute_testnet ? "auto_execute_testnet_false" : null,
    settings.bot_paused ? "bot_paused" : null,
    settings.kill_switch_enabled ? "global_kill_switch" : null,
  ].filter(Boolean);
  const providerBlocker = providerEntryBlocked(control);
  return { accepted: globalBlockers.length === 0 && !providerBlocker, provider: providerName, blocker: providerBlocker ?? globalBlockers[0] ?? null, db_row_source: { global: "execution_settings.id=1", provider: `execution_provider_controls.provider_name=${providerName}` }, function_path_reached: "executionReadiness", would_submit_order: globalBlockers.length === 0 && !providerBlocker };
}

async function parallelDryRun(supabase: SupabaseClient, signalId: string): Promise<Json> {
  const binance = await executionReadiness(supabase, "binance");
  const bybit = await executionReadiness(supabase, "bybit");
  const validated = await validateSelectedSignal(supabase, signalId);
  return { success: true, accepted: [binance, bybit].some((r) => (r as Json).accepted === true), provider: "parallel", blocker: null, db_row_source: { global: "execution_settings.id=1", providers: "execution_provider_controls" }, function_path_reached: "parallelDryRun -> validateSelectedSignal", would_submit_order: false, signal_valid: isSignalRow(validated), results: [binance, bybit] };
}

async function updateSettings(supabase: SupabaseClient, patch: Json): Promise<Json> {
  const allowed = ["enable_usdc_margin_backup", "prefer_margin_asset", "allow_margin_assets", "max_retry_assets", "enable_profit_lock_engine", "enable_testnet_profit_lock_engine", "profit_lock_before_tp1", "profit_lock_before_tp1_testnet_allowed", "profit_lock_min_r", "profit_lock_aggressive_min_r", "profit_lock_buffer_r", "profit_lock_after_tp1", "profit_lock_max_updates_per_trade", "profit_lock_cooldown_minutes", "auto_execute_testnet", "auto_execute_enabled", "emergency_stop", "capital_basis", "testnet_capital_override_usdt", "max_capital_used_usdt", "testnet_risk_a", "testnet_risk_a_plus", "max_testnet_risk_pct", "testnet_leverage_a", "testnet_leverage_a_plus", "testnet_max_leverage", "max_open_testnet_positions", "max_total_open_risk_pct", "one_active_execution_per_symbol", "kill_switch_enabled", "execution_mode", "testnet_enabled", "governor_enabled", "testnet_governor_mode", "daily_start_equity", "max_daily_loss_pct", "max_unrealized_drawdown_pct", "aggressive_allowed_profit_pct", "defensive_loss_pct", "max_consecutive_failed_executions", "max_consecutive_closed_sl", "stress_override_enabled", "stress_risk_pct", "stress_leverage", "stress_ignore_open_risk_limit", "bot_paused", "bot_paused_reason"];
  const update: Json = { updated_at: new Date().toISOString() };
  for (const key of allowed) if (key in patch) update[key] = patch[key];
  if ("testnet_governor_mode" in update && !["normal", "readonly", "off_for_testing"].includes(String(update.testnet_governor_mode))) throw new Error("Invalid testnet_governor_mode");
  if ("auto_execute_testnet" in update) update.auto_execute_enabled = update.auto_execute_testnet;
  if (patch.start_bot === true) { update.auto_execute_testnet = true; update.auto_execute_enabled = true; update.testnet_enabled = true; update.execution_mode = "testnet"; update.bot_paused = false; update.bot_paused_reason = null; update.kill_switch_enabled = false; update.emergency_stop = false; }
  if (patch.emergency_stop === true) { update.auto_execute_testnet = false; update.auto_execute_enabled = false; update.emergency_stop = true; update.kill_switch_enabled = true; }
  update.live_trading_enabled = false;
  const { data, error } = await supabase.from("execution_settings").update(update).eq("id", 1).select("*").single();
  if (error) throw new Error(error.message);
  if (patch.start_bot === true || patch.pause_entries === true || patch.provider_kill_switch === true || patch.emergency_stop === true) {
    const providerName = String(patch.provider ?? "binance");
    if (["binance", "bybit"].includes(providerName)) {
      const providerUpdate: Json = { updated_at: new Date().toISOString() };
      if (patch.start_bot === true) Object.assign(providerUpdate, { enabled: true, entry_enabled: true, read_only: false, provider_kill_switch: false, kill_switch: false });
      if (patch.pause_entries === true) Object.assign(providerUpdate, { entry_enabled: false });
      if (patch.provider_kill_switch === true) Object.assign(providerUpdate, { entry_enabled: false, provider_kill_switch: true, kill_switch: true });
      if (patch.emergency_stop === true) Object.assign(providerUpdate, { entry_enabled: false, monitor_enabled: false, protection_recovery_enabled: false, recovery_enabled: false, provider_kill_switch: true, kill_switch: true });
      await supabase.from("execution_provider_controls").update(providerUpdate).eq("provider_name", providerName);
    }
  }
  return { success: true, settings: data as Json, provider: patch.provider ?? null, db_write_result: { execution_settings: data, provider_controls_updated: Boolean(patch.start_bot || patch.pause_entries || patch.provider_kill_switch || patch.emergency_stop) } };
}


type ProviderExposure = {
  wallet_reachable: boolean;
  positions: Json[];
  open_orders: Json[];
  fetch_duration_ms: number;
  error: string | null;
  exchange_call_count: number;
};

function activeExposurePositions(providerName: "binance" | "bybit", raw: Json[]): Json[] {
  return raw.filter((row) => Math.abs(Number(providerName === "binance" ? row.positionAmt : row.size ?? row.positionAmt ?? 0)) > 0);
}

async function fetchProviderExposure(providerName: "binance" | "bybit"): Promise<ProviderExposure> {
  const started = Date.now();
  try {
    if (providerName === "binance") {
      const [positionsRaw, openOrders] = await Promise.all([
        binanceRequest<Json[]>("GET", "/fapi/v2/positionRisk", {}, true),
        fetchNativeOpenProtection(),
      ]);
      return { wallet_reachable: true, positions: activeExposurePositions(providerName, positionsRaw), open_orders: openOrders, fetch_duration_ms: Date.now() - started, error: null, exchange_call_count: 3 };
    }
    const [positionsResult, ordersResult] = await Promise.all([
      bybitRequest<Json>("GET", "/v5/position/list", { category: "linear", settleCoin: "USDT" }),
      bybitRequest<Json>("GET", "/v5/order/realtime", { category: "linear", settleCoin: "USDT", openOnly: 0 }),
    ]);
    const positions = activeExposurePositions(providerName, (((positionsResult as Json).list ?? []) as Json[]));
    const openOrders = (((ordersResult as Json).list ?? []) as Json[]);
    return { wallet_reachable: true, positions, open_orders: openOrders, fetch_duration_ms: Date.now() - started, error: null, exchange_call_count: 2 };
  } catch (e) {
    return { wallet_reachable: false, positions: [], open_orders: [], fetch_duration_ms: Date.now() - started, error: e instanceof Error ? e.message : String(e), exchange_call_count: providerName === "binance" ? 3 : 2 };
  }
}

function tradeTruthRowFromRaw(providerName: "binance" | "bybit", pos: Json, openOrders: Json[], now: string): Json | null {
  const environment = providerName === "binance" ? "testnet" : bybitExecutionEnvironment();
  const symbol = String(pos.symbol ?? "");
  if (!symbol) return null;
  const qty = Math.abs(Number(pos.positionAmt ?? pos.size ?? 0));
  const side = String(pos.positionSide ?? pos.side ?? (Number(pos.positionAmt ?? 0) >= 0 ? "long" : "short")).toLowerCase().includes("sell") || Number(pos.positionAmt ?? 0) < 0 ? "short" : "long";
  const rowForClassification = { provider: providerName, environment, symbol, side, mark_price: Number(pos.markPrice ?? 0) || Number(pos.entryPrice ?? pos.avgPrice ?? 0) || null, entry_price: Number(pos.entryPrice ?? pos.avgPrice ?? 0) || null } as Json;
  const classified = classifyRawProtection(providerName, rowForClassification, openOrders);
  return {
    provider: providerName, environment, symbol, side, qty,
    entry_price: Number(pos.entryPrice ?? pos.avgPrice ?? 0) || null,
    mark_price: Number(pos.markPrice ?? 0) || null,
    unrealized_pnl: Number(pos.unRealizedProfit ?? pos.unrealisedPnl ?? 0) || 0,
    exchange_position_id: String(pos.positionIdx ?? pos.positionId ?? symbol),
    sl_order_id: String(classified.sl?.orderId ?? classified.sl?.algoId ?? "") || null,
    tp1_order_id: String(classified.tp1?.orderId ?? classified.tp1?.algoId ?? "") || null,
    tp2_order_id: String(classified.tp2?.orderId ?? classified.tp2?.algoId ?? "") || null,
    sl_present: Boolean(classified.sl), tp1_present: Boolean(classified.tp1), tp2_present: Boolean(classified.tp2),
    protection_status: classified.status,
    profit_lock_eligible: false,
    profit_lock_status: "inactive",
    profit_lock_reason: classified.status === "protected" ? "supervisor_found_exchange_protection" : "awaiting_full_protection",
    next_lock_check_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    monitor_status: "synced",
    recovery_status: "none",
    latest_error: classified.latest_error ?? null,
    latest_sync_at: now,
    last_action_taken: "syncProviderPositions",
    updated_at: now,
  };
}

async function syncTradeManagementTruthFromExposure(supabase: SupabaseClient, providerName: "binance" | "bybit", exposure: ProviderExposure): Promise<Json> {
  const now = new Date().toISOString();
  const environment = providerName === "binance" ? "testnet" : bybitExecutionEnvironment();
  const ownership = currentEdgeOwnership(providerName);
  if (!exposure.wallet_reachable) return { success: false, provider: providerName, wallet_reachable: false, positions_fetch_success: false, orders_fetch_success: false, open_positions_found: 0, open_orders_found: 0, protected_count: 0, unsafe_count: 0, closed_marked: 0, blocker: exposure.error, latest_sync_at: now };
  let protectedCount = 0;
  let unsafeCount = 0;
  const openSymbols = new Set<string>();
  const rows = exposure.positions.map((pos) => tradeTruthRowFromRaw(providerName, pos, exposure.open_orders, now)).filter(Boolean) as Json[];
  for (const row of rows) {
    openSymbols.add(String(row.symbol));
    if (row.protection_status === "protected") protectedCount += 1; else unsafeCount += 1;
    await upsertTradeManagementTruthRow(supabase, { ...row, ...runtimeOwnershipFields(ownership) }, { onConflict: "execution_scope_key,provider,environment,symbol,side" });
  }
  const { data: existing } = await supabase.from("trade_management_truth").select("provider,environment,symbol,side").eq("execution_scope_key", ownership.execution_scope_key).eq("provider", providerName).eq("environment", environment).neq("protection_status", "closed");
  let closedMarked = 0;
  for (const row of ((existing ?? []) as Json[])) {
    if (!openSymbols.has(String(row.symbol))) {
      await persistTradeManagementTruthByIdentity(supabase, {execution_scope_key:ownership.execution_scope_key,provider:providerName,environment,symbol:String(row.symbol),side:row.side}, { protection_status: "closed", monitor_status: "closed", latest_sync_at: now, last_action_taken: "mark_closed_exchange_truth", updated_at: now });
      closedMarked += 1;
    }
  }

  // Strict reconciliation trigger for execution_orders
  const activeStatuses = ["pending", "entry_submitted", "entry_filled", "protected", "protected_native", "pending_protection", "protection_pending", "protection_failed", "protection_recovered", "protected_managed", "pending_managed_protection", "partially_closed"];
  const { data: activeExecutions } = await supabase.from("execution_orders")
    .select("*")
    .eq("execution_provider", providerName)
    .eq("execution_scope_key", ownership.execution_scope_key)
    .eq("environment", environment)
    .in("status", activeStatuses);

  if (activeExecutions && activeExecutions.length > 0) {
    for (const exec of activeExecutions) {
      const execSymbol = String(exec.symbol).toUpperCase();
      const matchedPosition = exposure.positions.find(p => String(p.symbol).toUpperCase() === execSymbol);
      const posAmt = Math.abs(Number(providerName === "binance" ? matchedPosition?.positionAmt ?? 0 : matchedPosition?.size ?? 0));
      const hasPos = posAmt > 0;

      if (!hasPos) {
        // If there is no position on the exchange, this execution order is closed!
        await supabase.from("execution_orders").update({
          status: "closed_synced",
          protection_status: "unprotected",
          native_protection_verified: false,
          remaining_quantity: 0,
          current_position_size: 0,
          last_monitor_action: "sync_all_positions_now_reconciliation",
          updated_at: now
        }).eq("id", exec.id);
      } else {
        // If there is a position, let's sync the SL/TP status from the exchange's open orders!
        const symbolOrders = exposure.open_orders.filter(o => String(o.symbol).toUpperCase() === execSymbol);
        const rowLike = { symbol: execSymbol, side: exec.side, provider: providerName, environment };
        const confirmed = classifyRawProtection(providerName, rowLike, symbolOrders);
        const ok = confirmed.status === "protected";
        
        await supabase.from("execution_orders").update({
          status: ok ? "protected_native" : "entry_filled",
          protection_status: confirmed.status === "protected" ? "protected_native" : confirmed.status,
          native_protection_verified: ok,
          current_position_size: Number(providerName === "binance" ? matchedPosition?.positionAmt ?? posAmt : matchedPosition?.size ?? posAmt),
          latest_mark_price: Number(matchedPosition?.markPrice ?? 0),
          sl_order_id: String(confirmed.sl?.orderId ?? confirmed.sl?.algoId ?? "") || null,
          tp1_order_id: String(confirmed.tp1?.orderId ?? confirmed.tp1?.algoId ?? "") || null,
          tp2_order_id: String(confirmed.tp2?.orderId ?? confirmed.tp2?.algoId ?? "") || null,
          last_monitor_checked_at: now,
          updated_at: now
        }).eq("id", exec.id);
      }
    }
  }

  return { success: true, provider: providerName, wallet_reachable: true, positions_fetch_success: true, orders_fetch_success: true, open_positions_found: rows.length, open_orders_found: exposure.open_orders.length, protected_count: protectedCount, unsafe_count: unsafeCount, closed_marked: closedMarked, latest_sync_at: now, rows };
}

async function syncTradeManagementTruth(supabase: SupabaseClient, providerName: "binance" | "bybit", selection?: { customerId?: string; accountId?: string }): Promise<Json> {
  const environment = providerName === "binance" ? "testnet" : bybitExecutionEnvironment();
  try {
    const resolved = await resolveOperatorProviderCredential(supabase, providerName, environment, selection);
    return await withEdgeProviderCredential(resolved.credential, async () => {
      const exposure = await fetchProviderExposure(providerName);
      // System credentials have no durable connected-account identity. They may
      // inspect provider truth but cannot write customer/account-owned rows.
      if (resolved.source === "system_secret") return { success: !exposure.error, provider: providerName, environment, credential_resolution: { source: resolved.source, attempted: resolved.attempts }, read_only_account_snapshot: true, writes_skipped: "system_secret_has_no_connected_account_identity", wallet_reachable: exposure.wallet_reachable, positions_fetch_success: !exposure.error, orders_fetch_success: !exposure.error, open_positions_found: exposure.positions.length, open_orders_found: exposure.open_orders.length, blocker: exposure.error };
      const synced = await syncTradeManagementTruthFromExposure(supabase, providerName, exposure);
      const ownership = resolved.credential.ownership;
      return { ...synced, credential_resolution: { source: resolved.source, attempted: resolved.attempts }, account: { account_id: ownership.account_id, execution_scope_key: ownership.execution_scope_key, environment: ownership.environment } };
    });
  } catch (error) {
    const blocker = error instanceof Error ? error.message : String(error);
    return { success: false, provider: providerName, environment, blocker, wallet_reachable: false, positions_fetch_success: false, orders_fetch_success: false, read_only: true };
  }
}

async function proveProviderReadOnly(supabase: SupabaseClient, providerName: "binance" | "bybit", selection?: { customerId?: string; accountId?: string }): Promise<Json> {
  const environment = providerName === "binance" ? "testnet" : bybitExecutionEnvironment();
  try {
    const resolved = await resolveOperatorProviderCredential(supabase, providerName, environment, selection);
    const { credential } = resolved;
    const ownership = credential.ownership;
    return await withEdgeProviderCredential(credential, async () => {
      const [exposure, balance] = await Promise.all([
        fetchProviderExposure(providerName),
        providerName === "binance"
          ? binanceRequest<Json>("GET", "/fapi/v2/account", {}, true)
          : bybitRequest<Json>("GET", "/v5/account/wallet-balance", { accountType: "UNIFIED" }),
      ]);
      const classifications = activeExposurePositions(providerName, exposure.positions).map((position) => {
        const row = tradeTruthRowFromRaw(providerName, position, exposure.open_orders, new Date().toISOString());
        const state = !row ? "unknown" : row.protection_status === "protected" ? "protected" : row.protection_status === "partially_protected" ? "partially_protected" : "unsafe";
        return { symbol: row?.symbol ?? null, state, missing_parts: row?.missing_parts ?? [] };
      });
      return {
        success: !exposure.error, provider: providerName, environment, target: providerName === "binance" ? "binance-testnet-execution" : "bybit-demo-execution",
        read_only: true, mutations_attempted: 0, wallet_reachable: exposure.wallet_reachable,
        balances_fetch_success: Boolean(balance), positions_fetch_success: !exposure.error, orders_fetch_success: !exposure.error,
        positions_found: exposure.positions.length, open_orders_found: exposure.open_orders.length,
        protection: classifications, blocker: exposure.error,
        credential_resolution: { source: resolved.source, attempted: resolved.attempts },
        account: { account_id: ownership.account_id, execution_scope_key: ownership.execution_scope_key },
      };
    });
  } catch (error) {
    const blocker = error instanceof Error ? error.message : String(error);
    return { success: false, provider: providerName, environment, target: providerName === "binance" ? "binance-testnet-execution" : "bybit-demo-execution", read_only: true, mutations_attempted: 0, blocker, credential_resolution: { attempted: error instanceof OperatorCredentialResolutionError ? error.attempts : { explicit_account: Boolean(selection?.accountId), operational_account: !selection?.accountId, system_secret: !selection?.accountId } } };
  }
}


function truthSideFromRow(row: Json): "BUY" | "SELL" {
  return String(row.side).toLowerCase() === "long" ? "SELL" : "BUY";
}
function bybitCloseSideFromRow(row: Json): "Buy" | "Sell" {
  return String(row.side).toLowerCase() === "long" ? "Sell" : "Buy";
}
function protectionPrices(row: Json): { entry: number; stopLoss: number; tp1: number; tp2: number } {
  const entry = Number(row.entry_price ?? row.mark_price ?? 0);
  const mark = Number(row.mark_price ?? row.entry_price ?? 0);
  const isLong = String(row.side).toLowerCase() === "long";
  return { entry, stopLoss: isLong ? mark * 0.994 : mark * 1.006, tp1: isLong ? mark * 1.005 : mark * 0.995, tp2: isLong ? mark * 1.01 : mark * 0.99 };
}
function orderSideMatches(order: Json, closeSide: string): boolean {
  return !order.side || String(order.side).toLowerCase() === closeSide.toLowerCase();
}
function isReduceOnlyOrder(order: Json): boolean {
  return String(order.reduceOnly ?? "").toLowerCase() === "true" || String(order.closeOnTrigger ?? "").toLowerCase() === "true" || String(order.closePosition ?? "").toLowerCase() === "true";
}
function rawTrigger(order: Json): number {
  return Number(order.triggerPrice ?? order.stopPrice ?? order.price ?? 0);
}
function rawOrderText(order: Json): string {
  return String(`${order.type ?? ""} ${order.orderType ?? ""} ${order.stopOrderType ?? ""} ${order.orderFilter ?? ""} ${order.orderLinkId ?? ""} ${order.clientAlgoId ?? ""}`).toLowerCase();
}
function rawProtectionValid(row: Json, order: Json, label: "sl" | "tp"): boolean {
  const trigger = rawTrigger(order);
  const mark = Number(row.mark_price ?? row.entry_price ?? 0);
  if (!Number.isFinite(trigger) || trigger <= 0 || !Number.isFinite(mark) || mark <= 0) return false;
  const isLong = String(row.side).toLowerCase() === "long";
  const shouldBeAbove = isLong ? label === "tp" : label === "sl";
  const actualAbove = trigger > mark;
  const direction = Number(order.triggerDirection ?? 0);
  return shouldBeAbove === actualAbove && (direction === 0 || direction === (actualAbove ? 1 : 2));
}
function classifyRawProtection(providerName: "binance" | "bybit", row: Json, openOrders: Json[]): { sl?: Json; tp1?: Json; tp2?: Json; status: string; protected: boolean; degraded: boolean; unsafe: boolean; missing_parts: string[]; duplicate_orders_found: number; matching_order_ids: string[]; latest_error: string | null } {
  const closeSide = providerName === "binance" ? truthSideFromRow(row) : bybitCloseSideFromRow(row);
  const matching = openOrders.filter((order) => String(order.symbol ?? "") === String(row.symbol) && isReduceOnlyOrder(order) && orderSideMatches(order, closeSide));
  const stops = matching.filter((order) => /stop|sl/.test(rawOrderText(order)) && !/take/.test(rawOrderText(order)) && rawProtectionValid(row, order, "sl"));
  const takes = matching.filter((order) => /take|profit|tp/.test(rawOrderText(order)) && rawProtectionValid(row, order, "tp"));
  const isLong = String(row.side).toLowerCase() === "long";
  const [tp1, tp2] = takes.sort((a, b) => isLong ? rawTrigger(a) - rawTrigger(b) : rawTrigger(b) - rawTrigger(a));
  const sl = stops.sort((a, b) => Math.abs(rawTrigger(a) - Number(row.mark_price ?? row.entry_price ?? 0)) - Math.abs(rawTrigger(b) - Number(row.mark_price ?? row.entry_price ?? 0)))[0];
  const status = sl && tp1 && tp2 ? "protected" : !sl ? "missing_sl" : "missing_tp";
  const missing_parts = [!sl ? "sl" : null, !tp1 ? "tp1" : null, !tp2 ? "tp2" : null].filter(Boolean) as string[];
  return { sl, tp1, tp2, status, protected: status === "protected", degraded: missing_parts.length > 0 && missing_parts.length < 3, unsafe: status !== "protected", missing_parts, duplicate_orders_found: Math.max(0, stops.length - 1) + Math.max(0, takes.length - 2), matching_order_ids: matching.map((order) => openOrderId(order)).filter(Boolean), latest_error: status === "protected" ? null : `missing_${missing_parts.join("_")}` };
}
async function fetchProviderOpenOrders(providerName: "binance" | "bybit", symbol?: string): Promise<Json[]> {
  if (providerName === "binance") return await fetchNativeOpenProtection(symbol);
  const result = await bybitRequest<Json>("GET", "/v5/order/realtime", { category: "linear", ...(symbol ? { symbol } : { settleCoin: "USDT" }), openOnly: 0 });
  return (((result as Json).list ?? []) as Json[]);
}
async function placeProviderProtectionOrder(providerName: "binance" | "bybit", row: Json, label: "sl" | "tp1" | "tp2", livePosition?: Json): Promise<Json> {
  const prices = protectionPrices(row);
  const rawTriggerPrice = label === "sl" ? prices.stopLoss : label === "tp1" ? prices.tp1 : prices.tp2;
  const symbol = String(row.symbol);
  if (!Number.isFinite(rawTriggerPrice) || rawTriggerPrice <= 0) throw new Error(`${providerName} ${label} price unavailable for ${row.symbol}`);
  const rawQty = Math.abs(Number(livePosition?.positionAmt ?? livePosition?.size ?? row.qty ?? 0));
  if (!Number.isFinite(rawQty) || rawQty <= 0) throw new Error(`${providerName}_actual_position_quantity_unavailable:${symbol}`);
  if (providerName === "binance") {
    const rules = await getRules(symbol);
    const markPrice = await currentBinanceMarkPrice(symbol);
    const triggerPrice = roundProtectionPrice(rawTriggerPrice, rules);
    const qty = roundProtectionQty(rawQty, rules);
    validateProtectionSizing("binance", symbol, qty, triggerPrice, rules);
    const direction = expectedTriggerDirection(row.side, label, markPrice, triggerPrice);
    if (!direction.valid) throw new Error(`invalid_binance_trigger_direction:${JSON.stringify({ symbol, side: row.side, order_type: label, mark_price: markPrice, trigger_price: triggerPrice, expected_direction: direction.expected, actual_direction: direction.actual })}`);
    const planLike = {
      symbol,
      closeSide: truthSideFromRow(row),
    } as OrderPlan;
    const placed = await submitAlgoExitOrder(planLike, label === "sl" ? "STOP_MARKET" : "TAKE_PROFIT_MARKET", triggerPrice, qty, label);
    return placed.raw;
  }
  const rules = await getBybitRules(symbol);
  const markPrice = await currentBybitMarkPrice(symbol);
  const triggerPrice = roundProtectionPrice(rawTriggerPrice, rules);
  const qty = roundProtectionQty(rawQty, rules);
  validateProtectionSizing("bybit", symbol, qty, triggerPrice, rules);
  const direction = expectedTriggerDirection(row.side, label, markPrice, triggerPrice);
  if (!direction.valid) throw new Error(`invalid_bybit_trigger_direction:${JSON.stringify({ symbol, side: row.side, order_type: label, mark_price: markPrice, trigger_price: triggerPrice, expected_direction: direction.expected, actual_direction: direction.actual })}`);
  return await bybitRequest<Json>("POST", "/v5/order/create", { category: "linear", symbol, side: bybitCloseSideFromRow(row), orderType: "Market", qty: String(qty), triggerPrice: String(triggerPrice), triggerDirection: direction.bybitDirection, triggerBy: "MarkPrice", reduceOnly: true, closeOnTrigger: true, orderFilter: "StopOrder", orderLinkId: createBybitOrderLinkId(row.execution_order_id ?? row.symbol, label) });
}
async function repairTruthRowWithExchangeConfirmation(supabase: SupabaseClient, row: Json, action: string, exposure?: ProviderExposure): Promise<Json> {
  const providerName = String(row.provider) as "binance" | "bybit";
  const now = new Date().toISOString();
  const placed: Json = {};
  try {
    const before = exposure?.open_orders ?? await fetchProviderOpenOrders(providerName, String(row.symbol));
    const livePosition = exposure?.positions.find((p) => String(p.symbol) === String(row.symbol));
    const beforeState = classifyRawProtection(providerName, row, before);
    if (!beforeState.sl) placed.sl = await placeProviderProtectionOrder(providerName, row, "sl", livePosition);
    if (!beforeState.tp1) placed.tp1 = await placeProviderProtectionOrder(providerName, row, "tp1", livePosition);
    if (!beforeState.tp2) placed.tp2 = await placeProviderProtectionOrder(providerName, row, "tp2", livePosition);
    const after = await fetchProviderOpenOrders(providerName, String(row.symbol));
    const confirmed = classifyRawProtection(providerName, row, after);
    const anyConfirmed = Boolean(confirmed.sl || confirmed.tp1 || confirmed.tp2);
    const ok = confirmed.status === "protected";
    const update = { sl_present: Boolean(confirmed.sl), tp1_present: Boolean(confirmed.tp1), tp2_present: Boolean(confirmed.tp2), sl_order_id: String(confirmed.sl?.orderId ?? confirmed.sl?.algoId ?? "") || null, tp1_order_id: String(confirmed.tp1?.orderId ?? confirmed.tp1?.algoId ?? "") || null, tp2_order_id: String(confirmed.tp2?.orderId ?? confirmed.tp2?.algoId ?? "") || null, protection_status: confirmed.status, recovery_status: ok ? "repair_succeeded" : anyConfirmed ? "repair_attempted" : "repair_failed", monitor_status: ok || anyConfirmed ? "synced" : "error", latest_error: ok || anyConfirmed ? null : `${providerName} exchange confirmation missing after order placement`, latest_sync_at: now, last_action_taken: action, updated_at: now };
    await updateTradeManagementTruthByIdentity(supabase, { execution_scope_key:String(row.execution_scope_key??""), provider: String(row.provider), environment: String(row.environment), symbol: String(row.symbol), side: row.side }, update);
    return { provider: providerName, symbol: row.symbol, attempted: true, successful: ok, placed, confirmed: { sl: Boolean(confirmed.sl), tp1: Boolean(confirmed.tp1), tp2: Boolean(confirmed.tp2) }, blocker: ok ? null : update.latest_error };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await recordSymbolFailure(supabase, providerName, String(row.symbol), classifySymbolFailure(err), { action, message: err });
    await updateTradeManagementTruthByIdentity(supabase, { execution_scope_key:String(row.execution_scope_key??""), provider: String(row.provider), environment: String(row.environment), symbol: String(row.symbol), side: row.side }, { recovery_status: "repair_failed", monitor_status: "error", latest_error: err, latest_sync_at: now, last_action_taken: action, updated_at: now });
    return { provider: providerName, symbol: row.symbol, attempted: true, successful: false, placed, blocker: err };
  }
}

function duplicateProtectionStats(providerName: "binance" | "bybit", row: Json, openOrders: Json[]): { duplicate_orders_found: number; duplicate_orders_cancelled: number } {
  const closeSide = providerName === "binance" ? truthSideFromRow(row) : bybitCloseSideFromRow(row);
  const matching = openOrders.filter((order) => String(order.symbol ?? "") === String(row.symbol) && isReduceOnlyOrder(order) && orderSideMatches(order, closeSide));
  const validSl = matching.filter((order) => /stop|sl/.test(rawOrderText(order)) && !/take/.test(rawOrderText(order)) && rawProtectionValid(row, order, "sl"));
  const validTp = matching.filter((order) => /take|profit|tp/.test(rawOrderText(order)) && rawProtectionValid(row, order, "tp"));
  return { duplicate_orders_found: Math.max(0, validSl.length - 1) + Math.max(0, validTp.length - 2), duplicate_orders_cancelled: 0 };
}

async function recordSupervisorHeartbeat(supabase: SupabaseClient, providerName: "binance" | "bybit", result: Json, startedAt: string, triggerSource: string): Promise<void> {
  const environment = providerName === "binance" ? "testnet" : bybitExecutionEnvironment();
  await supabase.from("execution_monitor_heartbeats").upsert({
    provider: providerName,
    environment,
    run_id: String(result.run_id),
    started_at: startedAt,
    completed_at: String(result.latest_run),
    success: result.latest_success === true,
    monitor_status: result.latest_success === true ? "healthy" : "error",
    positions_seen: Number(result.positions_found ?? 0),
    orders_seen: Number(result.orders_found ?? 0),
    protections_created: Number(result.repair_successes ?? 0),
    protections_missing: Number(result.unsafe_count ?? 0),
    stale_orders_cleaned: Number(result.duplicate_orders_cancelled ?? 0),
    latest_recovery_action: Number(result.repair_attempts ?? 0) > 0 ? "run_trade_supervisor_cycle" : "sync_only",
    latest_telegram_event: result.telegram_admin_sent === true ? "critical_unprotected_position" : null,
    trigger_source: triggerSource,
    is_automatic: triggerSource === "pg_cron",
    errors: result.latest_error ? [result.latest_error] : [],
    metadata: result,
    updated_at: String(result.latest_run),
  }, { onConflict: "provider,environment,run_id" });
  await supabase.from("execution_monitor_schedules").update({ last_run_at: String(result.latest_run), last_success: result.latest_success === true, last_error: result.latest_error ?? null, updated_at: String(result.latest_run) }).eq("provider", providerName).eq("function_name", "binance-testnet-execution:run_trade_supervisor_cycle");
  await supabase.from("scanner_config").update({ trade_supervisor_last_run_at: String(result.latest_run) }).eq("id", 1);
}

async function getSupervisorControls(supabase: SupabaseClient): Promise<{ supervisor_enabled: boolean; auto_repair_enabled: boolean; max_repairs_per_provider_per_cycle: number; max_duplicate_cancels_per_cycle: number }> {
  const { data } = await supabase.from("scanner_config").select("supervisor_enabled,operator_auto_repair_enabled,max_repairs_per_provider_per_cycle,max_duplicate_cancels_per_cycle").eq("id", 1).maybeSingle();
  return {
    supervisor_enabled: data?.supervisor_enabled !== false,
    auto_repair_enabled: data?.operator_auto_repair_enabled === true,
    max_repairs_per_provider_per_cycle: Math.max(0, Number(data?.max_repairs_per_provider_per_cycle ?? 5)),
    max_duplicate_cancels_per_cycle: Math.max(0, Number(data?.max_duplicate_cancels_per_cycle ?? 10)),
  };
}

async function runTradeSupervisorForProviderWithContext(supabase: SupabaseClient, providerName: "binance" | "bybit", triggerSource = "manual_admin"): Promise<Json> {
  assertLiveTradingImpossible();
  const cycleStarted = Date.now();
  const startedAt = new Date().toISOString();
  const runId = `${providerName}_${crypto.randomUUID()}`;
  const perf: Json = { db_query_count: 0, exchange_call_count: 0, symbols_scanned: 0, positions_scanned: 0, orders_scanned: 0, repair_attempts: 0, slowest_stage: null };

  const providerControl = await getProviderControl(supabase, providerName).catch(() => null);
  const scopedCredential = currentEdgeProviderCredential(providerName);
  const hasKeys = Boolean(scopedCredential.apiKey && scopedCredential.apiSecret);

  if (providerControl && !providerControl.enabled) {
    const result = {
      provider: providerName,
      run_id: runId,
      wallet_reachable: false,
      positions_found: 0,
      orders_found: 0,
      protected_count: 0,
      unsafe_count: 0,
      repair_attempts: 0,
      repair_successes: 0,
      duplicate_orders_found: 0,
      duplicate_orders_cancelled: 0,
      latest_run: new Date().toISOString(),
      latest_success: false,
      latest_error: "PROVIDER_DISABLED",
      skipped: true,
      blocker: "PROVIDER_DISABLED",
      duration_ms: Date.now() - cycleStarted,
      performance: perf,
    };
    await recordSupervisorHeartbeat(supabase, providerName, result, startedAt, triggerSource);
    return result;
  }

  if (!hasKeys) {
    const result = {
      provider: providerName,
      run_id: runId,
      wallet_reachable: false,
      positions_found: 0,
      orders_found: 0,
      protected_count: 0,
      unsafe_count: 0,
      repair_attempts: 0,
      repair_successes: 0,
      duplicate_orders_found: 0,
      duplicate_orders_cancelled: 0,
      latest_run: new Date().toISOString(),
      latest_success: false,
      latest_error: "NO_API_KEYS",
      skipped: true,
      blocker: "NO_API_KEYS",
      duration_ms: Date.now() - cycleStarted,
      performance: perf,
    };
    await recordSupervisorHeartbeat(supabase, providerName, result, startedAt, triggerSource);
    return result;
  }

  const controls = await getSupervisorControls(supabase).catch(() => ({ supervisor_enabled: true, auto_repair_enabled: false, max_repairs_per_provider_per_cycle: 5, max_duplicate_cancels_per_cycle: 10 }));
  perf.db_query_count = Number(perf.db_query_count) + 1;
  if (!controls.supervisor_enabled && triggerSource === "pg_cron") {
    return { provider: providerName, run_id: runId, wallet_reachable: null, positions_found: 0, orders_found: 0, protected_count: 0, unsafe_count: 0, repair_attempts: 0, repair_successes: 0, duplicate_orders_found: 0, duplicate_orders_cancelled: 0, latest_run: new Date().toISOString(), latest_success: true, latest_error: null, skipped: true, blocker: "supervisor_disabled", duration_ms: Date.now() - cycleStarted, performance: perf };
  }
  const exposureStarted = Date.now();
  const exposure = await fetchProviderExposure(providerName);
  perf.exchange_call_count = exposure.exchange_call_count;
  perf.positions_scanned = exposure.positions.length;
  perf.orders_scanned = exposure.open_orders.length;
  perf.slowest_stage = { name: "fetchProviderExposure", duration_ms: Date.now() - exposureStarted };
  const sync = await syncTradeManagementTruthFromExposure(supabase, providerName, exposure);
  perf.db_query_count = Number(perf.db_query_count) + 1 + exposure.positions.length;
  const rows = ((sync.rows ?? []) as Json[]);
  const unsafeBefore = rows.filter((row) => row.protection_status !== "protected");
  const repairs: Json[] = [];
  const repairAllowed = controls.auto_repair_enabled || triggerSource !== "pg_cron";
  for (const row of unsafeBefore.slice(0, controls.max_repairs_per_provider_per_cycle)) {
    const repairQuarantine = await activeQuarantine(supabase, providerName, String(row.symbol), "repair");
    if (repairQuarantine) { repairs.push({ provider: providerName, symbol: row.symbol, attempted: false, successful: false, blocker: "symbol_quarantined", quarantine: repairQuarantine }); continue; }
    if (!repairAllowed) break;
    if (Date.now() - cycleStarted > 25_000) { repairs.push({ provider: providerName, symbol: row.symbol, attempted: false, successful: false, blocker: "supervisor_cycle_time_budget_exceeded_before_repair" }); break; }
    repairs.push(await repairTruthRowWithExchangeConfirmation(supabase, row, "run_trade_supervisor_cycle", exposure));
  }
  perf.repair_attempts = repairs.filter((r) => r.attempted !== false).length;
  const verifyExposure = repairs.length > 0 ? await fetchProviderExposure(providerName) : exposure;
  if (repairs.length > 0) perf.exchange_call_count = Number(perf.exchange_call_count) + verifyExposure.exchange_call_count;
  const afterSync = repairs.length > 0 ? await syncTradeManagementTruthFromExposure(supabase, providerName, verifyExposure) : sync;
  const finalRows = (((afterSync.rows ?? rows) as Json[]));
  let duplicateFound = 0;
  for (const row of finalRows) duplicateFound += duplicateProtectionStats(providerName, row, verifyExposure.open_orders).duplicate_orders_found;
  const unsafeRows = finalRows.filter((row) => row.protection_status !== "protected");
  const latestRun = new Date().toISOString();
  const result: Json = {
    Provider: providerName,
    provider: providerName,
    run_id: runId,
    wallet_reachable: exposure.wallet_reachable,
    positions_found: finalRows.length,
    orders_found: verifyExposure.open_orders.length,
    protected_count: finalRows.filter((row) => row.protection_status === "protected").length,
    unsafe_count: unsafeRows.length,
    repair_attempts: repairs.filter((r) => r.attempted !== false).length,
    repair_successes: repairs.filter((r) => r.successful === true).length,
    duplicate_orders_found: duplicateFound,
    duplicate_orders_cancelled: 0,
    latest_run: latestRun,
    latest_success: exposure.wallet_reachable === true && unsafeRows.length === 0,
    latest_error: exposure.error ?? unsafeRows[0]?.latest_error ?? repairs.find((r) => r.successful === false)?.blocker ?? null,
    telegram_admin_sent: false,
    duration_ms: Date.now() - cycleStarted,
    fetch_duration_ms: exposure.fetch_duration_ms,
    performance: { ...perf, total_runtime_ms: Date.now() - cycleStarted, db_query_count: Number(perf.db_query_count) + (repairs.length > 0 ? 1 : 0), exchange_call_count: perf.exchange_call_count, symbols_scanned: 0 },
    controls,
    exposure: { wallet_reachable: exposure.wallet_reachable, positions_found: exposure.positions.length, orders_found: exposure.open_orders.length, fetch_duration_ms: exposure.fetch_duration_ms, error: exposure.error },
    sync,
    after_sync: afterSync,
    repairs,
  };
  if (exposure.error || unsafeRows.length > 0) {
    const text = exposure.error ? `🚨 HashiBot ${providerName} provider fetch failed: ${exposure.error}` : formatProtectionAlert(unsafeRows, providerName === "binance" ? result : {}, providerName === "bybit" ? result : {});
    const telegram = await routeTelegramEvent(supabase, { event_type: exposure.error ? "provider_fetch_failed" : "critical_unprotected_position", channels: ["admin"], dedupe: true, source: "trade-supervisor", text });
    result.telegram_admin_sent = true;
    result.telegram = telegram;
  }
  await recordSupervisorHeartbeat(supabase, providerName, result, startedAt, triggerSource);
  return result;
}

async function runTradeSupervisorForProvider(supabase: SupabaseClient, providerName: "binance" | "bybit", triggerSource = "manual_admin", selection?: { customerId?: string; accountId?: string }): Promise<Json> {
  const environment = providerName === "binance" ? "testnet" : bybitExecutionEnvironment();
  try {
    const resolved = await resolveOperatorProviderCredential(supabase, providerName, environment, selection);
    return await withEdgeProviderCredential(resolved.credential, async () => ({
      ...(await runTradeSupervisorForProviderWithContext(supabase, providerName, triggerSource)),
      credential_resolution: { source: resolved.source, attempted: resolved.attempts },
    }));
  } catch (error) {
    const blocker = error instanceof Error ? error.message : String(error);
    return { provider: providerName, environment, latest_success: false, success: false, blocker, latest_error: blocker, repair_attempts: 0, repair_successes: 0 };
  }
}

async function runTradeSupervisorCycle(supabase: SupabaseClient, provider?: string, triggerSource = "manual_admin", selection?: { customerId?: string; accountId?: string }): Promise<Json> {
  const providers = provider === "binance" || provider === "bybit" ? [provider] as Array<"binance" | "bybit"> : ["binance", "bybit"] as Array<"binance" | "bybit">;
  const results: Json = {};
  for (const p of providers) results[p] = await runTradeSupervisorForProvider(supabase, p, triggerSource, selection);
  return { success: providers.every((p) => (results[p] as Json).latest_success === true), action: "run_trade_supervisor_cycle", latest_run: new Date().toISOString(), providers: results, Binance: results.binance ?? null, Bybit: results.bybit ?? null };
}

async function tradeManagementAction(supabase: SupabaseClient, action: string, provider?: string, symbol?: string, triggerSource = "manual_admin", selection?: { customerId?: string; accountId?: string }): Promise<Json> {
  const isReadOnlyProof = action === "prove_binance_trade_management" || action === "prove_bybit_trade_management" || action === "sync_all_positions_now";
  if (!isReadOnlyProof) assertLiveTradingImpossible();
  if (action === "run_trade_supervisor_cycle") return runTradeSupervisorCycle(supabase, provider, triggerSource, selection);
  if (action === "sync_all_positions_now") {
    const providers = provider === "binance" || provider === "bybit" ? [provider] as Array<"binance" | "bybit"> : ["binance", "bybit"] as Array<"binance" | "bybit">;
    const results = [] as Json[];
    for (const selectedProvider of providers) results.push(await syncTradeManagementTruth(supabase, selectedProvider, selection));
    return { success: results.every((result) => result.success === true), results };
  }
  if (action === "prove_binance_trade_management") return proveProviderReadOnly(supabase, "binance", selection);
  if (action === "prove_bybit_trade_management") return proveProviderReadOnly(supabase, "bybit", selection);
  if (action === "repair_all_protection_now") {
    const providers = provider === "binance" || provider === "bybit" ? [provider] as Array<"binance" | "bybit"> : ["binance", "bybit"] as Array<"binance" | "bybit">;
    const results: Json = {};
    for (const p of providers) results[p] = await runTradeSupervisorForProvider(supabase, p, triggerSource, selection);
    const repair_attempts = providers.reduce((sum, p) => sum + Number((results[p] as Json).repair_attempts ?? 0), 0);
    const repair_successes = providers.reduce((sum, p) => sum + Number((results[p] as Json).repair_successes ?? 0), 0);
    const unsafe_count = providers.reduce((sum, p) => sum + Number((results[p] as Json).unsafe_count ?? 0), 0);
    return { success: providers.every((p) => (results[p] as Json).latest_success === true), action, repair_attempts, repair_successes, unsafe_count, Binance: results.binance ?? null, Bybit: results.bybit ?? null, blocker: unsafe_count ? "one_or_more_positions_still_unprotected_after_real_exchange_repair_attempt" : null };
  }
  if (action === "run_profit_lock_now" || action === "run_full_trade_management_proof") {
    const sync = [await syncTradeManagementTruth(supabase, "binance"), await syncTradeManagementTruth(supabase, "bybit")];
    const { data } = await supabase.from("trade_management_truth").select("*").neq("protection_status", "closed");
    const successfulSyncProviders = new Set(sync.filter((r) => (r as Json).success === true).map((r) => String((r as Json).provider)));
    const unsafe = ((data ?? []) as Json[]).filter((row) => ["binance", "bybit"].includes(String(row.provider)) && successfulSyncProviders.has(String(row.provider)) && row.protection_status !== "protected");
    const repairs: Json[] = [];
    for (const row of unsafe) repairs.push(await repairTruthRowWithExchangeConfirmation(supabase, row, action));
    const monitorProof = action === "run_full_trade_management_proof" ? { binance: await runTradeSupervisorForProvider(supabase, "binance", "manual_admin"), bybit: await runTradeSupervisorForProvider(supabase, "bybit", "manual_admin") } : { binance: null, bybit: null };
    const afterSync = [await syncTradeManagementTruth(supabase, "binance"), await syncTradeManagementTruth(supabase, "bybit")];
    const { data: truthAfter } = await supabase.from("trade_management_truth").select("*").neq("protection_status", "closed");
    const proofFor = (providerName: "binance" | "bybit") => {
      const syncRow = afterSync.find((r) => (r as Json).provider === providerName) as Json | undefined;
      const rows = ((truthAfter ?? []) as Json[]).filter((row) => row.provider === providerName);
      const blocker = (syncRow?.success === false ? String(syncRow.blocker) : null) ?? rows.find((row) => row.latest_error)?.latest_error ?? repairs.find((r) => r.provider === providerName && r.successful === false)?.blocker ?? null;
      const providerRepairs = repairs.filter((r) => r.provider === providerName);
      const repairAttempted = providerRepairs.length > 0;
      const monitor = monitorProof[providerName] as Json | null;
      return { wallet_reachable: syncRow?.wallet_reachable === true, positions_fetch_success: syncRow?.positions_fetch_success === true, orders_fetch_success: syncRow?.orders_fetch_success === true, positions_found: Number(syncRow?.open_positions_found ?? rows.length), orders_found: Number(syncRow?.open_orders_found ?? rows.filter((row) => row.sl_present || row.tp1_present || row.tp2_present).length), protected_count: rows.filter((row) => row.protection_status === "protected").length, unsafe_count: rows.filter((row) => row.protection_status !== "protected").length, repair_attempted: repairAttempted, repair_successful: repairAttempted && providerRepairs.every((r) => r.successful === true), sl_proven: rows.length > 0 && rows.every((row) => row.sl_present === true), tp1_proven: rows.length > 0 && rows.every((row) => row.tp1_present === true), tp2_proven: rows.length > 0 && rows.every((row) => row.tp2_present === true), profit_lock_attempted: action === "run_profit_lock_now", profit_lock_successful: false, monitor_latest_run: (monitor?.latest_run ?? (monitor?.raw && ((monitor.raw as Json).last_monitor_run_at ?? (monitor.raw as Json).latest_monitor_run_at))) || null, monitor_latest_success: monitor?.latest_success ?? monitor?.Monitor_success ?? null, monitor_latest_error: monitor?.Latest_error ?? null, telegram_admin_sent: monitor?.telegram_admin_sent ?? monitor?.Telegram_admin_sent ?? false, telegram_vip_sent: false, telegram_free_sent: false, exact_blocker: blocker };
    };
    const stillUnsafe = ((truthAfter ?? []) as Json[]).filter((row) => row.protection_status !== "protected");
    let telegram: unknown = null;
    if (stillUnsafe.length) telegram = await routeTelegramEvent(supabase, { event_type: "critical_unprotected_position", channels: ["admin"], dedupe: true, cooldown_minutes: 60, source: "binance-testnet-execution", text: formatProtectionAlert(stillUnsafe, proofFor("binance"), proofFor("bybit")) });
    return { success: stillUnsafe.length === 0, action, sync, after_sync: afterSync, repair_attempts: repairs.length, repair_successes: repairs.filter((r) => r.successful).length, repairs, telegram, Binance: proofFor("binance"), Bybit: proofFor("bybit"), blocker: stillUnsafe.length ? "one_or_more_positions_still_unprotected_after_real_exchange_repair_attempt" : null };
  }
  if (action === "close_unprotected_position") return { success: false, provider, symbol, blocker: "manual close requires explicit provider+symbol confirmation; live trading remains disabled" };
  return { success: false, blocker: "unknown_trade_management_action" };
}

function formatProtectionAlert(stillUnsafe: Json[], binance: Json, bybit: Json): string {
  const mode = (Deno.env.get("BINANCE_LIVE_TRADING") === "true" || Deno.env.get("BYBIT_LIVE_TRADING") === "true") ? "LIVE DISABLED BY GOVERNOR" : "TESTNET/DEMO, not live";
  const top = stillUnsafe.slice(0, 5).map((row, idx) => `${idx + 1}. ${row.symbol} ${row.side}: ${row.latest_error ?? row.protection_status}`).join("\n");
  return [`🚨 HashiBot Protection Alert`, `Mode: ${mode}`, `Provider summary:`, `Binance: ${Number(binance.positions_found ?? 0)} positions, ${Number(binance.protected_count ?? 0)} protected, ${Number(binance.unsafe_count ?? 0)} unsafe`, `Bybit: ${Number(bybit.positions_found ?? 0)} positions, ${Number(bybit.protected_count ?? 0)} protected, ${Number(bybit.unsafe_count ?? 0)} unsafe`, `Top blockers:`, top || "1. No blocker details available", `Full details available in Runtime Proof.`].join("\n");
}

async function runProviderMonitorNow(providerName: "binance" | "bybit"): Promise<Json> {
  const functionName = providerName === "binance" ? "binance-testnet-monitor" : "bybit-testnet-monitor";
  const result = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}` },
    body: JSON.stringify({ source: "manual_admin", action: "run_trade_supervisor_cycle", provider: providerName, run_type: providerName === "binance" ? "binance_testnet_monitor" : "bybit_testnet_monitor" }),
  }).then((r) => r.json()).catch((e) => ({ success: false, latest_error: e instanceof Error ? e.message : String(e) })) as Json;
  const unsafe = Number(result.unsafe_count ?? result.protections_missing ?? result.unprotected_count ?? 0);
  return {
    Provider: providerName,
    success: result.success !== false,
    latest_run: result.latest_run ?? result.last_monitor_run_at ?? result.latest_monitor_run_at ?? new Date().toISOString(),
    latest_success: result.latest_success ?? result.success ?? null,
    critical: unsafe > 0,
    Monitor_success: result.success !== false,
    Critical: unsafe > 0,
    Wallet_reachable: result.wallet_reachable ?? result.walletReachable ?? null,
    Positions_found: Number(result.positions_found ?? result.positions_seen ?? result.open_positions_found ?? 0),
    Orders_found: Number(result.orders_found ?? result.orders_seen ?? result.open_orders_found ?? 0),
    Protected_count: Number(result.protected_count ?? 0),
    Unsafe_count: unsafe,
    Repair_attempts: Number(result.repair_attempts ?? result.protections_created ?? 0),
    Repair_successes: Number(result.repair_successes ?? result.protections_created ?? 0),
    Latest_error: result.latest_error ?? result.error ?? null,
    Telegram_admin_sent: unsafe > 0,
    raw: result,
  };
}

class SupabaseCertifiedClaims implements AtomicExecutionClaimStore {
  constructor(private readonly db: SupabaseClient, private readonly plan: DeepReadonly<ExecutionPlan>) {}
  async claimBatch(requests: readonly ClaimRequest[]): Promise<Readonly<Record<string, AtomicClaimResult>>> {
    const { data, error } = await this.db.rpc("claim_certified_execution", { p_execution_plan_id:this.plan.execution_plan_id, p_account_id:this.plan.routing!.account_id, p_requests: requests });
    if (error) throw new Error(`certified_claim_failed:${error.message}`);
    return (data ?? {}) as Record<string, AtomicClaimResult>;
  }
  async markCompleted(keys: readonly string[], owner: string, completedAt: string): Promise<void> {
    const { error } = await this.db.from("certified_runtime_claims").update({ state:"completed", completed_at:completedAt }).in("idempotency_key", [...keys]).eq("owner", owner);
    if (error) throw new Error(`certified_claim_completion_failed:${error.message}`);
  }
}

class SupabaseCertifiedEvents implements AppendOnlyExecutionEventStore {
  constructor(private readonly db: SupabaseClient) {}
  async append(event: DeepReadonly<ExecutionEvent>) {
    const canonical = event.event_type.includes("CLAIM") ? "claimed" : event.event_type.includes("ACKNOWLEDGED") ? "acknowledged" : event.event_type.includes("PARTIALLY_FILLED") ? "partially_filled" : event.event_type.includes("FILLED") ? "filled" : event.event_type === "PROTECTION_VERIFIED" ? "protected" : event.event_type.includes("PROTECTION_MISSING") || event.event_type.includes("DEGRADED") ? "recovery_required" : event.event_type.includes("REJECTED") ? "rejected" : event.event_type.includes("TERMINAL") ? "archived" : event.event_type.includes("SUBMISSION") || event.event_type.includes("CONFIGURATION") ? "submitted" : "planned";
    const { error } = await this.db.from("certified_runtime_events").insert({ event_id:event.event_id, execution_plan_id:event.execution_plan_id, account_id:event.account_id, event_type:event.event_type, normalized_status:canonical, occurred_at:event.observed_timestamp, payload:event });
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`certified_event_append_failed:${error.message}`);
    if (!error && event.provider_order_id && event.deterministic_client_id) {
      const { data: artifact } = await this.db.from("certified_runtime_artifacts").select("strategy_plan_id,risk_decision,capital_allocation_plan,execution_plan").eq("execution_plan->>execution_plan_id",event.execution_plan_id).maybeSingle();
      if (artifact) await this.db.from("certified_provider_order_bindings").upsert({ provider:event.provider, account_id:event.account_id, execution_plan_id:event.execution_plan_id, attempt_number:event.execution_attempt_number, deterministic_client_id:event.deterministic_client_id, provider_order_id:event.provider_order_id, strategy_plan_id:artifact.strategy_plan_id, risk_decision_id:String(artifact.risk_decision?.decision_id), allocation_id:String(artifact.capital_allocation_plan?.allocation_id), canonical_side:String(artifact.execution_plan?.strategy_plan?.decision?.action) });
    }
    return { appended:!error, duplicate:Boolean(error) };
  }
  async list(executionPlanId: string) { const { data, error } = await this.db.from("certified_runtime_events").select("payload").eq("execution_plan_id",executionPlanId).order("sequence"); if (error) throw new Error(`certified_event_read_failed:${error.message}`); return (data ?? []).map((row) => row.payload as ExecutionEvent); }
}

function exactTransport(db: SupabaseClient, plan: DeepReadonly<ExecutionPlan>): ExactProviderTransport {
  const clean = (payload: Readonly<Record<string, unknown>>) => Object.fromEntries(Object.entries(payload).filter(([key]) => !["client_order_id","idempotency_key"].includes(key)));
  return {
    async send(operation, payload, identity) {
      try {
        if(plan.provider==="BINANCE"&&["SET_LEVERAGE","VERIFY_PRECONFIGURED_LEVERAGE","SET_MARGIN_MODE","VERIFY_PRECONFIGURED_MARGIN_MODE"].includes(operation)){
          await applyBinanceCertifiedConfiguration(operation,payload,(method,path,params)=>binanceRequest(method,path,params,true));
          return {outcome:"ACKNOWLEDGED",provider_order_id:identity,provider_position_id:null,provider_timestamp:new Date().toISOString(),raw_status:"CONFIGURATION_VERIFIED",redacted_evidence:{operation},error:null};
        }
        if(plan.provider==="BYBIT"&&["SET_LEVERAGE","VERIFY_PRECONFIGURED_LEVERAGE","SET_MARGIN_MODE","VERIFY_PRECONFIGURED_MARGIN_MODE"].includes(operation)){
          await applyBybitCertifiedConfiguration(operation,payload,(method,path,params)=>bybitRequest(method,path,params));
          return {outcome:"ACKNOWLEDGED",provider_order_id:identity,provider_position_id:null,provider_timestamp:new Date().toISOString(),raw_status:"CONFIGURATION_VERIFIED",redacted_evidence:{operation},error:null};
        }
        if (operation.startsWith("VERIFY_")) return { outcome:"ACKNOWLEDGED", provider_order_id:identity, provider_position_id:null, provider_timestamp:new Date().toISOString(), raw_status:"VERIFIED_FROM_CERTIFIED_TRUTH", redacted_evidence:{ operation }, error:null };
        if ((plan.provider === "BINANCE" || plan.provider === "BYBIT") && (payload.quantity !== undefined || payload.qty !== undefined)) {
          const provider = plan.provider.toLowerCase();
          const { data: decision, error: decisionError } = await db.from("execution_account_policy_decisions").select("id,customer_id,execution_account_id,signal_id,decision,authorized_risk_pct,brain_version,policy_profile_id,policy_version,intent_id,approved_quantity,created_at,connected_execution_accounts!inner(immutable_identity,provider,environment,enabled,is_operational,execution_enabled,provider_health)").eq("execution_account_id",plan.routing!.account_id).eq("id",plan.risk_decision.decision_id).maybeSingle();
          if (decisionError || !decision) throw new Error("phase_d_execution_decision_missing");
          const account = decision.connected_execution_accounts as unknown as Json;
          const {data:connection,error:permissionError}=await db.from('provider_connections').select('capabilities').eq('execution_account_id',decision.execution_account_id).eq('customer_id',decision.customer_id).maybeSingle();
          if(permissionError||!connection)throw Error('CURRENT_PROVIDER_CAPABILITIES_REQUIRED');
          const symbol = String(payload.symbol ?? plan.routing!.provider_symbol).toUpperCase();
          const { data: rules, error: rulesError } = await db.from("provider_symbol_cache").select("status,tick_size,step_size,min_qty,min_notional,last_synced_at").eq("provider",provider).eq("symbol",symbol).maybeSingle();
          if (rulesError || !rules) throw new Error("provider_symbol_rules_missing");
          const requestedPrice = Number(payload.price ?? payload.stopPrice ?? payload.triggerPrice ?? plan.capital_allocation_plan.allocation?.entry_reference);
          const envelope = createCryptoSubmissionEnvelope({
            lineage:{ decisionId:String(decision.id),intentId:String(decision.intent_id??""),signalId:String(decision.signal_id),customerId:String(decision.customer_id),executionAccountId:String(decision.execution_account_id),immutableAccountIdentity:String(account.immutable_identity??""),provider:plan.provider,decision:decision.decision,policyProfileId:String(decision.policy_profile_id),policyVersion:String(decision.policy_version),brainVersion:String(decision.brain_version),authorizedRiskPct:Number(decision.authorized_risk_pct),approvedQuantity:Number(decision.approved_quantity),evaluatedAt:String(decision.created_at) } satisfies CryptoPhaseDLineage,
            route:{ provider:plan.provider,executionAccountId:String(decision.execution_account_id),customerId:String(decision.customer_id),immutableAccountIdentity:String(account.immutable_identity??""),environment:String(account.environment).toUpperCase() as "TESTNET"|"DEMO"|"LIVE",executionEnabled:account.enabled===true&&account.execution_enabled===true,operational:account.is_operational===true,providerHealth:String(account.provider_health).toUpperCase() as "HEALTHY"|"DEGRADED"|"UNHEALTHY",symbol,symbolStatus:String(rules.status),symbolObservedAt:String(rules.last_synced_at),tickSize:Number(rules.tick_size),stepSize:Number(rules.step_size),minimumQuantity:Number(rules.min_qty),minimumNotional:Number(rules.min_notional??0),permissions:{trading:connection.capabilities.trading===true,withdrawal:connection.capabilities.withdrawal,verified:connection.capabilities.verified===true}},
            deterministicClientOrderId:identity,requestedPrice,now:new Date().toISOString(),maximumIntentAgeMs:120_000,maximumSymbolAgeMs:300_000,
          });
          const payloadQuantity = Number(payload.quantity ?? payload.qty);
          if (Number.isFinite(payloadQuantity) && Math.abs(payloadQuantity-envelope.submittedQuantity)>1e-12) throw new Error("certified_plan_quantity_normalization_mismatch");
          const payloadPrice = Number(payload.price ?? payload.stopPrice ?? payload.triggerPrice);
          if (Number.isFinite(payloadPrice) && Math.abs(payloadPrice-envelope.submittedPrice)>1e-12) throw new Error("certified_plan_price_normalization_mismatch");
          const { error: truthError } = await db.rpc("record_phase_f_crypto_submission",{ p_decision_id:decision.id,p_execution_plan_id:plan.execution_plan_id,p_client_order_id:identity,p_symbol:symbol,p_requested_quantity:envelope.requestedQuantity,p_submitted_quantity:envelope.submittedQuantity,p_requested_price:envelope.requestedPrice,p_submitted_price:envelope.submittedPrice,p_normalization:envelope.normalization });
          if (truthError) throw new Error(`phase_f_truth_binding_failed:${truthError.message}`);
        }
        if (plan.provider === "BINANCE") {
          const native = clean(payload), endpoint = String(native.endpoint ?? "/fapi/v1/order"), method = String(native.method ?? "POST") as "POST"; delete native.endpoint; delete native.method;
          const result = await binanceRequest<Json>(method, endpoint, native, true);
          return { outcome:"ACKNOWLEDGED", provider_order_id:String(result.orderId ?? identity), provider_position_id:null, provider_timestamp:new Date().toISOString(), raw_status:String(result.status ?? "ACKNOWLEDGED"), redacted_evidence:{ orderId:result.orderId ?? null, status:result.status ?? null }, error:null };
        }
        if (plan.provider === "BYBIT") {
          const result = await bybitRequest<Json>("POST", "/v5/order/create", clean(payload));
          return { outcome:"ACKNOWLEDGED", provider_order_id:String(result.orderId ?? identity), provider_position_id:null, provider_timestamp:new Date().toISOString(), raw_status:"ACKNOWLEDGED", redacted_evidence:{ orderId:result.orderId ?? null }, error:null };
        }
        const { data: decision, error: decisionError } = await db.from("execution_account_policy_decisions").select("id,customer_id,execution_account_id,signal_id,decision,authorized_risk_pct,brain_version,policy_profile_id,policy_version,intent_id,approved_quantity,created_at,connected_execution_accounts!inner(immutable_identity,provider,environment,account_mode,enabled,is_operational,execution_enabled,provider_health,account_id,customer_id,provider_account_identity,policy_overrides)").eq("execution_account_id",plan.routing!.account_id).eq("id",plan.risk_decision.decision_id).maybeSingle();
        if (decisionError || !decision) throw new Error("phase_d_execution_decision_missing");
        const connected = (decision.connected_execution_accounts as unknown as Record<string, unknown>);
        const mappedRoute = resolveMt5TerminalRoute(connected, String(decision.customer_id));
        const mt5AccountId = mappedRoute.mt5AccountId;
        const { data: account, error: accountError } = await db.from("mt5_accounts").select("id,user_id,bridge_id,connection_status,provider_health,operational,last_heartbeat_at").eq("id",mt5AccountId).eq("user_id",decision.customer_id).maybeSingle();
        const { data: bridge } = account?.bridge_id ? await db.from("mt5_bridge_registry").select("bridge_id,status,lease_expires_at,revoked_at").eq("bridge_id",account.bridge_id).is("revoked_at",null).maybeSingle() : { data:null };
        if (accountError || !account || (mappedRoute.bridgeId && mappedRoute.bridgeId !== account.bridge_id)) throw new Error("mt5_demo_account_unavailable");
        const command = createMt5EntryCommand({
          lineage: { decisionId:String(decision.id), intentId:String(decision.intent_id ?? ""), signalId:String(decision.signal_id), customerId:String(decision.customer_id), executionAccountId:String(decision.execution_account_id), immutableAccountIdentity:String(connected.immutable_identity ?? ""), provider:plan.provider as "MT5_PERSONAL"|"MT5_PROP", decision:decision.decision, policyProfileId:String(decision.policy_profile_id), policyVersion:String(decision.policy_version), brainVersion:String(decision.brain_version), authorizedRiskPct:Number(decision.authorized_risk_pct), approvedQuantity:Number(decision.approved_quantity), evaluatedAt:String(decision.created_at) } satisfies PhaseDExecutionLineage,
          route: { provider:String(connected.provider) as "MT5_PERSONAL"|"MT5_PROP", executionAccountId:String(decision.execution_account_id), mt5AccountId, customerId:String(account.user_id), immutableAccountIdentity:String(connected.immutable_identity ?? ""), bridgeId:account.bridge_id, assignedBridgeId:bridge && ["online","healthy"].includes(String(bridge.status)) && Date.parse(String(bridge.lease_expires_at)) > Date.now() ? bridge.bridge_id : null, accountMode:String(connected.account_mode) as "PERSONAL"|"PROP_EVALUATION"|"PROP_FUNDED", environment:String(connected.environment).toUpperCase() as "DEMO"|"LIVE", executionEnabled:connected.enabled === true && connected.execution_enabled === true, operational:account.operational === true && connected.is_operational === true, providerHealth:String(account.provider_health).toUpperCase() as "HEALTHY"|"DEGRADED"|"UNHEALTHY", lastHeartbeatAt:account.last_heartbeat_at },
          executionPlanId:plan.execution_plan_id, deterministicOrderId:plan.execution_plan_id, nativeChildOrders:plan.orders.filter(o=>o.role==='ENTRY_TP1'||o.role==='ENTRY_TP2').map(o=>({role:o.role,action:String(o.provider_payload.action),symbol:String(o.provider_payload.symbol),side:String(o.provider_payload.side),quantity:o.quantity,sl:o.stop_loss,tp:o.take_profit,client_order_id:o.client_order_id,fill_policy:o.provider_payload.type_filling})), symbol:String(payload.symbol ?? plan.routing!.provider_symbol), side:String(payload.side ?? plan.strategy_plan.decision.action).toUpperCase() as "BUY"|"SELL", stopLoss:Number(plan.strategy_plan.risk_proposal.initial_stop), takeProfit1:Number(payload.take_profit_1 ?? plan.strategy_plan.risk_proposal.tp1), takeProfit2:Number(payload.take_profit_2 ?? plan.strategy_plan.risk_proposal.tp2), now:new Date().toISOString(), maximumIntentAgeMs:120_000,
        });
        const { data, error } = await db.rpc("enqueue_phase_e_mt5_intent", { p_decision_id:String(decision.id), p_execution_plan_id:plan.execution_plan_id, p_mt5_account_id:command.accountId, p_bridge_id:command.bridgeId, p_idempotency_key:command.idempotencyKey, p_payload:command.payload }).single();
        if (error) throw error;
        return { outcome:"ACKNOWLEDGED", provider_order_id:String(data.command_id), provider_position_id:null, provider_timestamp:new Date().toISOString(), raw_status:"QUEUED", redacted_evidence:{ command_id:data.command_id }, error:null };
      } catch (error) { return { outcome:"REJECTED", provider_order_id:null, provider_position_id:null, provider_timestamp:new Date().toISOString(), raw_status:"REJECTED", redacted_evidence:{}, error:{ taxonomy:"PROVIDER_REJECTED", message:error instanceof Error?error.message:String(error) } }; }
    },
    async lookup(identity) { const { data } = await db.from("certified_runtime_events").select("payload").eq("execution_plan_id",plan.execution_plan_id).contains("payload",{ deterministic_client_id:identity }).maybeSingle(); const event = data?.payload as ExecutionEvent|undefined; return event?.provider_order_id ? { found:true, result:{ outcome:"ACKNOWLEDGED", provider_order_id:event.provider_order_id, provider_position_id:event.provider_position_id, provider_timestamp:event.provider_timestamp ?? event.observed_timestamp, raw_status:event.raw_status, redacted_evidence:event.redacted_provider_evidence, error:null } } : { found:false, result:null }; },
  };
}

async function adoptCertifiedExecutionPlan(db: SupabaseClient, raw: unknown, expectedPolicyVersion: string, eligibility: EligibilityDecision | null): Promise<Json> {
  if (!raw || typeof raw !== "object") return { success:false, blocker:"execution_plan_required" };
  const plan = deepFreeze(structuredClone(raw as ExecutionPlan));
  if (plan.schema_version !== "execution-plan/v1" || !plan.routing) return { success:false, blocker:"execution_plan_v1_required" };
  assertCertifiedExecutionInput(plan, plan.routing.account_id);
  if (plan.routing.environment === "LIVE") return { success:false, blocker:"production_environment_forbidden" };

  const { data: policyRow, error: policyError } = await db.from("certified_execution_adoption_policies").select("policy,version,enabled,rollout_percentage").eq("account_id",plan.routing.account_id).eq("provider",plan.provider).eq("environment",plan.routing.environment).eq("current",true).maybeSingle();
  if (policyError || !policyRow) return { success:false, blocker:"adoption_policy_missing" };
  if (!expectedPolicyVersion || policyRow.version !== expectedPolicyVersion) return { success:false, blocker:"adoption_policy_version_mismatch" };
  const policy = deepFreeze(policyRow.policy as ExecutionAdoptionPolicy);
  if (!policyRow.enabled || policyRow.rollout_percentage <= 0 || policy.enabled !== policyRow.enabled || policy.rollout_percentage !== policyRow.rollout_percentage) return { success:false, blocker:"adoption_disabled" };
  const {data:authorized,error:decisionError}=await db.from('execution_account_policy_decisions').select('id,customer_id,execution_account_id,signal_id,policy_version').eq('id',plan.risk_decision.decision_id).eq('execution_account_id',plan.routing.account_id).maybeSingle();
  if(decisionError||!authorized)return {success:false,blocker:'canonical_account_decision_required'};
  const {data:stored,error:artifactError}=await db.from('certified_runtime_artifacts').select('execution_plan').eq('evaluation_id',plan.evaluation_id).eq('account_id',plan.routing.account_id).maybeSingle();
  if(artifactError||stableFingerprint(stored?.execution_plan)!==stableFingerprint(raw))return {success:false,blocker:'persisted_execution_plan_required'};
  const {data:current,error:currentError}=await db.rpc('load_production_account_authorization_input',{p_customer_id:authorized.customer_id,p_account_id:authorized.execution_account_id,p_signal_id:authorized.signal_id});
  if(currentError||!current)return {success:false,blocker:'current_account_evidence_required'};
  await loadConfirmedEntry(db,current.signal,Date.now());
  const {data:credentialAccount,error:credentialScopeError}=await db.from('connected_execution_accounts').select('account_id,execution_instance_id,credential_ref').eq('id',authorized.execution_account_id).eq('customer_id',authorized.customer_id).single();
  if(credentialScopeError||!credentialAccount)return {success:false,blocker:'current_credential_scope_required'};
  let executionScope='';
  if(plan.provider==='BINANCE'||plan.provider==='BYBIT')executionScope=edgeScopeKey({customer_id:authorized.customer_id,provider:plan.provider.toLowerCase() as 'binance'|'bybit',account_id:credentialAccount.account_id,execution_instance_id:credentialAccount.execution_instance_id});
  const truth = currentAccountAdoptionTruth({...current,execution_scope_key:executionScope,execution_instance_id:credentialAccount.execution_instance_id,credential_ref:credentialAccount.credential_ref},plan) as AdoptionTruth;
  eligibility=routeProductionEligibility({claim:pinnedClaimFromQualifiedSet({product:current.product,market:String(current.product).startsWith('FOREX')?'FOREX':'CRYPTO',set:current.qualified_set,strategyId:current.signal.strategy_id,strategyVersion:current.signal.strategy_version,symbol:current.signal.symbol,timeframe:current.signal.timeframe,requiredQualification:'FORWARD_VALIDATION_CANDIDATE',evaluatedParameters:current.strategy_plan?.provenance?.evaluated_parameters??{}}),qualifiedSet:current.qualified_set});
  if ((plan.provider === "BINANCE" || plan.provider === "BYBIT") && !String((truth as unknown as Json).execution_scope_key ?? "")) return { success:false, blocker:"monitor_execution_scope_missing" };
  const product = plan.provider === "MT5_PROP" ? "FOREX_PROP" : plan.provider === "MT5_PERSONAL" ? "FOREX_PERSONAL" : String((truth as unknown as Json).execution_product ?? "CRYPTO_PERSONAL") as "CRYPTO_PERSONAL"|"CRYPTO_PROP";
  const customerId = String((truth as unknown as Json).customer_id ?? plan.risk_decision.account.customer_id);
  const { data: provisioning, error: provisioningError } = await db.from("customer_onboarding_provisioning").select("customer_id,product,qualified_set_id,qualified_set_version,runtime_control,state").eq("customer_id",customerId).eq("execution_account_id",plan.routing.account_id).eq("product",product).maybeSingle();
  if (provisioningError || !provisioning || provisioning.state !== "ACTIVE") return { success:false, blocker:"customer_provisioning_not_active" };
  if (!eligibility || eligibility.qualifiedSetId !== provisioning.qualified_set_id || eligibility.qualifiedSetVersion !== provisioning.qualified_set_version) return { success:false, blocker:"customer_qualified_set_binding_mismatch" };
  const propLookup = product.endsWith("PROP") ? await db.from("prop_account_configs").select("current_state,manual_control,configuration").or(`mt5_account_id.eq.${plan.routing.account_id},configuration->>providerAccountId.eq.${plan.routing.account_id}`).maybeSingle() : { data:null, error:null };
  const propAccount = propLookup.data, propError = propLookup.error;
  if (product.endsWith("PROP") && (propError || !propAccount)) return { success:false, blocker:"prop_account_gate_unavailable" };
  const control = String(propAccount?.manual_control ?? provisioning.runtime_control) as AccountRuntimeControl;
  const openPositions = Array.isArray((truth as unknown as Json).open_positions) ? ((truth as unknown as Json).open_positions as unknown[]).length : Number((truth as unknown as Json).open_positions ?? 0);
  const pendingOrders = Number((truth as unknown as Json).pending_orders ?? 0);
  const { count: duplicates } = await db.from("certified_runtime_events").select("event_id",{count:"exact",head:true}).eq("execution_plan_id",plan.execution_plan_id).eq("account_id",plan.routing.account_id).in("normalized_status",["acknowledged","filled","protected"]);
  const { count: activeSymbol } = await db.from("execution_orders").select("id",{count:"exact",head:true}).eq("account_id",plan.routing.account_id).eq("symbol",plan.routing.provider_symbol).in("status",ACTIVE_STATUSES);
  const propState = String(propAccount?.current_state ?? "NORMAL_TRADING"), propBlocked = new Set(["PAYOUT_READY","NO_NEW_ENTRIES","MANAGE_EXISTING_POSITIONS_ONLY","MANUAL_PAUSE","MANAGE_ONLY","STOP_AFTER_FLAT","ACCOUNT_BREACHED","FIRM_RULE_LOCK","DAILY_SAFETY_LOCK"]), softGuard = propState === "SOFT_PROFIT_GUARD";
  const softMultiplier = softGuard ? Number((propAccount?.configuration as Json|null)?.softGuardRiskMultiplier ?? .5) : 1;
  const plannedRisk = Number(plan.risk_decision.authorized_envelope?.maximum_authorized_risk_amount ?? Number.NaN), baselineRisk = Number((propAccount?.configuration as Json|null)?.baselineRiskAmount ?? plan.risk_decision.authorized_envelope?.requested_risk_amount ?? Number.NaN);
  const accountRuleApproved = !softGuard || (Number.isFinite(plannedRisk) && Number.isFinite(baselineRisk) && plannedRisk <= baselineRisk * softMultiplier + 1e-9);
  const gate = decideAccountExecution({ attempt:"NEW_ENTRY", signalId:plan.evaluation_id, accountId:plan.routing.account_id, customerId, product, assignedProvider:plan.provider, requestedProvider:plan.provider, eligibility:eligibility ?? { version:"production-eligibility-router/v1",decision:"INELIGIBLE",reasonCodes:["ELIGIBILITY_DECISION_MISSING"],product,market:product.startsWith("FOREX")?"FOREX":"CRYPTO",qualifiedSetId:null,qualifiedSetVersion:null,configId:null,configVersion:null,pinnedStrategyParameters:null,signalPolicyVersion:null }, runtimeControl:control, openPositions, pendingOrders, duplicateSignalForAccount:(duplicates??0)>0, activeSymbolConflict:(activeSymbol??0)>0, canonicalRiskApproved:plan.risk_decision.decision!=="REJECT"&&Boolean(plan.risk_decision.authorized_envelope), canonicalCapitalApproved:plan.capital_allocation_plan.status==="ALLOCATED", accountRuleApproved, propDecision:product.endsWith("PROP")?{decision:propBlocked.has(propState)?"BLOCK":softGuard?"REDUCE":"ALLOW",reasonCodes:propBlocked.has(propState)?[propState]:softGuard?["SOFT_PROFIT_GUARD"]:[],riskMultiplier:softMultiplier,managementEnabled:true}:null });
  await db.from("certified_runtime_events").insert({ event_id:`account-gate:${plan.execution_plan_id}:${plan.routing.account_id}`,execution_plan_id:plan.execution_plan_id,account_id:plan.routing.account_id,event_type:"ACCOUNT_GATE_DECIDED",normalized_status:gate.decision.toLowerCase(),occurred_at:new Date().toISOString(),payload:gate });
  if (gate.decision === "BLOCK") return { success:false, blocker:gate.reasonCodes[0] ?? "account_execution_blocked", gate };
  const transport = exactTransport(db, plan);
  const port = plan.provider === "BINANCE" ? new BinanceTestnetAdoptionAdapter(plan,transport) : plan.provider === "BYBIT" ? new BybitDemoAdoptionAdapter(plan,transport) : plan.provider === "MT5_PERSONAL" ? new Mt5PersonalDemoAdoptionAdapter(plan,transport) : new Mt5PropDemoAdoptionAdapter(plan,transport);
  const runAdoption = () => adoptExecutionPlan({ plan, policy, truth, now:new Date().toISOString(), executor_identity:"active-root-executor", attempt_number:1, lease_ms:30_000, claim_store:new SupabaseCertifiedClaims(db,plan), event_store:new SupabaseCertifiedEvents(db), port });
  const adopted = plan.provider === "BINANCE" || plan.provider === "BYBIT"
    ? await (async () => { const resolved = await resolveOperatorProviderCredential(db, plan.provider.toLowerCase() as "binance"|"bybit", plan.routing!.environment.toLowerCase() as "testnet"|"demo", { customerId:truth.customer_id ?? undefined, accountId:credentialAccount.account_id }); return withEdgeProviderCredential(resolved.credential, runAdoption); })()
    : await runAdoption();
  if (adopted.attempt) { const { error } = await db.from("certified_runtime_artifacts").update({ execution_attempt:adopted.attempt }).eq("evaluation_id",plan.evaluation_id).eq("account_id",plan.routing.account_id); if (error) throw new Error(`certified_attempt_persistence_failed:${error.message}`); }
  if (adopted.submitted && plan.routing) {
    const entry = plan.orders.find((order) => order.role === "ENTRY" || order.role.startsWith("ENTRY_TP"));
    const events = adopted.events.filter((event) => event.provider_order_id);
    const { error: monitorBindingError } = await db.from("execution_orders").insert({ exchange:plan.provider === "BINANCE" ? "binance_usdm_testnet" : plan.provider === "BYBIT" ? "bybit_usdt_demo" : "mt5_demo", symbol:plan.routing.provider_symbol, direction:plan.strategy_plan.decision.action.toLowerCase(), entry_price:entry?.price ?? plan.capital_allocation_plan.allocation?.entry_reference, stop_loss:plan.strategy_plan.risk_proposal.initial_stop, tp1:plan.strategy_plan.risk_proposal.tp1, tp2:plan.strategy_plan.risk_proposal.tp2, volume:plan.capital_allocation_plan.allocation?.quantity, execution_mode:plan.routing.execution_mode, status:"entry_submitted", execution_provider:plan.provider.toLowerCase().replace("_personal","").replace("_prop",""), environment:plan.routing.environment.toLowerCase(), customer_id:plan.risk_decision.account.customer_id, account_id:credentialAccount.account_id, execution_scope_key:String((truth as unknown as Json).execution_scope_key ?? ""), execution_instance_id:(truth as unknown as Json).execution_instance_id ?? null, credential_ref:(truth as unknown as Json).credential_ref ?? null, entry_order_id:events.find((event) => event.event_type === "ENTRY_ACKNOWLEDGED")?.provider_order_id ?? "", raw_exchange_response:{ certified_execution_plan_id:plan.execution_plan_id, certified_attempt_number:adopted.attempt?.attempt_number, canonical_side:plan.strategy_plan.decision.action } });
    if (monitorBindingError) throw new Error(`certified_monitor_binding_failed:${monitorBindingError.message}`);
  }
  return { success:adopted.submitted || adopted.shadow_only, shadow_only:adopted.shadow_only, execution_plan_id:plan.execution_plan_id, canonical_state:adopted.projection.canonical_state, errors:adopted.projection.errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    await requireAdminOrInternal(req, supabase);
    const body = await req.json().catch(() => ({})) as { action?: Action; signal_id?: string; symbol?: string; execution_id?: string; manual?: boolean; settings?: Json; provider?: string; source?: string; execution_plan?: unknown; expected_policy_version?: string; eligibility_decision?: EligibilityDecision };
    const action = body.action ?? "status";
    let payload: Json;
    if (action === "adopt_execution_plan") payload = await adoptCertifiedExecutionPlan(supabase, body.execution_plan, String(body.expected_policy_version ?? ""), body.eligibility_decision ?? null);
    else if (action === "status") payload = await statusPayload(supabase);
    else if (action === "sync_binance_tradable_symbols") payload = await syncBinanceTradableSymbols(supabase);
    else if (action === "sync_bybit_tradable_symbols") payload = await syncBybitTradableSymbols(supabase);
    else if (action === "show_executable_universe") payload = await showExecutableUniverse(supabase);
    else if (action === "place_tiny_binance_test_order") { const sig = await latestSupportedSignal(supabase, "binance"); payload = sig ? await routeSignalToEnabledProviders(supabase, sig.id, true) : { success:false, reason:"no_binance_supported_signal" }; }
    else if (action === "place_tiny_bybit_test_order") { const sig = await latestSupportedSignal(supabase, "bybit"); payload = sig ? await routeSignalToEnabledProviders(supabase, sig.id, true) : { success:false, reason:"no_bybit_supported_signal" }; }
    else if (action === "cancel_test_orders") { assertLiveTradingImpossible(); payload = { success: true, binance: await binanceRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol: body.symbol ?? "BTCUSDT" }, true).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })), bybit: await bybitRequest("POST", "/v5/order/cancel-all", { category: "linear", symbol: String(body.symbol ?? "BTCUSDT").replace(/USDC$/i, "USDT") }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })) }; }
    else if (action === "run_binance_monitor_now") payload = (await runTradeSupervisorCycle(supabase, "binance", String(body.source ?? "manual_admin"))).Binance as Json;
    else if (action === "run_bybit_monitor_now") payload = (await runTradeSupervisorCycle(supabase, "bybit", String(body.source ?? "manual_admin"))).Bybit as Json;
    else if (action === "execute_latest_binance_supported_signal") { const sig = await latestSupportedSignal(supabase, "binance"); payload = sig ? await routeSignalToEnabledProviders(supabase, sig.id, true) : { success:false, reason:"no_binance_supported_signal" }; }
    else if (action === "execute_latest_bybit_supported_signal") { const sig = await latestSupportedSignal(supabase, "bybit"); payload = sig ? await routeSignalToEnabledProviders(supabase, sig.id, true) : { success:false, reason:"no_bybit_supported_signal" }; }
    else if (action === "execute_latest_mirror_supported_signal") { const sig = await latestSupportedSignal(supabase, "mirror"); payload = sig ? await routeSignalToEnabledProviders(supabase, sig.id, true) : { success:false, reason:"no_mirror_supported_signal" }; }
    else if (["run_trade_supervisor_cycle", "sync_all_positions_now", "repair_all_protection_now", "run_profit_lock_now", "close_unprotected_position", "prove_binance_trade_management", "prove_bybit_trade_management", "run_full_trade_management_proof"].includes(action)) payload = await tradeManagementAction(supabase, action, body.provider, body.symbol, String(body.source ?? "manual_admin"), { customerId: body.customer_id ? String(body.customer_id) : undefined, accountId: body.account_id ? String(body.account_id) : undefined });
    else if (action === "execution_readiness") payload = await executionReadiness(supabase, (body.provider === "bybit" ? "bybit" : "binance") as "binance" | "bybit");
    else if (action === "parallel_dry_run") payload = await parallelDryRun(supabase, cleanSignalId(body.signal_id));
    else if (action === "diagnose_bybit_testnet_connection") payload = await diagnoseBybitTestnetConnection(supabase);
    else if (action === "diagnose_margin_fallback") payload = await diagnoseMarginFallback(supabase, cleanSignalId(body.signal_id));
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
        payload = governor.blocks_execution ? governorPausedPayload(governor, settings) : await routeSignalToEnabledProviders(supabase, validated.id, Boolean(body.manual));
      }
    }
    else if (action === "execute_latest_approved_signal") payload = await executeLatestApprovedSignal(supabase);
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
