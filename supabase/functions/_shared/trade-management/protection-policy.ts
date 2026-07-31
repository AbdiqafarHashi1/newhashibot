/**
 * HashiBot Unified Trade Management Engine — Protection-First Policy Enforcement
 * Phase 6 Architecture
 */

import {
  ProtectionResult,
  ProtectionVerification,
} from "../professional-protection-verification.ts";
import { createTradeManagementIntent } from "./contracts.ts";
import {
  ProviderCapabilities,
  TradeLifecycleSnapshot,
  TradeLifecycleState,
  TradeManagementIntent,
  TradeManagementPolicy,
} from "./types.ts";

export interface ProtectionEvaluationResult {
  readonly protection_state: "UNVERIFIED" | "VERIFIED" | "FAILED" | "REPAIRING";
  readonly proposed_state: TradeLifecycleState;
  readonly intent: TradeManagementIntent | null;
  readonly reason_code: string;
  readonly explanation: string;
}

/**
 * Evaluates position protection state and determines protection-first intents.
 */
export function evaluateProtectionState(
  snapshot: TradeLifecycleSnapshot,
  protectionVerification: ProtectionVerification | null,
  policy: TradeManagementPolicy,
  capabilities: ProviderCapabilities,
  currentTime: string
): ProtectionEvaluationResult {
  // If position is closed or archived, no protection enforcement needed
  if (snapshot.current_lifecycle_state === "CLOSED" || snapshot.current_lifecycle_state === "ARCHIVED") {
    return {
      protection_state: snapshot.protection_state,
      proposed_state: snapshot.current_lifecycle_state,
      intent: null,
      reason_code: "NO_PROTECTION_REQUIRED_CLOSED",
      explanation: "Position is closed or archived; protection enforcement inactive.",
    };
  }

  // 1. If no protection verification artifact has been performed yet
  if (!protectionVerification) {
    if (snapshot.current_lifecycle_state === "FILLED") {
      const intent = createTradeManagementIntent({
        intent_type: "VERIFY_PROTECTION",
        account_id: snapshot.account_id,
        provider: snapshot.provider,
        position_id: snapshot.trade_id,
        lifecycle_state_before: "FILLED",
        requested_lifecycle_state_after: "PROTECTION_PENDING",
        policy_id: policy.policy_id,
        policy_version: policy.policy_version,
        reason_code: "VERIFY_PROTECTION_REQUESTED",
        evidence: { current_state: snapshot.current_lifecycle_state },
        created_at: currentTime,
        expected_position_version: snapshot.position_version,
        lifecycle_version: snapshot.lifecycle_version,
        provider_capability_requirements: ["protection_query"],
      });

      return {
        protection_state: "UNVERIFIED",
        proposed_state: "PROTECTION_PENDING",
        intent,
        reason_code: "VERIFY_PROTECTION_REQUESTED",
        explanation: "Newly filled position requires protection verification before active management.",
      };
    }
  }

  // 2. Evaluate protection verification artifact result
  const verificationResult: ProtectionResult = protectionVerification
    ? protectionVerification.result
    : snapshot.protection_state === "VERIFIED"
    ? "VERIFIED"
    : "MISSING";

  if (verificationResult === "VERIFIED") {
    const nextState =
      snapshot.current_lifecycle_state === "FILLED" ||
      snapshot.current_lifecycle_state === "PROTECTION_PENDING" ||
      snapshot.current_lifecycle_state === "PROTECTION_REPAIR_PENDING"
        ? "PROTECTED"
        : snapshot.current_lifecycle_state;

    return {
      protection_state: "VERIFIED",
      proposed_state: nextState,
      intent: null,
      reason_code: "PROTECTION_VERIFIED",
      explanation: "Protection is verified. Position is safe for active trade lifecycle management.",
    };
  }

  // 3. Protection is DEGRADED or MISSING or UNVERIFIABLE
  if (!policy.protection_repair_policy.enabled || !capabilities.supports_order_repair) {
    // Cannot repair protection -> Emergency Close or Recovery Required
    const action = policy.emergency_policy.action;
    if (action === "SAFETY_CLOSE") {
      const intent = createTradeManagementIntent({
        intent_type: "EMERGENCY_CLOSE",
        account_id: snapshot.account_id,
        provider: snapshot.provider,
        position_id: snapshot.trade_id,
        lifecycle_state_before: snapshot.current_lifecycle_state,
        requested_lifecycle_state_after: "EMERGENCY_EXIT_PENDING",
        policy_id: policy.policy_id,
        policy_version: policy.policy_version,
        reason_code: "PROTECTION_FAILED_SAFETY_CLOSE",
        evidence: {
          verification_result: verificationResult,
          repair_enabled: policy.protection_repair_policy.enabled,
        },
        created_at: currentTime,
        expected_position_version: snapshot.position_version,
        lifecycle_version: snapshot.lifecycle_version,
        provider_capability_requirements: ["amend_stop_loss"],
      });

      return {
        protection_state: "FAILED",
        proposed_state: "EMERGENCY_EXIT_PENDING",
        intent,
        reason_code: "PROTECTION_FAILED_SAFETY_CLOSE",
        explanation: "Protection verification failed and repair is disabled or unsupported; initiating safety close.",
      };
    } else {
      const intent = createTradeManagementIntent({
        intent_type: "MARK_RECOVERY_REQUIRED",
        account_id: snapshot.account_id,
        provider: snapshot.provider,
        position_id: snapshot.trade_id,
        lifecycle_state_before: snapshot.current_lifecycle_state,
        requested_lifecycle_state_after: "RECOVERY_REQUIRED",
        policy_id: policy.policy_id,
        policy_version: policy.policy_version,
        reason_code: "PROTECTION_FAILED_RECOVERY_REQUIRED",
        evidence: { verification_result: verificationResult },
        created_at: currentTime,
        expected_position_version: snapshot.position_version,
        lifecycle_version: snapshot.lifecycle_version,
        provider_capability_requirements: [],
      });

      return {
        protection_state: "FAILED",
        proposed_state: "RECOVERY_REQUIRED",
        intent,
        reason_code: "PROTECTION_FAILED_RECOVERY_REQUIRED",
        explanation: "Protection verification failed; marking position for recovery framework inspection.",
      };
    }
  }

  // 4. Protection repair is enabled
  const repairIntent = createTradeManagementIntent({
    intent_type: "REPAIR_PROTECTION",
    account_id: snapshot.account_id,
    provider: snapshot.provider,
    position_id: snapshot.trade_id,
    lifecycle_state_before: snapshot.current_lifecycle_state,
    requested_lifecycle_state_after: "PROTECTION_REPAIR_PENDING",
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    reason_code: "PROTECTION_REPAIR_REQUESTED",
    evidence: {
      verification_result: verificationResult,
      missing_coverage: protectionVerification?.coverage,
    },
    created_at: currentTime,
    expected_position_version: snapshot.position_version,
    lifecycle_version: snapshot.lifecycle_version,
    provider_capability_requirements: ["order_repair"],
    parameters: {
      required_stop_quantity: snapshot.remaining_quantity,
      required_tp1_quantity: snapshot.remaining_quantity * policy.tp1_policy.close_fraction,
    },
  });

  return {
    protection_state: "REPAIRING",
    proposed_state: "PROTECTION_REPAIR_PENDING",
    intent: repairIntent,
    reason_code: "PROTECTION_REPAIR_REQUESTED",
    explanation: "Protection is missing or degraded; emitting REPAIR_PROTECTION intent.",
  };
}
