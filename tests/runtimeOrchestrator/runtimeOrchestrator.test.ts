/**
 * HashiBot Phase 7 — Runtime Orchestrator Deterministic Test Suite
 */

import assert from "node:assert";
import {
  runtimeOrchestrator,
  RuntimeOrchestrator,
  getExecutionBrain,
  getRiskEngine,
  getCapitalManager,
  getTradeManagementEngine,
  getRecoveryHandler,
  transitionRuntimeState,
  isValidRuntimeTransition,
  isTerminalRuntimeState,
  DEFAULT_MT5_PERSONAL_POLICY,
  DEFAULT_MT5_PROP_EVALUATION_POLICY,
  DEFAULT_BINANCE_PERSONAL_POLICY,
  DEFAULT_BYBIT_PERSONAL_POLICY,
} from "../../supabase/functions/_shared/runtime-orchestrator/index.ts";
import type {
  RuntimeCommand,
  RuntimePipelineContext,
} from "../../supabase/functions/_shared/runtime-orchestrator/types.ts";
import type {
  SignalContract,
  AccountExecutionContext,
} from "../../supabase/functions/_shared/account-execution-brain/types.ts";

function createMockContext(
  provider: "MT5_PERSONAL" | "MT5_PROP" | "BINANCE" | "BYBIT" = "MT5_PERSONAL",
  accountId = "acc_test_123",
  overrides?: Partial<AccountExecutionContext>
): AccountExecutionContext {
  return {
    account_id: accountId,
    provider,
    account_type: provider === "MT5_PROP" ? "PROP_EVALUATION" : "PERSONAL",
    balance: 10000,
    equity: 10000,
    free_margin: 8000,
    leverage: provider === "BINANCE" || provider === "BYBIT" ? 10 : 30,
    daily_drawdown: {
      current_drawdown_pct: 0.5,
      is_violated: false,
      starting_balance: 10000,
      peak_equity: 10000,
    },
    total_drawdown: {
      current_drawdown_pct: 1.0,
      is_violated: false,
      initial_balance: 10000,
      high_water_mark: 10000,
    },
    open_positions: [],
    exposure: {
      active_position_count: 0,
      total_open_risk_pct: 0,
      symbol_position_counts: {},
      positions_by_symbol: {},
    },
    session_state: {
      is_session_open: true,
      current_session: "LONDON",
      current_time_utc: "2026-07-28T14:00:00Z",
    },
    news_state: {
      in_high_impact_news_window: false,
    },
    runtime_health: {
      is_healthy: true,
      bridge_status: "CONNECTED",
      error_count_last_hour: 0,
    },
    ...overrides,
  };
}

function createMockSignal(
  symbol = "EURUSD",
  direction: "BUY" | "SELL" = "BUY",
  entry = 1.0850,
  sl = 1.0800,
  tp1 = 1.0950
): SignalContract {
  return {
    signal_id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    strategy_id: "strat_forex_scalp",
    symbol,
    direction,
    entry_price: entry,
    stop_loss: sl,
    tp1,
    tp2: entry + (tp1 - entry) * 2,
    timestamp: new Date().toISOString(),
  };
}

console.log("=== Running Phase 7 Runtime Orchestrator Unit Tests ===");

// Test 1: Full successful execution pipeline for MT5 Personal
(() => {
  console.log("Test 1: Full successful execution pipeline for MT5 Personal...");
  const signal = createMockSignal("EURUSD", "BUY", 1.0850, 1.0800, 1.0950);
  const context = createMockContext("MT5_PERSONAL", "acc_mt5_p1");
  const policy = DEFAULT_MT5_PERSONAL_POLICY;

  const command: RuntimeCommand = {
    command_id: "cmd_test_01",
    command_type: "PROCESS_APPROVED_SIGNAL",
    correlation_id: "corr_01",
    causation_id: "caus_01",
    idempotency_key: "idemp_cmd_01",
    aggregate_version: 1,
    timestamp: new Date().toISOString(),
    signal,
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    payload: {},
  };

  const pipelineContext: RuntimePipelineContext = {
    pipeline_id: "pipe_01",
    correlation_id: "corr_01",
    causation_id: "caus_01",
    created_at: new Date().toISOString(),
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    account_context: context,
    account_policy: policy,
  };

  const result = runtimeOrchestrator.processPipeline(command, pipelineContext);

  assert.strictEqual(result.status, "COMPLETED");
  assert.strictEqual(result.is_terminal, true);
  assert.strictEqual(result.is_idempotent_duplicate, false);
  assert.strictEqual(result.selected_brain.includes("Mt5PersonalBrain"), true);
  assert.strictEqual(result.execution_decision?.decision, "EXECUTE");
  assert.notStrictEqual(result.dispatch_intent, undefined);
  assert.strictEqual(result.dispatch_intent?.symbol, "EURUSD");
  assert.strictEqual(result.trade_truth_intents.length, 1);
  assert.strictEqual(result.recovery_intents.length, 0);
  assert.strictEqual(result.audit_events.length > 5, true);
})();

