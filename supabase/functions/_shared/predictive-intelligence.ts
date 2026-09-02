/**
 * HashiBot Predictive Intelligence Layer - Central Integration Facade
 * Edge-compatible Deno / TypeScript module.
 * 
 * Re-exports:
 * 1. HMM Continuous Regime Classifier
 * 2. Continuous Kelly Criterion Optimizer
 * 3. Multi-Venue Smart Order Router & Latency Arbitrage Loop
 */

export * from "./hmm-regime-classifier.ts";
export * from "./kelly-sizing-optimizer.ts";
export * from "./smart-order-router.ts";

import {
  HMMRegimeClassifier,
  calculateGarmanKlassVolatility,
  type MicrostructuralObservation,
  type RegimeProbabilityVector,
} from "./hmm-regime-classifier.ts";
import {
  KellySizingOptimizer,
  type KellySizingResult,
  type ExecutionMode,
  type KellyFractionMode,
} from "./kelly-sizing-optimizer.ts";
import {
  SmartOrderRouterEngine,
  type VenueQuote,
  type RoutingDecision,
  type ArbitrageDiscrepancy,
} from "./smart-order-router.ts";

/**
 * High-level orchestration helper for edge functions (e.g., market-scanner & scheduled-market-scanner).
 */
export class PredictiveIntelligenceOrchestrator {
  private static classifiers: Map<string, HMMRegimeClassifier> = new Map();

  /**
   * Derives real-time HMM regime vector from candle stream.
   */
  public static evaluateMarketRegime(
    symbol: string,
    candles: Array<{ open: number; high: number; low: number; close: number; volume?: number }>,
    orderBookImbalance = 0.0,
    vwas = 0.00020,
    yieldFundingSpread = 0.00010,
  ): RegimeProbabilityVector {
    let classifier = this.classifiers.get(symbol);
    if (!classifier) {
      classifier = new HMMRegimeClassifier(symbol);
      this.classifiers.set(symbol, classifier);
    }

    const gkVol = calculateGarmanKlassVolatility(candles);
    const observation: MicrostructuralObservation = {
      symbol,
      garman_klass_volatility: gkVol,
      order_book_imbalance: orderBookImbalance,
      vwas,
      yield_funding_spread: yieldFundingSpread,
      timestamp_ns: Date.now() * 1_000_000,
    };

    return classifier.classifyObservation(observation);
  }

  /**
   * Computes optimal Continuous Kelly position sizing for a candidate signal.
   */
  public static calculateKellySize(params: {
    strategyId: string;
    accountId: string;
    symbol: string;
    accountEquityUsd: number;
    entryPrice: number;
    stopLossPrice: number;
    executionMode: ExecutionMode;
    candles?: Array<{ open: number; high: number; low: number; close: number }>;
    orderBookImbalance?: number;
    regimeToken?: RegimeProbabilityVector | null;
    userFractionMode?: KellyFractionMode;
  }): KellySizingResult {
    const gkVol = params.candles ? calculateGarmanKlassVolatility(params.candles) : 0.00030;
    return KellySizingOptimizer.calculateOptimalSizing({
      strategyId: params.strategyId,
      accountId: params.accountId,
      symbol: params.symbol,
      accountEquityUsd: params.accountEquityUsd,
      entryPrice: params.entryPrice,
      stopLossPrice: params.stopLossPrice,
      executionMode: params.executionMode,
      currentGkVol: gkVol,
      baselineGkVol: 0.00030,
      obi: params.orderBookImbalance ?? 0.0,
      regimeToken: params.regimeToken ?? null,
      userFractionMode: params.userFractionMode,
    });
  }

  /**
   * Evaluates best execution route and checks for cross-venue latency arbitrage.
   */
  public static evaluateRoutingAndArbitrage(params: {
    orderId: string;
    strategyId: string;
    symbol: string;
    side: "BUY" | "SELL";
    size: number;
    quotes: VenueQuote[];
  }): { routing: RoutingDecision; arbitrageOpportunities: ArbitrageDiscrepancy[] } {
    const routing = SmartOrderRouterEngine.planSmartRoute({
      orderId: params.orderId,
      strategyId: params.strategyId,
      symbol: params.symbol,
      side: params.side,
      size: params.size,
      quotes: params.quotes,
    });

    const arbitrageOpportunities = SmartOrderRouterEngine.detectCrossVenueArbitrage(params.quotes);

    return {
      routing,
      arbitrageOpportunities,
    };
  }
}
