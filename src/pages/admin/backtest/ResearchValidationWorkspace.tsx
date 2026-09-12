import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  listCanonicalPropRuns,
  getForwardAccountReadiness,
  persistForwardValidationRun,
  persistQualificationCampaign,
  persistResearchAnalysis,
} from "../../../lib/prop/propProductRepository";
import type { CanonicalPropRun } from "../../../lib/prop/professionalPropEngine";
import {
  certify,
  freezeForwardCandidate,
  groupedAnalysis,
  metrics,
  monteCarlo,
  parameterRobustness,
  portfolio,
  splitOos,
  stress,
  validateResearchRun,
  walkForward,
  type CertificationPolicy,
  type ResearchRunContract,
  type StressScenario,
} from "../../../lib/research/researchValidation";
import { CANONICAL_STRATEGIES } from "../../../../supabase/functions/_shared/trading-domain/strategies.ts";
import type { DecisionTimeRegimeEvidence } from "../../../lib/research/canonicalPipelineReplay";
import { runCandidatePipelineReplay, type CandidatePipelineResult } from "../../../lib/research/canonicalPipelineReplay";
import type { MultiAssetFeedItem } from "./types";
import { runFullPropPipelineReplay, runRollingFullPropChallenges } from "../../../lib/research/fullPropPipelineReplay";
import { PROP_PROFILES, type PropAccountConfiguration } from "../../../lib/prop/professionalPropEngine";
import {
  DEFAULT_QUALIFICATION_WEIGHTS,
  freezeQualifiedForwardCandidate,
  runQualificationCampaign,
  type CalibrationSearchMethod,
  type QualificationCampaignResult,
} from "../../../lib/research/strategyQualification";
import { startForwardValidation, type FrozenForwardConfiguration } from "../../../lib/research/forwardValidation";
import { supabase } from "../../../lib/supabase";

type Tab =
  | "SINGLE"
  | "OVERVIEW"
  | "OOS"
  | "WALK_FORWARD"
  | "STRESS"
  | "MONTE_CARLO"
  | "MULTI_ASSET"
  | "PORTFOLIO"
  | "FAST_PROP"
  | "FULL_PROP_PIPELINE"
  | "REGIME"
  | "COMPARISON"
  | "PROP_VALIDATION"
  | "CERTIFICATION"
  | "TRADES"
  | "FAILURES";
