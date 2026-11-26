"""Momentum Scalper: completed impulse continuation or compression expansion.

Primary execution can be M1 or M5, with M15 context. No tick-velocity burst is an
entry by itself. Thresholds are explicit research hypotheses, not measured edge.
"""
from dataclasses import dataclass
from .contracts import positive
from .features import candle_shape
from .strategy_contracts import (EntryMemory, common_rejection, context_direction,
                                  frame_at, propose, reject, validate_config)

MOMENTUM_ID = 'gold.turbo-momentum-scalper'


@dataclass(frozen=True)
class MomentumConfig:
    primary_timeframe_ms: int = 60_000
    impulse_body_atr: float = .60
    impulse_body_fraction: float = .65
    maximum_directional_wick_fraction: float = .25
    compression_bars: int = 6
    compression_range_atr: float = .65
    breakout_buffer_atr: float = .02
    maximum_chase_atr: float = .35
    target_atr: float = 1.40
    minimum_net_target_atr: float = .20
    minimum_net_rr: float = 1.10
    minimum_stop_atr: float = .35
    maximum_stop_atr: float = 1.20
    stop_buffer_atr: float = .05
    maximum_quote_age_ms: int = 2000
    entry_ttl_ms: int = 5000
    maximum_hold_ms: int = 900_000
    reentry_cooldown_ms: int = 15_000
    trailing_trigger_r: float = .70
    trailing_distance_atr: float = .45
    lock_profit_r: float = .10
    partial_trigger_r: float = .75
    partial_fraction: float = .5

    def __post_init__(self):
        validate_config(self)
        if type(self.primary_timeframe_ms) is not int or self.primary_timeframe_ms not in (60_000, 300_000):
            raise ValueError('MOMENTUM_PRIMARY_FRAME_INVALID')
        if type(self.compression_bars) is not int or not 3 <= self.compression_bars <= 30:
            raise ValueError('COMPRESSION_LOOKBACK_INVALID')
        for name in ('impulse_body_atr', 'compression_range_atr', 'breakout_buffer_atr', 'maximum_chase_atr'):
            positive(getattr(self, name), 'MOMENTUM_THRESHOLD_INVALID:'+name)
        positive(self.impulse_body_fraction, 'IMPULSE_BODY_FRACTION_INVALID')
        positive(self.maximum_directional_wick_fraction, 'DIRECTIONAL_WICK_FRACTION_INVALID')
        if not 0 < self.impulse_body_fraction <= 1 or not 0 < self.maximum_directional_wick_fraction < 1:
            raise ValueError('MOMENTUM_SHAPE_THRESHOLD_INVALID')


