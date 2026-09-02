export interface QuantitativeSignal {
  id: string;
  symbol: string;
  assetClass: 'forex' | 'gold' | 'indices';
  direction: 'BUY' | 'SELL';
  strategyName: string;
  timeframe: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  riskRewardRatio: number;
  confluenceScore: number; // 0-100%
  confluenceBreakdown: {
    hmmRegime: { score: number; status: 'ALIGNED' | 'NEUTRAL' | 'CONFLICT'; label: string };
    orderFlowLiquidity: { score: number; status: 'VERIFIED' | 'ACCEPTABLE' | 'WEAK'; label: string };
    riskRewardExpectancy: { score: number; status: 'OPTIMAL' | 'MODERATE' | 'POOR'; label: string };
    newsSpreadSafety: { score: number; status: 'CLEAR' | 'CAUTION' | 'RESTRICTED'; label: string };
  };
  propVerdict: 'PROP_APPROVED' | 'PROP_REDUCED_RISK' | 'PROP_BLOCKED';
  personalVerdict: 'AGGRESSIVE_SCALE' | 'STANDARD_SCALE' | 'CAUTION';
  suggestedPropRiskPct: number; // e.g. 0.5%
  suggestedPersonalRiskPct: number; // e.g. 1.5%
  rationale: string;
  generatedAt: string;
  status: 'ACTIVE' | 'TRIGGERED' | 'EXPIRED';
}

export const LIVE_CONFLUENCE_SIGNALS: QuantitativeSignal[] = [
  {
    id: 'sig-xau-01',
    symbol: 'XAUUSD',
    assetClass: 'gold',
    direction: 'BUY',
    strategyName: 'Gold Institutional Surge & Liquidity Sweep',
    timeframe: 'M15 / H1',
    entryPrice: 2652.80,
    stopLoss: 2641.50,
    tp1: 2675.40,
    tp2: 2692.00,
    riskRewardRatio: 2.0,
    confluenceScore: 94,
    confluenceBreakdown: {
      hmmRegime: { score: 96, status: 'ALIGNED', label: 'Trend Flow Regime (92% transition confidence)' },
      orderFlowLiquidity: { score: 95, status: 'VERIFIED', label: 'Asian Lows Swept + Bullish FVG Mitigation' },
      riskRewardExpectancy: { score: 92, status: 'OPTIMAL', label: '1:2.0 R:R with 74.2% historical expectancy' },
      newsSpreadSafety: { score: 93, status: 'CLEAR', label: 'No high impact USD news next 3.5 hours' }
    },
    propVerdict: 'PROP_APPROVED',
    personalVerdict: 'AGGRESSIVE_SCALE',
    suggestedPropRiskPct: 0.50,
    suggestedPersonalRiskPct: 2.00,
    rationale: 'Clean sweep of overnight liquidity at 2642 with aggressive institutional absorption on volume delta. HMM regime confirms continuing expansion.',
    generatedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    status: 'ACTIVE'
  },
  {
    id: 'sig-eur-02',
    symbol: 'EURUSD',
    assetClass: 'forex',
    direction: 'BUY',
    strategyName: 'London Open Volatility Breakout',
    timeframe: 'M5 / M15',
    entryPrice: 1.08620,
    stopLoss: 1.08380,
    tp1: 1.09100,
    tp2: 1.09550,
    riskRewardRatio: 2.0,
    confluenceScore: 88,
    confluenceBreakdown: {
      hmmRegime: { score: 90, status: 'ALIGNED', label: 'Trend Flow Regime (London session momentum)' },
      orderFlowLiquidity: { score: 87, status: 'VERIFIED', label: 'Frankfurt high taken + retest of 15m orderblock' },
      riskRewardExpectancy: { score: 88, status: 'OPTIMAL', label: '1:2.0 R:R (24 pips risk : 48 pips target)' },
      newsSpreadSafety: { score: 87, status: 'CLEAR', label: 'ECB speech completed, spread 0.2 pips' }
    },
    propVerdict: 'PROP_APPROVED',
    personalVerdict: 'AGGRESSIVE_SCALE',
    suggestedPropRiskPct: 0.50,
    suggestedPersonalRiskPct: 1.75,
    rationale: 'London open breakout above key resistance with heavy bid volume. Stop loss placed safely below session low.',
    generatedAt: new Date(Date.now() - 32 * 60000).toISOString(),
    status: 'ACTIVE'
  },
  {
    id: 'sig-gbp-03',
    symbol: 'GBPUSD',
    assetClass: 'forex',
    direction: 'BUY',
    strategyName: 'Microstructure FVG Mean Reversion',
    timeframe: 'M15',
    entryPrice: 1.29850,
    stopLoss: 1.29520,
    tp1: 1.30510,
    tp2: 1.31100,
    riskRewardRatio: 2.0,
    confluenceScore: 85,
    confluenceBreakdown: {
      hmmRegime: { score: 84, status: 'ALIGNED', label: 'Accumulation to Trend Flow Transition' },
      orderFlowLiquidity: { score: 86, status: 'VERIFIED', label: 'Discount zone FVG tap with delta divergence' },
      riskRewardExpectancy: { score: 85, status: 'OPTIMAL', label: '1:2.0 R:R (33 pips risk : 66 pips target)' },
      newsSpreadSafety: { score: 85, status: 'CLEAR', label: 'Normal spread environment' }
    },
    propVerdict: 'PROP_APPROVED',
    personalVerdict: 'STANDARD_SCALE',
    suggestedPropRiskPct: 0.40,
    suggestedPersonalRiskPct: 1.50,
    rationale: 'Cable tapping discount fair value gap after liquidity grab. Target sits at previous day high liquidity pool.',
    generatedAt: new Date(Date.now() - 50 * 60000).toISOString(),
    status: 'ACTIVE'
  },
  {
    id: 'sig-jpy-04',
    symbol: 'USDJPY',
    assetClass: 'forex',
    direction: 'SELL',
    strategyName: 'Institutional Supply Rejection',
    timeframe: 'M30 / H1',
    entryPrice: 154.600,
    stopLoss: 155.150,
    tp1: 153.500,
    tp2: 152.800,
    riskRewardRatio: 2.0,
    confluenceScore: 78,
    confluenceBreakdown: {
      hmmRegime: { score: 76, status: 'NEUTRAL', label: 'Transitioning from Distribution' },
      orderFlowLiquidity: { score: 80, status: 'VERIFIED', label: '4H Supply Zone Tap with Bearish Engulfing' },
      riskRewardExpectancy: { score: 78, status: 'OPTIMAL', label: '1:2.0 R:R' },
      newsSpreadSafety: { score: 78, status: 'CLEAR', label: 'Tokyo session quiet, low spread' }
    },
    propVerdict: 'PROP_REDUCED_RISK',
    personalVerdict: 'STANDARD_SCALE',
    suggestedPropRiskPct: 0.25,
    suggestedPersonalRiskPct: 1.25,
    rationale: 'Higher timeframe supply rejection, but momentum slower due to Tokyo session close. Recommended reduced lot size on prop challenge.',
    generatedAt: new Date(Date.now() - 75 * 60000).toISOString(),
    status: 'ACTIVE'
  }
];

