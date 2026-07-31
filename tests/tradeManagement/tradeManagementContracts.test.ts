/**
 * HashiBot Unified Trade Management Engine — Contract & Factory Unit Tests
 * Phase 6 Test Suite
 */

import assert from "node:assert/strict";
import {
  DEFAULT_BINANCE_PERSONAL_TRADE_POLICY,
  DEFAULT_BYBIT_PERSONAL_TRADE_POLICY,
  DEFAULT_MT5_PERSONAL_TRADE_POLICY,
  DEFAULT_MT5_PROP_TRADE_POLICY,
  calculateRMultiple,
  composeTradeManagementPolicy,
  createTradeLifecycleEvent,
  createTradeLifecycleSnapshot,
  createTradeManagementIntent,
  generateIntentIdempotencyKey,
} from "../../supabase/functions/_shared/trade-management/index.ts";

function runTests() {
  console.log("=== Running Trade Management Contracts Unit Tests ===");

  // Test 1: Default Policies Immutability & Validity
  console.log("Test 1: Validating default policy templates...");
  assert.ok(Object.isFrozen(DEFAULT_MT5_PERSONAL_TRADE_POLICY));
  assert.ok(Object.isFrozen(DEFAULT_MT5_PROP_TRADE_POLICY));
  assert.ok(Object.isFrozen(DEFAULT_BINANCE_PERSONAL_TRADE_POLICY));
  assert.ok(Object.isFrozen(DEFAULT_BYBIT_PERSONAL_TRADE_POLICY));

  assert.equal(DEFAULT_MT5_PERSONAL_TRADE_POLICY.provider, "MT5_PERSONAL");
  assert.equal(DEFAULT_MT5_PROP_TRADE_POLICY.provider, "MT5_PROP");
  assert.equal(DEFAULT_BINANCE_PERSONAL_TRADE_POLICY.provider, "BINANCE");
  assert.equal(DEFAULT_BYBIT_PERSONAL_TRADE_POLICY.provider, "BYBIT");

  // Test 2: Composing TradeManagementPolicy
  console.log("Test 2: Composing policy with overrides...");
  const composed = composeTradeManagementPolicy(DEFAULT_BINANCE_PERSONAL_TRADE_POLICY, {
    tp1_policy: { enabled: true, trigger_mode: "R_MULTIPLE", trigger_value: 2.0, close_fraction: 0.5 },
  });
  assert.equal(composed.tp1_policy.trigger_value, 2.0);
  assert.equal(composed.tp2_policy.trigger_value, 3.0); // Preserved from base
  assert.ok(Object.isFrozen(composed));

  // Test 3: Creating TradeManagementIntent & Idempotency Key
  console.log("Test 3: Creating TradeManagementIntent...");
  const intent = createTradeManagementIntent({
    intent_type: "PARTIAL_CLOSE",
    account_id: "acc_123",
    provider: "BINANCE",
    position_id: "pos_456",
    lifecycle_state_before: "PROTECTED",
    requested_lifecycle_state_after: "TP1",
    policy_id: "pol_test",
    policy_version: "1.0.0",
    reason_code: "TP1_TRIGGERED",
    expected_position_version: 1,
    lifecycle_version: 1,
    parameters: { close_quantity: 0.1 },
  });

  assert.equal(intent.intent_type, "PARTIAL_CLOSE");
  assert.equal(intent.account_id, "acc_123");
  assert.ok(Object.isFrozen(intent));
  assert.ok(intent.idempotency_key.includes("pos_456"));

  // Test 4: Creating TradeLifecycleSnapshot
  console.log("Test 4: Creating TradeLifecycleSnapshot...");
  const snapshot = createTradeLifecycleSnapshot({
    trade_id: "trd_789",
    account_id: "acc_123",
    provider: "BYBIT",
    symbol: "BTCUSDT",
    side: "BUY",
    opened_quantity: 1.0,
    average_entry: 65000,
    current_stop: 63700,
  });

  assert.equal(snapshot.trade_id, "trd_789");
  assert.equal(snapshot.current_lifecycle_state, "FILLED");
  assert.equal(snapshot.remaining_quantity, 1.0);
  assert.ok(Object.isFrozen(snapshot));

  // Test 5: R-Multiple Calculation
  console.log("Test 5: R-Multiple calculation...");
  // BUY: entry 100, stop 90 (risk 10), current 115 -> R = (115-100)/10 = 1.5
  const rBuy = calculateRMultiple(100, 115, 90, "BUY");
  assert.equal(rBuy, 1.5);

  // SELL: entry 100, stop 110 (risk 10), current 85 -> R = (100-85)/10 = 1.5
  const rSell = calculateRMultiple(100, 85, 110, "SELL");
  assert.equal(rSell, 1.5);

  console.log("=== Trade Management Contracts Unit Tests Passed! ===");
}

runTests();
