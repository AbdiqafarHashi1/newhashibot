"""Trend Scalper: pullback/retest entries inside an established M15 trend.

Unlike Momentum, an impulse/breakout alone is insufficient. A prior directional
retracement must reach EMA or confirmed structure before live resumption.
"""
from dataclasses import dataclass
from .contracts import integer, positive
from .strategy_contracts import (EntryMemory, common_rejection, frame_at,
                                  propose, reject, validate_config)

TREND_ID = 'gold.turbo-trend-scalper'


@dataclass(frozen=True)
class TrendConfig:
    primary_timeframe_ms: int = 300_000
    pullback_bars: int = 3
    minimum_pullback_atr: float = .20
    maximum_pullback_atr: float = 2.50
    retest_tolerance_atr: float = .65
    resumption_buffer_atr: float = .02
    maximum_chase_atr: float = .35
    target_atr: float = 2.0
    minimum_net_target_atr: float = .25
    minimum_net_rr: float = 1.20
    minimum_stop_atr: float = .40
    maximum_stop_atr: float = 2.0
    stop_buffer_atr: float = .08
    maximum_quote_age_ms: int = 2000
    entry_ttl_ms: int = 5000
    maximum_hold_ms: int = 2_700_000
    reentry_cooldown_ms: int = 60_000
    trailing_trigger_r: float = 1.0
    trailing_distance_atr: float = .80
    lock_profit_r: float = .15
    partial_trigger_r: float = 1.0
    partial_fraction: float = .5

    def __post_init__(self):
        validate_config(self)
        if type(self.primary_timeframe_ms) is not int or self.primary_timeframe_ms not in (300_000, 900_000):
            raise ValueError('TREND_PRIMARY_FRAME_INVALID')
        integer(self.pullback_bars, 'PULLBACK_LOOKBACK_INVALID', 1)
        if not 2 <= self.pullback_bars <= 10:
            raise ValueError('PULLBACK_LOOKBACK_INVALID')
        for name in ('minimum_pullback_atr', 'maximum_pullback_atr', 'retest_tolerance_atr',
                     'resumption_buffer_atr', 'maximum_chase_atr'):
            positive(getattr(self, name), 'TREND_THRESHOLD_INVALID:'+name)
        if self.minimum_pullback_atr > self.maximum_pullback_atr:
            raise ValueError('PULLBACK_BOUNDS_INVALID')


