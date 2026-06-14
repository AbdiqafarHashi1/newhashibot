export type CapitalClassification = 'approved' | 'watchlist' | 'probation' | 'rejected' | 'insufficient_data';
export type StrategyClassification = 'strong' | 'usable' | 'weak' | 'dangerous' | 'insufficient_data';
export type OpportunityTier = 'A1 best' | 'A2 usable' | 'B watch' | 'C suppress recommended' | 'insufficient_data';

export interface ScoreInputs {
  completedTrades: number;
  winRatePct: number | null;
  profitFactor: number | null;
  avgR: number | null;
  tp1RatePct?: number | null;
  tp2RatePct?: number | null;
  slRatePct?: number | null;
  executionReliabilityPct?: number | null;
  protectionReliabilityPct?: number | null;
  givebackAfterTp1R?: number | null;
}

export function classifySymbolQuality(input: ScoreInputs): CapitalClassification {
  if (input.completedTrades < 20) return 'insufficient_data';
  const pf = input.profitFactor ?? 0;
  const avgR = input.avgR ?? 0;
  const winRate = input.winRatePct ?? 0;
  const exec = input.executionReliabilityPct ?? 100;
  const prot = input.protectionReliabilityPct ?? 100;
  if (input.completedTrades >= 50 && pf >= 1.35 && avgR > 0.15 && winRate >= 48 && exec >= 80 && prot >= 90) return 'approved';
  if (pf >= 1.05 && avgR > 0 && winRate >= 42 && exec >= 70 && prot >= 80) return 'watchlist';
  if (pf >= 0.8 || avgR > -0.1) return 'probation';
  return 'rejected';
}

export function classifyStrategySurvival(input: ScoreInputs): StrategyClassification {
  if (input.completedTrades < 20) return 'insufficient_data';
  const pf = input.profitFactor ?? 0;
  const avgR = input.avgR ?? 0;
  const sl = input.slRatePct ?? 100;
  const giveback = input.givebackAfterTp1R ?? 0;
  if (input.completedTrades >= 50 && pf >= 1.4 && avgR >= 0.2 && sl <= 35 && giveback <= 0.35) return 'strong';
  if (pf >= 1.05 && avgR > 0 && sl <= 50) return 'usable';
  if (pf < 0.75 || avgR <= -0.2 || sl >= 65) return 'dangerous';
  return 'weak';
}

export function correlationGroup(symbol: string): 'BTC Core' | 'Majors' | 'High-beta alts' | 'Other' {
  const s = symbol.toUpperCase();
  if (s === 'BTCUSDT') return 'BTC Core';
  if (['ETHUSDT', 'BNBUSDT', 'SOLUSDT'].includes(s)) return 'Majors';
  if (['DOGEUSDT', 'XRPUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT'].includes(s)) return 'High-beta alts';
  return 'Other';
}

export function correlationPenalty(activeSameGroupExposure: number, duplicateMarketIdeaRisk: boolean): number {
  const exposurePenalty = Math.min(20, Math.max(0, activeSameGroupExposure) * 5);
  return exposurePenalty + (duplicateMarketIdeaRisk ? 15 : 0);
}

export interface OpportunityRankInput {
  scannerScore: number;
  confidence: number;
  rr: number;
  symbolQualityScore: number;
  strategySurvivalScore: number;
  regimeCompatibilityScore: number;
  volatilityConditionScore: number;
  recentSymbolPerformanceScore: number;
  executionReliabilityPct: number;
  protectionReliabilityPct: number;
  tp1ProbabilityPct: number;
  tp2ProbabilityPct: number;
  givebackRiskPct: number;
  correlationPenalty: number;
  duplicatePenalty: number;
  completedTrades: number;
}

export function calculateOpportunityRankScore(input: OpportunityRankInput): { score: number; tier: OpportunityTier } {
  if (input.completedTrades < 20) return { score: 0, tier: 'insufficient_data' };
  const score = clamp(
    input.scannerScore * 0.14 +
    input.confidence * 0.10 +
    clamp(input.rr * 20, 0, 100) * 0.08 +
    input.symbolQualityScore * 0.14 +
    input.strategySurvivalScore * 0.14 +
    input.regimeCompatibilityScore * 0.10 +
    input.volatilityConditionScore * 0.06 +
    input.recentSymbolPerformanceScore * 0.06 +
    input.executionReliabilityPct * 0.08 +
    input.protectionReliabilityPct * 0.06 +
    input.tp1ProbabilityPct * 0.08 +
    input.tp2ProbabilityPct * 0.04 -
    input.givebackRiskPct * 0.06 -
    input.correlationPenalty -
    input.duplicatePenalty,
    0,
    100,
  );
  if (score >= 80) return { score, tier: 'A1 best' };
  if (score >= 65) return { score, tier: 'A2 usable' };
  if (score >= 50) return { score, tier: 'B watch' };
  return { score, tier: 'C suppress recommended' };
}

export function customerSpamScore(signalsPerDay: number, openSignalsAtOnce: number, duplicateSignals: number, updatesPerDay: number): number {
  return clamp(signalsPerDay * 1.4 + openSignalsAtOnce * 3 + duplicateSignals * 4 + Math.max(0, updatesPerDay - 10) * 0.8, 0, 100);
}

export function scoreExitVariant(totalR: number, maxDrawdownR: number, givebackAfterTp1R: number, durationMinutes: number): number {
  return clamp(totalR * 10 - maxDrawdownR * 8 - givebackAfterTp1R * 12 - Math.max(0, durationMinutes - 240) / 60, 0, 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
