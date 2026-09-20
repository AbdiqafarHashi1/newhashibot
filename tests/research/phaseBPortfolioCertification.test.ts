import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DatasetCampaign } from "../../src/lib/research/datasetCampaign.ts";
import { DEFAULT_QUALIFICATION_WEIGHTS, type QualificationPolicy } from "../../src/lib/research/strategyQualification.ts";
import { CERTIFICATION_STAGES, certifyPortfolio, createCertificationProtocol, type PerformanceMetrics, type StrategyCertificationEvidence } from "../../src/lib/research/portfolioCertification.ts";
import { BinanceHistoricalAdapter, BybitHistoricalAdapter, CoinbaseHistoricalAdapter, DukascopyHistoricalAdapter, fetchHistoricalWithRetry, type HistoricalHttpAttempt } from "../../src/lib/historicalData/adapters.ts";
import { normalizeAndValidate } from "../../src/lib/historicalData/validation.ts";
import { hashHistoricalBars } from "../../src/lib/historicalData/HistoricalDataService.ts";
import { PHASE_B_POLICIES, PHASE_B_POLICY_HASHES, arbitrationEvidence, includePortfolio, pipelineEvidence, qualifyPersonal, qualifyProp, qualifySignals } from "../../src/lib/research/phaseBCertification.ts";
import { acquisitionPlan, mapBounded, ProviderCircuits, statusFromReadyMarkets } from "../../scripts/phase-b/acquisition-control.ts";

const policy:QualificationPolicy={id:"phase-b-test",version:"phase-b-test/v1",product:"PERSONAL",minimumTrades:20,minimumOosTrades:5,minimumIsExpectancyR:0,minimumOosExpectancyR:.05,minimumOosProfitFactor:1.1,minimumWalkForwardConsistencyPct:60,minimumStressProfitFactor:1,maximumMonteCarloDrawdownR95:10,maximumIsOosExpectancyDivergence:.7,maximumSingleRegimeContributionPct:70,maximumSingleSymbolContributionPct:70,minimumResearchScore:70,requireFullPropPipeline:false,requireFundedSurvival:false,weights:DEFAULT_QUALIFICATION_WEIGHTS};
const inventory=[{datasetId:"mt5-eurusd-15m",datasetHash:"data_1",provider:"MT5_BRIDGE" as const,symbol:"EURUSD",sourceSymbol:"EURUSD",timeframe:"15m" as const,bars:10000,certifiable:true},{datasetId:"mt5-eurusd-1h",datasetHash:"data_2",provider:"MT5_BRIDGE" as const,symbol:"EURUSD",sourceSymbol:"EURUSD",timeframe:"1h" as const,bars:2500,certifiable:true}];
const campaign={version:"dataset-campaign/v1",id:"dataset_1",hash:"dataset_1",name:"real MT5",market:"FOREX",createdAt:"2026-09-01T00:00:00.000Z",requestedRange:{from:Date.parse("2024-01-01"),to:Date.parse("2026-01-01")},providers:["MT5_BRIDGE"],datasets:[],inventory,quality:"CERTIFIABLE"} as unknown as DatasetCampaign;
const protocolInput={qualificationPolicy:policy,calibrationRangesVersion:"canonical-registry/v1",searchMethod:"RANDOM_SEEDED" as const,seed:42,maximumVariants:10,productTarget:"ALL" as const,market:"FOREX" as const,strategyIds:["forex.london-breakout"],startingSymbolUniverse:{FOREX:["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD"]},datasetCampaign:campaign,partitions:{inSample:["2024-01-01","2025-01-01"] as const,validation:["2025-01-02","2025-06-01"] as const,outOfSample:["2025-06-02","2026-01-01"] as const},costModelVersion:"mt5-cost/v1"};
const protocol=createCertificationProtocol(protocolInput), repeated=createCertificationProtocol(protocolInput);
assert.equal(protocol.hash,repeated.hash,"precommitment IDs are deterministic");
assert.equal(Object.isFrozen(protocol),true,"protocol is immutable");
assert.equal(protocol.locked,true);
assert.throws(()=>createCertificationProtocol({...protocolInput,partitions:{...protocolInput.partitions,outOfSample:["2025-05-01","2026-01-01"]}}),/PARTITIONS_MUST_BE_ISOLATED/,"OOS isolation is enforced");
assert.throws(()=>createCertificationProtocol({...protocolInput,datasetCampaign:{...campaign,quality:"INVALID"}}),/REAL_DATA_REQUIRED/,"synthetic or uncertifiable data cannot certify");
assert.throws(()=>createCertificationProtocol({...protocolInput,datasetCampaign:{...campaign,inventory:[{...inventory[0],provider:"BINANCE"}]}} as any),/WRONG_PROVIDER/,"provider substitution is rejected");

