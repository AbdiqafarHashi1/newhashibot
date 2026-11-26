"""Range Scalper: repeated boundary reactions and rejection, not tick momentum.

Boundaries are frozen from completed history preceding the trigger candle.
Targets stay inside that observed range; stronger trends/breakouts are not faded.
"""
from dataclasses import dataclass
from typing import Optional
from .contracts import integer, positive
from .features import price_event
from .strategy_contracts import (EntryMemory, common_rejection, frame_at,
                                  propose, reject, validate_config)

RANGE_ID = 'gold.turbo-range-scalper'


@dataclass(frozen=True)
class RangeConfig:
    primary_timeframe_ms: int = 60_000
    range_bars: int = 20
    minimum_reactions: int = 2
    reaction_separation_bars: int = 3
    reaction_tolerance_atr: float = .15
    reaction_reset_atr: float = .35
    maximum_boundary_fraction: float = .25
    minimum_range_atr: float = 1.0
    maximum_range_atr: float = 8.0
    target_range_fraction: float = .65
    target_atr: float = .90
    minimum_net_target_atr: float = .12
    minimum_net_rr: float = 1.0
    minimum_stop_atr: float = .25
    maximum_stop_atr: float = 1.0
    stop_buffer_atr: float = .08
    maximum_quote_age_ms: int = 2000
    entry_ttl_ms: int = 3000
    maximum_hold_ms: int = 600_000
    reentry_cooldown_ms: int = 15_000
    trailing_trigger_r: float = .40
    trailing_distance_atr: float = .25
    lock_profit_r: float = .08
    partial_trigger_r: Optional[float] = None
    partial_fraction: float = 1.0

    def __post_init__(self):
        validate_config(self)
        if type(self.primary_timeframe_ms) is not int or self.primary_timeframe_ms not in (60_000, 300_000):
            raise ValueError('RANGE_PRIMARY_FRAME_INVALID')
        for name in ('range_bars', 'minimum_reactions', 'reaction_separation_bars'):
            integer(getattr(self, name), 'RANGE_LOOKBACK_INVALID:'+name, 1)
        if not 6 <= self.range_bars <= 100 or self.minimum_reactions*self.reaction_separation_bars > self.range_bars:
            raise ValueError('RANGE_REACTION_REQUIREMENT_INVALID')
        for name in ('reaction_tolerance_atr', 'reaction_reset_atr', 'maximum_boundary_fraction',
                     'minimum_range_atr', 'maximum_range_atr', 'target_range_fraction'):
            positive(getattr(self, name), 'RANGE_THRESHOLD_INVALID:'+name)
        if not 0 < self.maximum_boundary_fraction < .5 or not .5 <= self.target_range_fraction < 1:
            raise ValueError('RANGE_BOUNDARY_OR_TARGET_INVALID')
        if self.minimum_range_atr > self.maximum_range_atr:
            raise ValueError('RANGE_WIDTH_BOUNDS_INVALID')


def _reaction_count(rows, level, sign, atr, cfg):
    """Count separated touch/recovery episodes, not every touching candle."""
    count, previous_index, armed = 0, -cfg.reaction_separation_bars, True
    for i, row in enumerate(rows):
        if i and sign*(rows[i-1].close-level) >= cfg.reaction_reset_atr*atr:
            armed = True
        extreme = row.low if sign == 1 else row.high
        touched = abs(extreme-level) <= cfg.reaction_tolerance_atr*atr
        recovered = sign*(row.close-level) > cfg.reaction_tolerance_atr*atr
        if armed and touched and recovered and i-previous_index >= cfg.reaction_separation_bars:
            count += 1
            previous_index, armed = i, False
    return count


