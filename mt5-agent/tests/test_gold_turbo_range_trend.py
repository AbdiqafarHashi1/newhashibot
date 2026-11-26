"""Synthetic Range/Trend correctness, not financial validation."""
from dataclasses import FrozenInstanceError, replace
import unittest
from gold_turbo import Candle, MarketIntelligence, Tick
from gold_turbo.range_scalper import RangeScalper, RangeConfig, _reaction_count
from gold_turbo.trend import TrendScalper, TrendConfig
from gold_turbo.features import Pivot
from gold_turbo.strategy_contracts import ExecutionCosts
from gold_turbo.management import PositionObservation, manage_position

BASE = 1_800_000_000_000
SOURCE = 'synthetic-range-trend'
COSTS = ExecutionCosts(100, 1, .005, .01, 'synthetic explicit cost scenario')


def bar(tf, at, o, h, l, c):
    return Candle('XAUUSD', SOURCE, tf, at, o, h, l, c, 100, 'BROKER_COMPLETED_BAR')


def fixture(style='range', side='LONG', primary=None):
    primary = primary or (60_000 if style.startswith('range') else 300_000)
    sign = 1 if side == 'LONG' else -1
    def reflected(row):
        return row if sign == 1 else replace(row, open=4000-row.open, high=4000-row.low,
                                            low=4000-row.high, close=4000-row.close)
    engine = MarketIntelligence('XAUUSD', SOURCE)
    seeded = []
    for tf in (60_000, 300_000, 900_000):
        for i in range(60):
            if style.startswith('range'):
                row = bar(tf, BASE-(60-i)*tf, 2000, 2001, 1999, 2000+(.2 if i % 2 else -.2))
            else:
                c = 1990+i*.2
                row = bar(tf, BASE-(60-i)*tf, c-.1, c+.6, c-.6, c)
            seeded.append(reflected(row))
    engine.seed_completed(seeded, BASE)
    for t in range(0, primary+1, 1000):
        price = 2000+(.4 if t//1000 % 2 else -.4) if style.startswith('range') else 2001.4+(.3 if t//1000 % 2 else -.3)
        bid = price if sign == 1 else 4000-price
        engine.ingest(Tick('XAUUSD', SOURCE, BASE+t, bid, bid+.02), BASE+t)
    if style.startswith('range'):
        low = 1998.6 if style == 'range-failed' else 1998.9
        row = bar(primary, BASE, 1999.7, 1999.8, low, 1999.6)
        price = lambda dt:1999.2+.02*dt/1000
    else:
        row = bar(primary, BASE, 2001.7, 2001.8, 2000.4, 2000.8)
        price = lambda dt:2001.85+.02*dt/1000
    engine.refresh_completed([reflected(row)], BASE+primary)
    for dt in range(0, 5001, 1000):
        bid = price(dt) if sign == 1 else 4000-price(dt)
        engine.ingest(Tick('XAUUSD', SOURCE, BASE+primary+dt, bid, bid+.02), BASE+primary+dt)
    return engine.snapshot(BASE+primary+5000)


def quote_at(snap, bid=None, delta=0):
    at = snap.as_of_ms+delta
    bid = snap.latest_tick.bid if bid is None else bid
    windows = tuple(replace(w, start_ms=w.start_ms+delta, end_ms=w.end_ms+delta) if w.available else w for w in snap.windows)
    return replace(snap, as_of_ms=at, latest_tick=Tick('XAUUSD', SOURCE, at, bid, bid+.02),
                   quote_age_ms=0, windows=windows)


def change_frame(snap, tf, **changes):
    return replace(snap, frames=tuple(replace(f, **changes) if f.timeframe_ms == tf else f for f in snap.frames))


def shifted_fixture(snap, delta):
    """A second synthetic structural episode; shift every causal timestamp."""
    return replace(quote_at(snap, delta=delta), frames=tuple(
        replace(f, completed=tuple(replace(c, open_ms=c.open_ms+delta) for c in f.completed),
                developing=replace(f.developing, open_ms=f.developing.open_ms+delta) if f.developing else None,
                structure=replace(f.structure, pivots=tuple(replace(p, pivot_open_ms=p.pivot_open_ms+delta,
                    confirmed_at_ms=p.confirmed_at_ms+delta) for p in f.structure.pivots))) for f in snap.frames))


class EntryTests(unittest.TestCase):
    def test_range_rejection_long_and_short_use_repeated_reactions(self):
        for side in ('LONG', 'SHORT'):
            snap = fixture('range', side)
            result = RangeScalper().evaluate(snap, COSTS, snap.as_of_ms)
            self.assertEqual(result.decision, side, result)
            self.assertEqual(result.entry_model, 'RANGE_BOUNDARY_REJECTION')
            self.assertGreaterEqual(dict(result.features)['separated_reactions'], 2)
            self.assertEqual(result.plan.regime_exit_policy, 'RANGE')

    def test_range_failed_breakout_is_distinct_from_fading_a_breakout(self):
        for side in ('LONG', 'SHORT'):
            snap = fixture('range-failed', side)
            result = RangeScalper().evaluate(snap, COSTS, snap.as_of_ms)
            self.assertEqual(result.decision, side, result)
            self.assertEqual(result.entry_model, 'RANGE_FAILED_BREAKOUT')
        snap = fixture('range')
        outside = quote_at(snap, 1998.8)
        result = RangeScalper().evaluate(outside, COSTS, outside.as_of_ms)
        self.assertEqual(result.reasons, ('RANGE_BREAKOUT_NOT_REJECTION',))

    def test_range_m5_execution_is_supported(self):
        snap = fixture('range', primary=300_000)
        result = RangeScalper(RangeConfig(primary_timeframe_ms=300_000)).evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(result.decision, 'LONG', result)

    def test_range_middle_is_not_a_weak_frequency_filler(self):
        snap = fixture('range')
        middle = quote_at(snap, 2000)
        self.assertEqual(RangeScalper().evaluate(middle, COSTS, middle.as_of_ms).reasons, ('RANGE_MIDDLE_NO_ENTRY',))

    def test_range_will_not_fade_a_directional_or_unknown_context(self):
        for tf in (60_000, 300_000):
            for regime in ('TREND_UP', 'TREND_DOWN', 'SHOCK', 'UNAVAILABLE'):
                snap = change_frame(fixture('range'), tf, regime=regime)
                self.assertEqual(RangeScalper().evaluate(snap, COSTS, snap.as_of_ms).decision, 'NO_TRADE')

    def test_reaction_count_does_not_count_consecutive_unrecovered_touches(self):
        cfg = RangeConfig()
        rows = [bar(60_000, BASE+i*60_000, 1999.2, 1999.3, 1999, 1999.2) for i in range(20)]
        self.assertEqual(_reaction_count(rows, 1999, 1, 1, cfg), 1)
        rows[5] = replace(rows[5], high=2000, close=2000)
        self.assertEqual(_reaction_count(rows, 1999, 1, 1, cfg), 2)

    def test_range_requires_enough_separated_reactions(self):
        snap = fixture('range')
        frame = next(f for f in snap.frames if f.timeframe_ms == 60_000)
        rows = list(frame.completed)
        for i in range(len(rows)-20, len(rows)-1):
            rows[i] = replace(rows[i], low=1999.6)
        snap = change_frame(snap, 60_000, completed=tuple(rows))
        result = RangeScalper().evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(result.decision, 'NO_TRADE', result)
        self.assertEqual(result.reasons, ('RANGE_REACTIONS_INSUFFICIENT',))

    def test_range_target_never_projects_through_the_opposite_boundary(self):
        for side in ('LONG', 'SHORT'):
            snap = fixture('range', side)
            result = RangeScalper(RangeConfig(target_atr=100)).evaluate(snap, COSTS, snap.as_of_ms)
            self.assertEqual(result.decision, side, result)
            features = dict(result.features)
            target_bid = result.plan.target if side == 'LONG' else result.plan.target-result.plan.spread_at_entry
            self.assertGreater(target_bid, features['support'])
            self.assertLess(target_bid, features['resistance'])

    def test_trend_ema_pullback_long_and_short_have_m15_context(self):
        for side in ('LONG', 'SHORT'):
            snap = fixture('trend', side)
            result = TrendScalper().evaluate(snap, COSTS, snap.as_of_ms)
            self.assertEqual(result.decision, side, result)
            self.assertEqual(result.entry_model, 'TREND_EMA_PULLBACK')
            self.assertEqual(result.plan.regime_exit_policy, 'TREND')
            self.assertIsNone(result.plan.early_failure_velocity_atr_per_second)

    def test_trend_can_execute_on_m15(self):
        snap = fixture('trend', primary=900_000)
        result = TrendScalper(TrendConfig(primary_timeframe_ms=900_000)).evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(result.decision, 'LONG', result)

    def test_trend_does_not_trade_a_range_or_unknown_trend(self):
        for regime in ('RANGE', 'TRANSITION', 'COMPRESSION', 'UNAVAILABLE'):
            snap = change_frame(fixture('trend'), 900_000, regime=regime)
            self.assertEqual(TrendScalper().evaluate(snap, COSTS, snap.as_of_ms).reasons,
                             ('ESTABLISHED_TREND_REQUIRED',))

    def test_trend_primary_opposition_is_rejected(self):
        snap = change_frame(fixture('trend'), 300_000, regime='TREND_DOWN')
        self.assertEqual(TrendScalper().evaluate(snap, COSTS, snap.as_of_ms).reasons,
                         ('TREND_PRIMARY_STRUCTURE_CONFLICT',))

    def test_impulse_without_a_pullback_does_not_qualify_as_trend_retest(self):
        snap = fixture('trend')
        f = next(f for f in snap.frames if f.timeframe_ms == 300_000)
        rows = tuple(replace(r, open=r.close-.05) for r in f.completed)
        snap = change_frame(snap, 300_000, completed=rows)
        self.assertEqual(TrendScalper().evaluate(snap, COSTS, snap.as_of_ms).reasons, ('NO_TREND_PULLBACK',))

    def test_trend_retest_requires_a_previously_confirmed_structure_level(self):
        for side in ('LONG', 'SHORT'):
            snap = fixture('trend', side)
            f = next(f for f in snap.frames if f.timeframe_ms == 300_000)
            extreme = min(r.low for r in f.usable_completed[-3:]) if side == 'LONG' else max(r.high for r in f.usable_completed[-3:])
            kind = 'LOW' if side == 'LONG' else 'HIGH'
            start = f.usable_completed[-3].open_ms
            pivot = Pivot(kind, extreme, start-900_000, start)
            altered = change_frame(snap, 300_000, indicators=replace(f.indicators, ema20=2010),
                                   structure=replace(f.structure, pivots=(pivot,)))
            result = TrendScalper().evaluate(altered, COSTS, altered.as_of_ms)
            self.assertEqual(result.decision, side, result)
            self.assertEqual(result.entry_model, 'TREND_STRUCTURE_RETEST')
            future = change_frame(altered, 300_000, structure=replace(f.structure, pivots=(replace(pivot, confirmed_at_ms=start+1),)))
            self.assertEqual(TrendScalper().evaluate(future, COSTS, future.as_of_ms).reasons,
                             ('PULLBACK_WITHOUT_QUALIFIED_RETEST',))

    def test_trend_requires_fresh_resumption_and_rejects_chasing(self):
        snap = fixture('trend')
        waiting = quote_at(snap, 2001.7)
        self.assertEqual(TrendScalper().evaluate(waiting, COSTS, waiting.as_of_ms).reasons,
                         ('TREND_RESUMPTION_NOT_CONFIRMED',))
        late = quote_at(snap, 2004)
        self.assertEqual(TrendScalper().evaluate(late, COSTS, late.as_of_ms).reasons,
                         ('TREND_ENTRY_TOO_LATE',))

    def test_both_engines_reject_unknown_costs_and_expensive_plans(self):
        for cls, kind in ((RangeScalper, 'range'), (TrendScalper, 'trend')):
            snap = fixture(kind)
            self.assertEqual(cls().evaluate(snap, None, snap.as_of_ms).reasons, ('EXECUTION_COSTS_UNAVAILABLE',))
            expensive = replace(COSTS, commission_per_lot_per_side=1000)
            self.assertEqual(cls().evaluate(snap, expensive, snap.as_of_ms).decision, 'NO_TRADE')

    def test_each_engine_has_independent_identity_and_cooldown(self):
        for cls, kind in ((RangeScalper, 'range'), (TrendScalper, 'trend')):
            engine = cls()
            snap = fixture(kind)
            first = engine.evaluate(snap, COSTS, snap.as_of_ms)
            self.assertEqual(first.opportunity_id, engine.evaluate(snap, COSTS, snap.as_of_ms).opportunity_id)
            engine.record_admission(first, snap.as_of_ms)
            self.assertEqual(engine.evaluate(snap, COSTS, snap.as_of_ms).reasons, ('STRUCTURAL_SETUP_ALREADY_ADMITTED',))
            with self.assertRaises(ValueError):
                engine.record_admission(first, snap.as_of_ms)

    def test_neutral_then_retrigger_cannot_recycle_an_admitted_structural_setup(self):
        for cls, kind, neutral_bid, delay in ((RangeScalper, 'range', 2000, 16_000),
                                              (TrendScalper, 'trend', 2001.7, 61_000)):
            engine = cls()
            snap = fixture(kind)
            first = engine.evaluate(snap, COSTS, snap.as_of_ms)
            engine.record_admission(first, snap.as_of_ms)
            neutral = quote_at(snap, neutral_bid, delta=1000)
            self.assertEqual(engine.evaluate(neutral, COSTS, neutral.as_of_ms).decision, 'NO_TRADE')
            repeat = quote_at(snap, delta=delay)
            self.assertEqual(engine.evaluate(repeat, COSTS, repeat.as_of_ms).reasons,
                             ('STRUCTURAL_SETUP_ALREADY_ADMITTED',))

    def test_fresh_structural_episodes_can_reenter_only_after_configured_cooldown(self):
        for cls, cfg, kind in ((RangeScalper, RangeConfig, 'range'), (TrendScalper, TrendConfig, 'trend')):
            engine = cls(cfg(reentry_cooldown_ms=1_800_000))
            snap = fixture(kind)
            first = engine.evaluate(snap, COSTS, snap.as_of_ms)
            engine.record_admission(first, snap.as_of_ms)
            early = shifted_fixture(snap, 900_000)
            self.assertEqual(engine.evaluate(early, COSTS, early.as_of_ms).reasons,
                             ('QUALIFIED_REENTRY_COOLDOWN',))
            fresh = shifted_fixture(snap, 1_800_000)
            next_entry = engine.evaluate(fresh, COSTS, fresh.as_of_ms)
            self.assertEqual(next_entry.decision, 'LONG', next_entry)
            self.assertNotEqual(next_entry.opportunity_id, first.opportunity_id)
            engine.record_admission(next_entry, fresh.as_of_ms)

    def test_stale_partial_gapped_or_shocked_evidence_never_enters(self):
        for cls, kind in ((RangeScalper, 'range'), (TrendScalper, 'trend')):
            snap = fixture(kind)
            for altered in (replace(snap, volatility_shock=True), replace(snap, spread_spike=True),
                            replace(snap, frames=tuple(replace(f, contiguous_usable_bars=0) for f in snap.frames)),
                            replace(snap, frames=tuple(replace(f, developing=replace(f.developing, gap_detected=True)) if f.developing else f for f in snap.frames))):
                self.assertEqual(cls().evaluate(altered, COSTS, altered.as_of_ms).decision, 'NO_TRADE')
            self.assertEqual(cls().evaluate(snap, COSTS, snap.as_of_ms+3000).decision, 'NO_TRADE')

    def test_configurations_reject_invalid_frames_and_impossible_bounds(self):
        for cls, values in ((RangeConfig, {'primary_timeframe_ms':900_000}),
                            (RangeConfig, {'maximum_boundary_fraction':.6}),
                            (RangeConfig, {'minimum_reactions':30}),
                            (TrendConfig, {'primary_timeframe_ms':60_000}),
                            (TrendConfig, {'minimum_pullback_atr':5}),
                            (TrendConfig, {'pullback_bars':True})):
            with self.assertRaises(ValueError):
                cls(**values)

    def test_decisions_and_protected_plans_are_immutable_demo_only(self):
        for cls, kind in ((RangeScalper, 'range'), (TrendScalper, 'trend')):
            snap = fixture(kind)
            result = cls().evaluate(snap, COSTS, snap.as_of_ms)
            self.assertTrue(result.plan.demo_only)
            self.assertGreater(result.plan.planned_net_reward, 0)
            with self.assertRaises(FrozenInstanceError):
                result.plan.target = 0
            with self.assertRaises(ValueError):
                replace(result.plan, demo_only=False)


class ExitTests(unittest.TestCase):
    def position(self, kind='range', side='LONG'):
        snap = fixture(kind, side)
        engine = RangeScalper() if kind == 'range' else TrendScalper()
        decision = engine.evaluate(snap, COSTS, snap.as_of_ms)
        self.assertIsNotNone(decision.plan, decision)
        p = decision.plan
        return snap, p, PositionObservation(p.opportunity_id, snap.as_of_ms, p.reference_entry, side, p.stop)

    def test_range_closes_when_the_observed_regime_becomes_directional(self):
        for side in ('LONG', 'SHORT'):
            snap, plan, position = self.position(side=side)
            changed = change_frame(snap, 60_000, regime='TREND_UP')
            result = manage_position(plan, position, changed, changed.as_of_ms)
            self.assertEqual(result.reason, 'RANGE_REGIME_INVALIDATED')
            self.assertEqual(result.action, 'CLOSE')

    def test_trend_closes_on_opposite_regime_or_confirmed_opposite_structure(self):
        for side in ('LONG', 'SHORT'):
            snap, plan, position = self.position('trend', side)
            opposite = 'TREND_DOWN' if side == 'LONG' else 'TREND_UP'
            changed = change_frame(snap, 900_000, regime=opposite)
            self.assertEqual(manage_position(plan, position, changed, changed.as_of_ms).reason, 'TREND_REGIME_INVALIDATED')
            context = next(f for f in snap.frames if f.timeframe_ms == 900_000)
            changed = change_frame(snap, 900_000, structure=replace(context.structure, swing_direction='DOWN' if side == 'LONG' else 'UP'))
            self.assertEqual(manage_position(plan, position, changed, changed.as_of_ms).reason, 'TREND_REGIME_INVALIDATED')

    def test_missing_context_is_not_fabricated_as_a_regime_change(self):
        snap, plan, position = self.position('trend')
        changed = change_frame(snap, 900_000, contiguous_usable_bars=0)
        result = manage_position(plan, position, changed, changed.as_of_ms)
        self.assertEqual(result.action, 'HOLD')
        self.assertEqual(result.reason, 'PROTECTED_POSITION_MONITORING')

    def test_trend_does_not_exit_on_micro_countermove_alone(self):
        snap, plan, position = self.position('trend')
        later = quote_at(snap, plan.reference_entry-.10, delta=4000)
        changed = replace(later, windows=tuple(replace(w, velocity=-.2, directional_persistence=-1) if w.seconds == 5 else w for w in later.windows))
        self.assertEqual(manage_position(plan, position, changed, changed.as_of_ms).action, 'HOLD')

    def test_hard_stops_and_structural_invalidation_still_apply_to_trend(self):
        for side in ('LONG', 'SHORT'):
            snap, plan, position = self.position('trend', side)
            sign = 1 if side == 'LONG' else -1
            price = plan.stop-sign*.1
            current = quote_at(snap, price if side == 'LONG' else price-.02)
            self.assertEqual(manage_position(plan, position, current, current.as_of_ms).reason, 'PROTECTIVE_STOP_CROSSED')
            # Place price between structural invalidation and the rounded stop.
            # An already-tightened observed stop must never be loosened.
            tighter = replace(position, broker_stop=plan.reference_entry+sign*.10)
            protected = quote_at(snap, plan.reference_entry+sign*.30 if side == 'LONG' else plan.reference_entry+sign*.30-.02)
            result = manage_position(plan, tighter, protected, protected.as_of_ms)
            self.assertTrue(result.next_stop is None or sign*(result.next_stop-tighter.broker_stop) > 0)

    def test_range_and_trend_profit_management_keeps_actual_fill_feedback_separate(self):
        for kind in ('range', 'trend'):
            snap, plan, position = self.position(kind)
            net = .5*plan.planned_loss_with_costs if kind == 'range' else 1.1*plan.planned_loss_with_costs
            current = quote_at(snap, plan.reference_entry+plan.fee_slippage_price+net)
            result = manage_position(plan, position, current, current.as_of_ms)
            self.assertEqual(result.action, 'TIGHTEN_STOP', result)
            self.assertEqual(result.state.broker_stop, position.broker_stop)
            observed = replace(result.state, broker_stop=result.next_stop)
            next_result = manage_position(plan, observed, current, current.as_of_ms)
            if kind == 'trend':
                self.assertEqual(next_result.action, 'PARTIAL_CLOSE')
                self.assertFalse(next_result.state.partial_taken)
            else:
                self.assertEqual(next_result.action, 'HOLD')


if __name__ == '__main__':
    unittest.main()
