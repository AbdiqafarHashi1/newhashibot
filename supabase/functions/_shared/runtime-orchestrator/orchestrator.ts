/**
 * HashiBot Runtime Orchestrator — Canonical Pipeline Coordinator
 * Phase 7 Complete Runtime Orchestrator
 *
 * Coordinates sequencing ONLY:
 * Approved Signal -> Execution Brain -> Risk Engine -> Capital Manager
 * -> Provider Validation -> Provider Dispatch Intent -> Unified Trade Management
 * -> Trade Truth Intent -> Recovery (when required)
 *
 * Side-effect free & deterministic.
 */

import {
  getExecutionBrain,
  getRiskEngine,
  getCapitalManager,
  getTradeManagementEngine,
  getRecoveryHandler,
} from "./registries.ts";
import {
  transitionRuntimeState,
  isTerminalRuntimeState,
} from "./state-machine.ts";
import type {
  RuntimeCommand,
  RuntimeEvent,
  RuntimePipelineContext,
  RuntimePipelineResult,
  RuntimeState,
  ProviderDispatchIntent,
  TradeTruthIntent,
  RecoveryRequestIntent,
} from "./types.ts";
import type { ExecutionDecision, PositionPlan } from "../account-execution-brain/types.ts";
import type { RiskDecision } from "../professional-risk-engine.ts";
import type { CapitalAllocationPlan } from "../professional-capital-allocation.ts";

export class RuntimeOrchestrator {
  readonly name = "CanonicalRuntimeOrchestrator";
  readonly version = "1.0.0";