class RangeScalper:
    strategy_id = RANGE_ID

    def __init__(self, config=None):
        self.config = config or RangeConfig()
        if not isinstance(self.config, RangeConfig):
            raise ValueError('RANGE_CONFIG_REQUIRED')
        self.memory = EntryMemory()
        self._admitted_reaction = None

    def record_admission(self, decision, at_ms):
        if decision.strategy_id != self.strategy_id:
            raise ValueError('STRATEGY_SCOPE_MISMATCH')
        anchor = dict(decision.features).get('setup_anchor')
        if anchor is None or anchor == self._admitted_reaction:
            raise ValueError('STRUCTURAL_SETUP_ALREADY_ADMITTED_OR_MISSING')
        self.memory.record(decision, at_ms, self.config.reentry_cooldown_ms)
        self._admitted_reaction = anchor

    def evaluate(self, snapshot, costs, now_ms):
        self.memory.observe_clock(now_ms)
        cfg = self.config
        blocked = common_rejection(snapshot, now_ms, cfg.maximum_quote_age_ms)
        if blocked:
            return reject(self.strategy_id, now_ms, blocked)
        primary = frame_at(snapshot, cfg.primary_timeframe_ms, now_ms)
        context = frame_at(snapshot, 300_000, now_ms)
        if not primary or not context or not primary.indicators.atr14 or len(primary.usable_completed) < cfg.range_bars+1:
            return reject(self.strategy_id, now_ms, 'RANGE_HISTORY_UNAVAILABLE')
        evidence = (('primary_timeframe_ms', cfg.primary_timeframe_ms), ('primary_regime', primary.regime),
                    ('m5_regime', context.regime), ('efficiency20', primary.indicators.efficiency20))
        if primary.regime != 'RANGE' or context.regime not in ('RANGE', 'TRANSITION', 'COMPRESSION'):
            return reject(self.strategy_id, now_ms, 'RANGE_REGIME_UNSUITABLE', evidence)
        atr = primary.indicators.atr14
        rows = primary.usable_completed
        history = rows[-cfg.range_bars-1:-1]
        support, resistance = min(r.low for r in history), max(r.high for r in history)
        width = resistance-support
        if not cfg.minimum_range_atr*atr <= width <= cfg.maximum_range_atr*atr:
            return reject(self.strategy_id, now_ms, 'RANGE_WIDTH_UNSUITABLE', evidence)
        price = snapshot.latest_tick.bid
        position = (price-support)/width
        evidence += (('support', support), ('resistance', resistance), ('range_position', position), ('atr', atr))
        if not 0 < position < 1:
            return reject(self.strategy_id, now_ms, 'RANGE_BREAKOUT_NOT_REJECTION', evidence)
        sign = 1 if position <= cfg.maximum_boundary_fraction else -1 if position >= 1-cfg.maximum_boundary_fraction else 0
        if not sign:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'RANGE_MIDDLE_NO_ENTRY', evidence)
        level = support if sign == 1 else resistance
        reactions = _reaction_count(history, level, sign, atr, cfg)
        evidence += (('separated_reactions', reactions),)
        if reactions < cfg.minimum_reactions:
            return reject(self.strategy_id, now_ms, 'RANGE_REACTIONS_INSUFFICIENT', evidence)
        tolerance = cfg.reaction_tolerance_atr*atr
        valid_events = ('SUPPORT_REJECTION', 'FAILED_BREAKOUT_LOW') if sign == 1 else ('RESISTANCE_REJECTION', 'FAILED_BREAKOUT_HIGH')
        forming = primary.developing
        if forming is None or not forming.usable or not forming.open_ms <= now_ms < forming.end_ms or rows[-1].end_ms != forming.open_ms:
            return reject(self.strategy_id, now_ms, 'RANGE_DEVELOPING_CANDLE_UNAVAILABLE', evidence)
        signal = None
        event = None
        for candidate in (forming, rows[-1]):
            event = price_event(candidate, support, resistance, tolerance)
            if event in valid_events:
                signal = candidate
                break
        if signal is None:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'NO_RANGE_REJECTION', evidence)
        w5 = next((w for w in snapshot.windows if w.seconds == 5 and w.available), None)
        if w5 and sign*w5.directional_persistence <= -.65 and sign*w5.velocity < -.01*atr:
            return reject(self.strategy_id, now_ms, 'RANGE_REJECTION_STILL_FAILING', evidence)
        invalidation = min(support, signal.low)-cfg.stop_buffer_atr*atr if sign == 1 else max(resistance, signal.high)+cfg.stop_buffer_atr*atr
        distance = sign*(price-invalidation)
        if distance <= 0 or distance > cfg.maximum_stop_atr*atr:
            return reject(self.strategy_id, now_ms, 'RANGE_STRUCTURAL_STOP_INVALID', evidence)
        distance = max(distance, cfg.minimum_stop_atr*atr)
        target_bid = support+cfg.target_range_fraction*width if sign == 1 else resistance-cfg.target_range_fraction*width
        target_move = min(cfg.target_atr*atr, sign*(target_bid-price))
        if target_move <= 0:
            return reject(self.strategy_id, now_ms, 'RANGE_TARGET_ALREADY_PASSED', evidence)
        anchor = (snapshot.source, 'LONG' if sign == 1 else 'SHORT', signal.open_ms, support, resistance)
        if anchor == self._admitted_reaction:
            return reject(self.strategy_id, now_ms, 'STRUCTURAL_SETUP_ALREADY_ADMITTED', evidence)
        return propose(self.strategy_id, snapshot, now_ms, costs, self.memory, cfg,
                       side='LONG' if sign == 1 else 'SHORT',
                       model='RANGE_FAILED_BREAKOUT' if event.startswith('FAILED_') else 'RANGE_BOUNDARY_REJECTION',
                       anchor=(signal.open_ms, support, resistance), stop_distance=distance,
                       invalidation_bid=invalidation, atr=atr, features=evidence+(('rejection_event', event), ('setup_anchor', anchor)),
                       target_move=target_move, regime_exit_timeframe_ms=cfg.primary_timeframe_ms,
                       regime_exit_policy='RANGE')
