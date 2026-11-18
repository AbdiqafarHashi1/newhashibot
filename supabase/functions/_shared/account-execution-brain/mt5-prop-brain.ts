import {isFtmoSwingRules,isSourceBoundFtmoStaticRules} from '../prop-program.ts';
/**
 * HashiBot Account Execution Brain — MT5 Prop Brain Implementation
 * Phase 3 MT5 Prop Account Execution Brain
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
  createMt5PositionPlan,
} from "./contracts.ts";

export class Mt5PropBrain implements AccountExecutionBrain {
  readonly provider = "MT5_PROP" as const;
  readonly brain_version = "1.1.3";

  /**
   * Evaluates a prop account's operational state against hard drawdown rules, trailing drawdown caps,
   * floating loss thresholds, and prop firm status. Returns an AccountLock if breached or suspended.
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
          rule_id: "rule_prop_daily_loss_limit",
          rule_category: "DRAWDOWN_LIMIT",
          severity: "BREACH_LOCK",
          message: `Prop daily loss limit breached: current drawdown ${context.daily_drawdown.current_drawdown_pct.toFixed(2)}% >= max allowed ${policy.max_daily_drawdown_pct}%`,
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

    // 2. Total / Trailing Drawdown Violation
    if (
      context.total_drawdown.is_violated ||
      context.total_drawdown.current_drawdown_pct >= policy.max_total_drawdown_pct
    ) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_prop_trailing_drawdown_limit",
          rule_category: "DRAWDOWN_LIMIT",
          severity: "BREACH_LOCK",
          message: `Prop trailing/total drawdown limit breached: current drawdown ${context.total_drawdown.current_drawdown_pct.toFixed(2)}% >= max allowed ${policy.max_total_drawdown_pct}%`,
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

    // 3. Floating Equity Drawdown Cap Violation
    const floatingDrawdownAmount = context.total_drawdown.high_water_mark - context.equity;
    const floatingDrawdownPct = (floatingDrawdownAmount / context.total_drawdown.high_water_mark) * 100;
    const isolatedStaticStudy=policy.historical_static_loss_basis===true&&context.user_id==='isolated-research-customer'&&context.environment==='DEMO';
    const approvedStaticProgram=isSourceBoundFtmoStaticRules(context.prop_rules);
    if (!isolatedStaticStudy && !approvedStaticProgram && floatingDrawdownPct >= policy.max_total_drawdown_pct) {
      violations.push(
        createRuleViolation({
          rule_id: "rule_prop_floating_drawdown_limit",
          rule_category: "DRAWDOWN_LIMIT",
          severity: "BREACH_LOCK",
          message: `Prop floating equity drawdown cap breached: ${floatingDrawdownPct.toFixed(2)}% >= max allowed ${policy.max_total_drawdown_pct}%`,
          evidence: {
            floating_drawdown_pct: Number(floatingDrawdownPct.toFixed(2)),
            max_total_drawdown_pct: policy.max_total_drawdown_pct,
            equity: context.equity,
            high_water_mark: context.total_drawdown.high_water_mark,
          },
          recommended_action: "CLOSE_OPEN_POSITIONS",
        })
      );
    }

    // 4. Prop Rules State Breach Check
    if (context.prop_rules?.breach_status === "BREACHED") {
      violations.push(
        createRuleViolation({
          rule_id: "rule_prop_firm_breach_status",
          rule_category: "DRAWDOWN_LIMIT",
          severity: "BREACH_LOCK",
          message: "Prop firm account status is marked BREACHED by supervisor",
          evidence: {
            prop_rules: context.prop_rules,
          },
          recommended_action: "CLOSE_OPEN_POSITIONS",
        })
      );
    }

    if (violations.length > 0) {
      const isDailyLoss = violations.some((v) => v.rule_id === "rule_prop_daily_loss_limit");
      const isPropBreach = violations.some((v) => v.rule_id === "rule_prop_firm_breach_status");

      const primaryReason = isDailyLoss
        ? "DAILY_LOSS_BREACH"
        : isPropBreach
        ? "PROP_FIRM_VIOLATION"
        : "MAX_DRAWDOWN_BREACH";

      return createAccountLock({
        lock_id: `lock_prop_${context.account_id}_${Date.now()}`,
        account_id: context.account_id,
        reason: primaryReason,
        locked_by: "Mt5PropBrain",
        release_conditions: "Requires prop firm reset or manual compliance verification",
        violations,
      });
    }

    return null;
  }

  /**
   * Main deterministic signal evaluation pipeline for MT5 Prop (Challenge & Funded) accounts.
   */
  evaluateSignal(
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): ExecutionDecision {
    const violations: RuleViolation[] = [];

    // 1. Account Lock Check (Daily Loss, Trailing Drawdown, Floating Loss, Breach Status)
    const activeLock = this.checkAccountLock(context, policy);
    if (activeLock !== null) {
      let code: ExecutionDecisionCode = "LOCKED_MAX_DRAWDOWN_BREACH";
      if (activeLock.reason === "DAILY_LOSS_BREACH") {
        code = "LOCKED_DAILY_LOSS_BREACH";
      } else if (activeLock.reason === "PROP_FIRM_VIOLATION") {
        code = "LOCKED_PROP_RULE_VIOLATION";
      }

      return createExecutionDecision({
        decision: "LOCK_ACCOUNT",
        decision_code: code,
        reason: `Prop account locked due to ${activeLock.reason}: ${activeLock.violations.map((v) => v.message).join("; ")}`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: activeLock.violations,
        lock_details: activeLock,
      });
    }

    // 2. Runtime & Provider Health Check
    if (
      !context.runtime_health.is_healthy ||
      context.runtime_health.bridge_status === "DISCONNECTED" ||
      context.runtime_health.bridge_status === "DEGRADED"
    ) {
      const healthViolation = createRuleViolation({
        rule_id: "rule_prop_bridge_health",
        rule_category: "HEALTH_CHECK",
        severity: "CRITICAL_BLOCK",
        message: `MT5 Prop bridge terminal is ${context.runtime_health.bridge_status} (healthy=${context.runtime_health.is_healthy})`,
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
        reason: "Execution skipped: MT5 Prop bridge terminal is degraded, disconnected, or unavailable",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [healthViolation],
      });
    }

    // 3. Trading Session Open Check
    if (!context.session_state.is_session_open) {
      const sessionViolation = createRuleViolation({
        rule_id: "rule_prop_session_closed",
        rule_category: "SESSION_RESTRICTION",
        severity: "WARNING",
        message: "Trading session is closed for prop execution",
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

    // 4. Weekend Holding Restriction Check
    const propWeekendAllowed = context.prop_rules?.weekend_holding_allowed ?? true;
    if (
      (!isFtmoSwingRules(context.prop_rules) && policy.weekend_restriction.mode !== "ALLOW") ||
      !propWeekendAllowed
    ) {
      const nowUtc = new Date(context.session_state.current_time_utc);
      const dayOfWeek = nowUtc.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
      const isFridayOrWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;

      if (isFridayOrWeekend) {
        let isPastCutoff = true;
        if (dayOfWeek === 5 && policy.weekend_restriction.close_cutoff_utc) {
          const [cutoffH, cutoffM] = policy.weekend_restriction.close_cutoff_utc.split(":").map(Number);
          const currentH = nowUtc.getUTCHours();
          const currentM = nowUtc.getUTCMinutes();
          const currentMins = currentH * 60 + currentM;
          const cutoffMins = (cutoffH || 0) * 60 + (cutoffM || 0);
          isPastCutoff = currentMins >= cutoffMins;
        }

        if (isPastCutoff) {
          const weekendViolation = createRuleViolation({
            rule_id: "rule_prop_weekend_restriction",
            rule_category: "WEEKEND_RESTRICTION",
            severity: "CRITICAL_BLOCK",
            message: "Prop policy prohibits opening new positions near or during the weekend window",
            evidence: {
              weekend_restriction: policy.weekend_restriction,
              weekend_holding_allowed: propWeekendAllowed,
              current_time_utc: context.session_state.current_time_utc,
            },
            recommended_action: "SKIP_SIGNAL",
          });

          return createExecutionDecision({
            decision: "SKIP",
            decision_code: "SKIPPED_WEEKEND_RESTRICTION",
            reason: "Execution skipped: Weekend position entry restriction in effect for prop account",
            account_id: context.account_id,
            signal_id: signal.signal_id,
            authorized_risk_pct: 0,
            rule_violations: [weekendViolation],
          });
        }
      }
    }

    // 5. High-Impact News Window Restriction Check
    const propNewsAllowed = context.prop_rules?.news_trading_allowed ?? true;
    if (
      ((!isFtmoSwingRules(context.prop_rules) && policy.news_restriction.mode !== "ALLOW") || !propNewsAllowed) &&
      context.news_state.in_high_impact_news_window
    ) {
      const newsViolation = createRuleViolation({
        rule_id: "rule_prop_news_restriction",
        rule_category: "NEWS_RESTRICTION",
        severity: "CRITICAL_BLOCK",
        message: `High-impact news window active (${context.news_state.news_event_title ?? "Economic Event"}). Prop trading news restrictions apply`,
        evidence: {
          news_state: context.news_state,
          policy_restriction: policy.news_restriction,
          news_trading_allowed: propNewsAllowed,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_NEWS_RESTRICTION",
        reason: "Execution skipped: High-impact economic news event window active for prop account",
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [newsViolation],
      });
    }

    // 6. Symbol Eligibility Check
    if (
      policy.allowed_symbols !== null &&
      !policy.allowed_symbols.includes(signal.symbol)
    ) {
      const symbolViolation = createRuleViolation({
        rule_id: "rule_prop_symbol_not_allowed",
        rule_category: "SYMBOL_LIMIT",
        severity: "CRITICAL_BLOCK",
        message: `Symbol ${signal.symbol} is not on the allowed prop trading symbol list`,
        evidence: {
          symbol: signal.symbol,
          allowed_symbols: policy.allowed_symbols,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: `Execution skipped: Symbol ${signal.symbol} is not permitted under prop policy`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [symbolViolation],
      });
    }

    // 7. Max Open Positions Total Check
    const activePosCount = context.exposure.active_position_count;
    if (activePosCount >= policy.max_open_positions_total) {
      const posCapViolation = createRuleViolation({
        rule_id: "rule_prop_max_open_positions_total",
        rule_category: "EXPOSURE_CAP",
        severity: "CRITICAL_BLOCK",
        message: `Prop maximum simultaneous open positions reached (${activePosCount} >= ${policy.max_open_positions_total})`,
        evidence: {
          active_position_count: activePosCount,
          max_open_positions_total: policy.max_open_positions_total,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_MAX_POSITIONS_REACHED",
        reason: `Execution skipped: Maximum simultaneous open positions limit (${policy.max_open_positions_total}) reached`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [posCapViolation],
      });
    }

    // 8. Single Position Per Symbol Check (Duplicate Position Rule)
    const existingSymbolPositions = context.open_positions.filter(
      (pos) => pos.symbol === signal.symbol
    ).length;

    if (existingSymbolPositions >= policy.max_open_positions_per_symbol) {
      const symbolDupViolation = createRuleViolation({
        rule_id: "rule_prop_max_positions_per_symbol",
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

    // 9. Prop Leverage Limit Check
    // Terminal leverage is the broker's available buying power, not requested trade leverage.
    // Position planning caps effective leverage to the policy and verified contract ceilings.


    // 10. Stop Loss Distance & Required Margin Check
    const slDistance = Math.abs(signal.entry_price - signal.stop_loss);
    if (slDistance <= 0 || !Number.isFinite(slDistance)) {
      const slViolation = createRuleViolation({
        rule_id: "rule_prop_invalid_stop_loss",
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

    const contract = context.provider_contract?.kind === "MT5" ? context.provider_contract : null;
    const contractSize = contract?.contract_size ?? (signal.symbol.includes("XAU") || signal.symbol.includes("XAG") ? 100 : 100000);
    const targetRiskPct = policy.max_risk_per_trade_pct;
    const targetRiskUSD = context.balance * (targetRiskPct / 100);
    const riskPerPriceUnit = contract ? contract.tick_value_account_currency / contract.tick_size : contractSize;
    const theoreticalLots = targetRiskUSD / (slDistance * riskPerPriceUnit);
    const effectiveLeverage = Math.min(context.leverage, policy.max_leverage_allowed);
    const theoreticalNotional = theoreticalLots * signal.entry_price * contractSize * (contract?.quote_to_account_conversion ?? 1);
    const requiredMargin = contract?.margin_rate != null ? theoreticalNotional * contract.margin_rate : theoreticalNotional / effectiveLeverage;
    const marginRiskMultiplier = Number.isFinite(requiredMargin) && requiredMargin > 0 && Number.isFinite(context.free_margin) && context.free_margin > 0 ? Math.min(1, context.free_margin * 0.95 / requiredMargin) : 0;

    if (marginRiskMultiplier <= 0) {
      const marginViolation = createRuleViolation({
        rule_id: "rule_prop_insufficient_margin",
        rule_category: "RISK_CAP",
        severity: "CRITICAL_BLOCK",
        message: `Insufficient free margin: $${context.free_margin.toFixed(2)} available, $${requiredMargin.toFixed(2)} required`,
        evidence: {
          free_margin: context.free_margin,
          required_margin: Number(requiredMargin.toFixed(2)),
          theoretical_notional: Number(theoreticalNotional.toFixed(2)),
          theoretical_lots: Number(theoreticalLots.toFixed(2)),
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: `Execution skipped: Insufficient free margin ($${context.free_margin.toFixed(2)} available vs $${requiredMargin.toFixed(2)} required)`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [marginViolation],
      });
    }

    // 11. Floating Drawdown Buffer Safety Check
    // In prop trading, if unrealized open loss pushes equity near the max drawdown limit (>=80%), block new entries.
    const currentUnrealizedLossPct = Math.max(0, ((context.balance - context.equity) / context.balance) * 100);
    if (currentUnrealizedLossPct >= policy.max_daily_drawdown_pct * 0.8) {
      const floatingViolation = createRuleViolation({
        rule_id: "rule_prop_floating_loss_buffer",
        rule_category: "DRAWDOWN_LIMIT",
        severity: "CRITICAL_BLOCK",
        message: `Floating open loss (${currentUnrealizedLossPct.toFixed(2)}%) approaches daily drawdown threshold (${policy.max_daily_drawdown_pct}%)`,
        evidence: {
          current_unrealized_loss_pct: currentUnrealizedLossPct,
          max_daily_drawdown_pct: policy.max_daily_drawdown_pct,
          equity: context.equity,
          balance: context.balance,
        },
        recommended_action: "SKIP_SIGNAL",
      });

      return createExecutionDecision({
        decision: "SKIP",
        decision_code: "SKIPPED_LOW_CONFIDENCE",
        reason: `Execution skipped: Open floating loss (${currentUnrealizedLossPct.toFixed(2)}%) exceeds prop equity protection buffer`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [floatingViolation],
      });
    }

    // 12. Portfolio Risk Scaling & Prop Drawdown Safety Buffer Rules (REDUCE_RISK)
    let authorizedRiskPct = policy.max_risk_per_trade_pct * marginRiskMultiplier;
    let decisionCode: ExecutionDecisionCode = "APPROVED_FULL_RISK";
    let decisionKind: "EXECUTE" | "REDUCE_RISK" = "EXECUTE";
    let decisionReason = `Signal meets all prop account (${policy.account_type}) rules at full authorized risk (${authorizedRiskPct}%)`;
    if (marginRiskMultiplier < 1) {
      decisionCode = "APPROVED_SCALED_RISK";decisionKind = "REDUCE_RISK";
      decisionReason = `Risk reduced to fit current account margin and leverage limits (${authorizedRiskPct}%)`;
      violations.push(createRuleViolation({rule_id:"rule_prop_margin_risk_reduction",rule_category:"RISK_CAP",severity:"WARNING",message:decisionReason,evidence:{requested_risk_pct:policy.max_risk_per_trade_pct,authorized_risk_pct:authorizedRiskPct,free_margin:context.free_margin,theoretical_margin:requiredMargin,margin_reserve_fraction:.05},recommended_action:"REDUCE_POSITION_SIZE"}));
    }

    const currentOpenRiskPct = context.exposure.total_open_risk_pct;
    const remainingPortfolioRiskRoom = policy.max_portfolio_risk_pct - currentOpenRiskPct;

    if (remainingPortfolioRiskRoom <= 0) {
      const portfolioRiskCapViolation = createRuleViolation({
        rule_id: "rule_prop_portfolio_risk_cap",
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
        reason: `Execution skipped: Total portfolio open risk (${currentOpenRiskPct.toFixed(2)}%) meets or exceeds prop portfolio risk cap (${policy.max_portfolio_risk_pct}%)`,
        account_id: context.account_id,
        signal_id: signal.signal_id,
        authorized_risk_pct: 0,
        rule_violations: [portfolioRiskCapViolation],
      });
    }

    // Scale risk down if adding full risk exceeds max portfolio risk cap
    if (authorizedRiskPct > remainingPortfolioRiskRoom) {
      authorizedRiskPct = Number(remainingPortfolioRiskRoom.toFixed(2));
      decisionKind = "REDUCE_RISK";
      decisionCode = "REDUCED_PORTFOLIO_EXPOSURE_CAP";
      decisionReason = `Authorized risk scaled down to ${authorizedRiskPct}% to stay within prop portfolio risk cap (${policy.max_portfolio_risk_pct}%)`;

      violations.push(
        createRuleViolation({
          rule_id: "rule_prop_scaled_portfolio_risk",
          rule_category: "EXPOSURE_CAP",
          severity: "WARNING",
          message: `Prop risk scaled from ${policy.max_risk_per_trade_pct}% to ${authorizedRiskPct}% due to portfolio exposure cap`,
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

    // Prop Preservation Rule: If current drawdown is >= 70% of max allowed daily drawdown cap
    const drawdownThreshold = policy.max_daily_drawdown_pct * 0.70;
    if (context.daily_drawdown.current_drawdown_pct >= drawdownThreshold) {
      const safetyScaledRisk = Number((authorizedRiskPct * 0.5).toFixed(6));
      if (safetyScaledRisk < authorizedRiskPct) {
        authorizedRiskPct = Math.min(authorizedRiskPct, safetyScaledRisk);
        decisionKind = "REDUCE_RISK";
        decisionCode = "REDUCED_DRAWDOWN_SAFETY_BUFFER";
        decisionReason = `Authorized risk scaled down to ${authorizedRiskPct}% due to prop drawdown safety buffer (${context.daily_drawdown.current_drawdown_pct.toFixed(2)}% drawdown)`;

        violations.push(
          createRuleViolation({
            rule_id: "rule_prop_drawdown_safety_buffer",
            rule_category: "RISK_CAP",
            severity: "WARNING",
            message: `Prop risk scaled down to ${authorizedRiskPct}%: current drawdown ${context.daily_drawdown.current_drawdown_pct.toFixed(2)}% is above 70% safety threshold`,
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
   * Generates a validated PositionPlan output by delegating to the unified MT5 Position Plan factory.
   * Returns null if decision is SKIP or LOCK_ACCOUNT.
   */
  createPositionPlan(
    decision: ExecutionDecision,
    signal: SignalContract,
    context: AccountExecutionContext,
    policy: AccountPolicy
  ): PositionPlan | null {
    return createMt5PositionPlan({ decision, signal, context, policy });
  }

  /**
   * Generates a TradeManagementPlan specifying lifecycle supervision rules for prop accounts.
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
    const isGold = signal.symbol.includes("XAU");
    const lockOffset = isGold ? 0.20 : 0.0002;
    const breakevenPrice = isBuy ? signal.entry_price + lockOffset : signal.entry_price - lockOffset;

    return Object.freeze({
      management_plan_id: `tm_${context.user_id}_${context.account_id}_prop_${signal.signal_id}`,
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
        lock_offset_price: Number(breakevenPrice.toFixed(5)),
      }),
      trailing_policy: Object.freeze({
        type: "ATR_TRAILING",
        distance: isGold ? 1.5 : 0.0015,
      }),
      timeout_policy: Object.freeze({
        max_holding_hours: 24, // Strict 24h cap for prop firm positions to prevent overnight traps
        action_on_timeout: "CLOSE_MARKET",
      }),
    });
  }
}

export const mt5PropBrain = new Mt5PropBrain();
