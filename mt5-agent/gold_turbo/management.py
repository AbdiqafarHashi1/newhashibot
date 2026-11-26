"""Pure management proposals for local research engines; never provider fills.

The caller must reconcile actual stop/partial executions. Returned next_stop and
close_fraction are requests, not acknowledgements. Broker stops remain required.
"""
from dataclasses import dataclass, replace
import math
from typing import Optional
from .contracts import integer, positive
from .strategy_contracts import EntryPlan, common_rejection, frame_at


@dataclass(frozen=True)
class PositionObservation:
    opportunity_id: str
    opened_at_ms: int
    entry_price: float
    side: str
    broker_stop: float
    best_net_move: float = 0.0
    partial_taken: bool = False
    last_observed_at_ms: int = 0

    def __post_init__(self):
        integer(self.opened_at_ms, 'OPEN_TIME_INVALID', 1)
        integer(self.last_observed_at_ms, 'POSITION_OBSERVATION_TIME_INVALID')
        positive(self.entry_price, 'FILL_PRICE_REQUIRED')
        positive(self.broker_stop, 'BROKER_STOP_REQUIRED')
        if not isinstance(self.opportunity_id, str) or not self.opportunity_id or self.side not in ('LONG', 'SHORT'):
            raise ValueError('POSITION_LINEAGE_REQUIRED')
        if isinstance(self.best_net_move, bool) or not isinstance(self.best_net_move, (int, float)) or not math.isfinite(self.best_net_move) or self.best_net_move < 0:
            raise ValueError('MFE_INVALID')
        if type(self.partial_taken) is not bool:
            raise ValueError('PARTIAL_FILL_STATE_INVALID')


@dataclass(frozen=True)
class ManagementDecision:
    action: str
    reason: str
    state: PositionObservation
    request_id: str
    next_stop: Optional[float] = None
    close_fraction: float = 0.0
    net_move: Optional[float] = None


