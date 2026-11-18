import {portfolioRiskGate} from './portfolio-exposure.ts';
/** Phase D multi-tenant authority. Pure decision code only; it never submits orders. */
import {accountPerformanceGate,type LossResponsePolicy,type AccountPerformanceEvidence} from "./account-performance-policy.ts";
import { decideAccountExecution, type AccountRuntimeControl } from "./account-execution-controller.ts";
import { getExecutionBrain } from "./runtime-orchestrator/registries.ts";
import { composeAccountPolicy } from "./account-execution-brain/contracts.ts";
import type { AccountExecutionContext, AccountPolicy, BrainProvider, SignalContract } from "./account-execution-brain/types.ts";
import type { EligibilityDecision, EligibilityProduct } from "./trading-domain/production-eligibility-router.ts";

export const ACCOUNT_POLICY_AUTHORITY_VERSION = "account-policy-authority/v1" as const;
export type PolicyPreset = "CONSERVATIVE" | "BALANCED" | "GROWTH" | "PROP_SAFE";
export type BrainFamily = "PERSONAL" | "PROP";
export type EntitlementState = "ACTIVE" | "INACTIVE" | "EXPIRED";

export interface OwnedExecutionAccount {
  readonly id: string;
  readonly immutableIdentity: string;
  readonly customerId: string;
  readonly provider: BrainProvider;
  readonly accountType: "PERSONAL" | "PROP_EVALUATION" | "PROP_FUNDED";
  readonly active: boolean;
  readonly executionEnabled: boolean;
  readonly runtimeControl: AccountRuntimeControl;
  readonly policyProfileId: string;
  readonly policyVersion: string;
  /** Opaque reference only. It is deliberately excluded from all authority outputs. */
  readonly credentialRef?: string;
}

export interface PolicyConfiguration {
  readonly historicalPropStudy?: "SIZING_AND_STATIC_20261113";
  readonly historicalStaticBasis?: boolean;
  readonly preset: PolicyPreset;
  readonly lossResponse?: LossResponsePolicy;
  readonly riskPerTradePct?: number;
  readonly maxOpenRiskPct?: number;
  readonly maxCorrelatedRiskPct?: number;
  readonly maxLeverage?: number;
  readonly maxConcurrentPositions?: number;
  readonly maxDailyDrawdownPct?: number;
  readonly maxTotalDrawdownPct?: number;
  readonly allowedSymbols?: readonly string[] | null;
  readonly allowedStrategies?: readonly string[] | null;
  readonly allowedSessions?: readonly string[] | null;
}

export interface AccountEvaluationInput {
  readonly historicalResearch?: true;
  readonly liveAuthorization?: {execution_account_id:string;customer_id:string;expires_at:string;maximum_equity:number;maximum_risk_pct:number};
  readonly signal: SignalContract;
  readonly account: OwnedExecutionAccount;
  readonly context: AccountExecutionContext;
  readonly basePolicy: AccountPolicy;
  readonly configuration: PolicyConfiguration;
  readonly entitlement: { readonly state: EntitlementState; readonly expiresAt: string | null };
  readonly product: EligibilityProduct;
  readonly eligibility: EligibilityDecision;
  readonly evaluatedAt: string;
  /** Loaded by a trusted service from canonical account evidence, never from a customer request. */
  readonly performanceEvidence?: AccountPerformanceEvidence;
  readonly duplicateSignalForAccount?: boolean;
  readonly activeSymbolConflict?: boolean;
}

export interface AccountDecisionRecord {
  readonly authorityVersion: typeof ACCOUNT_POLICY_AUTHORITY_VERSION;
  readonly decisionId: string;
  readonly customerId: string;
  readonly accountId: string;
  readonly immutableAccountIdentity: string;
  readonly signalId: string;
  readonly decision: "ALLOW" | "REDUCE" | "BLOCK" | "LOCK";
  readonly reasonCodes: readonly string[];
  readonly ruleDiagnostics?: readonly Readonly<{ ruleId: string; category: string; severity: string; message: string }>[];
  readonly authorizedRiskPct: number;
  readonly brainFamily: BrainFamily;
  readonly brainProvider: BrainProvider;
  readonly brainVersion: string;
  readonly policyProfileId: string;
  readonly policyVersion: string;
  readonly configuration: Readonly<PolicyConfiguration>;
  readonly evaluatedAt: string;
  readonly executionIntent: null | Readonly<{ intentId: string; accountId: string; customerId: string; signalId: string; approvedQuantity: number; positionPlan: unknown }>;
}