  /**
   * Main deterministic, side-effect free pipeline coordinator.
   */
  processPipeline(
    command: RuntimeCommand,
    context: RuntimePipelineContext
  ): RuntimePipelineResult {
    const auditEvents: RuntimeEvent[] = [];
    const tradeTruthIntents: TradeTruthIntent[] = [];
    const recoveryIntents: RecoveryRequestIntent[] = [];
    const pipelineId = context.pipeline_id;
    const correlationId = command.correlation_id || context.correlation_id;
    const causationId = command.command_id;
    let currentState: RuntimeState = "RECEIVED";

    const emitEvent = (state: RuntimeState, details: Record<string, unknown>): RuntimeEvent => {
      const event: RuntimeEvent = Object.freeze({
        event_id: `evt_rt_${command.provider.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        event_type: `RUNTIME_STATE_${state}`,
        state,
        correlation_id: correlationId,
        causation_id: causationId,
        idempotency_key: command.idempotency_key,
        aggregate_version: command.aggregate_version,
        timestamp: new Date().toISOString(),
        details: Object.freeze({ ...details }),
      });
      auditEvents.push(event);
      return event;
    };

    // 1. Idempotency & Stale Version Check
    if (context.previous_idempotency_keys?.has(command.idempotency_key)) {
      emitEvent("SKIPPED", { reason: "IDEMPOTENT_DUPLICATE_COMMAND", idempotency_key: command.idempotency_key });
      return Object.freeze({
        pipeline_id: pipelineId,
        correlation_id: correlationId,
        status: "SKIPPED",
        is_terminal: true,
        is_idempotent_duplicate: true,
        selected_brain: "NONE",
        trade_truth_intents: Object.freeze([]),
        recovery_intents: Object.freeze([]),
        audit_events: Object.freeze(auditEvents),
        completed_at: new Date().toISOString(),
      });
    }

    if (
      context.previous_aggregate_version !== undefined &&
      command.aggregate_version <= context.previous_aggregate_version
    ) {
      emitEvent("SKIPPED", {
        reason: "STALE_AGGREGATE_VERSION",
        command_version: command.aggregate_version,
        stored_version: context.previous_aggregate_version,
      });
      return Object.freeze({
        pipeline_id: pipelineId,
        correlation_id: correlationId,
        status: "SKIPPED",
        is_terminal: true,
        is_idempotent_duplicate: false,
        selected_brain: "NONE",
        trade_truth_intents: Object.freeze([]),
        recovery_intents: Object.freeze([]),
        audit_events: Object.freeze(auditEvents),
        failure_reason: `Stale command aggregate version ${command.aggregate_version} <= ${context.previous_aggregate_version}`,
        completed_at: new Date().toISOString(),
      });
    }

    emitEvent("RECEIVED", { command_type: command.command_type, provider: command.provider, account_id: command.account_id });

    try {
      // 2. Execution Brain Selection & Account Evaluation
      const brain = getExecutionBrain(command.provider);
      const selectedBrainName = `${brain.constructor.name}@${brain.brain_version}`;

      if (!command.signal) {
        throw new Error("RuntimePipelineError: Approved Signal is required for runtime execution pipeline.");
      }

      const decision: ExecutionDecision = brain.evaluateSignal(
        command.signal,
        context.account_context,
        context.account_policy
      );

      currentState = transitionRuntimeState(currentState, "ACCOUNT_EVALUATED");
      emitEvent(currentState, { decision: decision.decision, decision_code: decision.decision_code, reason: decision.reason });

      // Handle SKIP or LOCK_ACCOUNT from Brain
      if (decision.decision === "SKIP") {
        const finalState = transitionRuntimeState(currentState, "SKIPPED");
        emitEvent(finalState, { reason: decision.reason });
        return Object.freeze({
          pipeline_id: pipelineId,
          correlation_id: correlationId,
          status: finalState,
          is_terminal: true,
          is_idempotent_duplicate: false,
          selected_brain: selectedBrainName,
          execution_decision: decision,
          trade_truth_intents: Object.freeze([]),
          recovery_intents: Object.freeze([]),
          audit_events: Object.freeze(auditEvents),
          completed_at: new Date().toISOString(),
        });
      }

      if (decision.decision === "LOCK_ACCOUNT") {
        const finalState = transitionRuntimeState(currentState, "LOCKED");
        emitEvent(finalState, { lock_details: decision.lock_details });
        return Object.freeze({
          pipeline_id: pipelineId,
          correlation_id: correlationId,
          status: finalState,
          is_terminal: true,
          is_idempotent_duplicate: false,
          selected_brain: selectedBrainName,
          execution_decision: decision,
          trade_truth_intents: Object.freeze([]),
          recovery_intents: Object.freeze([]),
          audit_events: Object.freeze(auditEvents),
          completed_at: new Date().toISOString(),
        });
      }

      // 3. Risk Engine Invocation
      let riskDecision: DeepReadonly<RiskDecision> | undefined = undefined;
      const riskEngine = getRiskEngine();

      if (
        context.risk_evaluation_context &&
        context.resolved_risk_policy &&
        (command.signal as any).approved_plan
      ) {
        riskDecision = riskEngine.evaluate(
          (command.signal as any).approved_plan,
          context.risk_evaluation_context,
          context.resolved_risk_policy
        );

        if (riskDecision.decision === "REJECT") {
          const finalState = transitionRuntimeState(currentState, "REJECTED");
          emitEvent(finalState, { reason: riskDecision.explanation.summary });
          return Object.freeze({
            pipeline_id: pipelineId,
            correlation_id: correlationId,
            status: finalState,
            is_terminal: true,
            is_idempotent_duplicate: false,
            selected_brain: selectedBrainName,
            execution_decision: decision,
            risk_decision: riskDecision,
            trade_truth_intents: Object.freeze([]),
            recovery_intents: Object.freeze([]),
            audit_events: Object.freeze(auditEvents),
            completed_at: new Date().toISOString(),
          });
        }
      }

      currentState = transitionRuntimeState(currentState, "RISK_APPROVED");
      emitEvent(currentState, { authorized_risk_pct: decision.authorized_risk_pct, risk_decision_action: riskDecision?.decision ?? "ACCEPT" });

      // 4. Capital Manager Sizing & Allocation
      const capitalManager = getCapitalManager();
      let capitalPlan: DeepReadonly<CapitalAllocationPlan> | PositionPlan | undefined = undefined;

      if (context.capital_allocation_context) {
        const allocated = capitalManager.allocate(context.capital_allocation_context);
        capitalPlan = allocated;
        if (allocated.status === "REJECTED") {
          const finalState = transitionRuntimeState(currentState, "REJECTED");
          emitEvent(finalState, { reason: "Capital allocation rejected", constraints: allocated.rejected_constraints });
          return Object.freeze({
            pipeline_id: pipelineId,
            correlation_id: correlationId,
            status: finalState,
            is_terminal: true,
            is_idempotent_duplicate: false,
            selected_brain: selectedBrainName,
            execution_decision: decision,
            risk_decision: riskDecision,
            capital_plan: capitalPlan,
            trade_truth_intents: Object.freeze([]),
            recovery_intents: Object.freeze([]),
            audit_events: Object.freeze(auditEvents),
            completed_at: new Date().toISOString(),
          });
        }
      } else {
        // Delegate to Capital Manager single-owner calculator via Brain wrapper / helper
        const posPlan = brain.createPositionPlan(
          decision,
          command.signal,
          context.account_context,
          context.account_policy
        );
        if (!posPlan) {
          const finalState = transitionRuntimeState(currentState, "REJECTED");
          emitEvent(finalState, { reason: "Position plan creation returned null" });
          return Object.freeze({
            pipeline_id: pipelineId,
            correlation_id: correlationId,
            status: finalState,
            is_terminal: true,
            is_idempotent_duplicate: false,
            selected_brain: selectedBrainName,
            execution_decision: decision,
            risk_decision: riskDecision,
            trade_truth_intents: Object.freeze([]),
            recovery_intents: Object.freeze([]),
            audit_events: Object.freeze(auditEvents),
            completed_at: new Date().toISOString(),
          });
        }
        capitalPlan = posPlan;
      }

      currentState = transitionRuntimeState(currentState, "CAPITAL_ALLOCATED");
      emitEvent(currentState, {
        quantity: (capitalPlan as PositionPlan).quantity ?? (capitalPlan as CapitalAllocationPlan).allocation?.quantity,
        notional: (capitalPlan as PositionPlan).expected_notional ?? (capitalPlan as CapitalAllocationPlan).allocation?.notional,
      });

      // 5. Provider Validation
      if (
        !context.account_context.runtime_health.is_healthy ||
        context.account_context.runtime_health.bridge_status === "DISCONNECTED"
      ) {
        const recoveryHandler = getRecoveryHandler();
        const recoveryIntent = recoveryHandler.createRecoveryRequest({
          correlation_id: correlationId,
          causation_id: causationId,
          provider: command.provider,
          account_id: command.account_id,
          reason_code: "PROVIDER_BRIDGE_UNHEALTHY",
          description: `Provider bridge is ${context.account_context.runtime_health.bridge_status}. Execution routed to Recovery.`,
          priority: "HIGH",
        });
        recoveryIntents.push(recoveryIntent);

        const finalState = transitionRuntimeState(currentState, "RECOVERY_REQUIRED");
        emitEvent(finalState, { recovery_id: recoveryIntent.recovery_id, reason: recoveryIntent.description });
        return Object.freeze({
          pipeline_id: pipelineId,
          correlation_id: correlationId,
          status: finalState,
          is_terminal: true,
          is_idempotent_duplicate: false,
          selected_brain: selectedBrainName,
          execution_decision: decision,
          risk_decision: riskDecision,
          capital_plan: capitalPlan,
          trade_truth_intents: Object.freeze([]),
          recovery_intents: Object.freeze(recoveryIntents),
          audit_events: Object.freeze(auditEvents),
          completed_at: new Date().toISOString(),
        });
      }

      currentState = transitionRuntimeState(currentState, "PROVIDER_VALIDATED");
      emitEvent(currentState, { bridge_status: context.account_context.runtime_health.bridge_status });

      // 6. Provider Dispatch Intent Creation
      const signal = command.signal;
      const qty = (capitalPlan as PositionPlan).quantity ?? (capitalPlan as CapitalAllocationPlan).allocation?.quantity ?? 0;
      const leverage = (capitalPlan as PositionPlan).leverage ?? (capitalPlan as CapitalAllocationPlan).allocation?.leverage ?? 1;
      const requiredMargin = (capitalPlan as PositionPlan).required_margin ?? (capitalPlan as CapitalAllocationPlan).allocation?.margin ?? 0;

      const dispatchIntent: ProviderDispatchIntent = Object.freeze({
        intent_id: `disp_${command.provider.toLowerCase()}_${signal.signal_id}_${Date.now()}`,
        correlation_id: correlationId,
        provider: command.provider,
        account_id: command.account_id,
        symbol: signal.symbol,
        side: signal.direction,
        order_type: "MARKET",
        quantity: qty,
        entry_price: signal.entry_price,
        stop_loss: signal.stop_loss,
        take_profit_1: signal.tp1,
        take_profit_2: signal.tp2 ?? null,
        leverage,
        required_margin: requiredMargin,
        idempotency_key: `idemp_disp_${signal.signal_id}_${command.account_id}`,
        payload: Object.freeze({
          decision_code: decision.decision_code,
          authorized_risk_pct: decision.authorized_risk_pct,
        }),
      });

      currentState = transitionRuntimeState(currentState, "READY_FOR_DISPATCH");
      emitEvent(currentState, { dispatch_intent_id: dispatchIntent.intent_id, symbol: dispatchIntent.symbol, side: dispatchIntent.side });

      // 7. Initialize Unified Trade Management
      const tmEngine = getTradeManagementEngine();
      const tmPolicy = context.trade_management_policy ?? tmEngine.createDefaultPolicy(command.provider, command.account_id);

      currentState = transitionRuntimeState(currentState, "LIFECYCLE_INITIALIZED");
      emitEvent(currentState, { policy_id: tmPolicy.policy_id, policy_version: tmPolicy.policy_version });

      // 8. Emit Trade Truth Persistence Intents
      const sideTruth = signal.direction === "BUY" ? "long" : "short";
      const truthIntent: TradeTruthIntent = Object.freeze({
        truth_intent_id: `truth_intent_${command.provider.toLowerCase()}_${signal.signal_id}`,
        correlation_id: correlationId,
        causation_id: causationId,
        provider: command.provider,
        environment: context.account_context.account_type,
        account_id: command.account_id,
        symbol: signal.symbol,
        side: sideTruth,
        status: "READY_FOR_DISPATCH",
        payload: Object.freeze({
          p_provider: command.provider,
          p_environment: context.account_context.account_type,
          p_account_id: command.account_id,
          p_symbol: signal.symbol,
          p_direction: sideTruth,
          p_status: "READY_FOR_DISPATCH",
          p_quantity: qty,
          p_entry_price: signal.entry_price,
          p_stop_loss: signal.stop_loss,
          p_take_profit_1: signal.tp1,
          p_take_profit_2: signal.tp2,
        }),
        idempotency_key: `idemp_truth_${signal.signal_id}_${command.account_id}`,
      });
      tradeTruthIntents.push(truthIntent);

      // 9. Pipeline Completion
      currentState = transitionRuntimeState(currentState, "COMPLETED");
      emitEvent(currentState, { dispatch_intent_id: dispatchIntent.intent_id, truth_intents_count: tradeTruthIntents.length });

      return Object.freeze({
        pipeline_id: pipelineId,
        correlation_id: correlationId,
        status: currentState,
        is_terminal: true,
        is_idempotent_duplicate: false,
        selected_brain: selectedBrainName,
        execution_decision: decision,
        risk_decision: riskDecision,
        capital_plan: capitalPlan,
        dispatch_intent: dispatchIntent,
        trade_truth_intents: Object.freeze(tradeTruthIntents),
        recovery_intents: Object.freeze(recoveryIntents),
        audit_events: Object.freeze(auditEvents),
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const recoveryHandler = getRecoveryHandler();
      const recoveryIntent = recoveryHandler.createRecoveryRequest({
        correlation_id: correlationId,
        causation_id: causationId,
        provider: command.provider,
        account_id: command.account_id,
        reason_code: "RUNTIME_ORCHESTRATION_EXCEPTION",
        description: `Runtime pipeline caught unexpected error: ${errorMessage}`,
        priority: "CRITICAL",
        evidence: { error: errorMessage },
      });
      recoveryIntents.push(recoveryIntent);

      const finalState = transitionRuntimeState(currentState, "RECOVERY_REQUIRED");
      emitEvent(finalState, { error: errorMessage, recovery_id: recoveryIntent.recovery_id });

      return Object.freeze({
        pipeline_id: pipelineId,
        correlation_id: correlationId,
        status: finalState,
        is_terminal: true,
        is_idempotent_duplicate: false,
        selected_brain: "ERROR_ORCHESTRATION",
        trade_truth_intents: Object.freeze([]),
        recovery_intents: Object.freeze(recoveryIntents),
        audit_events: Object.freeze(auditEvents),
        failure_reason: errorMessage,
        completed_at: new Date().toISOString(),
      });
    }
  }
}

export const runtimeOrchestrator = new RuntimeOrchestrator();
