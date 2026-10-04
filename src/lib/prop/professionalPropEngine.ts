export type PropProfileId =
  | "FTMO_TWO_STEP"
  | "FUNDEDNEXT_STELLAR_TWO_STEP"
  | "CUSTOM";
export type VerificationStatus =
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "PENDING_VERIFICATION"
  | "STALE"
  | "CUSTOM";
export type PropAccountMode =
  | "HISTORICAL_PROP_SIMULATION"
  | "VIRTUAL_PROP_ON_MT5"
  | "REAL_PROP";
export type RuleBasis =
  | "INITIAL_BALANCE"
  | "CURRENT_BALANCE"
  | "CURRENT_EQUITY"
  | "START_OF_DAY_BALANCE"
  | "START_OF_DAY_EQUITY"
  | "STATIC_DRAWDOWN"
  | "TRAILING_DRAWDOWN"
  | "END_OF_DAY_TRAILING"
  | "HIGH_WATER_MARK"
  | "CUSTOM";
export type ChallengeState =
  | "NOT_STARTED"
  | "PHASE_1_ACTIVE"
  | "PHASE_1_PASSED"
  | "PHASE_2_ACTIVE"
  | "PHASE_2_PASSED"
  | "FUNDED_PENDING"
  | "FUNDED_ACTIVE"
  | "FAILED_DAILY_LOSS"
  | "FAILED_MAX_LOSS"
  | "FAILED_RULE"
  | "FAILED_COMPLIANCE"
  | "EXPIRED"
  | "CANCELLED";
export type FundedState =
  | "NORMAL_TRADING"
  | "SOFT_PROFIT_GUARD"
  | "MONTHLY_PROFIT_THRESHOLD_REACHED"
  | "NO_NEW_ENTRIES"
  | "MANAGE_EXISTING_POSITIONS_ONLY"
  | "FLAT_ACCOUNT"
  | "FLAT_ACCOUNT_WAITING_FOR_PAYOUT"
  | "PAYOUT_READY"
  | "PAYOUT_PENDING"
  | "PAYOUT_CONFIRMED"
  | "NEXT_CYCLE_READY"
  | "DAILY_SAFETY_LOCK"
  | "DRAWDOWN_GUARD"
  | "FIRM_RULE_LOCK"
  | "NEWS_RESTRICTION"
  | "WEEKEND_RESTRICTION"
  | "MANUAL_PAUSE"
  | "MANAGE_ONLY"
  | "STOP_AFTER_FLAT"
  | "BROKER_OFFLINE"
  | "PROTECTION_FAILURE"
  | "RECONCILIATION_REQUIRED"
  | "ACCOUNT_BREACHED"
  | "PROFILE_VERIFICATION_REQUIRED";
export type AccountControl =
  | "START"
  | "PAUSE_NEW_ENTRIES"
  | "RESUME"
  | "MANAGE_ONLY"
  | "STOP_AFTER_FLAT"
  | "EMERGENCY_STOP";
export interface PropPhase {
  id: "PHASE_1" | "VERIFICATION" | "FUNDED";
  profitTargetPct: number | null;
  minimumTradingDays: number;
  durationDays: number | null;
}
export interface PropRuleProfile {
  dailyLossPct: number | null;
  maxLossPct: number | null;
  dailyLossBasis: RuleBasis;
  maxLossBasis: RuleBasis;
  floatingPnlIncluded: boolean;
  commissionIncluded: boolean;
  swapIncluded: boolean;
  feesIncluded: boolean;
  resetTimezone: string;
  resetTime: string;
  dstBehavior: "ZONE_DATABASE" | "FIXED_UTC" | "PENDING_VERIFICATION";
  flatRequiredForPayout: boolean;
}
export interface PropProgramProfile {
  firmId: string;
  firmName: string;
  programId: PropProfileId;
  programName: string;
  programType: "TWO_STEP" | "CUSTOM_PHASES";
  profileVersion: string;
  effectiveDate: string;
  verifiedAt: string | null;
  verificationStatus: VerificationStatus;
  verificationNotes: string[];
  accountSizes: number[];
  supportedPlatforms: string[];
  phases: PropPhase[];
  rules: PropRuleProfile;
  payout: {
    waitingDays: number | null;
    profitSplitPct: number | null;
    frequency: "ON_DEMAND" | "SCHEDULED" | "PENDING_VERIFICATION";
  };
  automation: {
    ea: "EA_ALLOWED" | "EA_RESTRICTED" | "EA_UNKNOWN";
    vps: "VPS_ALLOWED" | "VPS_RESTRICTED" | "VPS_UNKNOWN";
  };
  compliance: string[];
}
export interface PropAccountConfiguration {
  id: string;
  label: string;
  profileId: PropProfileId;
  profileVersion: string;
  accountSize: number;
  currency: string;
  mode: PropAccountMode;
  provider: "HISTORICAL" | "MT5";
  broker?: string;
  server?: string;
  accountReference?: string;
  platform?: string;
  fundedSince?: string;
  realPropActivationConfirmed: boolean;
  monthlyIncomeObjectivePct: number;
  softProfitGuardPct: number;
  noNewEntriesPct: number;
  internalDailyLossLockPct: number;
  retainedBufferPct: number;
  control: AccountControl;
}
export interface PropAccountSnapshot {
  timestamp: string;
  startingBalance: number;
  balance: number;
  equity: number;
  startOfDayBalance: number;
  closedPnl: number;
  floatingPnl: number;
  dailyClosedPnl: number;
  openRisk: number;
  openPositions: number;
  pendingExecutableOrders: number;
  tradingDays: number;
  brokerTruth: boolean;
}
function propResetDay(timestamp:string,timezone:string,resetTime:string){const date=new Date(timestamp),parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).filter(x=>x.type!=="literal").map(x=>[x.type,x.value])),reset=/^(\d\d?):(\d\d)/.exec(resetTime),before=reset&&(Number(parts.hour)*60+Number(parts.minute)<Number(reset[1])*60+Number(reset[2])),day=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);if(before)day.setUTCDate(day.getUTCDate()-1);return day.toISOString().slice(0,10)}
export interface PropAuditEvent {
  id: string;
  timestamp: string;
  accountId: string;
  oldState: string;
  newState: string;
  trigger: string;
  actor: "OPERATOR" | "ENGINE" | "BROKER";
  snapshot: PropAccountSnapshot;
  profileVersion: string;
  reasonCodes: string[];
}
export interface HistoricalTradeEvidence {
  id: string;
  closedAt: string;
  netPnl: number;
  intradayEquityLow?: number;
  provenance: "HISTORICAL_SIMULATION" | "DEMO_BROKER" | "LIVE_BROKER";
}
export interface CanonicalPropRun {
  id: string;
  label: string;
  strategyId: string;
  strategyVersion: string;
  symbol: string;
  datasetIds: readonly string[];
  runHash: string;
  executionModelVersion: string;
  trades: readonly import("../../../supabase/functions/_shared/trading-domain/contracts.ts").CanonicalCompletedTradeResult[];
}