class TrendScalper:
    strategy_id = TREND_ID

    def __init__(self, config=None):
        self.config = config or TrendConfig()
        if not isinstance(self.config, TrendConfig):
            raise ValueError('TREND_CONFIG_REQUIRED')
        self.memory = EntryMemory()
        self._admitted_pullback = None

    def record_admission(self, decision, at_ms):
        if decision.strategy_id != self.strategy_id:
            raise ValueError('STRATEGY_SCOPE_MISMATCH')
        anchor = dict(decision.features).get('setup_anchor')
        if anchor is None or anchor == self._admitted_pullback:
            raise ValueError('STRUCTURAL_SETUP_ALREADY_ADMITTED_OR_MISSING')
        self.memory.record(decision, at_ms, self.config.reentry_cooldown_ms)
        self._admitted_pullback = anchor

    def evaluate(self, snapshot, costs, now_ms):
        self.memory.observe_clock(now_ms)
        cfg = self.config
        blocked = common_rejection(snapshot, now_ms, cfg.maximum_quote_age_ms)
        if blocked:
            return reject(self.strategy_id, now_ms, blocked)
        primary = frame_at(snapshot, cfg.primary_timeframe_ms, now_ms)
        context = frame_at(snapshot, 900_000, now_ms)
        if not primary or not context or not primary.indicators.atr14 or primary.indicators.ema20 is None or len(primary.usable_completed) < cfg.pullback_bars+3:
            return reject(self.strategy_id, now_ms, 'TREND_CONTEXT_UNAVAILABLE')
        evidence = (('primary_timeframe_ms', cfg.primary_timeframe_ms), ('m15_regime', context.regime),
                    ('primary_regime', primary.regime), ('ema20', primary.indicators.ema20))
        if context.regime not in ('TREND_UP', 'TREND_DOWN'):
            return reject(self.strategy_id, now_ms, 'ESTABLISHED_TREND_REQUIRED', evidence)
        sign = 1 if context.regime == 'TREND_UP' else -1
        opposite = 'TREND_DOWN' if sign == 1 else 'TREND_UP'
        opposite_swing = 'DOWN' if sign == 1 else 'UP'
        if primary.regime in (opposite, 'SHOCK') or primary.structure.swing_direction == opposite_swing:
            return reject(self.strategy_id, now_ms, 'TREND_PRIMARY_STRUCTURE_CONFLICT', evidence)
        rows = primary.usable_completed
        pullback = rows[-cfg.pullback_bars:]
        atr = primary.indicators.atr14
        extreme = min(r.low for r in pullback) if sign == 1 else max(r.high for r in pullback)
        preceding = rows[-cfg.pullback_bars-3:-cfg.pullback_bars]
        reference = max(r.high for r in preceding) if sign == 1 else min(r.low for r in preceding)
        depth = sign*(reference-extreme)
        evidence += (('atr', atr), ('pullback_depth_atr', depth/atr), ('pullback_extreme', extreme))
        if not any(sign*(r.close-r.open) < 0 for r in pullback):
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'NO_TREND_PULLBACK', evidence)
        if not cfg.minimum_pullback_atr*atr <= depth <= cfg.maximum_pullback_atr*atr:
            return reject(self.strategy_id, now_ms, 'TREND_PULLBACK_DEPTH_INVALID', evidence)
        model = None
        level = None
        if abs(extreme-primary.indicators.ema20) <= cfg.retest_tolerance_atr*atr:
            model, level = 'TREND_EMA_PULLBACK', primary.indicators.ema20
        else:
            kind = 'LOW' if sign == 1 else 'HIGH'
            # A pivot confirmed after the retracement began cannot establish the
            # level the retracement is supposed to retest.
            pivots = [p for p in primary.structure.pivots if p.kind == kind and p.confirmed_at_ms <= pullback[0].open_ms]
            if pivots:
                level = pivots[-1].price
                if abs(extreme-level) <= cfg.retest_tolerance_atr*atr:
                    model = 'TREND_STRUCTURE_RETEST'
        if model is None:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'PULLBACK_WITHOUT_QUALIFIED_RETEST', evidence)
        forming = primary.developing
        prior = rows[-1]
        if forming is None or not forming.usable or not forming.open_ms <= now_ms < forming.end_ms or prior.end_ms != forming.open_ms:
            return reject(self.strategy_id, now_ms, 'TREND_DEVELOPING_CANDLE_UNAVAILABLE', evidence, model)
        trigger = prior.high+cfg.resumption_buffer_atr*atr if sign == 1 else prior.low-cfg.resumption_buffer_atr*atr
        chase = sign*(snapshot.latest_tick.bid-trigger)
        if chase <= 0:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'TREND_RESUMPTION_NOT_CONFIRMED', evidence, model)
        if chase > cfg.maximum_chase_atr*atr:
            return reject(self.strategy_id, now_ms, 'TREND_ENTRY_TOO_LATE', evidence, model)
        w5 = next((w for w in snapshot.windows if w.seconds == 5 and w.available), None)
        if w5 and sign*w5.move < 0 and sign*w5.directional_persistence <= -.65:
            return reject(self.strategy_id, now_ms, 'TREND_RESUMPTION_TICK_CONFLICT', evidence, model)
        invalidation = extreme-sign*cfg.stop_buffer_atr*atr
        distance = sign*(snapshot.latest_tick.bid-invalidation)
        if distance <= 0 or distance > cfg.maximum_stop_atr*atr:
            return reject(self.strategy_id, now_ms, 'TREND_STRUCTURAL_STOP_INVALID', evidence, model)
        distance = max(distance, cfg.minimum_stop_atr*atr)
        anchor = (snapshot.source, 'LONG' if sign == 1 else 'SHORT', pullback[0].open_ms, prior.open_ms, level)
        if anchor == self._admitted_pullback:
            return reject(self.strategy_id, now_ms, 'STRUCTURAL_SETUP_ALREADY_ADMITTED', evidence)
        return propose(self.strategy_id, snapshot, now_ms, costs, self.memory, cfg,
                       side='LONG' if sign == 1 else 'SHORT', model=model,
                       anchor=(pullback[0].open_ms, prior.open_ms, level), stop_distance=distance,
                       invalidation_bid=invalidation, atr=atr, features=evidence+(('retest_level', level), ('setup_anchor', anchor)),
                       regime_exit_timeframe_ms=900_000, regime_exit_policy='TREND',
                       early_failure_velocity_atr_per_second=None)
