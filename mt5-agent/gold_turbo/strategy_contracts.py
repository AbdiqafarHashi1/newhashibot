"""Research decisions, not account authorization, sizing or executable orders."""
from dataclasses import dataclass
import hashlib
import json
import math
from typing import Optional, Tuple
from .contracts import VERSION, integer, positive
from .intelligence import estimate_cost


@dataclass(frozen=True)
class ExecutionCosts:
    contract_size: float
    commission_per_lot_per_side: float
    slippage_per_side: float
    price_tick: float
    assumptions: str

    def __post_init__(self):
        positive(self.contract_size, 'CONTRACT_SIZE_REQUIRED')
        positive(self.price_tick, 'PRICE_TICK_REQUIRED')
        for value in (self.commission_per_lot_per_side, self.slippage_per_side):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError('KNOWN_NONNEGATIVE_COSTS_REQUIRED')
        if not isinstance(self.assumptions, str) or not self.assumptions.strip():
            raise ValueError('COST_ASSUMPTIONS_REQUIRED')


@dataclass(frozen=True)
class EntryPlan:
    strategy_id: str
    strategy_version: str
    opportunity_id: str
    entry_model: str
    symbol: str
    source: str
    side: str
    created_at_ms: int
    expires_at_ms: int
    reference_entry: float
    stop: float
    target: float
    invalidation_bid: float
    atr_at_entry: float
    spread_at_entry: float
    fee_slippage_price: float
    planned_net_reward: float
    planned_loss_with_costs: float
    maximum_hold_ms: int
    trailing_trigger_r: float
    trailing_distance_atr: float
    lock_profit_r: float
    partial_trigger_r: Optional[float]
    partial_fraction: float
    price_tick: float
    demo_only: bool = True

    def __post_init__(self):
        if self.side not in ('LONG', 'SHORT') or self.symbol != 'XAUUSD' or self.demo_only is not True:
            raise ValueError('DEMO_GOLD_PLAN_REQUIRED')
        for value in (self.strategy_id, self.strategy_version, self.opportunity_id, self.entry_model, self.source):
            if not isinstance(value, str) or not value:
                raise ValueError('PLAN_LINEAGE_REQUIRED')
        for value in (self.created_at_ms, self.expires_at_ms, self.maximum_hold_ms):
            integer(value, 'PLAN_TIME_INVALID', 1)
        if self.expires_at_ms <= self.created_at_ms:
            raise ValueError('PLAN_EXPIRY_INVALID')
        for value in (self.reference_entry, self.stop, self.target, self.invalidation_bid,
                      self.atr_at_entry, self.planned_net_reward, self.planned_loss_with_costs,
                      self.trailing_trigger_r, self.trailing_distance_atr, self.price_tick):
            positive(value, 'PLAN_PRICE_OR_REWARD_INVALID')
        for value in (self.spread_at_entry, self.fee_slippage_price, self.lock_profit_r):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError('PLAN_COST_OR_LOCK_INVALID')
        sign = 1 if self.side == 'LONG' else -1
        if sign*(self.reference_entry-self.stop) <= 0 or sign*(self.target-self.reference_entry) <= 0:
            raise ValueError('PLAN_PROTECTION_GEOMETRY_INVALID')
        if isinstance(self.partial_fraction, bool) or not 0 < self.partial_fraction <= 1:
            raise ValueError('PLAN_PARTIAL_FRACTION_INVALID')
        if self.partial_trigger_r is not None:
            positive(self.partial_trigger_r, 'PLAN_PARTIAL_TRIGGER_INVALID')


@dataclass(frozen=True)
class StrategyDecision:
    strategy_id: str
    version: str
    at_ms: int
    decision: str
    entry_model: Optional[str]
    opportunity_id: Optional[str]
    reasons: Tuple[str, ...]
    features: Tuple[Tuple[str, object], ...]
    plan: Optional[EntryPlan] = None
    demo_only: bool = True