export function canonicalRunEvidence(
  run: CanonicalPropRun,
): HistoricalTradeEvidence[] {
  return [...run.trades]
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt))
    .map((trade) => ({
      id: trade.tradeId,
      closedAt: trade.closedAt,
      netPnl: trade.netPnl ?? 0,
      provenance: "HISTORICAL_SIMULATION" as const,
    }));
}
export const ACCOUNT_SIZES = [
  5000, 10000, 25000, 50000, 100000, 200000,
] as const;
const baseRules: PropRuleProfile = {
  dailyLossPct: 5,
  maxLossPct: 10,
  dailyLossBasis: "START_OF_DAY_BALANCE",
  maxLossBasis: "INITIAL_BALANCE",
  floatingPnlIncluded: true,
  commissionIncluded: true,
  swapIncluded: true,
  feesIncluded: true,
  resetTimezone: "Europe/Prague",
  resetTime: "00:00",
  dstBehavior: "ZONE_DATABASE",
  flatRequiredForPayout: true,
};
export const PROP_PROFILES: Record<PropProfileId, PropProgramProfile> = {
  FTMO_TWO_STEP: {
    firmId: "ftmo",
    firmName: "FTMO",
    programId: "FTMO_TWO_STEP",
    programName: "FTMO 2-Step",
    programType: "TWO_STEP",
    profileVersion: "2026-09-repository-reference",
    effectiveDate: "2026-09-10",
    verifiedAt: null,
    verificationStatus: "PARTIALLY_VERIFIED",
    verificationNotes: [
      "Core numerical challenge limits are repository reference values; operator must verify current contract before REAL_PROP activation.",
      "Payout timing, automation, news and holding eligibility require account-specific verification.",
    ],
    accountSizes: [...ACCOUNT_SIZES],
    supportedPlatforms: ["MT5"],
    phases: [
      {
        id: "PHASE_1",
        profitTargetPct: 10,
        minimumTradingDays: 4,
        durationDays: null,
      },
      {
        id: "VERIFICATION",
        profitTargetPct: 5,
        minimumTradingDays: 4,
        durationDays: null,
      },
      {
        id: "FUNDED",
        profitTargetPct: null,
        minimumTradingDays: 0,
        durationDays: null,
      },
    ],
    rules: baseRules,
    payout: {
      waitingDays: null,
      profitSplitPct: 80,
      frequency: "PENDING_VERIFICATION",
    },
    automation: { ea: "EA_UNKNOWN", vps: "VPS_UNKNOWN" },
    compliance: [
      "latency_exploitation",
      "stale_price_abuse",
      "account_sharing",
      "unauthorized_copy_trading",
      "prohibited_arbitrage",
      "server_abuse",
    ],
  },
  FUNDEDNEXT_STELLAR_TWO_STEP: {
    firmId: "fundednext",
    firmName: "FundedNext",
    programId: "FUNDEDNEXT_STELLAR_TWO_STEP",
    programName: "Stellar Two-Step",
    programType: "TWO_STEP",
    profileVersion: "pending-verification",
    effectiveDate: "2026-09-10",
    verifiedAt: null,
    verificationStatus: "PENDING_VERIFICATION",
    verificationNotes: [
      "Exact current numerical, payout, platform and automation terms are not verified in repository evidence.",
    ],
    accountSizes: [...ACCOUNT_SIZES],
    supportedPlatforms: [],
    phases: [
      {
        id: "PHASE_1",
        profitTargetPct: null,
        minimumTradingDays: 0,
        durationDays: null,
      },
      {
        id: "VERIFICATION",
        profitTargetPct: null,
        minimumTradingDays: 0,
        durationDays: null,
      },
      {
        id: "FUNDED",
        profitTargetPct: null,
        minimumTradingDays: 0,
        durationDays: null,
      },
    ],
    rules: {
      ...baseRules,
      dailyLossPct: null,
      maxLossPct: null,
      resetTimezone: "UTC",
      dstBehavior: "PENDING_VERIFICATION",
    },
    payout: {
      waitingDays: null,
      profitSplitPct: null,
      frequency: "PENDING_VERIFICATION",
    },
    automation: { ea: "EA_UNKNOWN", vps: "VPS_UNKNOWN" },
    compliance: [],
  },
  CUSTOM: {
    firmId: "custom",
    firmName: "Custom / User Configured",
    programId: "CUSTOM",
    programName: "Custom",
    programType: "CUSTOM_PHASES",
    profileVersion: "custom/v1",
    effectiveDate: "2026-09-10",
    verifiedAt: null,
    verificationStatus: "CUSTOM",
    verificationNotes: ["User configured; not firm verified."],
    accountSizes: [...ACCOUNT_SIZES],
    supportedPlatforms: ["MT5"],
    phases: [
      {
        id: "PHASE_1",
        profitTargetPct: 10,
        minimumTradingDays: 0,
        durationDays: null,
      },
      {
        id: "VERIFICATION",
        profitTargetPct: 5,
        minimumTradingDays: 0,
        durationDays: null,
      },
      {
        id: "FUNDED",
        profitTargetPct: null,
        minimumTradingDays: 0,
        durationDays: null,
      },
    ],
    rules: baseRules,
    payout: { waitingDays: 14, profitSplitPct: 80, frequency: "ON_DEMAND" },
    automation: { ea: "EA_UNKNOWN", vps: "VPS_UNKNOWN" },
    compliance: [],
  },
};
export function deriveMonetaryRules(
  profile: PropProgramProfile,
  accountSize: number,
) {
  return {
    dailyLossAmount:
      profile.rules.dailyLossPct === null
        ? null
        : (accountSize * profile.rules.dailyLossPct) / 100,
    maxLossAmount:
      profile.rules.maxLossPct === null
        ? null
        : (accountSize * profile.rules.maxLossPct) / 100,
    phaseTargets: Object.fromEntries(
      profile.phases.map((p) => [
        p.id,
        p.profitTargetPct === null
          ? null
          : (accountSize * p.profitTargetPct) / 100,
      ]),
    ),
  };
}
export function assertRealPropActivation(
  config: PropAccountConfiguration,
  profile: PropProgramProfile,
) {
  if (config.mode !== "REAL_PROP") return;
  if (!config.realPropActivationConfirmed)
    throw new Error("REAL_PROP_OPERATOR_CONFIRMATION_REQUIRED");
  if (profile.verificationStatus !== "VERIFIED")
    throw new Error("REAL_PROP_PROFILE_VERIFICATION_REQUIRED");
  if (
    profile.automation.ea === "EA_UNKNOWN" ||
    !profile.supportedPlatforms.includes(config.platform ?? "")
  )
    throw new Error("REAL_PROP_AUTOMATION_OR_PLATFORM_UNVERIFIED");
}
export interface ChallengeResult {
  status: "PASSED" | "FAILED" | "INCOMPLETE";
  state: ChallengeState;
  phase: PropPhase["id"];
  endingBalance: number;
  profitPct: number;
  maxDrawdownPct: number;
  maxDailyLossPct: number;
  tradingDays: number;
  reasonCodes: string[];
  audit: PropAuditEvent[];
}
export function simulateChallenge(
  profile: PropProgramProfile,
  config: PropAccountConfiguration,
  phase: "PHASE_1" | "VERIFICATION",
  trades: readonly HistoricalTradeEvidence[],
): ChallengeResult {
  const p = profile.phases.find((x) => x.id === phase);
  if (
    !p ||
    p.profitTargetPct === null ||
    profile.rules.dailyLossPct === null ||
    profile.rules.maxLossPct === null
  )
    return {
      status: "INCOMPLETE",
      state: phase === "PHASE_1" ? "PHASE_1_ACTIVE" : "PHASE_2_ACTIVE",
      phase,
      endingBalance: config.accountSize,
      profitPct: 0,
      maxDrawdownPct: 0,
      maxDailyLossPct: 0,
      tradingDays: 0,
      reasonCodes: ["PROFILE_RULES_PENDING_VERIFICATION"],
      audit: [],
    };
  let balance = config.accountSize,
    peak = balance,
    maxDd = 0,
    maxDaily = 0;
  const days = new Set<string>(),
    daily = new Map<string, number>(),dailyStart=new Map<string,{balance:number;equity:number}>(),
    audit: PropAuditEvent[] = [];
  for (const trade of [...trades].sort((a, b) =>
    a.closedAt.localeCompare(b.closedAt),
  )) {
    const beforeBalance=balance;balance += trade.netPnl;
    peak = Math.max(peak, balance);
    const day = propResetDay(trade.closedAt,profile.rules.resetTimezone,profile.rules.resetTime),equity=trade.intradayEquityLow??balance;
    days.add(day);
    if(!dailyStart.has(day))dailyStart.set(day,{balance:beforeBalance,equity:beforeBalance});
    daily.set(day, (daily.get(day) ?? 0) + trade.netPnl);
    const start=dailyStart.get(day)!,dailyReference=profile.rules.dailyLossBasis==="START_OF_DAY_EQUITY"?start.equity:profile.rules.dailyLossBasis==="START_OF_DAY_BALANCE"?start.balance:config.accountSize,dailyValue=profile.rules.dailyLossBasis.includes("EQUITY")?equity:balance,dailyLoss=(Math.max(0,dailyReference-dailyValue)/dailyReference)*100;
    maxDaily = Math.max(maxDaily, dailyLoss);
    const maxValue=profile.rules.maxLossBasis.includes("EQUITY")?equity:balance,maxReference=profile.rules.maxLossBasis.startsWith("CURRENT_")?peak:config.accountSize;maxDd=Math.max(maxDd,((maxReference-maxValue)/maxReference)*100);
    const snapshot: PropAccountSnapshot = {
      timestamp: trade.closedAt,
      startingBalance: config.accountSize,
      balance,
      equity,
      startOfDayBalance: start.balance,
      closedPnl: balance - config.accountSize,
      floatingPnl: 0,
      dailyClosedPnl: daily.get(day) ?? 0,
      openRisk: 0,
      openPositions: 0,
      pendingExecutableOrders: 0,
      tradingDays: days.size,
      brokerTruth: false,
    };
    if (dailyLoss >= profile.rules.dailyLossPct)
      return {
        status: "FAILED",
        state: "FAILED_DAILY_LOSS",
        phase,
        endingBalance: balance,
        profitPct: (balance / config.accountSize - 1) * 100,
        maxDrawdownPct: maxDd,
        maxDailyLossPct: maxDaily,
        tradingDays: days.size,
        reasonCodes: ["DAILY_LOSS_LIMIT_BREACHED"],
        audit: [
          ...audit,
          {
            id: `audit:${trade.id}`,
            timestamp: trade.closedAt,
            accountId: config.id,
            oldState: phase === "PHASE_1" ? "PHASE_1_ACTIVE" : "PHASE_2_ACTIVE",
            newState: "FAILED_DAILY_LOSS",
            trigger: trade.id,
            actor: "ENGINE",
            snapshot,
            profileVersion: profile.profileVersion,
            reasonCodes: ["DAILY_LOSS_LIMIT_BREACHED"],
          },
        ],
      };
    if (maxDd >= profile.rules.maxLossPct)
      return {
        status: "FAILED",
        state: "FAILED_MAX_LOSS",
        phase,
        endingBalance: balance,
        profitPct: (balance / config.accountSize - 1) * 100,
        maxDrawdownPct: maxDd,
        maxDailyLossPct: maxDaily,
        tradingDays: days.size,
        reasonCodes: ["MAX_LOSS_LIMIT_BREACHED"],
        audit,
      };
  }
  const profitPct = (balance / config.accountSize - 1) * 100,
    daysMet = days.size >= p.minimumTradingDays;
  if (profitPct >= p.profitTargetPct && daysMet)
    return {
      status: "PASSED",
      state: phase === "PHASE_1" ? "PHASE_1_PASSED" : "PHASE_2_PASSED",
      phase,
      endingBalance: balance,
      profitPct,
      maxDrawdownPct: maxDd,
      maxDailyLossPct: maxDaily,
      tradingDays: days.size,
      reasonCodes: ["PROFIT_TARGET_AND_MINIMUM_DAYS_MET"],
      audit,
    };
  return {
    status: "INCOMPLETE",
    state: phase === "PHASE_1" ? "PHASE_1_ACTIVE" : "PHASE_2_ACTIVE",
    phase,
    endingBalance: balance,
    profitPct,
    maxDrawdownPct: maxDd,
    maxDailyLossPct: maxDaily,
    tradingDays: days.size,
    reasonCodes: [
      profitPct < p.profitTargetPct
        ? "PROFIT_TARGET_NOT_MET"
        : "MINIMUM_TRADING_DAYS_NOT_MET",
    ],
    audit,
  };
}
export interface FundedEvaluation {
  state: FundedState;
  entryDecision: "ALLOW" | "REDUCE" | "BLOCK";
  riskMultiplier: number;
  manageExisting: boolean;
  forceClose: boolean;
  flat: boolean;
  payoutStatus:
    | "NOT_ELIGIBLE"
    | "WAITING"
    | "READY_TO_REQUEST"
    | "PENDING"
    | "CONFIRMED";
  reasonCodes: string[];
}
export function evaluateFunded(
  config: PropAccountConfiguration,
  snapshot: PropAccountSnapshot,
  profile: PropProgramProfile,
  now = snapshot.timestamp,
): FundedEvaluation {
  const closedPct = (snapshot.closedPnl / config.accountSize) * 100,
    flat =
      snapshot.openPositions === 0 && snapshot.pendingExecutableOrders === 0,
    hardDaily =
      (Math.max(0, -snapshot.dailyClosedPnl) / config.accountSize) * 100;
  let state: FundedState = "NORMAL_TRADING",
    entryDecision: FundedEvaluation["entryDecision"] = "ALLOW",
    riskMultiplier = 1;
  const reasons: string[] = [];
  if (
    profile.rules.dailyLossPct !== null &&
    hardDaily >= profile.rules.dailyLossPct
  ) {
    state = "ACCOUNT_BREACHED";
    entryDecision = "BLOCK";
    reasons.push("FIRM_DAILY_LOSS_BREACH");
  } else if (hardDaily >= config.internalDailyLossLockPct) {
    state = "DAILY_SAFETY_LOCK";
    entryDecision = "BLOCK";
    reasons.push("HASHIBOT_DAILY_SAFETY_LOCK");
  } else if (
    config.control === "EMERGENCY_STOP" ||
    config.control === "PAUSE_NEW_ENTRIES"
  ) {
    state = "MANUAL_PAUSE";
    entryDecision = "BLOCK";
    reasons.push("OPERATOR_ENTRY_FREEZE");
  } else if (
    config.control === "MANAGE_ONLY" ||
    config.control === "STOP_AFTER_FLAT"
  ) {
    state =
      config.control === "MANAGE_ONLY" ? "MANAGE_ONLY" : "STOP_AFTER_FLAT";
    entryDecision = "BLOCK";
    reasons.push("OPERATOR_MANAGE_ONLY");
  } else if (closedPct >= config.noNewEntriesPct) {
    state = flat ? "FLAT_ACCOUNT" : "MANAGE_EXISTING_POSITIONS_ONLY";
    entryDecision = "BLOCK";
    reasons.push("REALIZED_OBJECTIVE_REACHED");
  } else if (
    closedPct + (snapshot.floatingPnl / config.accountSize) * 100 >=
    config.softProfitGuardPct
  ) {
    state = "SOFT_PROFIT_GUARD";
    entryDecision = "REDUCE";
    riskMultiplier = 0.5;
    reasons.push("SOFT_PROFIT_GUARD");
  }
  const payout = evaluatePayout(config, snapshot, profile, now);
  if (
    flat &&
    closedPct >= config.noNewEntriesPct &&
    payout.status === "READY_TO_REQUEST"
  )
    state = "PAYOUT_READY";
  return {
    state,
    entryDecision,
    riskMultiplier,
    manageExisting: true,
    forceClose: false,
    flat,
    payoutStatus: payout.status,
    reasonCodes: [...reasons, ...payout.reasonCodes],
  };
}
export function evaluatePayout(
  config: PropAccountConfiguration,
  snapshot: PropAccountSnapshot,
  profile: PropProgramProfile,
  now: string,
) {
  const reasons: string[] = [];
  if (snapshot.closedPnl <= 0) reasons.push("NO_ELIGIBLE_CLOSED_PROFIT");
  if (
    profile.rules.flatRequiredForPayout &&
    (snapshot.openPositions > 0 || snapshot.pendingExecutableOrders > 0)
  )
    reasons.push("ACCOUNT_NOT_FLAT");
  if (profile.payout.waitingDays === null)
    reasons.push("PAYOUT_WAITING_PERIOD_PENDING_VERIFICATION");
  if (profile.verificationStatus === "PENDING_VERIFICATION")
    reasons.push("PROFILE_PENDING_VERIFICATION");
  const nextEligible =
    profile.payout.waitingDays === null || !config.fundedSince
      ? null
      : new Date(
          Date.parse(config.fundedSince) +
            profile.payout.waitingDays * 86400000,
        ).toISOString();
  if (
    profile.payout.waitingDays !== null &&
    (!nextEligible || Date.parse(now) < Date.parse(nextEligible))
  )
    reasons.push("PAYOUT_WAITING_PERIOD");
  return {
    status: reasons.length
      ? reasons.every((r) => r === "PAYOUT_WAITING_PERIOD")
        ? ("WAITING" as const)
        : ("NOT_ELIGIBLE" as const)
      : ("READY_TO_REQUEST" as const),
    nextEligibleTimestamp: nextEligible,
    reasonCodes: reasons,
  };
}
export function calculatePayout(
  eligibleProfit: number,
  profitSplitPct: number,
  mode:
    | "WITHDRAW_ALL_ELIGIBLE"
    | "WITHDRAW_PERCENT"
    | "WITHDRAW_FIXED"
    | "WITHDRAW_RECOMMENDED"
    | "CUSTOM",
  value: number,
  retainedBuffer: number,
) {
  const traderReward = (eligibleProfit * profitSplitPct) / 100,
    requestedReward =
      mode === "WITHDRAW_ALL_ELIGIBLE"
        ? traderReward
        : mode === "WITHDRAW_PERCENT"
          ? (traderReward * value) / 100
          : mode === "WITHDRAW_RECOMMENDED"
            ? Math.max(0, traderReward - retainedBuffer)
            : Math.min(traderReward, value);
  return {
    grossEligibleProfit: eligibleProfit,
    profitSplitPct,
    firmShare: eligibleProfit - traderReward,
    traderReward,
    requestedReward,
    retainedBuffer,
    remainingProfit: traderReward - requestedReward,
    nextCycleReference: retainedBuffer,
    evidenceLevel: "POLICY_BASED_NOT_STATISTICALLY_CERTIFIED" as const,
  };
}
export function applyControl(
  config: PropAccountConfiguration,
  control: AccountControl,
  snapshot: PropAccountSnapshot,
): { config: PropAccountConfiguration; audit: PropAuditEvent } {
  const next =
    control === "START" && config.control === "EMERGENCY_STOP"
      ? config.control
      : control === "RESUME"
        ? "START"
        : control;
  return {
    config: { ...config, control: next },
    audit: {
      id: `control:${config.id}:${snapshot.timestamp}:${control}`,
      timestamp: snapshot.timestamp,
      accountId: config.id,
      oldState: config.control,
      newState: next,
      trigger: control,
      actor: "OPERATOR",
      snapshot,
      profileVersion: config.profileVersion,
      reasonCodes: [
        next === config.control && control === "START"
          ? "HARD_SAFETY_NOT_OVERRIDDEN"
          : "CONTROL_APPLIED",
      ],
    },
  };
}
export function routeSignalByAccount(
  accounts: readonly {
    config: PropAccountConfiguration;
    snapshot: PropAccountSnapshot;
    profile: PropProgramProfile;
  }[],
) {
  return accounts.map((a) => ({
    accountId: a.config.id,
    ...evaluateFunded(a.config, a.snapshot, a.profile),
  }));
}
export function simulateMultipleChallenges(
  profile: PropProgramProfile,
  config: PropAccountConfiguration,
  windows: readonly (readonly HistoricalTradeEvidence[])[],
) {
  const results = windows.map((w) =>
      simulateChallenge(profile, config, "PHASE_1", w),
    ),
    passed = results.filter((r) => r.status === "PASSED").length,
    failed = results.filter((r) => r.status === "FAILED").length;
  return {
    attemptCount: results.length,
    passCount: passed,
    failCount: failed,
    incompleteCount: results.length - passed - failed,
    historicalPassRate: results.length ? (passed / results.length) * 100 : 0,
    dailyLossFailures: results.filter((r) => r.state === "FAILED_DAILY_LOSS")
      .length,
    maxLossFailures: results.filter((r) => r.state === "FAILED_MAX_LOSS")
      .length,
    targetFailures: results.filter((r) => r.status === "INCOMPLETE").length,
    worstDrawdown: Math.max(0, ...results.map((r) => r.maxDrawdownPct)),
    profileVersion: profile.profileVersion,
    results,
  };
}
export function simulateFundedSurvival(
  config: PropAccountConfiguration,
  profile: PropProgramProfile,
  snapshots: readonly PropAccountSnapshot[],
) {
  let locks = 0,
    payoutReady = 0,
    breachReason: string | null = null,
    maxDrawdown = 0;
  for (const s of [...snapshots].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  )) {
    const e = evaluateFunded(config, s, profile);
    if (e.entryDecision !== "ALLOW") locks++;
    if (e.state === "PAYOUT_READY") payoutReady++;
    if (e.state === "ACCOUNT_BREACHED") {
      breachReason = e.reasonCodes[0];
      break;
    }
    maxDrawdown = Math.max(
      maxDrawdown,
      Math.max(0, ((config.accountSize - s.equity) / config.accountSize) * 100),
    );
  }
  return {
    survived: breachReason === null,
    breached: breachReason !== null,
    daysSurvived: new Set(snapshots.map((s) => s.timestamp.slice(0, 10))).size,
    breachReason,
    maxDrawdown,
    safetyLocks: locks,
    payoutReadyEvents: payoutReady,
    profileVersion: profile.profileVersion,
  };
}

