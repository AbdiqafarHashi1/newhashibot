"""Synthetic entry/management tests. These do not estimate trading profitability."""
from dataclasses import FrozenInstanceError, replace
import unittest
from gold_turbo import Candle, MarketIntelligence, Tick
from gold_turbo.micro import MicroScalper, MicroConfig
from gold_turbo.momentum import MomentumScalper, MomentumConfig
from gold_turbo.strategy_contracts import ExecutionCosts
from gold_turbo.management import PositionObservation, manage_position

BASE = 1_800_000_000_000
SOURCE = 'synthetic-scalper-fixture'
COSTS = ExecutionCosts(100, 1, .005, .01, 'synthetic explicit USD/lot and USD/oz scenario')


def candle(tf, at, open=2000, high=2000.5, low=1999.5, close=2000):
    return Candle('XAUUSD', SOURCE, tf, at, open, high, low, close, 100, 'BROKER_COMPLETED_BAR')


def snapshot(style='burst', side='LONG', primary=60_000):
    engine = MarketIntelligence('XAUUSD', SOURCE)
    seeded = []
    for tf in (60_000, 300_000, 900_000):
        for i in range(60):
            bar = candle(tf, BASE-(60-i)*tf)
            if style == 'compression' and tf == primary and i >= 55:
                bar = candle(tf, bar.open_ms, 1999.99, 2000.05, 1999.95, 2000)
            if style == 'impulse' and tf == primary and i == 59:
                bar = candle(tf, bar.open_ms, 2000., 2001., 1999.95, 2000.9)
            if tf == 900_000 and i >= 57:
                bar = candle(tf, bar.open_ms, close=2000+.01*(i-57))
            seeded.append(bar)
    engine.seed_completed(seeded, BASE)
    end = primary
    for t in range(0, end+1, 1000):
        engine.ingest(Tick('XAUUSD', SOURCE, BASE+t, 2000, 2000.02), BASE+t)
    if style == 'impulse':
        bar = candle(primary, BASE, 2000.9, 2001., 2000.45, 2000.8)
        price = lambda t:2001.05+.02*(t-end)/1000
    elif style == 'compression':
        bar = candle(primary, BASE, 1999.99, 2000.05, 1999.95, 2000)
        price = lambda t:1999.95+.05*(t-end)/1000
    elif style == 'pullback':
        bar = candle(primary, BASE, 2000.05, 2000.1, 1999.9, 2000)
        price = lambda t:2000+.02*(t-end)/1000
    elif style == 'rejection':
        bar = candle(primary, BASE, 2000, 2000.25, 1999.75, 2000)
        price = lambda t:1999.64+.082*(t-end)/1000
    else:
        bar = candle(primary, BASE, 2000, 2000.25, 1999.75, 2000)
        price = lambda t:2000+.02*(t-end)/1000
    engine.refresh_completed([bar], BASE+end)
    # If primary=M5, restore the just-completed native M1 intervals as well.
    if primary == 300_000:
        engine.refresh_completed([candle(60_000, BASE+i*60_000) for i in range(5)], BASE+end)
    for t in range(end, end+5001, 1000):
        engine.ingest(Tick('XAUUSD', SOURCE, BASE+t, price(t), price(t)+.02), BASE+t)
    snap = engine.snapshot(BASE+end+5000)
    if side == 'SHORT':
        def reflect(bar):
            return replace(bar, open=4000-bar.open, high=4000-bar.low, low=4000-bar.high, close=4000-bar.close)
        # Mirror complete feature evidence, not just the candidate price.
        mirrored = MarketIntelligence('XAUUSD', SOURCE)
        mirrored.seed_completed([reflect(r) for r in seeded], BASE)
        for t in range(0, end+1, 1000):
            mirrored.ingest(Tick('XAUUSD', SOURCE, BASE+t, 2000, 2000.02), BASE+t)
        mirrored.refresh_completed([reflect(bar)], BASE+end)
        if primary == 300_000:
            mirrored.refresh_completed([reflect(candle(60_000, BASE+i*60_000)) for i in range(5)], BASE+end)
        for t in range(end, end+5001, 1000):
            bid = 4000-price(t)
            mirrored.ingest(Tick('XAUUSD', SOURCE, BASE+t, bid, bid+.02), BASE+t)
        snap = mirrored.snapshot(BASE+end+5000)
    return snap