// Calculate confluence score dynamically for custom parameters
export function evaluateConfluenceScore(params: {
  symbol: string;
  direction: 'BUY' | 'SELL';
  riskReward: number;
  hasLiquiditySweep: boolean;
  isNewsTime: boolean;
  currentSpreadPips: number;
}): { score: number; verdict: 'PROP_APPROVED' | 'PROP_REDUCED_RISK' | 'PROP_BLOCKED'; breakdown: string[] } {
  let score = 50;
  const breakdown: string[] = [];

  // R:R evaluation
  if (params.riskReward >= 2.0) {
    score += 20;
    breakdown.push('Optimal Risk-to-Reward (>= 1:2.0) [+20%]');
  } else if (params.riskReward >= 1.5) {
    score += 10;
    breakdown.push('Moderate Risk-to-Reward (>= 1:1.5) [+10%]');
  } else {
    score -= 15;
    breakdown.push('Sub-optimal Risk-to-Reward (< 1:1.5) [-15%]');
  }

  // Liquidity sweep
  if (params.hasLiquiditySweep) {
    score += 20;
    breakdown.push('Institutional Liquidity Sweep Verified [+20%]');
  } else {
    breakdown.push('No confirmed liquidity sweep [0%]');
  }

  // News check
  if (params.isNewsTime) {
    score -= 30;
    breakdown.push('High-Impact Red Folder News Window Active [-30%]');
  } else {
    score += 10;
    breakdown.push('Economic Calendar Clear (+10%)');
  }

  // Spread check
  if (params.currentSpreadPips > 2.5) {
    score -= 15;
    breakdown.push(`High Spread Alert (${params.currentSpreadPips} pips) [-15%]`);
  } else {
    breakdown.push('Spread within institutional bounds');
  }

  score = Math.max(0, Math.min(100, score));

  let verdict: 'PROP_APPROVED' | 'PROP_REDUCED_RISK' | 'PROP_BLOCKED' = 'PROP_BLOCKED';
  if (score >= 80 && !params.isNewsTime) {
    verdict = 'PROP_APPROVED';
  } else if (score >= 65 && !params.isNewsTime) {
    verdict = 'PROP_REDUCED_RISK';
  }

  return { score, verdict, breakdown };
}
