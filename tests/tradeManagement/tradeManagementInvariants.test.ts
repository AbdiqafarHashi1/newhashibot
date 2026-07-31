/**
 * HashiBot Unified Trade Management Engine — Invariants Verification Unit Tests
 * Phase 6 Test Suite
 */

import assert from "node:assert/strict";
import {
  checkTradeManagementInvariants,
  createTradeLifecycleSnapshot,
  createTradeManagementIntent,
  DEFAULT_BINANCE_PERSONAL_TRADE_POLICY,
  getProviderCapabilities,
} from "../../supabase/functions/_shared/trade-management/index.ts";

function runTests() {
  console.log("=== Running Trade Management Invariants Unit Tests ===");

  const policy = DEFAULT_BINANCE_PERSONAL_TRADE_POLICY;
  const capabilities = getProviderCapabilities("BINANCE");

  // Test 1: Catch Negative Remaining Quantity
  console.log("Test 1: Catching negative remaining quantity...");
  const invalidQtySnapshot = createTradeLifecycleSnapshot({
    trade_id: "trd_inv_01",
    account_id: "acc_inv_01",
    provider: "BINANCE",
    symbol: "BTCUSDT",
    side: "BUY",
    opened_quantity: 1.0,
    remaining_quantity: -0.1, // Violates invariant
    average_entry: 65000,
  });

  const violations1 = checkTradeManagementInvariants({
    snapshot: invalidQtySnapshot,
    proposedState: "PROTECTED",
    intents: [],
    policy,
    capabilities,
  });

  assert.ok(violations1.some((v) => v.rule_id === "inv_remaining_quantity_negative"));

  // Test 2: Catch Duplicate TP1 Execution
  console.log("Test 2: Catching duplicate TP1 execution...");
  const tp1ExecutedSnapshot = createTradeLifecycleSnapshot({
    trade_id: "trd_inv_02",
    account_id: "acc_inv_01",
    provider: "BINANCE",
    symbol: "BTCUSDT",
    side: "BUY",
    opened_quantity: 1.0,
    remaining_quantity: 0.5,
    average_entry: 65000,
    tp1_state: "EXECUTED",
  });

  const tp1Intent = createTradeManagementIntent({
    intent_type: "PARTIAL_CLOSE",
    account_id: "acc_inv_01",
    provider: "BINANCE",
    position_id: "trd_inv_02",
    lifecycle_state_before: "TP1",
    requested_lifecycle_state_after: "TP1",
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    reason_code: "TP1_TRIGGERED",
    expected_position_version: 1,
    lifecycle_version: 1,
  });

  const violations2 = checkTradeManagementInvariants({
    snapshot: tp1ExecutedSnapshot,
    proposedState: "TP1",
    intents: [tp1Intent],
    policy,
    capabilities,
  });

  assert.ok(violations2.some((v) => v.rule_id === "inv_tp1_double_execution"));

  // Test 3: Catch Management Commands on CLOSED Position
  console.log("Test 3: Catching management commands on CLOSED position...");
  const closedSnapshot = createTradeLifecycleSnapshot({
    trade_id: "trd_inv_03",
    account_id: "acc_inv_01",
    provider: "BINANCE",
    symbol: "BTCUSDT",
    side: "BUY",
    opened_quantity: 1.0,
    remaining_quantity: 0.0,
    average_entry: 65000,
    current_lifecycle_state: "CLOSED",
  });

  const closeIntent = createTradeManagementIntent({
    intent_type: "PARTIAL_CLOSE",
    account_id: "acc_inv_01",
    provider: "BINANCE",
    position_id: "trd_inv_03",
    lifecycle_state_before: "CLOSED",
    requested_lifecycle_state_after: "CLOSED",
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    reason_code: "INVALID_CLOSE",
    expected_position_version: 1,
    lifecycle_version: 1,
  });

  const violations3 = checkTradeManagementInvariants({
    snapshot: closedSnapshot,
    proposedState: "CLOSED",
    intents: [closeIntent],
    policy,
    capabilities,
  });

  assert.ok(violations3.some((v) => v.rule_id === "inv_closed_trade_management"));

  // Test 4: Catch Unprotected Position Entering Normal Management
  console.log("Test 4: Catching unprotected position entering normal management...");
  const unprotectedSnapshot = createTradeLifecycleSnapshot({
    trade_id: "trd_inv_04",
    account_id: "acc_inv_01",
    provider: "BINANCE",
    symbol: "BTCUSDT",
    side: "BUY",
    opened_quantity: 1.0,
    remaining_quantity: 1.0,
    average_entry: 65000,
    protection_state: "UNVERIFIED",
  });

  const violations4 = checkTradeManagementInvariants({
    snapshot: unprotectedSnapshot,
    proposedState: "TP1_ELIGIBLE",
    intents: [],
    policy,
    capabilities,
  });

  assert.ok(violations4.some((v) => v.rule_id === "inv_unprotected_normal_management"));

  // Test 5: Catch Less Protective Stop Loss Adjustment
  console.log("Test 5: Catching less protective stop loss adjustment...");
  const protectedBuySnapshot = createTradeLifecycleSnapshot({
    trade_id: "trd_inv_05",
    account_id: "acc_inv_01",
    provider: "BINANCE",
    symbol: "BTCUSDT",
    side: "BUY",
    opened_quantity: 1.0,
    remaining_quantity: 1.0,
    average_entry: 65000,
    current_stop: 64000,
    protection_state: "VERIFIED",
  });

  // Target stop moves from 64000 down to 63000 (less protective for BUY)
  const badStopIntent = createTradeManagementIntent({
    intent_type: "MOVE_STOP_TO_BREAK_EVEN",
    account_id: "acc_inv_01",
    provider: "BINANCE",
    position_id: "trd_inv_05",
    lifecycle_state_before: "PROTECTED",
    requested_lifecycle_state_after: "BREAK_EVEN",
    policy_id: policy.policy_id,
    policy_version: policy.policy_version,
    reason_code: "BAD_STOP_MOVE",
    expected_position_version: 1,
    lifecycle_version: 1,
    parameters: { target_stop_price: 63000 },
  });

  const violations5 = checkTradeManagementInvariants({
    snapshot: protectedBuySnapshot,
    proposedState: "BREAK_EVEN",
    intents: [badStopIntent],
    policy,
    capabilities,
  });

  assert.ok(violations5.some((v) => v.rule_id === "inv_stop_less_protective"));

  console.log("=== Trade Management Invariants Unit Tests Passed! ===");
}

runTests();
