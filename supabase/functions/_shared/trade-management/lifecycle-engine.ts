/**
 * HashiBot Unified Trade Management Engine — Core Deterministic Lifecycle Engine
 * Phase 6 Architecture
 */

import {
  calculateRMultiple,
  createTradeLifecycleEvent,
  createTradeLifecycleSnapshot,
  createTradeManagementEvaluation,
  createTradeManagementIntent,
} from "./contracts.ts";
import { evaluateExitPolicy } from "./exit-policy.ts";
import { checkTradeManagementInvariants } from "./invariant-checks.ts";
import { getProviderCapabilities } from "./provider-capabilities.ts";
import { evaluateProtectionState } from "./protection-policy.ts";
import {
  InvariantViolation,
  MarketContext,
  ProviderCapabilities,
  ProviderHealthContext,
  TradeLifecycleEvent,
  TradeLifecycleSnapshot,
  TradeLifecycleState,
  TradeManagementEvaluation,
  TradeManagementIntent,
  TradeManagementPolicy,
} from "./types.ts";
import { ProtectionVerification } from "../professional-protection-verification.ts";

export interface EvaluateLifecycleOptions {
  readonly protection_verification?: ProtectionVerification | null;
  readonly expected_position_version?: number;
  readonly explicit_time?: string;
}

/**
 * Pure, side-effect-free, deterministic evaluation function for trade management.
 */
