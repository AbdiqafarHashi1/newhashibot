/**
 * HashiBot Account Execution Brain — Ownership Boundaries Contract
 * Phase 1A Architectural Contract Layer
 */

export type ExecutionResponsibility =
  | "SIGNAL_GENERATION"
  | "SIGNAL_APPROVAL"
  | "EXECUTION_DECISION"
  | "POSITION_SIZING"
  | "RISK_VALIDATION"
  | "ORDER_PLACEMENT"
  | "PROTECTION_VERIFICATION"
  | "TRADE_LIFECYCLE"
  | "PERSISTENT_STATE";

export interface OwnershipBoundary {
  readonly responsibility: ExecutionResponsibility;
  readonly single_owner_component: string;
  readonly canonical_location: string;
  readonly primary_output: string;
  readonly prohibition: string;
}

export const HASHIBOT_OWNERSHIP_MATRIX: Readonly<Record<ExecutionResponsibility, OwnershipBoundary>> = Object.freeze({
  SIGNAL_GENERATION: Object.freeze({
    responsibility: "SIGNAL_GENERATION",
    single_owner_component: "Market Scanner",
    canonical_location: "supabase/functions/market-scanner/index.ts",
    primary_output: "strategy_candidates",
    prohibition: "No other module may generate candidate trades or scan price action.",
  }),

  SIGNAL_APPROVAL: Object.freeze({
    responsibility: "SIGNAL_APPROVAL",
    single_owner_component: "Arbitrator",
    canonical_location: "supabase/functions/_shared/arbitrator.ts",
    primary_output: "signals (status = APPROVED)",
    prohibition: "No other component may approve or rank trading setups.",
  }),

  EXECUTION_DECISION: Object.freeze({
    responsibility: "EXECUTION_DECISION",
    single_owner_component: "Account Execution Brain",
    canonical_location: "supabase/functions/_shared/account-execution-brain/",
    primary_output: "ExecutionDecision (EXECUTE, SKIP, REDUCE_RISK, LOCK_ACCOUNT)",
    prohibition: "No provider script or cron job may decide whether to execute or skip independently.",
  }),

  POSITION_SIZING: Object.freeze({
    responsibility: "POSITION_SIZING",
    single_owner_component: "Capital Manager",
    canonical_location: "supabase/functions/_shared/professional-capital-allocation.ts",
    primary_output: "PositionPlan (Gates 0-9 Sizing Certificate)",
    prohibition: "No exchange order handler or MT5 bridge script may calculate position lot sizes.",
  }),

  RISK_VALIDATION: Object.freeze({
    responsibility: "RISK_VALIDATION",
    single_owner_component: "Risk Engine",
    canonical_location: "supabase/functions/_shared/professional-risk-engine.ts",
    primary_output: "AuthorizedEnvelope",
    prohibition: "No provider script may bypass risk envelope verification.",
  }),

  ORDER_PLACEMENT: Object.freeze({
    responsibility: "ORDER_PLACEMENT",
    single_owner_component: "Provider Adapters",
    canonical_location: "binance-testnet-execution, bybit-demo-execution, mt5-bridge",
    primary_output: "Exchange Order IDs & Fills",
    prohibition: "No strategy, scanner, or brain code may directly call exchange APIs.",
  }),

  PROTECTION_VERIFICATION: Object.freeze({
    responsibility: "PROTECTION_VERIFICATION",
    single_owner_component: "Protection Engine",
    canonical_location: "supabase/functions/_shared/professional-protection-verification.ts",
    primary_output: "Protection Verification Report (protected_native / unprotected_failed)",
    prohibition: "No order execution is marked complete without explicit Protection Engine verification.",
  }),

  TRADE_LIFECYCLE: Object.freeze({
    responsibility: "TRADE_LIFECYCLE",
    single_owner_component: "Trade Management Supervisors",
    canonical_location: "binance-testnet-monitor, bybit-testnet-monitor, mt5-bridge",
    primary_output: "Trade Management Transitions (TP1, BE, Trailing, Close)",
    prohibition: "No scanner or UI code may directly execute partial closes or BE adjustments.",
  }),

  PERSISTENT_STATE: Object.freeze({
    responsibility: "PERSISTENT_STATE",
    single_owner_component: "Trade Truth Unified",
    canonical_location: "supabase/functions/_shared/trade-truth/index.ts",
    primary_output: "trade_truth_unified",
    prohibition: "No direct uncontrolled writes to trade truth tables without canonical adapters.",
  }),
});

/**
 * Retrieves the single owner for a given execution responsibility.
 */
export function getExecutionResponsibilityOwner(responsibility: ExecutionResponsibility): OwnershipBoundary {
  const boundary = HASHIBOT_OWNERSHIP_MATRIX[responsibility];
  if (!boundary) {
    throw new Error(`Unknown execution responsibility: ${responsibility}`);
  }
  return boundary;
}
