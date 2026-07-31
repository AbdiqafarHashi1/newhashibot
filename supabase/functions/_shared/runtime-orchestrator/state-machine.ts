/**
 * HashiBot Runtime Orchestrator — Deterministic Runtime State Machine
 * Phase 7 Complete Runtime Orchestrator
 */

import type { RuntimeState } from "./types.ts";

export const ACTIVE_RUNTIME_STATES: ReadonlySet<RuntimeState> = new Set<RuntimeState>([
  "RECEIVED",
  "ACCOUNT_EVALUATED",
  "RISK_APPROVED",
  "CAPITAL_ALLOCATED",
  "PROVIDER_VALIDATED",
  "READY_FOR_DISPATCH",
  "LIFECYCLE_INITIALIZED",
]);

export const TERMINAL_RUNTIME_STATES: ReadonlySet<RuntimeState> = new Set<RuntimeState>([
  "COMPLETED",
  "SKIPPED",
  "REJECTED",
  "LOCKED",
  "RECOVERY_REQUIRED",
  "FAILED",
]);

const ALLOWED_TRANSITIONS: Readonly<Record<RuntimeState, ReadonlySet<RuntimeState>>> = Object.freeze({
  RECEIVED: new Set<RuntimeState>([
    "ACCOUNT_EVALUATED",
    "SKIPPED",
    "LOCKED",
    "RECOVERY_REQUIRED",
    "FAILED",
  ]),
  ACCOUNT_EVALUATED: new Set<RuntimeState>([
    "RISK_APPROVED",
    "REJECTED",
    "SKIPPED",
    "LOCKED",
    "RECOVERY_REQUIRED",
    "FAILED",
  ]),
  RISK_APPROVED: new Set<RuntimeState>([
    "CAPITAL_ALLOCATED",
    "REJECTED",
    "RECOVERY_REQUIRED",
    "FAILED",
  ]),
  CAPITAL_ALLOCATED: new Set<RuntimeState>([
    "PROVIDER_VALIDATED",
    "REJECTED",
    "RECOVERY_REQUIRED",
    "FAILED",
  ]),
  PROVIDER_VALIDATED: new Set<RuntimeState>([
    "READY_FOR_DISPATCH",
    "REJECTED",
    "RECOVERY_REQUIRED",
    "FAILED",
  ]),
  READY_FOR_DISPATCH: new Set<RuntimeState>([
    "LIFECYCLE_INITIALIZED",
    "RECOVERY_REQUIRED",
    "FAILED",
  ]),
  LIFECYCLE_INITIALIZED: new Set<RuntimeState>([
    "COMPLETED",
    "RECOVERY_REQUIRED",
    "FAILED",
  ]),
  COMPLETED: new Set<RuntimeState>([]),
  SKIPPED: new Set<RuntimeState>([]),
  REJECTED: new Set<RuntimeState>([]),
  LOCKED: new Set<RuntimeState>([]),
  RECOVERY_REQUIRED: new Set<RuntimeState>([]),
  FAILED: new Set<RuntimeState>([]),
});

/**
 * Checks if a state transition is valid according to the Runtime State Machine.
 */
export function isValidRuntimeTransition(from: RuntimeState, to: RuntimeState): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return Boolean(allowed && allowed.has(to));
}

/**
 * Transitions from one runtime state to the next with strict validity checking.
 */
export function transitionRuntimeState(from: RuntimeState, to: RuntimeState): RuntimeState {
  if (!isValidRuntimeTransition(from, to)) {
    throw new Error(`Invalid Runtime State Transition: cannot move from '${from}' to '${to}'`);
  }
  return to;
}

/**
 * Checks whether a given state is terminal.
 */
export function isTerminalRuntimeState(state: RuntimeState): boolean {
  return TERMINAL_RUNTIME_STATES.has(state);
}

/**
 * Checks whether a given state represents an error or recovery condition.
 */
export function isErrorOrRecoveryState(state: RuntimeState): boolean {
  return state === "RECOVERY_REQUIRED" || state === "FAILED" || state === "LOCKED";
}