def tick_snapshot(snap, bid, at=None, spread=.02):
    at = snap.as_of_ms if at is None else at
    delta = at-snap.latest_tick.at_ms
    windows = tuple(replace(w, start_ms=w.start_ms+delta, end_ms=w.end_ms+delta) if w.available else w for w in snap.windows)
    return replace(snap, as_of_ms=at, quote_age_ms=0,
                   latest_tick=Tick('XAUUSD', SOURCE, at, bid, bid+spread), windows=windows)


class EntryTests(unittest.TestCase):
    def test_micro_and_momentum_have_distinct_long_and_short_entry_models(self):
        for side in ('LONG', 'SHORT'):
            micro_snap, momentum_snap = snapshot('burst', side), snapshot('impulse', side)
            micro = MicroScalper().evaluate(micro_snap, COSTS, micro_snap.as_of_ms)
            momentum = MomentumScalper().evaluate(momentum_snap, COSTS, momentum_snap.as_of_ms)
            self.assertEqual(micro.decision, side, micro)
            self.assertEqual(momentum.decision, side, momentum)
            self.assertEqual(micro.entry_model, 'MICRO_PERSISTENT_BURST')
            self.assertEqual(momentum.entry_model, 'STRONG_CANDLE_RETEST_CONTINUATION')
            self.assertNotEqual(micro.strategy_id, momentum.strategy_id)
            self.assertLess(micro.plan.maximum_hold_ms, momentum.plan.maximum_hold_ms)
            self.assertLess(micro.plan.target-micro.plan.stop if side == 'LONG' else micro.plan.stop-micro.plan.target,
                            momentum.plan.target-momentum.plan.stop if side == 'LONG' else momentum.plan.stop-momentum.plan.target)

    def test_micro_pullback_is_independently_supported_in_both_directions(self):
        for side in ('LONG', 'SHORT'):
            snap = snapshot('pullback', side)
            decision = MicroScalper().evaluate(snap, COSTS, snap.as_of_ms)
            self.assertEqual(decision.decision, side, decision)
            self.assertEqual(decision.entry_model, 'MICRO_PULLBACK_RESUME')

    def test_micro_rejection_has_its_own_structural_invalidation(self):
        for side in ('LONG', 'SHORT'):
            snap = snapshot('rejection', side)
            decision = MicroScalper().evaluate(snap, COSTS, snap.as_of_ms)
            self.assertEqual(decision.decision, side, decision)
            self.assertEqual(decision.entry_model, 'MICRO_REJECTION')

    def test_compression_breakout_is_not_a_renamed_micro_burst(self):
        for side in ('LONG', 'SHORT'):
            snap = snapshot('compression', side)
            decision = MomentumScalper().evaluate(snap, COSTS, snap.as_of_ms)
            self.assertEqual(decision.decision, side, decision)
            self.assertEqual(decision.entry_model, 'COMPRESSION_BREAKOUT')
        snap = snapshot('burst')
        result = MomentumScalper().evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(result.decision, 'NO_TRADE')
        self.assertEqual(result.reasons, ('NO_MOMENTUM_ENTRY_MODEL',))

    def test_momentum_can_use_m5_execution_with_m15_context(self):
        snap = snapshot('impulse', primary=300_000)
        result = MomentumScalper(MomentumConfig(primary_timeframe_ms=300_000)).evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(result.decision, 'LONG', result)
        self.assertEqual(dict(result.features)['primary_timeframe_ms'], 300_000)

    def test_unknown_or_excessive_costs_do_not_produce_an_entry(self):
        for engine, style in ((MicroScalper, 'burst'), (MomentumScalper, 'impulse')):
            snap = snapshot(style)
            self.assertEqual(engine().evaluate(snap, None, snap.as_of_ms).reasons, ('EXECUTION_COSTS_UNAVAILABLE',))
            expensive = replace(COSTS, commission_per_lot_per_side=100)
            result = engine().evaluate(snap, expensive, snap.as_of_ms)
            self.assertEqual(result.decision, 'NO_TRADE')
            self.assertIsNone(result.plan)
            self.assertIn(result.reasons[0], ('COSTS_EXCEED_PLANNED_MOVE', 'INSUFFICIENT_NET_REWARD'))

    def test_stale_future_spread_spike_and_shock_are_rejected(self):
        for engine in (MicroScalper, MomentumScalper):
            snap = snapshot('impulse')
            for changed in (replace(snap, spread_spike=True), replace(snap, volatility_shock=True),
                            replace(snap, as_of_ms=snap.as_of_ms+1)):
                self.assertEqual(engine().evaluate(changed, COSTS, snap.as_of_ms).decision, 'NO_TRADE')
            self.assertEqual(engine().evaluate(snap, COSTS, snap.as_of_ms+3000).decision, 'NO_TRADE')

    def test_context_direction_conflicts_are_not_overridden(self):
        for engine, style, tf in ((MicroScalper, 'burst', 300_000), (MomentumScalper, 'impulse', 900_000)):
            snap = snapshot(style)
            frames = tuple(replace(f, regime='TREND_DOWN') if f.timeframe_ms == tf else f for f in snap.frames)
            result = engine().evaluate(replace(snap, frames=frames), COSTS, snap.as_of_ms)
            self.assertEqual(result.decision, 'NO_TRADE')
            self.assertIn('CONFLICT', result.reasons[0])

    def test_extended_or_late_entries_are_rejected(self):
        snap = snapshot('burst')
        windows = tuple(replace(w, move=10) if w.seconds == 15 else w for w in snap.windows)
        self.assertEqual(MicroScalper().evaluate(replace(snap, windows=windows), COSTS, snap.as_of_ms).reasons,
                         ('MICRO_MOVE_ALREADY_EXTENDED',))
        snap = snapshot('impulse')
        result = MomentumScalper().evaluate(tick_snapshot(snap, 2002), COSTS, snap.as_of_ms)
        self.assertEqual(result.reasons, ('MOMENTUM_ENTRY_TOO_LATE',))

    def test_decisions_include_protected_geometry_costs_and_immutable_diagnostics(self):
        for side in ('LONG', 'SHORT'):
            snap = snapshot('burst', side)
            decision = MicroScalper().evaluate(snap, COSTS, snap.as_of_ms)
            plan = decision.plan
            sign = 1 if side == 'LONG' else -1
            self.assertGreater(sign*(plan.reference_entry-plan.stop), 0)
            self.assertGreater(sign*(plan.target-plan.reference_entry), 0)
            self.assertAlmostEqual(plan.planned_net_reward, sign*(plan.target-plan.reference_entry)-plan.fee_slippage_price)
            self.assertTrue(plan.demo_only)
            self.assertIn('cost_assumptions', dict(decision.features))
            with self.assertRaises(FrozenInstanceError):
                plan.stop = 0

    def test_candidate_evaluation_is_not_an_admission_and_keeps_identity(self):
        engine = MicroScalper()
        snap = snapshot()
        first = engine.evaluate(snap, COSTS, snap.as_of_ms)
        second = engine.evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(first.opportunity_id, second.opportunity_id)
        engine.record_admission(first, snap.as_of_ms)
        blocked = engine.evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(blocked.reasons, ('OPPORTUNITY_ALREADY_ADMITTED',))
        with self.assertRaises(ValueError):
            engine.record_admission(first, snap.as_of_ms)

    def test_momentum_admission_cooldown_and_stale_admission(self):
        engine = MomentumScalper()
        snap = snapshot('impulse')
        first = engine.evaluate(snap, COSTS, snap.as_of_ms)
        with self.assertRaises(ValueError):
            engine.record_admission(first, first.plan.expires_at_ms+1)
        engine.record_admission(first, snap.as_of_ms)
        result = engine.evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(result.reasons, ('OPPORTUNITY_ALREADY_ADMITTED',))

    def test_micro_reentry_requires_a_new_setup_and_expired_cooldown(self):
        engine = MicroScalper()
        snap = snapshot()
        first = engine.evaluate(snap, COSTS, snap.as_of_ms)
        engine.record_admission(first, snap.as_of_ms)
        neutral = tick_snapshot(snap, snap.latest_tick.bid, snap.as_of_ms+1000)
        neutral = replace(neutral, windows=tuple(replace(w, velocity=0) if w.seconds == 5 else w for w in neutral.windows))
        self.assertEqual(engine.evaluate(neutral, COSTS, neutral.as_of_ms).reasons, ('NO_DIRECTIONAL_MICRO_TRIGGER',))
        too_soon = tick_snapshot(snap, snap.latest_tick.bid, snap.as_of_ms+2000)
        self.assertEqual(engine.evaluate(too_soon, COSTS, too_soon.as_of_ms).reasons, ('QUALIFIED_REENTRY_COOLDOWN',))
        later = tick_snapshot(snap, snap.latest_tick.bid, snap.as_of_ms+6000)
        fresh = engine.evaluate(later, COSTS, later.as_of_ms)
        self.assertEqual(fresh.decision, 'LONG')
        self.assertNotEqual(fresh.opportunity_id, first.opportunity_id)
        engine.record_admission(fresh, later.as_of_ms)

    def test_insufficient_net_reward_is_checked_after_price_rounding(self):
        snap = snapshot()
        coarse = replace(COSTS, price_tick=1)
        result = MicroScalper().evaluate(snap, coarse, snap.as_of_ms)
        self.assertEqual(result.decision, 'NO_TRADE')
        self.assertEqual(result.reasons, ('COSTS_EXCEED_PLANNED_MOVE',))

    def test_recent_tick_does_not_make_old_window_features_current(self):
        snap = snapshot()
        bad = replace(snap, latest_tick=replace(snap.latest_tick, at_ms=snap.as_of_ms+1000), as_of_ms=snap.as_of_ms+1000)
        self.assertEqual(MicroScalper().evaluate(bad, COSTS, bad.as_of_ms).reasons, ('TICK_WINDOW_CLOCK_MISMATCH',))

    def test_clock_reversal_and_invalid_configs_fail_explicitly(self):
        engine = MicroScalper()
        snap = snapshot()
        engine.evaluate(snap, COSTS, snap.as_of_ms)
        with self.assertRaises(ValueError):
            engine.evaluate(snap, COSTS, snap.as_of_ms-1)
        for cfg, args in ((MicroConfig, {'minimum_stop_atr':2}), (MomentumConfig, {'primary_timeframe_ms':900_000}),
                          (MicroConfig, {'partial_fraction':True}), (MomentumConfig, {'compression_bars':True})):
            with self.assertRaises(ValueError):
                cfg(**args)

    def test_partial_or_missing_context_never_sneaks_into_entries(self):
        for engine, style in ((MicroScalper, 'burst'), (MomentumScalper, 'impulse')):
            snap = snapshot(style)
            missing = replace(snap, frames=tuple(replace(f, contiguous_usable_bars=0) for f in snap.frames))
            self.assertEqual(engine().evaluate(missing, COSTS, snap.as_of_ms).decision, 'NO_TRADE')
            partial = replace(snap, frames=tuple(replace(f, developing=replace(f.developing, partial_start=True)) if f.developing else f for f in snap.frames))
            self.assertEqual(engine().evaluate(partial, COSTS, snap.as_of_ms).decision, 'NO_TRADE')


