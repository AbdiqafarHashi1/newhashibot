import { aggregateCandles } from "../historicalData/aggregation";
import type {
  CanonicalCandle,
  HistoricalDataQualityReport,
  HistoricalTimeframe,
} from "../historicalData/types";
import {
  allocateCapitalIntent,
  arbitrateCanonical,
  buildCanonicalMarketView,
  calculateRiskIntent,
  runCanonicalReplay,
  strategyById,
  type AccountRiskSnapshot,
  type Candidate,
  type CanonicalCompletedTradeResult,
  type DomainCandle,
  type DomainTimeframe,
  type ExecutionCosts,
  type PriceObservation,
  type RiskPolicySnapshot,
  type TradePlan,
  type StrategyDefinition,
} from "../../../supabase/functions/_shared/trading-domain/index.ts";

const WIDTH: Record<DomainTimeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export interface PipelineDataset {
  datasetId: string;
  symbol: string;
  timeframe: HistoricalTimeframe;
  provider: "MT5_BRIDGE" | "BINANCE" | "BYBIT" | "COINBASE" | "CSV" | "PUBLIC_RESEARCH" | "HISTDATA" | "TWELVE_DATA";
  bars: readonly CanonicalCandle[];
  quality?: HistoricalDataQualityReport;
}

export interface ResearchExecutionModel {
  version: string;
  currency: string;
  provenance: "BROKER_DATA" | "HISTORICAL_ESTIMATE" | "FIXED_ASSUMPTION" | "STRESSED_ASSUMPTION";
  forex?: { spreadCost: number; commissionPerTrade: number; slippageCost: number; swapPerTrade?: number };
  crypto?: {
    liquidity: "MAKER" | "TAKER";
    makerFeeRate: number;
    takerFeeRate: number;
    slippageRate: number;
    quantityStep: number;
    minimumQuantity: number;
    fundingPerTrade?: number;
  };
}

export interface CandidatePipelinePolicy {
  minimumScore: number;
  oneActivePerSymbol: boolean;
  maximumConcurrentPositions: number;
  maximumTotalOpenRisk: number;
  maximumPortfolioExposure: number;
  perSymbolExposure: Readonly<Record<string, number>>;
  perStrategyExposure: Readonly<Record<string, number>>;
  maxAllocationPerTrade: number;
}

export interface PipelineEntryOverlay {
  decision: "ALLOW" | "REDUCE" | "BLOCK";
  riskMultiplier: number;
  reasonCodes: readonly string[];
  state: string;
}

export interface CandidatePipelineInput {
  datasets: readonly PipelineDataset[];
  strategyIds: readonly string[];
  configurationVersion: string;
  parameters?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  initialAccount: AccountRiskSnapshot;
  riskPolicy: RiskPolicySnapshot;
  portfolioPolicy: CandidatePipelinePolicy;
  executionModel: ResearchExecutionModel;
  runReference: string;
  /** Test/research dependency injection; production certification omits this. */
  strategyDefinitions?: readonly StrategyDefinition[];
  entryOverlay?: (context: {
    timestamp: string;
    candidate: Candidate;
    account: AccountRiskSnapshot;
  }) => PipelineEntryOverlay;
  onTradeAccepted?: (candidate: Candidate, account: AccountRiskSnapshot) => void;
  onTradeClosed?: (result: CanonicalCompletedTradeResult, account: AccountRiskSnapshot) => void;
}

export interface DecisionTimeRegimeEvidence {
  version: "decision-regime/v1";
  timestamp: string;
  symbol: string;
  sourceTimeframe: DomainTimeframe;
  lookback: number;
  inputs: { returnPct: number; averageRangePct: number; recentRangePct: number };
  classification: "TRENDING" | "RANGING" | "HIGH_VOLATILITY" | "LOW_VOLATILITY";
  lastInputOpenTime: string;
}

export interface AcceptedPipelineTrade {
  candidate: Candidate;
  plan: TradePlan;
  result: CanonicalCompletedTradeResult;
  observations: readonly PriceObservation[];
  acceptedAt: string;
  closedAt: string;
  accountBefore: AccountRiskSnapshot;
  overlay: PipelineEntryOverlay;
  regime: DecisionTimeRegimeEvidence;
}

