"""Flagship competing price-action entry models. Research decisions only.

Candidate ranking is a transparent heuristic over planned geometry and regime,
not a calibrated probability or a demonstration that adaptive selection wins.
"""
from dataclasses import dataclass, replace
from .contracts import positive
from .arbitration import regime_fit
from .micro import MicroScalper
from .momentum import MomentumScalper
from .range_scalper import RangeScalper
from .trend import TrendScalper
from .strategy_contracts import (EntryMemory, StrategyDecision, common_rejection,
                                  context_direction, frame_at, propose, reject, validate_config)

BASKET_ID = 'gold.turbo-price-action-basket'


@dataclass(frozen=True)
class BasketEntryConfig:
    ambiguity_score_gap: float = .08
    target_atr: float = .75
    minimum_net_target_atr: float = .10
    minimum_net_rr: float = .90
    minimum_stop_atr: float = .25
    maximum_stop_atr: float = 1.20
    stop_buffer_atr: float = .05
    maximum_quote_age_ms: int = 2000
    entry_ttl_ms: int = 2000
    maximum_hold_ms: int = 300_000
    reentry_cooldown_ms: int = 5000
    trailing_trigger_r: float = .45
    trailing_distance_atr: float = .25
    lock_profit_r: float = .08
    partial_trigger_r: object = None
    partial_fraction: float = 1.0

    def __post_init__(self):
        validate_config(self)
        positive(self.ambiguity_score_gap, 'AMBIGUITY_THRESHOLD_INVALID')
        if self.ambiguity_score_gap > 1:
            raise ValueError('AMBIGUITY_THRESHOLD_INVALID')


