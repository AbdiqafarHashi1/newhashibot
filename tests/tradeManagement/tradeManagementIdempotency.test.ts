/**
 * HashiBot Unified Trade Management Engine — Idempotency & Versioning Unit Tests
 * Phase 6 Test Suite
 */

import assert from "node:assert/strict";
import {
  createTradeLifecycleSnapshot,
  createTradeManagementIntent,
  generateIntentIdempotencyKey,
} from "../../supabase/functions/_shared/trade-management/index.ts";

function runTests() {
  console.log("=== Running Trade Management Idempotency Unit Tests ===");

  // Test 1: Deterministic Idempotency Key Generation
  console.log("Test 1: Verifying deterministic idempotency key generation...");
  const params = {
    trade_id: "trd_idem_01",
    position_id: "pos_idem_01",
    intent_type: "PARTIAL_CLOSE" as const,
    lifecycle_version: 2,
    position_version: 3,
    policy_id: "pol_binance_v1",
    trigger_identity: "tp1_trigger",
  };

  const key1 = generateIntentIdempotencyKey(params);
  const key2 = generateIntentIdempotencyKey(params);

  assert.equal(key1, key2, "Identical inputs must yield identical idempotency key");
  assert.equal(
    key1,
    "idempotent_trd_idem_01_pos_idem_01_PARTIAL_CLOSE_v2_pv3_pol_binance_v1_tp1_trigger"
  );

  // Test 2: Intent Creation Captures Generated Key
  console.log("Test 2: Verifying intent creation captures generated key...");
  const intent = createTradeManagementIntent({
    intent_type: "MOVE_STOP_TO_BREAK_EVEN",
    account_id: "acc_01",
    provider: "MT5_PERSONAL",
    position_id: "pos_01",
    lifecycle_state_before: "PROTECTED",
    requested_lifecycle_state_after: "BREAK_EVEN",
    policy_id: "pol_mt5_v1",
    policy_version: "1.0.0",
    reason_code: "BREAK_EVEN_TRIGGERED",
    expected_position_version: 1,
    lifecycle_version: 1,
  });

  assert.ok(intent.idempotency_key.includes("pos_01"));
  assert.ok(intent.idempotency_key.includes("MOVE_STOP_TO_BREAK_EVEN"));

  console.log("=== Trade Management Idempotency Unit Tests Passed! ===");
}

runTests();
