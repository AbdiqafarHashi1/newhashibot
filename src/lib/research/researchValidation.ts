import type { CanonicalCompletedTradeResult } from "../../../supabase/functions/_shared/trading-domain/contracts.ts";

export type VerificationLevel =
  | "HISTORICAL"
  | "OOS"
  | "WALK_FORWARD"
  | "STRESS"
  | "MONTE_CARLO"
  | "PROP_SIMULATION"
  | "MT5_FORWARD"
  | "REAL_PROP";
export interface ResearchRunContract {
  runId: string;
  runHash: string;
  strategyId: string;
  strategyVersion: string;
  configurationVersion: string;
  symbols: readonly string[];
  timeframes: readonly string[];
  datasetIds: readonly string[];
  dateRange: { from: string; to: string };
  trainingRange: { from: string; to: string } | null;
  validationRange: { from: string; to: string } | null;
  executionModel: {
    version: string;
    provenance:
      | "BROKER_DATA"
      | "HISTORICAL_ESTIMATE"
      | "FIXED_ASSUMPTION"
      | "STRESSED_ASSUMPTION";
    spread: number;
    slippage: number;
    commission: number;
    swap: number;
  };
  riskPolicyVersion: string;
  capitalPolicyVersion: string;
  tradeManagementPolicyVersion: string;
  initialBalance: number;
  currency: string;
  createdAt: string;
  status: "COMPLETED" | "INVALID";
  verificationLevel: VerificationLevel;
  trades: readonly CanonicalCompletedTradeResult[];
  seed: number;
}
export interface ResearchMetrics {
  trades: number;
  grossPnl: number | null;
  costs: number;
  netPnl: number | null;
  grossR: number;
  netR: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  lossRate: number;
  breakevenRate: number;
  profitFactor: number | null;
  expectancyR: number;
  averageWinnerR: number | null;
  averageLoserR: number | null;
  payoffRatio: number | null;
  maxDrawdownR: number;
  maxDrawdownPct: number | null;
  averageDrawdownR: number;
  recoveryFactor: number | null;
  sharpeLike: number | null;
  sortinoLike: number | null;
  bestTradeR: number | null;
  worstTradeR: number | null;
  winningStreak: number;
  losingStreak: number;
  averageHoldingHours: number;
  ambiguityCount: number;
  monthly: Readonly<Record<string, number>>;
  weekly: Readonly<Record<string, number>>;
  rDistribution: readonly number[];
  sampleWarnings: readonly string[];
}
const round = (n: number) => Math.round(n * 1e8) / 1e8;
export function metrics(
  trades: readonly CanonicalCompletedTradeResult[],
  initialBalance?: number,
): ResearchMetrics {
  const ordered = [...trades].sort((a, b) =>
      a.closedAt.localeCompare(b.closedAt),
    ),
    rs = ordered.map((t) => t.netR),
    gross = ordered.map((t) => t.grossR),
    pnls = ordered.map((t) => t.netPnl),
    grossPnls = ordered.map((t) => t.grossPnl),
    wins = rs.filter((v) => v > 0),
    losses = rs.filter((v) => v < 0),
    breakeven = rs.filter((v) => v === 0).length;
  let equity = 0,
    peak = 0,
    maxDd = 0,
    ddSum = 0,
    wStreak = 0,
    lStreak = 0,
    maxW = 0,
    maxL = 0;
  for (const r of rs) {
    equity += r;
    peak = Math.max(peak, equity);
    const dd = peak - equity;
    maxDd = Math.max(maxDd, dd);
    ddSum += dd;
    if (r > 0) {
      wStreak++;
      lStreak = 0;
    } else if (r < 0) {
      lStreak++;
      wStreak = 0;
    } else {
      wStreak = 0;
      lStreak = 0;
    }
    maxW = Math.max(maxW, wStreak);
    maxL = Math.max(maxL, lStreak);
  }
  const mean = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
    variance =
      rs.length > 1
        ? rs.reduce((s, r) => s + (r - mean) ** 2, 0) / (rs.length - 1)
        : 0,
    downside = rs.filter((r) => r < 0),
    downVar = downside.length
      ? downside.reduce((s, r) => s + r * r, 0) / downside.length
      : 0,
    gain = wins.reduce((a, b) => a + b, 0),
    pain = Math.abs(losses.reduce((a, b) => a + b, 0)),
    monthly: Record<string, number> = {},
    weekly: Record<string, number> = {};
  for (const t of ordered) {
    const d = new Date(t.closedAt),
      m = t.closedAt.slice(0, 7),
      jan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)),
      week = `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - jan.getTime()) / 86400000 + jan.getUTCDay() + 1) / 7)).padStart(2, "0")}`;
    monthly[m] = (monthly[m] ?? 0) + t.netR;
    weekly[week] = (weekly[week] ?? 0) + t.netR;
  }
  const hasPnl = pnls.every((v) => v !== null),
    hasGross = grossPnls.every((v) => v !== null),
    netPnl = hasPnl
      ? round((pnls as number[]).reduce((a, b) => a + b, 0))
      : null,
    grossPnl = hasGross
      ? round((grossPnls as number[]).reduce((a, b) => a + b, 0))
      : null;
  return {
    trades: ordered.length,
    grossPnl,
    costs: round(
      ordered.reduce(
        (sum, t) =>
          sum +
          t.costs.spread +
          t.costs.slippage +
          t.costs.commission +
          t.costs.financing,
        0,
      ),
    ),
    netPnl,
    grossR: round(gross.reduce((a, b) => a + b, 0)),
    netR: round(rs.reduce((a, b) => a + b, 0)),
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate: ordered.length ? (wins.length / ordered.length) * 100 : 0,
    lossRate: ordered.length ? (losses.length / ordered.length) * 100 : 0,
    breakevenRate: ordered.length ? (breakeven / ordered.length) * 100 : 0,
    profitFactor: pain ? gain / pain : gain ? null : 0,
    expectancyR: mean,
    averageWinnerR: wins.length ? gain / wins.length : null,
    averageLoserR: losses.length
      ? losses.reduce((a, b) => a + b, 0) / losses.length
      : null,
    payoffRatio:
      wins.length && losses.length
        ? gain /
          wins.length /
          Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length)
        : null,
    maxDrawdownR: maxDd,
    maxDrawdownPct:
      initialBalance && hasPnl
        ? ((maxDd *
            Math.abs((netPnl ?? 0) / (rs.reduce((a, b) => a + b, 0) || 1))) /
            initialBalance) *
          100
        : null,
    averageDrawdownR: ordered.length ? ddSum / ordered.length : 0,
    recoveryFactor: maxDd ? rs.reduce((a, b) => a + b, 0) / maxDd : null,
    sharpeLike: variance > 0 ? mean / Math.sqrt(variance) : null,
    sortinoLike: downVar > 0 ? mean / Math.sqrt(downVar) : null,
    bestTradeR: rs.length ? Math.max(...rs) : null,
    worstTradeR: rs.length ? Math.min(...rs) : null,
    winningStreak: maxW,
    losingStreak: maxL,
    averageHoldingHours: ordered.length
      ? ordered.reduce(
          (s, t) =>
            s + (Date.parse(t.closedAt) - Date.parse(t.openedAt)) / 3600000,
          0,
        ) / ordered.length
      : 0,
    ambiguityCount: ordered.reduce((s, t) => s + t.ambiguity.ambiguousBars, 0),
    monthly,
    weekly,
    rDistribution: rs,
    sampleWarnings: [
      ...(ordered.length < 30 ? ["LOW_TOTAL_TRADE_SAMPLE"] : []),
      ...(Object.keys(monthly).length < 6 ? ["LOW_MONTH_SAMPLE"] : []),
    ],
  };
}
export function validateResearchRun(run: ResearchRunContract) {
  const reasons: string[] = [];
  if (!run.trades.length) reasons.push("NO_CANONICAL_TRADES");
  if (
    run.trades.some(
      (t) => !Number.isFinite(t.netR) || !Number.isFinite(t.grossR),
    )
  )
    reasons.push("NON_FINITE_RESULT");
  if (run.trades.some((t) => Date.parse(t.closedAt) < Date.parse(t.openedAt)))
    reasons.push("INVALID_TRADE_TIME");
  if (new Set(run.trades.map((t) => t.tradeId)).size !== run.trades.length)
    reasons.push("DUPLICATE_TRADE_ID");
  if (run.trades.some((t, i, a) => i > 0 && t.closedAt < a[i - 1].closedAt))
    reasons.push("OUT_OF_ORDER");
  const datasets = new Set(run.datasetIds);
  if (run.trades.some((t) => t.datasetIds.some((id) => !datasets.has(id))))
    reasons.push("DATASET_PROVENANCE_MISMATCH");
  return {
    status: reasons.some((r) => r !== "OUT_OF_ORDER")
      ? ("FAIL" as const)
      : reasons.length
        ? ("WARNING" as const)
        : ("PASS" as const),
    reasons,
  };
}
export function splitOos(run: ResearchRunContract, trainingPct: number) {
  if (!(trainingPct > 0 && trainingPct < 100))
    throw new Error("INVALID_OOS_SPLIT");
  const ordered = [...run.trades].sort((a, b) =>
      a.closedAt.localeCompare(b.closedAt),
    ),
    index = Math.max(
      1,
      Math.min(
        ordered.length - 1,
        Math.floor((ordered.length * trainingPct) / 100),
      ),
    ),
    training = ordered.slice(0, index),
    validation = ordered.slice(index),
    isMetrics = metrics(training, run.initialBalance),
    oosMetrics = metrics(validation, run.initialBalance);
  return {
    trainingRange: {
      from: training[0]?.openedAt ?? "",
      to: training.at(-1)?.closedAt ?? "",
    },
    validationRange: {
      from: validation[0]?.openedAt ?? "",
      to: validation.at(-1)?.closedAt ?? "",
    },
    inSample: isMetrics,
    outOfSample: oosMetrics,
    deterioration: {
      profitFactorDecay:
        isMetrics.profitFactor && oosMetrics.profitFactor !== null
          ? 1 - oosMetrics.profitFactor / isMetrics.profitFactor
          : null,
      expectancyDecay: isMetrics.expectancyR
        ? 1 - oosMetrics.expectancyR / isMetrics.expectancyR
        : null,
      returnDecay: isMetrics.netR ? 1 - oosMetrics.netR / isMetrics.netR : null,
      drawdownExpansion: isMetrics.maxDrawdownR
        ? oosMetrics.maxDrawdownR / isMetrics.maxDrawdownR - 1
        : null,
      tradeFrequencyChange: isMetrics.trades
        ? oosMetrics.trades / isMetrics.trades - 1
        : null,
    },
  };
}
export function walkForward(
  run: ResearchRunContract,
  trainDays: number,
  testDays: number,
  stepDays: number,
) {
  if (![trainDays, testDays, stepDays].every((days) => Number.isFinite(days) && days > 0))
    throw new Error("INVALID_WALK_FORWARD_WINDOW");
  const ordered = [...run.trades].sort((a, b) =>
    a.closedAt.localeCompare(b.closedAt),
  );
  if (!ordered.length)
    return {
      windows: [],
      aggregateOos: metrics([]),
      profitableWindows: 0,
      losingWindows: 0,
      consistency: 0,
    };
  const first = Date.parse(run.dateRange.from),
    last = Date.parse(run.dateRange.to),
    windows = [];
  for (
    let start = first;
    start + trainDays * 86400000 < last;
    start += stepDays * 86400000
  ) {
    const trainEnd = start + trainDays * 86400000,
      testEnd = trainEnd + testDays * 86400000;
    if (testEnd > last) break;
    const training = ordered.filter(
        (t) =>
          Date.parse(t.closedAt) >= start && Date.parse(t.closedAt) < trainEnd,
      ),
      test = ordered.filter(
        (t) =>
          Date.parse(t.closedAt) >= trainEnd &&
          Date.parse(t.closedAt) < testEnd,
      );
    windows.push({
      trainingStart: new Date(start).toISOString(),
      trainingEnd: new Date(trainEnd).toISOString(),
      testStart: new Date(trainEnd).toISOString(),
      testEnd: new Date(testEnd).toISOString(),
      configurationVersion: run.configurationVersion,
      training: metrics(training, run.initialBalance),
      test: metrics(test, run.initialBalance),
      testTrades: test,
      pass: metrics(test).netR > 0,
    });
  }
  const oos = windows.flatMap((w) => w.testTrades),
    positive = windows.filter((w) => w.pass).length;
  return {
    windows,
    aggregateOos: metrics(oos, run.initialBalance),
    profitableWindows: positive,
    losingWindows: windows.length - positive,
    consistency: windows.length ? (positive / windows.length) * 100 : 0,
  };
}
export type StressScenario =
  | "BASELINE"
  | "SPREAD_1_25X"
  | "SPREAD_1_5X"
  | "SPREAD_2X"
  | "SLIPPAGE_LOW"
  | "SLIPPAGE_MEDIUM"
  | "SLIPPAGE_HIGH"
  | "COMMISSION_HIGHER"
  | "MISSED_TRADE_RATE"
  | "COMBINED_STRESS";
