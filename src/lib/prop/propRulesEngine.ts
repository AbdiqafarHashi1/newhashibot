/**
 * Prop Rules Engine — validates each trade request against firm-specific rules.
 * This is purely advisory/blocking logic. Does NOT touch Binance execution.
 */

export type PropDecision = 'approved' | 'blocked' | 'reduced' | 'wait';
export type PropMode = 'standard' | 'scalp_1pct';

export interface PropAccountRules {
  accountId: string;
  accountType: 'challenge' | 'funded' | 'evaluation';
  governorState: 'normal' | 'defensive' | 'paused' | 'locked';
  // Balance
  accountSizeUsd: number;
  currentBalanceUsd: number;
  peakBalanceUsd: number;
  startingBalanceUsd: number;
  unrealizedPnlUsd: number;
  // Rules
  maxDailyLossPct: number;
  maxTotalDrawdownPct: number;
  trailingDrawdownPct: number | null;
  trailingDrawdownFrom: 'peak' | 'starting_balance';
  profitTargetPct: number;
  maxLeverage: number;
  maxOpenPositions: number;
  allowedSymbols: string[] | null;
  newsAllowed: boolean;
  weekendHoldingAllowed: boolean;
  // Session
  todayRealizedPnlUsd: number;
  todayOpeningBalanceUsd: number;
  currentOpenPositions: number;
}

export interface TradeRequest {
  symbol: string;
  direction: 'long' | 'short';
  requestedSizeUsd: number;
  leverage: number;
  opportunityScore: number;  // 0-100 from calculateOpportunityRankScore
  mode: PropMode;
  isNewsTime: boolean;
  isWeekend: boolean;
}

export interface PropRulesResult {
  decision: PropDecision;
  approvedSizeUsd: number;
  riskPct: number;
  mode: PropMode;
  reasons: string[];
  warnings: string[];
  drawdownUsedPct: number;
  dailyLossUsedPct: number;
  remainingDailyBudgetUsd: number;
  trailingDrawdownFloorUsd: number | null;
}

