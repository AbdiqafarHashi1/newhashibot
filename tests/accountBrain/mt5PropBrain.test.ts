/**
 * HashiBot MT5 Prop Brain — Deterministic Unit Test Suite
 * Phase 3 MT5 Prop Account Execution Brain Tests
 */

import assert from "node:assert/strict";
import {
  Mt5PropBrain,
  mt5PropBrain,
  AccountExecutionContext,
  AccountPolicy,
  SignalContract,
  DEFAULT_MT5_PROP_EVALUATION_POLICY,
  DEFAULT_MT5_PROP_FUNDED_POLICY,
} from "../../supabase/functions/_shared/account-execution-brain/index.ts";

function createTestContext(overrides: Partial<AccountExecutionContext> = {}): AccountExecutionContext {
  return Object.freeze({
    account_id: "acc_mt5_prop_eval_001",
    user_id: "usr_test_789",
    provider: "MT5_PROP",
    account_type: "PROP_EVALUATION",
    environment: "DEMO",
    balance: 50000,
    equity: 50000,
    free_margin: 45000,
    used_margin: 5000,
    leverage: 100,
    open_positions: [],
    exposure: {
      total_notional_usd: 100000,
      total_open_risk_usd: 250,
      total_open_risk_pct: 0.5,
      active_position_count: 1,
      positions_by_symbol: { EURUSD: 1 },
    },
    daily_drawdown: {
      starting_balance: 50000,
      peak_equity: 50000,
      current_drawdown_amount: 0,
      current_drawdown_pct: 0,
      max_allowed_pct: 4.5,
      is_violated: false,
    },
    total_drawdown: {
      initial_balance: 50000,
      high_water_mark: 50000,
      current_drawdown_amount: 0,
      current_drawdown_pct: 0,
      max_allowed_pct: 9.0,
      is_violated: false,
    },
    risk_profile: {
      max_risk_per_trade_pct: 0.5,
      max_open_risk_pct: 1.5,
      max_leverage: 100,
      min_notional_usd: 1000,
    },
    prop_rules: {
      daily_loss_cap_pct: 4.5,
      total_trailing_drawdown_cap_pct: 9.0,
      news_trading_allowed: true,
      weekend_holding_allowed: true,
      min_trading_days: 5,
      current_trading_days: 3,
      breach_status: "HEALTHY",
    },
    session_state: {
      is_session_open: true,
      active_session_name: "London",
      current_time_utc: "2026-07-29T10:00:00.000Z", // Wednesday London session
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
    signal_id: "sig_prop_eurusd_201",
    symbol: "EURUSD",
    market_type: "forex",
    direction: "BUY",
    entry_price: 1.0850,
    stop_loss: 1.0820,
    tp1: 1.0895,
    tp2: 1.0940,
    confidence_score: 95,
    grade: "A+",
    strategy_id: "strat_eurusd_trend",
    timeframe: "15m",
    created_at: new Date().toISOString(),
    ...overrides,
  });
}

function runMt5PropBrainTests() {
  console.log("=== Running MT5 Prop Brain Deterministic Unit Tests ===");

  const brain = new Mt5PropBrain();
  assert.equal(brain.provider, "MT5_PROP");
  assert.equal(brain.brain_version, "1.0.0");

  const challengePolicy: AccountPolicy = DEFAULT_MT5_PROP_EVALUATION_POLICY;
  const fundedPolicy: AccountPolicy = DEFAULT_MT5_PROP_FUNDED_POLICY;

  // Test 1: Successful Execution on Challenge Account
  console.log("Test 1: Evaluating successful execution on Challenge account...");
  const challengeCtx = createTestContext({ open_positions: [], exposure: { total_notional_usd: 0, total_open_risk_usd: 0, total_open_risk_pct: 0, active_position_count: 0, positions_by_symbol: {} } });
  const signal1 = createTestSignal({ symbol: "GBPUSD", entry_price: 1.2500, stop_loss: 1.2450 });

  const evalDecision = brain.evaluateSignal(signal1, challengeCtx, challengePolicy);
  assert.equal(evalDecision.decision, "EXECUTE");
  assert.equal(evalDecision.decision_code, "APPROVED_FULL_RISK");
  assert.equal(evalDecision.authorized_risk_pct, 0.5);

  const evalPlan = brain.createPositionPlan(evalDecision, signal1, challengeCtx, challengePolicy);
  assert.ok(evalPlan !== null);
  assert.equal(evalPlan?.symbol, "GBPUSD");
  assert.equal(evalPlan?.expected_risk_pct, 0.5);

  const tmPlan = brain.createTradeManagementPlan(evalDecision, signal1, challengeCtx);
  assert.ok(tmPlan !== null);
  assert.equal(tmPlan?.timeout_policy.max_holding_hours, 24, "Prop trade timeout should be 24h");

  // Test 2: Successful Execution on Funded Account
  console.log("Test 2: Evaluating successful execution on Funded account...");
  const fundedCtx = createTestContext({
    account_type: "PROP_FUNDED",
    prop_rules: {
      daily_loss_cap_pct: 4.0,
      total_trailing_drawdown_cap_pct: 8.0,
      news_trading_allowed: false,
      weekend_holding_allowed: false,
      min_trading_days: 0,
      current_trading_days: 30,
      breach_status: "HEALTHY",
    },
    open_positions: [],
    exposure: { total_notional_usd: 0, total_open_risk_usd: 0, total_open_risk_pct: 0, active_position_count: 0, positions_by_symbol: {} },
  });

  const fundedDecision = brain.evaluateSignal(signal1, fundedCtx, fundedPolicy);
  assert.equal(fundedDecision.decision, "EXECUTE");
  assert.equal(fundedDecision.decision_code, "APPROVED_FULL_RISK");
  assert.equal(fundedDecision.authorized_risk_pct, 0.5);

  // Test 3: Daily Drawdown Breach
  console.log("Test 3: Evaluating daily drawdown breach...");
  const dailyBreachCtx = createTestContext({
    daily_drawdown: {
      starting_balance: 50000,
      peak_equity: 50000,
      current_drawdown_amount: 2500,
      current_drawdown_pct: 5.0, // 5.0% >= 4.5% max allowed
      max_allowed_pct: 4.5,
      is_violated: true,
    },
  });

  const dailyBreachDecision = brain.evaluateSignal(signal1, dailyBreachCtx, challengePolicy);
  assert.equal(dailyBreachDecision.decision, "LOCK_ACCOUNT");
  assert.equal(dailyBreachDecision.decision_code, "LOCKED_DAILY_LOSS_BREACH");
  assert.ok(dailyBreachDecision.lock_details !== null);
  assert.equal(dailyBreachDecision.lock_details?.reason, "DAILY_LOSS_BREACH");

  // Test 4: Trailing / Total Drawdown Breach
  console.log("Test 4: Evaluating trailing drawdown breach...");
  const trailingBreachCtx = createTestContext({
    total_drawdown: {
      initial_balance: 50000,
      high_water_mark: 52000,
      current_drawdown_amount: 4800,
      current_drawdown_pct: 9.23, // 9.23% >= 9.0% max total allowed
      max_allowed_pct: 9.0,
      is_violated: true,
    },
  });

  const trailingDecision = brain.evaluateSignal(signal1, trailingBreachCtx, challengePolicy);
  assert.equal(trailingDecision.decision, "LOCK_ACCOUNT");
  assert.equal(trailingDecision.decision_code, "LOCKED_MAX_DRAWDOWN_BREACH");

  // Test 5: Prop Firm Breach Status
  console.log("Test 5: Evaluating prop firm status BREACHED...");
  const firmBreachCtx = createTestContext({
    prop_rules: {
      daily_loss_cap_pct: 4.5,
      total_trailing_drawdown_cap_pct: 9.0,
      news_trading_allowed: true,
      weekend_holding_allowed: true,
      min_trading_days: 5,
      current_trading_days: 3,
      breach_status: "BREACHED",
    },
  });

  const firmBreachDecision = brain.evaluateSignal(signal1, firmBreachCtx, challengePolicy);
  assert.equal(firmBreachDecision.decision, "LOCK_ACCOUNT");
  assert.equal(firmBreachDecision.decision_code, "LOCKED_PROP_RULE_VIOLATION");

  // Test 6: Floating Drawdown Rejection
  console.log("Test 6: Evaluating open floating loss rejection...");
  const floatingLossCtx = createTestContext({
    balance: 50000,
    equity: 48100, // Open loss $1,900 = 3.8% unrealized loss (3.8% >= 4.5% * 0.8 = 3.6%)
    open_positions: [],
    exposure: { total_notional_usd: 0, total_open_risk_usd: 0, total_open_risk_pct: 0, active_position_count: 0, positions_by_symbol: {} },
  });

  const floatDecision = brain.evaluateSignal(signal1, floatingLossCtx, challengePolicy);
  assert.equal(floatDecision.decision, "SKIP");
  assert.equal(floatDecision.decision_code, "SKIPPED_LOW_CONFIDENCE");
  assert.ok(
    floatDecision.rule_violations.some((v) => v.rule_id === "rule_prop_floating_loss_buffer")
  );

  // Test 7: Weekend Restriction
  console.log("Test 7: Evaluating weekend holding restriction...");
  const weekendCtx = createTestContext({
    session_state: {
      is_session_open: true,
      active_session_name: "New York",
      current_time_utc: "2026-07-31T21:30:00.000Z", // Friday night 21:30 UTC
    },
  });

  const weekendDecision = brain.evaluateSignal(signal1, weekendCtx, fundedPolicy);
  assert.equal(weekendDecision.decision, "SKIP");
  assert.equal(weekendDecision.decision_code, "SKIPPED_WEEKEND_RESTRICTION");

  // Test 8: Economic News Restriction
  console.log("Test 8: Evaluating high-impact news window restriction...");
  const newsCtx = createTestContext({
    news_state: {
      in_high_impact_news_window: true,
      news_event_title: "US NFP Payrolls",
      minutes_to_news: 2,
      minutes_after_news: null,
    },
  });

  const newsDecision = brain.evaluateSignal(signal1, newsCtx, challengePolicy);
  assert.equal(newsDecision.decision, "SKIP");
  assert.equal(newsDecision.decision_code, "SKIPPED_NEWS_RESTRICTION");

  // Test 9: Duplicate Position Restriction
  console.log("Test 9: Evaluating duplicate position per symbol...");
  const dupCtx = createTestContext({
    open_positions: [
      {
        ticket_or_id: "t_prop_101",
        symbol: "EURUSD",
        side: "BUY",
        quantity: 0.2,
        entry_price: 1.0840,
        current_price: 1.0850,
        unrealized_pnl: 20,
        stop_loss: 1.0810,
        take_profit: 1.0900,
        open_risk_amount: 150,
        open_risk_pct: 0.3,
        notional_value: 21700,
        opened_at: new Date().toISOString(),
      },
    ],
  });
  const eurSignal = createTestSignal({ symbol: "EURUSD" });

  const dupDecision = brain.evaluateSignal(eurSignal, dupCtx, challengePolicy);
  assert.equal(dupDecision.decision, "SKIP");
  assert.equal(dupDecision.decision_code, "SKIPPED_SYMBOL_POSITION_EXISTS");

  // Test 10: Provider Unavailable / Degraded
  console.log("Test 10: Evaluating degraded / disconnected provider bridge...");
  const disconnectedCtx = createTestContext({
    runtime_health: {
      is_healthy: false,
      last_heartbeat_at: new Date().toISOString(),
      bridge_status: "DISCONNECTED",
      error_count_last_hour: 5,
    },
  });

  const disDecision = brain.evaluateSignal(signal1, disconnectedCtx, challengePolicy);
  assert.equal(disDecision.decision, "SKIP");
  assert.equal(disDecision.decision_code, "SKIPPED_PROVIDER_DEGRADED");

  // Test 11: Reduced Risk Decision (Portfolio Exposure Room Scaling)
  console.log("Test 11: Evaluating reduced risk decision due to portfolio cap...");
  const highExpCtx = createTestContext({
    exposure: {
      total_notional_usd: 200000,
      total_open_risk_usd: 600,
      total_open_risk_pct: 1.2, // 1.2% open risk out of 1.5% max portfolio risk cap
      active_position_count: 2,
      positions_by_symbol: { USDJPY: 1, USDCAD: 1 },
    },
    open_positions: [],
  });

  const reducedDecision = brain.evaluateSignal(signal1, highExpCtx, challengePolicy);
  assert.equal(reducedDecision.decision, "REDUCE_RISK");
  assert.equal(reducedDecision.decision_code, "REDUCED_PORTFOLIO_EXPOSURE_CAP");
  assert.equal(reducedDecision.authorized_risk_pct, 0.3, "Remaining room 1.5 - 1.2 = 0.3%");

  const reducedPlan = brain.createPositionPlan(reducedDecision, signal1, highExpCtx, challengePolicy);
  assert.ok(reducedPlan !== null);
  assert.equal(reducedPlan?.expected_risk_pct, 0.3);

  // Test 12: Exported Singleton Check
  console.log("Test 12: Verifying exported mt5PropBrain instance...");
  assert.ok(mt5PropBrain instanceof Mt5PropBrain);

  console.log("=== All MT5 Prop Brain Unit Tests Passed Successfully! ===");
}

runMt5PropBrainTests();
