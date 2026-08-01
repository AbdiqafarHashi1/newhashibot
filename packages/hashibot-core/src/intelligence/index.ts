import type { Evidence, VersionedIdentity } from "../shared.ts";

/** Reservation-only contracts. Phase 11 provides no implementations or registrations. */
export interface IntelligenceContext {observedAt:string;correlationId:string;accountRef:string|null;marketRef:string|null;strategyRef:string|null;truthVersion:number;}
export interface IntelligenceAssessment<T=unknown>{agent:VersionedIdentity;status:"ASSESSED"|"INSUFFICIENT_TRUTH"|"NOT_APPLICABLE";probability:number|null;evidence:readonly Evidence[];recommendation:T|null;}
export interface ReservedIntelligenceAgent<I,O>{readonly identity:VersionedIdentity;assess(input:I,context:IntelligenceContext):Promise<IntelligenceAssessment<O>>;}

export interface OpportunityIntelligenceInput {symbols:readonly string[];timeframes:readonly string[];}
export interface MarketRegimeInput {symbol:string;timeframe:string;marketEvidence:readonly Evidence[];}
export interface StrategyPerformanceInput {strategyIdentity:string;certifiedOutcomes:readonly string[];}
export interface StrategyOptimizationInput {strategyIdentity:string;currentVersion:string;certifiedDatasetRef:string;}
export interface StrategyDiscoveryInput {researchDatasetRef:string;constraints:readonly string[];}
export interface PortfolioAllocationInput {accountRef:string;approvedStrategies:readonly string[];exposureEvidence:readonly Evidence[];}
export interface StrategyGovernorInput {strategyIdentity:string;lifecycle:string;certificationRef:string;}
export interface BacktestingResearchInput {strategyRef:string;datasetRef:string;window:{from:string;to:string};}

export interface PropFirmRuleAwareness {accountRef:string;challengeRules:readonly Evidence[];dailyDrawdownRemaining:number|null;maximumDrawdownRemaining:number|null;targetRemaining:number|null;minimumDaysCompleted:number|null;minimumDaysRequired:number|null;}
export interface PropFirmIntelligenceInput {account:PropFirmRuleAwareness;requestedCoaching:readonly ("DAILY_DRAWDOWN"|"MAX_DRAWDOWN"|"TARGET"|"MINIMUM_DAYS"|"RULE_AWARENESS"|"TELEGRAM")[];}

export type OpportunityIntelligenceAgent=ReservedIntelligenceAgent<OpportunityIntelligenceInput,unknown>;
export type MarketRegimeAgent=ReservedIntelligenceAgent<MarketRegimeInput,unknown>;
export type StrategyPerformanceAgent=ReservedIntelligenceAgent<StrategyPerformanceInput,unknown>;
export type StrategyOptimizationAgent=ReservedIntelligenceAgent<StrategyOptimizationInput,unknown>;
export type StrategyDiscoveryAgent=ReservedIntelligenceAgent<StrategyDiscoveryInput,unknown>;
export type PortfolioAllocationAgent=ReservedIntelligenceAgent<PortfolioAllocationInput,unknown>;
export type StrategyGovernor=ReservedIntelligenceAgent<StrategyGovernorInput,unknown>;
export type BacktestingQuantResearchAgent=ReservedIntelligenceAgent<BacktestingResearchInput,unknown>;
export type PropFirmIntelligenceAgent=ReservedIntelligenceAgent<PropFirmIntelligenceInput,unknown>;

export interface TelegramEnhancementInput {messageContractRef:string;facts:Readonly<Record<string,string|number|boolean|null>>;mode:"AI_SUMMARY"|"INTELLIGENT_FORMATTING"|"COACHING"|"EXPLANATION";}
export type TelegramEnhancementAgent=ReservedIntelligenceAgent<TelegramEnhancementInput,{suggestedContent:string}>;

export interface KnowledgeMemoryQuery {kind:"STRATEGY_HISTORY"|"CERTIFICATION_HISTORY"|"MARKET_MEMORY"|"EXECUTION_LESSONS"|"INCIDENT_KNOWLEDGE"|"OPTIMIZATION_HISTORY";subjectRef:string;asOf:string;}
export interface KnowledgeMemoryRecord {recordRef:string;kind:KnowledgeMemoryQuery["kind"];truthVersion:number;evidence:readonly Evidence[];}
export interface KnowledgeMemoryAgent {readonly identity:VersionedIdentity;recall(query:KnowledgeMemoryQuery,context:IntelligenceContext):Promise<readonly KnowledgeMemoryRecord[]>;propose(record:KnowledgeMemoryRecord,context:IntelligenceContext):Promise<{proposalId:string}>;}

// There is intentionally no registry, factory, default implementation, persistence,
// prompt, model client, coaching behavior, or runtime wiring in Phase 11.