export function evaluatePropRules(rules: PropAccountRules, req: TradeRequest): PropRulesResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // ── Hard blocks ─────────────────────────────────────────────
  if (rules.governorState === 'locked' || rules.governorState === 'paused') {
    return block(rules, req, [`Account governor is ${rules.governorState}`], warnings);
  }

  // Symbol allowlist
  if (rules.allowedSymbols && rules.allowedSymbols.length > 0) {
    if (!rules.allowedSymbols.map(s => s.toUpperCase()).includes(req.symbol.toUpperCase())) {
      return block(rules, req, [`Symbol ${req.symbol} not in allowed list`], warnings);
    }
  }

  // News restriction
  if (req.isNewsTime && !rules.newsAllowed) {
    return block(rules, req, ['News trading not allowed by firm rules'], warnings);
  }

  // Weekend restriction
  if (req.isWeekend && !rules.weekendHoldingAllowed) {
    return block(rules, req, ['Weekend holding not allowed by firm rules'], warnings);
  }

  // Max open positions
  if (rules.currentOpenPositions >= rules.maxOpenPositions) {
    return block(rules, req, [`Max open positions reached (${rules.currentOpenPositions}/${rules.maxOpenPositions})`], warnings);
  }

  // Leverage
  if (req.leverage > rules.maxLeverage) {
    return block(rules, req, [`Leverage ${req.leverage}x exceeds firm cap of ${rules.maxLeverage}x`], warnings);
  }

  // ── Drawdown checks ──────────────────────────────────────────
  const equity = rules.currentBalanceUsd + rules.unrealizedPnlUsd;
  const peak = Math.max(rules.peakBalanceUsd, rules.currentBalanceUsd);

  // Max total drawdown
  const totalDdPct = (peak - equity) / rules.accountSizeUsd;
  const drawdownUsedPct = totalDdPct / rules.maxTotalDrawdownPct;
  if (totalDdPct >= rules.maxTotalDrawdownPct) {
    return block(rules, req, [
      `Total drawdown ${(totalDdPct * 100).toFixed(2)}% >= max ${(rules.maxTotalDrawdownPct * 100).toFixed(0)}%`
    ], warnings);
  }

  // Trailing drawdown floor
  let trailingDrawdownFloorUsd: number | null = null;
  if (rules.trailingDrawdownPct !== null) {
    const base = rules.trailingDrawdownFrom === 'peak' ? peak : rules.startingBalanceUsd;
    trailingDrawdownFloorUsd = base * (1 - rules.trailingDrawdownPct);
    if (equity <= trailingDrawdownFloorUsd) {
      return block(rules, req, [
        `Equity ${equity.toFixed(0)} breached trailing DD floor ${trailingDrawdownFloorUsd.toFixed(0)}`
      ], warnings);
    }
  }

  // Daily loss limit
  const dailyLossLimit = rules.todayOpeningBalanceUsd * rules.maxDailyLossPct;
  const dailyLossUsed = -rules.todayRealizedPnlUsd; // positive = loss
  const dailyLossUsedPct = dailyLossLimit > 0 ? dailyLossUsed / dailyLossLimit : 0;
  const remainingDailyBudgetUsd = Math.max(0, dailyLossLimit - dailyLossUsed);

  if (dailyLossUsed >= dailyLossLimit) {
    return block(rules, req, [
      `Daily loss limit reached: lost $${dailyLossUsed.toFixed(0)} of $${dailyLossLimit.toFixed(0)} limit`
    ], warnings);
  }

  // ── Soft warnings ────────────────────────────────────────────
  if (drawdownUsedPct >= 0.80) warnings.push(`Max DD ${(drawdownUsedPct * 100).toFixed(0)}% consumed — be conservative`);
  if (dailyLossUsedPct >= 0.70) warnings.push(`Daily loss budget ${(dailyLossUsedPct * 100).toFixed(0)}% used`);
  if (rules.governorState === 'defensive') warnings.push('Governor in defensive mode — size reduced');

  // ── Mode selection ───────────────────────────────────────────
  // Prefer scalp mode when: defensive, daily budget tight, or explicitly A1 score in trending market
  const recommendedMode = selectMode(rules, req, dailyLossUsedPct, drawdownUsedPct);

  // ── Size calculation ─────────────────────────────────────────
  const approved = calcApprovedSize(rules, req, recommendedMode, remainingDailyBudgetUsd, drawdownUsedPct);

  const riskPct = approved > 0 ? (approved / rules.currentBalanceUsd) : 0;

  return {
    decision: 'approved',
    approvedSizeUsd: approved,
    riskPct,
    mode: recommendedMode,
    reasons,
    warnings,
    drawdownUsedPct,
    dailyLossUsedPct,
    remainingDailyBudgetUsd,
    trailingDrawdownFloorUsd,
  };
}

function selectMode(
  rules: PropAccountRules,
  req: TradeRequest,
  dailyBudgetUsedPct: number,
  ddUsedPct: number,
): PropMode {
  // Explicit scalp request always honored
  if (req.mode === 'scalp_1pct') return 'scalp_1pct';
  // Defensive governor → switch to scalp for capital preservation
  if (rules.governorState === 'defensive') return 'scalp_1pct';
  // Daily budget >60% used → safer to scalp
  if (dailyBudgetUsedPct >= 0.60) return 'scalp_1pct';
  // Total DD >70% → scalp mode
  if (ddUsedPct >= 0.70) return 'scalp_1pct';
  // Challenge mode: near profit target → protect gains with scalp
  if (rules.accountType === 'challenge') {
    const gained = (rules.currentBalanceUsd - rules.startingBalanceUsd) / rules.accountSizeUsd;
    const targetPct = rules.profitTargetPct;
    if (gained >= targetPct * 0.85) return 'scalp_1pct'; // 85% of target reached
  }
  return 'standard';
}

function calcApprovedSize(
  rules: PropAccountRules,
  req: TradeRequest,
  mode: PropMode,
  remainingDailyBudgetUsd: number,
  ddUsedPct: number,
): number {
  // Scalp mode: risk exactly 0.5% per trade (TP1=1%, SL=0.5% → 2:1 R/R)
  const baseRiskPct = mode === 'scalp_1pct' ? 0.005 : 0.01;

  // Reduce risk when drawdown is accumulating
  let riskMultiplier = 1.0;
  if (ddUsedPct >= 0.70) riskMultiplier = 0.5;
  else if (ddUsedPct >= 0.50) riskMultiplier = 0.75;
  if (rules.governorState === 'defensive') riskMultiplier = Math.min(riskMultiplier, 0.5);

  const riskUsd = rules.currentBalanceUsd * baseRiskPct * riskMultiplier;

  // Never risk more than 33% of remaining daily budget in one trade
  const budgetCap = remainingDailyBudgetUsd * 0.33;
  const capped = Math.min(riskUsd, budgetCap);

  // Final size = risk amount (not notional — caller converts to position size)
  const approved = Math.min(capped, req.requestedSizeUsd);
  return Math.max(0, approved);
}

