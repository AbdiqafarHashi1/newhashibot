"""Synthetic correctness fixtures only; no profitability or broker-fill claims."""
from dataclasses import FrozenInstanceError, asdict, replace
import json
import math
import unittest
from gold_turbo import (Candle, IntelligenceConfig, MarketIntelligence, Tick,
                        candle_from_mt5, tick_from_mt5)
from gold_turbo.features import candle_shape, indicators, price_event, structure, classify_regime
from gold_turbo.intelligence import estimate_cost

BASE = 1_800_000_000_000  # M15-aligned UTC milliseconds, synthetic only.
SOURCE = 'synthetic-fixture'


def quote(delta=0, bid=2000.0, spread=.2, sequence=None):
    return Tick('XAUUSD', SOURCE, BASE+delta, bid, bid+spread, sequence)


def bars(n=60, tf=60_000, end=BASE, flat=False):
    result = []
    for i in range(n):
        c = 2000.0 + ((i % 2) if flat else i)
        result.append(Candle('XAUUSD', SOURCE, tf, end-(n-i)*tf,
                             c-.25, c+.5, c-.5, c, 10, 'BROKER_COMPLETED_BAR'))
    return result


def stream(engine, start=0, end=60_000, price=lambda t: 2000.0, step=1000):
    for t in range(start, end+1, step):
        result = engine.ingest(quote(t, price(t)), BASE+t)
        if not result.accepted:
            raise AssertionError(result)