const stressMult: Record<
  StressScenario,
  { spread: number; slippage: number; commission: number; miss: number }
> = {
  BASELINE: { spread: 1, slippage: 1, commission: 1, miss: 0 },
  SPREAD_1_25X: { spread: 1.25, slippage: 1, commission: 1, miss: 0 },
  SPREAD_1_5X: { spread: 1.5, slippage: 1, commission: 1, miss: 0 },
  SPREAD_2X: { spread: 2, slippage: 1, commission: 1, miss: 0 },
  SLIPPAGE_LOW: { spread: 1, slippage: 1.25, commission: 1, miss: 0 },
  SLIPPAGE_MEDIUM: { spread: 1, slippage: 1.5, commission: 1, miss: 0 },
  SLIPPAGE_HIGH: { spread: 1, slippage: 2, commission: 1, miss: 0 },
  COMMISSION_HIGHER: { spread: 1, slippage: 1, commission: 1.5, miss: 0 },
  MISSED_TRADE_RATE: { spread: 1, slippage: 1, commission: 1, miss: 0.1 },
  COMBINED_STRESS: { spread: 2, slippage: 2, commission: 1.5, miss: 0.1 },
};
export function stress(run: ResearchRunContract, scenario: StressScenario) {
  const s = stressMult[scenario],
    trades = run.trades
      .filter(
        (_, i) => !(s.miss && ((i * 2654435761) >>> 0) % 1000 < s.miss * 1000),
      )
      .map((t) => {
        const base =
            t.costs.spread +
            t.costs.slippage +
            t.costs.commission +
            t.costs.financing,
          next =
            t.costs.spread * s.spread +
            t.costs.slippage * s.slippage +
            t.costs.commission * s.commission +
            t.costs.financing,
          extra = next - base,
          risk =
            t.grossPnl !== null && t.grossR
              ? Math.abs(t.grossPnl / t.grossR)
              : null;
        return {
          ...t,
          costs: {
            ...t.costs,
            version: `${t.costs.version}:${scenario}`,
            spread: t.costs.spread * s.spread,
            slippage: t.costs.slippage * s.slippage,
            commission: t.costs.commission * s.commission,
          },
          netPnl: t.netPnl === null ? null : t.netPnl - extra,
          netR: risk ? round(t.netR - extra / risk) : t.netR,
        };
      });
  return {
    scenario,
    provenance:
      scenario === "BASELINE"
        ? ("HISTORICAL_ESTIMATE" as const)
        : ("STRESSED_ASSUMPTION" as const),
    metrics: metrics(trades, run.initialBalance),
  };
}
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    at = (sorted.length - 1) * p,
    lo = Math.floor(at),
    hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}
