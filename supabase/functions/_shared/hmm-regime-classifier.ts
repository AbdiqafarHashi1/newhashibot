/**
 * HashiBot Predictive Intelligence Layer - Module 1: Hidden Markov Model (HMM) Continuous Regime Classifier
 * Edge-compatible Deno / TypeScript implementation.
 * 
 * Takes 4 continuous microstructural inputs:
 * 1. Garman-Klass Volatility (Zero-lag intra-candle diffusion variance)
 * 2. Level-3 Order Book Imbalance (OBI in [-1.0, 1.0])
 * 3. Volume-Weighted Average Spread (VWAS in basis points)
 * 4. Crypto Funding Rates (8h) or Forex Yield Spread differentials
 */

export type MarketRegimeToken = "REGIME_ACCUMULATION_GRID" | "REGIME_DISTRIBUTION_TREND" | "REGIME_LIQUIDITY_SHOCK";

export interface MicrostructuralObservation {
  symbol: string;
  garman_klass_volatility: number;
  order_book_imbalance: number;
  vwas: number;
  yield_funding_spread: number;
  timestamp_ns?: number;
}

export interface RegimeProbabilityVector {
  symbol: string;
  p_accumulation_grid: number;
  p_distribution_trend: number;
  p_liquidity_shock: number;
  dominant_regime: MarketRegimeToken;
  entropy: number;
  strategy_multipliers: Record<string, number>;
  timestamp_ns: number;
  timestamp_iso: string;
}

/**
 * Garman-Klass Volatility estimator for candles.
 * sigma_GK^2 = 0.5 * (ln(H/L))^2 - (2*ln(2) - 1) * (ln(C/O))^2
 */
export function calculateGarmanKlassVolatility(candles: Array<{ open: number; high: number; low: number; close: number }>): number {
  if (!candles || candles.length === 0) return 0.00030;
  const CONST_2LN2_MINUS_1 = 2.0 * Math.LN2 - 1.0; // ~0.386294
  let sumVar = 0;
  let count = 0;

  for (const c of candles.slice(-20)) {
    if (c.low <= 0 || c.open <= 0) continue;
    const logHL = Math.log(Math.max(c.high, c.low * 1.00001) / c.low);
    const logCO = Math.log(Math.max(c.close, 1e-8) / Math.max(c.open, 1e-8));
    const gkVar = 0.5 * (logHL * logHL) - CONST_2LN2_MINUS_1 * (logCO * logCO);
    sumVar += Math.max(0, gkVar);
    count++;
  }

  if (count === 0) return 0.00030;
  return Math.sqrt(sumVar / count);
}

export class HMMRegimeClassifier {
  private readonly states: MarketRegimeToken[] = [
    "REGIME_ACCUMULATION_GRID",
    "REGIME_DISTRIBUTION_TREND",
    "REGIME_LIQUIDITY_SHOCK",
  ];

  // Prior State Distribution: [P(Acc), P(Trend), P(Shock)]
  private currentAlpha: [number, number, number] = [0.70, 0.25, 0.05];

  // State Transition Probability Matrix A: 3x3
  private readonly transitionMatrix: number[][] = [
    [0.92, 0.07, 0.01],
    [0.10, 0.88, 0.02],
    [0.45, 0.25, 0.30],
  ];

  // Emission Parameters: Multivariate Gaussian Means (mu) & Variances (sigma^2)
  // Dimensions: [GK_Vol, OBI_Magnitude, VWAS_bps, Funding_Spread_bps]
  private readonly emissionMeans: number[][] = [
    [0.00018, 0.05, 0.00015, 0.00008], // Accumulation
    [0.00075, 0.55, 0.00045, 0.00035], // Distribution Trend
    [0.00350, 0.90, 0.00220, 0.00120], // Liquidity Shock
  ];

  private readonly emissionVariances: number[][] = [
    [0.00008 ** 2, 0.12 ** 2, 0.00008 ** 2, 0.00005 ** 2],
    [0.00035 ** 2, 0.25 ** 2, 0.00018 ** 2, 0.00015 ** 2],
    [0.00150 ** 2, 0.10 ** 2, 0.00090 ** 2, 0.00050 ** 2],
  ];

  constructor(public readonly symbol: string) {}