class ContractsTests(unittest.TestCase):
    def test_invalid_quotes_and_clocks_are_rejected(self):
        for changes in ({'bid':float('nan')}, {'ask':1999}, {'at_ms':True},
                        {'sequence':-1}, {'bid':0}, {'ask':float('inf')}, {'source':''}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                replace(quote(), **changes)

    def test_broker_adapter_requires_milliseconds_and_closed_bid_bars(self):
        row = {'time_msc':BASE, 'bid':2000, 'ask':2000.2}
        self.assertEqual(tick_from_mt5('XAUUSD', SOURCE, row).at_ms, BASE)
        with self.assertRaises(KeyError):
            tick_from_mt5('XAUUSD', SOURCE, {'time':BASE//1000, 'bid':2000, 'ask':2000.2})
        bar = {'time':BASE//1000, 'open':2000, 'high':2001, 'low':1999, 'close':2000, 'tick_volume':5}
        with self.assertRaises(ValueError):
            candle_from_mt5('XAUUSD', SOURCE, 60_000, bar, BASE+59_999)
        self.assertEqual(candle_from_mt5('XAUUSD', SOURCE, 60_000, bar, BASE+60_000).quote_count, 5)

    def test_configuration_rejects_unbounded_or_invalid_values(self):
        for changes in ({'max_ticks':1}, {'retained_tick_ms':30_000}, {'price_tick':0},
                        {'max_quote_age_ms':True}, {'max_candles_per_frame':10_001}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                IntelligenceConfig(**changes)

    def test_malformed_ohlc_is_not_accepted(self):
        with self.assertRaises(ValueError):
            replace(bars()[0], high=1)
        with self.assertRaises(ValueError):
            replace(bars()[0], open_ms=BASE+1)


class TickStateTests(unittest.TestCase):
    def setUp(self):
        self.engine = MarketIntelligence('XAUUSD', SOURCE)

    def test_stale_future_identity_and_order_rejections_do_not_change_tick(self):
        self.engine.ingest(quote(), BASE)
        for tick, now, reason in [(quote(1000), BASE+4001, 'STALE_TICK'),
                                  (quote(1000), BASE, 'FUTURE_TICK'),
                                  (replace(quote(1000), source='other'), BASE+1000, 'SOURCE_MISMATCH'),
                                  (quote(-1), BASE, 'OUT_OF_ORDER_TICK')]:
            self.assertEqual(self.engine.ingest(tick, now).reason, reason)
            self.assertEqual(self.engine.snapshot(BASE).latest_tick, quote())

    def test_deduplication_and_same_millisecond_sequence(self):
        first = quote(sequence=1)
        self.assertTrue(self.engine.ingest(first, BASE).accepted)
        self.assertEqual(self.engine.ingest(first, BASE).reason, 'DUPLICATE_TICK')
        self.assertTrue(self.engine.ingest(quote(bid=2001, sequence=2), BASE).accepted)
        self.assertEqual(self.engine.ingest(quote(bid=2002, sequence=1), BASE).reason, 'OUT_OF_ORDER_SEQUENCE')
        self.assertTrue(self.engine.ingest(quote(bid=2001, sequence=3), BASE).accepted)
        self.assertEqual(self.engine.snapshot(BASE).retained_ticks, 3)

    def test_observation_clock_and_historical_queries_are_rejected(self):
        self.engine.ingest(quote(), BASE+1000)
        self.assertEqual(self.engine.ingest(quote(1), BASE+999).reason, 'OBSERVATION_CLOCK_REVERSED')
        with self.assertRaises(ValueError):
            self.engine.snapshot(BASE)

    def test_known_velocity_acceleration_and_persistence(self):
        stream(self.engine, end=30_000, price=lambda t:2000+t/1000)
        for window in self.engine.snapshot(BASE+30_000).windows:
            self.assertTrue(window.available)
            self.assertAlmostEqual(window.velocity, 1)
            self.assertAlmostEqual(window.acceleration, 0)
            self.assertAlmostEqual(window.directional_persistence, 1)
        self.assertAlmostEqual(self.engine.snapshot(BASE+30_000).windows[0].move, 5)

    def test_acceleration_tracks_change_of_velocity(self):
        stream(self.engine, end=30_000, price=lambda t:2000+(t/1000)**2)
        self.assertAlmostEqual(self.engine.snapshot(BASE+30_000).windows[-1].acceleration, 2)

    def test_gap_resets_micro_windows_without_inventing_observations(self):
        stream(self.engine, end=30_000)
        self.assertTrue(self.engine.snapshot(BASE+30_000).windows[-1].available)
        result = self.engine.ingest(quote(90_000), BASE+90_000)
        self.assertEqual(result.reason, 'GAP_RESET')
        snap = self.engine.snapshot(BASE+90_000)
        self.assertEqual(snap.retained_ticks, 1)
        self.assertFalse(snap.windows[-1].available)
        self.assertTrue(snap.frames[0].completed[-1].gap_detected)
        self.assertTrue(snap.frames[0].developing.partial_start)

    def test_memory_cap_does_not_claim_missing_window_coverage(self):
        engine = MarketIntelligence('XAUUSD', SOURCE, IntelligenceConfig(max_ticks=32))
        stream(engine, end=10_000, step=100)
        snap = engine.snapshot(BASE+10_000)
        self.assertEqual(snap.retained_ticks, 32)
        self.assertFalse(snap.windows[0].available)

    def test_stale_snapshot_retains_evidence_but_marks_it_unusable(self):
        stream(self.engine, end=30_000)
        snap = self.engine.snapshot(BASE+33_000)
        self.assertIn('STALE_QUOTE', snap.quality)
        self.assertEqual(snap.quote_age_ms, 3000)

    def test_spread_spike_uses_prior_quotes_not_current_spread(self):
        stream(self.engine, end=5000)
        self.engine.ingest(quote(6000, spread=2), BASE+6000)
        self.assertTrue(self.engine.snapshot(BASE+6000).spread_spike)

    def test_repeated_identical_unsequenced_updates_do_not_inflate_volume(self):
        tick = quote()
        self.engine.ingest(tick, BASE)
        self.engine.ingest(tick, BASE)
        self.assertEqual(self.engine.snapshot(BASE).frames[0].developing.quote_count, 1)


class CandleStateTests(unittest.TestCase):
    def test_boundary_ohlc_partial_start_and_complete_interval(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        stream(engine, end=120_000, price=lambda t:2000+t/1000)
        snap = engine.snapshot(BASE+120_000)
        m1 = snap.frames[0]
        self.assertEqual(len(m1.completed), 2)
        self.assertTrue(m1.completed[0].partial_start)
        self.assertFalse(m1.completed[1].partial_start)
        self.assertEqual(m1.completed[1].open, 2060)
        self.assertEqual(m1.completed[1].close, 2119)
        self.assertEqual(m1.completed[1].quote_count, 60)
        self.assertEqual(m1.contiguous_usable_bars, 1)
        self.assertEqual(m1.developing.open_ms, BASE+120_000)
        self.assertEqual(m1.developing.quote_count, 1)

    def test_m5_m15_roll_at_exact_boundaries(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        stream(engine, end=900_000)
        snap = engine.snapshot(BASE+900_000)
        self.assertEqual([len(f.completed) for f in snap.frames], [15, 3, 1])
        self.assertEqual(snap.frames[-1].developing.open_ms, BASE+900_000)
        self.assertTrue(all(c.end_ms <= snap.as_of_ms for f in snap.frames for c in f.completed))

    def test_clock_passage_does_not_finalize_unobserved_boundary(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.ingest(quote(59_000), BASE+59_000)
        snap = engine.snapshot(BASE+60_000)
        self.assertIsNone(snap.frames[0].developing)
        self.assertEqual(snap.frames[0].completed, ())
        self.assertIn('CANDLE_BOUNDARY_NOT_OBSERVED', snap.frames[0].quality)

    def test_seed_is_atomic_and_does_not_invent_ticks(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        with self.assertRaises(ValueError):
            engine.seed_completed(bars()+[replace(bars()[0], open_ms=BASE)], BASE)
        self.assertEqual(engine.snapshot(BASE).frames[0].completed, ())
        engine.seed_completed(bars(), BASE)
        snap = engine.snapshot(BASE)
        self.assertIsNone(snap.latest_tick)
        self.assertFalse(snap.windows[0].available)
        self.assertEqual(snap.frames[0].contiguous_usable_bars, 60)
        self.assertIn('NO_TICKS', snap.quality)
        with self.assertRaises(ValueError):
            engine.seed_completed(bars(), BASE)

    def test_seed_observation_time_cannot_be_used_as_prior_knowledge(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.seed_completed(bars(), BASE+500)
        with self.assertRaises(ValueError):
            engine.snapshot(BASE)
        self.assertEqual(engine.ingest(quote(), BASE).reason, 'OBSERVATION_CLOCK_REVERSED')

    def test_missing_seed_intervals_break_indicator_context(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        rows = bars()
        engine.seed_completed(rows[:40]+rows[41:], BASE)
        frame = engine.snapshot(BASE).frames[0]
        self.assertEqual(frame.contiguous_usable_bars, 19)
        self.assertIsNone(frame.indicators.ema20)
        self.assertEqual(frame.regime, 'UNAVAILABLE')

    def test_no_future_tick_or_candle_mutates_prior_snapshot(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.seed_completed(bars(), BASE)
        stream(engine, end=60_000)
        prior = engine.snapshot(BASE+60_000)
        saved = json.dumps(asdict(prior), sort_keys=True)
        engine.ingest(quote(61_000, bid=9999), BASE+61_000)
        self.assertEqual(json.dumps(asdict(prior), sort_keys=True), saved)
        with self.assertRaises(FrozenInstanceError):
            prior.frames[0].completed[0].close = 0
        with self.assertRaises(ValueError):
            engine.snapshot(BASE+60_000)

    def test_slow_or_missing_closed_context_cannot_supply_current_regime(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.seed_completed(bars(), BASE)
        snap = engine.snapshot(BASE+120_000)
        self.assertEqual(snap.frames[0].regime, 'UNAVAILABLE')
        self.assertIn('CLOSED_CONTEXT_STALE_OR_MISSING', snap.frames[0].quality)

    def test_seed_does_not_allow_overlap_tick(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.seed_completed(bars(), BASE)
        self.assertEqual(engine.ingest(quote(-1000), BASE).reason, 'TICK_OVERLAPS_SEEDED_CONTEXT')

    def test_closed_candle_memory_is_bounded(self):
        engine = MarketIntelligence('XAUUSD', SOURCE, IntelligenceConfig(max_candles_per_frame=64))
        stream(engine, end=66*60_000, step=3000)
        self.assertEqual(len(engine.snapshot(BASE+66*60_000).frames[0].completed), 64)

    def test_closed_broker_refresh_repairs_context_without_fabricating_ticks(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.seed_completed(bars(), BASE)
        stream(engine, end=60_000)
        partial = engine.snapshot(BASE+60_000)
        self.assertEqual(partial.frames[0].contiguous_usable_bars, 0)
        self.assertEqual(partial.frames[0].usable_completed, ())
        restored = Candle('XAUUSD', SOURCE, 60_000, BASE, 2000, 2001, 1999, 2000, 100, 'BROKER_COMPLETED_BAR')
        engine.refresh_completed([restored], BASE+60_000)
        current = engine.snapshot(BASE+60_000)
        self.assertEqual(current.frames[0].contiguous_usable_bars, 61)
        self.assertEqual(len(current.frames[0].usable_completed), 61)
        self.assertEqual(current.retained_ticks, partial.retained_ticks)
        self.assertEqual(partial.frames[0].contiguous_usable_bars, 0)

    def test_refresh_cannot_leak_future_bars_or_partially_apply(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.seed_completed(bars(), BASE)
        before = engine.snapshot(BASE)
        with self.assertRaises(ValueError):
            engine.refresh_completed([replace(bars()[-1], close=2059.1), replace(bars()[-1], open_ms=BASE)], BASE)
        self.assertEqual(engine.snapshot(BASE), before)
        with self.assertRaises(ValueError):
            engine.refresh_completed([bars()[-1], bars()[-1]], BASE)

    def test_refreshed_closed_bar_is_not_overwritten_by_local_startup_bar(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        stream(engine, end=59_000)
        closed = Candle('XAUUSD', SOURCE, 60_000, BASE, 2000, 2005, 1995, 2000, 100, 'BROKER_COMPLETED_BAR')
        engine.refresh_completed([closed], BASE+60_000)
        engine.ingest(quote(60_000), BASE+60_000)
        snap = engine.snapshot(BASE+60_000)
        self.assertEqual(snap.frames[0].completed, (closed,))
        self.assertEqual(snap.frames[0].developing.open_ms, BASE+60_000)

    def test_preloaded_and_incremental_history_produce_same_completed_features(self):
        history = bars()
        first = MarketIntelligence('XAUUSD', SOURCE)
        first.seed_completed(history, BASE)
        second = MarketIntelligence('XAUUSD', SOURCE)
        second.seed_completed(history[:30], history[29].end_ms)
        second.refresh_completed(history[30:], BASE)
        self.assertEqual(first.snapshot(BASE).frames[0].indicators, second.snapshot(BASE).frames[0].indicators)


class FeatureMathTests(unittest.TestCase):
    def test_linear_fixture_matches_indicator_reference_values(self):
        rows = bars()
        feat = indicators(rows)
        self.assertAlmostEqual(feat.ema20, rows[-1].close-9.5)
        self.assertAlmostEqual(feat.ema50, rows[-1].close-24.5)
        self.assertAlmostEqual(feat.atr14, 1.5)
        self.assertEqual(feat.rsi14, 100)
        self.assertAlmostEqual(feat.adx14, 100)
        self.assertAlmostEqual(feat.bollinger_mid20, sum(r.close for r in rows[-20:])/20)
        self.assertAlmostEqual(feat.quote_vwap20, feat.bollinger_mid20)
        self.assertAlmostEqual(feat.efficiency20, 1)
        self.assertEqual(classify_regime(rows, feat), 'TREND_UP')

    def test_short_history_is_unknown_and_flat_history_is_finite(self):
        self.assertIsNone(indicators(bars(10)).atr14)
        feat = indicators([replace(r, open=2000, high=2000, low=2000, close=2000, quote_count=0) for r in bars()])
        self.assertEqual(feat.rsi14, 50)
        self.assertEqual(feat.atr14, 0)
        self.assertIsNone(feat.quote_vwap20)
        self.assertTrue(all(v is None or math.isfinite(v) for v in asdict(feat).values()))

    def test_range_and_downtrend_are_distinct(self):
        rows = bars(flat=True)
        self.assertEqual(classify_regime(rows, indicators(rows)), 'RANGE')
        down = [replace(r, open=5000-r.open, high=5000-r.low, low=5000-r.high, close=5000-r.close) for r in bars()]
        self.assertEqual(classify_regime(down, indicators(down)), 'TREND_DOWN')
        self.assertEqual(indicators(down).rsi14, 0)

    def test_swing_pivots_require_two_later_closed_bars(self):
        rows = bars(7)
        rows[2] = replace(rows[2], high=2100)
        earlier = structure(rows[:4], None, 2, .01)
        later = structure(rows[:5], None, 2, .01)
        self.assertFalse(any(p.pivot_open_ms == rows[2].open_ms and p.kind == 'HIGH' for p in earlier.pivots))
        pivot = next(p for p in later.pivots if p.kind == 'HIGH')
        self.assertEqual(pivot.confirmed_at_ms, rows[4].end_ms)
        self.assertEqual(pivot.pivot_open_ms, rows[2].open_ms)

    def test_breakout_and_failed_break_are_observed_candidates(self):
        row = bars(1)[0]
        breakout = replace(row, open=2000, high=2004, low=1999.8, close=2003)
        self.assertEqual(price_event(breakout, 1998, 2001, .1), 'BREAKOUT_UP_CANDIDATE')
        failed = replace(row, open=2000, high=2004, low=1999.8, close=2000)
        self.assertEqual(price_event(failed, 1998, 2001, .1), 'FAILED_BREAKOUT_HIGH')
        rejection = replace(row, open=2000, high=2000.2, low=1998, close=2000.1)
        self.assertEqual(candle_shape(rejection).rejection, 'LOWER_WICK')
        self.assertEqual(price_event(rejection, 1998, 2002, .1), 'SUPPORT_REJECTION')

    def test_current_bar_is_not_its_own_breakout_reference(self):
        rows = [replace(r, open=2000, high=2001, low=1999, close=2000) for r in bars(22)]
        rows[-1] = replace(rows[-1], high=2005, close=2004)
        self.assertEqual(structure(rows, None, 2, .01).last_closed_event, 'BREAKOUT_UP_CANDIDATE')

    def test_transition_compression_and_closed_shock_are_distinguished(self):
        rows = bars()
        feat = indicators(rows)
        self.assertEqual(classify_regime(rows, replace(feat, efficiency20=.22, trend_atr=.5)), 'TRANSITION')
        self.assertEqual(classify_regime(rows, replace(feat, compression_ratio=.4)), 'COMPRESSION')
        shocked = rows[:-1]+[replace(rows[-1], high=rows[-1].high+100)]
        self.assertEqual(classify_regime(shocked, indicators(shocked)), 'SHOCK')

    def test_incomplete_quote_count_does_not_claim_volume_weighted_price(self):
        rows = bars()
        rows[-1] = replace(rows[-1], quote_count=0)
        self.assertIsNone(indicators(rows).quote_vwap20)

    def test_spread_and_slippage_estimates_do_not_assume_a_free_exit(self):
        narrow = estimate_cost(quote(spread=.1), 100, 0, 0, .4, assumptions='zero commission scenario')
        wide = estimate_cost(quote(spread=.8), 100, 0, 0, .4, assumptions='zero commission scenario')
        self.assertGreater(narrow.net_expected_move, 0)
        self.assertLess(wide.net_expected_move, 0)
        self.assertEqual(estimate_cost(quote(spread=0), 100, 0, 0).total_round_trip_price, 0)

    def test_tick_exhaustion_detects_deceleration_and_reversal(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        stream(engine, end=30_000, price=lambda t:2000+min(t/1000, 15))
        self.assertTrue(engine.snapshot(BASE+30_000).windows[-1].exhaustion_candidate)

    def test_live_candle_and_tick_shocks_use_prior_closed_atr(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.seed_completed(bars(flat=True), BASE)
        stream(engine, end=60_000)
        engine.refresh_completed([Candle('XAUUSD', SOURCE, 60_000, BASE,
                                        2000, 2000, 2000, 2000, 60, 'BROKER_COMPLETED_BAR')], BASE+60_000)
        stream(engine, start=61_000, end=65_000, price=lambda t:2000+10*(t-60_000)/1000)
        snap = engine.snapshot(BASE+65_000)
        self.assertTrue(snap.volatility_shock)
        self.assertIn('TICK_VELOCITY_SHOCK', snap.frames[0].quality)

    def test_forming_price_change_cannot_rewrite_closed_indicators(self):
        engine = MarketIntelligence('XAUUSD', SOURCE)
        engine.seed_completed(bars(), BASE)
        engine.ingest(quote(), BASE)
        earlier = engine.snapshot(BASE)
        engine.ingest(quote(1000, bid=2500), BASE+1000)
        later = engine.snapshot(BASE+1000)
        self.assertEqual(earlier.frames[0].indicators, later.frames[0].indicators)
        self.assertEqual(earlier.frames[0].completed, later.frames[0].completed)
        self.assertNotEqual(earlier.frames[0].developing, later.frames[0].developing)

    def test_fully_known_costs_can_make_a_small_move_unprofitable(self):
        costs = estimate_cost(quote(), 100, commission_per_lot_per_side=3.5,
                              slippage_per_side=.05, expected_move=.3, assumptions='synthetic scenario')
        self.assertAlmostEqual(costs.total_round_trip_price, .37)
        self.assertAlmostEqual(costs.net_expected_move, -.07)
        self.assertIsNone(estimate_cost(quote(), 100).total_round_trip_price)
        self.assertIsNone(estimate_cost(quote(), 100, slippage_per_side=0).net_expected_move)
        for value in (True, -1, float('nan'), float('inf')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                estimate_cost(quote(), 100, commission_per_lot_per_side=value)


if __name__ == '__main__':
    unittest.main()
