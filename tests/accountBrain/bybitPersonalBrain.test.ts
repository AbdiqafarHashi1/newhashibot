/**
 * HashiBot Bybit Personal Account Execution Brain — Deterministic Unit Tests
 * Phase 5 Test Suite
 */

import assert from "node:assert/strict";
import {
  AccountExecutionContext,
  AccountPolicy,
  SignalContract,
  DEFAULT_BYBIT_PERSONAL_POLICY,
  DEFAULT_MT5_PROP_EVALUATION_POLICY,
  DEFAULT_MT5_PROP_FUNDED_POLICY,
  composeAccountPolicy,
  getExecutionResponsibilityOwner,
} from "../../supabase/functions/_shared/account-execution-brain/index.ts";
import {
  BybitPersonalBrain,
  bybitPersonalBrain,
  BybitSymbolFilterSpec,
} from "../../supabase/functions/_shared/account-execution-brain/bybit-personal-brain.ts";

function createMockContext(overrides?: Partial<AccountExecutionContext>): AccountExecutionContext {
  return Object.freeze({
    account_id: "acc_bybit_personal_789",
    user_id: "usr_test_bybit_123",
    provider: "BYBIT",
    account_type: "PERSONAL",
    environment: "TESTNET",
    balance: 50000,
    equity: 50500,
    free_margin: 45000,
    used_margin: 5500,
    leverage: 20,
    open_positions: [],
    exposure: {
      total_notional_usd: 0,
      total_open_risk_usd: 0,
      total_open_risk_pct: 0,
      active_position_count: 0,
      positions_by_symbol: {},
    },
    daily_drawdown: {
      starting_balance: 50000,
      peak_equity: 50500,
      current_drawdown_amount: 0,
      current_drawdown_pct: 0,
      max_allowed_pct: 5.0,
      is_violated: false,
    },
    total_drawdown: {
      initial_balance: 50000,
      high_water_mark: 50500,
      current_drawdown_amount: 0,
      current_drawdown_pct: 0,
      max_allowed_pct: 15.0,
      is_violated: false,
    },
    risk_profile: {
      max_risk_per_trade_pct: 1.0,
      max_open_risk_pct: 3.0,
      max_leverage: 20,
      min_notional_usd: 10,
    },
    prop_rules: {
      daily_loss_cap_pct: 5.0,
      total_trailing_drawdown_cap_pct: 15.0,
      news_trading_allowed: true,
      weekend_holding_allowed: true,
      min_trading_days: 0,
      current_trading_days: 0,
      breach_status: "HEALTHY",
    },
    session_state: {
      is_session_open: true,
      active_session_name: "24/7 Crypto Session",
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

function createMockSignal(overrides?: Partial<SignalContract>): SignalContract {
  return Object.freeze({
    signal_id: "sig_bybit_btc_001",
    symbol: "BTCUSDT",
    market_type: "crypto",
    direction: "BUY",
    entry_price: 65000,
    stop_loss: 63700, // $1,300 SL distance (2.0%)
    tp1: 67600,
    tp2: 70200,
    confidence_score: 90,
    grade: "A",
    strategy_id: "strat_bybit_trend",
    timeframe: "1h",
    created_at: new Date().toISOString(),
    ...overrides,
  });
}

function runTests() {
  console.log("=== Running Bybit Personal Brain Deterministic Unit Tests ===");

  const brain = new BybitPersonalBrain();
  const basePolicy = DEFAULT_BYBIT_PERSONAL_POLICY;

  // Test 1: Normal Signal Execution
  console.log("Test 1: Evaluating normal execution signal...");
  const validContext = createMockContext();
  const validSignal = createMockSignal();

  const decision1 = brain.evaluateSignal(validSignal, validContext, basePolicy);
  assert.equal(decision1.decision, "EXECUTE", "Normal signal must result in EXECUTE");
  assert.equal(decision1.decision_code, "APPROVED_FULL_RISK");
  assert.equal(decision1.authorized_risk_pct, 1.0);
  assert.equal(decision1.rule_violations.length, 0);

  const plan1 = brain.createPositionPlan(decision1, validSignal, validContext, basePolicy);
  assert.ok(plan1 !== null);
  assert.equal(plan1?.symbol, "BTCUSDT");
  assert.equal(plan1?.side, "BUY");
  assert.ok(plan1?.quantity && plan1.quantity > 0);

  const tmPlan1 = brain.createTradeManagementPlan(decision1, validSignal, validContext);
  assert.ok(tmPlan1 !== null);
  assert.equal(tmPlan1?.tp1_policy.exit_pct, 50);

  // Test 2: Daily Drawdown Breach -> LOCK_ACCOUNT
  console.log("Test 2: Evaluating daily drawdown breach...");
  const dailyBreachContext = createMockContext({
    daily_drawdown: {
      starting_balance: 50000,
      peak_equity: 50500,
      current_drawdown_amount: 2750,
      current_drawdown_pct: 5.5, // 5.5% > 5.0% cap
      max_allowed_pct: 5.0,
      is_violated: true,
    },
  });

  const decision2 = brain.evaluateSignal(validSignal, dailyBreachContext, basePolicy);
  assert.equal(decision2.decision, "LOCK_ACCOUNT");
  assert.equal(decision2.decision_code, "LOCKED_DAILY_LOSS_BREACH");
  assert.equal(decision2.authorized_risk_pct, 0);
  assert.ok(decision2.lock_details?.is_locked);

  const plan2 = brain.createPositionPlan(decision2, validSignal, dailyBreachContext, basePolicy);
  assert.equal(plan2, null, "Locked account must yield null PositionPlan");

  // Test 3: Total Drawdown Breach -> LOCK_ACCOUNT
  console.log("Test 3: Evaluating max total drawdown breach...");
  const totalBreachContext = createMockContext({
    total_drawdown: {
      initial_balance: 50000,
      high_water_mark: 52000,
      current_drawdown_amount: 8000,
      current_drawdown_pct: 16.0, // 16.0% > 15.0% cap
      max_allowed_pct: 15.0,
      is_violated: true,
    },
  });

  const decision3 = brain.evaluateSignal(validSignal, totalBreachContext, basePolicy);
  assert.equal(decision3.decision, "LOCK_ACCOUNT");
  assert.equal(decision3.decision_code, "LOCKED_MAX_DRAWDOWN_BREACH");

  // Test 4: Insufficient Available Margin -> SKIP
  console.log("Test 4: Evaluating insufficient free margin...");
  const lowMarginContext = createMockContext({
    free_margin: 50, // Only $50 available margin
  });

  const decision4 = brain.evaluateSignal(validSignal, lowMarginContext, basePolicy);
  assert.equal(decision4.decision, "SKIP");
  assert.equal(decision4.decision_code, "SKIPPED_LOW_CONFIDENCE");
  assert.ok(decision4.reason.includes("Insufficient available margin"));

  // Test 5: Duplicate Position Per Symbol -> SKIP
  console.log("Test 5: Evaluating duplicate position rule per symbol...");
  const dupContext = createMockContext({
    exposure: {
      total_notional_usd: 6500,
      total_open_risk_usd: 130,
      total_open_risk_pct: 0.26,
      active_position_count: 1,
      positions_by_symbol: { BTCUSDT: 1 },
    },
    open_positions: [
      {
        position_id: "pos_bybit_btc_01",
        account_id: "acc_bybit_personal_789",
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.1,
        entry_price: 64500,
        current_price: 65000,
        unrealized_pnl: 50,
        stop_loss: 63500,
        take_profit: 67000,
        opened_at: new Date().toISOString(),
      },
    ],
  });

  const decision5 = brain.evaluateSignal(validSignal, dupContext, basePolicy);
  assert.equal(decision5.decision, "SKIP");
  assert.equal(decision5.decision_code, "SKIPPED_SYMBOL_POSITION_EXISTS");

  // Test 6: Maximum Total Open Positions Cap -> SKIP
  console.log("Test 6: Evaluating max total open positions cap...");
  const maxPosPolicy = composeAccountPolicy(basePolicy, {
    max_open_positions_total: 2,
  });
  const maxPosContext = createMockContext({
    exposure: {
      total_notional_usd: 30000,
      total_open_risk_usd: 500,
      total_open_risk_pct: 1.0,
      active_position_count: 2, // 2 active positions == max 2
      positions_by_symbol: { ETHUSDT: 1, SOLUSDT: 1 },
    },
  });

  const decision6 = brain.evaluateSignal(validSignal, maxPosContext, maxPosPolicy);
  assert.equal(decision6.decision, "SKIP");
  assert.equal(decision6.decision_code, "SKIPPED_MAX_POSITIONS_REACHED");

  // Test 7: Leverage Ceiling Violation -> SKIP
  console.log("Test 7: Evaluating leverage ceiling violation...");
  const highLevContext = createMockContext({
    leverage: 50, // Account leverage 50x > policy ceiling 20x
  });

  const decision7 = brain.evaluateSignal(validSignal, highLevContext, basePolicy);
  assert.equal(decision7.decision, "SKIP");
  assert.equal(decision7.decision_code, "SKIPPED_LOW_CONFIDENCE");
  assert.ok(decision7.reason.includes("exceeds policy ceiling"));

  // Test 8: Reduced Risk Decision due to Portfolio Risk Cap
  console.log("Test 8: Evaluating reduced risk decision due to portfolio risk cap...");
  const nearCapContext = createMockContext({
    exposure: {
      total_notional_usd: 40000,
      total_open_risk_usd: 1350,
      total_open_risk_pct: 2.7, // 2.7% open risk out of 3.0% max portfolio risk cap (leaving 0.3% room)
      active_position_count: 2,
      positions_by_symbol: { ETHUSDT: 1, SOLUSDT: 1 },
    },
  });

  const decision8 = brain.evaluateSignal(validSignal, nearCapContext, basePolicy);
  assert.equal(decision8.decision, "REDUCE_RISK");
  assert.equal(decision8.decision_code, "REDUCED_PORTFOLIO_EXPOSURE_CAP");
  assert.equal(decision8.authorized_risk_pct, 0.3); // Scaled from 1.0% down to remaining 0.3%

  // Test 9: Drawdown Safety Buffer Scaling
  console.log("Test 9: Evaluating drawdown safety buffer scaling...");
  const safetyBufferContext = createMockContext({
    daily_drawdown: {
      starting_balance: 50000,
      peak_equity: 50000,
      current_drawdown_amount: 1900,
      current_drawdown_pct: 3.8, // 3.8% drawdown >= 75% of 5.0% cap (3.75%)
      max_allowed_pct: 5.0,
      is_violated: false,
    },
  });

  const decision9 = brain.evaluateSignal(validSignal, safetyBufferContext, basePolicy);
  assert.equal(decision9.decision, "REDUCE_RISK");
  assert.equal(decision9.decision_code, "REDUCED_DRAWDOWN_SAFETY_BUFFER");
  assert.equal(decision9.authorized_risk_pct, 0.5); // 50% scale down from 1.0% to 0.5%

  // Test 10: Bybit Symbol Filter Validation (validatePositionPlan)
  console.log("Test 10: Evaluating validatePositionPlan with Bybit symbol filters...");
  const validPlan = brain.createPositionPlan(decision1, validSignal, validContext, basePolicy);
  assert.ok(validPlan !== null);

  const filterSpec: BybitSymbolFilterSpec = {
    symbol: "BTCUSDT",
    quantity_step: 0.001,
    quantity_precision: 3,
    minimum_quantity: 0.001,
    maximum_quantity: 1000,
    tick_size: 0.1,
    price_precision: 1,
    minimum_notional: 10,
    maximum_notional: 1000000,
    leverage_ceiling: 25,
    margin_mode: "ISOLATED",
    maintenance_margin_pct: 0.5,
  };

  const validationResult = brain.validatePositionPlan(validPlan!, validContext, basePolicy, filterSpec);
  assert.equal(validationResult.valid, true, "Position plan should pass symbol filter validation");
  assert.equal(validationResult.violations.length, 0);

  // Test 11: Degraded / Disconnected Provider Connectivity Check (Provider-Neutral)
  console.log("Test 11: Evaluating degraded provider connectivity status...");
  const degradedContext = createMockContext({
    runtime_health: {
      is_healthy: false,
      last_heartbeat_at: new Date().toISOString(),
      bridge_status: "DEGRADED",
      error_count_last_hour: 3,
    },
  });

  const decision11 = brain.evaluateSignal(validSignal, degradedContext, basePolicy);
  assert.equal(decision11.decision, "SKIP");
  assert.equal(decision11.decision_code, "SKIPPED_PROVIDER_DEGRADED");
  assert.ok(decision11.reason.includes("Bybit exchange connectivity"));

  // Test 12: Bybit Operational State checks (API auth & futures permission)
  console.log("Test 12: Evaluating Bybit operational state parameters...");
  const unauthDecision = brain.evaluateSignal(validSignal, validContext, basePolicy, {
    api_authenticated: false,
  });
  assert.equal(unauthDecision.decision, "SKIP");
  assert.equal(unauthDecision.decision_code, "SKIPPED_LOW_CONFIDENCE");
  assert.ok(unauthDecision.reason.includes("API key authentication failed"));

  const noFuturesDecision = brain.evaluateSignal(validSignal, validContext, basePolicy, {
    futures_permission_active: false,
  });
  assert.equal(noFuturesDecision.decision, "SKIP");
  assert.equal(noFuturesDecision.decision_code, "SKIPPED_LOW_CONFIDENCE");
  assert.ok(noFuturesDecision.reason.includes("USDT Futures trading permission missing"));

  // Test 13: Policy Symbol Eligibility List
  console.log("Test 13: Evaluating policy symbol eligibility list...");
  const restrictedSymbolPolicy = composeAccountPolicy(basePolicy, {
    allowed_symbols: ["ETHUSDT", "SOLUSDT"], // BTCUSDT not allowed
  });

  const restrictedDecision = brain.evaluateSignal(validSignal, validContext, restrictedSymbolPolicy);
  assert.equal(restrictedDecision.decision, "SKIP");
  assert.equal(restrictedDecision.decision_code, "SKIPPED_LOW_CONFIDENCE");
  assert.ok(restrictedDecision.reason.includes("not permitted by account policy"));

  // Test 14: Single-Owner Position Sizing Verification
  console.log("Test 14: Verifying Capital Manager single-owner position sizing ownership...");
  const sizingOwner = getExecutionResponsibilityOwner("POSITION_SIZING");
  assert.equal(sizingOwner.single_owner_component, "Capital Manager");

  const execOwner = getExecutionResponsibilityOwner("EXECUTION_DECISION");
  assert.equal(execOwner.single_owner_component, "Account Execution Brain");

  // Test 15: Singleton Instance Export & Contract Compliance
  console.log("Test 15: Verifying exported bybitPersonalBrain singleton instance...");
  assert.ok(bybitPersonalBrain instanceof BybitPersonalBrain);
  assert.equal(bybitPersonalBrain.provider, "BYBIT");
  assert.equal(bybitPersonalBrain.brain_version, "1.0.0");

  console.log("=== All Bybit Personal Brain Unit Tests Passed Successfully! ===");
}

runTests();