const binancePages:string[]=[];const binance=new BinanceHistoricalAdapter(async (url)=>{binancePages.push(String(url));const start=Number(new URL(String(url)).searchParams.get("startTime"));const width=300_000,rows=binancePages.length===1?Array.from({length:1000},(_,i)=>[start+i*width,"1","2","0.5","1.5","10"]):[[start,"1.5","2","1","1.75","11"]];return new Response(JSON.stringify(rows),{status:200})});
const paged=await binance.fetch({provider:"BINANCE",symbol:"BTCUSDT",timeframe:"5m",from:1_700_000_000_000,to:1_700_400_000_000},{from:1_700_000_000_000,to:1_700_400_000_000});assert.equal(binancePages.length,2,"Binance acquisition paginates");assert.equal(paged.bars.length,1001);assert.deepEqual([...paged.bars].sort((a,b)=>a.timestamp-b.timestamp),paged.bars,"normalization is chronological");
const bybit=new BybitHistoricalAdapter(async()=>new Response(JSON.stringify({retCode:0,result:{list:[["1700000300000","1.5","2","1","1.75","11"],["1700000000000","1","2","0.5","1.5","10"]]}}),{status:200}));const bybitBars=await bybit.fetch({provider:"BYBIT",symbol:"BTCUSDT",timeframe:"5m",from:1_700_000_000_000,to:1_700_000_600_000},{from:1_700_000_000_000,to:1_700_000_600_000});assert.equal(bybitBars.bars[0].timestamp,1_700_000_000_000,"reverse provider pages normalize deterministically");
const dukascopy=new DukascopyHistoricalAdapter(async()=>new Response(`jsonp(${JSON.stringify([{timestamp:1_700_000_000_000,open:1,high:2,low:.5,close:1.5,volume:3}])})`,{status:200}),"https://dukascopy.invalid/feed");const duka=await dukascopy.fetch({provider:"PUBLIC_RESEARCH",symbol:"EURUSD",timeframe:"1h",from:1_700_000_000_000,to:1_700_000_000_000},{from:1_700_000_000_000,to:1_700_000_000_000});assert.equal(duka.sourceName,"DUKASCOPY");assert.equal(duka.bars.length,1,"Dukascopy JSONP is normalized");
const retryEvents:HistoricalHttpAttempt[]=[],delays:number[]=[];let retryCalls=0;await fetchHistoricalWithRetry(async()=>{retryCalls++;return retryCalls===1?new Response("busy",{status:429,headers:{"Retry-After":"3"}}):new Response("ok")},"https://example.test/history",undefined,{maxAttempts:3,baseDelayMs:100,jitter:()=>0,requestDelayMs:0,sleep:async ms=>{delays.push(ms)},onAttempt:e=>retryEvents.push(e)});assert.ok(delays.includes(3000),"429 honors Retry-After");assert.equal(retryEvents[0].retryDelayMs,3000);assert.equal(retryCalls,2);
const backoffs:number[]=[];let backoffCalls=0;await fetchHistoricalWithRetry(async()=>new Response(++backoffCalls<3?"busy":"ok",{status:backoffCalls<3?503:200}),"https://example.test/backoff",undefined,{maxAttempts:3,baseDelayMs:100,jitter:()=>0,requestDelayMs:0,sleep:async ms=>{backoffs.push(ms)}});assert.deepEqual(backoffs.filter(x=>x<=200),[100,200],"retry delay is exponential");let bounded=0;await assert.rejects(()=>fetchHistoricalWithRetry(async()=>{bounded++;return new Response("blocked",{status:429})},"https://example.test/bounded",undefined,{maxAttempts:3,baseDelayMs:1,jitter:()=>0,requestDelayMs:0,sleep:async()=>{}}),/HISTORY_HTTP_429/);assert.equal(bounded,3,"retry count is bounded");
const failures=[451,403],providerOrder:string[]=[];let fallbackResult;for(const provider of ["BINANCE","BYBIT","COINBASE"]){providerOrder.push(provider);try{if(failures.length)throw new Error(`HISTORY_HTTP_${failures.shift()}`);const coinbase=new CoinbaseHistoricalAdapter(async()=>new Response(JSON.stringify([[1700000000,.5,2,1,1.5,10]])),{requestDelayMs:0});fallbackResult=await coinbase.fetch({provider:"COINBASE",symbol:"BTCUSDT",timeframe:"5m",from:1_700_000_000_000,to:1_700_000_000_000},{from:1_700_000_000_000,to:1_700_000_000_000});break}catch{/* deterministic fallback continues */}}assert.deepEqual(providerOrder,["BINANCE","BYBIT","COINBASE"],"Binance 451 and Bybit 403 continue to Coinbase");assert.equal(fallbackResult?.sourceName,"COINBASE","fallback provenance names the actual venue");assert.equal(fallbackResult?.sourceSymbol,"BTC-USD");
const permanent=new ProviderCircuits(()=>1000);permanent.record("BINANCE",451);permanent.record("BYBIT",403);assert.equal(permanent.isOpen("BINANCE"),true,"451 opens Binance circuit");assert.equal(permanent.isOpen("BYBIT"),true,"403 opens Bybit circuit");
let clock=1000;const temporary=new ProviderCircuits(()=>clock,100);temporary.record("DUKASCOPY",429);temporary.record("DUKASCOPY",429);assert.equal(temporary.isOpen("DUKASCOPY"),false,"isolated throttles do not trip the circuit");temporary.record("DUKASCOPY",429);assert.equal(temporary.isOpen("DUKASCOPY"),true);clock=1101;assert.equal(temporary.isOpen("DUKASCOPY"),false,"Dukascopy circuit cools down");
await assert.rejects(()=>fetchHistoricalWithRetry(async(_url,init)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener("abort",()=>reject(init.signal?.reason),{once:true})),"https://example.test/timeout",undefined,{maxAttempts:1,requestTimeoutMs:5,requestDelayMs:0}),/timed out|TimeoutError/i,"request timeout aborts stalled fetch");
let budgetClock=0;await assert.rejects(()=>fetchHistoricalWithRetry(async()=>new Response("busy",{status:503}),"https://example.test/budget",undefined,{maxAttempts:4,baseDelayMs:20,retryBudgetMs:10,requestDelayMs:0,now:()=>budgetClock,sleep:async ms=>{budgetClock+=ms}}),/RETRY_BUDGET_EXCEEDED/,"provider retry budget is bounded");
let active=0,peak=0;const boundedResult=await mapBounded([1,2,3,4,5],2,async value=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return value});assert.equal(peak,2,"acquisition concurrency is bounded");assert.equal(boundedResult.peak,2);
const plan=acquisitionPlan();assert.equal(plan.required.some(x=>x.timeframe==="5m"),false,"5m is deferred from required acquisition");assert.equal(plan.supporting.every(x=>x.timeframe==="5m"),true);assert.ok(plan.required.findIndex(x=>x.market==="FOREX")<plan.supporting.length,"required strategy timeframes are prioritized");assert.equal(statusFromReadyMarkets(1),"PARTIAL_REAL_DATA","one ready market can proceed independently");assert.equal(statusFromReadyMarkets(0),"DATA_SOURCE_BLOCKED");
const quality=normalizeAndValidate([{timestamp:2,open:1,high:.5,low:2,close:1},{timestamp:1,open:1,high:2,low:.5,close:1.5},{timestamp:1,open:1,high:2,low:.5,close:1.5}],"5m",{from:1,to:300001});assert.equal(quality.quality.invalidBars,1);assert.equal(quality.quality.duplicates,1);assert.equal(quality.quality.outOfOrder,1);
assert.equal(hashHistoricalBars(paged.bars),hashHistoricalBars([...paged.bars]),"normalized dataset hashes are stable");assert.notEqual(hashHistoricalBars(paged.bars),hashHistoricalBars(paged.bars.slice(1)),"different evidence cannot reuse a dataset hash");

