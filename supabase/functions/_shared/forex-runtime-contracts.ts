/** Canonical production instrument metadata. Values are fail-safe defaults used
 * when fresh MT5 symbol specifications are unavailable; broker_symbol remains
 * authoritative provider lineage and deployments should prefer synchronized specs. */
export type RuntimeInstrumentClass = "fx_non_jpy" | "fx_jpy" | "metal_gold";
export interface RuntimeInstrumentContract {
  readonly symbol: string;
  readonly instrument_class: RuntimeInstrumentClass;
  readonly market: "forex" | "gold";
  readonly pip_size: number;
  readonly point_size: number;
  readonly price_precision: number;
  readonly rounding_precision: number;
  readonly provider_symbol: string;
  readonly runtime_enabled: boolean;
}

export const FOREX_RUNTIME_INSTRUMENTS = [
  { symbol: "EURUSD", instrument_class: "fx_non_jpy", market: "forex", pip_size: 0.0001, point_size: 0.00001, price_precision: 5, rounding_precision: 5, provider_symbol: "EURUSD", runtime_enabled: true },
  { symbol: "GBPUSD", instrument_class: "fx_non_jpy", market: "forex", pip_size: 0.0001, point_size: 0.00001, price_precision: 5, rounding_precision: 5, provider_symbol: "GBPUSD", runtime_enabled: true },
  { symbol: "USDJPY", instrument_class: "fx_jpy", market: "forex", pip_size: 0.01, point_size: 0.001, price_precision: 3, rounding_precision: 3, provider_symbol: "USDJPY", runtime_enabled: true },
  { symbol: "AUDUSD", instrument_class: "fx_non_jpy", market: "forex", pip_size: 0.0001, point_size: 0.00001, price_precision: 5, rounding_precision: 5, provider_symbol: "AUDUSD", runtime_enabled: true },
  { symbol: "USDCAD", instrument_class: "fx_non_jpy", market: "forex", pip_size: 0.0001, point_size: 0.00001, price_precision: 5, rounding_precision: 5, provider_symbol: "USDCAD", runtime_enabled: true },
  { symbol: "XAUUSD", instrument_class: "metal_gold", market: "gold", pip_size: 0.1, point_size: 0.01, price_precision: 2, rounding_precision: 2, provider_symbol: "XAUUSD", runtime_enabled: true },
] as const satisfies readonly RuntimeInstrumentContract[];

export const FOREX_RUNTIME_SYMBOLS = FOREX_RUNTIME_INSTRUMENTS.map((instrument) => instrument.symbol);
export type ForexRuntimeSymbol = typeof FOREX_RUNTIME_INSTRUMENTS[number]["symbol"];
export const MT5_PROVIDER_MARKET_DATA_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

export interface ForexStrategyContract {
  readonly id: "forex.micro-scalper" | "forex.swing-continuation" | "forex.london-breakout" | "forex.new-york-continuation" | "forex.trend-pullback";
  readonly legacyName: "ForexMicroScalper" | "ForexSwingContinuation" | "ForexLondonBreakout" | "ForexNewYorkContinuation" | "ForexTrendPullback";
  readonly version: "1.0.0";
  readonly lifecycle: "ENABLED";
  readonly markets: readonly ["forex"];
  readonly eligibleInstrumentClasses: readonly RuntimeInstrumentClass[];
  readonly symbols: readonly ForexRuntimeSymbol[];
  readonly primaryTimeframes: readonly string[];
  readonly contextTimeframes: readonly string[];
  readonly minimumCandles: number;
  readonly requiredIndicators: readonly string[];
}