export interface CandidatePipelineResult {
  version: "candidate-pipeline-replay/v1";
  trades: readonly CanonicalCompletedTradeResult[];
  accepted: readonly AcceptedPipelineTrade[];
  /** Complete decision-time ledger; arbitration truth remains owned by arbitrateCanonical. */
  candidates: readonly { timestamp:string; candidate:Candidate; status:"SELECTED"|"ARBITRATION_REJECTED"|"POLICY_REJECTED"; authority:string; reasonCodes:readonly string[] }[];
  observations: number;
  rejected: readonly { timestamp: string; candidateId: string; strategyId: string; symbol: string; reasonCodes: readonly string[] }[];
  regimes: readonly DecisionTimeRegimeEvidence[];
  metrics: {
    grossR: number;
    netR: number;
    grossPnl: number;
    netPnl: number;
    profitFactor: number | null;
    expectancyR: number;
    maxDrawdown: number;
    peakOpenRisk: number;
    maximumConcurrency: number;
    symbolContribution: Readonly<Record<string, number>>;
    strategyContribution: Readonly<Record<string, number>>;
    monthly: Readonly<Record<string, number>>;
  };
  exposureTimeline: readonly { timestamp: string; openRisk: number; concurrency: number; exposedSymbols: readonly string[] }[];
  capitalTimeline: readonly { timestamp: string; balance: number; equity: number; availableCapital: number }[];
  dataQuality: readonly { datasetId: string; status: "PASS" | "WARNING" | "FAIL" | "QUALITY_EVIDENCE_UNAVAILABLE"; quality?: HistoricalDataQualityReport }[];
  runHash: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
}
function hash(value: unknown) {
  let h = 2166136261;
  for (const c of stable(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return `pipeline_${(h >>> 0).toString(16).padStart(8, "0")}`;
}
function domainRows(dataset: PipelineDataset): DomainCandle[] {
  return dataset.bars.map((b) => ({
    datasetId: dataset.datasetId,
    symbol: dataset.symbol,
    timeframe: dataset.timeframe,
    openTime: new Date(b.timestamp).toISOString(),
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? b.tickVolume ?? 0,
  }));
}
function datasetsFor(input: CandidatePipelineInput, symbol: string, required: readonly DomainTimeframe[]) {
  const source = input.datasets.filter((d) => d.symbol === symbol);
  const result: Partial<Record<DomainTimeframe, readonly DomainCandle[]>> = {};
  for (const tf of required) {
    const native = source.find((d) => d.timeframe === tf);
    if (native) { result[tf] = domainRows(native); continue; }
    const base = [...source].sort((a, b) => WIDTH[a.timeframe] - WIDTH[b.timeframe]).find((d) => WIDTH[d.timeframe] < WIDTH[tf] && WIDTH[tf] % WIDTH[d.timeframe] === 0);
    if (base) {
      result[tf] = domainRows({ ...base, datasetId: `${base.datasetId}:aggregate:${tf}`, timeframe: tf, bars: aggregateCandles([...base.bars], base.timeframe, tf, base.datasetId) });
    }
  }
  return result;
}
function regime(symbol: string, timeframe: DomainTimeframe, rows: readonly DomainCandle[], asOf: string): DecisionTimeRegimeEvidence {
  const available = rows.filter((b) => Date.parse(b.openTime) + WIDTH[timeframe] <= Date.parse(asOf)).slice(-20);
  const first = available[0], last = available.at(-1);
  const avgRange = available.reduce((n, b) => n + (b.high - b.low) / Math.max(Math.abs(b.close), Number.EPSILON), 0) / Math.max(available.length, 1);
  const recent = available.slice(-5).reduce((n, b) => n + (b.high - b.low) / Math.max(Math.abs(b.close), Number.EPSILON), 0) / Math.max(Math.min(5, available.length), 1);
  const returnPct = first && last ? Math.abs((last.close - first.open) / Math.max(Math.abs(first.open), Number.EPSILON)) : 0;
  const classification = recent > avgRange * 1.5 ? "HIGH_VOLATILITY" : recent < avgRange * 0.65 ? "LOW_VOLATILITY" : returnPct > avgRange * 4 ? "TRENDING" : "RANGING";
  return { version: "decision-regime/v1", timestamp: asOf, symbol, sourceTimeframe: timeframe, lookback: available.length, inputs: { returnPct, averageRangePct: avgRange, recentRangePct: recent }, classification, lastInputOpenTime: last?.openTime ?? "" };
}
function costs(model: ResearchExecutionModel, candidate: Candidate, quantity: number): ExecutionCosts {
  if (candidate.strategyId.startsWith("crypto.")) {
    if (!model.crypto) throw new Error("CRYPTO_EXECUTION_MODEL_REQUIRED");
    const c = model.crypto, fee = c.liquidity === "MAKER" ? c.makerFeeRate : c.takerFeeRate;
    return { version: `${model.version}:crypto:${c.liquidity.toLowerCase()}`, spread: 0, slippage: candidate.entry * quantity * c.slippageRate * 2, commission: candidate.entry * quantity * fee * 2, financing: c.fundingPerTrade ?? 0, latencyMs: 0, currency: model.currency };
  }
  if (!model.forex) throw new Error("FOREX_EXECUTION_MODEL_REQUIRED");
  return { version: `${model.version}:forex`, spread: model.forex.spreadCost, slippage: model.forex.slippageCost, commission: model.forex.commissionPerTrade, financing: model.forex.swapPerTrade ?? 0, latencyMs: 0, currency: model.currency };
}
function qualityStatus(q?: HistoricalDataQualityReport) {
  if (!q) return "QUALITY_EVIDENCE_UNAVAILABLE" as const;
  if (q.invalidBars || q.score < 50) return "FAIL" as const;
  return q.duplicates || q.outOfOrder || q.missingRanges.length || q.staleFinalBar || q.unrealisticJumps ? "WARNING" as const : "PASS" as const;
}

export function runCandidatePipelineReplay(input: CandidatePipelineInput): CandidatePipelineResult {
  const invalid = input.datasets.filter((d) => qualityStatus(d.quality) === "FAIL");
  if (invalid.length) throw new Error(`DATA_QUALITY_FAILED:${invalid.map((d) => d.datasetId).join(",")}`);
  const strategies = input.strategyIds.map(id=>input.strategyDefinitions?.find(x=>x.id===id)??strategyById(id)), strategyFor=(id:string)=>strategies.find(x=>x.id===id)??strategyById(id), contexts = strategies.flatMap((strategy) => {
    const symbols = [...new Set(input.datasets.map((d) => d.symbol))].filter((s) => strategy.instruments.includes("*") || strategy.instruments.includes(s));
    return symbols.map((symbol) => ({ strategy, symbol, data: datasetsFor(input, symbol, strategy.requirements.requiredTimeframes) }));
  });
  const times = [...new Set(contexts.flatMap(({ strategy, data }) => (data[strategy.requirements.primaryTimeframe] ?? []).map((b) => new Date(Date.parse(b.openTime) + WIDTH[b.timeframe]).toISOString())))].sort();
  const account: AccountRiskSnapshot = { ...input.initialAccount, exposedSymbols: [...input.initialAccount.exposedSymbols] };
  const active: AcceptedPipelineTrade[] = [], accepted: AcceptedPipelineTrade[] = [], rejected: CandidatePipelineResult["rejected"] extends readonly (infer T)[] ? T[] : never = [], candidateLedger:CandidatePipelineResult["candidates"] extends readonly (infer T)[] ? T[] : never=[];
  let observationCount=0;
  const regimes: DecisionTimeRegimeEvidence[] = [], exposureTimeline: { timestamp: string; openRisk: number; concurrency: number; exposedSymbols: readonly string[] }[] = [], capitalTimeline: { timestamp: string; balance: number; equity: number; availableCapital: number }[] = [];
  let peakOpenRisk = account.currentOpenRisk, maximumConcurrency = 0;
  for (const timestamp of times) {
    const closing = active.filter((a) => a.closedAt <= timestamp).sort((a, b) => a.closedAt.localeCompare(b.closedAt));
    for (const trade of closing) {
      const pnl = trade.result.netPnl ?? trade.result.netR * trade.plan.risk.riskAmount;
      account.balance += pnl; account.equity = account.balance; account.availableCapital += trade.plan.capital.allocatedAmount + pnl; account.currentOpenRisk -= trade.plan.risk.riskAmount;
      account.exposedSymbols = account.exposedSymbols.filter((s) => s !== trade.candidate.symbol);
      active.splice(active.indexOf(trade), 1); input.onTradeClosed?.(trade.result, { ...account });
    }
    const candidates: Candidate[] = [];
    for (const { strategy, symbol, data } of contexts) {
      observationCount++;
      const market = buildCanonicalMarketView({ symbol, asOf: timestamp, primaryTimeframe: strategy.requirements.primaryTimeframe, requiredTimeframes: strategy.requirements.requiredTimeframes, warmupBars: strategy.requirements.warmupBars, datasets: data, session: { open: true, code: strategy.market === "CRYPTO" ? "CRYPTO_24_7" : "HISTORICAL_SESSION_ALLOWED" } });
      const evaluation = strategy.evaluate({ market, configurationVersion: input.configurationVersion, parameters: input.parameters?.[strategy.id] ?? strategy.parameterDefaults });
      if (evaluation.decision === "CANDIDATE") candidates.push(evaluation.candidate);
    }
    if (!candidates.length) continue;
    const arbitration = arbitrateCanonical(candidates, { minimumScore: input.portfolioPolicy.minimumScore, blockedSymbols: [] });
    for (const item of arbitration.rejected) {
      const c = candidates.find((x) => x.id === item.candidateId)!;
      rejected.push({ timestamp, candidateId: c.id, strategyId: c.strategyId, symbol: c.symbol, reasonCodes: item.reasonCodes });
      candidateLedger.push({timestamp,candidate:c,status:"ARBITRATION_REJECTED",authority:"trading-domain.arbitrateCanonical",reasonCodes:item.reasonCodes});
    }
    const candidate = arbitration.chosen;
    if (!candidate) continue;
    const reasons: string[] = [];
    if (input.portfolioPolicy.oneActivePerSymbol && active.some((a) => a.candidate.symbol === candidate.symbol)) reasons.push("SYMBOL_ALREADY_ACTIVE");
    if (active.length >= input.portfolioPolicy.maximumConcurrentPositions) reasons.push("MAX_CONCURRENT_POSITIONS");
    const risk = calculateRiskIntent(candidate, { ...account }, input.riskPolicy);
    if (!risk.allowed) reasons.push(...risk.reasonCodes);
    const symbolExposure = active.filter((a) => a.candidate.symbol === candidate.symbol).reduce((n, a) => n + a.plan.risk.riskAmount, 0) + risk.riskAmount;
    if (symbolExposure > (input.portfolioPolicy.perSymbolExposure[candidate.symbol] ?? Infinity)) reasons.push("PORTFOLIO_EXPOSURE_LIMIT");
    const strategyExposure = active.filter((a) => a.candidate.strategyId === candidate.strategyId).reduce((n, a) => n + a.plan.risk.riskAmount, 0) + risk.riskAmount;
    if (strategyExposure > (input.portfolioPolicy.perStrategyExposure[candidate.strategyId] ?? Infinity)) reasons.push("STRATEGY_EXPOSURE_LIMIT");
    if (account.currentOpenRisk + risk.riskAmount > input.portfolioPolicy.maximumTotalOpenRisk) reasons.push("PORTFOLIO_RISK_LIMIT");
    if (active.reduce((n, a) => n + a.plan.capital.allocatedAmount, 0) + risk.riskAmount > input.portfolioPolicy.maximumPortfolioExposure) reasons.push("PORTFOLIO_EXPOSURE_LIMIT");
    const overlay = input.entryOverlay?.({ timestamp, candidate, account: { ...account } }) ?? { decision: "ALLOW", riskMultiplier: 1, reasonCodes: [], state: "NOT_PROP_GATED" };
    if (overlay.decision === "BLOCK") reasons.push(...overlay.reasonCodes, "PROP_ENTRY_BLOCKED");
    if (reasons.length) { const reasonCodes=[...new Set(reasons)];rejected.push({ timestamp, candidateId: candidate.id, strategyId: candidate.strategyId, symbol: candidate.symbol, reasonCodes });candidateLedger.push({timestamp,candidate,status:"POLICY_REJECTED",authority:"canonicalPipelineReplay.risk-capital-portfolio",reasonCodes});continue; }
    const adjustedRisk = { ...risk, riskPercent: risk.riskPercent * overlay.riskMultiplier, riskAmount: risk.riskAmount * overlay.riskMultiplier, desiredSize: risk.desiredSize * overlay.riskMultiplier, reasonCodes: [...risk.reasonCodes, ...overlay.reasonCodes] };
    const capital = allocateCapitalIntent(adjustedRisk, account, input.portfolioPolicy.maxAllocationPerTrade * overlay.riskMultiplier);
    if (!capital.allowed) { rejected.push({ timestamp, candidateId: candidate.id, strategyId: candidate.strategyId, symbol: candidate.symbol, reasonCodes: capital.reasonCodes }); continue; }
    let quantity = adjustedRisk.desiredSize;
    if (candidate.strategyId.startsWith("crypto.")) {
      const c = input.executionModel.crypto!;
      quantity = Math.floor(quantity / c.quantityStep) * c.quantityStep;
      if (quantity < c.minimumQuantity) { rejected.push({ timestamp, candidateId: candidate.id, strategyId: candidate.strategyId, symbol: candidate.symbol, reasonCodes: ["MINIMUM_QUANTITY"] }); continue; }
    }
    const plan: TradePlan = { version: "trade-plan/v1", candidateId: candidate.id, symbol: candidate.symbol, side: candidate.side, entryModel: "CANDLE_CLOSE_INTENT", intendedEntry: candidate.entry, stop: candidate.stop, targets: candidate.targets, initialRiskDistance: Math.abs(candidate.entry - candidate.stop), partialExit: { targetIndex: 0, fraction: 0.5 }, breakevenAfterTarget: 0, trailing: "AFTER_TP1", expiry: new Date(Date.parse(timestamp) + WIDTH[candidate.primaryTimeframe]).toISOString(), strategyId: candidate.strategyId, strategyVersion: candidate.strategyVersion, risk: adjustedRisk, capital };
    const source = input.datasets.find((d) => d.symbol === candidate.symbol && d.timeframe === candidate.primaryTimeframe)!;
    const observations = source.bars.filter((b) => b.timestamp >= Date.parse(timestamp)).map((b) => ({ id: `${source.datasetId}:${b.timestamp}`, timestamp: new Date(b.timestamp + WIDTH[source.timeframe]).toISOString(), open: b.open, high: b.high, low: b.low, close: b.close, provenance: "HISTORICAL_SIMULATION" as const }));
    const replayDatasets = datasetsFor(input, candidate.symbol, strategyFor(candidate.strategyId).requirements.requiredTimeframes);
    const replay = runCanonicalReplay({ plan, configurationVersion: input.configurationVersion, market: strategyFor(candidate.strategyId).market, primaryTimeframe: candidate.primaryTimeframe, datasetIds: Object.values(replayDatasets).map((rows) => rows?.[0]?.datasetId).filter((x): x is string => Boolean(x)), observations, quantity, costs: costs(input.executionModel, candidate, quantity), riskAmount: adjustedRisk.riskAmount, runReference: input.runReference });
    if (!replay.result) { rejected.push({ timestamp, candidateId: candidate.id, strategyId: candidate.strategyId, symbol: candidate.symbol, reasonCodes: ["NO_COMPLETED_PATH"] }); continue; }
    const primary = datasetsFor(input, candidate.symbol, [candidate.primaryTimeframe])[candidate.primaryTimeframe] ?? [];
    const item: AcceptedPipelineTrade = { candidate, plan, result: replay.result, observations, acceptedAt: timestamp, closedAt: replay.result.closedAt, accountBefore: { ...account, exposedSymbols: [...account.exposedSymbols] }, overlay, regime: regime(candidate.symbol, candidate.primaryTimeframe, primary, timestamp) };
    accepted.push(item); active.push(item); regimes.push(item.regime);
    candidateLedger.push({timestamp,candidate,status:"SELECTED",authority:"trading-domain.arbitrateCanonical",reasonCodes:[]});
    account.currentOpenRisk += adjustedRisk.riskAmount; account.availableCapital -= capital.allocatedAmount; account.exposedSymbols = [...account.exposedSymbols, candidate.symbol];
    input.onTradeAccepted?.(candidate, { ...account });
    peakOpenRisk = Math.max(peakOpenRisk, account.currentOpenRisk); maximumConcurrency = Math.max(maximumConcurrency, active.length);
    exposureTimeline.push({ timestamp, openRisk: account.currentOpenRisk, concurrency: active.length, exposedSymbols: [...account.exposedSymbols] });
    capitalTimeline.push({ timestamp, balance: account.balance, equity: account.equity, availableCapital: account.availableCapital });
  }
  for (const trade of [...active].sort((a, b) => a.closedAt.localeCompare(b.closedAt))) {
    const pnl = trade.result.netPnl ?? trade.result.netR * trade.plan.risk.riskAmount;
    account.balance += pnl; account.equity = account.balance; account.availableCapital += trade.plan.capital.allocatedAmount + pnl; account.currentOpenRisk -= trade.plan.risk.riskAmount; input.onTradeClosed?.(trade.result, { ...account });
  }
  const trades = accepted.map((a) => a.result).sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  const net = trades.map((t) => t.netR), gains = net.filter((n) => n > 0).reduce((a, b) => a + b, 0), losses = Math.abs(net.filter((n) => n < 0).reduce((a, b) => a + b, 0));
  let equity = 0, peak = 0, maxDrawdown = 0; for (const n of net) { equity += n; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity); }
  const sumBy = (key: "symbol" | "strategyId") => Object.fromEntries([...new Set(trades.map((t) => t[key]))].map((v) => [v, trades.filter((t) => t[key] === v).reduce((n, t) => n + t.netR, 0)]));
  const monthly: Record<string, number> = {}; for (const t of trades) monthly[t.closedAt.slice(0, 7)] = (monthly[t.closedAt.slice(0, 7)] ?? 0) + t.netR;
  const core = { version: "candidate-pipeline-replay/v1" as const, trades, accepted, candidates:candidateLedger, observations:observationCount, rejected, regimes, metrics: { grossR: trades.reduce((n, t) => n + t.grossR, 0), netR: net.reduce((a, b) => a + b, 0), grossPnl: trades.reduce((n, t) => n + (t.grossPnl ?? 0), 0), netPnl: trades.reduce((n, t) => n + (t.netPnl ?? 0), 0), profitFactor: losses ? gains / losses : gains ? Infinity : null, expectancyR: net.length ? net.reduce((a, b) => a + b, 0) / net.length : 0, maxDrawdown, peakOpenRisk, maximumConcurrency, symbolContribution: sumBy("symbol"), strategyContribution: sumBy("strategyId"), monthly }, exposureTimeline, capitalTimeline, dataQuality: input.datasets.map((d) => ({ datasetId: d.datasetId, status: qualityStatus(d.quality), quality: d.quality })) };
  return { ...core, runHash: hash({ input: { ...input, entryOverlay: undefined, onTradeAccepted: undefined, onTradeClosed: undefined }, core }) };
}

export type PathStressScenario = "ENTRY_DELAY_1_BAR" | "EXIT_DELAY_1_BAR" | "WORSE_FILL";
export function runPathAwareStress(trade: AcceptedPipelineTrade, scenario: PathStressScenario) {
  if (!trade.observations.length) throw new Error("PATH_EVIDENCE_REQUIRED");
  if (scenario === "ENTRY_DELAY_1_BAR") {
    const observations = trade.observations.slice(1), first = observations[0];
    if (!first) throw new Error("ENTRY_DELAY_PATH_UNAVAILABLE");
    return runCanonicalReplay({ plan: { ...trade.plan, intendedEntry: first.open, initialRiskDistance: Math.abs(first.open - trade.plan.stop) }, configurationVersion: trade.result.configurationVersion, market: trade.result.market, primaryTimeframe: trade.result.primaryTimeframe, datasetIds: trade.result.datasetIds, observations, fillPrice: first.open, quantity: trade.result.fill.quantity, costs: { ...trade.result.costs, version: `${trade.result.costs.version}:ENTRY_DELAY_1_BAR` }, riskAmount: trade.plan.risk.riskAmount, runReference: `${trade.result.runReference}:entry-delay` });
  }
  const closeIndex = trade.observations.findIndex((o) => o.timestamp >= trade.result.closedAt), delayed = trade.observations[closeIndex + 1];
  if (!delayed) throw new Error("EXIT_PATH_UNAVAILABLE");
  const adverse = trade.plan.side === "BUY" ? delayed.low : delayed.high;
  const price = scenario === "WORSE_FILL" ? adverse : delayed.close;
  return { scenario, provenance: "RETAINED_CANDLE_PATH" as const, sourceObservationId: delayed.id, sourceTimestamp: delayed.timestamp, price };
}
