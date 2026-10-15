/**
 * HashiBot Account Execution Brain — Bybit Personal Brain Implementation
 * Phase 5 Bybit Personal Account Execution Brain
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

export interface BybitSymbolFilterSpec {
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
  readonly margin_mode?: "ISOLATED" | "CROSS";
  readonly maintenance_margin_pct?: number;
  readonly max_position_size?: number;
  readonly allow_reduce_only?: boolean;
}

export interface BybitOperationalState {
  readonly api_authenticated?: boolean;
  readonly futures_permission_active?: boolean;
  readonly provider_maintenance_mode?: boolean;
  readonly account_operational?: boolean;
}

/**
 * Counts decimal places of a numeric value deterministically.
 */
function countDecimals(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const str = value.toString();
  if (str.includes("e-")) {
    const parts = str.split("e-");
    return parseInt(parts[1], 10);
  }
  const parts = str.split(".");
  return parts.length > 1 ? parts[1].length : 0;
}

/**
 * Deterministic decimal-safe step alignment validator.
 * Avoids raw JS floating-point modulo glitches (e.g. 1.234 % 0.001 === 0.0009999999999999121).
 */
function checkStepAlignment(value: number, step: number, precision?: number): boolean {
  if (step <= 0 || !Number.isFinite(value) || !Number.isFinite(step)) return true;

  // Method 1: Floating point distance tolerance
  const stepsFloat = value / step;
  const floatDiff = Math.abs(stepsFloat - Math.round(stepsFloat));
  if (floatDiff < 1e-6) {
    return true;
  }

  // Method 2: Integer scaled modulo
  const dec = Math.max(countDecimals(value), countDecimals(step), precision ?? 0);
  const scale = Math.pow(10, Math.min(10, dec));
  const valueUnits = Math.round(value * scale);
  const stepUnits = Math.round(step * scale);

  if (stepUnits <= 0) return true;
  return valueUnits % stepUnits === 0;
}

export class BybitPersonalBrain implements AccountExecutionBrain {
  readonly provider = "BYBIT" as const;
  readonly brain_version = "1.0.0";