def manage_position(plan, position, snapshot, now_ms, maximum_quote_age_ms=2000):
    if not isinstance(plan, EntryPlan) or not isinstance(position, PositionObservation):
        raise ValueError('PLAN_AND_POSITION_REQUIRED')
    integer(now_ms, 'MANAGEMENT_TIME_INVALID', 1)
    integer(maximum_quote_age_ms, 'QUOTE_AGE_LIMIT_INVALID', 1)
    if position.opportunity_id != plan.opportunity_id or position.side != plan.side or (snapshot.source, snapshot.symbol) != (plan.source, plan.symbol):
        raise ValueError('MANAGEMENT_SCOPE_MISMATCH')
    if now_ms < max(position.opened_at_ms, position.last_observed_at_ms):
        raise ValueError('MANAGEMENT_CLOCK_REVERSED')
    def result(action, reason, state=position, next_stop=None, fraction=0.0, net=None):
        # Stable action keys let the eventual execution adapter reconcile/retry
        # the same request. Partial state is changed only by observed fills.
        key = f'{plan.opportunity_id}:{action}:{reason}'
        if next_stop is not None:
            key += ':'+format(next_stop, '.12g')
        return ManagementDecision(action, reason, state, key, next_stop, fraction, net)
    # A timeout can request closure even with a missing feed; the adapter must
    # obtain a fresh executable quote, never report a stale historical fill.
    if now_ms-position.opened_at_ms >= plan.maximum_hold_ms:
        return result('CLOSE', 'MAXIMUM_HOLD_REACHED', fraction=1)
    block = common_rejection(snapshot, now_ms, maximum_quote_age_ms)
    if block in ('INTELLIGENCE_CONTRACT_MISMATCH', 'TICK_WINDOW_CLOCK_MISMATCH', 'NO_TICK_EVIDENCE', 'FUTURE_SNAPSHOT', 'SNAPSHOT_SOURCE_MISMATCH', 'STALE_OR_FUTURE_QUOTE', 'STALE_SNAPSHOT'):
        return result('HOLD', 'FRESH_QUOTE_REQUIRED')
    sign = 1 if plan.side == 'LONG' else -1
    tick = snapshot.latest_tick
    exit_price = tick.bid if sign == 1 else tick.ask
    net = sign*(exit_price-position.entry_price)-plan.fee_slippage_price
    state = replace(position, best_net_move=max(position.best_net_move, net), last_observed_at_ms=now_ms)
    stop = position.broker_stop
    if sign*(exit_price-stop) <= 0:
        return result('CLOSE', 'PROTECTIVE_STOP_CROSSED', state, fraction=1, net=net)
    if sign*(exit_price-plan.target) >= 0:
        return result('CLOSE', 'TARGET_REACHED', state, fraction=1, net=net)
    if sign*(tick.bid-plan.invalidation_bid) <= 0:
        return result('CLOSE', 'DIRECTIONAL_INVALIDATION', state, fraction=1, net=net)
    if snapshot.volatility_shock:
        return result('CLOSE', 'VOLATILITY_SHOCK_EXIT', state, fraction=1, net=net)
    if plan.regime_exit_policy != 'NONE':
        context = frame_at(snapshot, plan.regime_exit_timeframe_ms, now_ms)
        if context is not None:
            if plan.regime_exit_policy == 'RANGE' and context.regime in ('TREND_UP', 'TREND_DOWN', 'SHOCK'):
                return result('CLOSE', 'RANGE_REGIME_INVALIDATED', state, fraction=1, net=net)
            opposite = 'TREND_DOWN' if sign == 1 else 'TREND_UP'
            opposite_swing = 'DOWN' if sign == 1 else 'UP'
            if plan.regime_exit_policy == 'TREND' and (context.regime in (opposite, 'RANGE', 'SHOCK') or context.structure.swing_direction == opposite_swing):
                return result('CLOSE', 'TREND_REGIME_INVALIDATED', state, fraction=1, net=net)
    w5 = next((w for w in snapshot.windows if w.seconds == 5 and w.available), None)
    if (plan.early_failure_velocity_atr_per_second is not None
            and now_ms-position.opened_at_ms >= 3000 and w5 and net < 0
            and sign*w5.directional_persistence <= -.6
            and sign*w5.velocity < -plan.early_failure_velocity_atr_per_second*plan.atr_at_entry):
        return result('CLOSE', 'EARLY_MOMENTUM_FAILURE', state, fraction=1, net=net)
    initial_risk = sign*(position.entry_price-plan.stop)+plan.fee_slippage_price
    if initial_risk <= 0:
        return result('CLOSE', 'FILL_OUTSIDE_PROTECTED_PLAN', state, fraction=1, net=net)
    if state.best_net_move >= plan.trailing_trigger_r*initial_risk:
        locked_net = max(plan.lock_profit_r*initial_risk,
                         state.best_net_move-plan.trailing_distance_atr*plan.atr_at_entry)
        raw = position.entry_price+sign*(locked_net+plan.fee_slippage_price)
        proposed = (math.floor(raw/plan.price_tick+1e-9) if sign == 1 else math.ceil(raw/plan.price_tick-1e-9))*plan.price_tick
        # Never loosen the observed broker stop. If price has already crossed
        # the proposed protection, request closure rather than an invalid stop.
        if sign*(proposed-stop) >= plan.price_tick*.5:
            if sign*(exit_price-proposed) <= 0:
                return result('CLOSE', 'TRAILING_PROTECTION_CROSSED', state, fraction=1, net=net)
            return result('TIGHTEN_STOP', 'TRAILING_PROFIT_PROTECTION', state, next_stop=proposed, net=net)
    if plan.partial_trigger_r is not None and not position.partial_taken and net >= plan.partial_trigger_r*initial_risk:
        return result('PARTIAL_CLOSE', 'PROFIT_CAPTURE', state, fraction=plan.partial_fraction, net=net)
    return result('HOLD', 'PROTECTED_POSITION_MONITORING', state, net=net)