export function fundedSnapshotsFromTrades(
  config: PropAccountConfiguration,
  trades: readonly HistoricalTradeEvidence[],
  durationDays: number,
): PropAccountSnapshot[] {
  if (!Number.isInteger(durationDays) || durationDays < 1)
    throw new Error("INVALID_SURVIVAL_DURATION");
  const ordered = [...trades].sort((a, b) =>
    a.closedAt.localeCompare(b.closedAt),
  );
  const start = ordered.length
    ? Date.parse(ordered[0].closedAt.slice(0, 10) + "T23:59:59.999Z")
    : Date.now();
  let balance = config.accountSize;
  return Array.from({ length: durationDays }, (_, index) => {
    const timestamp = new Date(start + index * 86_400_000).toISOString();
    const day = timestamp.slice(0, 10);
    const dayPnl = ordered
      .filter((trade) => trade.closedAt.slice(0, 10) === day)
      .reduce((sum, trade) => sum + trade.netPnl, 0);
    balance += dayPnl;
    return {
      timestamp,
      startingBalance: config.accountSize,
      balance,
      equity: balance,
      startOfDayBalance: balance - dayPnl,
      closedPnl: balance - config.accountSize,
      floatingPnl: 0,
      dailyClosedPnl: dayPnl,
      openRisk: 0,
      openPositions: 0,
      pendingExecutableOrders: 0,
      tradingDays: index + 1,
      brokerTruth: false,
    };
  });
}
export function confirmPayout(
  config: PropAccountConfiguration,
  operatorEvidenceId: string | null,
) {
  if (!operatorEvidenceId)
    throw new Error("PAYOUT_CONFIRMATION_EVIDENCE_REQUIRED");
  return {
    state: "PAYOUT_CONFIRMED" as const,
    milestone:
      config.mode === "REAL_PROP"
        ? ("FIRST_PAYOUT_VERIFIED" as const)
        : ("FIRST_PAYOUT_CONFIRMED" as const),
    evidenceId: operatorEvidenceId,
    verifiedRealPayout: config.mode === "REAL_PROP",
  };
}
export function mapVirtualMt5Snapshot(
  config: PropAccountConfiguration,
  input: {
    timestamp: string;
    balance: number;
    equity: number;
    openPositions: number;
    pendingOrders: number;
    closedPnl: number;
    floatingPnl: number;
  },
): PropAccountSnapshot {
  if (config.mode !== "VIRTUAL_PROP_ON_MT5")
    throw new Error("VIRTUAL_MT5_MODE_REQUIRED");
  return {
    timestamp: input.timestamp,
    startingBalance: config.accountSize,
    balance: input.balance,
    equity: input.equity,
    startOfDayBalance: input.balance - input.closedPnl,
    closedPnl: input.closedPnl,
    floatingPnl: input.floatingPnl,
    dailyClosedPnl: input.closedPnl,
    openRisk: 0,
    openPositions: input.openPositions,
    pendingExecutableOrders: input.pendingOrders,
    tradingDays: 0,
    brokerTruth: true,
  };
}

