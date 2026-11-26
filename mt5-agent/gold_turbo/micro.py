"""Micro Scalper: tick persistence, micro-pullback resumption and rejection.

Uses M1 execution and M5 context; deliberately does not require a large completed
impulse or a compression breakout. All defaults are uncalibrated research values.
"""
from dataclasses import dataclass
from typing import Optional
from .contracts import positive
from .strategy_contracts import (EntryMemory, common_rejection, context_direction,
                                  frame_at, propose, reject, validate_config)

MICRO_ID = 'gold.turbo-micro-scalper'


@dataclass(frozen=True)
class MicroConfig:
    minimum_velocity_atr_per_second: float = .01
    acceleration_tolerance_atr: float = .001
    minimum_persistence: float = .55
    burst_persistence: float = .75
    maximum_15s_move_atr: float = .60
    target_atr: float = .40
    minimum_net_target_atr: float = .08
    minimum_net_rr: float = .65
    minimum_stop_atr: float = .18
    maximum_stop_atr: float = .80
    stop_buffer_atr: float = .04
    maximum_quote_age_ms: int = 2000
    entry_ttl_ms: int = 2000
    maximum_hold_ms: int = 120_000
    reentry_cooldown_ms: int = 5000
    trailing_trigger_r: float = .40
    trailing_distance_atr: float = .15
    lock_profit_r: float = .05
    partial_trigger_r: Optional[float] = None
    partial_fraction: float = 1.0

    def __post_init__(self):
        validate_config(self)
        positive(self.minimum_velocity_atr_per_second, 'VELOCITY_THRESHOLD_INVALID')
        positive(self.acceleration_tolerance_atr, 'ACCELERATION_TOLERANCE_INVALID')
        positive(self.maximum_15s_move_atr, 'CHASE_THRESHOLD_INVALID')
        positive(self.minimum_persistence, 'PERSISTENCE_THRESHOLD_INVALID')
        positive(self.burst_persistence, 'PERSISTENCE_THRESHOLD_INVALID')
        if not 0 < self.minimum_persistence <= self.burst_persistence <= 1:
            raise ValueError('PERSISTENCE_THRESHOLDS_INVALID')


class MicroScalper:
    strategy_id = MICRO_ID

    def __init__(self, config=None):
        self.config = config or MicroConfig()
        if not isinstance(self.config, MicroConfig):
            raise ValueError('MICRO_CONFIG_REQUIRED')
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
        m1, m5 = frame_at(snapshot, 60_000, now_ms), frame_at(snapshot, 300_000, now_ms)
        if not m1 or not m5 or len(m5.usable_completed) < 3 or not m1.indicators.atr14:
            return reject(self.strategy_id, now_ms, 'M1_M5_CONTEXT_UNAVAILABLE')
        atr = m1.indicators.atr14
        w5 = next((w for w in snapshot.windows if w.seconds == 5), None)
        w15 = next((w for w in snapshot.windows if w.seconds == 15), None)
        if not w5 or not w15 or not w5.available or not w15.available:
            return reject(self.strategy_id, now_ms, 'MICRO_TICK_HISTORY_UNAVAILABLE')
        evidence = (('velocity_5s', w5.velocity), ('acceleration_5s', w5.acceleration),
                    ('persistence_5s', w5.directional_persistence), ('move_15s', w15.move),
                    ('m1_atr', atr), ('m5_regime', m5.regime))
        if abs(w15.move) > cfg.maximum_15s_move_atr*atr:
            return reject(self.strategy_id, now_ms, 'MICRO_MOVE_ALREADY_EXTENDED', evidence)
        if abs(w5.velocity) < cfg.minimum_velocity_atr_per_second*atr or abs(w5.directional_persistence) < cfg.minimum_persistence:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'NO_DIRECTIONAL_MICRO_TRIGGER', evidence)
        side = 1 if w5.velocity > 0 else -1
        if side*w5.directional_persistence <= 0:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'MICRO_PERSISTENCE_CONFLICT', evidence)
        if m5.regime in ('SHOCK',) or context_direction(m5) == -side:
            return reject(self.strategy_id, now_ms, 'MICRO_CONTEXT_DIRECTION_CONFLICT', evidence)
        forming = m1.developing
        if forming is None or not forming.usable or not forming.open_ms <= now_ms < forming.end_ms:
            return reject(self.strategy_id, now_ms, 'MICRO_DEVELOPING_CANDLE_UNAVAILABLE', evidence)
        prior = m1.usable_completed[-1]
        if prior.end_ms != forming.open_ms:
            return reject(self.strategy_id, now_ms, 'MICRO_CANDLE_DISCONTINUITY', evidence)
        model = None
        event = m1.structure.developing_event
        if event in (('SUPPORT_REJECTION', 'FAILED_BREAKOUT_LOW') if side == 1 else ('RESISTANCE_REJECTION', 'FAILED_BREAKOUT_HIGH')):
            model = 'MICRO_REJECTION'
            invalidation = forming.low-cfg.stop_buffer_atr*atr if side == 1 else forming.high+cfg.stop_buffer_atr*atr
        elif side*(prior.close-prior.open) < 0 and prior.high-prior.low <= 1.2*atr and side*(snapshot.latest_tick.bid-prior.close) > 0:
            model = 'MICRO_PULLBACK_RESUME'
            invalidation = min(prior.low, forming.low)-cfg.stop_buffer_atr*atr if side == 1 else max(prior.high, forming.high)+cfg.stop_buffer_atr*atr
        elif (side*w15.move > 0 and side*w5.directional_persistence >= cfg.burst_persistence
              and w5.acceleration is not None and side*w5.acceleration >= -cfg.acceleration_tolerance_atr*atr
              and not w5.exhaustion_candidate and side*(forming.close-forming.open) > 0):
            model = 'MICRO_PERSISTENT_BURST'
            invalidation = snapshot.latest_tick.bid-side*cfg.minimum_stop_atr*atr
        if model is None:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'NO_QUALIFIED_MICRO_MODEL', evidence)
        distance = side*(snapshot.latest_tick.bid-invalidation)
        if distance > cfg.maximum_stop_atr*atr:
            return reject(self.strategy_id, now_ms, 'MICRO_STRUCTURAL_STOP_TOO_WIDE', evidence, model)
        distance = max(distance, cfg.minimum_stop_atr*atr)
        invalidation = snapshot.latest_tick.bid-side*distance
        return propose(self.strategy_id, snapshot, now_ms, costs, self.memory, cfg,
                       side='LONG' if side == 1 else 'SHORT', model=model, anchor=(prior.open_ms, forming.open_ms),
                       stop_distance=distance, invalidation_bid=invalidation, atr=atr, features=evidence)