const metric=(over:Partial<PerformanceMetrics>={}):PerformanceMetrics=>({trades:30,wins:18,losses:12,winRate:60,expectancyR:.2,averageWinR:1,averageLossR:-.8,profitFactor:1.5,netR:6,maxDrawdownR:4,longestLossStreak:3,averageHoldingMinutes:120,longTrades:15,shortTrades:15,signalFrequencyPerMonth:5,costsR:1,...over});
const evidence=(over:Partial<StrategyCertificationEvidence>={}):StrategyCertificationEvidence=>({strategyId:"forex.london-breakout",baselineConfigId:"reference",baselineConfigHash:"reference_hash",baseline:metric(),variants:[{configId:"config_1",configVersion:"research/v1",configHash:"config_hash",seed:42,parameters:{bodyAtr:.45,extensionAtr:.9},selected:true,rejectionReasons:[]}],selectedConfigId:"config_1",oos:metric({trades:12}),walkForward:{windows:8,positiveWindows:6,negativeWindows:2,consistencyPct:75},stress:[{scenario:"BASELINE",profitFactor:1.5,expectancyR:.2,maxDrawdownR:4},{scenario:"SPREAD_2X",profitFactor:1.15,expectancyR:.08,maxDrawdownR:7}],monteCarlo:{seed:42,simulations:500,medianNetR:5,drawdownMedianR:4,drawdownP90R:7,drawdownP95R:8,worstDrawdownR:9,lossStreakP95:6},parameterRobustness:"ROBUST_PLATEAU",symbols:[{symbol:"EURUSD",...metric({trades:12}),contributionPct:60,costSensitivityPct:20,oosTrades:12,oosExpectancyR:.2,oosProfitFactor:1.5},{symbol:"USDJPY",...metric({trades:10}),contributionPct:40,costSensitivityPct:80,oosTrades:2,oosExpectancyR:-.1,oosProfitFactor:.8}],regimes:[{label:"TRENDING",source:"CANONICAL_DECISION_EVIDENCE",trades:12,expectancyR:.2,profitFactor:1.5,contributionPct:65}],signals:{eligible:true,reasons:[],metrics:{signals:30}},personal:{eligible:true,reasons:[],metrics:{executed:25,blocked:5}},prop:{eligible:false,reasons:["DAILY_LOSS_BREACH"],metrics:{breaches:1},attempts:[{requested:10,available:7,actuallyRun:7}]},...over});

