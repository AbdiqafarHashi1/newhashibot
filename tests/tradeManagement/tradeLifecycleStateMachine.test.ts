/**
 * HashiBot Unified Trade Management Engine — State Machine Unit Tests
 * Phase 6 Test Suite
 */

import assert from "node:assert/strict";
import {
  isActiveManagedState,
  isTerminalState,
  isValidStateTransition,
} from "../../supabase/functions/_shared/trade-management/index.ts";

function runTests() {
  console.log("=== Running Trade Lifecycle State Machine Unit Tests ===");

  // Test 1: Standard Normal Progression
  console.log("Test 1: Validating standard state machine transitions...");
  assert.equal(isValidStateTransition("SIGNAL_CREATED", "QUALIFIED"), true);
  assert.equal(isValidStateTransition("QUALIFIED", "POSITION_SIZED"), true);
  assert.equal(isValidStateTransition("POSITION_SIZED", "ORDER_SUBMITTED"), true);
  assert.equal(isValidStateTransition("ORDER_SUBMITTED", "FILLED"), true);
  assert.equal(isValidStateTransition("FILLED", "PROTECTION_PENDING"), true);
  assert.equal(isValidStateTransition("PROTECTION_PENDING", "PROTECTED"), true);
  assert.equal(isValidStateTransition("PROTECTED", "TP1"), true);
  assert.equal(isValidStateTransition("TP1", "BREAK_EVEN"), true);
  assert.equal(isValidStateTransition("BREAK_EVEN", "TP2"), true);
  assert.equal(isValidStateTransition("TP2", "RUNNER"), true);
  assert.equal(isValidStateTransition("RUNNER", "CLOSE_PENDING"), true);
  assert.equal(isValidStateTransition("CLOSE_PENDING", "CLOSED"), true);
  assert.equal(isValidStateTransition("CLOSED", "ARCHIVED"), true);

  // Test 2: Exceptional & Repair Transitions
  console.log("Test 2: Validating exceptional / repair transitions...");
  assert.equal(isValidStateTransition("PROTECTION_PENDING", "PROTECTION_FAILED"), true);
  assert.equal(isValidStateTransition("PROTECTION_FAILED", "PROTECTION_REPAIR_PENDING"), true);
  assert.equal(isValidStateTransition("PROTECTION_REPAIR_PENDING", "PROTECTED"), true);
  assert.equal(isValidStateTransition("PROTECTION_FAILED", "EMERGENCY_EXIT_PENDING"), true);
  assert.equal(isValidStateTransition("PROTECTED", "RECOVERY_REQUIRED"), true);
  assert.equal(isValidStateTransition("RECOVERY_REQUIRED", "PROTECTED"), true);

  // Test 3: Invalid / Forbidden Transitions
  console.log("Test 3: Rejecting invalid state transitions...");
  assert.equal(isValidStateTransition("ARCHIVED", "PROTECTED"), false);
  assert.equal(isValidStateTransition("ARCHIVED", "CLOSED"), false);
  assert.equal(isValidStateTransition("CLOSED", "PROTECTED"), false);

  // Test 4: Terminal and Active Managed State Checks
  console.log("Test 4: Terminal and active managed state classification...");
  assert.equal(isTerminalState("ARCHIVED"), true);
  assert.equal(isTerminalState("CLOSED"), false);
  assert.equal(isActiveManagedState("PROTECTED"), true);
  assert.equal(isActiveManagedState("TP1"), true);
  assert.equal(isActiveManagedState("SIGNAL_CREATED"), false);
  assert.equal(isActiveManagedState("CLOSED"), false);

  console.log("=== Trade Lifecycle State Machine Unit Tests Passed! ===");
}

runTests();