const presetBounds: Readonly<Record<PolicyPreset, Readonly<{ risk: number; open: number; leverage: number; positions: number; daily: number; total: number }>>> = Object.freeze({
  CONSERVATIVE: Object.freeze({ risk: 0.5, open: 2, leverage: 5, positions: 2, daily: 3, total: 8 }),
  BALANCED: Object.freeze({ risk: 1, open: 3, leverage: 10, positions: 4, daily: 5, total: 12 }),
  GROWTH: Object.freeze({ risk: 2, open: 6, leverage: 20, positions: 6, daily: 8, total: 20 }),
  PROP_SAFE: Object.freeze({ risk: 0.5, open: 1.5, leverage: 5, positions: 3, daily: 4, total: 8 }),
});

function stableId(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const char of parts.join("|")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function freezeConfig(config: PolicyConfiguration): Readonly<PolicyConfiguration> {
  return Object.freeze({ ...config, lossResponse:config.lossResponse?Object.freeze({...config.lossResponse}):undefined, allowedSymbols: config.allowedSymbols ? Object.freeze([...config.allowedSymbols]) : config.allowedSymbols, allowedStrategies: config.allowedStrategies ? Object.freeze([...config.allowedStrategies]) : config.allowedStrategies, allowedSessions: config.allowedSessions ? Object.freeze([...config.allowedSessions]) : config.allowedSessions });
}
function bounded(name: string, value: number, maximum: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > maximum) throw new Error(`POLICY_BOUND_VIOLATION:${name}`);
  return value;
}

export function resolveVersionedAccountPolicy(account: OwnedExecutionAccount, base: AccountPolicy, config: PolicyConfiguration, historicalResearch=false): AccountPolicy {
  if (account.policyProfileId !== base.policy_id || account.policyVersion !== base.policy_version) throw new Error("POLICY_LINEAGE_MISMATCH");
  if (account.provider !== base.provider || account.accountType !== base.account_type) throw new Error("POLICY_ACCOUNT_MISMATCH");
  if(historicalResearch&&(account.customerId!=='isolated-research-customer'||!account.immutableIdentity?.startsWith('historical:')))throw Error('ISOLATED_RESEARCH_POLICY_REQUIRED');
  if((config.historicalPropStudy||config.historicalStaticBasis||base.historical_static_loss_basis)&&!historicalResearch)throw Error("ISOLATED_RESEARCH_POLICY_REQUIRED");
  if(config.historicalStaticBasis&&!config.historicalPropStudy)throw Error("EXPLICIT_PROP_STUDY_REQUIRED");
  const declaredLimit = presetBounds[config.preset];
  const limit=historicalResearch&&config.preset==='PROP_SAFE'?{...declaredLimit,risk:1,leverage:10}:declaredLimit;
  const study=historicalResearch&&config.preset==='PROP_SAFE'&&config.historicalPropStudy==='SIZING_AND_STATIC_20261113';
  const cap=study?{risk:2,open:3,leverage:30,positions:3,daily:4.5,total:9}:limit;
  const risk = bounded("riskPerTradePct", config.riskPerTradePct ?? limit.risk, cap.risk);
  const open = bounded("maxOpenRiskPct", config.maxOpenRiskPct ?? limit.open, cap.open);
  bounded("maxCorrelatedRiskPct",config.maxCorrelatedRiskPct??open,open);
  const leverage = bounded("maxLeverage", config.maxLeverage ?? (config.preset === "PROP_SAFE" ? 5 : limit.leverage), cap.leverage);
  const positions = bounded("maxConcurrentPositions", config.maxConcurrentPositions ?? (config.preset === "PROP_SAFE" ? 2 : limit.positions), limit.positions);
  const daily = bounded("maxDailyDrawdownPct", config.maxDailyDrawdownPct ?? limit.daily, cap.daily);
  const total = bounded("maxTotalDrawdownPct", config.maxTotalDrawdownPct ?? limit.total, cap.total);
  if (account.accountType !== "PERSONAL" && config.preset !== "PROP_SAFE") throw new Error("PROP_ACCOUNT_REQUIRES_PROP_SAFE");
  return composeAccountPolicy(base, { historical_static_loss_basis:study&&config.historicalStaticBasis?true:undefined, max_risk_per_trade_pct: risk, max_portfolio_risk_pct: open, max_leverage_allowed: leverage, max_open_positions_total: positions, max_daily_drawdown_pct: daily, max_total_drawdown_pct: total, allowed_symbols: config.allowedSymbols === undefined ? base.allowed_symbols : config.allowedSymbols as string[] | null });
}

