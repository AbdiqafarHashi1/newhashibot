/**
 * HashiBot Unified Trade Management Engine — Compatibility & Adapter Unit Tests
 * Phase 6 Test Suite
 */

import assert from "node:assert/strict";
import {
  adaptLegacyPlanToPolicy,
  createTradeLifecycleSnapshot,
  evaluateLifecycle,
  translateEvaluationToTradeTruthPayload,
} from "../../supabase/functions/_shared/trade-management/index.ts";
import type { TradeManagementPlan } from "../../supabase/functions/_shared/account-execution-brain/types.ts";

function runTests() {
  console.log("=== Running Trade Management Compatibility Unit Tests ===");

  // Test 1: Adapting Legacy TradeManagementPlan to Policy
  console.log("Test 1: Adapting legacy TradeManagementPlan to policy...");
  const legacyPlan: TradeManagementPlan = {
    management_plan_id: "plan_legacy_01",
    signal_id: "sig_01",
    account_id: "acc_01",
    tp1_policy: {
      ratio: 1.8,
      exit_pct: 50,
      move_sl_to_be: true,
      profit_lock_offset: 0.001,
    },
    tp2_policy: {
      ratio: 3.5,
      exit_pct: 50,
      enable_trailing: true,
    },
    breakeven_policy: {
      trigger_rr: 1.8,
      lock_offset_price: 0,
    },
    trailing_policy: {
      type: "ATR_TRAILING",
      distance: 0.003,
    },
    timeout_policy: {
      max_holding_hours: 48,
      action_on_timeout: "CLOSE_MARKET",
    },
  };

  const adaptedPolicy = adaptLegacyPlanToPolicy(legacyPlan, "BINANCE", "PERSONAL");

  assert.equal(adaptedPolicy.tp1_policy.trigger_value, 1.8);
  assert.equal(adaptedPolicy.tp1_policy.close_fraction, 0.5);
  assert.equal(adaptedPolicy.tp2_policy.trigger_value, 3.5);
  assert.equal(adaptedPolicy.breakeven_policy.enabled, true);
  assert.equal(adaptedPolicy.trailing_policy.mode, "ATR");
  assert.equal(adaptedPolicy.timeout_policy.max_holding_hours, 48);

  // Test 2: Translating Evaluation to Trade Truth Payload
  console.log("Test 2: Translating evaluation to Trade Truth payload...");
  const snapshot = createTradeLifecycleSnapshot({
    trade_id: "trd_comp_01",
    account_id: "acc_01",
    provider: "BINANCE",
    symbol: "BTCUSDT",
    side: "BUY",
    opened_quantity: 1.0,
    average_entry: 65000,
    protection_state: "VERIFIED",
    current_lifecycle_state: "PROTECTED",
  });

  const evaluation = evaluateLifecycle(
    snapshot,
    {
      current_price: 65000,
      bid: 64990,
      ask: 65010,
      atr: 500,
      is_market_open: true,
      in_high_impact_news: false,
      news_title: null,
      is_weekend: false,
      data_timestamp: new Date().toISOString(),
    },
    { is_healthy: true, bridge_status: "CONNECTED", last_heartbeat_at: new Date().toISOString() },
    adaptedPolicy
  );

  const payload = translateEvaluationToTradeTruthPayload(evaluation);

  assert.equal(payload.p_status, "protected");
  assert.equal(payload.p_provider, "binance");
  assert.equal(payload.account_id, "acc_01");
  assert.equal(payload.trade_id, "trd_comp_01");

  console.log("=== Trade Management Compatibility Unit Tests Passed! ===");
}

runTests();