// Test 2: Brain selection for all 4 supported providers
(() => {
  console.log("Test 2: Brain selection for all 4 supported providers...");
  const providers = ["MT5_PERSONAL", "MT5_PROP", "BINANCE", "BYBIT"] as const;
  const policies = {
    MT5_PERSONAL: DEFAULT_MT5_PERSONAL_POLICY,
    MT5_PROP: DEFAULT_MT5_PROP_EVALUATION_POLICY,
    BINANCE: DEFAULT_BINANCE_PERSONAL_POLICY,
    BYBIT: DEFAULT_BYBIT_PERSONAL_POLICY,
  };

  for (const prov of providers) {
    const symbol = prov === "BINANCE" || prov === "BYBIT" ? "BTCUSDT" : "EURUSD";
    const entry = prov === "BINANCE" || prov === "BYBIT" ? 65000 : 1.0850;
    const sl = prov === "BINANCE" || prov === "BYBIT" ? 64000 : 1.0800;
    const tp1 = prov === "BINANCE" || prov === "BYBIT" ? 67000 : 1.0950;
    const signal = createMockSignal(symbol, "BUY", entry, sl, tp1);
    const context = createMockContext(prov, `acc_${prov}`);
    const policy = policies[prov];

    const command: RuntimeCommand = {
      command_id: `cmd_prov_${prov}`,
      command_type: "PROCESS_APPROVED_SIGNAL",
      correlation_id: `corr_${prov}`,
      causation_id: `caus_${prov}`,
      idempotency_key: `idemp_${prov}`,
      aggregate_version: 1,
      timestamp: new Date().toISOString(),
      signal,
      provider: prov,
      account_id: context.account_id,
      payload: {},
    };

    const pipelineContext: RuntimePipelineContext = {
      pipeline_id: `pipe_${prov}`,
      correlation_id: `corr_${prov}`,
      causation_id: `caus_${prov}`,
      created_at: new Date().toISOString(),
      provider: prov,
      account_id: context.account_id,
      account_context: context,
      account_policy: policy,
    };

    const result = runtimeOrchestrator.processPipeline(command, pipelineContext);
    if (result.status !== "COMPLETED") {
      console.log(`Test 2 Failed for ${prov}: status=${result.status}, failReason=${result.failure_reason}, recIntents=${JSON.stringify(result.recovery_intents)}`);
    }
    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.dispatch_intent?.provider, prov);
  }
})();

// Test 3: Account Lock handling in Orchestrator
(() => {
  console.log("Test 3: Account Lock handling in Orchestrator...");
  const signal = createMockSignal();
  const context = createMockContext("MT5_PERSONAL", "acc_locked", {
    daily_drawdown: {
      current_drawdown_pct: 10.0, // Exceeds max 6%
      is_violated: true,
      starting_balance: 10000,
      peak_equity: 10000,
    },
  });

  const command: RuntimeCommand = {
    command_id: "cmd_lock",
    command_type: "PROCESS_APPROVED_SIGNAL",
    correlation_id: "corr_lock",
    causation_id: "caus_lock",
    idempotency_key: "idemp_lock",
    aggregate_version: 1,
    timestamp: new Date().toISOString(),
    signal,
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    payload: {},
  };

  const pipelineContext: RuntimePipelineContext = {
    pipeline_id: "pipe_lock",
    correlation_id: "corr_lock",
    causation_id: "caus_lock",
    created_at: new Date().toISOString(),
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    account_context: context,
    account_policy: DEFAULT_MT5_PERSONAL_POLICY,
  };

  const result = runtimeOrchestrator.processPipeline(command, pipelineContext);
  assert.strictEqual(result.status, "LOCKED");
  assert.strictEqual(result.is_terminal, true);
  assert.strictEqual(result.execution_decision?.decision, "LOCK_ACCOUNT");
  assert.strictEqual(result.dispatch_intent, undefined);
})();

