/**
 * HashiBot Runtime Orchestrator — Immutable Contracts & Core Types
 * Phase 7 Complete Runtime Orchestrator
 */

import type { DeepReadonly } from "../strategy-plan.ts";
import type { RiskDecision, RiskEvaluationContext, ResolvedRiskPolicy } from "../professional-risk-engine.ts";
import type { CapitalAllocationContext, CapitalAllocationPlan } from "../professional-capital-allocation.ts";
import type {
  SignalContract,
  AccountExecutionContext,
  AccountPolicy,
  ExecutionDecision,
  PositionPlan,
  BrainProvider,
} from "../account-execution-brain/types.ts";
import type { TradeManagementPolicy, TradeLifecycleSnapshot } from "../trade-management/types.ts";

export type RuntimeState =
  | "RECEIVED"
  | "ACCOUNT_EVALUATED"
  | "RISK_APPROVED"
  | "CAPITAL_ALLOCATED"
  | "PROVIDER_VALIDATED"
  | "READY_FOR_DISPATCH"
  | "LIFECYCLE_INITIALIZED"
  | "COMPLETED"
  | "SKIPPED"
  | "REJECTED"
  | "LOCKED"
  | "RECOVERY_REQUIRED"
  | "FAILED";

export type RuntimeCommandType =
  | "PROCESS_APPROVED_SIGNAL"
  | "EVALUATE_ACCOUNT_HEALTH"
  | "UPDATE_TRADE_LIFECYCLE"
  | "RECONCILE_PROVIDER_STATE"
  | "HANDLE_PROVIDER_ACKNOWLEDGEMENT"
  | "HANDLE_PROVIDER_FILL";

export interface RuntimeCommand {
  readonly command_id: string;
  readonly command_type: RuntimeCommandType;
  readonly correlation_id: string;
  readonly causation_id: string;
  readonly idempotency_key: string;
  readonly aggregate_version: number;
  readonly timestamp: string;
  readonly signal?: SignalContract;
  readonly provider: BrainProvider;
  readonly account_id: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface RuntimeEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly state: RuntimeState;
  readonly correlation_id: string;
  readonly causation_id: string;
  readonly idempotency_key: string;
  readonly aggregate_version: number;
  readonly timestamp: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface RuntimePipelineContext {
  readonly pipeline_id: string;
  readonly correlation_id: string;
  readonly causation_id: string;
  readonly created_at: string;
  readonly provider: BrainProvider;
  readonly account_id: string;
  readonly account_context: AccountExecutionContext;
  readonly account_policy: AccountPolicy;
  readonly risk_evaluation_context?: RiskEvaluationContext;
  readonly resolved_risk_policy?: ResolvedRiskPolicy;
  readonly capital_allocation_context?: CapitalAllocationContext;
  readonly trade_management_policy?: TradeManagementPolicy;
  readonly previous_idempotency_keys?: ReadonlySet<string>;
  readonly previous_aggregate_version?: number;
}

export interface ProviderDispatchIntent {
  readonly intent_id: string;
  readonly correlation_id: string;
  readonly provider: BrainProvider;
  readonly account_id: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly order_type: "MARKET" | "LIMIT" | "STOP";
  readonly quantity: number;
  readonly entry_price: number;
  readonly stop_loss: number;
  readonly take_profit_1: number;
  readonly take_profit_2: number | null;
  readonly leverage: number;
  readonly required_margin: number;
  readonly idempotency_key: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TradeTruthIntent {
  readonly truth_intent_id: string;
  readonly correlation_id: string;
  readonly causation_id: string;
  readonly provider: BrainProvider;
  readonly environment: string;
  readonly account_id: string;
  readonly symbol: string;
  readonly side: "long" | "short";
  readonly status: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotency_key: string;
}

export interface RecoveryRequestIntent {
  readonly recovery_id: string;
  readonly correlation_id: string;
  readonly causation_id: string;
  readonly provider: BrainProvider;
  readonly account_id: string;
  readonly reason_code: string;
  readonly description: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly priority: "HIGH" | "CRITICAL" | "EMERGENCY";
  readonly idempotency_key: string;
}

export interface RuntimePipelineResult {
  readonly pipeline_id: string;
  readonly correlation_id: string;
  readonly status: RuntimeState;
  readonly is_terminal: boolean;
  readonly is_idempotent_duplicate: boolean;
  readonly selected_brain: string;
  readonly execution_decision?: ExecutionDecision;
  readonly risk_decision?: DeepReadonly<RiskDecision>;
  readonly capital_plan?: DeepReadonly<CapitalAllocationPlan> | PositionPlan;
  readonly dispatch_intent?: ProviderDispatchIntent;
  readonly trade_truth_intents: readonly TradeTruthIntent[];
  readonly recovery_intents: readonly RecoveryRequestIntent[];
  readonly audit_events: readonly RuntimeEvent[];
  readonly failure_reason?: string;
  readonly completed_at: string;
}