class EntryMemory:
    """Bounded episode identity and explicit admission feedback.

    Evaluation never counts an order as filled. record_admission is called only
    after an authorized reservation; production persistence/recovery is period 6.
    A continuing setup keeps its identity. A fresh observed non-setup is required
    before the same model/context can create a new episode.
    """
    def __init__(self):
        self.episode_key = None
        self.episode_start = None
        self.admitted_id = None
        self.admitted_at = None
        self.last_at = None

    def observe_clock(self, at):
        integer(at, 'EVALUATION_TIME_INVALID', 1)
        if self.last_at is not None and at < self.last_at:
            raise ValueError('STRATEGY_CLOCK_REVERSED')
        self.last_at = at

    def clear_setup(self):
        self.episode_key = None
        self.episode_start = None

    def opportunity(self, strategy_id, source, side, model, anchor, at):
        key = (strategy_id, source, side, model, anchor)
        if key != self.episode_key:
            self.episode_key, self.episode_start = key, at
        encoded = json.dumps([*key, self.episode_start], separators=(',', ':')).encode()
        return 'gold-turbo:' + hashlib.sha256(encoded).hexdigest()

    def admission_rejection(self, opportunity_id, at, cooldown_ms):
        if opportunity_id == self.admitted_id:
            return 'OPPORTUNITY_ALREADY_ADMITTED'
        if self.admitted_at is not None and at-self.admitted_at < cooldown_ms:
            return 'QUALIFIED_REENTRY_COOLDOWN'
        return None

    def record(self, decision, at, cooldown_ms):
        integer(at, 'ADMISSION_TIME_INVALID', 1)
        if decision.plan is None or decision.decision not in ('LONG', 'SHORT'):
            raise ValueError('ENTRY_CANDIDATE_REQUIRED')
        if not decision.at_ms <= at <= decision.plan.expires_at_ms:
            raise ValueError('CANDIDATE_EXPIRED_OR_FUTURE')
        if self.admitted_at is not None and at < self.admitted_at:
            raise ValueError('ADMISSION_CLOCK_REVERSED')
        if self.last_at is not None and at < self.last_at:
            raise ValueError('ADMISSION_CLOCK_REVERSED')
        blocked = self.admission_rejection(decision.opportunity_id, at, cooldown_ms)
        if blocked:
            raise ValueError(blocked)
        self.admitted_id, self.admitted_at = decision.opportunity_id, at
        self.last_at = at


def reject(strategy_id, at, reason, features=(), model=None):
    return StrategyDecision(strategy_id, '0.1.0-research', at, 'NO_TRADE', model, None,
                            (reason,), tuple(features))


def common_rejection(snapshot, now_ms, maximum_quote_age_ms):
    integer(now_ms, 'EVALUATION_TIME_INVALID', 1)
    if snapshot.version != VERSION or snapshot.symbol != 'XAUUSD':
        return 'INTELLIGENCE_CONTRACT_MISMATCH'
    if snapshot.as_of_ms > now_ms:
        return 'FUTURE_SNAPSHOT'
    tick = snapshot.latest_tick
    if tick is None:
        return 'NO_TICK_EVIDENCE'
    if (tick.symbol, tick.source) != (snapshot.symbol, snapshot.source):
        return 'SNAPSHOT_SOURCE_MISMATCH'
    if tick.at_ms > now_ms or now_ms-tick.at_ms > maximum_quote_age_ms:
        return 'STALE_OR_FUTURE_QUOTE'
    if now_ms-snapshot.as_of_ms > maximum_quote_age_ms:
        return 'STALE_SNAPSHOT'
    if any(w.available and w.end_ms != tick.at_ms for w in snapshot.windows):
        return 'TICK_WINDOW_CLOCK_MISMATCH'
    if 'STALE_QUOTE' in snapshot.quality:
        return 'STALE_OR_FUTURE_QUOTE'
    if snapshot.spread_spike:
        return 'SPREAD_SPIKE'
    if snapshot.volatility_shock:
        return 'VOLATILITY_SHOCK'
    return None


def frame_at(snapshot, timeframe_ms, now_ms):
    frame = next((f for f in snapshot.frames if f.timeframe_ms == timeframe_ms), None)
    if not frame or not frame.usable_completed:
        return None
    if any(c.end_ms > now_ms or c.symbol != snapshot.symbol or c.source != snapshot.source for c in frame.usable_completed):
        return None
    latest = frame.usable_completed[-1]
    if now_ms-latest.end_ms >= timeframe_ms:
        return None
    return frame


def context_direction(frame):
    if frame.regime == 'TREND_UP':
        return 1
    if frame.regime == 'TREND_DOWN':
        return -1
    rows = frame.usable_completed
    if len(rows) < 3:
        return 0
    changes = [b.close-a.close for a, b in zip(rows[-3:], rows[-2:])]
    return 1 if all(d > 0 for d in changes) else -1 if all(d < 0 for d in changes) else 0