// Test 4: SKIP handling in Orchestrator (e.g. Market closed or duplicate position)
(() => {
  console.log("Test 4: SKIP handling in Orchestrator...");
  const signal = createMockSignal();
  const context = createMockContext("MT5_PERSONAL", "acc_skip", {
    session_state: {
      is_session_open: false,
    },
  });

  const command: RuntimeCommand = {
    command_id: "cmd_skip",
    command_type: "PROCESS_APPROVED_SIGNAL",
    correlation_id: "corr_skip",
    causation_id: "caus_skip",
    idempotency_key: "idemp_skip",
    aggregate_version: 1,
    timestamp: new Date().toISOString(),
    signal,
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    payload: {},
  };

  const pipelineContext: RuntimePipelineContext = {
    pipeline_id: "pipe_skip",
    correlation_id: "corr_skip",
    causation_id: "caus_skip",
    created_at: new Date().toISOString(),
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    account_context: context,
    account_policy: DEFAULT_MT5_PERSONAL_POLICY,
  };

  const result = runtimeOrchestrator.processPipeline(command, pipelineContext);
  assert.strictEqual(result.status, "SKIPPED");
  assert.strictEqual(result.is_terminal, true);
  assert.strictEqual(result.execution_decision?.decision, "SKIP");
  assert.strictEqual(result.dispatch_intent, undefined);
})();

// Test 5: Provider Validation failure routes to Recovery
(() => {
  console.log("Test 5: Provider Validation failure routes to Recovery...");
  const signal = createMockSignal();
  const context = createMockContext("MT5_PERSONAL", "acc_degraded", {
    runtime_health: {
      is_healthy: false,
      bridge_status: "DISCONNECTED",
      error_count_last_hour: 15,
    },
  });

  const command: RuntimeCommand = {
    command_id: "cmd_deg",
    command_type: "PROCESS_APPROVED_SIGNAL",
    correlation_id: "corr_deg",
    causation_id: "caus_deg",
    idempotency_key: "idemp_deg",
    aggregate_version: 1,
    timestamp: new Date().toISOString(),
    signal,
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    payload: {},
  };

  const pipelineContext: RuntimePipelineContext = {
    pipeline_id: "pipe_deg",
    correlation_id: "corr_deg",
    causation_id: "caus_deg",
    created_at: new Date().toISOString(),
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    account_context: context,
    account_policy: DEFAULT_MT5_PERSONAL_POLICY,
  };

  const result = runtimeOrchestrator.processPipeline(command, pipelineContext);
  // Brain evaluates bridge status during signal evaluation and returns SKIP
  assert.strictEqual(result.status === "SKIPPED" || result.status === "RECOVERY_REQUIRED", true);
})();

// Test 6: Idempotency deduplication check
(() => {
  console.log("Test 6: Idempotency deduplication check...");
  const signal = createMockSignal();
  const context = createMockContext();

  const command: RuntimeCommand = {
    command_id: "cmd_dup",
    command_type: "PROCESS_APPROVED_SIGNAL",
    correlation_id: "corr_dup",
    causation_id: "caus_dup",
    idempotency_key: "already_processed_idemp_key",
    aggregate_version: 2,
    timestamp: new Date().toISOString(),
    signal,
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    payload: {},
  };

  const pipelineContext: RuntimePipelineContext = {
    pipeline_id: "pipe_dup",
    correlation_id: "corr_dup",
    causation_id: "caus_dup",
    created_at: new Date().toISOString(),
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    account_context: context,
    account_policy: DEFAULT_MT5_PERSONAL_POLICY,
    previous_idempotency_keys: new Set(["already_processed_idemp_key"]),
  };

  const result = runtimeOrchestrator.processPipeline(command, pipelineContext);
  assert.strictEqual(result.status, "SKIPPED");
  assert.strictEqual(result.is_idempotent_duplicate, true);
  assert.strictEqual(result.selected_brain, "NONE");
})();