export interface FullChallengeResult {
  status: "FUNDED" | "FAILED" | "INCOMPLETE";
  phase1: ChallengeResult;
  verification: ChallengeResult | null;
  fundedEntryAt: string | null;
  remainingTrades: readonly HistoricalTradeEvidence[];
  timeline: readonly {
    state: string;
    timestamp: string;
    reasonCodes: readonly string[];
  }[];
}

export function simulateFullChallenge(
  profile: PropProgramProfile,
  config: PropAccountConfiguration,
  trades: readonly HistoricalTradeEvidence[],
): FullChallengeResult {
  const ordered = [...trades].sort((a, b) =>
    a.closedAt.localeCompare(b.closedAt),
  );
  const phase1Target = profile.phases.find(
    (phase) => phase.id === "PHASE_1",
  )?.profitTargetPct;
  const phase1End =
    phase1Target === null || phase1Target === undefined
      ? ordered.length
      : firstPassingIndex(profile, config, "PHASE_1", ordered);
  const phase1 = simulateChallenge(
    profile,
    config,
    "PHASE_1",
    phase1End >= 0 ? ordered.slice(0, phase1End + 1) : ordered,
  );
  if (phase1.status !== "PASSED" || phase1End < 0) {
    return {
      status: phase1.status === "FAILED" ? "FAILED" : "INCOMPLETE",
      phase1,
      verification: null,
      fundedEntryAt: null,
      remainingTrades: [],
      timeline: [
        {
          state: phase1.state,
          timestamp: ordered.at(-1)?.closedAt ?? profile.effectiveDate,
          reasonCodes: phase1.reasonCodes,
        },
      ],
    };
  }
  const verificationTrades = ordered.slice(phase1End + 1);
  const verificationConfig = { ...config, accountSize: config.accountSize };
  const verification = simulateChallenge(
    profile,
    verificationConfig,
    "VERIFICATION",
    verificationTrades,
  );
  const verificationEnd = firstPassingIndex(
    profile,
    verificationConfig,
    "VERIFICATION",
    verificationTrades,
  );
  const phase1At = ordered[phase1End]?.closedAt ?? profile.effectiveDate;
  if (verification.status !== "PASSED" || verificationEnd < 0) {
    return {
      status: verification.status === "FAILED" ? "FAILED" : "INCOMPLETE",
      phase1,
      verification,
      fundedEntryAt: null,
      remainingTrades: [],
      timeline: [
        {
          state: "PHASE_1_PASSED",
          timestamp: phase1At,
          reasonCodes: phase1.reasonCodes,
        },
        {
          state: verification.state,
          timestamp: verificationTrades.at(-1)?.closedAt ?? phase1At,
          reasonCodes: verification.reasonCodes,
        },
      ],
    };
  }
  const fundedEntryAt =
    verificationTrades[verificationEnd]?.closedAt ?? phase1At;
  return {
    status: "FUNDED",
    phase1,
    verification,
    fundedEntryAt,
    remainingTrades: verificationTrades.slice(verificationEnd + 1),
    timeline: [
      {
        state: "PHASE_1_PASSED",
        timestamp: phase1At,
        reasonCodes: phase1.reasonCodes,
      },
      {
        state: "PHASE_2_PASSED",
        timestamp: fundedEntryAt,
        reasonCodes: verification.reasonCodes,
      },
      {
        state: "FUNDED_ACTIVE",
        timestamp: fundedEntryAt,
        reasonCodes: ["TWO_STEP_COMPLETED"],
      },
    ],
  };
}

