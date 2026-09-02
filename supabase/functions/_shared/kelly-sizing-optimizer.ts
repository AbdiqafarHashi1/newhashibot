/**
 * HashiBot Predictive Intelligence Layer - Module 2: Continuous Kelly Criterion Sizing Optimizer
 * Edge-compatible Deno / TypeScript implementation.
 * 
 * Replaces static haircut sizing with continuous Kelly Criterion:
 *   f* = (p * b - q) / b = p - (1 - p) / b
 * Damped by Garman-Klass Volatility, Order Book Imbalance, and Regime Scaling Tokens.
 */

import type { RegimeProbabilityVector } from "./hmm-regime-classifier.ts";

export type KellyFractionMode = "FULL_KELLY" | "HALF_KELLY" | "QUARTER_KELLY";
export type ExecutionMode = "STRICT_PROP_GUARDRAIL" | "AGGRESSIVE_PERSONAL";

export interface StrategyPerformanceMetrics {
  strategy_id: string;
  win_rate: number;          // p in [0.0, 1.0]
  win_loss_ratio: number;    // b = avg_win / avg_loss
  sample_size: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  consecutive_losses: number;
}

export interface KellySizingResult {
  strategy_id: string;
  account_id: string;
  symbol: string;
  raw_kelly_fraction: number;
  regime_adjusted_fraction: number;
  fractional_multiplier: number;
  final_allocated_margin_fraction: number;
  recommended_margin_usd: number;
  recommended_position_units: number;
  capped_by_guardrail: boolean;
  reason: string;
  timestamp_iso: string;
}

export class KellySizingOptimizer {
  private static readonly PROP_MAX_RISK_PER_TRADE = 0.015;     // 1.5% max risk for prop firm accounts
  private static readonly PERSONAL_MAX_RISK_PER_TRADE = 0.080; // 8.0% max risk for personal aggressive accounts
  private static readonly MIN_POSITION_FRACTION = 0.001;       // 0.1% minimum viable deployment

  /** Baseline historical metrics for all 12 core HashiBot strategies */
  private static readonly STRATEGY_BASELINES: Record<string, { win_rate: number; win_loss_ratio: number; sample_size: number }> = {
    "crypto.micro-scalper": { win_rate: 0.64, win_loss_ratio: 1.45, sample_size: 1420 },
    "crypto.quick-scalp": { win_rate: 0.62, win_loss_ratio: 1.50, sample_size: 1100 },
    "crypto.compression-breakout": { win_rate: 0.52, win_loss_ratio: 2.30, sample_size: 680 },
    "crypto.swing-continuation": { win_rate: 0.48, win_loss_ratio: 2.75, sample_size: 410 },
    "crypto.reversal-exhaustion": { win_rate: 0.58, win_loss_ratio: 1.80, sample_size: 520 },
    "crypto.momentum-breakout": { win_rate: 0.50, win_loss_ratio: 2.40, sample_size: 790 },
    "forex.micro-scalper": { win_rate: 0.66, win_loss_ratio: 1.35, sample_size: 1850 },
    "forex.london-breakout": { win_rate: 0.54, win_loss_ratio: 2.10, sample_size: 620 },
    "forex.new-york-continuation": { win_rate: 0.56, win_loss_ratio: 1.95, sample_size: 740 },
    "forex.trend-pullback": { win_rate: 0.53, win_loss_ratio: 2.15, sample_size: 590 },
    "gold.volatility-breakout": { win_rate: 0.49, win_loss_ratio: 2.80, sample_size: 510 },
    "macro.yield-differential": { win_rate: 0.60, win_loss_ratio: 1.90, sample_size: 310 },
  };

  /**
   * Evaluates continuous unconstrained Kelly: f* = (p * b - q) / b
   */
  public static computeContinuousKelly(winRate: number, oddsRatio: number): number {
    const p = Math.max(0.01, Math.min(0.99, winRate));
    const b = Math.max(0.1, oddsRatio);
    const q = 1.0 - p;
    const rawF = (p * b - q) / b;
    return Math.max(0.0, rawF);
  }

  /**
   * Applies Garman-Klass volatility and Level-3 order book depth damping.
   */
  public static applyVolatilityDepthDamping(
    rawKelly: number,
    currentGkVol: number,
    baselineGkVol = 0.00030,
    obi = 0.0,
  ): number {
    if (rawKelly <= 0) return 0.0;
    const volRatio = Math.max(0.2, Math.min(5.0, currentGkVol / Math.max(1e-6, baselineGkVol)));
    const volDamping = 1.0 / Math.sqrt(volRatio);
    const depthDamping = Math.max(0.3, 1.0 - 0.5 * Math.abs(obi));
    return Math.max(0.0, rawKelly * volDamping * depthDamping);
  }