  /**
   * Evaluates a Bybit account's operational state against hard drawdown rules and returns an AccountLock if breached.
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
          rule_id: "rule_bybit_daily_loss_limit",
          rule_category: "DRAWDOWN_LIMIT",
          severity: "BREACH_LOCK",
          message: `Bybit daily loss limit breached: current drawdown ${context.daily_drawdown.current_drawdown_pct.toFixed(2)}% >= max allowed ${policy.max_daily_drawdown_pct}%`,
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
          rule_id: "rule_bybit_total_drawdown_limit",
          rule_category: "DRAWDOWN_LIMIT",
          severity: "BREACH_LOCK",
          message: `Bybit max total drawdown breached: current drawdown ${context.total_drawdown.current_drawdown_pct.toFixed(2)}% >= max allowed ${policy.max_total_drawdown_pct}%`,
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
      const primaryReason = violations.some((v) => v.rule_id === "rule_bybit_daily_loss_limit")
        ? "DAILY_LOSS_BREACH"
        : "MAX_DRAWDOWN_BREACH";

      return createAccountLock({
        lock_id: `lock_bybit_${context.account_id}_${Date.now()}`,
        account_id: context.account_id,
        reason: primaryReason,
        locked_by: "BybitPersonalBrain",
        release_conditions: "Requires daily UTC reset and manual operator clearance",
        violations,
      });
    }

    return null;
  }

  /**
   * Main deterministic signal evaluation pipeline for Bybit Personal USDT-margined Futures accounts.
   */
  evaluateSignal(
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy,
    operationalState?: BybitOperationalState
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

    // 2. Account Operational State Check
    if (operationalState?.account_operational === false) {
      const accViolation = createRuleViolation({
        rule_id: "rule_bybit_account_disabled",
        rule_category: "HEALTH_CHECK",
        severity: "CRITICAL_BLOCK",
        message: "Bybit account is currently disabled or suspended",
        evidence: { account_id: context.account_id },
        recommended_action: "MANUAL_INVESTIGATION",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: "Execution skipped: Bybit account operational state is disabled",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [accViolation],
      });
    }

    // 3. Provider Health & Connectivity Check (Provider-Neutral Terminology)
    if (
      !context.runtime_health.is_healthy ||
      context.runtime_health.bridge_status === "DISCONNECTED" ||
      context.runtime_health.bridge_status === "DEGRADED"
    ) {
      const healthViolation = createRuleViolation({
        rule_id: "rule_bybit_provider_health",
        rule_category: "HEALTH_CHECK",
        severity: "CRITICAL_BLOCK",
        message: `Bybit exchange connectivity status is ${context.runtime_health.bridge_status} (provider health=${context.runtime_health.is_healthy ? "healthy" : "degraded"})`,
        evidence: {
          exchange_connectivity: context.runtime_health.bridge_status,
          provider_health: context.runtime_health.is_healthy,
          error_count_last_hour: context.runtime_health.error_count_last_hour,
        },
        recommended_action: "RETRY_LATER",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_PROVIDER_DEGRADED",
        reason: `Execution skipped: Bybit exchange connectivity is ${context.runtime_health.bridge_status} (healthy=${context.runtime_health.is_healthy})`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [healthViolation],
      });
    }

    // 4. Provider Maintenance Mode
    if (operationalState?.provider_maintenance_mode === true) {
      const maintViolation = createRuleViolation({
        rule_id: "rule_bybit_provider_maintenance",
        rule_category: "HEALTH_CHECK",
        severity: "CRITICAL_BLOCK",
        message: "Bybit exchange API is currently undergoing scheduled maintenance",
        evidence: { provider: "BYBIT" },
        recommended_action: "RETRY_LATER",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_PROVIDER_DEGRADED",
        reason: "Execution skipped: Bybit exchange API is currently in maintenance mode",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [maintViolation],
      });
    }

    // 5. API Authentication & Futures Permissions
    if (operationalState?.api_authenticated === false) {
      const authViolation = createRuleViolation({
        rule_id: "rule_bybit_api_auth_failed",
        rule_category: "HEALTH_CHECK",
        severity: "CRITICAL_BLOCK",
        message: "Bybit API authentication failed or credentials are key-invalid",
        evidence: { account_id: context.account_id },
        recommended_action: "MANUAL_INVESTIGATION",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: "Execution skipped: Bybit API key authentication failed",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [authViolation],
      });
    }

    if (operationalState?.futures_permission_active === false) {
      const permViolation = createRuleViolation({
        rule_id: "rule_bybit_futures_permission_missing",
        rule_category: "POLICY_MISMATCH",
        severity: "CRITICAL_BLOCK",
        message: "Account API key lacks USDT Futures trading permission on Bybit",
        evidence: { account_id: context.account_id },
        recommended_action: "MANUAL_INVESTIGATION",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: "Execution skipped: USDT Futures trading permission missing on API key",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [permViolation],
      });
    }

    // 6. Market Session Check
    if (!context.session_state.is_session_open) {
      const sessionViolation = createRuleViolation({
        rule_id: "rule_bybit_market_session_closed",
        rule_category: "SESSION_RESTRICTION",
        severity: "CRITICAL_BLOCK",
        message: `Trading session closed or inactive: ${context.session_state.active_session_name}`,
        evidence: {
          session_name: context.session_state.active_session_name,
          current_time_utc: context.session_state.current_time_utc,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_MARKET_CLOSED",
        reason: `Execution skipped: Trading session ${context.session_state.active_session_name} is closed`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [sessionViolation],
      });
    }

    // 7. News Restriction Check
    if (
      policy.news_restriction.mode !== "ALLOW" &&
      context.news_state.in_high_impact_news_window
    ) {
      const newsViolation = createRuleViolation({
        rule_id: "rule_bybit_news_window_active",
        rule_category: "NEWS_RESTRICTION",
        severity: "CRITICAL_BLOCK",
        message: `High-impact news window active (${context.news_state.news_event_title ?? "High Impact Event"})`,
        evidence: {
          event_title: context.news_state.news_event_title,
          minutes_to_news: context.news_state.minutes_to_news,
          restriction_mode: policy.news_restriction.mode,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_NEWS_RESTRICTION",
        reason: `Execution skipped: Active high-impact news restriction (${context.news_state.news_event_title ?? "News Event"})`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [newsViolation],
      });
    }

    // 8. Weekend Holding Restriction
    if (policy.weekend_restriction.mode === "BLOCK_ENTRY" || policy.weekend_restriction.mode === "MANDATORY_CLOSE") {
      const currentDay = new Date(context.session_state.current_time_utc).getUTCDay();
      // Saturday (6) or Sunday (0)
      if (currentDay === 0 || currentDay === 6) {
        const weekendViolation = createRuleViolation({
          rule_id: "rule_bybit_weekend_restriction",
          rule_category: "WEEKEND_RESTRICTION",
          severity: "CRITICAL_BLOCK",
          message: `Weekend entry restricted by policy mode (${policy.weekend_restriction.mode})`,
          evidence: {
            day_of_week: currentDay,
            restriction_mode: policy.weekend_restriction.mode,
          },
          recommended_action: "SKIP_SIGNAL",
        });

        return createExecutionDecision({
          decision: "SKIP",
          decision_code: "SKIPPED_WEEKEND_RESTRICTION",
          reason: "Execution skipped: Weekend trading entry restricted by policy",
          account_id: context.account_id,
          signal_id: signal.signal_id,
          authorized_risk_pct: 0,
          rule_violations: [weekendViolation],
        });
      }
    }

    // 9. Policy Symbol Eligibility (Allowlist)
    if (policy.allowed_symbols !== null && !policy.allowed_symbols.includes(signal.symbol)) {
      const symbolNotAllowedViolation = createRuleViolation({
        rule_id: "rule_bybit_symbol_not_allowed",
        rule_category: "SYMBOL_LIMIT",
        severity: "CRITICAL_BLOCK",
        message: `Symbol ${signal.symbol} is not included in account policy allowed list`,
        evidence: {
          symbol: signal.symbol,
          allowed_symbols: policy.allowed_symbols,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: `Execution skipped: Symbol ${signal.symbol} is not permitted by account policy`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [symbolNotAllowedViolation],
      });
    }

    // 10. Open Positions Cap & Duplicate Position Check
    if (context.exposure.active_position_count >= policy.max_open_positions_total) {
      const maxPosViolation = createRuleViolation({
        rule_id: "rule_bybit_max_positions_reached",
        rule_category: "EXPOSURE_CAP",
        severity: "CRITICAL_BLOCK",
        message: `Maximum active positions reached (${context.exposure.active_position_count} >= ${policy.max_open_positions_total})`,
        evidence: {
          active_positions: context.exposure.active_position_count,
          max_allowed: policy.max_open_positions_total,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_MAX_POSITIONS_REACHED",
        reason: `Execution skipped: Maximum active portfolio positions (${policy.max_open_positions_total}) reached`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [maxPosViolation],
      });
    }

    const symbolPosCount = context.exposure.positions_by_symbol[signal.symbol] ?? 0;
    if (symbolPosCount >= policy.max_open_positions_per_symbol) {
      const symbolDupViolation = createRuleViolation({
        rule_id: "rule_bybit_symbol_position_exists",
        rule_category: "SYMBOL_LIMIT",
        severity: "CRITICAL_BLOCK",
        message: `Open position already exists for symbol ${signal.symbol} (${symbolPosCount} >= ${policy.max_open_positions_per_symbol})`,
        evidence: {
          symbol: signal.symbol,
          symbol_open_positions: symbolPosCount,
          max_allowed_per_symbol: policy.max_open_positions_per_symbol,
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

    // 11. Leverage Limit Check
    if (context.leverage > policy.max_leverage_allowed) {
      const levViolation = createRuleViolation({
        rule_id: "rule_bybit_leverage_limit",
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

    // 12. Stop Loss Distance & Required Margin Check
    const slDistance = Math.abs(signal.entry_price - signal.stop_loss);
    if (slDistance <= 0 || !Number.isFinite(slDistance)) {
      const slViolation = createRuleViolation({
        rule_id: "rule_bybit_invalid_stop_loss",
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
        rule_id: "rule_bybit_insufficient_margin",
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

    // 13. Portfolio Risk Scaling & Drawdown Safety Buffer Rules (REDUCE_RISK)
    let authorizedRiskPct = policy.max_risk_per_trade_pct;
    let decisionCode: ExecutionDecisionCode = "APPROVED_FULL_RISK";
    let decisionKind: "EXECUTE" | "REDUCE_RISK" = "EXECUTE";
    let decisionReason = "Signal meets all Bybit Personal account policy rules at full authorized risk";

    const currentOpenRiskPct = context.exposure.total_open_risk_pct;
    const remainingPortfolioRiskRoom = policy.max_portfolio_risk_pct - currentOpenRiskPct;

    if (remainingPortfolioRiskRoom <= 0) {
      const portfolioRiskCapViolation = createRuleViolation({
        rule_id: "rule_bybit_portfolio_risk_cap",
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
          rule_id: "rule_bybit_scaled_portfolio_risk",
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
            rule_id: "rule_bybit_drawdown_safety_buffer",
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
    filterSpec?: BybitSymbolFilterSpec
  ): PositionPlan | null {
    if (decision.decision !== "EXECUTE" && decision.decision !== "REDUCE_RISK") {
      return null;
    }

    return calculateCapitalManagerPositionPlan({
      provider: "BYBIT",
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
   * Validates a Capital Manager PositionPlan against Bybit-specific exchange symbol filters.
   * Does NOT rewrite or recalculate financial values.
   */
  validatePositionPlan(
    plan: PositionPlan,
    context: AccountExecutionContext,
    _policy: AccountPolicy,
    filterSpec: BybitSymbolFilterSpec
  ): { valid: boolean; violations: RuleViolation[] } {
    const violations: RuleViolation[] = [];

    // 1. Quantity step size alignment check (decimal-safe)
    if (filterSpec.quantity_step > 0) {
      if (!checkStepAlignment(plan.quantity, filterSpec.quantity_step, filterSpec.quantity_precision)) {
        violations.push(
          createRuleViolation({
            rule_id: "rule_bybit_quantity_step_size",
            rule_category: "RISK_CAP",
            severity: "CRITICAL_BLOCK",
            message: `Position plan quantity (${plan.quantity}) does not align with step size (${filterSpec.quantity_step})`,
            evidence: { quantity: plan.quantity, step_size: filterSpec.quantity_step },
            recommended_action: "REDUCE_POSITION_SIZE",
          })
        );
      }
    }

    // 2. Minimum quantity check
    if (plan.quantity < filterSpec.minimum_quantity) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_bybit_minimum_quantity",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Position plan quantity (${plan.quantity}) is below minimum allowed (${filterSpec.minimum_quantity})`,
          evidence: { quantity: plan.quantity, minimum_quantity: filterSpec.minimum_quantity },
          recommended_action: "SKIP_SIGNAL",
        })
      );
    }

    // 3. Maximum quantity check
    if (plan.quantity > filterSpec.maximum_quantity) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_bybit_maximum_quantity",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Position plan quantity (${plan.quantity}) exceeds maximum allowed (${filterSpec.maximum_quantity})`,
          evidence: { quantity: plan.quantity, maximum_quantity: filterSpec.maximum_quantity },
          recommended_action: "REDUCE_POSITION_SIZE",
        })
      );
    }

    // 4. Tick size alignment check (price precision)
    if (filterSpec.tick_size > 0) {
      if (!checkStepAlignment(plan.entry_price, filterSpec.tick_size, filterSpec.price_precision)) {
        violations.push(
          createRuleViolation({
            rule_id: "rule_bybit_tick_size",
            rule_category: "RISK_CAP",
            severity: "CRITICAL_BLOCK",
            message: `Entry price (${plan.entry_price}) does not align with Bybit tick size (${filterSpec.tick_size})`,
            evidence: { entry_price: plan.entry_price, tick_size: filterSpec.tick_size },
            recommended_action: "SKIP_SIGNAL",
          })
        );
      }
    }

    // 5. Minimum notional check
    if (plan.expected_notional < filterSpec.minimum_notional) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_bybit_minimum_notional",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Position plan expected notional ($${plan.expected_notional.toFixed(2)}) is below minimum notional filter ($${filterSpec.minimum_notional.toFixed(2)})`,
          evidence: { expected_notional: plan.expected_notional, minimum_notional: filterSpec.minimum_notional },
          recommended_action: "SKIP_SIGNAL",
        })
      );
    }

    // 6. Maximum notional check
    if (filterSpec.maximum_notional > 0 && plan.expected_notional > filterSpec.maximum_notional) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_bybit_maximum_notional",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Position plan expected notional ($${plan.expected_notional.toFixed(2)}) exceeds maximum allowed notional ($${filterSpec.maximum_notional.toFixed(2)})`,
          evidence: { expected_notional: plan.expected_notional, maximum_notional: filterSpec.maximum_notional },
          recommended_action: "REDUCE_POSITION_SIZE",
        })
      );
    }

    // 7. Leverage ceiling check
    if (plan.leverage > filterSpec.leverage_ceiling) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_bybit_leverage_ceiling",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Plan leverage (${plan.leverage}x) exceeds Bybit symbol bracket ceiling (${filterSpec.leverage_ceiling}x)`,
          evidence: { plan_leverage: plan.leverage, leverage_ceiling: filterSpec.leverage_ceiling },
          recommended_action: "REDUCE_POSITION_SIZE",
        })
      );
    }

    // 8. Available free margin check
    if (context.free_margin < plan.required_margin) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_bybit_plan_insufficient_margin",
          rule_category: "RISK_CAP",
          severity: "CRITICAL_BLOCK",
          message: `Required margin ($${plan.required_margin.toFixed(2)}) exceeds free available margin ($${context.free_margin.toFixed(2)})`,
          evidence: { required_margin: plan.required_margin, free_margin: context.free_margin },
          recommended_action: "SKIP_SIGNAL",
        })
      );
    }

    // 9. Maintenance Margin Safety Buffer Check
    if (filterSpec.maintenance_margin_pct !== undefined && filterSpec.maintenance_margin_pct > 0) {
      const maintenanceMarginReq = plan.expected_notional * (filterSpec.maintenance_margin_pct / 100);
      const remainingEquity = context.equity - plan.required_margin;

      if (remainingEquity < maintenanceMarginReq) {
        violations.push(
          createRuleViolation({
            rule_id: "rule_bybit_maintenance_margin_safety",
            rule_category: "RISK_CAP",
            severity: "CRITICAL_BLOCK",
            message: `Remaining equity ($${remainingEquity.toFixed(2)}) is below required maintenance margin safety buffer ($${maintenanceMarginReq.toFixed(2)})`,
            evidence: {
              remaining_equity: remainingEquity,
              maintenance_margin_req: maintenanceMarginReq,
              maintenance_margin_pct: filterSpec.maintenance_margin_pct,
            },
            recommended_action: "REDUCE_POSITION_SIZE",
          })
        );
      }
    }

    // 10. Reduce-Only Compatibility Check
    if (plan.reduce_only && (context.exposure.positions_by_symbol[plan.symbol] ?? 0) === 0) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_bybit_reduce_only_incompatible",
          rule_category: "POLICY_MISMATCH",
          severity: "CRITICAL_BLOCK",
          message: `Reduce-only order requested for ${plan.symbol} but no open position exists to reduce`,
          evidence: { symbol: plan.symbol, open_positions_for_symbol: 0 },
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
   * Generates a TradeManagementPlan specifying lifecycle supervision rules for Bybit accounts.
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
    // Profit lock offset 0.1% of price for crypto
    const lockOffset = signal.entry_price * 0.001;
    const breakevenPrice = isBuy ? signal.entry_price + lockOffset : signal.entry_price - lockOffset;

    return Object.freeze({
      management_plan_id: `tm_${context.user_id}_${context.account_id}_bybit_${signal.signal_id}`,
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

export const bybitPersonalBrain = new BybitPersonalBrain();