class BasketScalper:
    strategy_id = BASKET_ID

    def __init__(self, config=None):
        self.config = config or BasketEntryConfig()
        if not isinstance(self.config, BasketEntryConfig):
            raise ValueError('BASKET_ENTRY_CONFIG_REQUIRED')
        self.engines = (MicroScalper(), MomentumScalper(), RangeScalper(), TrendScalper())
        self.memory = EntryMemory()
        self.direct_memory = EntryMemory()

    def record_admission(self, decision, at_ms):
        if decision.strategy_id != self.strategy_id:
            raise ValueError('STRATEGY_SCOPE_MISMATCH')
        self.memory.record(decision, at_ms, self.config.reentry_cooldown_ms)

    def _direct_models(self, snapshot, costs, now_ms):
        m1, m5 = frame_at(snapshot, 60_000, now_ms), frame_at(snapshot, 300_000, now_ms)
        if not m1 or not m5 or not m1.indicators.atr14 or len(m1.usable_completed) < 2:
            return [reject(self.strategy_id, now_ms, 'BASKET_PA_CONTEXT_UNAVAILABLE')]
        forming = m1.developing
        if forming is None or not forming.usable or not forming.open_ms <= now_ms < forming.end_ms:
            return [reject(self.strategy_id, now_ms, 'BASKET_PA_DEVELOPING_UNAVAILABLE')]
        previous, before = m1.usable_completed[-1], m1.usable_completed[-2]
        if previous.end_ms != forming.open_ms:
            return [reject(self.strategy_id, now_ms, 'BASKET_PA_CANDLE_DISCONTINUITY')]
        atr, price = m1.indicators.atr14, snapshot.latest_tick.bid
        w5 = next((w for w in snapshot.windows if w.seconds == 5 and w.available), None)
        w15 = next((w for w in snapshot.windows if w.seconds == 15 and w.available), None)
        candidates = []
        for side in (1, -1):
            if context_direction(m5) == -side or m5.regime == 'SHOCK':
                continue
            models = []
            if (w5 and w15 and w15.exhaustion_candidate and side*w15.move < 0
                    and side*w5.velocity > .01*atr and side*w5.directional_persistence >= .6
                    and m1.developing_shape and m1.developing_shape.rejection == ('LOWER_WICK' if side == 1 else 'UPPER_WICK')):
                models.append('MICRO_EXHAUSTION_REVERSAL')
            inside = previous.high < before.high and previous.low > before.low
            trigger = previous.high if side == 1 else previous.low
            if (inside and side*(previous.close-previous.open) > 0 and side*(price-trigger) > .02*atr
                    and side*(price-trigger) <= .35*atr and side*(forming.close-forming.open) > 0):
                models.append('PREVIOUS_CANDLE_ANTICIPATION')
            for model in models:
                extreme = min(previous.low, forming.low) if side == 1 else max(previous.high, forming.high)
                invalidation = extreme-side*self.config.stop_buffer_atr*atr
                distance = side*(price-invalidation)
                if not 0 < distance <= self.config.maximum_stop_atr*atr:
                    candidates.append(reject(self.strategy_id, now_ms, 'BASKET_PA_STOP_INVALID', model=model))
                    continue
                candidates.append(propose(self.strategy_id, snapshot, now_ms, costs, self.direct_memory, self.config,
                    side='LONG' if side == 1 else 'SHORT', model=model, anchor=(previous.open_ms, forming.open_ms),
                    stop_distance=max(distance, self.config.minimum_stop_atr*atr), invalidation_bid=invalidation,
                    atr=atr, features=(('m1_atr', atr), ('m5_regime', m5.regime), ('inside_previous_candle', inside))))
        return candidates or [reject(self.strategy_id, now_ms, 'NO_DIRECT_PRICE_ACTION_MODEL')]

    @staticmethod
    def _model(candidate):
        model = candidate.entry_model
        if model in ('MICRO_REJECTION', 'RANGE_BOUNDARY_REJECTION'):
            return 'SUPPORT_RESISTANCE_REJECTION'
        if model in ('RANGE_FAILED_BREAKOUT', 'COMPRESSION_BREAKOUT'):
            return 'FAILED_BREAK_OR_RANGE' if model == 'RANGE_FAILED_BREAKOUT' else 'COMPRESSION_CONTINUATION'
        return model

    def evaluate(self, snapshot, costs, now_ms):
        self.memory.observe_clock(now_ms)
        blocked = common_rejection(snapshot, now_ms, self.config.maximum_quote_age_ms)
        if blocked:
            return reject(self.strategy_id, now_ms, blocked)
        evaluated = [engine.evaluate(snapshot, costs, now_ms) for engine in self.engines]
        evaluated += self._direct_models(snapshot, costs, now_ms)
        audit = tuple((d.strategy_id, d.entry_model, d.decision, d.reasons) for d in evaluated)
        candidates = []
        m5 = frame_at(snapshot, 300_000, now_ms)
        direction = context_direction(m5) if m5 else 0
        for d in evaluated:
            if d.plan is None:
                continue
            rr = d.plan.planned_net_reward/d.plan.planned_loss_with_costs
            sign = 1 if d.decision == 'LONG' else -1
            score = rr/(1+rr) + (.10 if direction == sign else 0)
            candidates.append((score, self._model(d), d))
        candidates.sort(key=lambda item:(-regime_fit(snapshot,item[2],now_ms), -item[0], item[1], item[2].strategy_id))
        if not candidates:
            self.memory.clear_setup()
            return reject(self.strategy_id, now_ms, 'NO_QUALIFIED_BASKET_ENTRY', (('model_decisions', audit),))
        score, model, chosen = candidates[0]
        opposite = [c for c in candidates if c[2].decision != chosen.decision and regime_fit(snapshot,c[2],now_ms)==regime_fit(snapshot,chosen,now_ms)]
        if opposite and score-opposite[0][0] < self.config.ambiguity_score_gap:
            return reject(self.strategy_id, now_ms, 'AMBIGUOUS_OPPOSING_BASKET_MODELS', (('model_decisions', audit),))
        opportunity = self.memory.opportunity(self.strategy_id, snapshot.source, chosen.decision, model,
                                              chosen.opportunity_id, now_ms)
        blocked = self.memory.admission_rejection(opportunity, now_ms, self.config.reentry_cooldown_ms)
        if blocked:
            return reject(self.strategy_id, now_ms, blocked, (('model_decisions', audit),), model)
        plan = replace(chosen.plan, strategy_id=self.strategy_id, opportunity_id=opportunity,
                       entry_model=model, created_at_ms=now_ms, expires_at_ms=now_ms+self.config.entry_ttl_ms,
                       maximum_hold_ms=self.config.maximum_hold_ms)
        return StrategyDecision(self.strategy_id, plan.strategy_version, now_ms, chosen.decision, model, opportunity,
            ('QUALIFIED_RESEARCH_BASKET_CANDIDATE',), chosen.features+(('ranking_score_not_probability', score), ('regime_fit_ordinal', regime_fit(snapshot,chosen,now_ms)),
            ('selected_source_strategy', chosen.strategy_id), ('selected_source_opportunity', chosen.opportunity_id), ('model_decisions', audit)), plan)
