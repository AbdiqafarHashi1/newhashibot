/**
 * HashiBot Account Execution Brain — Common Brain Interface
 * Phase 1A Architectural Contract Layer
 */

import {
  AccountExecutionContext,
  AccountLock,
  AccountPolicy,
  ExecutionDecision,
  PositionPlan,
  SignalContract,
  TradeManagementPlan,
  BrainProvider,
} from "./types.ts";

/**
 * Common contract interface that all future Account Execution Brains
 * (BinancePersonalBrain, BybitPersonalBrain, Mt5PersonalBrain, Mt5PropBrain)
 * MUST implement.
 */
export interface AccountExecutionBrain {
  /**
   * The provider target for this brain.
   */
  readonly provider: BrainProvider;

  /**
   * Version identifier for this brain implementation.
   */
  readonly brain_version: string;

  /**
   * Evaluates an incoming trading signal against the account's real-time context and policy.
   * Deterministic & side-effect free: returns EXECUTE, SKIP, REDUCE_RISK, or LOCK_ACCOUNT.
   */
  evaluateSignal(
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): ExecutionDecision;

  /**
   * Creates an immutable PositionPlan output for Capital Manager when decision allows execution.
   * Returns null if decision is SKIP or LOCK_ACCOUNT.
   */
  createPositionPlan(
    decision: ExecutionDecision,
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): PositionPlan | null;

  /**
   * Creates an immutable TradeManagementPlan for lifecycle trade supervision.
   * Returns null if decision is SKIP or LOCK_ACCOUNT.
   */
  createTradeManagementPlan(
    decision: ExecutionDecision,
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): TradeManagementPlan | null;

  /**
   * Checks whether the current account context violates hard drawdown, daily loss, or prop rules.
   * Returns an AccountLock object if locked/breached, or null if the account is healthy.
   */
  checkAccountLock(
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): AccountLock | null;
}