  private gaussianLogDensity(x: number[], mu: number[], variance: number[]): number {
    let logProb = 0.0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const mui = mu[i];
      const vi = Math.max(variance[i], 1e-12);
      const diff = xi - mui;
      const term = -0.5 * Math.log(2.0 * Math.PI * vi) - 0.5 * (diff * diff) / vi;
      logProb += term;
    }
    return logProb;
  }

  private logSumExp(logValues: number[]): number {
    const maxVal = Math.max(...logValues);
    if (!Number.isFinite(maxVal)) return -Infinity;
    let sumExp = 0.0;
    for (const v of logValues) {
      sumExp += Math.exp(v - maxVal);
    }
    return maxVal + Math.log(sumExp);
  }

  public classifyObservation(obs: MicrostructuralObservation): RegimeProbabilityVector {
    const xTransformed = [
      obs.garman_klass_volatility,
      Math.abs(obs.order_book_imbalance),
      obs.vwas,
      Math.abs(obs.yield_funding_spread),
    ];

    // 1. Compute Continuous Emission Log-Likelihoods
    const logEmissions = [
      this.gaussianLogDensity(xTransformed, this.emissionMeans[0], this.emissionVariances[0]),
      this.gaussianLogDensity(xTransformed, this.emissionMeans[1], this.emissionVariances[1]),
      this.gaussianLogDensity(xTransformed, this.emissionMeans[2], this.emissionVariances[2]),
    ];

    // 2. Forward Filtering in Log Domain
    const newLogAlpha: number[] = [];
    for (let j = 0; j < 3; j++) {
      const transitionTerms: number[] = [];
      for (let i = 0; i < 3; i++) {
        const prevP = Math.max(this.currentAlpha[i], 1e-12);
        transitionTerms.push(Math.log(prevP) + Math.log(this.transitionMatrix[i][j]));
      }
      const logPriorPred = this.logSumExp(transitionTerms);
      newLogAlpha.push(logPriorPred + logEmissions[j]);
    }

    // 3. Normalize Posterior Probabilities
    const logNorm = this.logSumExp(newLogAlpha);
    let posteriors = newLogAlpha.map((v) => Math.exp(v - logNorm));
    const sumP = posteriors.reduce((a, b) => a + b, 0);

    if (sumP > 0) {
      posteriors = posteriors.map((p) => p / sumP);
    } else {
      posteriors = [1 / 3, 1 / 3, 1 / 3];
    }

    this.currentAlpha = [posteriors[0], posteriors[1], posteriors[2]];

    // 4. Dominant Regime & Shannon Entropy
    let maxIdx = 0;
    let maxVal = posteriors[0];
    for (let i = 1; i < posteriors.length; i++) {
      if (posteriors[i] > maxVal) {
        maxVal = posteriors[i];
        maxIdx = i;
      }
    }
    const dominant = this.states[maxIdx];

    let entropy = 0.0;
    for (const p of posteriors) {
      if (p > 1e-9) {
        entropy -= p * Math.log2(p);
      }
    }

    // 5. Predictive Strategy Scaling Multipliers
    const pAcc = posteriors[0];
    const pTrend = posteriors[1];
    const pShock = posteriors[2];
    const shockDamping = Math.max(0.0, 1.0 - pShock * 2.5);

    const strategyMultipliers: Record<string, number> = {
      "crypto.micro-scalper": Number((pAcc * shockDamping).toFixed(4)),
      "crypto.quick-scalp": Number((pAcc * shockDamping).toFixed(4)),
      "forex.micro-scalper": Number((pAcc * shockDamping).toFixed(4)),
      "crypto.reversal-exhaustion": Number((pAcc * 1.2 * shockDamping).toFixed(4)),
      "crypto.compression-breakout": Number((pTrend * 1.3 * shockDamping).toFixed(4)),
      "crypto.swing-continuation": Number((pTrend * shockDamping).toFixed(4)),
      "crypto.momentum-breakout": Number((pTrend * 1.4 * shockDamping).toFixed(4)),
      "forex.london-breakout": Number((pTrend * shockDamping).toFixed(4)),
      "forex.new-york-continuation": Number((pTrend * shockDamping).toFixed(4)),
      "forex.trend-pullback": Number((pTrend * shockDamping).toFixed(4)),
      "gold.volatility-breakout": Number(((pTrend * 0.7 + pShock * 0.3) * shockDamping).toFixed(4)),
      "macro.yield-differential": Number((pTrend * shockDamping).toFixed(4)),
    };

    const nowNs = Date.now() * 1_000_000;
    return {
      symbol: this.symbol,
      p_accumulation_grid: Number(pAcc.toFixed(6)),
      p_distribution_trend: Number(pTrend.toFixed(6)),
      p_liquidity_shock: Number(pShock.toFixed(6)),
      dominant_regime: dominant,
      entropy: Number(entropy.toFixed(4)),
      strategy_multipliers: strategyMultipliers,
      timestamp_ns: nowNs,
      timestamp_iso: new Date().toISOString(),
    };
  }
}
