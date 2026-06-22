/**
 * Signal Competition Engine for Prop Trading
 *
 * Uses the existing calculateOpportunityRankScore() arbitrator to rank
 * candidate signals and select the single best entry for a prop account.
 * Also determines whether scalp_1pct mode is appropriate.
 */

import { calculateOpportunityRankScore, correlationGroup, type OpportunityRankInput, type OpportunityTier } from '../capitalHardness';
import type { PropMode } from './propRulesEngine';

export interface SignalCandidate {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  scannerScore: number;
  confidence: number;           // 0-100
  rr: number;                   // reward:risk ratio
  completedTrades: number;
  winRatePct: number | null;
  profitFactor: number | null;
  avgR: number | null;
  tp1RatePct: number | null;
  tp2RatePct: number | null;
  slRatePct: number | null;
  executionReliabilityPct: number;
  protectionReliabilityPct: number;
  givebackRiskPct: number;
  isTrending: boolean;          // price already in strong directional move
  trendStrengthPct: number;     // 0-100 how strong the trend is
}

export interface RankedSignal {
  signal: SignalCandidate;
  score: number;
  tier: OpportunityTier;
  recommendedMode: PropMode;
  correlationGroup: string;
  scalp1PctEligible: boolean;
  rankedAt: string;
}

export interface CompetitionResult {
  winner: RankedSignal | null;
  ranked: RankedSignal[];
  suppressed: Array<{ signal: SignalCandidate; reason: string }>;
  competitionRanAt: string;
}

export function runSignalCompetition(
  candidates: SignalCandidate[],
  openSymbols: string[],        // symbols with open positions (to penalise duplicates)
  governorState: 'normal' | 'defensive' | 'paused' | 'locked',
): CompetitionResult {
  const now = new Date().toISOString();
  const suppressed: CompetitionResult['suppressed'] = [];
  const ranked: RankedSignal[] = [];

  if (governorState === 'paused' || governorState === 'locked') {
    return { winner: null, ranked: [], suppressed: candidates.map(s => ({ signal: s, reason: `Governor ${governorState}` })), competitionRanAt: now };
  }

  // Track exposure per correlation group for penalty calculation
  const openGroups = openSymbols.map(s => correlationGroup(s));

  for (const signal of candidates) {
    // Require minimum data
    if (signal.completedTrades < 20) {
      suppressed.push({ signal, reason: 'Insufficient trade history (<20 trades)' });
      continue;
    }

    // Duplicate symbol check
    const isDuplicate = openSymbols.map(s => s.toUpperCase()).includes(signal.symbol.toUpperCase());
    if (isDuplicate) {
      suppressed.push({ signal, reason: `Already have open position in ${signal.symbol}` });
      continue;
    }

    const group = correlationGroup(signal.symbol);
    const sameGroupCount = openGroups.filter(g => g === group).length;
    const correlationPenaltyVal = Math.min(20, sameGroupCount * 5) + (sameGroupCount >= 2 ? 15 : 0);

    const input: OpportunityRankInput = {
      scannerScore: signal.scannerScore,
      confidence: signal.confidence,
      rr: signal.rr,
      symbolQualityScore: signal.winRatePct != null ? signal.winRatePct : 50,
      strategySurvivalScore: signal.profitFactor != null ? Math.min(100, signal.profitFactor * 50) : 50,
      regimeCompatibilityScore: signal.isTrending ? Math.min(100, 50 + signal.trendStrengthPct * 0.5) : 50,
      volatilityConditionScore: 70,  // placeholder — can be extended with ATR volatility
      recentSymbolPerformanceScore: signal.tp1RatePct ?? 60,
      executionReliabilityPct: signal.executionReliabilityPct,
      protectionReliabilityPct: signal.protectionReliabilityPct,
      tp1ProbabilityPct: signal.tp1RatePct ?? 60,
      tp2ProbabilityPct: signal.tp2RatePct ?? 40,
      givebackRiskPct: signal.givebackRiskPct,
      correlationPenalty: correlationPenaltyVal,
      duplicatePenalty: 0,
      completedTrades: signal.completedTrades,
    };

    const { score, tier } = calculateOpportunityRankScore(input);

    // Suppress C-tier in defensive mode
    if (governorState === 'defensive' && tier === 'C suppress recommended') {
      suppressed.push({ signal, reason: 'C-tier suppressed in defensive mode' });
      continue;
    }

    // Scalp eligibility: trending + A-tier, or TP1 rate high, or defensive mode
    const scalp1PctEligible =
      (signal.isTrending && score >= 65) ||
      (signal.tp1RatePct != null && signal.tp1RatePct >= 70) ||
      governorState === 'defensive';

    const recommendedMode: PropMode =
      governorState === 'defensive' ? 'scalp_1pct' :
      (signal.isTrending && signal.trendStrengthPct >= 60 && score >= 65) ? 'scalp_1pct' :
      'standard';

    ranked.push({ signal, score, tier, recommendedMode, correlationGroup: group, scalp1PctEligible, rankedAt: now });
  }

  // Sort descending by score
  ranked.sort((a, b) => b.score - a.score);

  return {
    winner: ranked[0] ?? null,
    ranked,
    suppressed,
    competitionRanAt: now,
  };
}
