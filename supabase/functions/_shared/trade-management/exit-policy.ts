/**
 * HashiBot Unified Trade Management Engine — Exit Policy Evaluation
 * Phase 6 Architecture
 */

import { createTradeManagementIntent } from "./contracts.ts";
import {
  MarketContext,
  ProviderCapabilities,
  ProviderHealthContext,
  TradeLifecycleSnapshot,
  TradeManagementIntent,
  TradeManagementPolicy,
} from "./types.ts";

export interface ExitEvaluationResult {
  readonly exit_required: boolean;
  readonly reason_code: string;
  readonly intent: TradeManagementIntent | null;
  readonly explanation: string;
}

/**
 * Evaluates policy-driven exit conditions such as timeout, weekend, news, and provider outage.
 */
export function evaluateExitPolicy(
  snapshot: TradeLifecycleSnapshot,
  marketContext: MarketContext,
  providerHealth: ProviderHealthContext,
  policy: TradeManagementPolicy,
  capabilities: ProviderCapabilities,
  currentTime: string
): ExitEvaluationResult {
  // If position is already closed or archived, no exit evaluation needed
  if (snapshot.current_lifecycle_state === "CLOSED" || snapshot.current_lifecycle_state === "ARCHIVED") {
    return {
      exit_required: false,
      reason_code: "ALREADY_CLOSED",
      intent: null,
      explanation: "Position is already closed or archived.",
    };
  }

  // 1. Account Hard Lock / Active Lock
  if (snapshot.active_lock) {
    const intent = createTradeManagementIntent({
      intent_type: "EMERGENCY_CLOSE",
      account_id: snapshot.account_id,
      provider: snapshot.provider,
      position_id: snapshot.trade_id,
      lifecycle_state_before: snapshot.current_lifecycle_state,
      requested_lifecycle_state_after: "EMERGENCY_EXIT_PENDING",
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      reason_code: "ACCOUNT_LOCKED_EXIT",
      evidence: { active_lock: snapshot.active_lock },
      created_at: currentTime,
      expected_position_version: snapshot.position_version,
      lifecycle_version: snapshot.lifecycle_version,
      provider_capability_requirements: [],
    });

    return {
      exit_required: true,
      reason_code: "ACCOUNT_LOCKED_EXIT",
      intent,
      explanation: "Account hard risk lock active; emergency exit required.",
    };
  }

  // 2. Maximum Holding Duration Timeout
  const openTimeMs = Date.parse(snapshot.opened_time);
  const currentTimeMs = Date.parse(currentTime);
  const holdingHours = (currentTimeMs - openTimeMs) / (1000 * 60 * 60);

  if (policy.timeout_policy.max_holding_hours > 0 && holdingHours >= policy.timeout_policy.max_holding_hours) {
    const timeoutAction = policy.timeout_policy.action_on_timeout;
    if (timeoutAction !== "NO_ACTION") {
      const intentType = timeoutAction === "EMERGENCY_CLOSE" ? "EMERGENCY_CLOSE" : "CLOSE_POSITION";
      const requestedState = timeoutAction === "EMERGENCY_CLOSE" ? "EMERGENCY_EXIT_PENDING" : "CLOSE_PENDING";

      const intent = createTradeManagementIntent({
        intent_type: intentType,
        account_id: snapshot.account_id,
        provider: snapshot.provider,
        position_id: snapshot.trade_id,
        lifecycle_state_before: snapshot.current_lifecycle_state,
        requested_lifecycle_state_after: requestedState,
        policy_id: policy.policy_id,
        policy_version: policy.policy_version,
        reason_code: "TIMEOUT_EXCEEDED",
        evidence: {
          holding_hours: holdingHours,
          max_holding_hours: policy.timeout_policy.max_holding_hours,
        },
        created_at: currentTime,
        expected_position_version: snapshot.position_version,
        lifecycle_version: snapshot.lifecycle_version,
        provider_capability_requirements: [],
        parameters: { close_quantity: snapshot.remaining_quantity },
      });

      return {
        exit_required: true,
        reason_code: "TIMEOUT_EXCEEDED",
        intent,
        explanation: `Position exceeded maximum holding duration (${holdingHours.toFixed(1)}h >= ${policy.timeout_policy.max_holding_hours}h).`,
      };
    }
  }

  // 3. Weekend Holding Exit (Policy-Gated: only applies when policy.mode !== "ALLOW")
  if (policy.weekend_policy.mode !== "ALLOW" && marketContext.is_weekend) {
    const intent = createTradeManagementIntent({
      intent_type: "CLOSE_POSITION",
      account_id: snapshot.account_id,
      provider: snapshot.provider,
      position_id: snapshot.trade_id,
      lifecycle_state_before: snapshot.current_lifecycle_state,
      requested_lifecycle_state_after: "CLOSE_PENDING",
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      reason_code: "WEEKEND_RESTRICTION_EXIT",
      evidence: {
        is_weekend: marketContext.is_weekend,
        weekend_mode: policy.weekend_policy.mode,
      },
      created_at: currentTime,
      expected_position_version: snapshot.position_version,
      lifecycle_version: snapshot.lifecycle_version,
      provider_capability_requirements: [],
      parameters: { close_quantity: snapshot.remaining_quantity },
    });

    return {
      exit_required: true,
      reason_code: "WEEKEND_RESTRICTION_EXIT",
      intent,
      explanation: "Weekend holding restriction active per policy; closing position before market close.",
    };
  }

  // 4. Economic News Exit (Policy-Gated: only applies when news_policy.mode === "CLOSE_BEFORE_NEWS" and in news window)
  if (policy.news_policy.mode === "CLOSE_BEFORE_NEWS" && marketContext.in_high_impact_news) {
    const intent = createTradeManagementIntent({
      intent_type: "CLOSE_POSITION",
      account_id: snapshot.account_id,
      provider: snapshot.provider,
      position_id: snapshot.trade_id,
      lifecycle_state_before: snapshot.current_lifecycle_state,
      requested_lifecycle_state_after: "CLOSE_PENDING",
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      reason_code: "HIGH_IMPACT_NEWS_EXIT",
      evidence: {
        in_high_impact_news: marketContext.in_high_impact_news,
        news_title: marketContext.news_title ?? null,
      },
      created_at: currentTime,
      expected_position_version: snapshot.position_version,
      lifecycle_version: snapshot.lifecycle_version,
      provider_capability_requirements: [],
      parameters: { close_quantity: snapshot.remaining_quantity },
    });

    return {
      exit_required: true,
      reason_code: "HIGH_IMPACT_NEWS_EXIT",
      intent,
      explanation: "High-impact news window active; policy requires position exit before news event.",
    };
  }

  // 5. Provider Outage / Degraded Health
  if (!providerHealth.is_healthy || providerHealth.bridge_status === "DISCONNECTED") {
    if (policy.provider_outage_policy.action === "MARK_RECOVERY") {
      const intent = createTradeManagementIntent({
        intent_type: "MARK_RECOVERY_REQUIRED",
        account_id: snapshot.account_id,
        provider: snapshot.provider,
        position_id: snapshot.trade_id,
        lifecycle_state_before: snapshot.current_lifecycle_state,
        requested_lifecycle_state_after: "RECOVERY_REQUIRED",
        policy_id: policy.policy_id,
        policy_version: policy.policy_version,
        reason_code: "PROVIDER_OUTAGE_RECOVERY_REQUIRED",
        evidence: {
          bridge_status: providerHealth.bridge_status,
          is_healthy: providerHealth.is_healthy,
        },
        created_at: currentTime,
        expected_position_version: snapshot.position_version,
        lifecycle_version: snapshot.lifecycle_version,
        provider_capability_requirements: [],
      });

      return {
        exit_required: true,
        reason_code: "PROVIDER_OUTAGE_RECOVERY_REQUIRED",
        intent,
        explanation: "Provider connection offline or degraded; marking position for recovery.",
      };
    }
  }

  // No exit condition triggered
  return {
    exit_required: false,
    reason_code: "NO_EXIT_TRIGGERED",
    intent: null,
    explanation: "No policy-driven exit conditions triggered.",
  };
}