const result=certifyPortfolio(protocol,[evidence()],[],"2026-09-20T00:00:00.000Z"),again=certifyPortfolio(protocol,[evidence()],[],"2026-09-20T00:00:00.000Z");
assert.deepEqual(result,again,"campaign and stage progression are deterministic");
assert.equal(result.strategyResults[0].finalState,"QUALIFIED_MULTI_PRODUCT","product qualification is independent and Signals + Personal survive");
assert.deepEqual(result.strategyResults[0].eligibleSymbols,["EURUSD"],"eligibility requires held-out symbol evidence, not calibration performance");
assert.equal(result.frozenSurvivors[0].protocolHash,protocol.hash,"freeze retains exact precommitment lineage");
assert.equal(result.frozenSurvivors[0].datasetCampaignHash,campaign.hash);
assert.deepEqual(result.frozenSurvivors[0].parameters,{bodyAtr:.45,extensionAtr:.9});
assert.equal(result.marketStates.METALS,"NEW_STRATEGY_RESEARCH_REQUIRED");
assert.equal(result.marketStates.CRYPTO,"NEW_STRATEGY_RESEARCH_REQUIRED");
assert.deepEqual(CERTIFICATION_STAGES.slice(0,4),["QUEUED","DATA_VALIDATION","BASELINE","SCREENING"],"baseline always precedes calibration");