const FX_CLASSES = ["fx_non_jpy", "fx_jpy"] as const;
const FX_STRATEGY_SYMBOLS = FOREX_RUNTIME_INSTRUMENTS.filter((instrument) => FX_CLASSES.includes(instrument.instrument_class as typeof FX_CLASSES[number])).map((instrument) => instrument.symbol);
const BASE_INDICATORS = ["ema20", "ema50", "atr14", "rsi14", "recent_high", "recent_low", "body_size", "atr_pct", "momentum_score", "volatility_state", "regime"] as const;
export const FOREX_STRATEGY_CONTRACTS: readonly ForexStrategyContract[] = [
  { id: "forex.micro-scalper", legacyName: "ForexMicroScalper", version: "1.0.0", lifecycle: "ENABLED", markets: ["forex"], eligibleInstrumentClasses: FX_CLASSES, symbols: FX_STRATEGY_SYMBOLS, primaryTimeframes: ["15m"], contextTimeframes: [], minimumCandles: 55, requiredIndicators: BASE_INDICATORS },
  { id: "forex.swing-continuation", legacyName: "ForexSwingContinuation", version: "1.0.0", lifecycle: "ENABLED", markets: ["forex"], eligibleInstrumentClasses: FX_CLASSES, symbols: FX_STRATEGY_SYMBOLS, primaryTimeframes: ["1h"], contextTimeframes: [], minimumCandles: 55, requiredIndicators: BASE_INDICATORS },
  { id: "forex.london-breakout", legacyName: "ForexLondonBreakout", version: "1.0.0", lifecycle: "ENABLED", markets: ["forex"], eligibleInstrumentClasses: FX_CLASSES, symbols: FX_STRATEGY_SYMBOLS, primaryTimeframes: ["15m"], contextTimeframes: [], minimumCandles: 55, requiredIndicators: BASE_INDICATORS },
  { id: "forex.new-york-continuation", legacyName: "ForexNewYorkContinuation", version: "1.0.0", lifecycle: "ENABLED", markets: ["forex"], eligibleInstrumentClasses: FX_CLASSES, symbols: FX_STRATEGY_SYMBOLS, primaryTimeframes: ["15m", "1h"], contextTimeframes: [], minimumCandles: 55, requiredIndicators: BASE_INDICATORS },
  { id: "forex.trend-pullback", legacyName: "ForexTrendPullback", version: "1.0.0", lifecycle: "ENABLED", markets: ["forex"], eligibleInstrumentClasses: FX_CLASSES, symbols: FX_STRATEGY_SYMBOLS, primaryTimeframes: ["15m", "1h"], contextTimeframes: [], minimumCandles: 55, requiredIndicators: BASE_INDICATORS },
];

export function runtimeInstrument(value: string): RuntimeInstrumentContract | null {
  const normalized = value.replace(/[^A-Za-z]/g, "").toUpperCase();
  return FOREX_RUNTIME_INSTRUMENTS.find((instrument) => instrument.symbol === normalized) ?? null;
}
export function runtimePipDistance(symbol: string, from: number, to: number): number {
  const instrument = runtimeInstrument(symbol);
  return instrument && Number.isFinite(from) && Number.isFinite(to) ? Number((Math.abs(to - from) / instrument.pip_size).toFixed(1)) : 0;
}
export function roundRuntimePrice(symbol: string, price: number): number {
  const instrument = runtimeInstrument(symbol);
  return instrument && Number.isFinite(price) ? Number(price.toFixed(instrument.rounding_precision)) : 0;
}
export function forexStrategyEligibility(contract: ForexStrategyContract, symbol: string): { eligible: boolean; reason: string | null } {
  const instrument = runtimeInstrument(symbol);
  if (!instrument?.runtime_enabled) return { eligible: false, reason: "unsupported_symbol" };
  if (instrument.instrument_class === "metal_gold") return { eligible: false, reason: "gold_strategy_not_certified" };
  return contract.eligibleInstrumentClasses.includes(instrument.instrument_class) && contract.symbols.includes(instrument.symbol as ForexRuntimeSymbol)
    ? { eligible: true, reason: null } : { eligible: false, reason: "unsupported_instrument_class" };
}
export function forexScannerFetchPlan(contracts: readonly ForexStrategyContract[] = FOREX_STRATEGY_CONTRACTS): string[] {
  return [...new Set(contracts.filter((contract) => contract.lifecycle === "ENABLED").flatMap((contract) => [...contract.primaryTimeframes, ...contract.contextTimeframes]))];
}
export function forexStrategyTimeframes(contract: ForexStrategyContract): string[] { return [...new Set([...contract.primaryTimeframes, ...contract.contextTimeframes])]; }
export function isForexRuntimeSymbol(value: string): value is ForexRuntimeSymbol { return runtimeInstrument(value)?.runtime_enabled === true; }
