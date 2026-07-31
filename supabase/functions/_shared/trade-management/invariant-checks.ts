/**
 * HashiBot Unified Trade Management Engine — Invariant Verification
 * Phase 6 Architecture
 */

import { createInvariantViolation } from "./contracts.ts";
import { isValidStateTransition } from "./lifecycle-state-machine.ts";
import { hasRequiredCapabilities } from "./provider-capabilities.ts";
import {
  InvariantViolation,
  ProviderCapabilities,
  TradeLifecycleSnapshot,
  TradeLifecycleState,
  TradeManagementIntent,
  TradeManagementPolicy,
} from "./types.ts";

export function checkTradeManagementInvariants(params: {
  snapshot: TradeLifecycleSnapshot;
  proposedState: TradeLifecycleState;
  intents: readonly TradeManagementIntent[];
  policy: TradeManagementPolicy;
  capabilities: ProviderCapabilities;
  expectedPositionVersion?: number;
}): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const { snapshot, proposedState, intents, policy, capabilities, expectedPositionVersion } = params;

  // Rule 1: remaining quantity cannot be negative
  if (snapshot.remaining_quantity < 0) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_remaining_quantity_negative",
        severity: "CRITICAL_BLOCK",
        message: `Remaining quantity (${snapshot.remaining_quantity}) cannot be negative`,
        evidence: { remaining_quantity: snapshot.remaining_quantity },
      })
    );
  }

  // Rule 2: remaining quantity cannot exceed opened quantity
  if (snapshot.remaining_quantity > snapshot.opened_quantity + 1e-9) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_remaining_quantity_exceeds_opened",
        severity: "CRITICAL_BLOCK",
        message: `Remaining quantity (${snapshot.remaining_quantity}) exceeds opened quantity (${snapshot.opened_quantity})`,
        evidence: {
          remaining_quantity: snapshot.remaining_quantity,
          opened_quantity: snapshot.opened_quantity,
        },
      })
    );
  }

  // Rule 3: TP1 cannot execute twice
  const tp1Intents = intents.filter((i) => i.intent_type === "PARTIAL_CLOSE" && i.reason_code.includes("TP1"));
  if (snapshot.tp1_state === "EXECUTED" && tp1Intents.length > 0) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_tp1_double_execution",
        severity: "CRITICAL_BLOCK",
        message: "TP1 has already been executed; duplicate TP1 execution is forbidden",
        evidence: { tp1_state: snapshot.tp1_state, tp1_intents_count: tp1Intents.length },
      })
    );
  }

  // Rule 4: TP2 cannot execute twice
  const tp2Intents = intents.filter((i) => i.intent_type === "PARTIAL_CLOSE" && i.reason_code.includes("TP2"));
  if (snapshot.tp2_state === "EXECUTED" && tp2Intents.length > 0) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_tp2_double_execution",
        severity: "CRITICAL_BLOCK",
        message: "TP2 has already been executed; duplicate TP2 execution is forbidden",
        evidence: { tp2_state: snapshot.tp2_state, tp2_intents_count: tp2Intents.length },
      })
    );
  }

  // Rule 5: Closed / Archived trades cannot emit new management commands (except ARCHIVE_TRADE)
  if (
    (snapshot.current_lifecycle_state === "CLOSED" || snapshot.current_lifecycle_state === "ARCHIVED") &&
    intents.some((i) => i.intent_type !== "NO_ACTION" && i.intent_type !== "ARCHIVE_TRADE")
  ) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_closed_trade_management",
        severity: "CRITICAL_BLOCK",
        message: `Trade in state ${snapshot.current_lifecycle_state} cannot emit trade management commands`,
        evidence: {
          current_state: snapshot.current_lifecycle_state,
          intents: intents.map((i) => i.intent_type),
        },
      })
    );
  }

  // Rule 6: Archived trades cannot transition to any other state
  if (snapshot.current_lifecycle_state === "ARCHIVED" && proposedState !== "ARCHIVED") {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_archived_state_transition",
        severity: "FATAL",
        message: "Archived trade cannot transition to any other lifecycle state",
        evidence: { current_state: snapshot.current_lifecycle_state, proposed_state: proposedState },
      })
    );
  }

  // Rule 7: Protection-required policies cannot enter normal management while unprotected
  const normalManagementStates = new Set<TradeLifecycleState>([
    "TP1_ELIGIBLE",
    "TP1",
    "BREAK_EVEN",
    "TP2_ELIGIBLE",
    "TP2",
    "RUNNER",
  ]);
  if (normalManagementStates.has(proposedState) && snapshot.protection_state !== "VERIFIED") {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_unprotected_normal_management",
        severity: "CRITICAL_BLOCK",
        message: `Cannot enter state ${proposedState} while protection_state is ${snapshot.protection_state}`,
        evidence: {
          proposed_state: proposedState,
          protection_state: snapshot.protection_state,
        },
      })
    );
  }

  // Rule 8: Stop cannot become less protective without explicit recovery authorization
  for (const intent of intents) {
    if (
      intent.intent_type === "MOVE_STOP_TO_BREAK_EVEN" ||
      intent.intent_type === "MOVE_STOP_TO_LOCKED_PROFIT" ||
      intent.intent_type === "UPDATE_TRAILING_STOP"
    ) {
      const targetStop = intent.parameters.target_stop_price as number | undefined;
      if (targetStop && snapshot.current_stop !== null) {
        const isLessProtective =
          snapshot.side === "BUY"
            ? targetStop < snapshot.current_stop - 1e-8
            : targetStop > snapshot.current_stop + 1e-8;
        if (isLessProtective && intent.reason_code !== "RECOVERY_STOP_ADJUSTMENT") {
          violations.push(
            createInvariantViolation({
              rule_id: "inv_stop_less_protective",
              severity: "CRITICAL_BLOCK",
              message: `Proposed stop price (${targetStop}) is less protective than current stop (${snapshot.current_stop}) for ${snapshot.side} position`,
              evidence: {
                side: snapshot.side,
                current_stop: snapshot.current_stop,
                target_stop: targetStop,
                intent_type: intent.intent_type,
              },
            })
          );
        }
      }
    }
  }

  // Rule 9: Lifecycle state transition must be allowed by state machine
  if (!isValidStateTransition(snapshot.current_lifecycle_state, proposedState)) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_invalid_state_transition",
        severity: "CRITICAL_BLOCK",
        message: `State transition from ${snapshot.current_lifecycle_state} to ${proposedState} is not permitted`,
        evidence: {
          current_state: snapshot.current_lifecycle_state,
          proposed_state: proposedState,
        },
      })
    );
  }

  // Rule 10: Position version must match expected version
  if (
    expectedPositionVersion !== undefined &&
    expectedPositionVersion !== snapshot.position_version
  ) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_stale_position_version",
        severity: "CRITICAL_BLOCK",
        message: `Expected position version (${expectedPositionVersion}) does not match current snapshot version (${snapshot.position_version})`,
        evidence: {
          expected_version: expectedPositionVersion,
          snapshot_version: snapshot.position_version,
        },
      })
    );
  }

  // Rule 11: Total partial close fractions cannot exceed 100%
  const totalPartialCloseFraction =
    (policy.tp1_policy.enabled ? policy.tp1_policy.close_fraction : 0) +
    (policy.tp2_policy.enabled ? policy.tp2_policy.close_fraction : 0);
  if (totalPartialCloseFraction > 1.0 + 1e-6) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_partial_close_fraction_overflow",
        severity: "CRITICAL_BLOCK",
        message: `Total policy partial close fraction (${totalPartialCloseFraction}) exceeds 100%`,
        evidence: {
          tp1_fraction: policy.tp1_policy.close_fraction,
          tp2_fraction: policy.tp2_policy.close_fraction,
          total: totalPartialCloseFraction,
        },
      })
    );
  }

  // Rule 12: No provider command intent may be emitted without required provider capability
  for (const intent of intents) {
    const { satisfied, missing } = hasRequiredCapabilities(
      capabilities,
      intent.provider_capability_requirements
    );
    if (!satisfied) {
      violations.push(
        createInvariantViolation({
          rule_id: "inv_unsupported_provider_capability",
          severity: "CRITICAL_BLOCK",
          message: `Intent ${intent.intent_type} requires missing capabilities: ${missing.join(", ")}`,
          evidence: {
            intent_type: intent.intent_type,
            missing_capabilities: missing,
            provider: capabilities.provider,
          },
        })
      );
    }
  }

  // Rule 13 & 14: Contradictory intents (e.g. EMERGENCY_CLOSE and PARTIAL_CLOSE simultaneously)
  const hasEmergency = intents.some(
    (i) => i.intent_type === "EMERGENCY_CLOSE" || i.intent_type === "CLOSE_POSITION"
  );
  const hasPartial = intents.some((i) => i.intent_type === "PARTIAL_CLOSE");
  if (hasEmergency && hasPartial) {
    violations.push(
      createInvariantViolation({
        rule_id: "inv_contradictory_intents",
        severity: "CRITICAL_BLOCK",
        message: "Evaluation emitted contradictory intents: full close and partial close simultaneously",
        evidence: { intents: intents.map((i) => i.intent_type) },
      })
    );
  }

  return Object.freeze(violations);
}
