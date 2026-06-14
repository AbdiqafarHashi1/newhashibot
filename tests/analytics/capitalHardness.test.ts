import assert from 'node:assert/strict';
import { calculateOpportunityRankScore, classifyStrategySurvival, classifySymbolQuality, correlationGroup, correlationPenalty, customerSpamScore, scoreExitVariant } from '../../src/lib/capitalHardness.js';

assert.equal(classifySymbolQuality({ completedTrades: 60, winRatePct: 55, profitFactor: 1.6, avgR: 0.25, executionReliabilityPct: 90, protectionReliabilityPct: 95 }), 'approved');
assert.equal(classifySymbolQuality({ completedTrades: 12, winRatePct: 80, profitFactor: 3, avgR: 1 }), 'insufficient_data');
assert.equal(classifyStrategySurvival({ completedTrades: 55, winRatePct: 52, profitFactor: 1.5, avgR: 0.22, slRatePct: 30, givebackAfterTp1R: 0.2 }), 'strong');
assert.equal(classifyStrategySurvival({ completedTrades: 30, winRatePct: 25, profitFactor: 0.5, avgR: -0.3, slRatePct: 70 }), 'dangerous');
assert.equal(correlationGroup('SOLUSDT'), 'Majors');
assert.equal(correlationGroup('SUIUSDT'), 'High-beta alts');
assert.equal(correlationPenalty(2, true), 25);
const rank = calculateOpportunityRankScore({ scannerScore: 90, confidence: 88, rr: 2.5, symbolQualityScore: 85, strategySurvivalScore: 82, regimeCompatibilityScore: 80, volatilityConditionScore: 75, recentSymbolPerformanceScore: 70, executionReliabilityPct: 95, protectionReliabilityPct: 98, tp1ProbabilityPct: 75, tp2ProbabilityPct: 45, givebackRiskPct: 20, correlationPenalty: 0, duplicatePenalty: 0, completedTrades: 50 });
assert.equal(rank.tier, 'A1 best');
assert.equal(calculateOpportunityRankScore({ scannerScore: 90, confidence: 88, rr: 2.5, symbolQualityScore: 85, strategySurvivalScore: 82, regimeCompatibilityScore: 80, volatilityConditionScore: 75, recentSymbolPerformanceScore: 70, executionReliabilityPct: 95, protectionReliabilityPct: 98, tp1ProbabilityPct: 75, tp2ProbabilityPct: 45, givebackRiskPct: 20, correlationPenalty: 0, duplicatePenalty: 0, completedTrades: 5 }).tier, 'insufficient_data');
assert.equal(customerSpamScore(30, 8, 4, 20) > customerSpamScore(5, 1, 0, 5), true);
assert.equal(scoreExitVariant(5, 1, 0.2, 60) > scoreExitVariant(1, 3, 1.5, 480), true);
console.log('capitalHardness analytics tests passed');