function block(
  rules: PropAccountRules,
  req: TradeRequest,
  reasons: string[],
  warnings: string[],
): PropRulesResult {
  const equity = rules.currentBalanceUsd + rules.unrealizedPnlUsd;
  const peak = Math.max(rules.peakBalanceUsd, rules.currentBalanceUsd);
  const totalDdPct = (peak - equity) / rules.accountSizeUsd;
  const dailyLossLimit = rules.todayOpeningBalanceUsd * rules.maxDailyLossPct;
  const dailyLossUsed = -rules.todayRealizedPnlUsd;
  return {
    decision: 'blocked',
    approvedSizeUsd: 0,
    riskPct: 0,
    mode: req.mode,
    reasons,
    warnings,
    drawdownUsedPct: totalDdPct / rules.maxTotalDrawdownPct,
    dailyLossUsedPct: dailyLossLimit > 0 ? dailyLossUsed / dailyLossLimit : 0,
    remainingDailyBudgetUsd: Math.max(0, dailyLossLimit - dailyLossUsed),
    trailingDrawdownFloorUsd: null,
  };
}

// ── Readiness scoring (0-100) ────────────────────────────────
export function calcPropReadinessScore(rules: PropAccountRules): {
  score: number;
  tier: 'green' | 'yellow' | 'red';
  factors: Array<{ label: string; penalty: number; detail: string }>;
} {
  let score = 100;
  const factors: Array<{ label: string; penalty: number; detail: string }> = [];

  const equity = rules.currentBalanceUsd + rules.unrealizedPnlUsd;
  const peak = Math.max(rules.peakBalanceUsd, rules.currentBalanceUsd);

  // Drawdown factor
  const ddPct = (peak - equity) / rules.accountSizeUsd;
  const ddUsedRatio = ddPct / rules.maxTotalDrawdownPct;
  if (ddUsedRatio >= 0.90) {
    score -= 50; factors.push({ label: 'Drawdown', penalty: 50, detail: `${(ddPct*100).toFixed(2)}% of ${(rules.maxTotalDrawdownPct*100).toFixed(0)}% limit` });
  } else if (ddUsedRatio >= 0.70) {
    score -= 25; factors.push({ label: 'Drawdown', penalty: 25, detail: `${(ddPct*100).toFixed(2)}% — approaching limit` });
  } else if (ddUsedRatio >= 0.50) {
    score -= 10; factors.push({ label: 'Drawdown', penalty: 10, detail: `${(ddPct*100).toFixed(2)}% — halfway to limit` });
  }

  // Daily loss factor
  const dailyLimit = rules.todayOpeningBalanceUsd * rules.maxDailyLossPct;
  const dailyLossRatio = dailyLimit > 0 ? (-rules.todayRealizedPnlUsd) / dailyLimit : 0;
  if (dailyLossRatio >= 0.90) {
    score -= 40; factors.push({ label: 'Daily loss', penalty: 40, detail: `${(dailyLossRatio*100).toFixed(0)}% of daily limit used` });
  } else if (dailyLossRatio >= 0.70) {
    score -= 20; factors.push({ label: 'Daily loss', penalty: 20, detail: `${(dailyLossRatio*100).toFixed(0)}% of daily limit used` });
  }

  // Governor state
  if (rules.governorState === 'paused' || rules.governorState === 'locked') {
    score -= 30; factors.push({ label: 'Governor', penalty: 30, detail: `State: ${rules.governorState}` });
  } else if (rules.governorState === 'defensive') {
    score -= 10; factors.push({ label: 'Governor', penalty: 10, detail: 'Defensive mode active' });
  }

  // Challenge progress (funded mode gets a bonus for consistency)
  if (rules.accountType === 'funded') {
    const gained = (rules.currentBalanceUsd - rules.startingBalanceUsd) / rules.accountSizeUsd;
    if (gained > 0.02) {
      score = Math.min(100, score + 5); // small bonus for funded accounts in profit
    }
  }

  score = Math.max(0, Math.min(100, score));
  const tier = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';
  return { score, tier, factors };
}
