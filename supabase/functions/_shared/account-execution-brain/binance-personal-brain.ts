/**
 * HashiBot Account Execution Brain — Binance Personal Brain Implementation
 * Phase 4 Binance Personal Account Execution Brain
 */

import {
  AccountExecutionBrain,
  AccountExecutionContext,
  AccountLock,
  AccountPolicy,
  ExecutionDecision,
  ExecutionDecisionCode,
  PositionPlan,
  RuleViolation,
  SignalContract,
  TradeManagementPlan,
} from "./types.ts";
import {
  createAccountLock,
  createExecutionDecision,
  createRuleViolation,
} from "./contracts.ts";
import { calculateCapitalManagerPositionPlan } from "../professional-capital-allocation.ts";

export interface BinanceSymbolFilterSpec {
  readonly symbol: string;
  readonly quantity_step: number;
  readonly quantity_precision: number;
  readonly minimum_quantity: number;
  readonly maximum_quantity: number;
  readonly tick_size: number;
  readonly price_precision: number;
  readonly minimum_notional: number;
  readonly maximum_notional: number;
  readonly leverage_ceiling: number;
  readonly margin_mode: "ISOLATED" | "CROSS";
}

export class BinancePersonalBrain implements AccountExecutionBrain {
  readonly provider = "BINANCE" as const;
  readonly brain_version = "1.0.0";