class ManagementTests(unittest.TestCase):
    def position(self, style='burst', side='LONG'):
        snap = snapshot(style, side)
        engine = MicroScalper() if style == 'burst' else MomentumScalper()
        decision = engine.evaluate(snap, COSTS, snap.as_of_ms)
        plan = decision.plan
        self.assertIsNotNone(plan, decision)
        position = PositionObservation(plan.opportunity_id, snap.as_of_ms, plan.reference_entry, side, plan.stop)
        return snap, plan, position

    def test_stop_and_target_crossings_request_closure_not_a_fictional_fill(self):
        for side in ('LONG', 'SHORT'):
            snap, plan, position = self.position(side=side)
            sign = 1 if side == 'LONG' else -1
            for price, reason in ((plan.stop-sign*.1, 'PROTECTIVE_STOP_CROSSED'), (plan.target+sign*.1, 'TARGET_REACHED')):
                bid = price if side == 'LONG' else price-.02
                result = manage_position(plan, position, tick_snapshot(snap, bid), snap.as_of_ms)
                self.assertEqual(result.action, 'CLOSE')
                self.assertEqual(result.reason, reason)
                self.assertEqual(result.close_fraction, 1)
                self.assertFalse(hasattr(result, 'fill_price'))

    def test_timeout_requests_closure_even_when_quotes_are_stale(self):
        snap, plan, position = self.position()
        result = manage_position(plan, position, snap, position.opened_at_ms+plan.maximum_hold_ms)
        self.assertEqual(result.reason, 'MAXIMUM_HOLD_REACHED')
        self.assertEqual(result.action, 'CLOSE')

    def test_stale_price_cannot_tighten_or_claim_profit(self):
        snap, plan, position = self.position()
        result = manage_position(plan, position, snap, snap.as_of_ms+3000)
        self.assertEqual(result.reason, 'FRESH_QUOTE_REQUIRED')
        self.assertIsNone(result.net_move)

    def test_micro_profit_trailing_never_claims_stop_was_modified(self):
        for side in ('LONG', 'SHORT'):
            snap, plan, position = self.position(side=side)
            sign = 1 if side == 'LONG' else -1
            exit_price = plan.reference_entry+sign*.25
            bid = exit_price if side == 'LONG' else exit_price-.02
            result = manage_position(plan, position, tick_snapshot(snap, bid), snap.as_of_ms)
            self.assertEqual(result.action, 'TIGHTEN_STOP', result)
            self.assertGreater(sign*(result.next_stop-position.broker_stop), 0)
            self.assertEqual(result.state.broker_stop, position.broker_stop)
            self.assertGreater(result.state.best_net_move, 0)

    def test_momentum_partial_capture_requires_observed_fill_feedback(self):
        snap, plan, position = self.position('impulse')
        price = plan.reference_entry+plan.planned_loss_with_costs*.8+plan.fee_slippage_price
        current = tick_snapshot(snap, price)
        protect = manage_position(plan, position, current, snap.as_of_ms)
        self.assertEqual(protect.action, 'TIGHTEN_STOP')
        observed = replace(protect.state, broker_stop=protect.next_stop)
        partial = manage_position(plan, observed, current, snap.as_of_ms)
        self.assertEqual(partial.action, 'PARTIAL_CLOSE')
        self.assertEqual(partial.close_fraction, .5)
        self.assertFalse(partial.state.partial_taken)
        retry = manage_position(plan, partial.state, current, snap.as_of_ms)
        self.assertEqual(retry.request_id, partial.request_id)
        filled = replace(partial.state, partial_taken=True)
        self.assertEqual(manage_position(plan, filled, current, snap.as_of_ms).action, 'HOLD')

    def test_early_failure_and_shock_close_before_targets(self):
        snap, plan, position = self.position()
        shock = replace(snap, volatility_shock=True)
        self.assertEqual(manage_position(plan, position, shock, snap.as_of_ms).reason, 'VOLATILITY_SHOCK_EXIT')
        later = tick_snapshot(snap, plan.reference_entry-.05, snap.as_of_ms+4000)
        windows = tuple(replace(w, velocity=-.1, directional_persistence=-1) if w.seconds == 5 else w for w in later.windows)
        later = replace(later, windows=windows)
        self.assertEqual(manage_position(plan, position, later, later.as_of_ms).reason, 'EARLY_MOMENTUM_FAILURE')

    def test_retracement_through_a_new_trailing_level_requests_close(self):
        snap, plan, position = self.position()
        position = replace(position, best_net_move=.35)
        current = tick_snapshot(snap, plan.reference_entry+.10)
        result = manage_position(plan, position, current, snap.as_of_ms)
        self.assertEqual(result.reason, 'TRAILING_PROTECTION_CROSSED')
        self.assertEqual(result.action, 'CLOSE')

    def test_position_identity_and_clock_are_enforced(self):
        snap, plan, position = self.position()
        with self.assertRaises(ValueError):
            manage_position(plan, replace(position, opportunity_id='unrelated'), snap, snap.as_of_ms)
        with self.assertRaises(ValueError):
            manage_position(plan, position, snap, snap.as_of_ms-1)


if __name__ == '__main__':
    unittest.main()