class MomentumScalper:
    strategy_id = MOMENTUM_ID

    def __init__(self, config=None):
        self.config = config or MomentumConfig()
        if not isinstance(self.config, MomentumConfig):
            raise ValueError('MOMENTUM_CONFIG_REQUIRED')
        self.memory = EntryMemory()

    def record_admission(self, decision, at_ms):
        if decision.strategy_id != self.strategy_id:
            raise ValueError('STRATEGY_SCOPE_MISMATCH')
        self.memory.record(decision, at_ms, self.config.reentry_cooldown_ms)

    def evaluate(self, snapshot, costs, now_ms):
        self.memory.observe_clock(now_ms)
        cfg = self.config
        block = common_rejection(snapshot, now_ms, cfg.maximum_quote_age_ms)
        if block:
            return reject(self.strategy_id, now_ms, block)
        primary = frame_at(snapshot, cfg.primary_timeframe_ms, now_ms)
        context = frame_at(snapshot, 900_000, now_ms)
        if not primary or not context or len(context.usable_completed) < 3 or not primary.indicators.atr14:
            return reject(self.strategy_id, now_ms, 'MOMENTUM_PRIMARY_M15_CONTEXT_UNAVAILABLE')
        atr = primary.indicators.atr14
        forming = primary.developing
        if forming is None or not forming.usable or not forming.open_ms <= now_ms < forming.end_ms:
            return reject(self.strategy_id, now_ms, 'MOMENTUM_DEVELOPING_CANDLE_UNAVAILABLE')
        rows = primary.usable_completed
        prior = rows[-1]
        if prior.end_ms != forming.open_ms:
            return reject(self.strategy_id, now_ms, 'MOMENTUM_CANDLE_DISCONTINUITY')
        shape = candle_shape(prior)
        evidence = (('primary_timeframe_ms', cfg.primary_timeframe_ms), ('primary_atr', atr),
                    ('impulse_body_fraction', shape.body_fraction), ('impulse_body_atr', abs(shape.signed_body)/atr),
                    ('m15_regime', context.regime))
        side = model = trigger = invalidation = None
        impulse_side = 1 if shape.signed_body > 0 else -1
        wick = shape.upper_wick if impulse_side == 1 else shape.lower_wick
        span = prior.high-prior.low
        if abs(shape.signed_body) >= cfg.impulse_body_atr*atr and shape.body_fraction >= cfg.impulse_body_fraction:
            if span <= 0 or wick/span > cfg.maximum_directional_wick_fraction:
                return reject(self.strategy_id, now_ms, 'IMPULSE_EXHAUSTION_WICK', evidence)
            side = impulse_side
            trigger = prior.high+cfg.breakout_buffer_atr*atr if side == 1 else prior.low-cfg.breakout_buffer_atr*atr
            invalidation = (prior.open+prior.close)/2-side*cfg.stop_buffer_atr*atr
            model = 'STRONG_CANDLE_CONTINUATION'
        if model is None and len(rows) >= cfg.compression_bars:
            box = rows[-cfg.compression_bars:]
            if sum(r.high-r.low for r in box)/len(box) <= cfg.compression_range_atr*atr:
                high, low = max(r.high for r in box), min(r.low for r in box)
                price = snapshot.latest_tick.bid
                if price > high+cfg.breakout_buffer_atr*atr:
                    side, trigger, invalidation = 1, high+cfg.breakout_buffer_atr*atr, low-cfg.stop_buffer_atr*atr
                elif price < low-cfg.breakout_buffer_atr*atr:
                    side, trigger, invalidation = -1, low-cfg.breakout_buffer_atr*atr, high+cfg.stop_buffer_atr*atr
                if side is not None:
                    developing = candle_shape(forming)
                    if side*developing.signed_body < .25*atr or developing.body_fraction < .55:
                        self.memory.clear_setup()
                        return reject(self.strategy_id, now_ms, 'COMPRESSION_WITHOUT_DIRECTIONAL_EXPANSION', evidence)
                    model = 'COMPRESSION_BREAKOUT'
        if model is None:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'NO_MOMENTUM_ENTRY_MODEL', evidence)
        price = snapshot.latest_tick.bid
        chase = side*(price-trigger)
        if chase <= 0:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'MOMENTUM_TRIGGER_NOT_BROKEN', evidence, model)
        if chase > cfg.maximum_chase_atr*atr:
            return reject(self.strategy_id, now_ms, 'MOMENTUM_ENTRY_TOO_LATE', evidence, model)
        if context.regime == 'SHOCK' or context_direction(context) == -side:
            return reject(self.strategy_id, now_ms, 'MOMENTUM_M15_DIRECTION_CONFLICT', evidence, model)
        w5 = next((w for w in snapshot.windows if w.seconds == 5 and w.available), None)
        if w5 and (side*w5.move < 0 or w5.exhaustion_candidate):
            return reject(self.strategy_id, now_ms, 'MOMENTUM_TICK_FAILURE_OR_EXHAUSTION', evidence, model)
        if model == 'STRONG_CANDLE_CONTINUATION':
            # A large isolated candle is insufficient evidence of follow-through.
            # Demand actual directional context and observed short tick support;
            # compression expansion keeps its separate entry hypothesis.
            if context_direction(context) != side:
                return reject(self.strategy_id, now_ms, 'IMPULSE_WITHOUT_M15_FOLLOW_THROUGH', evidence, model)
            if not w5 or side*w5.directional_persistence < .55:
                return reject(self.strategy_id, now_ms, 'IMPULSE_WITHOUT_TICK_PERSISTENCE', evidence, model)
        distance = side*(price-invalidation)
        if distance <= 0 or distance > cfg.maximum_stop_atr*atr:
            return reject(self.strategy_id, now_ms, 'MOMENTUM_STRUCTURAL_STOP_INVALID', evidence, model)
        distance = max(distance, cfg.minimum_stop_atr*atr)
        return propose(self.strategy_id, snapshot, now_ms, costs, self.memory, cfg,
                       side='LONG' if side == 1 else 'SHORT', model=model, anchor=(prior.open_ms, forming.open_ms),
                       stop_distance=distance, invalidation_bid=invalidation, atr=atr, features=evidence)
