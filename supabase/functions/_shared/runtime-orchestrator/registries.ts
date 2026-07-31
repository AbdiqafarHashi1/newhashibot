/**
 * HashiBot Runtime Orchestrator — Explicit Component Registries
 * Phase 7 Complete Runtime Orchestrator
 *
 * Explicit registries for Execution Brains, Risk Engine, Capital Manager,
 * Unified Trade Management, and Recovery.
 * NO dynamic discovery. NO provider fallback.
 */

import type { BrainProvider, AccountExecutionBrain } from "../account-execution-brain/types.ts";
import { binancePersonalBrain } from "../account-execution-brain/binance-personal-brain.ts";
import { bybitPersonalBrain } from "../account-execution-brain/bybit-personal-brain.ts";
import { mt5PersonalBrain } from "../account-execution-brain/mt5-personal-brain.ts";
import { mt5PropBrain } from "../account-execution-brain/mt5-prop-brain.ts";

import { evaluateRisk, resolveRiskPolicy } from "../professional-risk-engine.ts";
import type { RiskEvaluationContext, ResolvedRiskPolicy, RiskDecision, RiskPolicy } from "../professional-risk-engine.ts";
import type { ApprovedStrategyPlan } from "../strategy-plan.ts";

import { allocateCapital, calculateCapitalManagerPositionPlan } from "../professional-capital-allocation.ts";
import type { CapitalAllocationContext, CapitalAllocationPlan } from "../professional-capital-allocation.ts";

import {
  evaluateTradeLifecycleEngine,
  createDefaultTradeManagementPolicy,
  composeTradeManagementPolicy,
} from "../trade-management/index.ts";
import type {
  TradeManagementPolicy,
  TradeLifecycleSnapshot,
  MarketContext,
  TradeLifecycleEvaluationResult,
} from "../trade-management/types.ts";

import type { RecoveryRequestIntent } from "./types.ts";

// ==========================================
// 1. Execution Brain Registry
// ==========================================
const EXECUTION_BRAIN_REGISTRY: Readonly<Record<BrainProvider, AccountExecutionBrain>> = Object.freeze({
  BINANCE: binancePersonalBrain,
  BYBIT: bybitPersonalBrain,
  MT5_PERSONAL: mt5PersonalBrain,
  MT5_PROP: mt5PropBrain,
});

export function getExecutionBrain(provider: BrainProvider): AccountExecutionBrain {
  const brain = EXECUTION_BRAIN_REGISTRY[provider];
  if (!brain) {
    throw new Error(`ExecutionBrainRegistryError: No registered Execution Brain for provider '${provider}'. Dynamic discovery/fallback is forbidden.`);
  }
  return brain;
}

// ==========================================
// 2. Risk Engine Registry / Interface
// ==========================================
export const RiskEngineRegistry = Object.freeze({
  name: "ProfessionalRiskEngine",
  version: "1.0.0",
  resolvePolicy(policies: readonly RiskPolicy[], domain: BrainProvider): DeepReadonly<ResolvedRiskPolicy> {
    return resolveRiskPolicy(policies, domain);
  },
  evaluate(approved: DeepReadonly<ApprovedStrategyPlan>, context: RiskEvaluationContext, policy: DeepReadonly<ResolvedRiskPolicy>): DeepReadonly<RiskDecision> {
    return evaluateRisk(approved, context, policy);
  },
});

export function getRiskEngine() {
  return RiskEngineRegistry;
}

// ==========================================
// 3. Capital Manager Registry / Interface
// ==========================================
export const CapitalManagerRegistry = Object.freeze({
  name: "ProfessionalCapitalManager",
  version: "1.0.0",
  allocate(context: CapitalAllocationContext): DeepReadonly<CapitalAllocationPlan> {
    return allocateCapital(context);
  },
  calculatePositionPlan(params: Parameters<typeof calculateCapitalManagerPositionPlan>[0]) {
    return calculateCapitalManagerPositionPlan(params);
  },
});

export function getCapitalManager() {
  return CapitalManagerRegistry;
}

// ==========================================
// 4. Unified Trade Management Registry / Interface
// ==========================================
export const UnifiedTradeManagementRegistry = Object.freeze({
  name: "UnifiedTradeManagementSupervisor",
  version: "1.0.0",
  createDefaultPolicy(provider: BrainProvider, accountId: string): TradeManagementPolicy {
    return createDefaultTradeManagementPolicy(provider, accountId);
  },
  composePolicy(base: TradeManagementPolicy, overrides: Partial<TradeManagementPolicy>): TradeManagementPolicy {
    return composeTradeManagementPolicy(base, overrides);
  },
  evaluateLifecycle(
    snapshot: TradeLifecycleSnapshot,
    policy: TradeManagementPolicy,
    marketContext: MarketContext
  ): TradeLifecycleEvaluationResult {
    const providerHealth = {
      is_healthy: true,
      bridge_status: "CONNECTED" as const,
      last_heartbeat_time: new Date().toISOString(),
      error_count_last_hour: 0,
    };
    return evaluateLifecycle(snapshot, marketContext, providerHealth, policy);
  },
});

export function getTradeManagementEngine() {
  return UnifiedTradeManagementRegistry;
}

// ==========================================
// 5. Recovery Registry / Routing Interface
// ==========================================
export const RecoveryRegistry = Object.freeze({
  name: "CanonicalRecoveryEngine",
  version: "1.0.0",
  createRecoveryRequest(params: {
    correlation_id: string;
    causation_id: string;
    provider: BrainProvider;
    account_id: string;
    reason_code: string;
    description: string;
    evidence?: Record<string, unknown>;
    priority?: "HIGH" | "CRITICAL" | "EMERGENCY";
    idempotency_key?: string;
  }): RecoveryRequestIntent {
    const recoveryId = `rec_${params.provider.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return Object.freeze({
      recovery_id: recoveryId,
      correlation_id: params.correlation_id,
      causation_id: params.causation_id,
      provider: params.provider,
      account_id: params.account_id,
      reason_code: params.reason_code,
      description: params.description,
      evidence: Object.freeze({ ...(params.evidence ?? {}) }),
      priority: params.priority ?? "HIGH",
      idempotency_key: params.idempotency_key ?? `idemp_${recoveryId}`,
    });
  },
});

export function getRecoveryHandler() {
  return RecoveryRegistry;
}