function firstPassingIndex(
  profile: PropProgramProfile,
  config: PropAccountConfiguration,
  phase: "PHASE_1" | "VERIFICATION",
  trades: readonly HistoricalTradeEvidence[],
): number {
  for (let index = 0; index < trades.length; index += 1) {
    if (
      simulateChallenge(profile, config, phase, trades.slice(0, index + 1))
        .status === "PASSED"
    )
      return index;
  }
  return -1;
}

export type ChallengeWindowMode =
  | "ROLLING_WINDOWS"
  | "MONTHLY_STARTS"
  | "QUARTERLY_STARTS"
  | "SEEDED_RANDOM";
export interface ChallengeWindow {
  id: string;
  from: string;
  to: string;
  trades: readonly HistoricalTradeEvidence[];
}

export function buildChallengeWindows(
  trades: readonly HistoricalTradeEvidence[],
  attempts: number,
  mode: ChallengeWindowMode,
  windowDays: number,
  seed = 1,
): ChallengeWindow[] {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 1000)
    throw new Error("INVALID_ATTEMPT_COUNT");
  const ordered = [...trades].sort((a, b) =>
    a.closedAt.localeCompare(b.closedAt),
  );
  if (!ordered.length) return [];
  const first = Date.parse(ordered[0].closedAt);
  const last = Date.parse(ordered.at(-1)!.closedAt);
  const span = Math.max(0, last - first - windowDays * 86_400_000);
  let random = seed >>> 0;
  const nextRandom = () =>
    (random = (random * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000;
  return Array.from({ length: attempts }, (_, index) => {
    let start: number;
    if (mode === "SEEDED_RANDOM")
      start = first + Math.floor(nextRandom() * (span + 1));
    else if (mode === "MONTHLY_STARTS") {
      const date = new Date(first);
      date.setUTCMonth(date.getUTCMonth() + index, 1);
      date.setUTCHours(0, 0, 0, 0);
      start = date.getTime();
    } else if (mode === "QUARTERLY_STARTS") {
      const date = new Date(first);
      date.setUTCMonth(date.getUTCMonth() + index * 3, 1);
      date.setUTCHours(0, 0, 0, 0);
      start = date.getTime();
    } else
      start =
        first +
        (attempts === 1 ? 0 : Math.floor((span * index) / (attempts - 1)));
    const end = start + windowDays * 86_400_000;
    return {
      id: `${mode}:${seed}:${index}:${start}`,
      from: new Date(start).toISOString(),
      to: new Date(end).toISOString(),
      trades: ordered.filter(
        (trade) =>
          Date.parse(trade.closedAt) >= start &&
          Date.parse(trade.closedAt) < end,
      ),
    };
  });
}

export function simulateFullChallengeWindows(
  profile: PropProgramProfile,
  config: PropAccountConfiguration,
  windows: readonly ChallengeWindow[],
  runHash: string,
) {
  const results = windows.map((window) => ({
    window,
    result: simulateFullChallenge(profile, config, window.trades),
  }));
  const passes = results.filter((item) => item.result.status === "FUNDED");
  const failures = results.filter((item) => item.result.status === "FAILED");
  const dayCounts = passes
    .map(
      ({ result }) =>
        result.phase1.tradingDays + (result.verification?.tradingDays ?? 0),
    )
    .sort((a, b) => a - b);
  return {
    attemptCount: results.length,
    passCount: passes.length,
    failCount: failures.length,
    incompleteCount: results.length - passes.length - failures.length,
    historicalPassRate: results.length
      ? (passes.length / results.length) * 100
      : 0,
    medianDays: dayCounts.length
      ? dayCounts[Math.floor(dayCounts.length / 2)]
      : null,
    averageDays: dayCounts.length
      ? dayCounts.reduce((sum, days) => sum + days, 0) / dayCounts.length
      : null,
    dailyLossFailures: results.filter(
      ({ result }) =>
        result.phase1.state === "FAILED_DAILY_LOSS" ||
        result.verification?.state === "FAILED_DAILY_LOSS",
    ).length,
    maxLossFailures: results.filter(
      ({ result }) =>
        result.phase1.state === "FAILED_MAX_LOSS" ||
        result.verification?.state === "FAILED_MAX_LOSS",
    ).length,
    targetFailures: results.filter(
      ({ result }) => result.status === "INCOMPLETE",
    ).length,
    worstDrawdown: Math.max(
      0,
      ...results.flatMap(({ result }) => [
        result.phase1.maxDrawdownPct,
        result.verification?.maxDrawdownPct ?? 0,
      ]),
    ),
    windows: results.map(({ window, result }) => ({
      id: window.id,
      from: window.from,
      to: window.to,
      status: result.status,
    })),
    runHash,
    results,
  };
}

export interface SimulatedPayoutEvent {
  state: string;
  timestamp: string;
  simulated: true;
  amount?: number;
}

export function simulatePayoutCycle(
  config: PropAccountConfiguration,
  profile: PropProgramProfile,
  snapshots: readonly PropAccountSnapshot[],
) {
  const events: SimulatedPayoutEvent[] = [];
  let cycles = 0;
  let modeledRewards = 0;
  for (const snapshot of [...snapshots].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  )) {
    const evaluation = evaluateFunded(config, snapshot, profile);
    events.push({
      state: evaluation.state,
      timestamp: snapshot.timestamp,
      simulated: true,
    });
    if (evaluation.flat && snapshot.closedPnl > 0) {
      const eligibility = evaluatePayout(
        config,
        snapshot,
        profile,
        snapshot.timestamp,
      );
      if (eligibility.status === "WAITING")
        events.push({
          state: "WAITING_FOR_PAYOUT",
          timestamp: snapshot.timestamp,
          simulated: true,
        });
      if (eligibility.status === "READY_TO_REQUEST") {
        const payout = calculatePayout(
          snapshot.closedPnl,
          profile.payout.profitSplitPct ?? 0,
          "WITHDRAW_RECOMMENDED",
          0,
          (config.accountSize * config.retainedBufferPct) / 100,
        );
        events.push({
          state: "PAYOUT_READY",
          timestamp: snapshot.timestamp,
          simulated: true,
        });
        events.push({
          state: "SIMULATED_PAYOUT_REQUEST",
          timestamp: snapshot.timestamp,
          simulated: true,
          amount: payout.requestedReward,
        });
        events.push({
          state: "SIMULATED_PAYOUT_CONFIRMED",
          timestamp: snapshot.timestamp,
          simulated: true,
          amount: payout.requestedReward,
        });
        events.push({
          state: "NEXT_CYCLE_READY",
          timestamp: snapshot.timestamp,
          simulated: true,
        });
        events.push({
          state: "NORMAL_TRADING",
          timestamp: snapshot.timestamp,
          simulated: true,
        });
        modeledRewards += payout.requestedReward;
        cycles += 1;
      }
    }
  }
  return { events, cycles, modeledRewards };
}