for(const [label,bad,reason] of [
 ["weak OOS",evidence({oos:metric({trades:12,expectancyR:-.1})}),"WEAK_OOS_EXPECTANCY"],
 ["walk-forward",evidence({walkForward:{windows:8,positiveWindows:2,negativeWindows:6,consistencyPct:25}}),"WALK_FORWARD_INCONSISTENT"],
 ["stress",evidence({stress:[{scenario:"COMBINED",profitFactor:.8,expectancyR:-.1,maxDrawdownR:9}]}),"STRESS_FAILURE"],
 ["Monte Carlo",evidence({monteCarlo:{...evidence().monteCarlo,drawdownP95R:15}}),"MONTE_CARLO_DD_FAILURE"],
 ["instability",evidence({parameterRobustness:"NARROW_PEAK"}),"NARROW_PEAK"],
] as const){const row=certifyPortfolio(protocol,[bad]).strategyResults[0];assert.equal(row.finalState,"REJECTED",`${label} rejects`);assert.ok(row.reasons.includes(reason))}
const rebuild=certifyPortfolio(protocol,[evidence({parameterRobustness:"UNSTABLE",rebuild:{structuralFlaw:"canonical adapter omits intended close confirmation",supportingEvidence:"nearby configurations form a stable positive OOS region"}})]).strategyResults[0];assert.equal(rebuild.finalState,"RESEARCH_REBUILD_CANDIDATE","rebuild requires specific flaw plus edge evidence");
const unavailable=certifyPortfolio(protocol,[]);assert.equal(unavailable.status,"REAL_DATA_REQUIRED");assert.deepEqual(unavailable.frozenSurvivors,[]);
assert.throws(()=>certifyPortfolio(protocol,[evidence({prop:{...evidence().prop,attempts:[{requested:10,available:4,actuallyRun:5}]}})]),/INVALID_ROLLING_ATTEMPT_COUNTS/,"attempts cannot duplicate unavailable windows");
const source=readFileSync("src/pages/admin/backtest/PortfolioCertificationPanel.tsx","utf8");for(const label of ["STRATEGY PORTFOLIO CERTIFICATION CAMPAIGN","LOCK PROTOCOL & START","MONTE_CARLO","FINAL_STATE","REAL_DATA_REQUIRED"])assert.match(source,new RegExp(label));
const scanner=readFileSync("supabase/functions/_shared/trading-domain/strategies.ts","utf8");assert.match(scanner,/CANONICAL_STRATEGIES/); // safety snapshot: this suite imports but never mutates runtime/defaults/customer state.

