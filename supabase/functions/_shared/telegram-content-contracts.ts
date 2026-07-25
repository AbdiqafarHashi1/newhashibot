/**
 * HashiBot Phase 7A-2A Scheduled Content Contracts
 * Defines structured content generation contracts for Daily, Weekly, and Monthly
 * public channel publications.
 */

export interface ContentContract {
  id: string;
  cadence: "daily" | "weekly" | "monthly";
  contractType:
    | "MARKET_OUTLOOK"
    | "EDUCATIONAL_POST"
    | "NO_TRADE_EXPLANATION"
    | "WEEKLY_RECAP"
    | "MONTHLY_SUMMARY";
  targetChannel: "free";
  title: string;
  data: Record<string, unknown>;
  createdAt: string;
}

/**
 * Generate a Daily Market Outlook contract (London or New York session)
 */
export function createDailyMarketOutlookContract(
  session: "London" | "New York" | "Asian",
  market: "Crypto" | "Forex" | "Multi-Asset",
  regime: string,
  keyLevels: string[],
  volatilityContext: string
): ContentContract {
  return {
    id: `contract-outlook-${Date.now()}`,
    cadence: "daily",
    contractType: "MARKET_OUTLOOK",
    targetChannel: "free",
    title: `Daily ${market} Outlook (${session} Session)`,
    data: {
      session,
      market,
      regime,
      keyLevels,
      volatilityContext,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate a No-Trade Explanation contract when 0 signals qualified
 */
export function createNoTradeExplanationContract(
  market: string,
  reason: string,
  macroContext: string
): ContentContract {
  return {
    id: `contract-notrade-${Date.now()}`,
    cadence: "daily",
    contractType: "NO_TRADE_EXPLANATION",
    targetChannel: "free",
    title: `No-Trade Guidance (${market})`,
    data: {
      market,
      reason,
      macroContext,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate an Educational Content contract
 */
export function createEducationalContract(
  topic: "Risk Management" | "Strategy Deep Dive" | "Market Structure" | "Position Sizing",
  keyTakeaway: string,
  exampleScenario: string
): ContentContract {
  return {
    id: `contract-edu-${Date.now()}`,
    cadence: "daily",
    contractType: "EDUCATIONAL_POST",
    targetChannel: "free",
    title: `Trading Intelligence: ${topic}`,
    data: {
      topic,
      keyTakeaway,
      exampleScenario,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate a Weekly Recap contract
 */
export function createWeeklyRecapContract(
  totalSignalsCount: number,
  qualifiedFreeSignalsCount: number,
  winRatePct: number,
  topPerformingStrategy: string,
  topPerformingMarket: string,
  keyHighlights: string[]
): ContentContract {
  return {
    id: `contract-weekly-${Date.now()}`,
    cadence: "weekly",
    contractType: "WEEKLY_RECAP",
    targetChannel: "free",
    title: "Weekly Market Intelligence & Signal Performance Recap",
    data: {
      totalSignalsCount,
      qualifiedFreeSignalsCount,
      winRatePct,
      topPerformingStrategy,
      topPerformingMarket,
      keyHighlights,
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate a Monthly Summary contract
 */
export function createMonthlySummaryContract(
  monthName: string,
  totalSignals: number,
  platformUpgrades: string[],
  educationalMilestones: string[]
): ContentContract {
  return {
    id: `contract-monthly-${Date.now()}`,
    cadence: "monthly",
    contractType: "MONTHLY_SUMMARY",
    targetChannel: "free",
    title: `HashiBot Monthly Summary: ${monthName}`,
    data: {
      monthName,
      totalSignals,
      platformUpgrades,
      educationalMilestones,
    },
    createdAt: new Date().toISOString(),
  };
}
