import type {StrategyRuntimeConfig} from "./professional-strategies.ts";
export function microScalperRuntimeParams(cfg: StrategyRuntimeConfig, timeframe: string): { params: Record<string, number>; config_source: "db" | "fallback" | "runtime_override"; base_config_source: "db" | "fallback"; runtime_overrides: string[] } {
  const calibrated15m: Record<string, number> = {
    min_score: 72,
    min_rr: 1.2,
    stop_atr_mult: 1.4,
    tp1_r: 1.2,
    tp2_r: 1.8,
    min_body_atr: 0.30,
    rsi_buy_min: 52,
    rsi_sell_max: 48,
    max_bars_in_trade: 24,
    momentum_lookback: 3,
    min_atr_pct: 0.10,
    max_atr_pct: 3.0,
    crypto_behavior_tuning: 1,
  };
  const calibrated5m: Record<string, number> = {
    ...calibrated15m,
    // Keep scanner 5m aligned with the successful live-like 5m CSV/backtest
    // path unless DB explicitly provides timeframe-specific overrides.
    rsi_buy_min: calibrated15m.rsi_buy_min,
    rsi_sell_max: calibrated15m.rsi_sell_max,
    stop_atr_mult: calibrated15m.stop_atr_mult,
    max_bars_in_trade: calibrated15m.max_bars_in_trade,
  };
  const calibrated = timeframe === "5m" ? calibrated5m : calibrated15m;
  const runtimeOverrides: string[] = [];
  const params: Record<string, number> = { ...calibrated, ...cfg.params };

  // The live scanner has a single DB strategy_config row for MicroScalper. Keep
  // 5m on the same calibrated surface as the successful 5m CSV/backtest path
  // unless the DB has explicit timeframe-specific keys.
  if (timeframe === "5m") {
    const timeframeKeys: Record<string, string> = {
      rsi_buy_min: "rsi_buy_min_5m",
      rsi_sell_max: "rsi_sell_max_5m",
      stop_atr_mult: "stop_atr_mult_5m",
      max_bars_in_trade: "max_bars_in_trade_5m",
    };
    for (const [key, tfKey] of Object.entries(timeframeKeys)) {
      const explicit = cfg.params[tfKey];
      const next = typeof explicit === "number" && Number.isFinite(explicit) ? explicit : (calibrated5m[key] ?? params[key] ?? 0);
      if (params[key] !== next) runtimeOverrides.push(key);
      params[key] = next;
    }
  }

  params.min_score = cfg.min_score > 0 ? cfg.min_score : calibrated.min_score;
  params.min_rr = cfg.min_rr > 0 ? cfg.min_rr : calibrated.min_rr;
  if (cfg.max_bars_in_trade > 0 && timeframe !== "5m") params.max_bars_in_trade = cfg.max_bars_in_trade;
  if (timeframe === "5m" && cfg.params.max_bars_in_trade_5m === undefined) params.max_bars_in_trade = calibrated5m.max_bars_in_trade;
  params.crypto_behavior_tuning = 1;

  return {
    params,
    config_source: runtimeOverrides.length > 0 ? "runtime_override" : (cfg.config_source === "db" ? "db" : "fallback"),
    base_config_source: (cfg.config_source === "db" ? "db" : "fallback"),
    runtime_overrides: runtimeOverrides,
  };
}

