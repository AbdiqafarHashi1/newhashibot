export const ACTIVE_EXECUTION_STATUSES = [
    'pending',
    'entry_submitted',
    'entry_filled',
    'protected',
    'protected_native',
    'pending_protection',
    'protection_pending',
    'protection_failed',
    'protection_recovered',
    'partially_closed',
    'protected_managed',
    'pending_managed_protection',
];
export const RETRYABLE_EXECUTION_STATUSES = [
    'skipped',
    'failed',
    'cancelled',
    'stale_closed',
    'closed_tp',
    'closed_sl',
    'closed_breakeven',
    'closed_timeout',
];
export function isActiveExecutionStatus(status) {
    return ACTIVE_EXECUTION_STATUSES.includes(status);
}
export function isRetryableExecutionStatus(status) {
    return RETRYABLE_EXECUTION_STATUSES.includes(status);
}
export function shouldBlockDuplicateSignal(existingRows) {
    const active = existingRows.find((row) => isActiveExecutionStatus(row.status));
    if (active)
        return { block: true, reason: 'active_duplicate_signal', blockingRow: active };
    if (existingRows.length > 0)
        return { block: false, reason: 'retryable_signal_row' };
    return { block: false, reason: 'no_existing_execution' };
}
export function shouldBlockDuplicateSignalWithTruth(existingRows, binanceTruth) {
    const active = existingRows.find((row) => isActiveExecutionStatus(row.status));
    if (!active) {
        const decision = shouldBlockDuplicateSignal(existingRows);
        return { ...decision, staleRowIds: [] };
    }
    if (Math.abs(binanceTruth.positionSize) > 0 || binanceTruth.openOrders.length > 0) {
        return { block: true, reason: 'active_duplicate_signal', blockingRow: active, staleRowIds: [] };
    }
    return { block: false, reason: 'retryable_signal_row', staleRowIds: existingRows.filter((row) => isActiveExecutionStatus(row.status)).map((row) => row.id) };
}
export function decideSameSymbolBlock(rows, binanceTruth) {
    const activeRows = rows.filter((row) => isActiveExecutionStatus(row.status));
    const staleRowIds = activeRows.map((row) => row.id);
    if (Math.abs(binanceTruth.positionSize) > 0) {
        return { block: true, reason: 'binance_active_position', staleRowIds: [] };
    }
    if (binanceTruth.openOrders.length > 0) {
        return { block: true, reason: 'binance_open_orders', staleRowIds: [] };
    }
    if (staleRowIds.length > 0) {
        return { block: false, reason: 'db_stale_cleaned', staleRowIds };
    }
    return { block: false, reason: 'no_active_symbol_exposure', staleRowIds: [] };
}
export function governorAllowsTestnetExecution(mode, governorBlocksExecution) {
    if (mode === 'off_for_testing' || mode === 'readonly')
        return true;
    return !governorBlocksExecution;
}
export function canExecuteFreshSignal(input) {
    if (input.liveTrading)
        return { allowed: false, reason: 'live_trading_forbidden' };
    if (!input.testnetModeEnabled)
        return { allowed: false, reason: 'testnet_disabled' };
    if (!input.executionAllowed)
        return { allowed: false, reason: 'execution_not_allowed' };
    if (!input.killSwitchOff)
        return { allowed: false, reason: 'kill_switch_on' };
    if (!input.riskSizeValid)
        return { allowed: false, reason: 'invalid_risk_size' };
    if (Math.abs(input.binanceTruth.positionSize) > 0 || input.binanceTruth.openOrders.length > 0) {
        return { allowed: false, reason: 'binance_active_symbol_exposure' };
    }
    return { allowed: true, reason: 'allowed' };
}
export function splitTp1Tp2Quantities(quantity, stepSize = 0) {
    if (!Number.isFinite(quantity) || quantity <= 0)
        return { tp1Quantity: 0, tp2Quantity: 0 };
    const rawHalf = quantity / 2;
    const tp1Quantity = stepSize > 0 ? Math.floor((rawHalf / stepSize) + 1e-12) * stepSize : rawHalf;
    return { tp1Quantity, tp2Quantity: Math.max(quantity - tp1Quantity, 0) };
}
function splitHalf(quantity) {
    const { tp1Quantity, tp2Quantity } = splitTp1Tp2Quantities(quantity);
    return { firstHalf: tp1Quantity, secondHalf: tp2Quantity };
}
export function toUsdcEquivalentSymbol(symbol) {
    return symbol.toUpperCase().endsWith('USDT') ? `${symbol.toUpperCase().slice(0, -4)}USDC` : symbol.toUpperCase();
}
export function selectMarginAssetForExecution(input) {
    const symbol = input.symbol.toUpperCase();
    const usdcSymbol = toUsdcEquivalentSymbol(symbol);
    const allow = input.allowMarginAssets ?? ['USDT', 'USDC'];
    const maxRetryAssets = input.maxRetryAssets ?? 2;
    const usdtSupported = input.supportedUsdtSymbols.map((s) => s.toUpperCase()).includes(symbol);
    const usdcSupported = input.supportedUsdcSymbols.map((s) => s.toUpperCase()).includes(usdcSymbol);
    const reasons = [];
    if (usdtSupported && input.availableUsdt >= input.requestedMargin) {
        return { placeOrder: true, selectedMarginAsset: 'USDT', selectedSymbol: symbol, backupAttempted: false, backupAssetUsed: null, reasons: ['sufficient_usdt_margin'], retryDecision: 'none', finalStatus: 'ready' };
    }
    reasons.push('insufficient_usdt_margin');
    const canTryUsdc = input.enableUsdcMarginBackup && allow.includes('USDC') && maxRetryAssets >= 2;
    if (!canTryUsdc) {
        reasons.push('usdc_backup_disabled');
        if (input.availableUsdt + input.availableUsdc < input.requestedMargin)
            reasons.push('insufficient_total_margin');
        return { placeOrder: false, selectedMarginAsset: null, selectedSymbol: null, backupAttempted: false, backupAssetUsed: null, reasons, retryDecision: 'do_not_retry', finalStatus: 'blocked' };
    }
    if (!symbol.endsWith('USDT')) {
        reasons.push('symbol_not_supported_for_usdc');
        return { placeOrder: false, selectedMarginAsset: null, selectedSymbol: null, backupAttempted: true, backupAssetUsed: null, reasons, retryDecision: 'do_not_retry', finalStatus: 'blocked' };
    }
    if (!usdcSupported) {
        reasons.push('usdc_market_unavailable');
        return { placeOrder: false, selectedMarginAsset: null, selectedSymbol: null, backupAttempted: true, backupAssetUsed: null, reasons, retryDecision: 'do_not_retry', finalStatus: 'blocked' };
    }
    if (input.availableUsdc >= input.requestedMargin) {
        reasons.push('usdc_backup_used');
        return { placeOrder: true, selectedMarginAsset: 'USDC', selectedSymbol: usdcSymbol, backupAttempted: true, backupAssetUsed: 'USDC', reasons, retryDecision: 'try_usdc_once', finalStatus: 'ready' };
    }
    reasons.push('insufficient_total_margin');
    return { placeOrder: false, selectedMarginAsset: null, selectedSymbol: null, backupAttempted: true, backupAssetUsed: null, reasons, retryDecision: 'do_not_retry', finalStatus: 'blocked' };
}
export function decideProfitLockAction(config, state) {
    if (config.liveTrading)
        return { action: 'do_nothing', allowed: false, reason: 'live_mode_action_forbidden', neverCancelOldSlBeforeVerification: true };
    if (!config.testnetEnabled || !config.enableProfitLockEngine || !config.enableTestnetProfitLockEngine)
        return { action: 'research_only', allowed: false, reason: 'profit_lock_execution_disabled_research_only', neverCancelOldSlBeforeVerification: true };
    if (!state.validSlExists)
        return { action: 'emergency_protect', allowed: false, reason: 'existing_valid_sl_required_before_profit_lock', neverCancelOldSlBeforeVerification: true };
    if (state.updatesThisTrade >= config.profitLockMaxUpdatesPerTrade)
        return { action: 'do_nothing', allowed: false, reason: 'max_updates_reached', neverCancelOldSlBeforeVerification: true };
    if (state.minutesSinceLastUpdate < config.profitLockCooldownMinutes)
        return { action: 'do_nothing', allowed: false, reason: 'cooldown_active', neverCancelOldSlBeforeVerification: true };
    if (state.tp1Hit && state.currentR >= config.profitLockMinR)
        return { action: 'move_sl_to_0_3r', allowed: true, reason: 'after_tp1_min_r_met_verify_replacement_before_old_cancel', neverCancelOldSlBeforeVerification: true };
    if (state.tp1Hit)
        return { action: 'move_sl_to_be', allowed: true, reason: 'after_tp1_lock_to_breakeven', neverCancelOldSlBeforeVerification: true };
    if (!config.profitLockBeforeTp1TestnetAllowed)
        return { action: 'research_only', allowed: false, reason: 'before_tp1_action_disabled_research_only', neverCancelOldSlBeforeVerification: true };
    if (state.currentR >= config.profitLockAggressiveMinR && state.currentUnrealizedPnl > 0 && state.reversalRisk === 'high')
        return { action: 'move_sl_to_0_3r', allowed: true, reason: 'before_tp1_high_reversal_risk_testnet_only', neverCancelOldSlBeforeVerification: true };
    return { action: 'do_nothing', allowed: false, reason: 'thresholds_not_met', neverCancelOldSlBeforeVerification: true };
}
export function summarizeProfitLockStudy(samples, leverage = 10) {
    const reached = (threshold) => samples.filter((s) => s.r >= threshold).length;
    const reversed = samples.filter((s) => s.reversedAfter).length;
    const saved = samples.filter((s) => s.reversedAfter && s.r >= 0.3).reduce((sum, s) => sum + Math.max(s.unrealizedPnl, 0), 0);
    return { reached_0_1r: reached(0.1), reached_0_2r: reached(0.2), reached_0_3r: reached(0.3), reached_0_5r: reached(0.5), later_reversed: reversed, estimated_usdt_saved_captured_at_leverage: saved, leverage };
}
export function recommendCapitalGovernor(input) {
    if (input.dailyPnlPct <= -5 || input.marginUsagePct >= 80)
        return 'block_recommended';
    if (input.openPositions >= input.maxOpenPositions || input.sameSymbolExposurePct > 35)
        return 'suppress_recommended';
    if (input.sameDirectionExposurePct > 60 || input.marginUsagePct > 55)
        return 'warn';
    return 'allow';
}
export function closeSideForDirection(direction) {
    return direction === 'buy' ? 'SELL' : 'BUY';
}
export function buildNativeConditionalOrder(input) {
    const isStop = input.label === 'sl';
    return {
        symbol: input.symbol,
        side: closeSideForDirection(input.direction),
        algoType: 'CONDITIONAL',
        type: isStop ? 'STOP_MARKET' : 'TAKE_PROFIT_MARKET',
        quantity: input.quantity,
        triggerPrice: isStop ? input.stopLoss : Number(input.targetPrice),
        reduceOnly: true,
        workingType: 'MARK_PRICE',
        closePosition: false,
    };
}
function orderMatches(order, expected) {
    if (!order)
        return 'missing';
    if (order.side && String(order.side).toUpperCase() !== expected.side)
        return 'wrong_side';
    if (order.type && String(order.type).toUpperCase() !== expected.type)
        return 'wrong_type';
    if (order.reduceOnly === false)
        return 'not_reduce_only';
    if (order.closePosition === true)
        return 'unexpected_close_position';
    const stop = Number(order.triggerPrice ?? order.stopPrice);
    if (Number.isFinite(stop) && Math.abs(stop - expected.triggerPrice) > Math.max(Math.abs(expected.triggerPrice) * 0.000001, 1e-8))
        return 'wrong_stop_price';
    const qty = Number(order.origQty);
    if (Number.isFinite(qty) && Math.abs(qty - expected.quantity) > Math.max(expected.quantity * 0.000001, 1e-8))
        return 'wrong_quantity';
    return null;
}
export function verifyNativeProtectionOpenOrders(fill, orderIds, openOrders) {
    const { tp1Quantity, tp2Quantity } = splitTp1Tp2Quantities(fill.quantity);
    const intents = {
        sl: buildNativeConditionalOrder({ ...fill, label: 'sl', quantity: fill.quantity }),
        tp1: buildNativeConditionalOrder({ ...fill, label: 'tp1', quantity: tp1Quantity, targetPrice: fill.tp1 }),
        tp2: buildNativeConditionalOrder({ ...fill, label: 'tp2', quantity: tp2Quantity, targetPrice: fill.tp2 }),
    };
    const missingLabels = [];
    const errors = [];
    ['sl', 'tp1', 'tp2'].forEach((label) => {
        const order = openOrders.find((row) => String(row.orderId) === String(orderIds[label]) || String(row.algoId ?? '') === String(orderIds[label]));
        const mismatch = orderMatches(order, intents[label]);
        if (mismatch) {
            missingLabels.push(label);
            errors.push(`${label}:${mismatch}`);
        }
    });
    return { verified: missingLabels.length === 0, missingLabels, errors };
}
export async function createProtectionPlan(fill, client) {
    const { firstHalf, secondHalf } = splitHalf(fill.quantity);
    try {
        const [sl, tp1, tp2] = await Promise.all([
            client.placeReduceOnlyStop({ ...fill, quantity: fill.quantity }),
            client.placeReduceOnlyTakeProfit({ ...fill, quantity: firstHalf, targetPrice: fill.tp1, label: 'tp1' }),
            client.placeReduceOnlyTakeProfit({ ...fill, quantity: secondHalf, targetPrice: fill.tp2, label: 'tp2' }),
        ]);
        const basePlan = {
            bracket_mode: 'exchange_native',
            sl_order_id: sl.algoId,
            tp1_order_id: tp1.algoId,
            tp2_order_id: tp2.algoId,
            sl_algo_id: sl.algoId,
            tp1_algo_id: tp1.algoId,
            tp2_algo_id: tp2.algoId,
            sl_client_algo_id: sl.clientAlgoId,
            tp1_client_algo_id: tp1.clientAlgoId,
            tp2_client_algo_id: tp2.clientAlgoId,
            managed_fallback_active: false,
            intended_sl: fill.stopLoss,
            intended_tp1: fill.tp1,
            intended_tp2: fill.tp2,
            tp1_quantity: firstHalf,
            tp2_quantity: secondHalf,
            sl_moved_to_be: false,
        };
        if (!client.fetchOpenProtectionOrders) {
            return {
                ...basePlan,
                protection_status: 'pending_protection',
                native_protection_verified: false,
                error_message: 'Native protection submitted but Binance open-order verification was not provided',
            };
        }
        const openOrders = await client.fetchOpenProtectionOrders(fill.symbol);
        const verification = verifyNativeProtectionOpenOrders(fill, { sl: sl.algoId, tp1: tp1.algoId, tp2: tp2.algoId }, openOrders);
        if (!verification.verified) {
            return {
                ...basePlan,
                protection_status: 'protection_failed',
                native_protection_verified: false,
                error_message: `Native protection verification failed: ${verification.errors.join(',')}`,
            };
        }
        return {
            ...basePlan,
            protection_status: 'protected_native',
            native_protection_verified: true,
        };
    }
    catch (err) {
        return {
            protection_status: 'protection_failed',
            bracket_mode: 'exchange_native',
            intended_sl: fill.stopLoss,
            intended_tp1: fill.tp1,
            intended_tp2: fill.tp2,
            tp1_quantity: firstHalf,
            tp2_quantity: secondHalf,
            sl_moved_to_be: false,
            error_message: err instanceof Error ? err.message : 'Native protection rejected',
            native_protection_verified: false,
            managed_fallback_active: false,
        };
    }
}
function targetHit(direction, markPrice, target) {
    return direction === 'buy' ? markPrice >= target : markPrice <= target;
}
function stopHit(direction, markPrice, stop) {
    return direction === 'buy' ? markPrice <= stop : markPrice >= stop;
}
export function timeStopMinutes(strategyName, timeframe) {
    const key = `${String(strategyName ?? '').toLowerCase()}:${String(timeframe ?? '').toLowerCase()}`;
    if (key === 'microscalper:5m')
        return 120;
    if (key === 'microscalper:15m')
        return 360;
    if (key === 'compressionbreakout:15m')
        return 720;
    if (key === 'compressionbreakout:1h')
        return 48 * 60;
    if (key === 'swingcontinuation:15m')
        return 1440;
    if (key === 'swingcontinuation:1h')
        return 96 * 60;
    return null;
}
export function timeStopDeadline(openedAt, strategyName, timeframe) {
    const minutes = timeStopMinutes(strategyName, timeframe);
    const start = openedAt ? new Date(openedAt).getTime() : NaN;
    if (!minutes || !Number.isFinite(start))
        return null;
    return new Date(start + minutes * 60_000).toISOString();
}
export async function evaluateManagedExit(state, markPrice, client) {
    if (state.remainingQuantity <= 0) {
        return { action: 'none', closedQuantity: 0, remainingQuantity: 0, slMovedToBreakEven: state.slMovedToBreakEven };
    }
    const activeStop = state.slMovedToBreakEven ? state.entryPrice : state.stopLoss;
    if (!state.tp1Closed && targetHit(state.direction, markPrice, state.tp1)) {
        const closeQuantity = Math.min(state.quantity / 2, state.remainingQuantity);
        const result = await client.closeReduceOnlyMarket(state.symbol, state.direction, closeQuantity, 'tp1');
        return {
            action: 'tp1_closed',
            closedQuantity: closeQuantity,
            remainingQuantity: state.remainingQuantity - closeQuantity,
            slMovedToBreakEven: true,
            orderId: result.orderId,
        };
    }
    if (targetHit(state.direction, markPrice, state.tp2)) {
        const closeQuantity = state.remainingQuantity;
        const result = await client.closeReduceOnlyMarket(state.symbol, state.direction, closeQuantity, 'tp2');
        return { action: 'tp2_closed', closedQuantity: closeQuantity, remainingQuantity: 0, slMovedToBreakEven: state.slMovedToBreakEven, orderId: result.orderId };
    }
    if (stopHit(state.direction, markPrice, activeStop)) {
        const closeQuantity = state.remainingQuantity;
        const result = await client.closeReduceOnlyMarket(state.symbol, state.direction, closeQuantity, 'sl');
        return { action: 'sl_closed', closedQuantity: closeQuantity, remainingQuantity: 0, slMovedToBreakEven: state.slMovedToBreakEven, orderId: result.orderId };
    }
    return { action: 'none', closedQuantity: 0, remainingQuantity: state.remainingQuantity, slMovedToBreakEven: state.slMovedToBreakEven };
}
export function validateSelectedSignalForExecution(signalId, signal) {
    const id = typeof signalId === 'string' ? signalId.trim() : '';
    if (!id)
        return { ok: false, error: 'missing_signal_id' };
    if (!signal)
        return { ok: false, error: 'signal_not_found' };
    if (signal.id !== id)
        return { ok: false, error: 'invalid_selected_signal' };
    if (signal.market_type !== 'crypto' || !signal.symbol || !signal.direction)
        return { ok: false, error: 'stale_signal_not_executable' };
    return { ok: true, signal_id: id };
}
export function governorPausedVisibility(input) {
    return {
        error: 'governor_paused',
        governor_state: input.state,
        governor_reason: input.reason,
        last_governor_checked_at: input.lastCheckedAt ?? null,
        execution_allowed: false,
        admin_action_needed: input.killSwitchEnabled
            ? 'Turn off the execution kill switch after reviewing account state; the bot will not unpause automatically.'
            : 'Review governor thresholds, account PnL, failed execution streaks, and risk settings; the bot will not unpause automatically.',
    };
}
export function buildE2EProtectionProof(input) {
    const native = input.bracketMode === 'exchange_native' && input.protectionStatus === 'protected_native';
    const managed = input.bracketMode === 'managed_exit_fallback' && input.protectionStatus === 'protected_managed';
    return {
        entry_submitted: Boolean(input.entryOrderId),
        position_detected: Math.abs(input.positionSize) > 0,
        native_sl_order_detected: native && Boolean(input.slOrderId),
        native_tp1_order_detected: native && Boolean(input.tp1OrderId),
        native_tp2_order_detected: native && Boolean(input.tp2OrderId),
        bracket_mode: input.bracketMode ?? null,
        protection_status: input.protectionStatus ?? null,
        latest_protection_error: input.latestProtectionError ?? null,
        managed_fallback_active: managed,
        monitor_ready: Boolean(input.monitorReady || managed || input.protectionStatus === 'protected_native' || input.protectionStatus === 'protected'),
    };
}