export function monteCarlo(
  run: ResearchRunContract,
  count: number,
  seed: number,
  method: "TRADE_ORDER_PERMUTATION" | "BOOTSTRAP_WITH_REPLACEMENT",
  breachR: number,
) {
  let state = seed >>> 0;
  const random = () =>
      (state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000,
    base = [...run.trades],
    results: {
      endingR: number;
      endingPnl: number | null;
      maxDrawdownR: number;
      maxLosingStreak: number;
      breached: boolean;
    }[] = [];
  for (let n = 0; n < count; n++) {
    const sample =
      method === "BOOTSTRAP_WITH_REPLACEMENT"
        ? Array.from(
            { length: base.length },
            () => base[Math.floor(random() * base.length)],
          )
        : (() => {
            const x = [...base];
            for (let i = x.length - 1; i > 0; i--) {
              const j = Math.floor(random() * (i + 1));
              [x[i], x[j]] = [x[j], x[i]];
            }
            return x;
          })();
    const m = metrics(sample, run.initialBalance);
    results.push({
      endingR: m.netR,
      endingPnl: m.netPnl,
      maxDrawdownR: m.maxDrawdownR,
      maxLosingStreak: m.losingStreak,
      breached: m.maxDrawdownR >= breachR,
    });
  }
  const fields = (
    key: "endingR" | "endingPnl" | "maxDrawdownR" | "maxLosingStreak",
  ) =>
    Object.fromEntries(
      [
        [5, 0.05],
        [25, 0.25],
        [50, 0.5],
        [75, 0.75],
        [95, 0.95],
      ].map(([label, p]) => [
        `p${label}`,
        percentile(
          results.map((r) => r[key] ?? 0),
          p,
        ),
      ]),
    );
  return {
    label: "EMPIRICAL_MONTE_CARLO_FREQUENCY",
    method,
    count,
    seed,
    endingR: fields("endingR"),
    endingPnl: fields("endingPnl"),
    maxDrawdownR: fields("maxDrawdownR"),
    maxLosingStreak: fields("maxLosingStreak"),
    breachFrequency: count
      ? results.filter((r) => r.breached).length / count
      : 0,
    worst: [...results].sort((a, b) => a.endingR - b.endingR)[0] ?? null,
    best: [...results].sort((a, b) => b.endingR - a.endingR)[0] ?? null,
    results,
  };
}
export function groupedAnalysis(run: ResearchRunContract) {
  const group = (fn: (t: CanonicalCompletedTradeResult) => string) =>
    Object.fromEntries(
      [...groupBy(run.trades, fn)].map(([k, v]) => [
        k,
        metrics(v, run.initialBalance),
      ]),
    );
  return {
    direction: group((t) => (t.fill.price >= t.stop ? "LONG" : "SHORT")),
    session: group((t) => {
      const h = new Date(t.openedAt).getUTCHours();
      return h < 7
        ? "ASIA"
        : h < 12
          ? "LONDON"
          : h < 16
            ? "LONDON_NY_OVERLAP"
            : h < 21
              ? "NEW_YORK"
              : "OTHER";
    }),
    month: group((t) => t.closedAt.slice(0, 7)),
    quarter: group((t) => {
      const d = new Date(t.closedAt);
      return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    }),
    year: group((t) => t.closedAt.slice(0, 4)),
    regime: group((t) => {
      const r = Math.abs(t.grossR);
      return r >= 2
        ? "HIGH_VOLATILITY"
        : r < 0.5
          ? "LOW_VOLATILITY"
          : t.closeReason === "TARGET"
            ? "TRENDING"
            : "RANGING";
    }),
  };
}
export function parameterRobustness(
  reference: ResearchRunContract,
  variants: readonly ResearchRunContract[],
) {
  const rows = [
    reference,
    ...variants.filter((run) => run.runId !== reference.runId),
  ].map((run) => ({
    runId: run.runId,
    configurationVersion: run.configurationVersion,
    runHash: run.runHash,
    metrics: metrics(run.trades, run.initialBalance),
  }));
  const positive = rows.filter(
    (row) =>
      row.metrics.expectancyR > 0 && (row.metrics.profitFactor ?? 0) >= 1,
  ).length;
  const ratio = rows.length ? positive / rows.length : 0;
  return {
    referenceRunId: reference.runId,
    rows,
    classification:
      ratio >= 0.8
        ? ("ROBUST" as const)
        : ratio >= 0.5
          ? ("SENSITIVE" as const)
          : ("FRAGILE" as const),
    note: "Comparison only; reference configuration is never modified.",
  };
}
export interface PortfolioPolicy {
  initialBalance: number;
  maxConcurrentPositions: number;
  maxOpenRiskR: number;
  oneActivePerSymbol: boolean;
}
export function portfolio(
  runs: readonly ResearchRunContract[],
  policy: PortfolioPolicy,
) {
  const candidates = runs
      .flatMap((run) => run.trades.map((trade) => ({ run, trade })))
      .sort(
        (a, b) =>
          a.trade.openedAt.localeCompare(b.trade.openedAt) ||
          a.trade.tradeId.localeCompare(b.trade.tradeId),
      ),
    accepted: CanonicalCompletedTradeResult[] = [],
    rejected: { tradeId: string; reason: string }[] = [];
  for (const item of candidates) {
    const active = accepted.filter((t) => t.closedAt > item.trade.openedAt);
    if (
      policy.oneActivePerSymbol &&
      active.some((t) => t.symbol === item.trade.symbol)
    ) {
      rejected.push({
        tradeId: item.trade.tradeId,
        reason: "SYMBOL_ALREADY_ACTIVE",
      });
      continue;
    }
    if (active.length >= policy.maxConcurrentPositions) {
      rejected.push({
        tradeId: item.trade.tradeId,
        reason: "PORTFOLIO_RISK_LIMIT",
      });
      continue;
    }
    if (active.length + 1 > policy.maxOpenRiskR) {
      rejected.push({
        tradeId: item.trade.tradeId,
        reason: "CAPITAL_UNAVAILABLE",
      });
      continue;
    }
    accepted.push(item.trade);
  }
  return {
    trades: accepted,
    rejected,
    metrics: metrics(accepted, policy.initialBalance),
    perSymbol: Object.fromEntries(
      [...groupBy(accepted, (t) => t.symbol)].map(([k, v]) => [
        k,
        metrics(v, policy.initialBalance),
      ]),
    ),
    perStrategy: Object.fromEntries(
      [...groupBy(accepted, (t) => t.strategyId)].map(([k, v]) => [
        k,
        metrics(v, policy.initialBalance),
      ]),
    ),
    peakConcurrent: Math.max(
      0,
      ...accepted.map(
        (t) =>
          accepted.filter(
            (x) => x.openedAt <= t.openedAt && x.closedAt > t.openedAt,
          ).length,
      ),
    ),
  };
}
export interface CertificationPolicy {
  minimumTrades: number;
  minimumOOSTrades: number;
  minimumPF: number;
  minimumExpectancyR: number;
  maximumDrawdownR: number;
  minimumWalkForwardConsistency: number;
  maximumOOSDegradation: number;
  stressMinimumPF: number;
  monteCarloMaxDdP95: number;
}
export function certify(input: {
  run: ResearchRunContract;
  oos: ReturnType<typeof splitOos>;
  walk: ReturnType<typeof walkForward>;
  stresses: readonly ReturnType<typeof stress>[];
  monte: ReturnType<typeof monteCarlo>;
  policy: CertificationPolicy;
}) {
  const reasons: string[] = [];
  const base = metrics(input.run.trades, input.run.initialBalance),
    p = input.policy;
  if (base.trades < p.minimumTrades) reasons.push("LOW_SAMPLE");
  if (input.oos.outOfSample.trades < p.minimumOOSTrades)
    reasons.push("LOW_OOS_SAMPLE");
  if (
    (input.oos.outOfSample.profitFactor ?? 0) < p.minimumPF ||
    input.oos.outOfSample.expectancyR < p.minimumExpectancyR
  )
    reasons.push("WEAK_OOS");
  if (base.maxDrawdownR > p.maximumDrawdownR) reasons.push("HIGH_DRAWDOWN");
  if (input.walk.consistency < p.minimumWalkForwardConsistency)
    reasons.push("WEAK_WALK_FORWARD");
  if ((input.oos.deterioration.expectancyDecay ?? 0) > p.maximumOOSDegradation)
    reasons.push("OVERFIT_RISK");
  if (
    input.stresses.some(
      (s) => (s.metrics.profitFactor ?? 0) < p.stressMinimumPF,
    )
  )
    reasons.push("COST_SENSITIVE");
  if (Number(input.monte.maxDrawdownR.p95 ?? Infinity) > p.monteCarloMaxDdP95)
    reasons.push("MONTE_CARLO_DRAWDOWN");
  return {
    status: reasons.length
      ? base.trades < p.minimumTrades
        ? ("INSUFFICIENT_DATA" as const)
        : ("RESEARCH_ONLY" as const)
      : ("FORWARD_VALIDATION_CANDIDATE" as const),
    recommendation: reasons.length
      ? base.trades < p.minimumTrades
        ? ("INSUFFICIENT_DATA" as const)
        : ("KEEP_IN_RESEARCH" as const)
      : ("PROMOTE_TO_FORWARD_TEST" as const),
    reasonCodes: reasons.length
      ? reasons
      : [
          "STRONG_OOS",
          "WALK_FORWARD_CONSISTENT",
          "STRESS_POLICY_PASSED",
          "MONTE_CARLO_POLICY_PASSED",
        ],
    policyLabel: "RESEARCH POLICY — NOT GUARANTEE",
  };
}
export function freezeForwardCandidate(
  run: ResearchRunContract,
  parameters: Readonly<Record<string, number>>,
  prop: { profileId: string; accountSize: number; safetyPolicyVersion: string },
  approvedAt: string,
) {
  const frozen = structuredClone({
    version: "forward-validation-config/v1",
    strategyId: run.strategyId,
    strategyVersion: run.strategyVersion,
    configurationVersion: run.configurationVersion,
    parameters,
    symbols: run.symbols,
    timeframes: run.timeframes,
    riskPolicyVersion: run.riskPolicyVersion,
    capitalPolicyVersion: run.capitalPolicyVersion,
    executionModel: run.executionModel,
    prop,
    dateApproved: approvedAt,
    researchRunIds: [run.runId],
    researchRunHashes: [run.runHash],
  });
  return deepFreeze(frozen);
}
function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>))
      deepFreeze(nested);
  }
  return value;
}

function groupBy<T>(
  items: readonly T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  return groups;
}
