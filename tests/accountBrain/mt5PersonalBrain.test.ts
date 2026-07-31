/**
 * HashiBot MT5 Personal Brain — Deterministic Unit Test Suite
 * Phase 2 MT5 Personal Account Execution Brain Tests
 */

import assert from "node:assert/strict";
import {
  Mt5PersonalBrain,
  mt5PersonalBrain,
  AccountExecutionContext,
  AccountPolicy,
  SignalContract,
  DEFAULT_MT5_PERSONAL_POLICY,
} from "../../supabase/functions/_shared/account-execution-brain/index.ts";

function createTestContext(overrides: Partial<AccountExecutionContext> = {}): AccountExecutionContext {
  return Object.freeze({
    account_id: "acc_mt5_personal_001",
    user_id: "usr_test_123",
    provider: "MT5_PERSONAL",
    account_type: "PERSONAL",
    environment: "DEMO",
    balance: 10000,
    equity: 10000,
    free_margin: 8000,
    used_margin: 2000,
    leverage: 30,
    open_positions: [],
    exposure: {
      total_notional_usd: 10000,
      total_open_risk_usd: 100,
      total_open_risk_pct: 1.0,
      active_position_count: 1,
      positions_by_symbol: { EURUSD: 1 },
    },
    daily_drawdown: {
      starting_balance: 10000,
      peak_equity: 10000,
      current_drawdown_amount: 0,
      current_drawdown_pct: 0,
      max_allowed_pct: 6.0,
      is_violated: false,
    },
    total_drawdown: {
      initial_balance: 10000,
      high_water_mark: 10000,
      current_drawdown_amount: 0,
      current_drawdown_pct: 0,
      max_allowed_pct: 20.0,
      is_violated: false,
    },
    risk_profile: {
      max_risk_per_trade_pct: 1.0,
      max_open_risk_pct: 3.0,
      max_leverage: 30,
      min_notional_usd: 1000,
    },
    prop_rules: null,
    session_state: {
      is_session_open: true,
      active_session_name: "London",
      current_time_utc: new Date().toISOString(),
    },
    news_state: {
      in_high_impact_news_window: false,
      news_event_title: null,
      minutes_to_news: null,
      minutes_after_news: null,
    },
    runtime_health: {
      is_healthy: true,
      last_heartbeat_at: new Date().toISOString(),
      bridge_status: "CONNECTED",
      error_count_last_hour: 0,
    },
    updated_at: new Date().toISOString(),
    ...overrides,
  });
}

function createTestSignal(overrides: Partial<SignalContract> = {}): SignalContract {
  return Object.freeze({
    signal_id: "sig_forex_101",
    symbol: "GBPUSD",
    market_type: "forex",
    direction: "BUY",
    entry_price: 1.2500,
    stop_loss: 1.2450,
    tp1: 1.2575,
    tp2: 1.2650,
    confidence_score: 92,
    grade: "A+",
    strategy_id: "strat_gbpusd_breakout",
    timeframe: "15m",
    created_at: new Date().toISOString(),
    ...overrides,
  });
}

