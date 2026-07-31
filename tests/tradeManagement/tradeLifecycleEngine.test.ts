/**
 * HashiBot Unified Trade Management Engine — Lifecycle Engine Core Tests
 * Phase 6 Test Suite
 */

import assert from "node:assert/strict";
import {
  DEFAULT_BINANCE_PERSONAL_TRADE_POLICY,
  DEFAULT_BYBIT_PERSONAL_TRADE_POLICY,
  DEFAULT_MT5_PERSONAL_TRADE_POLICY,
  DEFAULT_MT5_PROP_TRADE_POLICY,
  composeTradeManagementPolicy,
  createTradeLifecycleSnapshot,
  evaluateLifecycle,
  getProviderCapabilities,
  MarketContext,
  ProviderHealthContext,
} from "../../supabase/functions/_shared/trade-management/index.ts";

function createMockMarketContext(overrides?: Partial<MarketContext>): MarketContext {
  return {
    current_price: 65000,
    bid: 64995,
    ask: 65005,
    atr: 500,
    is_market_open: true,
    in_high_impact_news: false,
    news_title: null,
    is_weekend: false,
    data_timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockHealthContext(overrides?: Partial<ProviderHealthContext>): ProviderHealthContext {
  return {
    is_healthy: true,
    bridge_status: "CONNECTED",
    last_heartbeat_at: new Date().toISOString(),
    ...overrides,
  };
}

function runTests() {
  console.log("=== Running Trade Lifecycle Engine Core Unit Tests ===");

  const evalTime = "2026-07-31T12:00:00.000Z";

  // Test 1: Newly Filled Position Requests Protection Verification
  console.log("Test 1: Newly filled position requests protection verification...");
  const filledSnapshot = createTradeLifecycleSnapshot({
    trade_id: "trd_binance_001",
    account_id: "acc_binance_01",
    provider: "BINANCE",
    symbol: "BTCUSDT",
    side: "BUY",
    opened_quantity: 1.0,
    average_entry: 65000,
    current_stop: 63700, // $1,300 SL
  });

  const marketCtx = createMockMarketContext({ current_price: 65000 });
  const healthCtx = createMockHealthContext();
  const policy = DEFAULT_BINANCE_PERSONAL_TRADE_POLICY;

  const eval1 = evaluateLifecycle(
    filledSnapshot,
    marketCtx,
    healthCtx,
    policy,
    getProviderCapabilities("BINANCE"),
    evalTime
  );

  assert.equal(eval1.proposed_next_state, "PROTECTION_PENDING");
  assert.equal(eval1.intents.length, 1);
  assert.equal(eval1.intents[0].intent_type, "VERIFY_PROTECTION");
  assert.equal(eval1.snapshot.protection_state, "UNVERIFIED");

  // Test 2: Verified Protection Transitions to PROTECTED
  console.log("Test 2: Verified protection transitions to PROTECTED...");
  const verifiedSnapshot = createTradeLifecycleSnapshot({
    ...filledSnapshot,
    current_lifecycle_state: "PROTECTION_PENDING",
    protection_state: "VERIFIED",
  });

  const eval2 = evaluateLifecycle(
    verifiedSnapshot,
    marketCtx,
    healthCtx,
    policy,
    getProviderCapabilities("BINANCE"),
    evalTime
  );

  assert.equal(eval2.proposed_next_state, "PROTECTED");
  assert.equal(eval2.snapshot.protection_state, "VERIFIED");

  // Test 3: TP1 Trigger Emits Partial Close Intent
  console.log("Test 3: TP1 trigger emits partial close intent...");
  const protectedSnapshot = createTradeLifecycleSnapshot({
    ...filledSnapshot,
    current_lifecycle_state: "PROTECTED",
    protection_state: "VERIFIED",
  });

  // Price moves to 1.5R (65000 + 1.5 * 1300 = 66950)
  const tp1MarketCtx = createMockMarketContext({ current_price: 66950 });

  const eval3 = evaluateLifecycle(
    protectedSnapshot,
    tp1MarketCtx,
    healthCtx,
    policy,
    getProviderCapabilities("BINANCE"),
    evalTime
  );

  assert.equal(eval3.proposed_next_state, "TP1");
  assert.equal(eval3.intents.length, 1);
  assert.equal(eval3.intents[0].intent_type, "PARTIAL_CLOSE");
  assert.equal(eval3.intents[0].parameters.close_quantity, 0.5); // 50% fraction
  assert.equal(eval3.snapshot.tp1_state, "EXECUTED");

  // Test 4: Duplicate TP1 Evaluation Emits No Second Close
  console.log("Test 4: Duplicate TP1 evaluation emits no second close...");
  const postTp1Snapshot = createTradeLifecycleSnapshot({
    ...protectedSnapshot,
    current_lifecycle_state: "TP1",
    remaining_quantity: 0.5,
    tp1_state: "EXECUTED",
  });

  const eval4 = evaluateLifecycle(
    postTp1Snapshot,
    tp1MarketCtx,
    healthCtx,
    policy,
    getProviderCapabilities("BINANCE"),
    evalTime
  );

  const tp1Intents = eval4.intents.filter((i) => i.intent_type === "PARTIAL_CLOSE" && i.parameters.tp_level === 1);
  assert.equal(tp1Intents.length, 0, "Duplicate TP1 must not emit partial close intent");

  // Test 5: Break-Even Trigger After TP1
  console.log("Test 5: Break-even trigger after TP1...");
  // After TP1, break-even policy is AFTER_TP1 -> moves stop to entry + profit lock offset
  const eval5 = evaluateLifecycle(
    postTp1Snapshot,
    tp1MarketCtx,
    healthCtx,
    policy,
    getProviderCapabilities("BINANCE"),
    evalTime
  );

  const beIntent = eval5.intents.find((i) => i.intent_type === "MOVE_STOP_TO_LOCKED_PROFIT" || i.intent_type === "MOVE_STOP_TO_BREAK_EVEN");
  assert.ok(beIntent !== undefined, "Break-even intent must be emitted after TP1");
  assert.equal(eval5.proposed_next_state, "BREAK_EVEN");

  // Test 6: TP2 Trigger Emits Remaining Close Intent
  console.log("Test 6: TP2 trigger emits remaining close intent...");
  const postBeSnapshot = createTradeLifecycleSnapshot({
    ...postTp1Snapshot,
    current_lifecycle_state: "BREAK_EVEN",
    breakeven_state: "TRIGGERED",
    current_stop: 65065, // Locked profit stop
  });

  // Price reaches 3.0R (65000 + 3.0 * 1300 = 68900)
  const tp2MarketCtx = createMockMarketContext({ current_price: 68900 });

  const eval6 = evaluateLifecycle(
    postBeSnapshot,
    tp2MarketCtx,
    healthCtx,
    policy,
    getProviderCapabilities("BINANCE"),
    evalTime
  );

  const tp2Intent = eval6.intents.find((i) => i.intent_type === "PARTIAL_CLOSE" && i.parameters.tp_level === 2);
  assert.ok(tp2Intent !== undefined, "TP2 partial close intent must be emitted");
  assert.equal(eval6.proposed_next_state, "TP2");

  // Test 7: Timeout Exit Condition
  console.log("Test 7: Timeout exit condition...");
  const staleOpenSnapshot = createTradeLifecycleSnapshot({
    ...protectedSnapshot,
    opened_time: "2026-07-01T00:00:00.000Z", // 30 days ago > 72 hours max holding
  });

  const eval7 = evaluateLifecycle(
    staleOpenSnapshot,
    marketCtx,
    healthCtx,
    policy,
    getProviderCapabilities("BINANCE"),
    evalTime
  );

  assert.equal(eval7.proposed_next_state, "CLOSE_PENDING");
  assert.equal(eval7.intents[0].intent_type, "CLOSE_POSITION");
  assert.equal(eval7.intents[0].reason_code, "TIMEOUT_EXCEEDED");

  // Test 8: Weekend Exit (Policy-Gated)
  console.log("Test 8: Weekend exit (policy-gated)...");
  // MT5 Prop policy has weekend_policy.mode = "MANDATORY_CLOSE"
  const propPolicy = DEFAULT_MT5_PROP_TRADE_POLICY;
  const weekendMarketCtx = createMockMarketContext({ is_weekend: true });

  const eval8 = evaluateLifecycle(
    protectedSnapshot,
    weekendMarketCtx,
    healthCtx,
    propPolicy,
    getProviderCapabilities("MT5_PROP"),
    evalTime
  );

  assert.equal(eval8.proposed_next_state, "CLOSE_PENDING");
  assert.equal(eval8.intents[0].reason_code, "WEEKEND_RESTRICTION_EXIT");

  // Binance crypto policy has weekend_policy.mode = "ALLOW" -> should NOT exit on weekend
  const cryptoEval8 = evaluateLifecycle(
    protectedSnapshot,
    weekendMarketCtx,
    healthCtx,
    policy,
    getProviderCapabilities("BINANCE"),
    evalTime
  );

  assert.notEqual(cryptoEval8.proposed_next_state, "CLOSE_PENDING", "Crypto account must allow weekend holding per policy");

  // Test 9: High-Impact News Exit (Policy-Gated)
  console.log("Test 9: High-impact news exit (policy-gated)...");
  const newsMarketCtx = createMockMarketContext({ in_high_impact_news: true, news_title: "FOMC Rate Decision" });

  const eval9 = evaluateLifecycle(
    protectedSnapshot,
    newsMarketCtx,
    healthCtx,
    propPolicy,
    getProviderCapabilities("MT5_PROP"),
    evalTime
  );

  assert.equal(eval9.proposed_next_state, "CLOSE_PENDING");
  assert.equal(eval9.intents[0].reason_code, "HIGH_IMPACT_NEWS_EXIT");

  console.log("=== Trade Lifecycle Engine Core Unit Tests Passed! ===");
}

runTests();