const tabs: Tab[] = [
  "SINGLE",
  "OVERVIEW",
  "OOS",
  "WALK_FORWARD",
  "STRESS",
  "MONTE_CARLO",
  "MULTI_ASSET",
  "PORTFOLIO",
  "FAST_PROP",
  "FULL_PROP_PIPELINE",
  "REGIME",
  "COMPARISON",
  "PROP_VALIDATION",
  "CERTIFICATION",
  "TRADES",
  "FAILURES",
];
const scenarios: StressScenario[] = [
  "BASELINE",
  "SPREAD_1_25X",
  "SPREAD_1_5X",
  "SPREAD_2X",
  "SLIPPAGE_LOW",
  "SLIPPAGE_MEDIUM",
  "SLIPPAGE_HIGH",
  "COMMISSION_HIGHER",
  "MISSED_TRADE_RATE",
  "COMBINED_STRESS",
];
const policy: CertificationPolicy = {
  minimumTrades: 30,
  minimumOOSTrades: 10,
  minimumPF: 1.1,
  minimumExpectancyR: 0.05,
  maximumDrawdownR: 12,
  minimumWalkForwardConsistency: 55,
  maximumOOSDegradation: 0.5,
  stressMinimumPF: 1,
  monteCarloMaxDdP95: 15,
};
function adapt(run: CanonicalPropRun): ResearchRunContract {
  const ordered = [...run.trades].sort((a, b) =>
      a.closedAt.localeCompare(b.closedAt),
    ),
    first = ordered[0],
    last = ordered.at(-1);
  return {
    runId: run.id,
    runHash: run.runHash,
    strategyId: run.strategyId,
    strategyVersion: run.strategyVersion,
    configurationVersion: first?.configurationVersion ?? "unknown",
    symbols: [run.symbol],
    timeframes: [first?.primaryTimeframe ?? "unknown"],
    datasetIds: run.datasetIds,
    dateRange: { from: first?.openedAt ?? "", to: last?.closedAt ?? "" },
    trainingRange: null,
    validationRange: null,
    executionModel: {
      version: run.executionModelVersion,
      provenance: "HISTORICAL_ESTIMATE",
      spread: ordered.reduce((s, t) => s + t.costs.spread, 0),
      slippage: ordered.reduce((s, t) => s + t.costs.slippage, 0),
      commission: ordered.reduce((s, t) => s + t.costs.commission, 0),
      swap: ordered.reduce((s, t) => s + t.costs.financing, 0),
    },
    riskPolicyVersion: first?.runReference ?? "recorded-run",
    capitalPolicyVersion: first?.runReference ?? "recorded-run",
    tradeManagementPolicyVersion: "canonical-replay/v1",
    initialBalance: 100000,
    currency: first?.costs.currency ?? "USD",
    createdAt: first?.openedAt ?? "",
    status: "COMPLETED",
    verificationLevel: "HISTORICAL",
    trades: ordered,
    seed: 20260910,
  };
}
export default function ResearchValidationWorkspace({ multiAssetFeeds = {} }: { multiAssetFeeds?: Record<string, MultiAssetFeedItem> }) {
  const [source, setSource] = useState<CanonicalPropRun[]>([]),
    [runId, setRunId] = useState(""),
    [tab, setTab] = useState<Tab>("OVERVIEW"),
    [split, setSplit] = useState(70),
    [walkTrain, setWalkTrain] = useState(6),
    [walkTest, setWalkTest] = useState(1),
    [walkStep, setWalkStep] = useState(1),
    [walkUnit, setWalkUnit] = useState<"DAYS" | "WEEKS" | "MONTHS">("MONTHS"),
    [monteCount, setMonteCount] = useState(1000),
    [tradeFilter, setTradeFilter] = useState("ALL"),
    [comparisonSort, setComparisonSort] = useState<"NET_R" | "PF" | "DD">(
      "NET_R",
    ),
    [pipelineStrategy, setPipelineStrategy] = useState("crypto.trend-pullback"),
    [pipelineResult, setPipelineResult] = useState<CandidatePipelineResult | null>(null),
    [fullPropResult, setFullPropResult] = useState<ReturnType<typeof runFullPropPipelineReplay> | null>(null),
    [rollingPropResult, setRollingPropResult] = useState<ReturnType<typeof runRollingFullPropChallenges> | null>(null),
    [rollingAttempts, setRollingAttempts] = useState(10),
    [rollingWindowDays, setRollingWindowDays] = useState(60),
    [rollingCadenceDays, setRollingCadenceDays] = useState(7),
    [qualificationProduct, setQualificationProduct] = useState<"PERSONAL" | "PROP">("PERSONAL"),
    [campaignScope, setCampaignScope] = useState<"SELECTED_STRATEGY" | "COMPATIBLE_ASSET_CLASS">("SELECTED_STRATEGY"),
    [searchMethod, setSearchMethod] = useState<CalibrationSearchMethod>("GRID"),
    [variantLimit, setVariantLimit] = useState(10),
    [campaignStatus, setCampaignStatus] = useState<"IDLE" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED">("IDLE"),
    [campaign, setCampaign] = useState<QualificationCampaignResult | null>(null),
    [frozenCandidate, setFrozenCandidate] = useState<FrozenForwardConfiguration | null>(null),
    [forwardAccountId, setForwardAccountId] = useState(""),
    [forwardAccounts,setForwardAccounts]=useState<Array<{id:string;nickname?:string;account_number_masked?:string;broker?:string;server?:string}>>([]),
    [validationRan, setValidationRan] = useState(false),
    [forwardStarted, setForwardStarted] = useState(false),
    [status, setStatus] = useState("Loading completed canonical runs…");
  useEffect(() => {
    void listCanonicalPropRuns()
      .then((runs) => {
        setSource(runs);
        setRunId(runs[0]?.id ?? "");
        setStatus(
          runs.length
            ? "Canonical runs loaded"
            : "Run a canonical Single Backtest first",
        );
      })
      .catch((e: Error) =>
        setStatus(`Research persistence unavailable: ${e.message}`),
      );
  }, []);
  useEffect(()=>{void supabase.from('mt5_accounts_safe').select('id,nickname,account_number_masked,broker,server').order('created_at',{ascending:false}).then((result:{data:Array<{id:string;nickname?:string;account_number_masked?:string;broker?:string;server?:string}>|null})=>setForwardAccounts(result.data??[]));},[]);
  useEffect(()=>{const feeds=Object.values(multiAssetFeeds).filter(feed=>feed.status==='ready'&&feed.datasetId&&feed.qualityEvidence);if(!feeds.length)return;const current=CANONICAL_STRATEGIES[pipelineStrategy];if(feeds.some(feed=>current.instruments.includes('*')||current.instruments.includes(feed.symbol)))return;const compatible=Object.values(CANONICAL_STRATEGIES).find(strategy=>feeds.some(feed=>strategy.instruments.includes('*')||strategy.instruments.includes(feed.symbol)));if(compatible)setPipelineStrategy(compatible.id);},[multiAssetFeeds,pipelineStrategy]);
  const runs = useMemo(() => source.map(adapt), [source]),
    pipelineRun = useMemo<ResearchRunContract | undefined>(() => {
      if (!pipelineResult) return undefined;
      const trades=[...pipelineResult.trades].sort((a,b)=>a.closedAt.localeCompare(b.closedAt)), first=trades[0], last=trades.at(-1);
      return {runId:pipelineResult.runHash,runHash:pipelineResult.runHash,strategyId:pipelineStrategy,strategyVersion:CANONICAL_STRATEGIES[pipelineStrategy].version,configurationVersion:first?.configurationVersion??'research-ui/reference',symbols:[...new Set(trades.map(t=>t.symbol))],timeframes:[first?.primaryTimeframe??'unknown'],datasetIds:[...new Set(Object.values(multiAssetFeeds).filter(f=>f.datasetId).map(f=>f.datasetId!))],dateRange:{from:first?.openedAt??'',to:last?.closedAt??''},trainingRange:null,validationRange:null,executionModel:{version:'research-ui/cost-v1',provenance:'HISTORICAL_ESTIMATE',spread:trades.reduce((n,t)=>n+t.costs.spread,0),slippage:trades.reduce((n,t)=>n+t.costs.slippage,0),commission:trades.reduce((n,t)=>n+t.costs.commission,0),swap:trades.reduce((n,t)=>n+t.costs.financing,0)},riskPolicyVersion:'research-ui/risk-v1',capitalPolicyVersion:'research-ui/portfolio-v1',tradeManagementPolicyVersion:'canonical-replay/v1',initialBalance:100000,currency:first?.costs.currency??'USD',createdAt:first?.openedAt??new Date().toISOString(),status:'COMPLETED',verificationLevel:'HISTORICAL',trades,seed:20260910};
    },[pipelineResult,pipelineStrategy,multiAssetFeeds]),
    run = runs.find((r) => r.runId === runId) ?? (!runId ? pipelineRun : undefined),
    analysis = useMemo(() => {
      if (!run) return null;
      const quality = validateResearchRun(run),
        base = metrics(run.trades, run.initialBalance),
        oos = run.trades.length > 1 ? splitOos(run, split) : null,
        unitDays = walkUnit === "DAYS" ? 1 : walkUnit === "WEEKS" ? 7 : 30,
        wf = walkForward(run, walkTrain * unitDays, walkTest * unitDays, walkStep * unitDays),
        stresses = scenarios.map((s) => stress(run, s)),
        monte = monteCarlo(
          run,
          monteCount,
          run.seed,
          "TRADE_ORDER_PERMUTATION",
          10,
        ),
        groups = groupedAnalysis(run),
        port = portfolio(runs, {
          initialBalance: 100000,
          maxConcurrentPositions: 3,
          maxOpenRiskR: 3,
          oneActivePerSymbol: true,
        }),
        robustness = parameterRobustness(
          run,
          runs.filter((r) => r.strategyId === run.strategyId),
        ),
        cert = oos
          ? certify({ run, oos, walk: wf, stresses, monte, policy })
          : null;
      return {
        quality,
        base,
        oos,
        wf,
        stresses,
        monte,
        groups,
        port,
        robustness,
        cert,
        portfolioPipelineRegimes: [] as DecisionTimeRegimeEvidence[],
      };
    }, [run, runs, split, monteCount, walkTrain, walkTest, walkStep, walkUnit]);
  const persist = async () => {
    if (!run || !analysis) return;
    await persistResearchAnalysis(run.runId, {
      runHash: run.runHash,
      oos: analysis.oos,
      walkForward: analysis.wf,
      stress: analysis.stresses,
      monteCarlo: { ...analysis.monte, results: undefined },
      portfolio: analysis.port,
      robustness: analysis.robustness,
      certification: analysis.cert,
    });
    setStatus("Research analysis persisted to originating backtest run");
  };
  const createPipelineInput = (strategyId = pipelineStrategy) => {
    const definition = CANONICAL_STRATEGIES[strategyId];
    const feeds = Object.values(multiAssetFeeds).filter((feed, index, all) => feed.status === "ready" && Boolean(feed.datasetId && feed.qualityEvidence) && all.findIndex((x) => x.symbol === feed.symbol && x.datasetId === feed.datasetId) === index && (definition.instruments.includes("*") || definition.instruments.includes(feed.symbol)));
    if (!feeds.length) return null;
    return { datasets: feeds.map((feed) => ({ datasetId: feed.datasetId ?? `${feed.source}:${feed.symbol}`, symbol: feed.symbol, timeframe: "15m" as const, provider: feed.source.startsWith("MT5") ? "MT5_BRIDGE" as const : feed.source.startsWith("BYBIT") ? "BYBIT" as const : "BINANCE" as const, quality: feed.qualityEvidence, bars: feed.candles.map((bar) => ({ timestamp: Date.parse(bar.time), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume })) })), strategyIds: [strategyId], configurationVersion: "research-ui/reference", initialAccount: { balance: 100000, equity: 100000, availableCapital: 100000, currentOpenRisk: 0, dailyLoss: 0, drawdownPercent: 0, exposedSymbols: [] }, riskPolicy: { version: "research-ui/risk-v1", riskPercent: 1, maxOpenRisk: 3000, maxDailyLoss: 5000, maxDrawdownPercent: 10 }, portfolioPolicy: { minimumScore: 0, oneActivePerSymbol: true, maximumConcurrentPositions: 3, maximumTotalOpenRisk: 3000, maximumPortfolioExposure: 100000, perSymbolExposure: {}, perStrategyExposure: {}, maxAllocationPerTrade: 1000 }, executionModel: { version: "research-ui/cost-v1", currency: "USD", provenance: "HISTORICAL_ESTIMATE" as const, forex: { spreadCost: 0, commissionPerTrade: 0, slippageCost: 0 }, crypto: { liquidity: "TAKER" as const, makerFeeRate: 0.0002, takerFeeRate: 0.0005, slippageRate: 0.0001, quantityStep: 0.000001, minimumQuantity: 0.000001 } }, runReference: `research-ui:${strategyId}` };
  };
  const runRawPipeline = () => {
    const pipelineInput = createPipelineInput();
    if (!pipelineInput) { setStatus("No compatible canonical feed is ready. Sync MT5, Binance, or Bybit history first."); return; }
    try {
      const result = runCandidatePipelineReplay(pipelineInput);
      setPipelineResult(result); setRunId(""); setValidationRan(false); setFullPropResult(null); setRollingPropResult(null); setCampaign(null); setFrozenCandidate(null); setForwardStarted(false); setStatus(`Canonical backtest completed: ${result.trades.length} accepted trades`);
    } catch (error) { setStatus(`Pipeline refused run: ${error instanceof Error ? error.message : "unknown error"}`); }
  };
  const runFullProp = () => {
    const pipelineInput = createPipelineInput();
    if (!pipelineInput) { setStatus("No compatible canonical feed is ready for Full Prop Pipeline."); return; }
    const profile = pipelineStrategy.startsWith("crypto.") ? PROP_PROFILES.CUSTOM : PROP_PROFILES.FTMO_TWO_STEP;
    const propConfig: PropAccountConfiguration = { id: "research-full-prop", label: "Research Full Prop Pipeline", profileId: profile.programId, profileVersion: profile.profileVersion, accountSize: 100000, currency: "USD", mode: "HISTORICAL_PROP_SIMULATION", provider: "HISTORICAL", realPropActivationConfirmed: false, monthlyIncomeObjectivePct: 2, softProfitGuardPct: 1.7, noNewEntriesPct: 2, internalDailyLossLockPct: 2, retainedBufferPct: 0.5, control: "START" };
    const start = pipelineInput.datasets.flatMap((d) => d.bars).sort((a, b) => a.timestamp - b.timestamp)[0]?.timestamp ?? Date.now();
    const result = runFullPropPipelineReplay({ ...pipelineInput, propConfig, propProfile: profile, propSnapshot: { timestamp: new Date(start).toISOString(), startingBalance: 100000, balance: 100000, equity: 100000, startOfDayBalance: 100000, closedPnl: 0, floatingPnl: 0, dailyClosedPnl: 0, openRisk: 0, openPositions: 0, pendingExecutableOrders: 0, tradingDays: 0, brokerTruth: false } });
    setFullPropResult(result); setStatus(`Full Prop Pipeline completed: ${result.pipeline.trades.length} accepted trades, ${result.propDecisions.filter((d) => d.decision === "BLOCK").length} Prop blocks`);
  };
  const runRollingProp = () => {
    const pipelineInput=createPipelineInput();if(!pipelineInput){setStatus("No compatible canonical feed is ready for rolling Multi-Challenge.");return;}
    const profile=pipelineStrategy.startsWith("crypto.")?PROP_PROFILES.CUSTOM:PROP_PROFILES.FTMO_TWO_STEP;
    const propConfig:PropAccountConfiguration={id:"research-rolling-prop",label:"Rolling Prop Pipeline",profileId:profile.programId,profileVersion:profile.profileVersion,accountSize:100000,currency:"USD",mode:"HISTORICAL_PROP_SIMULATION",provider:"HISTORICAL",realPropActivationConfirmed:false,monthlyIncomeObjectivePct:2,softProfitGuardPct:1.7,noNewEntriesPct:2,internalDailyLossLockPct:2,retainedBufferPct:.5,control:"START"};
    const start=pipelineInput.datasets.flatMap(dataset=>dataset.bars).sort((a,b)=>a.timestamp-b.timestamp)[0]?.timestamp??Date.now();
    try{const result=runRollingFullPropChallenges({...pipelineInput,propConfig,propProfile:profile,propSnapshot:{timestamp:new Date(start).toISOString(),startingBalance:100000,balance:100000,equity:100000,startOfDayBalance:100000,closedPnl:0,floatingPnl:0,dailyClosedPnl:0,openRisk:0,openPositions:0,pendingExecutableOrders:0,tradingDays:0,brokerTruth:false},attempts:rollingAttempts,windowDays:rollingWindowDays,cadenceDays:rollingCadenceDays,fundedSurvivalDays:90});setRollingPropResult(result);setStatus(`Rolling Multi-Challenge completed: ${result.passCount}/${result.attemptCount} passed`);}catch(error){setStatus(`Rolling Multi-Challenge refused: ${error instanceof Error?error.message:"unknown error"}`);}
  };
  const runQualification = () => {
    const selectedMarket = CANONICAL_STRATEGIES[pipelineStrategy].market;
    const strategyIds = campaignScope === "SELECTED_STRATEGY" ? [pipelineStrategy] : Object.values(CANONICAL_STRATEGIES).filter((strategy) => strategy.market === selectedMarket).map((strategy) => strategy.id);
    const strategyInputs = Object.fromEntries(strategyIds.map((strategyId) => [strategyId, createPipelineInput(strategyId)]).filter((entry): entry is [string, NonNullable<ReturnType<typeof createPipelineInput>>] => Boolean(entry[1])));
    const runnableStrategyIds = strategyIds.filter((strategyId) => Boolean(strategyInputs[strategyId]));
    if (!runnableStrategyIds.length) { setStatus("Sync a compatible canonical dataset before qualification."); return; }
    setCampaignStatus("QUEUED");
    setTimeout(() => {
      setCampaignStatus("RUNNING");
      try {
        const profile = pipelineStrategy.startsWith("crypto.") ? PROP_PROFILES.CUSTOM : PROP_PROFILES.FTMO_TWO_STEP;
        const propConfig: PropAccountConfiguration = { id: "qualification-prop", label: "Qualification Prop", profileId: profile.programId, profileVersion: profile.profileVersion, accountSize: 100000, currency: "USD", mode: "HISTORICAL_PROP_SIMULATION", provider: "HISTORICAL", realPropActivationConfirmed: false, monthlyIncomeObjectivePct: 2, softProfitGuardPct: 1.7, noNewEntriesPct: 2, internalDailyLossLockPct: 2, retainedBufferPct: 0.5, control: "START" };
        const result = runQualificationCampaign({ campaignId: `qualification:${pipelineStrategy}:${Date.now()}`, certificationDate: new Date().toISOString(), assetClass: selectedMarket, strategyInputs, strategyIds: runnableStrategyIds, searchMethod, seed: 20260910, maximumVariantsPerStrategy: variantLimit, policy: { id: `research-${qualificationProduct.toLowerCase()}`, version: `${qualificationProduct.toLowerCase()}/v1`, product: qualificationProduct, minimumTrades: 10, minimumOosTrades: 4, minimumIsExpectancyR: 0, minimumOosExpectancyR: 0, minimumOosProfitFactor: 1, minimumWalkForwardConsistencyPct: 50, minimumStressProfitFactor: 0.9, maximumMonteCarloDrawdownR95: 15, maximumIsOosExpectancyDivergence: 0.75, maximumSingleRegimeContributionPct: 85, maximumSingleSymbolContributionPct: 100, minimumResearchScore: 60, requireFullPropPipeline: qualificationProduct === "PROP", requireFundedSurvival: qualificationProduct === "PROP", weights: DEFAULT_QUALIFICATION_WEIGHTS }, prop: qualificationProduct === "PROP" ? { profile, config: propConfig, fundedSurvivalDays: 90 } : undefined });
        setCampaign(result); setCampaignStatus("COMPLETED"); setStatus(`${result.recommendation}: ${result.survivors.length} robust survivor(s)`);
        void persistQualificationCampaign(result).catch((error: Error) => setStatus(`Campaign completed; persistence failed: ${error.message}`));
      } catch (error) { setCampaignStatus("FAILED"); setStatus(`Qualification failed: ${error instanceof Error ? error.message : "unknown error"}`); }
    }, 0);
  };
  const freezeCampaignWinner = () => {
    const winner = campaign?.survivors[0];
    if (!winner) { setStatus("No qualified campaign winner is available to freeze."); return; }
    const pipelineInput = createPipelineInput(winner.binding.strategyId);
    if (!pipelineInput) { setStatus("The winner's source dataset is no longer loaded; freeze refused."); return; }
    if (!confirm(`Freeze ${winner.binding.strategyId}@${winner.binding.strategyVersion} configuration ${winner.binding.configVersion}? This creates an immutable forward candidate and does not mutate live strategy configuration.`)) return;
    const frozen = freezeQualifiedForwardCandidate(winner, campaign.qualifiedSet, pipelineInput, { approvedAt: new Date().toISOString(), propProfileId: qualificationProduct === "PROP" ? (winner.binding.assetClass === "CRYPTO" ? "CUSTOM" : "FTMO_TWO_STEP") : undefined, accountSize: 100000, hashibotSafetyPolicyVersion: qualificationProduct === "PROP" ? "operator-policy/current" : undefined });
    setFrozenCandidate(frozen as FrozenForwardConfiguration);
    navigator.clipboard?.writeText(JSON.stringify(frozen, null, 2));
    setStatus("Immutable qualified forward candidate copied");
  };
  const startFrozenForwardValidation = async () => {
    if (!frozenCandidate || !campaign || !forwardAccountId.trim()) { setStatus("Freeze a candidate and select a certified execution account first."); return; }
    try{const readiness=await getForwardAccountReadiness(forwardAccountId.trim());const handoff=startForwardValidation({frozen:frozenCandidate,qualifiedSet:campaign.qualifiedSet,account:{...readiness,product:campaign.qualifiedSet.product},startedAt:new Date().toISOString()});
    if(handoff.status!=="READY"){setStatus(`Forward validation blocked: ${handoff.reasonCodes.join(", ")}`);return;}
    await persistForwardValidationRun(handoff as unknown as Record<string,unknown>);setForwardStarted(true);setStatus("Forward validation started; awaiting authoritative provider observations.");}catch(error){setStatus(`Forward validation persistence failed: ${error instanceof Error?error.message:"unknown error"}`);}
  };
  const freeze = () => {
    if (!run || analysis?.cert?.status !== "FORWARD_VALIDATION_CANDIDATE")
      return;
    const frozen = freezeForwardCandidate(
      run,
      {},
      {
        profileId: "FTMO_TWO_STEP",
        accountSize: 100000,
        safetyPolicyVersion: "operator-policy/current",
      },
      new Date().toISOString(),
    );
    navigator.clipboard?.writeText(JSON.stringify(frozen, null, 2));
    setStatus("Immutable forward candidate copied");
  };
  const visible =
    run?.trades.filter(
      (t) =>
        tradeFilter === "ALL" ||
        (tradeFilter === "WIN" && t.netR > 0) ||
        (tradeFilter === "LOSS" && t.netR < 0) ||
        tradeFilter === t.closeReason,
    ) ?? [];
  const dataReady=Object.values(multiAssetFeeds).some(feed=>feed.status==='ready'&&Boolean(feed.datasetId&&feed.qualityEvidence));
  const backtestReady=Boolean(pipelineResult);
  const validationReady=validationRan&&Boolean(analysis);
  const propReady=Boolean(fullPropResult&&rollingPropResult);
  const qualified=Boolean(campaign?.survivors.length);
  const stage=(complete:boolean,available:boolean)=>complete?'COMPLETE':available?'READY':'LOCKED';
  return (<>
    <section className="space-y-4" data-testid="guided-research-workflow">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{[['DATA',dataReady],['BACKTEST',backtestReady],['VALIDATE',validationReady],['PROP',propReady],['QUALIFY',qualified],['FREEZE',Boolean(frozenCandidate)],['FORWARD',forwardStarted]].map(([label,done],index)=><a key={String(label)} href={`#stage-${String(label).toLowerCase()}`} className={`rounded border p-2 text-center text-[10px] font-bold ${done?'border-emerald-500/40 bg-emerald-500/10 text-emerald-300':index===0||[dataReady,backtestReady,validationReady,propReady,qualified,Boolean(frozenCandidate)][index-1]?'border-blue-500/40 bg-blue-500/10 text-blue-300':'border-slate-800 text-slate-500'}`}>{label} {done?'✓':''}</a>)}</div>
      <Stage id="backtest" number="2" title="BACKTEST" purpose="Replay canonical raw-bar candidates through arbitration, risk, capital, and execution-cost truth." state={stage(backtestReady,dataReady)} blocker={!dataReady?'Fetch a compatible real dataset first.':undefined}>
        <label className="text-xs text-slate-300">Strategy<select aria-label="Canonical strategy" value={pipelineStrategy} onChange={e=>setPipelineStrategy(e.target.value)} className="ml-2 rounded bg-slate-950 p-2">{Object.values(CANONICAL_STRATEGIES).map(s=><option key={s.id} value={s.id}>{s.id} · {s.version}</option>)}</select></label><button onClick={runRawPipeline} disabled={!dataReady} className="rounded bg-cyan-700 px-4 py-2 text-xs font-bold disabled:opacity-40">RUN CANONICAL BACKTEST</button>{pipelineResult&&<Grid values={{Trades:pipelineResult.trades.length,Rejections:pipelineResult.rejected.length,'Net R':pipelineResult.metrics.netR,'Profit factor':pipelineResult.metrics.profitFactor??'N/A','Max drawdown':pipelineResult.metrics.maxDrawdown,'Run identity':pipelineResult.runHash}}/>}<Next href="#stage-validate" enabled={backtestReady}>NEXT: VALIDATE</Next>
      </Stage>
      <Stage id="validate" number="3" title="VALIDATE" purpose="Run the existing OOS, walk-forward, stress, Monte Carlo, regime, and portfolio evidence suite." state={stage(validationReady,backtestReady)} blocker={!backtestReady?'Run the canonical backtest first.':!analysis?'Completed trade evidence is unavailable.':undefined}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{['OOS','WALK-FORWARD','STRESS','MONTE CARLO','REGIME','PORTFOLIO'].map(x=><Status key={x} label={x} value={!validationRan?'NOT RUN':analysis?'PASS':'UNAVAILABLE'}/>)}</div><button onClick={()=>{if(analysis){setValidationRan(true);setStatus('Validation suite completed using canonical research functions. Review individual evidence; no synthetic overall score was created.')}}} disabled={!backtestReady||!analysis} className="rounded bg-indigo-700 px-4 py-2 text-xs font-bold disabled:opacity-40">RUN VALIDATION SUITE</button>{validationRan&&analysis&&<Grid values={{OOS:analysis.oos?'COMPLETED':'UNAVAILABLE','Walk-forward':analysis.wf.windows.length?'COMPLETED':'WARNING',Stress:`${analysis.stresses.length} scenarios`,'Monte Carlo':`${monteCount} simulations`,Regime:Object.keys(analysis.groups.byRegime).length,Portfolio:analysis.port.status}}/>}<Next href="#stage-prop" enabled={validationReady}>NEXT: PROP TESTING</Next>
      </Stage>
      <Stage id="prop" number="4" title="PROP" purpose="Evaluate historical Prop lifecycles; these are replays, never live Prop performance." state={stage(propReady,validationReady)} blocker={!validationReady?'Complete validation first.':undefined}>
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold text-amber-200">HISTORICAL PROP SIMULATION / REPLAY</div><div className="grid gap-3 lg:grid-cols-2"><div className="rounded border border-slate-800 p-3"><b>FULL PROP PIPELINE</b><p className="my-2 text-xs text-slate-400">One complete portfolio/account Prop lifecycle.</p><button onClick={runFullProp} disabled={!validationReady} className="rounded bg-emerald-700 px-3 py-2 text-xs disabled:opacity-40">RUN FULL PROP EVALUATION</button>{fullPropResult&&<Grid values={{Accepted:fullPropResult.pipeline.trades.length,Blocked:fullPropResult.propDecisions.filter(d=>d.decision==='BLOCK').length,'Ending balance':fullPropResult.endingSnapshot.balance}}/>}</div><div className="rounded border border-slate-800 p-3"><b>ROLLING MULTI-CHALLENGE</b><p className="my-2 text-xs text-slate-400">Independent historical start dates with isolated account state.</p><div className="grid grid-cols-3 gap-2"><input aria-label="Challenge starts" type="number" value={rollingAttempts} onChange={e=>setRollingAttempts(Number(e.target.value))} className="bg-slate-950 p-2 text-xs"/><input aria-label="Window days" type="number" value={rollingWindowDays} onChange={e=>setRollingWindowDays(Number(e.target.value))} className="bg-slate-950 p-2 text-xs"/><input aria-label="Cadence days" type="number" value={rollingCadenceDays} onChange={e=>setRollingCadenceDays(Number(e.target.value))} className="bg-slate-950 p-2 text-xs"/></div><button onClick={runRollingProp} disabled={!validationReady} className="mt-2 rounded bg-blue-700 px-3 py-2 text-xs disabled:opacity-40">RUN MULTI-CHALLENGE</button>{rollingPropResult&&<Grid values={{'Pass rate':`${rollingPropResult.historicalPassRate.toFixed(1)}%`,'Failure causes':Object.keys(rollingPropResult.failureReasons).join(', ')||'NONE','Funded survival':`${rollingPropResult.fundedSurvivalRate.toFixed(1)}%`}}/>}</div></div><Next href="#stage-qualify" enabled={propReady}>NEXT: QUALIFY</Next>
      </Stage>
      <Stage id="qualify" number="5" title="QUALIFY" purpose="Search canonical configurations and retain only robust survivors for the selected product." state={campaignStatus==='RUNNING'?'RUNNING':stage(qualified,propReady)} blocker={!propReady?'Complete both Prop replays first.':campaign&&!qualified?campaign.recommendation:undefined}>
        <div className="flex flex-wrap gap-2"><select aria-label="Qualification product" value={qualificationProduct} onChange={e=>setQualificationProduct(e.target.value as typeof qualificationProduct)} className="bg-slate-950 p-2 text-xs"><option>PERSONAL</option><option>PROP</option></select><select aria-label="Strategy scope" value={campaignScope} onChange={e=>setCampaignScope(e.target.value as typeof campaignScope)} className="bg-slate-950 p-2 text-xs"><option>SELECTED_STRATEGY</option><option>COMPATIBLE_ASSET_CLASS</option></select><select aria-label="Search method" value={searchMethod} onChange={e=>setSearchMethod(e.target.value as CalibrationSearchMethod)} className="bg-slate-950 p-2 text-xs"><option>GRID</option><option>RANDOM_SEEDED</option><option>LATIN_HYPERCUBE</option></select><input aria-label="Variant limit" type="number" value={variantLimit} onChange={e=>setVariantLimit(Number(e.target.value))} className="w-24 bg-slate-950 p-2 text-xs"/></div><button onClick={runQualification} disabled={!propReady||campaignStatus==='RUNNING'} className="rounded bg-violet-700 px-4 py-2 text-xs font-bold disabled:opacity-40">CALIBRATE &amp; QUALIFY</button>{campaign&&<><Grid values={{Status:campaign.recommendation,'Variants tested':campaign.variantsTested,Eliminated:campaign.eliminated,Survivors:campaign.survivors.length,'Qualified set':campaign.qualifiedSet.id}}/><Table headers={['Config','Status','Elimination / failure reason']} rows={campaign.results.map(r=>[r.variant.configVersion,r.status,[...r.eliminationReasons,...r.thesisDiagnostics].join(', ')||'SURVIVED'])}/></>}<Next href="#stage-freeze" enabled={qualified}>NEXT: FREEZE WINNER</Next>
      </Stage>
      <Stage id="freeze" number="6" title="FREEZE" purpose="Pin the exact qualified configuration for controlled forward validation without mutating live strategy." state={stage(Boolean(frozenCandidate),qualified)} blocker={!qualified?'A robust qualified survivor is required.':undefined}>
        {campaign?.survivors[0]&&<Grid values={{Strategy:campaign.survivors[0].binding.strategyId,Version:campaign.survivors[0].binding.strategyVersion,Config:campaign.survivors[0].binding.configVersion,Mode:qualificationProduct,'Qualification evidence':campaign.qualifiedSet.id,Parameters:JSON.stringify(campaign.survivors[0].variant.parameters)}}/>}<button onClick={freezeCampaignWinner} disabled={!qualified} className="rounded bg-emerald-700 px-4 py-2 text-xs font-bold disabled:opacity-40">FREEZE QUALIFIED CONFIGURATION</button>{frozenCandidate&&<Grid values={{Status:'FROZEN','Immutable identity':`${frozenCandidate.strategyId}@${frozenCandidate.strategyVersion}/${frozenCandidate.configVersion}`,'Qualified set':frozenCandidate.qualifiedSetVersion}}/>}<Next href="#stage-forward" enabled={Boolean(frozenCandidate)}>NEXT: FORWARD VALIDATION</Next>
      </Stage>
      <Stage id="forward" number="7" title="FORWARD" purpose="Hand the immutable winner to a certified account for controlled forward observation." state={forwardStarted?'FORWARD':stage(false,Boolean(frozenCandidate))} blocker={!frozenCandidate?'Freeze a qualified configuration first.':!forwardAccountId?'Select a certified execution account.':undefined}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Status label="QUALIFIED" value={qualified?'PASS':'BLOCKED'}/><Status label="FROZEN" value={frozenCandidate?'PASS':'BLOCKED'}/><Status label="ACCOUNT" value={forwardAccountId?'SELECTED':'BLOCKED'}/><Status label="PROVIDER" value="CHECKED ON START"/><Status label="CERTIFICATION" value="CHECKED ON START"/><Status label="PRODUCT / MODE" value={qualificationProduct}/><Status label="RISK ELIGIBILITY" value="CHECKED ON START"/></div><select aria-label="Certified forward account" value={forwardAccountId} onChange={e=>setForwardAccountId(e.target.value)} className="rounded bg-slate-950 px-3 py-2 text-xs"><option value="">Select canonical account</option>{forwardAccounts.map(account=><option key={account.id} value={account.id}>{account.nickname||account.account_number_masked||account.id} · {account.broker||'unknown'} / {account.server||'unknown'}</option>)}</select><div className="flex gap-2 text-[10px]"><span className="rounded bg-cyan-500/10 px-2 py-1 text-cyan-300">FORWARD</span><span className="rounded bg-slate-800 px-2 py-1 text-slate-400">DEMO: NOT STARTED</span><span className="rounded bg-slate-800 px-2 py-1 text-slate-400">LIVE: DISABLED</span></div><button onClick={startFrozenForwardValidation} disabled={!frozenCandidate||!forwardAccountId} className="rounded bg-cyan-700 px-4 py-2 text-xs font-bold disabled:opacity-40">START FORWARD VALIDATION</button>
      </Stage>
      <p className="rounded border border-slate-800 bg-slate-950 p-3 text-xs text-amber-300" aria-live="polite">{status}</p>
    </section>
    <details className="rounded-xl border border-slate-800 bg-slate-950"><summary className="cursor-pointer p-4 text-sm font-bold text-slate-300">ADVANCED RESEARCH · specialist validation tabs, diagnostics, and persisted-run inspection</summary><div className="p-3">
    <section
      className="space-y-4 rounded-xl border border-indigo-500/30 bg-slate-950 p-4"
      data-testid="research-validation-workspace"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold text-white">
            RESEARCH & STRATEGY VALIDATION
          </h2>
          <p className="text-xs text-slate-400">
            Historical evidence is separate from MT5 forward and Real Prop
            truth.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Research run"
            className="rounded border border-slate-700 bg-slate-900 p-2 text-xs text-white"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
          >
            <option value="">Select canonical run</option>
            {source.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-indigo-600 px-3 py-2 text-xs text-white"
            onClick={() => void persist()}
          >
            SAVE ANALYSIS
          </button>
        </div>
      </header>
      <p className="text-xs text-amber-300">{status}</p>
      <div className="flex flex-wrap gap-2 rounded border border-slate-800 p-2" data-testid="raw-canonical-pipeline-controls">
        <select aria-label="Canonical pipeline strategy" value={pipelineStrategy} onChange={(e) => setPipelineStrategy(e.target.value)} className="bg-slate-900 p-2 text-xs text-white">{Object.values(CANONICAL_STRATEGIES).map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.id} · {strategy.status}</option>)}</select>
        <button onClick={runRawPipeline} className="rounded bg-cyan-700 px-3 py-2 text-xs text-white">RUN RAW-BAR CANONICAL PIPELINE</button>
        <span className="self-center text-xs text-slate-400">HistoricalDataService feeds → candidates → arbitration → risk/capital → replay</span>
      </div>
      <nav className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-2 py-1 text-[11px] ${tab === t ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"}`}
          >
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </nav>
      {tab === "CERTIFICATION" && (!run || !analysis) && (
        <div className="rounded border border-indigo-500/30 p-3 space-y-2" data-testid="qualification-campaign-controls">
          <h3 className="text-sm font-semibold text-white">QUALIFICATION CAMPAIGN</h3>
          <p className="text-xs text-slate-400">Qualification consumes the synced raw canonical feeds above; a prior persisted run is not required.</p>
          <div className="flex flex-wrap gap-2 text-xs"><select aria-label="Qualification product" value={qualificationProduct} onChange={(e) => setQualificationProduct(e.target.value as typeof qualificationProduct)} className="bg-slate-900 p-2"><option>PERSONAL</option><option>PROP</option></select><select aria-label="Qualification strategy scope" value={campaignScope} onChange={(e) => setCampaignScope(e.target.value as typeof campaignScope)} className="bg-slate-900 p-2"><option>SELECTED_STRATEGY</option><option>COMPATIBLE_ASSET_CLASS</option></select><select aria-label="Calibration search method" value={searchMethod} onChange={(e) => setSearchMethod(e.target.value as CalibrationSearchMethod)} className="bg-slate-900 p-2"><option>GRID</option><option>RANDOM_SEEDED</option><option>LATIN_HYPERCUBE</option></select><input aria-label="Maximum calibration variants" type="number" min="1" max="500" value={variantLimit} onChange={(e) => setVariantLimit(Math.max(1, Math.min(500, Number(e.target.value))))} className="w-20 bg-slate-900 p-2" /></div>
          <div className="flex flex-wrap gap-2"><button onClick={runQualification} disabled={campaignStatus === "RUNNING"} className="rounded bg-violet-700 px-3 py-2 text-xs disabled:opacity-50">CALIBRATE &amp; QUALIFY</button><button onClick={runQualification} disabled={campaignStatus === "RUNNING"} className="rounded bg-fuchsia-700 px-3 py-2 text-xs disabled:opacity-50">RUN QUALIFICATION CAMPAIGN</button><button onClick={runQualification} disabled={campaignStatus === "RUNNING"} className="rounded bg-indigo-700 px-3 py-2 text-xs disabled:opacity-50">RUN FULL VALIDATION</button><button onClick={() => setTab("COMPARISON")} className="rounded bg-slate-700 px-3 py-2 text-xs">COMPARE VARIANTS</button><button onClick={freezeCampaignWinner} disabled={!campaign?.survivors.length} className="rounded bg-emerald-700 px-3 py-2 text-xs disabled:opacity-50">FREEZE FORWARD CANDIDATE</button></div>
          <div className="mt-2 flex gap-2"><input aria-label="Certified execution account ID" value={forwardAccountId} onChange={(event)=>setForwardAccountId(event.target.value)} placeholder="Certified execution account ID" className="min-w-64 rounded bg-slate-900 px-3 py-2 text-xs"/><button onClick={startFrozenForwardValidation} disabled={!frozenCandidate||!forwardAccountId.trim()} className="rounded bg-cyan-700 px-3 py-2 text-xs disabled:opacity-50">START FORWARD VALIDATION</button></div>
          <Grid values={{ Progress: campaignStatus, "Variants tested": campaign?.variantsTested ?? 0, Eliminated: campaign?.eliminated ?? 0, "Robust survivors": campaign?.survivors.length ?? 0, "Evidence completeness": campaign?.results.length ? `${Math.round(campaign.results.reduce((sum, result) => sum + result.stages.filter((stage) => stage.status === "COMPLETED").length, 0) / (campaign.results.length * 9) * 100)}%` : "0%", Recommendation: campaign?.recommendation ?? "NOT RUN", "Qualified set": campaign?.qualifiedSet.id ?? "NOT CREATED" }} />
          {campaign && <Table headers={["Config", "Stage", "Status", "Research score", "Elimination / thesis"]} rows={campaign.results.map((result) => [result.variant.configVersion, result.stageReached, result.status, result.researchScore, [...result.eliminationReasons, ...result.thesisDiagnostics].join(", ") || "SURVIVED"])} />}
        </div>
      )}
      {!run || !analysis ? (
        <p className="text-sm text-slate-400">
          No canonical completed-trade run selected.
        </p>
      ) : (
        <div className="space-y-4">
          {(tab === "OVERVIEW" || tab === "SINGLE") && (
            <>
              {pipelineResult && <Grid values={{ "Raw pipeline trades": pipelineResult.trades.length, "Raw pipeline rejects": pipelineResult.rejected.length, "Raw pipeline net R": pipelineResult.metrics.netR, "Raw pipeline hash": pipelineResult.runHash }} />}
              <Grid
                values={{
                  Strategy: `${run.strategyId}@${run.strategyVersion}`,
                  Symbols: run.symbols.join(", "),
                  Dataset: run.datasetIds.join(", "),
                  Range: `${run.dateRange.from.slice(0, 10)} → ${run.dateRange.to.slice(0, 10)}`,
                  Trades: analysis.base.trades,
                  "Net R": analysis.base.netR,
                  "Gross R": analysis.base.grossR,
                  "Net PnL": analysis.base.netPnl,
                  "Gross PnL": analysis.base.grossPnl,
                  Costs: analysis.base.costs,
                  "Profit Factor": analysis.base.profitFactor,
                  "Expectancy R": analysis.base.expectancyR,
                  "Max DD R": analysis.base.maxDrawdownR,
                  "Win Rate": `${analysis.base.winRate.toFixed(1)}%`,
                  Ambiguities: analysis.base.ambiguityCount,
                  Quality: analysis.quality.status,
                }}
              />
              <Bars title="Monthly Net R" values={analysis.base.monthly} />
              <Bars
                title="R Distribution"
                values={Object.fromEntries(
                  analysis.base.rDistribution.map((v, i) => [`T${i + 1}`, v]),
                )}
              />
              <p className="text-xs text-amber-300">
                {analysis.base.sampleWarnings.join(", ") ||
                  "No sample-size warnings"}
              </p>
              <Table
                headers={[
                  "Strategy universe",
                  "Version",
                  "Market",
                  "Symbols",
                  "Timeframes",
                  "Status",
                ]}
                rows={Object.values(CANONICAL_STRATEGIES).map((strategy) => [
                  strategy.id,
                  strategy.version,
                  strategy.market,
                  strategy.instruments.join(", "),
                  strategy.requirements.requiredTimeframes.join(", "),
                  strategy.status,
                ])}
              />
            </>
          )}
          {tab === "OOS" && analysis.oos && (
            <>
              <label className="text-xs text-slate-300">
                Training split{" "}
                <select
                  value={split}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  className="ml-2 bg-slate-900 p-1"
                >
                  <option>60</option>
                  <option>70</option>
                  <option>80</option>
                </select>
                %
              </label>
              <Grid
                values={{
                  "IS Trades": analysis.oos.inSample.trades,
                  "IS Net R": analysis.oos.inSample.netR,
                  "IS PF": analysis.oos.inSample.profitFactor,
                  "OOS Trades": analysis.oos.outOfSample.trades,
                  "OOS Net R": analysis.oos.outOfSample.netR,
                  "OOS PF": analysis.oos.outOfSample.profitFactor,
                  "PF Decay": analysis.oos.deterioration.profitFactorDecay,
                  "Expectancy Decay":
                    analysis.oos.deterioration.expectancyDecay,
                  "DD Expansion": analysis.oos.deterioration.drawdownExpansion,
                }}
              />
            </>
          )}
          {tab === "WALK_FORWARD" && (
            <>
              <div className="flex flex-wrap gap-2 text-xs" data-testid="custom-walk-forward-controls">
                <label>Train <input aria-label="Walk-forward training duration" type="number" min="1" value={walkTrain} onChange={(e) => setWalkTrain(Math.max(1, Number(e.target.value)))} className="w-16 bg-slate-900 p-1" /></label>
                <label>Test <input aria-label="Walk-forward test duration" type="number" min="1" value={walkTest} onChange={(e) => setWalkTest(Math.max(1, Number(e.target.value)))} className="w-16 bg-slate-900 p-1" /></label>
                <label>Step <input aria-label="Walk-forward step duration" type="number" min="1" value={walkStep} onChange={(e) => setWalkStep(Math.max(1, Number(e.target.value)))} className="w-16 bg-slate-900 p-1" /></label>
                <select aria-label="Walk-forward duration unit" value={walkUnit} onChange={(e) => setWalkUnit(e.target.value as typeof walkUnit)} className="bg-slate-900 p-1"><option>DAYS</option><option>WEEKS</option><option>MONTHS</option></select>
              </div>
              <Grid
                values={{
                  Windows: analysis.wf.windows.length,
                  "Profitable OOS": analysis.wf.profitableWindows,
                  "Losing OOS": analysis.wf.losingWindows,
                  "Aggregate OOS R": analysis.wf.aggregateOos.netR,
                  "OOS PF": analysis.wf.aggregateOos.profitFactor,
                  Consistency: `${analysis.wf.consistency.toFixed(1)}%`,
                }}
              />
              <Bars
                title="Walk-Forward OOS Net R"
                values={Object.fromEntries(
                  analysis.wf.windows.map((w, i) => [`W${i + 1}`, w.test.netR]),
                )}
              />
            </>
          )}
          {tab === "STRESS" && (
            <Table
              headers={["Scenario", "Net R", "PF", "Expectancy", "Max DD"]}
              rows={analysis.stresses.map((s) => [
                s.scenario,
                s.metrics.netR,
                s.metrics.profitFactor,
                s.metrics.expectancyR,
                s.metrics.maxDrawdownR,
              ])}
            />
          )}
          {tab === "MONTE_CARLO" && (
            <>
              <select
                value={monteCount}
                onChange={(e) => setMonteCount(Number(e.target.value))}
                className="bg-slate-900 p-2 text-xs"
              >
                <option>100</option>
                <option>500</option>
                <option>1000</option>
                <option>5000</option>
              </select>
              <Grid
                values={{
                  Label: analysis.monte.label,
                  Seed: analysis.monte.seed,
                  "Ending R P5": analysis.monte.endingR.p5,
                  "Ending R P50": analysis.monte.endingR.p50,
                  "Ending R P95": analysis.monte.endingR.p95,
                  "Max DD P95": analysis.monte.maxDrawdownR.p95,
                  "Loss Streak P95": analysis.monte.maxLosingStreak.p95,
                  "Breach Frequency": `${(analysis.monte.breachFrequency * 100).toFixed(1)}%`,
                }}
              />
            </>
          )}
          {tab === "MULTI_ASSET" && (
            <>
              <Grid
                values={{
                  Trades: analysis.port.metrics.trades,
                  "Portfolio Net R": analysis.port.metrics.netR,
                  "Portfolio PF": analysis.port.metrics.profitFactor,
                  "Portfolio DD": analysis.port.metrics.maxDrawdownR,
                  "Peak Concurrent": analysis.port.peakConcurrent,
                  Rejects: analysis.port.rejected.length,
                }}
              />
              <Table
                headers={["Rejected Trade", "Reason"]}
                rows={analysis.port.rejected.map((r) => [r.tradeId, r.reason])}
              />
            </>
          )}
          {tab === "PORTFOLIO" && (
            <><Grid values={{ "Accepted canonical trades": analysis.port.trades.length, "Rejected opportunities": analysis.port.rejected.length, "Peak concurrency": analysis.port.peakConcurrent, "Portfolio Net R": analysis.port.metrics.netR }} /><p className="text-xs text-amber-300">Persisted runs use FAST projection. New raw-bar research should use candidate-pipeline-replay/v1 so arbitration and canonical risk/capital occur before outcomes.</p></>
          )}
          {tab === "FAST_PROP" && <p className="text-sm text-slate-300">FAST_PROP_REPLAY sends persisted canonical completed trades to Prop accounting for quick reproducible analysis.</p>}
          {tab === "FULL_PROP_PIPELINE" && <><p className="text-sm text-slate-300">FULL_PROP_PIPELINE_REPLAY evaluates Prop entry state before each raw-bar candidate. Daily locks block subsequent entries, soft guards reduce canonical risk, and management of already accepted trades remains active. Exchange crypto uses the user-configured CUSTOM profile rather than assuming MT5 firm rules.</p><button onClick={runFullProp} className="rounded bg-emerald-700 px-3 py-2 text-xs text-white">RUN FULL PROP EVALUATION · {pipelineStrategy.startsWith("crypto.") ? "CUSTOM CRYPTO" : "FTMO"} $100K</button>{fullPropResult && <Grid values={{ Accepted: fullPropResult.pipeline.trades.length, Blocked: fullPropResult.propDecisions.filter((d) => d.decision === "BLOCK").length, Reduced: fullPropResult.propDecisions.filter((d) => d.decision === "REDUCE").length, "Ending balance": fullPropResult.endingSnapshot.balance }} />}<div className="mt-3 grid grid-cols-3 gap-2"><input aria-label="Challenge starts" type="number" min="1" max="1000" value={rollingAttempts} onChange={event=>setRollingAttempts(Number(event.target.value))} className="bg-slate-900 p-2 text-xs"/><input aria-label="Challenge window days" type="number" min="1" value={rollingWindowDays} onChange={event=>setRollingWindowDays(Number(event.target.value))} className="bg-slate-900 p-2 text-xs"/><input aria-label="Start cadence days" type="number" min="1" value={rollingCadenceDays} onChange={event=>setRollingCadenceDays(Number(event.target.value))} className="bg-slate-900 p-2 text-xs"/></div><button onClick={runRollingProp} className="mt-2 rounded bg-blue-700 px-3 py-2 text-xs text-white">RUN MULTI-CHALLENGE</button>{rollingPropResult&&<Grid values={{"PASS RATE":`${rollingPropResult.historicalPassRate.toFixed(1)}%`,"TIME TO PASS":rollingPropResult.medianDaysToPass??"N/A","FAILURE MODES":Object.keys(rollingPropResult.failureReasons).join(", ")||"NONE","FUNDED SURVIVAL":`${rollingPropResult.fundedSurvivalRate.toFixed(1)}%`,"PAYOUT EVIDENCE":rollingPropResult.payoutEvidenceCount,"BEST/WORST WINDOWS":`${rollingPropResult.bestHistoricalStart?.slice(0,10)} / ${rollingPropResult.worstHistoricalStart?.slice(0,10)}`,"SAMPLE SIZE":rollingPropResult.attemptCount}}/>}</>}
          {tab === "REGIME" && <Table headers={["Timestamp", "Symbol", "Regime", "Timeframe", "Lookback"]} rows={analysis.portfolioPipelineRegimes?.map((r) => [r.timestamp, r.symbol, r.classification, r.sourceTimeframe, r.lookback]) ?? [["Run predates decision-regime/v1", "—", "QUALITY_EVIDENCE_UNAVAILABLE", "—", "—"]]} />}
          {tab === "COMPARISON" && (
            <>
              <select
                aria-label="Comparison sort"
                value={comparisonSort}
                onChange={(event) =>
                  setComparisonSort(event.target.value as "NET_R" | "PF" | "DD")
                }
                className="bg-slate-900 p-2 text-xs"
              >
                <option value="NET_R">Sort: Net R</option>
                <option value="PF">Sort: Profit Factor</option>
                <option value="DD">Sort: Drawdown</option>
              </select>
              <Table
                headers={[
                  "Strategy",
                  "Config",
                  "Trades",
                  "Net R",
                  "PF",
                  "Expectancy",
                  "DD",
                ]}
                rows={[...runs]
                  .sort((a, b) => {
                    const am = metrics(a.trades, a.initialBalance),
                      bm = metrics(b.trades, b.initialBalance);
                    return comparisonSort === "DD"
                      ? am.maxDrawdownR - bm.maxDrawdownR
                      : comparisonSort === "PF"
                        ? (bm.profitFactor ?? 0) - (am.profitFactor ?? 0)
                        : bm.netR - am.netR;
                  })
                  .map((r) => {
                    const m = metrics(r.trades, r.initialBalance);
                    return [
                      r.strategyId,
                      r.configurationVersion,
                      m.trades,
                      m.netR,
                      m.profitFactor,
                      m.expectancyR,
                      m.maxDrawdownR,
                    ];
                  })}
              />
            </>
          )}
          {tab === "PROP_VALIDATION" && (
            <p className="text-sm text-slate-300">
              This canonical run is available directly in Prop Operations for
              Full Challenge, Multi-Challenge, Funded Survival, and simulated
              payout-cycle analysis. Run hash: <code>{run.runHash}</code>.
            </p>
          )}
          {tab === "CERTIFICATION" && (
            <>
              <div className="rounded border border-indigo-500/30 p-3 space-y-2" data-testid="qualification-campaign-controls">
                <h3 className="text-sm font-semibold">QUALIFICATION CAMPAIGN</h3>
                <div className="flex flex-wrap gap-2 text-xs"><select aria-label="Qualification product" value={qualificationProduct} onChange={(e) => setQualificationProduct(e.target.value as typeof qualificationProduct)} className="bg-slate-900 p-2"><option>PERSONAL</option><option>PROP</option></select><select aria-label="Qualification strategy scope" value={campaignScope} onChange={(e) => setCampaignScope(e.target.value as typeof campaignScope)} className="bg-slate-900 p-2"><option>SELECTED_STRATEGY</option><option>COMPATIBLE_ASSET_CLASS</option></select><select aria-label="Calibration search method" value={searchMethod} onChange={(e) => setSearchMethod(e.target.value as CalibrationSearchMethod)} className="bg-slate-900 p-2"><option>GRID</option><option>RANDOM_SEEDED</option><option>LATIN_HYPERCUBE</option></select><input aria-label="Maximum calibration variants" type="number" min="1" max="500" value={variantLimit} onChange={(e) => setVariantLimit(Math.max(1, Math.min(500, Number(e.target.value))))} className="w-20 bg-slate-900 p-2" /></div>
                <div className="flex flex-wrap gap-2"><button onClick={runQualification} disabled={campaignStatus === "RUNNING"} className="rounded bg-violet-700 px-3 py-2 text-xs disabled:opacity-50">CALIBRATE</button><button onClick={runQualification} disabled={campaignStatus === "RUNNING"} className="rounded bg-fuchsia-700 px-3 py-2 text-xs disabled:opacity-50">RUN QUALIFICATION CAMPAIGN</button><button onClick={runQualification} disabled={campaignStatus === "RUNNING"} className="rounded bg-indigo-700 px-3 py-2 text-xs disabled:opacity-50">RUN FULL VALIDATION</button><button onClick={() => setTab("COMPARISON")} className="rounded bg-slate-700 px-3 py-2 text-xs">COMPARE VARIANTS</button><button onClick={freezeCampaignWinner} disabled={!campaign?.survivors.length} className="rounded bg-emerald-700 px-3 py-2 text-xs disabled:opacity-50">FREEZE FORWARD CANDIDATE</button></div>
                <Grid values={{ Progress: campaignStatus, "Variants tested": campaign?.variantsTested ?? 0, Eliminated: campaign?.eliminated ?? 0, "Robust survivors": campaign?.survivors.length ?? 0, "Evidence completeness": campaign?.results.length ? `${Math.round(campaign.results.reduce((sum, result) => sum + result.stages.filter((stage) => stage.status === "COMPLETED").length, 0) / (campaign.results.length * 9) * 100)}%` : "0%", Recommendation: campaign?.recommendation ?? "NOT RUN", "Qualified set": campaign?.qualifiedSet.id ?? "NOT CREATED" }} />
                {campaign && <Table headers={["Config", "Stage", "Status", "Research score", "Elimination / thesis"]} rows={campaign.results.map((result) => [result.variant.configVersion, result.stageReached, result.status, result.researchScore, [...result.eliminationReasons, ...result.thesisDiagnostics].join(", ") || "SURVIVED"])} />}
              </div>
              <Grid
                values={{
                  Backtest: analysis.base.trades ? "COMPLETE" : "INSUFFICIENT",
                  OOS: analysis.oos ? "COMPLETE" : "NOT RUN",
                  "Walk Forward": analysis.wf.windows.length
                    ? "COMPLETE"
                    : "INSUFFICIENT",
                  Stress: "COMPLETE",
                  "Monte Carlo": "COMPLETE",
                  Portfolio: "COMPLETE",
                  "Prop Simulation": "AVAILABLE",
                  "MT5 Forward": "NOT RUN",
                  Certification: analysis.cert?.status ?? "INSUFFICIENT_DATA",
                  Recommendation:
                    analysis.cert?.recommendation ?? "INSUFFICIENT_DATA",
                  Robustness: analysis.robustness.classification,
                }}
              />
              <p className="text-xs text-amber-300">
                RESEARCH POLICY — NOT GUARANTEE ·{" "}
                {analysis.cert?.reasonCodes.join(", ")}
              </p>
              <button
                disabled={
                  analysis.cert?.status !== "FORWARD_VALIDATION_CANDIDATE"
                }
                onClick={freeze}
                className="rounded bg-emerald-700 px-3 py-2 text-xs text-white disabled:opacity-40"
              >
                FREEZE FORWARD CANDIDATE
              </button>
            </>
          )}
          {tab === "TRADES" && (
            <>
              <select
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value)}
                className="bg-slate-900 p-2 text-xs"
              >
                <option>ALL</option>
                <option>WIN</option>
                <option>LOSS</option>
                <option>STOP</option>
                <option>TARGET</option>
                <option>BREAKEVEN</option>
              </select>
              <Table
                headers={[
                  "Closed",
                  "Symbol",
                  "Side",
                  "Entry",
                  "Stop",
                  "Exits",
                  "Net R",
                  "Net PnL",
                  "Fees",
                  "Reason",
                  "Ambiguity",
                  "Provenance",
                ]}
                rows={visible.map((t) => [
                  t.closedAt,
                  t.symbol,
                  t.fill.price >= t.stop ? "LONG" : "SHORT",
                  t.fill.price,
                  t.stop,
                  t.exits.map((e) => `${e.fraction}@${e.price}`).join("; "),
                  t.netR,
                  t.netPnl,
                  t.costs.commission,
                  t.closeReason,
                  t.ambiguity.ambiguousBars,
                  t.provenance,
                ])}
              />
            </>
          )}
          {tab === "FAILURES" && (
            <>
              <Grid
                values={{
                  "Worst Trade R": analysis.base.worstTradeR,
                  "Longest Losing Streak": analysis.base.losingStreak,
                  "Worst Month":
                    Object.entries(analysis.base.monthly)
                      .sort((a, b) => a[1] - b[1])[0]
                      ?.join(": ") ?? "n/a",
                  "Highest Cost": Math.max(
                    0,
                    ...run.trades.map(
                      (t) =>
                        t.costs.spread +
                        t.costs.slippage +
                        t.costs.commission +
                        t.costs.financing,
                    ),
                  ),
                  "Ambiguous Trades": run.trades.filter(
                    (t) => t.ambiguity.ambiguousBars,
                  ).length,
                  "Portfolio Rejects": analysis.port.rejected.length,
                }}
              />
              <Table
                headers={["Group", "Trades", "Net R", "PF", "DD"]}
                rows={Object.entries(analysis.groups.regime).map(([k, m]) => [
                  k,
                  m.trades,
                  m.netR,
                  m.profitFactor,
                  m.maxDrawdownR,
                ])}
              />
              <Table
                headers={["Session", "Trades", "Net R", "PF", "DD"]}
                rows={Object.entries(analysis.groups.session).map(([k, m]) => [
                  k,
                  m.trades,
                  m.netR,
                  m.profitFactor,
                  m.maxDrawdownR,
                ])}
              />
            </>
          )}
        </div>
      )}
    </section></div></details></>);
}
function Stage({id,number,title,purpose,state,blocker,children}:{id:string;number:string;title:string;purpose:string;state:string;blocker?:string;children:ReactNode}){
  const good=['READY','COMPLETE','FORWARD'].includes(state);
  return <article id={`stage-${id}`} className="scroll-mt-20 space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4"><header className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-black text-white"><span className="mr-2 text-indigo-400">{number}</span>{title}</h2><p className="mt-1 text-xs text-slate-400">{purpose}</p></div><span className={`rounded border px-2 py-1 text-[10px] font-bold ${good?'border-emerald-500/30 bg-emerald-500/10 text-emerald-300':'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>{state}</span></header>{blocker&&<p className="rounded bg-amber-500/10 p-2 text-xs text-amber-200">BLOCKER: {blocker}</p>}<div className="space-y-3">{children}</div></article>;
}
function Status({label,value}:{label:string;value:string}){const good=['PASS','COMPLETE','SELECTED'].includes(value);return <div className="rounded border border-slate-800 p-2"><div className="text-[10px] text-slate-500">{label}</div><b className={`text-xs ${good?'text-emerald-300':value==='NOT RUN'?'text-slate-400':'text-amber-300'}`}>{value}</b></div>}
function Next({href,enabled,children}:{href:string;enabled:boolean;children:ReactNode}){return enabled?<a href={href} className="inline-block rounded border border-blue-500/40 px-3 py-2 text-xs font-bold text-blue-300">{children} →</a>:<span className="inline-block rounded border border-slate-800 px-3 py-2 text-xs text-slate-600">{children} · LOCKED</span>}
function Grid({ values }: { values: Record<string, unknown> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {Object.entries(values).map(([k, v]) => (
        <div key={k} className="rounded border border-slate-800 p-2">
          <div className="text-[10px] uppercase text-slate-500">{k}</div>
          <div className="break-words text-sm text-white">
            {v === null
              ? "N/A"
              : typeof v === "number"
                ? Number(v.toFixed(3))
                : String(v)}
          </div>
        </div>
      ))}
    </div>
  );
}
function Bars({
  title,
  values,
}: {
  title: string;
  values: Readonly<Record<string, number>>;
}) {
  const max = Math.max(1, ...Object.values(values).map(Math.abs));
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-white">{title}</h3>
      <div className="flex h-32 items-end gap-1 overflow-x-auto">
        {Object.entries(values).map(([k, v]) => (
          <div
            key={k}
            title={`${k}: ${v.toFixed(2)}`}
            className={`min-w-3 ${v >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
            style={{ height: `${Math.max(2, (Math.abs(v) / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
function Table({ headers, rows }: { headers: string[]; rows: unknown[][] }) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="border-b border-slate-700 p-2 text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td
                  key={j}
                  className="border-b border-slate-900 p-2 text-slate-300"
                >
                  {v === null
                    ? "N/A"
                    : typeof v === "number"
                      ? Number(v.toFixed(3))
                      : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