  /**
   * Evaluates a Binance account's operational state against hard drawdown rules and returns an AccountLock if breached.
   */
  checkAccountLock(
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): AccountLock | null {
    const violations: RuleViolation[] = [];

    // 1. Daily Drawdown Violation
    if (
      context.daily_drawdown.is_violated ||
      context.daily_drawdown.current_drawdown_pct >= policy.max_daily_drawdown_pct
    ) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_binance_daily_loss_limit",
          rule_category: "DRAWDOWN_LIMIT",
          severity: "BREACH_LOCK",
          message: `Binance daily loss limit breached: current drawdown ${context.daily_drawdown.current_drawdown_pct.toFixed(2)}% >= max allowed ${policy.max_daily_drawdown_pct}%`,
          evidence: {
            current_drawdown_pct: context.daily_drawdown.current_drawdown_pct,
            max_daily_drawdown_pct: policy.max_daily_drawdown_pct,
            starting_balance: context.daily_drawdown.starting_balance,
            peak_equity: context.daily_drawdown.peak_equity,
          },
          recommended_action: "CLOSE_OPEN_POSITIONS",
        })
      );
    }

    // 2. Total Drawdown Violation
    if (
      context.total_drawdown.is_violated ||
      context.total_drawdown.current_drawdown_pct >= policy.max_total_drawdown_pct
    ) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_binance_total_drawdown_limit",
          rule_category: "DRAWDOWN_LIMIT",
          severity: "BREACH_LOCK",
          message: `Binance max total drawdown breached: current drawdown ${context.total_drawdown.current_drawdown_pct.toFixed(2)}% >= max allowed ${policy.max_total_drawdown_pct}%`,
          evidence: {
            current_drawdown_pct: context.total_drawdown.current_drawdown_pct,
            max_total_drawdown_pct: policy.max_total_drawdown_pct,
            initial_balance: context.total_drawdown.initial_balance,
            high_water_mark: context.total_drawdown.high_water_mark,
          },
          recommended_action: "CLOSE_OPEN_POSITIONS",
        })
      );
    }

    if (violations.length > 0) {
      const primaryReason = violations.some((v) => v.rule_id === "rule_binance_daily_loss_limit")
        ? "DAILY_LOSS_BREACH"
        : "MAX_DRAWDOWN_BREACH";

      return createAccountLock({
        lock_id: `lock_binance_${context.account_id}_${Date.now()}`,
        account_id: context.account_id,
        reason: primaryReason,
        locked_by: "BinancePersonalBrain",
        release_conditions: "Requires daily UTC reset and manual operator clearance",
        violations,
      });
    }

    return null;
  }

  /**
   * Main deterministic signal evaluation pipeline for Binance Personal USDT-margined Futures accounts.
   */
  evaluateSignal(
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): ExecutionDecision {
    const violations: RuleViolation[] = [];

    // 1. Account Lock Check (Daily Loss / Max Drawdown)
    const activeLock = this.checkAccountLock(context, policy);
    if (activeLock !== null) {
      const isDailyLoss = activeLock.reason === "DAILY_LOSS_BREACH";
      return createExecutionDecision({
        decision: "LOCK_ACCOUNT",
        decision_code: isDailyLoss ? "LOCKED_DAILY_LOSS_BREACH" : "LOCKED_MAX_DRAWDOWN_BREACH",
        reason: isDailyLoss
          ? `Account locked: Daily loss limit exceeded (${context.daily_drawdown.current_drawdown_pct.toFixed(2)}% >= ${policy.max_daily_drawdown_pct}%)`
          : `Account locked: Max total drawdown limit exceeded (${context.total_drawdown.current_drawdown_pct.toFixed(2)}% >= ${policy.max_total_drawdown_pct}%)`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: activeLock.violations,
        lock_details: activeLock,
      });
    }

    // 2. Runtime & Provider Health / Connectivity Check
    if (
      !context.runtime_health.is_healthy ||
      context.runtime_health.bridge_status === "DISCONNECTED" ||
      context.runtime_health.bridge_status === "DEGRADED"
    ) {
      const healthViolation = createRuleViolation({
        rule_id: "rule_binance_provider_health",
        rule_category: "HEALTH_CHECK",
        severity: "CRITICAL_BLOCK",
        message: `Binance exchange connection status is ${context.runtime_health.bridge_status} (healthy=${context.runtime_health.is_healthy})`,
        evidence: {
          bridge_status: context.runtime_health.bridge_status,
          is_healthy: context.runtime_health.is_healthy,
          error_count_last_hour: context.runtime_health.error_count_last_hour,
        },
        recommended_action: "RETRY_LATER",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_PROVIDER_DEGRADED",
        reason: "Execution skipped: Binance exchange connection or API endpoint is degraded or disconnected",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [healthViolation],
      });
    }

    // 3. Trading Session Check
    if (!context.session_state.is_session_open) {
      const sessionViolation = createRuleViolation({
        rule_id: "rule_binance_session_closed",
        rule_category: "SESSION_RESTRICTION",
        severity: "WARNING",
        message: "Trading session is currently closed for execution",
        evidence: {
          session_state: context.session_state,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_MARKET_CLOSED",
        reason: "Execution skipped: Market session is closed",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [sessionViolation],
      });
    }

    // 4. High-Impact News Window Check
    if (
      policy.news_restriction.mode !== "ALLOW" &&
      context.news_state.in_high_impact_news_window
    ) {
      const newsViolation = createRuleViolation({
        rule_id: "rule_binance_news_restriction",
        rule_category: "NEWS_RESTRICTION",
        severity: "CRITICAL_BLOCK",
        message: `High-impact news window active (${context.news_state.news_event_title ?? "Economic Event"})`,
        evidence: {
          news_state: context.news_state,
          policy_restriction: policy.news_restriction,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_NEWS_RESTRICTION",
        reason: "Execution skipped: High-impact economic news event window restriction in effect",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [newsViolation],
      });
    }

    // 5. Symbol Eligibility Check
    if (
      policy.allowed_symbols !== null &&
      !policy.allowed_symbols.includes(signal.symbol)
    ) {
      const symbolViolation = createRuleViolation({
        rule_id: "rule_binance_symbol_not_allowed",
        rule_category: "SYMBOL_LIMIT",
        severity: "CRITICAL_BLOCK",
        message: `Symbol ${signal.symbol} is not permitted under Binance policy ${policy.policy_id}`,
        evidence: {
          symbol: signal.symbol,
          allowed_symbols: policy.allowed_symbols,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: `Execution skipped: Symbol ${signal.symbol} is not in the allowed trading policy list`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [symbolViolation],
      });
    }

    // 6. Max Total Open Positions Check
    const activePosCount = context.exposure.active_position_count;
    if (activePosCount >= policy.max_open_positions_total) {
      const posCapViolation = createRuleViolation({
        rule_id: "rule_binance_max_open_positions_total",
        rule_category: "EXPOSURE_CAP",
        severity: "CRITICAL_BLOCK",
        message: `Maximum open positions cap reached (${activePosCount} >= ${policy.max_open_positions_total})`,
        evidence: {
          active_position_count: activePosCount,
          max_open_positions_total: policy.max_open_positions_total,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_MAX_POSITIONS_REACHED",
        reason: `Execution skipped: Maximum total open positions limit (${policy.max_open_positions_total}) reached`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [posCapViolation],
      });
    }

    // 7. Single Position Per Symbol Check (Duplicate Position Rule)
    const existingSymbolPositions = context.open_positions.filter(
      (pos) => pos.symbol === signal.symbol
    ).length;

    if (existingSymbolPositions >= policy.max_open_positions_per_symbol) {
      const symbolDupViolation = createRuleViolation({
        rule_id: "rule_binance_max_positions_per_symbol",
        rule_category: "SYMBOL_LIMIT",
        severity: "CRITICAL_BLOCK",
        message: `An active position already exists for symbol ${signal.symbol} (${existingSymbolPositions} >= ${policy.max_open_positions_per_symbol})`,
        evidence: {
          symbol: signal.symbol,
          existing_positions: existingSymbolPositions,
          max_per_symbol: policy.max_open_positions_per_symbol,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_SYMBOL_POSITION_EXISTS",
        reason: `Execution skipped: Active position already exists for symbol ${signal.symbol}`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [symbolDupViolation],
      });
    }

    // 8. Leverage Limit Check
    if (context.leverage > policy.max_leverage_allowed) {
      const levViolation = createRuleViolation({
        rule_id: "rule_binance_leverage_limit",
        rule_category: "RISK_CAP",
        severity: "CRITICAL_BLOCK",
        message: `Account leverage ${context.leverage}x exceeds maximum policy leverage ${policy.max_leverage_allowed}x`,
        evidence: {
          account_leverage: context.leverage,
          max_leverage_allowed: policy.max_leverage_allowed,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: `Execution skipped: Account leverage (${context.leverage}x) exceeds policy ceiling (${policy.max_leverage_allowed}x)`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [levViolation],
      });
    }

    // 9. Stop Loss Distance & Required Margin / Wallet Balance Check
    const slDistance = Math.abs(signal.entry_price - signal.stop_loss);
    if (slDistance <= 0 || !Number.isFinite(slDistance)) {
      const slViolation = createRuleViolation({
        rule_id: "rule_binance_invalid_stop_loss",
        rule_category: "RISK_CAP",
        severity: "CRITICAL_BLOCK",
        message: `Invalid stop loss distance (${slDistance})`,
        evidence: { entry_price: signal.entry_price, stop_loss: signal.stop_loss },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: "Execution skipped: Invalid or zero stop-loss distance provided in signal",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [slViolation],
      });
    }

    const targetRiskPct = policy.max_risk_per_trade_pct;
    const targetRiskUSD = context.balance * (targetRiskPct / 100);
    const theoreticalQuantity = targetRiskUSD / slDistance;
    const effectiveLeverage = Math.min(context.leverage, policy.max_leverage_allowed);
    const theoreticalNotional = theoreticalQuantity * signal.entry_price;
    const requiredMargin = theoreticalNotional / effectiveLeverage;

    if (context.free_margin < requiredMargin) {
      const marginViolation = createRuleViolation({
        rule_id: "rule_binance_insufficient_margin",
        rule_category: "RISK_CAP",
        severity: "CRITICAL_BLOCK",
        message: `Insufficient available margin: $${context.free_margin.toFixed(2)} USDT available, $${requiredMargin.toFixed(2)} required`,
        evidence: {
          available_margin: context.free_margin,
          required_margin: Number(requiredMargin.toFixed(2)),
          theoretical_notional: Number(theoreticalNotional.toFixed(2)),
          theoretical_quantity: Number(theoreticalQuantity.toFixed(4)),
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: `Execution skipped: Insufficient available margin ($${context.free_margin.toFixed(2)} available vs $${requiredMargin.toFixed(2)} required)`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [marginViolation],
      });
    }

    // 10. Portfolio Risk Scaling & Drawdown Safety Buffer Rules (REDUCE_RISK)
    let authorizedRiskPct = policy.max_risk_per_trade_pct;
    let decisionCode: ExecutionDecisionCode = "APPROVED_FULL_RISK";
    let decisionKind: "EXECUTE" | "REDUCE_RISK" = "EXECUTE";
    let decisionReason = "Signal meets all Binance Personal account policy rules at full authorized risk";

    const currentOpenRiskPct = context.exposure.total_open_risk_pct;
    const remainingPortfolioRiskRoom = policy.max_portfolio_risk_pct - currentOpenRiskPct;

    if (remainingPortfolioRiskRoom <= 0) {
      const portfolioRiskCapViolation = createRuleViolation({
        rule_id: "rule_binance_portfolio_risk_cap",
        rule_category: "EXPOSURE_CAP",
        severity: "CRITICAL_BLOCK",
        message: `Total portfolio open risk cap reached (${currentOpenRiskPct.toFixed(2)}% >= ${policy.max_portfolio_risk_pct}%)`,
        evidence: {
          total_open_risk_pct: currentOpenRiskPct,
          max_portfolio_risk_pct: policy.max_portfolio_risk_pct,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_MAX_POSITIONS_REACHED",
        reason: `Execution skipped: Total portfolio open risk (${currentOpenRiskPct.toFixed(2)}%) meets or exceeds max portfolio risk cap (${policy.max_portfolio_risk_pct}%)`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [portfolioRiskCapViolation],
      });
    }

    // Scaled risk if adding full trade risk would exceed max portfolio risk cap
    if (authorizedRiskPct > remainingPortfolioRiskRoom) {
      authorizedRiskPct = Number(remainingPortfolioRiskRoom.toFixed(2));
      decisionKind = "REDUCE_RISK";
      decisionCode = "REDUCED_PORTFOLIO_EXPOSURE_CAP";
      decisionReason = `Authorized risk scaled down to ${authorizedRiskPct}% to stay within portfolio risk cap (${policy.max_portfolio_risk_pct}%)`;

      violations.push(
        createRuleViolation({
          rule_id: "rule_binance_scaled_portfolio_risk",
          rule_category: "EXPOSURE_CAP",
          severity: "WARNING",
          message: `Risk scaled from ${policy.max_risk_per_trade_pct}% to ${authorizedRiskPct}% due to portfolio exposure limit`,
          evidence: {
            original_risk_pct: policy.max_risk_per_trade_pct,
            authorized_risk_pct: authorizedRiskPct,
            max_portfolio_risk_pct: policy.max_portfolio_risk_pct,
            current_open_risk_pct: currentOpenRiskPct,
          },
          recommended_action: "REDUCE_POSITION_SIZE",
        })
      );
    }

    // Safety buffer reduction: if daily drawdown is >= 75% of max daily drawdown cap
    const drawdownThreshold = policy.max_daily_drawdown_pct * 0.75;
    if (context.daily_drawdown.current_drawdown_pct >= drawdownThreshold) {
      const safetyScaledRisk = Number((authorizedRiskPct * 0.5).toFixed(2));
      if (safetyScaledRisk < authorizedRiskPct) {
        authorizedRiskPct = Math.max(0.1, safetyScaledRisk);
        decisionKind = "REDUCE_RISK";
        decisionCode = "REDUCED_DRAWDOWN_SAFETY_BUFFER";
        decisionReason = `Authorized risk scaled down to ${authorizedRiskPct}% due to daily drawdown safety buffer (${context.daily_drawdown.current_drawdown_pct.toFixed(2)}% drawdown)`;

        violations.push(
          createRuleViolation({
            rule_id: "rule_binance_drawdown_safety_buffer",
            rule_category: "RISK_CAP",
            severity: "WARNING",
            message: `Risk scaled down to ${authorizedRiskPct}%: current drawdown ${context.daily_drawdown.current_drawdown_pct.toFixed(2)}% is above 75% safety threshold`,
            evidence: {
              current_drawdown_pct: context.daily_drawdown.current_drawdown_pct,
              safety_threshold_pct: drawdownThreshold,
              authorized_risk_pct: authorizedRiskPct,
            },
            recommended_action: "REDUCE_POSITION_SIZE",
          })
        );
      }
    }

    return createExecutionDecision({
      decision: decisionKind,
      decision_code: decisionCode,
      reason: decisionReason,
      account_id: context.account_id,
      signal_id: signal.signal_id,
      authorized_risk_pct: authorizedRiskPct,
      rule_violations: violations,
      lock_details: null,
    });
  }

  /**
   * Consumes Capital Manager output to yield an immutable PositionPlan.
   * Does NOT independently calculate lot size, risk amount, margin, or notional.
   * Returns null if decision is SKIP or LOCK_ACCOUNT.
   */
  createPositionPlan(
    decision: ExecutionDecision,
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy,
    filterSpec?: BinanceSymbolFilterSpec
  ): PositionPlan | null {
    if (decision.decision !== "EXECUTE" && decision.decision !== "REDUCE_RISK") {
      return null;
    }

    return calculateCapitalManagerPositionPlan({
      provider: "BINANCE",
      decision,
      signal,
      context,
      policy,
      contract_spec: filterSpec
        ? {
            quantity_step: filterSpec.quantity_step,
            quantity_precision: filterSpec.quantity_precision,
            min_quantity: filterSpec.minimum_quantity,
            max_quantity: filterSpec.maximum_quantity,
            min_notional: filterSpec.minimum_notional,
            max_notional: filterSpec.maximum_notional,
            tick_size: filterSpec.tick_size,
            price_precision: filterSpec.price_precision,
          }
        : undefined,
    });
  }

  /**
   * Validates a Capital Manager PositionPlan against Binance-specific exchange symbol filters.
   * Does NOT rewrite financial values.
   */
  validatePositionPlan(
    plan: PositionPlan,
    context: AccountExecutionContext,
    _policy: AccountPolicy,
    filterSpec: BinanceSymbolFilterSpec
  ): { valid: boolean; violations: RuleViolation[] } {
    const violations: RuleViolation[] = [];

    // Quantity precision / step size check
    if (filterSpec.quantity_step > 0) {
      const remainder = (plan.quantity / filterSpec.quantity_step) % 1;
      if (remainder > 1e-6 && remainder < 0.999999) {
        violations.push(
          createRuleViolation({
            rule_id: "rule_binance_quantity_step_size",
            rule_category: "RISK_CAP",
            severity: "CRITICAL_BLOCK",
            message: `Position plan quantity (${plan.quantity}) does not align with step size (${filterSpec.quantity_step})`,
            evidence: { quantity: plan.quantity, step_size: filterSpec.quantity_step },
            recommended_action: "REDUCE_POSITION_SIZE",
          })
        );
      }
    }

    // Minimum quantity check
    if (plan.quantity < filterSpec.minimum_quantity) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_binance_minimum_quantity",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Position plan quantity (${plan.quantity}) is below minimum allowed (${filterSpec.minimum_quantity})`,
          evidence: { quantity: plan.quantity, minimum_quantity: filterSpec.minimum_quantity },
          recommended_action: "SKIP_SIGNAL",
        })
      );
    }

    // Maximum quantity check
    if (plan.quantity > filterSpec.maximum_quantity) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_binance_maximum_quantity",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Position plan quantity (${plan.quantity}) exceeds maximum allowed (${filterSpec.maximum_quantity})`,
          evidence: { quantity: plan.quantity, maximum_quantity: filterSpec.maximum_quantity },
          recommended_action: "REDUCE_POSITION_SIZE",
        })
      );
    }

    // Minimum notional check
    if (plan.expected_notional < filterSpec.minimum_notional) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_binance_minimum_notional",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Position plan expected notional ($${plan.expected_notional.toFixed(2)}) is below minimum notional filter ($${filterSpec.minimum_notional.toFixed(2)})`,
          evidence: { expected_notional: plan.expected_notional, minimum_notional: filterSpec.minimum_notional },
          recommended_action: "SKIP_SIGNAL",
        })
      );
    }

    // Leverage ceiling check
    if (plan.leverage > filterSpec.leverage_ceiling) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_binance_leverage_bracket_ceiling",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Plan leverage (${plan.leverage}x) exceeds Binance symbol bracket ceiling (${filterSpec.leverage_ceiling}x)`,
          evidence: { plan_leverage: plan.leverage, leverage_ceiling: filterSpec.leverage_ceiling },
          recommended_action: "REDUCE_POSITION_SIZE",
        })
      );
    }

    // Free margin check
    if (context.free_margin < plan.required_margin) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_binance_plan_insufficient_margin",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Required margin ($${plan.required_margin.toFixed(2)}) exceeds free available margin ($${context.free_margin.toFixed(2)})`,
          evidence: { required_margin: plan.required_margin, free_margin: context.free_margin },
          recommended_action: "SKIP_SIGNAL",
        })
      );
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Generates a TradeManagementPlan specifying lifecycle supervision rules for Binance accounts.
   * Returns null if decision is SKIP or LOCK_ACCOUNT.
   */
  createTradeManagementPlan(
    decision: ExecutionDecision,
    signal: SignalContract,
    context: AccountExecutionContext
  ): TradeManagementPlan | null {
    if (decision.decision !== "EXECUTE" && decision.decision !== "REDUCE_RISK") {
      return null;
    }

    const slDistance = Math.abs(signal.entry_price - signal.stop_loss);
    const tp1Distance = Math.abs(signal.tp1 - signal.entry_price);
    const tp1Ratio = slDistance > 0 ? Number((tp1Distance / slDistance).toFixed(2)) : 1.5;

    const tp2Distance = signal.tp2 ? Math.abs(signal.tp2 - signal.entry_price) : tp1Distance * 2;
    const tp2Ratio = slDistance > 0 ? Number((tp2Distance / slDistance).toFixed(2)) : 3.0;

    const isBuy = signal.direction === "BUY";
    // Lock offset 0.1% of price for crypto
    const lockOffset = signal.entry_price * 0.001;
    const breakevenPrice = isBuy ? signal.entry_price + lockOffset : signal.entry_price - lockOffset;

    return Object.freeze({
      management_plan_id: `tm_${context.user_id}_${context.account_id}_binance_${signal.signal_id}`,
      signal_id: signal.signal_id,
      account_id: context.account_id,
      tp1_policy: Object.freeze({
        ratio: tp1Ratio,
        exit_pct: 50,
        move_sl_to_be: true,
        profit_lock_offset: lockOffset,
      }),
      tp2_policy: Object.freeze({
        ratio: tp2Ratio,
        exit_pct: 50,
        enable_trailing: true,
      }),
      breakeven_policy: Object.freeze({
        trigger_rr: 1.0,
        lock_offset_price: Number(breakevenPrice.toFixed(4)),
      }),
      trailing_policy: Object.freeze({
        type: "ATR_TRAILING",
        distance: signal.entry_price * 0.01,
      }),
      timeout_policy: Object.freeze({
        max_holding_hours: 72,
        action_on_timeout: "CLOSE_MARKET",
      }),
    });
  }
}

export const binancePersonalBrain = new BinancePersonalBrain();
