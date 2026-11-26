"""Scalp-structure regressions, including contradictory and repeated admissions."""
from dataclasses import replace
import unittest
from gold_turbo.micro import MicroScalper, MicroConfig
from gold_turbo.momentum import MomentumScalper, MomentumConfig
from gold_turbo.trend import TrendScalper, TrendConfig
from gold_turbo.basket_strategy import BasketScalper, BasketEntryConfig
from gold_turbo.runtime import GoldTurboRuntime
from test_gold_turbo_scalpers import snapshot, COSTS
from test_gold_turbo_range_trend import fixture


class RedesignTests(unittest.TestCase):
    def test_micro_stop_respects_observed_tick_extreme_both_sides(self):
        for side in ('LONG','SHORT'):
            s=snapshot('burst',side);d=MicroScalper().evaluate(s,COSTS,s.as_of_ms)
            w=next(w for w in s.windows if w.seconds==5)
            self.assertIsNotNone(d.plan)
            buffer=.04*d.plan.atr_at_entry
            if side=='LONG':self.assertLessEqual(d.plan.stop,w.low_bid-buffer+1e-9)
            else:self.assertGreaterEqual(d.plan.stop,w.high_bid+buffer-1e-9)
    def test_momentum_retest_must_follow_actual_completed_breakout(self):
        for side in ('LONG','SHORT'):
            s=snapshot('impulse',side);d=MomentumScalper().evaluate(s,COSTS,s.as_of_ms)
            self.assertIsNotNone(d.plan)
            p=next(f for f in s.frames if f.timeframe_ms==60000)
            impulse=p.completed[-2]
            self.assertAlmostEqual(dict(d.features)['impulse_body_fraction'],abs(impulse.close-impulse.open)/(impulse.high-impulse.low))
            rows=list(p.completed);impulse=rows[-2]
            rows[-2]=replace(impulse,open=2000.,high=2000.5,low=1999.5,close=2000.)
            bad=replace(s,frames=tuple(replace(f,completed=tuple(rows)) if f.timeframe_ms==60000 else f for f in s.frames))
            self.assertIsNone(MomentumScalper().evaluate(bad,COSTS,bad.as_of_ms).plan)
    def test_retest_cannot_be_inferred_across_missing_completed_interval(self):
        s=snapshot('impulse');primary=s.frames[0];rows=list(primary.completed)
        rows[-2]=replace(rows[-2],open_ms=rows[-2].open_ms-60000)
        s=replace(s,frames=(replace(primary,completed=tuple(rows)),)+s.frames[1:])
        self.assertIsNone(MomentumScalper().evaluate(s,COSTS,s.as_of_ms).plan)
    def test_trend_does_not_enter_context_its_manager_already_invalidates(self):
        for side in ('LONG','SHORT'):
            s=fixture('trend',side);self.assertIsNotNone(TrendScalper().evaluate(s,COSTS,s.as_of_ms).plan)
            s=replace(s,frames=tuple(replace(f,structure=replace(f.structure,swing_direction='DOWN' if side=='LONG' else 'UP')) if f.timeframe_ms==900000 else f for f in s.frames))
            self.assertEqual(TrendScalper().evaluate(s,COSTS,s.as_of_ms).reasons,('TREND_CONTEXT_STRUCTURE_CONFLICT',))
    def test_flagship_records_selected_child_and_checkpoint_contains_it(self):
        s=snapshot();engine=BasketScalper();d=engine.evaluate(s,COSTS,s.as_of_ms)
        child=next(e for e in engine.engines if e.strategy_id==dict(d.features)['selected_source_strategy'])
        engine.record_admission(d,s.as_of_ms)
        self.assertEqual(child.memory.admitted_id,dict(d.features)['selected_source_opportunity'])
        self.assertIsNone(engine.evaluate(s,COSTS,s.as_of_ms).plan)
        state=GoldTurboRuntime._engine_state(engine);other=BasketScalper()
        GoldTurboRuntime._restore_engine(other,state)
        restored=next(e for e in other.engines if e.strategy_id==child.strategy_id)
        self.assertEqual(restored.memory.admitted_id,child.memory.admitted_id)
    def test_flagship_m5_rejection_target_stays_inside_observed_range(self):
        s=snapshot('rejection');s=replace(s,frames=tuple(replace(f,regime='TRANSITION',completed=tuple(replace(c,low=1999.7,high=2002.5) for c in f.completed)) if f.timeframe_ms==300000 else f for f in s.frames))
        ds=BasketScalper()._direct_models(s,COSTS,s.as_of_ms)
        d=next(d for d in ds if d.entry_model=='M5_SUPPORT_RESISTANCE_REJECTION')
        self.assertIsNotNone(d.plan);self.assertLessEqual(d.plan.target,(1999.7+2002.5)/2)
        self.assertLessEqual(d.plan.maximum_hold_ms,300000)
    def test_holding_limits_are_not_extended_to_turn_scalps_into_swings(self):
        self.assertEqual(MicroConfig().maximum_hold_ms,120000)
        self.assertEqual(MomentumConfig().maximum_hold_ms,900000)
        self.assertEqual(BasketEntryConfig().maximum_hold_ms,300000)
        self.assertEqual(TrendConfig().maximum_hold_ms,2700000)

if __name__=='__main__':unittest.main()