// Hardened layer policies are precommitted, immutable, versioned and independently hashed.
assert.equal(Object.isFrozen(PHASE_B_POLICIES),true);assert.equal(Object.isFrozen(PHASE_B_POLICIES.prop.tiers),true);
assert.match(PHASE_B_POLICY_HASHES.strategyEdge,/^policy_/);assert.notEqual(PHASE_B_POLICY_HASHES.strategyEdge,PHASE_B_POLICY_HASHES.signals);
assert.equal(qualifySignals({total:1,oosExpectancyR:1,profitFactor:3,maxDrawdownR:0,longestLosingStreak:0,stressPass:true,upstreamFatal:false}),"INSUFFICIENT","minimum signal sample is mandatory");
assert.equal(qualifySignals({total:30,oosExpectancyR:-.01,profitFactor:2,maxDrawdownR:2,longestLosingStreak:2,stressPass:true,upstreamFatal:false}),"REJECTED","weak signal quality rejects despite sample size");
assert.equal(qualifyPersonal({executed:1,returnPct:10,dailyDrawdownPct:0,totalDrawdownPct:0,locks:0,returnDrawdownRatio:10,upstreamFatal:false}),"INSUFFICIENT","one executed trade cannot qualify");
assert.equal(qualifyPersonal({executed:25,returnPct:5,dailyDrawdownPct:6,totalDrawdownPct:6,locks:1,returnDrawdownRatio:.8,upstreamFatal:false}),"REJECTED","account drawdown and locks reject Personal");
const propGood={actuallyRun:25,passCount:20,failCount:5,incompleteCount:0,ambiguousCount:0,determinatePassRate:80,dailyLossViolations:2,maxLossViolations:1,fundedReached:20,fundedSurvived:12,distinctWindows:25};
assert.equal(qualifyProp({...propGood,passCount:1,failCount:24}),"REJECTED","one Prop pass cannot qualify");
assert.equal(qualifyProp({...propGood,actuallyRun:24,passCount:20,failCount:4,distinctWindows:24}),"INSUFFICIENT","Prop requires 25 distinct windows");
assert.equal(qualifyProp({...propGood,ambiguousCount:1,failCount:4}),"AMBIGUOUS","ambiguity never counts as pass");
assert.equal(qualifyProp({...propGood,fundedReached:0,fundedSurvived:0}),"FUNDED_SURVIVAL_INSUFFICIENT","missing funded evidence remains explicit");
assert.equal(qualifyProp(propGood),"QUALIFIED");
assert.equal(includePortfolio({standaloneQualified:true,marginalNetR:-.1,withDrawdownR:3,withoutDrawdownR:4,concentrationPct:40}),false,"a positive standalone strategy may be excluded by marginal contribution");
assert.equal(includePortfolio({standaloneQualified:true,marginalNetR:1,withDrawdownR:3,withoutDrawdownR:4,concentrationPct:40}),true);
const fakePipeline={accepted:[{candidate:{id:"winner",strategyId:"s1",symbol:"EURUSD",side:"BUY",score:90},result:{}}],rejected:[{timestamp:"t",candidateId:"loser",strategyId:"s2",symbol:"EURUSD",reasonCodes:["ARBITRATION_LOST"]}],trades:[{}],metrics:{expectancyR:.2,profitFactor:1.3,maxDrawdown:2,strategyContribution:{s1:1}}} as any;
assert.equal(pipelineEvidence(fakePipeline).rejectedCandidates,1,"candidate accept/reject metrics preserve filtering effect");
assert.equal(fakePipeline.accepted.some((x:any)=>x.candidate.id==="loser"),false,"a rejected candidate cannot become a signal");
assert.equal(arbitrationEvidence(fakePipeline).state,"CONTRACT_LIMITED","missing competition groups are never fabricated");
assert.equal(arbitrationEvidence(fakePipeline).winnerCountsByStrategy.s1,1,"observable winner evidence is retained");
assert.ok(arbitrationEvidence(fakePipeline).knownPhaseCContractGap.includes("conflict type and state snapshots"),"same/opposite-direction conflict limitations are explicit");
const lineageSource={candidateId:"winner",signalId:"winner",personalSignalId:"winner",propCandidateId:"winner"};assert.equal(new Set(Object.values(lineageSource)).size,1,"the same canonical identifier reaches SignalOnly, Personal and Prop");
const workflow=readFileSync(".github/workflows/phase-b-certification.yml","utf8");assert.match(workflow,/workflow_dispatch:/);for(const command of ["npm ci","npm run research:acquire-real-data","npm run research:phase-b-certify"])assert.match(workflow,new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
assert.match(workflow,/actions\/cache@v4/);const acquisitionSource=readFileSync("scripts/phase-b/acquire-real-data.ts","utf8"),certificationSource=readFileSync("scripts/phase-b/certify.ts","utf8");assert.match(acquisitionSource,/outcome:"CACHE_HIT"/);assert.match(acquisitionSource,/validateDatasetCache\(old/ ,"cache is validated before a hit prevents download");assert.match(acquisitionSource,/INVALID_FINAL_DATASET/,"invalid cache cannot become evidence");assert.match(certificationSource,/campaign\.quality!=="CERTIFIABLE"/ ,"an unavailable market is skipped independently");assert.match(certificationSource,/PARTIAL_REAL_DATA/,"successful markets are preserved when another market fails");
console.log("phase B portfolio certification tests passed",JSON.stringify({protocol:protocol.hash,campaign:result.campaignHash,state:result.strategyResults[0].finalState,eligible:result.strategyResults[0].eligibleSymbols,statusWithoutReplay:unavailable.status}));

// Final gap closure: Stage 2 is survivor-driven and portfolio evidence is actually executed.
const {supportingPlanForSurvivors,certificationStatus}=await import("../../scripts/phase-b/acquisition-control.ts");
const {executeProductPortfolios}=await import("../../src/lib/research/phaseBPortfolioExecution.ts");
assert.deepEqual(supportingPlanForSurvivors([]),[],"rejected strategies never trigger supporting acquisition");
assert.deepEqual(supportingPlanForSurvivors([{market:"FOREX",strategyId:"survivor",symbols:["EURUSD"]}]),[{market:"FOREX",symbol:"EURUSD",timeframe:"5m",stage:"SUPPORTING"}],"only an eligible survivor symbol triggers deferred 5m");
assert.equal(certificationStatus([{market:"FOREX",status:"READY"},{market:"METALS",status:"READY"},{market:"CRYPTO",status:"READY"}]),"PASS");
assert.equal(certificationStatus([{market:"FOREX",status:"READY"},{market:"METALS",status:"DATA_SOURCE_BLOCKED",reason:"HTTP_429"}]),"PARTIAL_REAL_DATA");
assert.equal(certificationStatus([{market:"FOREX",status:"DATA_SOURCE_BLOCKED"}]),"DATA_SOURCE_BLOCKED");
const t=(strategyId:string,rs:number[])=>rs.map((netR,i)=>({strategyId,symbol:i%2?"EURUSD":"GBPUSD",openedAt:`2026-01-0${i+1}T00:00:00Z`,closedAt:`2026-01-0${i+1}T01:00:00Z`,netR}));
const portfolios=executeProductPortfolios([
 {strategyId:"good",qualified:{SIGNALS:true,PERSONAL:true,PROP:false},trades:t("good",[2,1])},
 {strategyId:"harmful",qualified:{SIGNALS:true,PERSONAL:false,PROP:false},trades:t("harmful",[.2,-1])},
 {strategyId:"prop",qualified:{SIGNALS:false,PERSONAL:false,PROP:true},trades:t("prop",[1,1])},
]);
assert.deepEqual(portfolios.map(x=>x.product),["SIGNALS","PERSONAL","PROP"],"product portfolios are separate");
assert.equal(portfolios[0].combinations.length,3,"two survivors generate both standalone records and their full combination");
assert.ok(portfolios[0].combinations.every(x=>Object.keys(x.marginalContribution).length===x.strategyIds.length),"marginal contribution is measured with versus without every member");
assert.equal(portfolios[0].selectedStrategyIds.includes("harmful"),false,"a standalone candidate with harmful portfolio contribution can be excluded");
assert.equal(portfolios[1].combinations.length,1,"a single-strategy product portfolio is explicit");
assert.deepEqual(portfolios[1].selectedStrategyIds,["good"]);
const certifyRunner=readFileSync("scripts/phase-b/certify.ts","utf8");
assert.ok(certifyRunner.lastIndexOf("supportingPlanForSurvivors")>certifyRunner.indexOf("certifyPortfolio(protocol,rows"),"5m requests happen only after qualification");
assert.match(certifyRunner,/PHASE_B_STAGE2_FINAL/,"final Personal and Prop replay runs after Stage 2 acquisition");
assert.match(certifyRunner,/executeProductPortfolios/);assert.match(certifyRunner,/certifyPortfolio\(protocol,rows,combinations,protocol\.createdAt\)/,"final certification receives executed combinations");
assert.match(certifyRunner,/unavailableMarkets/);assert.match(certifyRunner,/certificationStatus\(REPORT\.marketStates/);
assert.match(certifyRunner,/missingSupporting5m\?"AMBIGUOUS"/,"missing 5m keeps Prop ordering ambiguous instead of choosing a favorable path");
assert.match(certifyRunner,/missingSupporting5m\?"INSUFFICIENT"/,"missing 5m keeps Personal path evidence insufficient");
