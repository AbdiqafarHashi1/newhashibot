/**
 * HashiBot Unified Trade Management Engine — Deterministic State Machine
 * Phase 6 Architecture
 */

import { TradeLifecycleState } from "./types.ts";

/**
 * Explicit map of permitted state transitions in the HashiBot Lifecycle State Machine.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<TradeLifecycleState, ReadonlySet<TradeLifecycleState>>> = Object.freeze({
  SIGNAL_CREATED: new Set<TradeLifecycleState>(["QUALIFIED", "LIFECYCLE_BLOCKED", "EMERGENCY_EXIT_PENDING"]),
  QUALIFIED: new Set<TradeLifecycleState>(["POSITION_SIZED", "LIFECYCLE_BLOCKED", "EMERGENCY_EXIT_PENDING"]),
  POSITION_SIZED: new Set<TradeLifecycleState>(["ORDER_SUBMITTED", "LIFECYCLE_BLOCKED", "EMERGENCY_EXIT_PENDING"]),
  ORDER_SUBMITTED: new Set<TradeLifecycleState>(["FILLED", "LIFECYCLE_BLOCKED", "EMERGENCY_EXIT_PENDING", "RECOVERY_REQUIRED"]),
  FILLED: new Set<TradeLifecycleState>([
    "PROTECTION_PENDING",
    "PROTECTED",
    "PROTECTION_FAILED",
    "CLOSE_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  PROTECTION_PENDING: new Set<TradeLifecycleState>([
    "PROTECTED",
    "PROTECTION_FAILED",
    "PROTECTION_REPAIR_PENDING",
    "CLOSE_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  PROTECTED: new Set<TradeLifecycleState>([
    "TP1_ELIGIBLE",
    "TP1_EXECUTION_PENDING",
    "TP1",
    "BREAK_EVEN_PENDING",
    "BREAK_EVEN",
    "TP2_ELIGIBLE",
    "TP2_EXECUTION_PENDING",
    "TP2",
    "RUNNER",
    "CLOSE_PENDING",
    "EXIT_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "PROTECTION_FAILED",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  TP1_ELIGIBLE: new Set<TradeLifecycleState>([
    "TP1_EXECUTION_PENDING",
    "TP1",
    "BREAK_EVEN_PENDING",
    "BREAK_EVEN",
    "CLOSE_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  TP1_EXECUTION_PENDING: new Set<TradeLifecycleState>([
    "TP1",
    "PROTECTED",
    "BREAK_EVEN_PENDING",
    "BREAK_EVEN",
    "CLOSE_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  TP1: new Set<TradeLifecycleState>([
    "BREAK_EVEN_PENDING",
    "BREAK_EVEN",
    "TP2_ELIGIBLE",
    "TP2_EXECUTION_PENDING",
    "TP2",
    "RUNNER",
    "CLOSE_PENDING",
    "EXIT_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  BREAK_EVEN_PENDING: new Set<TradeLifecycleState>([
    "BREAK_EVEN",
    "TP1",
    "TP2_ELIGIBLE",
    "TP2",
    "CLOSE_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  BREAK_EVEN: new Set<TradeLifecycleState>([
    "TP2_ELIGIBLE",
    "TP2_EXECUTION_PENDING",
    "TP2",
    "RUNNER",
    "CLOSE_PENDING",
    "EXIT_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  TP2_ELIGIBLE: new Set<TradeLifecycleState>([
    "TP2_EXECUTION_PENDING",
    "TP2",
    "RUNNER",
    "CLOSE_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  TP2_EXECUTION_PENDING: new Set<TradeLifecycleState>([
    "TP2",
    "RUNNER",
    "CLOSE_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  TP2: new Set<TradeLifecycleState>([
    "RUNNER",
    "CLOSE_PENDING",
    "EXIT_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  RUNNER: new Set<TradeLifecycleState>([
    "CLOSE_PENDING",
    "EXIT_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  CLOSE_PENDING: new Set<TradeLifecycleState>([
    "CLOSED",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  CLOSED: new Set<TradeLifecycleState>(["ARCHIVED", "RECOVERY_REQUIRED"]),
  ARCHIVED: new Set<TradeLifecycleState>([]), // Terminal state

  // Exceptional / Safety States
  PROTECTION_FAILED: new Set<TradeLifecycleState>([
    "PROTECTION_REPAIR_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "CLOSE_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  PROTECTION_REPAIR_PENDING: new Set<TradeLifecycleState>([
    "PROTECTED",
    "PROTECTION_FAILED",
    "EMERGENCY_EXIT_PENDING",
    "CLOSE_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  EXIT_PENDING: new Set<TradeLifecycleState>([
    "CLOSED",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  EMERGENCY_EXIT_PENDING: new Set<TradeLifecycleState>([
    "CLOSED",
    "RECOVERY_REQUIRED",
    "LIFECYCLE_BLOCKED",
  ]),
  RECOVERY_REQUIRED: new Set<TradeLifecycleState>([
    "PROTECTED",
    "PROTECTION_REPAIR_PENDING",
    "CLOSE_PENDING",
    "CLOSED",
    "LIFECYCLE_BLOCKED",
  ]),
  LIFECYCLE_BLOCKED: new Set<TradeLifecycleState>([
    "PROTECTED",
    "CLOSE_PENDING",
    "EMERGENCY_EXIT_PENDING",
    "RECOVERY_REQUIRED",
    "CLOSED",
  ]),
});

/**
 * Checks if a state transition from `fromState` to `toState` is valid.
 */
export function isValidStateTransition(fromState: TradeLifecycleState, toState: TradeLifecycleState): boolean {
  if (fromState === toState) {
    return true; // Self-transition / state refresh is valid
  }
  const allowed = ALLOWED_TRANSITIONS[fromState];
  return allowed ? allowed.has(toState) : false;
}

/**
 * Checks if a state is a terminal state (cannot transition out).
 */
export function isTerminalState(state: TradeLifecycleState): boolean {
  return state === "ARCHIVED";
}

/**
 * Checks if a state is considered an active trading state (position exists and managed).
 */
export function isActiveManagedState(state: TradeLifecycleState): boolean {
  const inactiveStates = new Set<TradeLifecycleState>([
    "SIGNAL_CREATED",
    "QUALIFIED",
    "POSITION_SIZED",
    "ORDER_SUBMITTED",
    "CLOSED",
    "ARCHIVED",
  ]);
  return !inactiveStates.has(state);
}
