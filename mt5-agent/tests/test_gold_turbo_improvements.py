"""Regression evidence for the bounded period-9 hypothesis; no profitability claims."""
from dataclasses import replace
from types import SimpleNamespace
import unittest
from gold_turbo.micro import MicroScalper
from gold_turbo.momentum import MomentumScalper
from gold_turbo.range_scalper import RangeScalper
from gold_turbo.basket_strategy import BasketScalper
from gold_turbo.runtime import GoldTurboRuntime
from test_gold_turbo_scalpers import snapshot, COSTS


def neutral_m15(snap):
    def neutral(f):
        if f.timeframe_ms!=900000:return f
        return replace(f,regime='TRANSITION',completed=tuple(replace(c,close=c.open) for c in f.completed))
    return replace(snap,frames=tuple(neutral(f) for f in snap.frames))


class ImprovementTests(unittest.TestCase):
    def test_micro_burst_requires_longer_path_persistence_on_both_sides(self):
        for side in ('LONG','SHORT'):
            s=snapshot('burst',side);self.assertEqual(MicroScalper().evaluate(s,COSTS,s.as_of_ms).decision,side)
            s=replace(s,windows=tuple(replace(w,directional_persistence=.1 if side=='LONG' else -.1) if w.seconds==15 else w for w in s.windows))
            d=MicroScalper().evaluate(s,COSTS,s.as_of_ms)
            self.assertEqual(d.reasons,('MICRO_BURST_WITHOUT_15S_PERSISTENCE',))
    def test_completed_retest_does_not_require_excessive_macro_confirmation(self):
        for side in ('LONG','SHORT'):
            s=neutral_m15(snapshot('impulse',side));d=MomentumScalper().evaluate(s,COSTS,s.as_of_ms)
            self.assertEqual(d.decision,side)
            self.assertEqual(d.entry_model,'STRONG_CANDLE_RETEST_CONTINUATION')
    def test_impulse_requires_observed_tick_persistence(self):
        s=snapshot('impulse');s=replace(s,windows=tuple(replace(w,directional_persistence=.1) if w.seconds==5 else w for w in s.windows))
        self.assertEqual(MomentumScalper().evaluate(s,COSTS,s.as_of_ms).reasons,('IMPULSE_WITHOUT_TICK_PERSISTENCE',))
    def test_compression_remains_distinct_from_strong_candle_confirmation(self):
        s=neutral_m15(snapshot('compression'))
        d=MomentumScalper().evaluate(s,COSTS,s.as_of_ms)
        self.assertEqual(d.entry_model,'COMPRESSION_BREAKOUT');self.assertIsNotNone(d.plan)
    def candidates(self):
        s=snapshot();base=MicroScalper().evaluate(s,COSTS,s.as_of_ms)
        s=replace(s,frames=tuple(replace(f,regime='RANGE') if f.timeframe_ms==300000 else f for f in s.frames))
        r=replace(base,strategy_id=RangeScalper.strategy_id,entry_model='RANGE_FAILED_BREAKOUT',opportunity_id='range',plan=replace(base.plan,strategy_id=RangeScalper.strategy_id,entry_model='RANGE_FAILED_BREAKOUT',opportunity_id='range'))
        m=replace(base,strategy_id=MomentumScalper.strategy_id,entry_model='STRONG_CANDLE_CONTINUATION',opportunity_id='momentum',plan=replace(base.plan,strategy_id=MomentumScalper.strategy_id,entry_model='STRONG_CANDLE_CONTINUATION',opportunity_id='momentum',planned_net_reward=base.plan.planned_net_reward*100))
        return s,r,m
    def test_adaptive_prefers_range_fit_over_large_hypothetical_target(self):
        s,r,m=self.candidates();runtime=GoldTurboRuntime.__new__(GoldTurboRuntime)
        runtime.engines={d.strategy_id:SimpleNamespace(config=MomentumScalper().config,evaluate=lambda *a,d=d:d) for d in (m,r)}
        runtime._record_decision=lambda d:None
        c=dict(strategy_ids=[m.strategy_id,r.strategy_id],selection_mode='ADAPTIVE')
        self.assertEqual(runtime._candidates(s,COSTS,c,s.as_of_ms)[0][0],r.strategy_id)
        self.assertEqual(runtime._candidates(s,COSTS,dict(c,selection_mode='CUSTOM'),s.as_of_ms)[0][0],m.strategy_id)
    def test_flagship_uses_same_regime_suitability_before_geometry(self):
        s,r,m=self.candidates();basket=BasketScalper();basket._direct_models=lambda *a:[]
        basket.engines=tuple(SimpleNamespace(config=MomentumScalper().config,evaluate=lambda *a,d=d:d) for d in (m,r))
        d=basket.evaluate(s,COSTS,s.as_of_ms)
        self.assertEqual(dict(d.features)['selected_source_strategy'],r.strategy_id)
        self.assertEqual(dict(d.features)['regime_fit_ordinal'],2)

if __name__=='__main__':unittest.main()