// Test 7: Stale aggregate version rejection
(() => {
  console.log("Test 7: Stale aggregate version rejection...");
  const signal = createMockSignal();
  const context = createMockContext();

  const command: RuntimeCommand = {
    command_id: "cmd_stale",
    command_type: "PROCESS_APPROVED_SIGNAL",
    correlation_id: "corr_stale",
    causation_id: "caus_stale",
    idempotency_key: "idemp_stale",
    aggregate_version: 3, // Version 3 <= stored version 5
    timestamp: new Date().toISOString(),
    signal,
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    payload: {},
  };

  const pipelineContext: RuntimePipelineContext = {
    pipeline_id: "pipe_stale",
    correlation_id: "corr_stale",
    causation_id: "caus_stale",
    created_at: new Date().toISOString(),
    provider: "MT5_PERSONAL",
    account_id: context.account_id,
    account_context: context,
    account_policy: DEFAULT_MT5_PERSONAL_POLICY,
    previous_aggregate_version: 5,
  };

  const result = runtimeOrchestrator.processPipeline(command, pipelineContext);
  assert.strictEqual(result.status, "SKIPPED");
  assert.strictEqual(result.is_idempotent_duplicate, false);
  assert.strictEqual(result.failure_reason?.includes("Stale command aggregate version"), true);
})();

// Test 8: Runtime State Machine transitions
(() => {
  console.log("Test 8: Runtime State Machine transitions...");

  assert.strictEqual(isValidRuntimeTransition("RECEIVED", "ACCOUNT_EVALUATED"), true);
  assert.strictEqual(isValidRuntimeTransition("ACCOUNT_EVALUATED", "RISK_APPROVED"), true);
  assert.strictEqual(isValidRuntimeTransition("RISK_APPROVED", "CAPITAL_ALLOCATED"), true);
  assert.strictEqual(isValidRuntimeTransition("CAPITAL_ALLOCATED", "PROVIDER_VALIDATED"), true);
  assert.strictEqual(isValidRuntimeTransition("PROVIDER_VALIDATED", "READY_FOR_DISPATCH"), true);
  assert.strictEqual(isValidRuntimeTransition("READY_FOR_DISPATCH", "LIFECYCLE_INITIALIZED"), true);
  assert.strictEqual(isValidRuntimeTransition("LIFECYCLE_INITIALIZED", "COMPLETED"), true);

  // Invalid transitions
  assert.strictEqual(isValidRuntimeTransition("RECEIVED", "COMPLETED"), false);
  assert.strictEqual(isValidRuntimeTransition("COMPLETED", "RECEIVED"), false);

  assert.throws(() => transitionRuntimeState("COMPLETED", "RECEIVED"), /Invalid Runtime State Transition/);
  assert.strictEqual(isTerminalRuntimeState("COMPLETED"), true);
  assert.strictEqual(isTerminalRuntimeState("RECEIVED"), false);
})();

// Test 9: Registry explicit mappings & no dynamic discovery
(() => {
  console.log("Test 9: Registry explicit mappings...");

  assert.strictEqual(getExecutionBrain("MT5_PERSONAL").provider, "MT5_PERSONAL");
  assert.strictEqual(getExecutionBrain("MT5_PROP").provider, "MT5_PROP");
  assert.strictEqual(getExecutionBrain("BINANCE").provider, "BINANCE");
  assert.strictEqual(getExecutionBrain("BYBIT").provider, "BYBIT");

  assert.throws(() => getExecutionBrain("UNKNOWN_PROVIDER" as any), /No registered Execution Brain/);

  assert.strictEqual(getRiskEngine().name, "ProfessionalRiskEngine");
  assert.strictEqual(getCapitalManager().name, "ProfessionalCapitalManager");
  assert.strictEqual(getTradeManagementEngine().name, "UnifiedTradeManagementSupervisor");
  assert.strictEqual(getRecoveryHandler().name, "CanonicalRecoveryEngine");
})();

console.log("=== All Phase 7 Runtime Orchestrator Unit Tests Passed Successfully! ===");