export function evaluateLifecycle(
  snapshot: TradeLifecycleSnapshot,
  marketContext: MarketContext,
  providerHealth: ProviderHealthContext,
  policy: TradeManagementPolicy,
  capabilities?: ProviderCapabilities,
  currentTime?: string,
  options?: EvaluateLifecycleOptions
): TradeManagementEvaluation {
  const evalTime = currentTime ?? options?.explicit_time ?? new Date().toISOString();
  const activeCapabilities = capabilities ?? getProviderCapabilities(snapshot.provider);

  // 1. Initial Checks for Closed / Archived trades
  if (snapshot.current_lifecycle_state === "CLOSED" || snapshot.current_lifecycle_state === "ARCHIVED") {
    return createTradeManagementEvaluation({
      current_state: snapshot.current_lifecycle_state,
      proposed_next_state: snapshot.current_lifecycle_state,
      intents: [],
      events: [],
      invariant_violations: [],
      explanation: `Position is in terminal state ${snapshot.current_lifecycle_state}; no further lifecycle action required.`,
      evaluation_timestamp: evalTime,
      snapshot,
    });
  }

  // 2. Evaluate Policy-Driven Exit Conditions (Timeout, Weekend, News, Account Lock, Outage)
  const exitEval = evaluateExitPolicy(
    snapshot,
    marketContext,
    providerHealth,
    policy,
    activeCapabilities,
    evalTime
  );

  if (exitEval.exit_required && exitEval.intent) {
    const proposedState = exitEval.intent.requested_lifecycle_state_after;
    const event = createTradeLifecycleEvent({
      trade_id: snapshot.trade_id,
      account_id: snapshot.account_id,
      provider: snapshot.provider,
      position_id: snapshot.trade_id,
      previous_state: snapshot.current_lifecycle_state,
      next_state: proposedState,
      event_type: "EXIT_INTENT_EMITTED",
      reason_code: exitEval.reason_code,
      evidence: exitEval.intent.evidence,
      policy_version: policy.policy_version,
      position_version: snapshot.position_version,
      timestamp: evalTime,
    });

    const invariants = checkTradeManagementInvariants({
      snapshot,
      proposedState,
      intents: [exitEval.intent],
      policy,
      capabilities: activeCapabilities,
      expectedPositionVersion: options?.expected_position_version,
    });

    return createTradeManagementEvaluation({
      current_state: snapshot.current_lifecycle_state,
      proposed_next_state: proposedState,
      intents: [exitEval.intent],
      events: [event],
      invariant_violations: invariants,
      explanation: exitEval.explanation,
      evaluation_timestamp: evalTime,
      snapshot,
    });
  }

  // 3. Protection-First Enforcement
  const protectionEval = evaluateProtectionState(
    snapshot,
    options?.protection_verification ?? null,
    policy,
    activeCapabilities,
    evalTime
  );

  if (protectionEval.protection_state !== "VERIFIED" && snapshot.protection_state !== "VERIFIED") {
    const intents = protectionEval.intent ? [protectionEval.intent] : [];
    const proposedState = protectionEval.proposed_state;

    const events: TradeLifecycleEvent[] = [];
    if (protectionEval.intent) {
      events.push(
        createTradeLifecycleEvent({
          trade_id: snapshot.trade_id,
          account_id: snapshot.account_id,
          provider: snapshot.provider,
          position_id: snapshot.trade_id,
          previous_state: snapshot.current_lifecycle_state,
          next_state: proposedState,
          event_type: "PROTECTION_INTENT_EMITTED",
          reason_code: protectionEval.reason_code,
          evidence: protectionEval.intent.evidence,
          policy_version: policy.policy_version,
          position_version: snapshot.position_version,
          timestamp: evalTime,
        })
      );
    }

    const updatedSnapshot = createTradeLifecycleSnapshot({
      ...snapshot,
      protection_state: protectionEval.protection_state,
      current_lifecycle_state: proposedState,
      last_event_time: evalTime,
    });

    const invariants = checkTradeManagementInvariants({
      snapshot: updatedSnapshot,
      proposedState,
      intents,
      policy,
      capabilities: activeCapabilities,
      expectedPositionVersion: options?.expected_position_version,
    });

    return createTradeManagementEvaluation({
      current_state: snapshot.current_lifecycle_state,
      proposed_next_state: proposedState,
      intents,
      events,
      invariant_violations: invariants,
      explanation: protectionEval.explanation,
      evaluation_timestamp: evalTime,
      snapshot: updatedSnapshot,
    });
  }

  // 4. Position Protection Verified -> Active Trade Lifecycle Evaluation
  const currentR = calculateRMultiple(
    snapshot.average_entry,
    marketContext.current_price,
    snapshot.current_stop,
    snapshot.side
  );

  let currentWorkingState: TradeLifecycleState =
    snapshot.current_lifecycle_state === "FILLED" ||
    snapshot.current_lifecycle_state === "PROTECTION_PENDING" ||
    snapshot.current_lifecycle_state === "PROTECTION_REPAIR_PENDING"
      ? "PROTECTED"
      : snapshot.current_lifecycle_state;

  let tp1State = snapshot.tp1_state;
  let tp2State = snapshot.tp2_state;
  let breakevenState = snapshot.breakeven_state;
  let trailingState = snapshot.trailing_state;
  let currentStop = snapshot.current_stop;

  const intents: TradeManagementIntent[] = [];
  const events: TradeLifecycleEvent[] = [];
  const explanations: string[] = [];

  // A. Take Profit 1 (TP1) Evaluation
  if (policy.tp1_policy.enabled && tp1State === "PENDING") {
    const isTp1Triggered =
      policy.tp1_policy.trigger_mode === "R_MULTIPLE"
        ? currentR >= policy.tp1_policy.trigger_value
        : Math.abs(marketContext.current_price - snapshot.average_entry) / snapshot.average_entry >=
          policy.tp1_policy.trigger_value;

    if (isTp1Triggered) {
      const closeQty = Number(
        Math.min(snapshot.remaining_quantity, snapshot.opened_quantity * policy.tp1_policy.close_fraction).toFixed(8)
      );

      const intent = createTradeManagementIntent({
        intent_type: "PARTIAL_CLOSE",
        account_id: snapshot.account_id,
        provider: snapshot.provider,
        position_id: snapshot.trade_id,
        lifecycle_state_before: currentWorkingState,
        requested_lifecycle_state_after: "TP1",
        policy_id: policy.policy_id,
        policy_version: policy.policy_version,
        reason_code: "TP1_TRIGGERED",
        evidence: { current_r: currentR, target_r: policy.tp1_policy.trigger_value, close_quantity: closeQty },
        created_at: evalTime,
        expected_position_version: snapshot.position_version,
        lifecycle_version: snapshot.lifecycle_version,
        provider_capability_requirements: ["partial_close"],
        parameters: { close_quantity: closeQty, tp_level: 1 },
        trigger_identity: "tp1_trigger",
      });

      intents.push(intent);
      currentWorkingState = "TP1";
      tp1State = "EXECUTED";
      explanations.push(`TP1 triggered at R=${currentR.toFixed(2)} >= ${policy.tp1_policy.trigger_value}R.`);

      events.push(
        createTradeLifecycleEvent({
          trade_id: snapshot.trade_id,
          account_id: snapshot.account_id,
          provider: snapshot.provider,
          position_id: snapshot.trade_id,
          previous_state: snapshot.current_lifecycle_state,
          next_state: "TP1",
          event_type: "TP1_TRIGGERED",
          reason_code: "TP1_TRIGGERED",
          evidence: { close_quantity: closeQty, current_r: currentR },
          policy_version: policy.policy_version,
          position_version: snapshot.position_version,
          timestamp: evalTime,
        })
      );
    }
  }

  // B. Break-Even Evaluation
  if (policy.breakeven_policy.enabled && breakevenState === "INACTIVE") {
    const isBeTriggered =
      policy.breakeven_policy.trigger_mode === "AFTER_TP1"
        ? snapshot.tp1_state === "EXECUTED"
        : policy.breakeven_policy.trigger_mode === "R_MULTIPLE"
        ? currentR >= policy.breakeven_policy.trigger_value
        : Math.abs(marketContext.current_price - snapshot.average_entry) / snapshot.average_entry >=
          policy.breakeven_policy.trigger_value;

    if (isBeTriggered) {
      const offset = snapshot.average_entry * policy.breakeven_policy.profit_lock_offset_pct;
      const targetStop =
        snapshot.side === "BUY"
          ? Number((snapshot.average_entry + offset).toFixed(5))
          : Number((snapshot.average_entry - offset).toFixed(5));

      const intentType = offset > 0 ? "MOVE_STOP_TO_LOCKED_PROFIT" : "MOVE_STOP_TO_BREAK_EVEN";

      const intent = createTradeManagementIntent({
        intent_type: intentType,
        account_id: snapshot.account_id,
        provider: snapshot.provider,
        position_id: snapshot.trade_id,
        lifecycle_state_before: currentWorkingState,
        requested_lifecycle_state_after: "BREAK_EVEN",
        policy_id: policy.policy_id,
        policy_version: policy.policy_version,
        reason_code: "BREAK_EVEN_TRIGGERED",
        evidence: { current_r: currentR, target_stop: targetStop, offset },
        created_at: evalTime,
        expected_position_version: snapshot.position_version,
        lifecycle_version: snapshot.lifecycle_version,
        provider_capability_requirements: ["amend_stop_loss"],
        parameters: { target_stop_price: targetStop },
        trigger_identity: "breakeven_trigger",
      });

      intents.push(intent);
      currentWorkingState = "BREAK_EVEN";
      breakevenState = "TRIGGERED";
      currentStop = targetStop;
      explanations.push(`Break-even triggered; moving stop to ${targetStop}.`);

      events.push(
        createTradeLifecycleEvent({
          trade_id: snapshot.trade_id,
          account_id: snapshot.account_id,
          provider: snapshot.provider,
          position_id: snapshot.trade_id,
          previous_state: snapshot.current_lifecycle_state,
          next_state: "BREAK_EVEN",
          event_type: "BREAK_EVEN_TRIGGERED",
          reason_code: "BREAK_EVEN_TRIGGERED",
          evidence: { target_stop: targetStop },
          policy_version: policy.policy_version,
          position_version: snapshot.position_version,
          timestamp: evalTime,
        })
      );
    }
  }

  // C. Take Profit 2 (TP2) Evaluation
  if (policy.tp2_policy.enabled && tp2State === "PENDING") {
    // Sequenced requirement: TP1 must be executed prior to or during TP2
    const canEvaluateTp2 = !policy.tp1_policy.enabled || tp1State === "EXECUTED";

    if (canEvaluateTp2) {
      const isTp2Triggered =
        policy.tp2_policy.trigger_mode === "R_MULTIPLE"
          ? currentR >= policy.tp2_policy.trigger_value
          : Math.abs(marketContext.current_price - snapshot.average_entry) / snapshot.average_entry >=
            policy.tp2_policy.trigger_value;

      if (isTp2Triggered) {
        const remainingQty = snapshot.remaining_quantity;
        const closeQty = Number(
          Math.min(remainingQty, snapshot.opened_quantity * policy.tp2_policy.close_fraction).toFixed(8)
        );

        const intent = createTradeManagementIntent({
          intent_type: "PARTIAL_CLOSE",
          account_id: snapshot.account_id,
          provider: snapshot.provider,
          position_id: snapshot.trade_id,
          lifecycle_state_before: currentWorkingState,
          requested_lifecycle_state_after: "TP2",
          policy_id: policy.policy_id,
          policy_version: policy.policy_version,
          reason_code: "TP2_TRIGGERED",
          evidence: { current_r: currentR, target_r: policy.tp2_policy.trigger_value, close_quantity: closeQty },
          created_at: evalTime,
          expected_position_version: snapshot.position_version,
          lifecycle_version: snapshot.lifecycle_version,
          provider_capability_requirements: ["partial_close"],
          parameters: { close_quantity: closeQty, tp_level: 2 },
          trigger_identity: "tp2_trigger",
        });

        intents.push(intent);
        currentWorkingState = "TP2";
        tp2State = "EXECUTED";
        explanations.push(`TP2 triggered at R=${currentR.toFixed(2)} >= ${policy.tp2_policy.trigger_value}R.`);

        events.push(
          createTradeLifecycleEvent({
            trade_id: snapshot.trade_id,
            account_id: snapshot.account_id,
            provider: snapshot.provider,
            position_id: snapshot.trade_id,
            previous_state: snapshot.current_lifecycle_state,
            next_state: "TP2",
            event_type: "TP2_TRIGGERED",
            reason_code: "TP2_TRIGGERED",
            evidence: { close_quantity: closeQty, current_r: currentR },
            policy_version: policy.policy_version,
            position_version: snapshot.position_version,
            timestamp: evalTime,
          })
        );
      }
    }
  }

  // D. Trailing Stop & Runner Evaluation
  if (
    policy.trailing_policy.mode !== "OFF" &&
    currentWorkingState !== "TP2" &&
    (!policy.trailing_policy.runner_only || tp1State === "EXECUTED")
  ) {
    const isTrailingActive =
      policy.trailing_policy.activation_mode === "IMMEDIATE" ||
      (policy.trailing_policy.activation_mode === "R_MULTIPLE" &&
        currentR >= policy.trailing_policy.activation_value);

    if (isTrailingActive) {
      let distance = policy.trailing_policy.distance;
      if (policy.trailing_policy.mode === "ATR" && marketContext.atr) {
        distance = marketContext.atr * 1.5;
      } else if (policy.trailing_policy.mode === "PERCENTAGE") {
        distance = marketContext.current_price * policy.trailing_policy.distance;
      }

      const calculatedStop =
        snapshot.side === "BUY"
          ? Number((marketContext.current_price - distance).toFixed(5))
          : Number((marketContext.current_price + distance).toFixed(5));

      const isImprovement =
        currentStop === null ||
        (snapshot.side === "BUY"
          ? calculatedStop >= currentStop + policy.trailing_policy.min_update_distance
          : calculatedStop <= currentStop - policy.trailing_policy.min_update_distance);

      if (isImprovement) {
        const intentType = trailingState === "INACTIVE" ? "START_TRAILING" : "UPDATE_TRAILING_STOP";
        const intent = createTradeManagementIntent({
          intent_type: intentType,
          account_id: snapshot.account_id,
          provider: snapshot.provider,
          position_id: snapshot.trade_id,
          lifecycle_state_before: currentWorkingState,
          requested_lifecycle_state_after: "RUNNER",
          policy_id: policy.policy_id,
          policy_version: policy.policy_version,
          reason_code: "TRAILING_STOP_UPDATE",
          evidence: { current_r: currentR, target_stop: calculatedStop, distance },
          created_at: evalTime,
          expected_position_version: snapshot.position_version,
          lifecycle_version: snapshot.lifecycle_version,
          provider_capability_requirements: ["amend_stop_loss"],
          parameters: { target_stop_price: calculatedStop },
          trigger_identity: `trailing_${calculatedStop}`,
        });

        intents.push(intent);
        currentWorkingState = "RUNNER";
        trailingState = "ACTIVE";
        currentStop = calculatedStop;
        explanations.push(`Trailing stop updated to ${calculatedStop}.`);
      }
    }
  }

  // Final updated snapshot derivation
  const updatedSnapshot = createTradeLifecycleSnapshot({
    ...snapshot,
    current_lifecycle_state: currentWorkingState,
    current_stop: currentStop,
    tp1_state: tp1State,
    tp2_state: tp2State,
    breakeven_state: breakevenState,
    trailing_state: trailingState,
    protection_state: "VERIFIED",
    current_r_multiple: currentR,
    last_event_time: evalTime,
  });

  const invariants = checkTradeManagementInvariants({
    snapshot: updatedSnapshot,
    proposedState: currentWorkingState,
    intents,
    policy,
    capabilities: activeCapabilities,
    expectedPositionVersion: options?.expected_position_version,
  });

  const explanation =
    explanations.length > 0
      ? explanations.join(" ")
      : `Position evaluated cleanly in state ${currentWorkingState}. No active management intent required at R=${currentR.toFixed(2)}.`;

  return createTradeManagementEvaluation({
    current_state: snapshot.current_lifecycle_state,
    proposed_next_state: currentWorkingState,
    intents,
    events,
    invariant_violations: invariants,
    explanation,
    evaluation_timestamp: evalTime,
    snapshot: updatedSnapshot,
  });
}