function runMt5PersonalBrainTests() {
  console.log("=== Running MT5 Personal Brain Deterministic Unit Tests ===");

  const brain = new Mt5PersonalBrain();
  assert.equal(brain.provider, "MT5_PERSONAL");
  assert.equal(brain.brain_version, "1.0.0");

  const defaultPolicy: AccountPolicy = DEFAULT_MT5_PERSONAL_POLICY;

  // Test 1: Normal Execution (Full Authorized Risk)
  console.log("Test 1: Evaluating normal execution signal...");
  const normalCtx = createTestContext();
  const normalSignal = createTestSignal();

  const normalDecision = brain.evaluateSignal(normalSignal, normalCtx, defaultPolicy);
  assert.equal(normalDecision.decision, "EXECUTE", "Decision should be EXECUTE");
  assert.equal(normalDecision.decision_code, "APPROVED_FULL_RISK");
  assert.equal(normalDecision.authorized_risk_pct, 1.0);
  assert.equal(normalDecision.rule_violations.length, 0);

  // Position Plan Generation
  const plan = brain.createPositionPlan(normalDecision, normalSignal, normalCtx, defaultPolicy);
  assert.ok(plan !== null, "PositionPlan must be generated for EXECUTE decision");
  assert.equal(plan?.symbol, "GBPUSD");
  assert.equal(plan?.side, "BUY");
  assert.equal(plan?.contract_size, 100000);
  assert.ok((plan?.quantity ?? 0) >= 0.01, "Quantity should be at least 0.01 lot");

  // Trade Management Plan Generation
  const tmPlan = brain.createTradeManagementPlan(normalDecision, normalSignal, normalCtx);
  assert.ok(tmPlan !== null, "TradeManagementPlan must be generated for EXECUTE decision");
  assert.equal(tmPlan?.tp1_policy.exit_pct, 50);
  assert.equal(tmPlan?.tp1_policy.move_sl_to_be, true);

  // Test 2: Account Locked (Daily Loss Breach)
  console.log("Test 2: Evaluating daily loss exceeded breach...");
  const dailyLossCtx = createTestContext({
    daily_drawdown: {
      starting_balance: 10000,
      peak_equity: 10000,
      current_drawdown_amount: 650,
      current_drawdown_pct: 6.5,
      max_allowed_pct: 6.0,
      is_violated: true,
    },
  });

  const dailyLossDecision = brain.evaluateSignal(normalSignal, dailyLossCtx, defaultPolicy);
  assert.equal(dailyLossDecision.decision, "LOCK_ACCOUNT", "Decision should be LOCK_ACCOUNT");
  assert.equal(dailyLossDecision.decision_code, "LOCKED_DAILY_LOSS_BREACH");
  assert.equal(dailyLossDecision.authorized_risk_pct, 0);
  assert.ok(dailyLossDecision.lock_details !== null);
  assert.equal(dailyLossDecision.lock_details?.is_locked, true);

  // Verify null plans for LOCK_ACCOUNT
  const lockPlan = brain.createPositionPlan(dailyLossDecision, normalSignal, dailyLossCtx, defaultPolicy);
  assert.equal(lockPlan, null, "PositionPlan must be null when account is locked");

  // Test 3: Total Drawdown Breach
  console.log("Test 3: Evaluating max total drawdown breach...");
  const totalDrawdownCtx = createTestContext({
    total_drawdown: {
      initial_balance: 10000,
      high_water_mark: 12000,
      current_drawdown_amount: 2500,
      current_drawdown_pct: 20.8,
      max_allowed_pct: 20.0,
      is_violated: true,
    },
  });

  const totalDdDecision = brain.evaluateSignal(normalSignal, totalDrawdownCtx, defaultPolicy);
  assert.equal(totalDdDecision.decision, "LOCK_ACCOUNT");
  assert.equal(totalDdDecision.decision_code, "LOCKED_MAX_DRAWDOWN_BREACH");

  // Test 4: Insufficient Margin
  console.log("Test 4: Evaluating insufficient free margin...");
  const lowMarginCtx = createTestContext({
    free_margin: 20, // Only $20 free margin available
  });

  const lowMarginDecision = brain.evaluateSignal(normalSignal, lowMarginCtx, defaultPolicy);
  assert.equal(lowMarginDecision.decision, "SKIP", "Decision should be SKIP due to low margin");
  assert.equal(lowMarginDecision.decision_code, "SKIPPED_LOW_CONFIDENCE");
  assert.ok(
    lowMarginDecision.rule_violations.some((v) => v.rule_id === "rule_mt5_insufficient_margin"),
    "Rule violation for insufficient margin must be generated"
  );

  // Test 5: Duplicate Position Rule
  console.log("Test 5: Evaluating duplicate position rule...");
  const dupCtx = createTestContext({
    open_positions: [
      {
        ticket_or_id: "t_1001",
        symbol: "GBPUSD", // Existing position on same symbol
        side: "BUY",
        quantity: 0.1,
        entry_price: 1.2480,
        current_price: 1.2500,
        unrealized_pnl: 20,
        stop_loss: 1.2430,
        take_profit: 1.2580,
        open_risk_amount: 50,
        open_risk_pct: 0.5,
        notional_value: 12500,
        opened_at: new Date().toISOString(),
      },
    ],
  });

  const dupDecision = brain.evaluateSignal(normalSignal, dupCtx, defaultPolicy);
  assert.equal(dupDecision.decision, "SKIP", "Decision should be SKIP for duplicate symbol");
  assert.equal(dupDecision.decision_code, "SKIPPED_SYMBOL_POSITION_EXISTS");
  assert.ok(
    dupDecision.rule_violations.some((v) => v.rule_id === "rule_mt5_max_positions_per_symbol")
  );

  // Test 6: Leverage Violation
  console.log("Test 6: Evaluating leverage ceiling violation...");
  const highLeverageCtx = createTestContext({
    leverage: 100, // Account is set to 1:100 leverage while policy max allowed is 1:30
  });

  const levDecision = brain.evaluateSignal(normalSignal, highLeverageCtx, defaultPolicy);
  assert.equal(levDecision.decision, "SKIP", "Decision should be SKIP when leverage exceeds ceiling");
  assert.ok(
    levDecision.rule_violations.some((v) => v.rule_id === "rule_mt5_leverage_limit")
  );

  // Test 7: Reduced Risk (Portfolio Risk Room Limit)
  console.log("Test 7: Evaluating reduced risk decision due to portfolio risk cap...");
  const highExposureCtx = createTestContext({
    exposure: {
      total_notional_usd: 30000,
      total_open_risk_usd: 250,
      total_open_risk_pct: 2.5, // 2.5% open risk out of 3.0% max portfolio risk
      active_position_count: 2,
      positions_by_symbol: { EURUSD: 1, USDJPY: 1 },
    },
  });

  const reducedRiskDecision = brain.evaluateSignal(normalSignal, highExposureCtx, defaultPolicy);
  assert.equal(reducedRiskDecision.decision, "REDUCE_RISK", "Decision should be REDUCE_RISK");
  assert.equal(reducedRiskDecision.decision_code, "REDUCED_PORTFOLIO_EXPOSURE_CAP");
  assert.equal(reducedRiskDecision.authorized_risk_pct, 0.5, "Authorized risk should scale down to remaining room (3.0 - 2.5 = 0.5%)");

  const scaledPlan = brain.createPositionPlan(reducedRiskDecision, normalSignal, highExposureCtx, defaultPolicy);
  assert.ok(scaledPlan !== null);
  assert.equal(scaledPlan?.expected_risk_pct, 0.5);

  // Test 8: Reduced Risk (Drawdown Safety Buffer)
  console.log("Test 8: Evaluating drawdown safety buffer scaling...");
  const drawdownBufferCtx = createTestContext({
    daily_drawdown: {
      starting_balance: 10000,
      peak_equity: 10000,
      current_drawdown_amount: 480,
      current_drawdown_pct: 4.8, // 4.8% drawdown >= 75% of max 6.0% drawdown cap
      max_allowed_pct: 6.0,
      is_violated: false,
    },
  });

  const bufferDecision = brain.evaluateSignal(normalSignal, drawdownBufferCtx, defaultPolicy);
  assert.equal(bufferDecision.decision, "REDUCE_RISK");
  assert.equal(bufferDecision.decision_code, "REDUCED_DRAWDOWN_SAFETY_BUFFER");
  assert.equal(bufferDecision.authorized_risk_pct, 0.5, "Risk should be halved due to drawdown buffer");

  // Test 9: Gold Symbol (XAUUSD) Position Sizing & Contract Size
  console.log("Test 9: Evaluating Gold (XAUUSD) signal position sizing...");
  const goldSignal = createTestSignal({
    symbol: "XAUUSD",
    market_type: "metal",
    entry_price: 2400.0,
    stop_loss: 2390.0, // $10 SL distance
    tp1: 2420.0,
    tp2: 2450.0,
  });

  const goldCtx = createTestContext();
  const goldDecision = brain.evaluateSignal(goldSignal, goldCtx, defaultPolicy);
  assert.equal(goldDecision.decision, "EXECUTE");

  const goldPlan = brain.createPositionPlan(goldDecision, goldSignal, goldCtx, defaultPolicy);
  assert.ok(goldPlan !== null);
  assert.equal(goldPlan?.contract_size, 100);
  // Risk = $100 (1% of $10,000). SL distance = $10. Contract size = 100. Lots = $100 / ($10 * 100) = 0.10 lot
  assert.equal(goldPlan?.quantity, 0.1);

  // Test 10: Exported Instance Check
  console.log("Test 10: Verifying exported singleton mt5PersonalBrain instance...");
  assert.ok(mt5PersonalBrain instanceof Mt5PersonalBrain);

  console.log("=== All MT5 Personal Brain Unit Tests Passed Successfully! ===");
}

runMt5PersonalBrainTests();
