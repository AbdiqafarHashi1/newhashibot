/**
 * HashiBot Account Execution Brain Contracts — Deterministic Unit Tests
 * Phase 1A Architectural Contract Layer Test Suite
 */

import assert from "node:assert/strict";
import {
  AccountExecutionContext,
  AccountPolicy,
  AccountExecutionBrain,
  SignalContract,
  ExecutionDecision,
  PositionPlan,
  TradeManagementPlan,
  AccountLock,
  validateAccountExecutionContext,
  validateAccountPolicy,
  composeAccountPolicy,
  createRuleViolation,
  createExecutionDecision,
  createAccountLock,
  DEFAULT_BINANCE_PERSONAL_POLICY,
  DEFAULT_BYBIT_PERSONAL_POLICY,
  DEFAULT_MT5_PERSONAL_POLICY,
  DEFAULT_MT5_PROP_EVALUATION_POLICY,
  DEFAULT_MT5_PROP_FUNDED_POLICY,
  HASHIBOT_OWNERSHIP_MATRIX,
  getExecutionResponsibilityOwner,
} from "../../supabase/functions/_shared/account-execution-brain/index.ts";

function runTests() {
  console.log("=== Running Account Execution Brain Contract Tests ===");

  // Test 1: Validate Standard Account Context
  console.log("Test 1: Validating AccountExecutionContext...");
  const validContext: AccountExecutionContext = Object.freeze({
    account_id: "acc_test_123",
    user_id: "usr_test_456",
    provider: "MT5_PROP",
    account_type: "PROP_EVALUATION",
    environment: "DEMO",
    balance: 100000,
    equity: 102500,
    free_margin: 95000,
    used_margin: 7500,
    leverage: 100,
    open_positions: [],
    exposure: {
      total_notional_usd: 100000,
      total_open_risk_usd: 500,
      total_open_risk_pct: 0.5,
      active_position_count: 1,
      positions_by_symbol: { EURUSD: 1 },
    },
    daily_drawdown: {
      starting_balance: 100000,
      peak_equity: 102500,
      current_drawdown_amount: 0,
      current_drawdown_pct: 0,
      max_allowed_pct: 4.5,
      is_violated: false,
    },
    total_drawdown: {
      initial_balance: 100000,
      high_water_mark: 102500,
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
      news_trading_allowed: false,
      weekend_holding_allowed: false,
      min_trading_days: 5,
      current_trading_days: 2,
      breach_status: "HEALTHY",
    },
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
  });

  const ctxValidation = validateAccountExecutionContext(validContext);
  assert.equal(ctxValidation.valid, true, "Valid context should pass validation");
  assert.equal(ctxValidation.errors.length, 0, "Valid context should have zero errors");

  // Test 2: Reject Invalid Account Context
  console.log("Test 2: Rejecting invalid AccountExecutionContext...");
  const invalidCtxResult = validateAccountExecutionContext({ balance: -500, account_id: "" });
  assert.equal(invalidCtxResult.valid, false, "Invalid context must fail validation");
  assert.ok(invalidCtxResult.errors.length > 0, "Invalid context should return error messages");

  // Test 3: Validate Default Policy Templates
  console.log("Test 3: Validating default policy templates...");
  const policies: AccountPolicy[] = [
    DEFAULT_BINANCE_PERSONAL_POLICY,
    DEFAULT_BYBIT_PERSONAL_POLICY,
    DEFAULT_MT5_PERSONAL_POLICY,
    DEFAULT_MT5_PROP_EVALUATION_POLICY,
    DEFAULT_MT5_PROP_FUNDED_POLICY,
  ];

  for (const pol of policies) {
    const res = validateAccountPolicy(pol);
    assert.equal(res.valid, true, `Policy ${pol.policy_id} should be valid`);
  }

  // Test 4: Compose Account Policy
  console.log("Test 4: Composing AccountPolicy with overrides...");
  const composed = composeAccountPolicy(DEFAULT_MT5_PROP_EVALUATION_POLICY, {
    max_risk_per_trade_pct: 0.25,
    allowed_symbols: ["EURUSD", "GBPUSD"],
  });

  assert.equal(composed.max_risk_per_trade_pct, 0.25, "Composed risk should be updated");
  assert.equal(composed.allowed_symbols?.length, 2, "Allowed symbols should be updated");
  assert.equal(DEFAULT_MT5_PROP_EVALUATION_POLICY.max_risk_per_trade_pct, 0.5, "Base policy must remain immutable");

  // Test 5: Create Rule Violation & Execution Decision
  console.log("Test 5: Creating RuleViolation and ExecutionDecision...");
  const violation = createRuleViolation({
    rule_id: "rule_max_drawdown",
    rule_category: "DRAWDOWN_LIMIT",
    severity: "CRITICAL_BLOCK",
    message: "Daily drawdown limit exceeded (4.8% > 4.5%)",
    evidence: { current_drawdown_pct: 4.8, cap_pct: 4.5 },
    recommended_action: "CLOSE_OPEN_POSITIONS",
  });

  assert.equal(violation.rule_id, "rule_max_drawdown");
  assert.equal(violation.severity, "CRITICAL_BLOCK");

  const lock = createAccountLock({
    lock_id: "lock_001",
    account_id: "acc_test_123",
    reason: "DAILY_LOSS_BREACH",
    release_conditions: "Reset after 00:00 UTC and operator review",
    violations: [violation],
  });

  const decision = createExecutionDecision({
    decision: "LOCK_ACCOUNT",
    decision_code: "LOCKED_DAILY_LOSS_BREACH",
    reason: "Daily loss cap exceeded on MT5 Prop evaluation account",
    account_id: "acc_test_123",
    signal_id: "sig_999",
    authorized_risk_pct: 0,
    rule_violations: [violation],
    lock_details: lock,
  });

  assert.equal(decision.decision, "LOCK_ACCOUNT");
  assert.equal(decision.decision_code, "LOCKED_DAILY_LOSS_BREACH");
  assert.equal(decision.lock_details?.is_locked, true);

  // Test 6: Verify Single-Owner Ownership Matrix
  console.log("Test 6: Verifying Single-Owner Ownership Matrix...");
  assert.equal(Object.keys(HASHIBOT_OWNERSHIP_MATRIX).length, 9, "Ownership matrix must contain exactly 9 responsibilities");

  const execDecisionOwner = getExecutionResponsibilityOwner("EXECUTION_DECISION");
  assert.equal(execDecisionOwner.single_owner_component, "Account Execution Brain");

  const sizingOwner = getExecutionResponsibilityOwner("POSITION_SIZING");
  assert.equal(sizingOwner.single_owner_component, "Capital Manager");

  const riskOwner = getExecutionResponsibilityOwner("RISK_VALIDATION");
  assert.equal(riskOwner.single_owner_component, "Risk Engine");

  // Test 7: Verify AccountExecutionBrain Interface Compliance with Dummy Brain
  console.log("Test 7: Verifying AccountExecutionBrain Interface Compliance...");
  class TestBrain implements AccountExecutionBrain {
    readonly provider = "MT5_PROP" as const;
    readonly brain_version = "1.0.0";

    evaluateSignal(
      signal: SignalContract,
      context: AccountExecutionContext,
      policy: AccountPolicy
    ): ExecutionDecision {
      if (context.daily_drawdown.is_violated) {
        return createExecutionDecision({
          decision: "LOCK_ACCOUNT",
          decision_code: "LOCKED_DAILY_LOSS_BREACH",
          reason: "Daily drawdown violated",
          account_id: context.account_id,
          signal_id: signal.signal_id,
          authorized_risk_pct: 0,
        });
      }

      return createExecutionDecision({
        decision: "EXECUTE",
        decision_code: "APPROVED_FULL_RISK",
        reason: "Signal meets all policy rules",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: policy.max_risk_per_trade_pct,
      });
    }

    createPositionPlan(
      decision: ExecutionDecision,
      signal: SignalContract,
      context: AccountExecutionContext,
      policy: AccountPolicy
    ): PositionPlan | null {
      if (decision.decision !== "EXECUTE" && decision.decision !== "REDUCE_RISK") return null;

      return {
        plan_id: `plan_${signal.signal_id}`,
        signal_id: signal.signal_id,
        account_id: context.account_id,
        symbol: signal.symbol,
        side: signal.direction,
        order_type: "MARKET",
        entry_price: signal.entry_price,
        stop_loss: signal.stop_loss,
        take_profit_1: signal.tp1,
        take_profit_2: signal.tp2,
        quantity: 0.1,
        leverage: policy.max_leverage_allowed,
        required_margin: 200,
        expected_risk_amount: 50,
        expected_risk_pct: 0.5,
        expected_notional: 10000,
        contract_size: 100000,
        time_in_force: "GTC",
        reduce_only: false,
        idempotency_key: `idemp_${signal.signal_id}`,
      };
    }

    createTradeManagementPlan(
      decision: ExecutionDecision,
      signal: SignalContract,
      context: AccountExecutionContext
    ): TradeManagementPlan | null {
      if (decision.decision !== "EXECUTE" && decision.decision !== "REDUCE_RISK") return null;

      return {
        management_plan_id: `tm_${signal.signal_id}`,
        signal_id: signal.signal_id,
        account_id: context.account_id,
        tp1_policy: { ratio: 1.5, exit_pct: 50, move_sl_to_be: true, profit_lock_offset: 2 },
        tp2_policy: { ratio: 3.0, exit_pct: 50, enable_trailing: true },
        breakeven_policy: { trigger_rr: 1.0, lock_offset_price: 1 },
        trailing_policy: { type: "ATR_TRAILING", distance: 15 },
        timeout_policy: { max_holding_hours: 48, action_on_timeout: "CLOSE_MARKET" },
      };
    }

    checkAccountLock(
      context: AccountExecutionContext,
      policy: AccountPolicy
    ): AccountLock | null {
      if (context.daily_drawdown.is_violated) {
        return createAccountLock({
          lock_id: `lock_${context.account_id}`,
          account_id: context.account_id,
          reason: "DAILY_LOSS_BREACH",
          release_conditions: "Reset at midnight UTC",
        });
      }
      return null;
    }
  }

  const testBrain = new TestBrain();
  assert.equal(testBrain.provider, "MT5_PROP");

  const testSignal: SignalContract = {
    signal_id: "sig_001",
    symbol: "EURUSD",
    market_type: "forex",
    direction: "BUY",
    entry_price: 1.0850,
    stop_loss: 1.0800,
    tp1: 1.0900,
    tp2: 1.0950,
    confidence_score: 88,
    grade: "A",
    strategy_id: "strat_forex_recovery",
    timeframe: "15m",
    created_at: new Date().toISOString(),
  };

  const evalResult = testBrain.evaluateSignal(testSignal, validContext, DEFAULT_MT5_PROP_EVALUATION_POLICY);
  assert.equal(evalResult.decision, "EXECUTE");
  assert.equal(evalResult.authorized_risk_pct, 0.5);

  const plan = testBrain.createPositionPlan(evalResult, testSignal, validContext, DEFAULT_MT5_PROP_EVALUATION_POLICY);
  assert.ok(plan !== null);
  assert.equal(plan?.symbol, "EURUSD");

  const tmPlan = testBrain.createTradeManagementPlan(evalResult, testSignal, validContext, DEFAULT_MT5_PROP_EVALUATION_POLICY);
  assert.ok(tmPlan !== null);
  assert.equal(tmPlan?.tp1_policy.exit_pct, 50);

  console.log("=== All Account Execution Brain Contract Tests Passed Successfully! ===");
}

runTests();