/** Canonical signal -> owned account -> entitlement -> mode/policy -> brain -> controller -> intent. */
export function evaluateAccountSignal(input: AccountEvaluationInput): AccountDecisionRecord {
  const signalBefore = JSON.stringify(input.signal);
  if (input.account.customerId !== input.context.user_id || input.account.id !== input.context.account_id || input.account.provider !== input.context.provider || input.account.accountType !== input.context.account_type) throw new Error("ACCOUNT_CONTEXT_OWNERSHIP_MISMATCH");
  const performance=accountPerformanceGate({policy:input.configuration.lossResponse,evidence:input.performanceEvidence,customerId:input.account.customerId,accountId:input.account.id,provider:input.account.provider,evaluatedAt:input.evaluatedAt,dailyDrawdownPct:input.context.daily_drawdown.current_drawdown_pct});
  if(input.historicalResearch&&(input.account.customerId!=='isolated-research-customer'||!input.account.immutableIdentity.startsWith('historical:')||input.context.environment!=='DEMO'))throw Error('ISOLATED_RESEARCH_POLICY_REQUIRED');
  const approvedPolicy = resolveVersionedAccountPolicy(input.account, input.basePolicy, input.configuration,input.historicalResearch===true);
  let policy=performance.riskMultiplier>0&&performance.riskMultiplier<1?composeAccountPolicy(approvedPolicy,{max_risk_per_trade_pct:approvedPolicy.max_risk_per_trade_pct*performance.riskMultiplier}):approvedPolicy;
  if(input.product.endsWith('PROP'))policy=composeAccountPolicy(policy,{max_daily_drawdown_pct:Math.min(policy.max_daily_drawdown_pct,4)});
  const brain = getExecutionBrain(input.account.provider);
  const preReasons: string[] = performance.blocked?[...performance.reasonCodes]:[];
  if(input.context.environment==='LIVE'){
   const p=input.liveAuthorization;if(!p||p.execution_account_id!==input.account.id||p.customer_id!==input.account.customerId||!Number.isFinite(Date.parse(p.expires_at))||Date.parse(p.expires_at)<=Date.parse(input.evaluatedAt)||!Number.isFinite(p.maximum_equity)||p.maximum_equity<=0||input.context.equity>p.maximum_equity||!Number.isFinite(p.maximum_risk_pct)||p.maximum_risk_pct<=0||p.maximum_risk_pct>.25||policy.max_risk_per_trade_pct>p.maximum_risk_pct)preReasons.push('LIVE_ENVIRONMENT_FORBIDDEN');
  }else if(!['DEMO','TESTNET'].includes(input.context.environment))preReasons.push('LIVE_ENVIRONMENT_FORBIDDEN');
  if(![input.context.balance,input.context.equity,input.context.free_margin,input.context.exposure.total_open_risk_pct,input.context.daily_drawdown.current_drawdown_pct,input.context.total_drawdown.current_drawdown_pct].every(x=>Number.isFinite(x)&&x>=0)||input.context.equity<=0)throw new Error('INVALID_ACCOUNT_FINANCIAL_CONTEXT');
  if(!Number.isFinite(Date.parse(input.evaluatedAt))||!Number.isFinite(Date.parse(input.context.updated_at)))throw new Error('INVALID_ACCOUNT_EVIDENCE_TIME');
  if (!input.account.active) preReasons.push("ACCOUNT_INACTIVE");
  if (!input.account.executionEnabled) preReasons.push("LIVE_EXECUTION_DISABLED");
  if (input.entitlement.state !== "ACTIVE") preReasons.push(input.entitlement.state === "EXPIRED" ? "ENTITLEMENT_EXPIRED" : "ENTITLEMENT_INACTIVE");
  if (input.entitlement.expiresAt && (!Number.isFinite(Date.parse(input.entitlement.expiresAt)) || Date.parse(input.entitlement.expiresAt) <= Date.parse(input.evaluatedAt))) preReasons.push("ENTITLEMENT_EXPIRED");
  if (input.configuration.allowedStrategies && !input.configuration.allowedStrategies.includes(input.signal.strategy_id)) preReasons.push("STRATEGY_NOT_ALLOWED");
  if (input.configuration.allowedSessions && !input.configuration.allowedSessions.includes(input.context.session_state.active_session_name)) preReasons.push("SESSION_NOT_ALLOWED");
  const brainDecision = brain.evaluateSignal(input.signal, input.context, policy);
  if(brainDecision.authorized_risk_pct>0){const portfolio=portfolioRiskGate({symbol:input.signal.symbol,positions:input.context.open_positions,requestedRiskPct:brainDecision.authorized_risk_pct,portfolioLimitPct:policy.max_portfolio_risk_pct,correlatedLimitPct:input.configuration.maxCorrelatedRiskPct??policy.max_portfolio_risk_pct});preReasons.push(...portfolio.reasons);}
  const productProvider = input.account.provider;
  const gate = decideAccountExecution({ attempt: "NEW_ENTRY", signalId: input.signal.signal_id, accountId: input.account.id, customerId: input.account.customerId, product: input.product, assignedProvider: productProvider, requestedProvider: productProvider, eligibility: input.eligibility, runtimeControl: input.account.runtimeControl, openPositions: input.context.exposure.active_position_count, pendingOrders: 0, duplicateSignalForAccount: input.duplicateSignalForAccount ?? false, activeSymbolConflict: input.activeSymbolConflict ?? false, canonicalRiskApproved: true, canonicalCapitalApproved: true, accountRuleApproved: preReasons.length === 0 && !["SKIP", "LOCK_ACCOUNT"].includes(brainDecision.decision), propDecision: input.product.endsWith("PROP") ? { decision: brainDecision.decision === "LOCK_ACCOUNT" || brainDecision.decision === "SKIP" ? "BLOCK" : brainDecision.decision === "REDUCE_RISK" ? "REDUCE" : "ALLOW", reasonCodes: [brainDecision.decision_code], riskMultiplier: policy.max_risk_per_trade_pct ? brainDecision.authorized_risk_pct / policy.max_risk_per_trade_pct : 0, managementEnabled: true } : null });
  if (JSON.stringify(input.signal) !== signalBefore) throw new Error("CANONICAL_SIGNAL_MUTATED");
  let decision:AccountDecisionRecord['decision'] = brainDecision.decision === "LOCK_ACCOUNT" ? "LOCK" : gate.decision === "BLOCK" ? "BLOCK" : brainDecision.decision === "REDUCE_RISK" || performance.riskMultiplier<1 ? "REDUCE" : "ALLOW";
  let reasons = Object.freeze([...new Set([...preReasons, ...performance.reasonCodes, ...gate.reasonCodes, brainDecision.decision_code])]);
  const lineage = [input.signal.signal_id, input.account.customerId, input.account.id, input.account.immutableIdentity, input.account.policyProfileId, input.account.policyVersion, brain.brain_version,JSON.stringify(freezeConfig(input.configuration)),JSON.stringify(input.context),JSON.stringify(input.performanceEvidence??null),JSON.stringify(input.entitlement),input.evaluatedAt];
  const positionPlan = decision === "ALLOW" || decision === "REDUCE" ? brain.createPositionPlan(brainDecision, input.signal, input.context, policy) : null;
  if((decision==="ALLOW"||decision==="REDUCE")&&(!positionPlan||!Number.isFinite(positionPlan.quantity)||positionPlan.quantity<=0)){decision='BLOCK';reasons=Object.freeze([...reasons,'APPROVED_POSITION_PLAN_UNAVAILABLE']);}
  return Object.freeze({ authorityVersion: ACCOUNT_POLICY_AUTHORITY_VERSION, decisionId: `decision_${stableId(lineage)}`, customerId: input.account.customerId, accountId: input.account.id, immutableAccountIdentity: input.account.immutableIdentity, signalId: input.signal.signal_id, decision, reasonCodes: reasons, ruleDiagnostics: Object.freeze(brainDecision.rule_violations.map(v=>Object.freeze({ruleId:v.rule_id,category:v.rule_category,severity:v.severity,message:v.message}))), authorizedRiskPct: decision === "ALLOW" || decision === "REDUCE" ? brainDecision.authorized_risk_pct : 0, brainFamily: input.account.accountType === "PERSONAL" ? "PERSONAL" : "PROP", brainProvider: brain.provider, brainVersion: brain.brain_version, policyProfileId: policy.policy_id, policyVersion: policy.policy_version, configuration: freezeConfig(input.configuration), evaluatedAt: input.evaluatedAt, executionIntent: positionPlan && (decision==="ALLOW"||decision==="REDUCE") ? Object.freeze({ intentId: `intent_${stableId([...lineage, "intent"])}`, accountId: input.account.id, customerId: input.account.customerId, signalId: input.signal.signal_id, approvedQuantity: positionPlan.quantity, positionPlan }) : null });
}

/** Safe customer/admin projection; credentials can never enter a read model. */
export function toSafeAccountReadModel(account: OwnedExecutionAccount) {
  const { credentialRef: _secretBoundary, ...safe } = account;
  return Object.freeze({ ...safe });
}