def propose(strategy_id, snapshot, now_ms, costs, memory, config, *, side, model,
            anchor, stop_distance, invalidation_bid, atr, features):
    tick = snapshot.latest_tick
    if not isinstance(costs, ExecutionCosts):
        return reject(strategy_id, now_ms, 'EXECUTION_COSTS_UNAVAILABLE', features, model)
    move = config.target_atr*atr
    cost = estimate_cost(tick, costs.contract_size, costs.commission_per_lot_per_side,
                         costs.slippage_per_side, move, costs.assumptions)
    fee_slip = cost.commission_round_trip_price+cost.slippage_round_trip_price
    sign = 1 if side == 'LONG' else -1
    entry = tick.ask if sign == 1 else tick.bid
    raw_stop = tick.bid-stop_distance if sign == 1 else tick.ask+stop_distance
    raw_target = tick.bid+move if sign == 1 else tick.ask-move
    # Round towards the less favorable result, then test the exact rounded plan.
    stop = (math.floor(raw_stop/costs.price_tick+1e-9) if sign == 1 else math.ceil(raw_stop/costs.price_tick-1e-9))*costs.price_tick
    target = (math.floor(raw_target/costs.price_tick+1e-9) if sign == 1 else math.ceil(raw_target/costs.price_tick-1e-9))*costs.price_tick
    reward = sign*(target-entry)-fee_slip
    risk = sign*(entry-stop)+fee_slip
    evidence = tuple(features)+(('cost_assumptions', costs.assumptions), ('round_trip_cost_price', cost.total_round_trip_price),
                                ('planned_net_reward', reward), ('planned_loss_with_costs', risk))
    if min(stop, target, entry) <= 0 or risk <= 0 or reward <= 0:
        return reject(strategy_id, now_ms, 'COSTS_EXCEED_PLANNED_MOVE', evidence, model)
    if reward < config.minimum_net_target_atr*atr or reward/risk < config.minimum_net_rr:
        return reject(strategy_id, now_ms, 'INSUFFICIENT_NET_REWARD', evidence, model)
    opportunity_id = memory.opportunity(strategy_id, snapshot.source, side, model, anchor, now_ms)
    blocked = memory.admission_rejection(opportunity_id, now_ms, config.reentry_cooldown_ms)
    if blocked:
        return reject(strategy_id, now_ms, blocked, evidence, model)
    plan = EntryPlan(strategy_id, '0.1.0-research', opportunity_id, model, snapshot.symbol, snapshot.source,
                     side, now_ms, now_ms+config.entry_ttl_ms, entry, stop, target, invalidation_bid, atr,
                     tick.spread, fee_slip, reward, risk, config.maximum_hold_ms,
                     config.trailing_trigger_r, config.trailing_distance_atr, config.lock_profit_r,
                     config.partial_trigger_r, config.partial_fraction, costs.price_tick)
    return StrategyDecision(strategy_id, plan.strategy_version, now_ms, side, model, opportunity_id,
                            ('QUALIFIED_RESEARCH_CANDIDATE',), evidence, plan)


def validate_config(config):
    for name in ('maximum_quote_age_ms', 'entry_ttl_ms', 'maximum_hold_ms', 'reentry_cooldown_ms'):
        integer(getattr(config, name), 'STRATEGY_TIME_INVALID:'+name, 1)
    for name in ('target_atr', 'minimum_net_target_atr', 'minimum_net_rr', 'minimum_stop_atr',
                 'maximum_stop_atr', 'stop_buffer_atr', 'trailing_trigger_r', 'trailing_distance_atr'):
        positive(getattr(config, name), 'STRATEGY_NUMBER_INVALID:'+name)
    if config.minimum_stop_atr > config.maximum_stop_atr:
        raise ValueError('STOP_BOUNDS_INVALID')
    if isinstance(config.lock_profit_r, bool) or not math.isfinite(config.lock_profit_r) or config.lock_profit_r < 0:
        raise ValueError('LOCK_PROFIT_INVALID')
    if isinstance(config.partial_fraction, bool) or not math.isfinite(config.partial_fraction) or not 0 < config.partial_fraction <= 1:
        raise ValueError('PARTIAL_FRACTION_INVALID')
    if config.partial_trigger_r is not None:
        positive(config.partial_trigger_r, 'PARTIAL_TRIGGER_INVALID')
