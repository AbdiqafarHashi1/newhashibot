/**
 * HashiBot Unified Trade Management Engine — Compatibility & Translation Adapter
 * Phase 6 Architecture
 */

import type { TradeManagementPlan } from "../account-execution-brain/types.ts";
import {
  DEFAULT_BINANCE_PERSONAL_TRADE_POLICY,
  DEFAULT_BYBIT_PERSONAL_TRADE_POLICY,
  DEFAULT_MT5_PERSONAL_TRADE_POLICY,
  DEFAULT_MT5_PROP_TRADE_POLICY,
} from "./contracts.ts";
import {
  TradeAccountType,
  TradeLifecycleSnapshot,
  TradeManagementEvaluation,
  TradeManagementIntent,
  TradeManagementPolicy,
  TradeProvider,
} from "./types.ts";

/**
 * Translates a legacy Account Execution Brain `TradeManagementPlan` into a provider-neutral `TradeManagementPolicy`.
 */
export function adaptLegacyPlanToPolicy(
  plan: TradeManagementPlan,
  provider: TradeProvider,
  accountType: TradeAccountType = "PERSONAL"
): TradeManagementPolicy {
  const basePolicy =
    provider === "MT5_PERSONAL"
      ? DEFAULT_MT5_PERSONAL_TRADE_POLICY
      : provider === "MT5_PROP"
      ? DEFAULT_MT5_PROP_TRADE_POLICY
      : provider === "BINANCE"
      ? DEFAULT_BINANCE_PERSONAL_TRADE_POLICY
      : DEFAULT_BYBIT_PERSONAL_TRADE_POLICY;

  return Object.freeze({
    ...basePolicy,
    policy_id: `pol_adapted_${plan.management_plan_id}`,
    provider,
    account_type: accountType,
    tp1_policy: Object.freeze({
      enabled: plan.tp1_policy.exit_pct > 0,
      trigger_mode: "R_MULTIPLE",
      trigger_value: plan.tp1_policy.ratio || 1.5,
      close_fraction: plan.tp1_policy.exit_pct / 100,
    }),
    tp2_policy: Object.freeze({
      enabled: plan.tp2_policy.exit_pct > 0,
      trigger_mode: "R_MULTIPLE",
      trigger_value: plan.tp2_policy.ratio || 3.0,
      close_fraction: plan.tp2_policy.exit_pct / 100,
    }),
    breakeven_policy: Object.freeze({
      enabled: plan.tp1_policy.move_sl_to_be || plan.breakeven_policy.trigger_rr > 0,
      trigger_mode: plan.tp1_policy.move_sl_to_be ? "AFTER_TP1" : "R_MULTIPLE",
      trigger_value: plan.breakeven_policy.trigger_rr || 1.5,
      profit_lock_offset_pct: plan.tp1_policy.profit_lock_offset || 0.0005,
    }),
    trailing_policy: Object.freeze({
      mode: plan.tp2_policy.enable_trailing ? "ATR" : "OFF",
      activation_mode: "R_MULTIPLE",
      activation_value: 2.0,
      distance: plan.trailing_policy.distance || 0.002,
      min_update_distance: 0.0005,
      cooldown_seconds: 60,
      runner_only: true,
    }),
    timeout_policy: Object.freeze({
      max_holding_hours: plan.timeout_policy.max_holding_hours || 48,
      action_on_timeout:
        plan.timeout_policy.action_on_timeout === "CLOSE_MARKET"
          ? "CLOSE_MARKET"
          : "NO_ACTION",
    }),
  });
}

/**
 * Translates a TradeManagementEvaluation into a persistence-neutral payload for Trade Truth.
 */
export function translateEvaluationToTradeTruthPayload(
  evaluation: TradeManagementEvaluation
): Record<string, unknown> {
  const snapshot = evaluation.snapshot;
  const primaryIntent = evaluation.intents[0] ?? null;

  return Object.freeze({
    p_status: snapshot.current_lifecycle_state.toLowerCase(),
    p_provider: snapshot.provider.toLowerCase(),
    p_environment: "testnet",
    p_symbol: snapshot.symbol,
    p_direction: snapshot.side.toLowerCase(),
    account_id: snapshot.account_id,
    trade_id: snapshot.trade_id,
    current_lifecycle_state: snapshot.current_lifecycle_state,
    protection_state: snapshot.protection_state,
    tp1_state: snapshot.tp1_state,
    tp2_state: snapshot.tp2_state,
    breakeven_state: snapshot.breakeven_state,
    trailing_state: snapshot.trailing_state,
    current_stop: snapshot.current_stop,
    opened_quantity: snapshot.opened_quantity,
    remaining_quantity: snapshot.remaining_quantity,
    average_entry: snapshot.average_entry,
    current_r_multiple: snapshot.current_r_multiple,
    primary_intent: primaryIntent ? primaryIntent.intent_type : "NO_ACTION",
    intent_reason: primaryIntent ? primaryIntent.reason_code : null,
    evaluation_timestamp: evaluation.evaluation_timestamp,
    position_version: snapshot.position_version,
  });
}