export function realPropActivationBlockers(
  config: PropAccountConfiguration,
  profile: PropProgramProfile,
  connectedTruthAvailable: boolean,
): string[] {
  const blockers: string[] = [];
  if (!config.realPropActivationConfirmed)
    blockers.push("OPERATOR_CONFIRMATION");
  if (profile.verificationStatus !== "VERIFIED")
    blockers.push("PROFILE_STATUS");
  if (profile.payout.waitingDays === null) blockers.push("PAYOUT_WAITING_DAYS");
  if (profile.payout.frequency === "PENDING_VERIFICATION")
    blockers.push("PAYOUT_FREQUENCY");
  if (profile.automation.ea === "EA_UNKNOWN") blockers.push("EA_ELIGIBILITY");
  if (profile.automation.vps === "VPS_UNKNOWN")
    blockers.push("VPS_ELIGIBILITY");
  if (!config.platform || !profile.supportedPlatforms.includes(config.platform))
    blockers.push("PLATFORM_SUPPORT");
  if (!connectedTruthAvailable) blockers.push("CONNECTED_ACCOUNT_TRUTH");
  return blockers;
}

export interface PropExecutionGateInput {
  config: PropAccountConfiguration;
  profile: PropProgramProfile;
  snapshot: PropAccountSnapshot;
  requestedRisk: number;
  requestedSize: number;
}

export function evaluatePropExecutionGate(input: PropExecutionGateInput) {
  const evaluation = evaluateFunded(
    input.config,
    input.snapshot,
    input.profile,
  );
  return {
    decision: evaluation.entryDecision,
    riskMultiplier: evaluation.riskMultiplier,
    maximumAllowedRisk: input.requestedRisk * evaluation.riskMultiplier,
    maximumAllowedSizeIntent: input.requestedSize * evaluation.riskMultiplier,
    managementEnabled: evaluation.manageExisting,
    protectionEnabled: true,
    reconciliationEnabled: true,
    reasonCodes: evaluation.reasonCodes,
    profileVersion: input.profile.profileVersion,
  };
}