  /**
   * Comprehensive Kelly Sizing Engine evaluation.
   */
  public static calculateOptimalSizing(params: {
    strategyId: string;
    accountId: string;
    symbol: string;
    accountEquityUsd: number;
    entryPrice: number;
    stopLossPrice: number;
    executionMode: ExecutionMode;
    currentGkVol?: number;
    baselineGkVol?: number;
    obi?: number;
    regimeToken?: RegimeProbabilityVector | null;
    userFractionMode?: KellyFractionMode;
    metricsOverride?: Partial<StrategyPerformanceMetrics>;
  }): KellySizingResult {
    const {
      strategyId,
      accountId,
      symbol,
      accountEquityUsd,
      entryPrice,
      stopLossPrice,
      executionMode,
      currentGkVol = 0.00030,
      baselineGkVol = 0.00030,
      obi = 0.0,
      regimeToken = null,
      userFractionMode,
      metricsOverride,
    } = params;

    const baseMetric = this.STRATEGY_BASELINES[strategyId] ?? { win_rate: 0.55, win_loss_ratio: 1.85, sample_size: 300 };
    const winRate = metricsOverride?.win_rate ?? baseMetric.win_rate;
    const winLossRatio = metricsOverride?.win_loss_ratio ?? baseMetric.win_loss_ratio;
    const consecutiveLosses = metricsOverride?.consecutive_losses ?? 0;

    // 1. Raw Continuous Kelly
    const rawKelly = this.computeContinuousKelly(winRate, winLossRatio);

    // 2. Microstructural Damping
    const dampedKelly = this.applyVolatilityDepthDamping(rawKelly, currentGkVol, baselineGkVol, obi);

    // 3. Regime Multiplier
    let regimeMultiplier = 1.0;
    if (regimeToken) {
      regimeMultiplier = regimeToken.strategy_multipliers[strategyId] ?? 1.0;
      if (regimeToken.p_liquidity_shock > 0.40) {
        regimeMultiplier = 0.0;
      }
    }
    const regimeAdjusted = dampedKelly * regimeMultiplier;

    // 4. Fractional Kelly Multiplier
    let fractionMultiplier = 0.50; // Default Half Kelly
    if (executionMode === "STRICT_PROP_GUARDRAIL") {
      fractionMultiplier = 0.25; // Enforced strict Quarter Kelly for Prop Firm Protection
    } else if (userFractionMode === "FULL_KELLY") {
      fractionMultiplier = 1.00;
    } else if (userFractionMode === "QUARTER_KELLY") {
      fractionMultiplier = 0.25;
    }

    // 5. Exponential Loss Streak Backoff
    const lossStreakFactor = consecutiveLosses >= 2 ? Math.pow(0.5, consecutiveLosses - 1) : 1.0;
    let scaledFraction = regimeAdjusted * fractionMultiplier * lossStreakFactor;

    // 6. Stop Loss & Guardrail Caps
    const slDistancePct = Math.max(0.002, Math.abs(entryPrice - stopLossPrice) / Math.max(1e-6, entryPrice));
    const maxAllowedRiskPct = executionMode === "STRICT_PROP_GUARDRAIL"
      ? this.PROP_MAX_RISK_PER_TRADE
      : this.PERSONAL_MAX_RISK_PER_TRADE;

    let capped = false;
    let reason = "OPTIMAL_CONTINUOUS_KELLY";

    const proposedRiskPct = scaledFraction * slDistancePct;
    if (proposedRiskPct > maxAllowedRiskPct) {
      scaledFraction = maxAllowedRiskPct / slDistancePct;
      capped = true;
      reason = `CAPPED_BY_${executionMode}_LIMIT (${(maxAllowedRiskPct * 100).toFixed(1)}% max risk)`;
    }

    if (scaledFraction < this.MIN_POSITION_FRACTION) {
      scaledFraction = 0.0;
      reason = "BELOW_MINIMUM_VIABLE_KELLY_THRESHOLD";
    }

    const allocatedMarginUsd = accountEquityUsd * scaledFraction;
    const notionalUsd = slDistancePct > 0 ? allocatedMarginUsd / slDistancePct : 0.0;
    const recommendedUnits = notionalUsd / Math.max(1e-6, entryPrice);

    return {
      strategy_id: strategyId,
      account_id: accountId,
      symbol,
      raw_kelly_fraction: Number(rawKelly.toFixed(4)),
      regime_adjusted_fraction: Number(regimeAdjusted.toFixed(4)),
      fractional_multiplier: fractionMultiplier,
      final_allocated_margin_fraction: Number(scaledFraction.toFixed(4)),
      recommended_margin_usd: Number(allocatedMarginUsd.toFixed(2)),
      recommended_position_units: Number(recommendedUnits.toFixed(4)),
      capped_by_guardrail: capped,
      reason,
      timestamp_iso: new Date().toISOString(),
    };
  }
}
