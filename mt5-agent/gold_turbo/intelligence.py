"""Bounded, causal local intelligence. No MT5, network, orders or credentials.

One instance belongs to one canonical instrument/feed. It is single-writer;
callers must serialize ingest/snapshot. A snapshot describes current observed
state, never a historical query. Tick gaps start a new microstructure segment.
"""
from collections import deque
from dataclasses import dataclass, replace
import math
from statistics import median
from typing import Optional, Tuple
from .contracts import (VERSION, FRAMES, Candle, IntelligenceConfig, Tick,
                        identity, integer, positive)
from .features import (CandleShape, Indicators, Structure, candle_shape,
                       classify_regime, indicators, structure)


@dataclass(frozen=True)
class IngestResult:
    accepted: bool
    reason: str
    gap_ms: int = 0


@dataclass(frozen=True)
class WindowFeatures:
    seconds: int
    available: bool
    observations: int = 0
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    move: Optional[float] = None
    velocity: Optional[float] = None
    acceleration: Optional[float] = None
    directional_persistence: Optional[float] = None
    median_spread: Optional[float] = None
    maximum_spread: Optional[float] = None
    realized_path: Optional[float] = None
    exhaustion_candidate: bool = False


@dataclass(frozen=True)
class FrameSnapshot:
    timeframe_ms: int
    completed: Tuple[Candle, ...]
    developing: Optional[Candle]
    contiguous_usable_bars: int
    indicators: Indicators
    structure: Structure
    regime: str
    developing_shape: Optional[CandleShape]
    quality: Tuple[str, ...]

    @property
    def usable_completed(self):
        """Only the contiguous validated suffix used by the indicator engine."""
        return self.completed[len(self.completed)-self.contiguous_usable_bars:]


@dataclass(frozen=True)
class MarketSnapshot:
    version: str
    symbol: str
    source: str
    as_of_ms: int
    latest_tick: Optional[Tick]
    quote_age_ms: Optional[int]
    windows: Tuple[WindowFeatures, ...]
    frames: Tuple[FrameSnapshot, ...]
    spread_spike: bool
    volatility_shock: bool
    quality: Tuple[str, ...]
    rejected_inputs: Tuple[Tuple[str, int], ...]
    retained_ticks: int


@dataclass(frozen=True)
class CostEstimate:
    basis: str
    spread_price: float
    commission_round_trip_price: Optional[float]
    slippage_round_trip_price: Optional[float]
    total_round_trip_price: Optional[float]
    net_expected_move: Optional[float]
    assumptions: str


def estimate_cost(tick, contract_size, commission_per_lot_per_side=None,
                  slippage_per_side=None, expected_move=None, assumptions='UNSPECIFIED'):
    """Cost in XAUUSD price units (USD/oz), NOT account currency or a fill promise.

    Commission is quote-currency USD/lot/side; slippage is adverse USD/oz/side.
    Missing cost inputs remain unknown. Round-trip spread uses the observed
    current spread as a scenario; future exit spread is not known.
    """
    if not isinstance(tick, Tick):
        raise ValueError('TICK_REQUIRED')
    positive(contract_size, 'CONTRACT_SIZE_REQUIRED')
    for value in (commission_per_lot_per_side, slippage_per_side, expected_move):
        if value is not None:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError('COST_INPUT_INVALID')
    if not isinstance(assumptions, str) or not assumptions.strip():
        raise ValueError('COST_ASSUMPTIONS_REQUIRED')
    commission = None if commission_per_lot_per_side is None else 2*commission_per_lot_per_side/contract_size
    slip = None if slippage_per_side is None else 2*slippage_per_side
    total = tick.spread+commission+slip if commission is not None and slip is not None else None
    return CostEstimate('OBSERVED_SPREAD_PLUS_CONFIGURED_COST_SCENARIO', tick.spread, commission, slip,
                        total, expected_move-total if expected_move is not None and total is not None else None,
                        assumptions)


class MarketIntelligence:
    def __init__(self, symbol, source, config=None):
        identity(symbol, source)
        self.symbol, self.source = symbol, source
        self.config = config or IntelligenceConfig()
        if not isinstance(self.config, IntelligenceConfig):
            raise ValueError('INTELLIGENCE_CONFIG_REQUIRED')
        self._ticks = deque()
        self._keys = set()
        self._completed = {tf: deque(maxlen=self.config.max_candles_per_frame) for tf in FRAMES}
        self._forming = {}
        self._last_tick = None
        self._last_observed_ms = 0
        self._seed_end_ms = 0
        self._seeded = False
        self._rejected = {}
        self._cache = {}

    def seed_completed(self, rows, observed_at_ms):
        """One atomic bootstrap before live ingest. No tick path is inferred.

        Seed only real closed broker BID bars. A subsequent first local candle is
        always marked partial, even if the first quote lands on a bucket edge.
        """
        integer(observed_at_ms, 'OBSERVATION_TIME_INVALID', 1)
        if self._seeded or self._last_tick is not None:
            raise ValueError('BOOTSTRAP_BEFORE_FIRST_TICK_ONLY')
        groups = {tf: [] for tf in FRAMES}
        for row in rows:
            if not isinstance(row, Candle) or (row.symbol, row.source) != (self.symbol, self.source):
                raise ValueError('SEED_SOURCE_MISMATCH')
            if row.origin != 'BROKER_COMPLETED_BAR' or not row.usable or row.end_ms > observed_at_ms:
                raise ValueError('ONLY_COMPLETED_BROKER_BARS_CAN_SEED')
            groups[row.timeframe_ms].append(row)
        for tf, bars in groups.items():
            if len(bars) > self.config.max_candles_per_frame:
                raise ValueError('SEED_EXCEEDS_MEMORY_BOUND')
            if any(a.open_ms >= b.open_ms for a, b in zip(bars, bars[1:])):
                raise ValueError('SEED_ORDER_OR_DUPLICATE_INVALID')
        for tf, bars in groups.items():
            self._completed[tf].extend(bars)
        self._seed_end_ms = max((r.end_ms for bars in groups.values() for r in bars), default=0)
        self._last_observed_ms = observed_at_ms
        self._seeded = True
        self._cache.clear()

    def refresh_completed(self, rows, observed_at_ms):
        """Reconcile closed broker bars without manufacturing their tick path.

        This repairs a partially observed startup/reconnect interval for candle
        indicators. Micro windows still require actual uninterrupted ticks.
        A refresh is atomic and may replace a retained bar, but cannot rewrite a
        snapshot already returned. The observation clock must not move backward.
        """
        integer(observed_at_ms, 'OBSERVATION_TIME_INVALID', 1)
        if observed_at_ms < self._last_observed_ms:
            raise ValueError('OBSERVATION_CLOCK_REVERSED')
        updates = {tf: {} for tf in FRAMES}
        for row in rows:
            if not isinstance(row, Candle) or (row.symbol, row.source) != (self.symbol, self.source):
                raise ValueError('REFRESH_SOURCE_MISMATCH')
            if row.origin != 'BROKER_COMPLETED_BAR' or not row.usable or row.end_ms > observed_at_ms:
                raise ValueError('ONLY_COMPLETED_BROKER_BARS_CAN_REFRESH')
            if row.open_ms in updates[row.timeframe_ms]:
                raise ValueError('DUPLICATE_REFRESH_BAR')
            updates[row.timeframe_ms][row.open_ms] = row
        for tf, changes in updates.items():
            if len(changes) > self.config.max_candles_per_frame:
                raise ValueError('REFRESH_EXCEEDS_MEMORY_BOUND')
        for tf, changes in updates.items():
            if changes:
                merged = {row.open_ms: row for row in self._completed[tf]}
                merged.update(changes)
                self._completed[tf] = deque(sorted(merged.values(), key=lambda r:r.open_ms)[-self.config.max_candles_per_frame:],
                                            maxlen=self.config.max_candles_per_frame)
                self._cache.pop(tf, None)
        self._seed_end_ms = max(self._seed_end_ms, max((r.end_ms for group in updates.values() for r in group.values()), default=0))
        self._last_observed_ms = observed_at_ms
        self._seeded = True

    def _reject(self, reason):
        self._rejected[reason] = self._rejected.get(reason, 0)+1
        return IngestResult(False, reason)

    @staticmethod
    def _key(tick):
        return (tick.at_ms, tick.bid, tick.ask, tick.sequence)

    def ingest(self, tick, observed_at_ms):
        integer(observed_at_ms, 'OBSERVATION_TIME_INVALID', 1)
        if not isinstance(tick, Tick):
            raise ValueError('TICK_CONTRACT_REQUIRED')
        if (tick.symbol, tick.source) != (self.symbol, self.source):
            return self._reject('SOURCE_MISMATCH')
        if observed_at_ms < self._last_observed_ms:
            return self._reject('OBSERVATION_CLOCK_REVERSED')
        if tick.at_ms > observed_at_ms:
            return self._reject('FUTURE_TICK')
        if observed_at_ms-tick.at_ms > self.config.max_quote_age_ms:
            return self._reject('STALE_TICK')
        prior = self._last_tick
        if tick.at_ms < self._seed_end_ms:
            return self._reject('TICK_OVERLAPS_SEEDED_CONTEXT')
        if prior and tick.at_ms < prior.at_ms:
            return self._reject('OUT_OF_ORDER_TICK')
        if self._key(tick) in self._keys:
            return self._reject('DUPLICATE_TICK')
        if prior and tick.at_ms == prior.at_ms and tick.sequence is not None and prior.sequence is not None and tick.sequence <= prior.sequence:
            return self._reject('OUT_OF_ORDER_SEQUENCE')
        gap = tick.at_ms-prior.at_ms if prior else 0
        interrupted = gap > self.config.max_tick_gap_ms
        if interrupted:
            self._ticks.clear(); self._keys.clear()
        self._ticks.append(tick); self._keys.add(self._key(tick))
        while len(self._ticks) > self.config.max_ticks or tick.at_ms-self._ticks[0].at_ms > self.config.retained_tick_ms:
            self._keys.remove(self._key(self._ticks.popleft()))
        for tf in FRAMES:
            bucket = tick.at_ms // tf * tf
            bar = self._forming.get(tf)
            if bar is None or bar.open_ms != bucket:
                if bar is not None:
                    # A closed broker refresh may already cover this partial
                    # interval. Never overwrite it with sampled local ticks.
                    if not self._completed[tf] or self._completed[tf][-1].open_ms < bar.open_ms:
                        self._completed[tf].append(replace(bar, gap_detected=bar.gap_detected or interrupted))
                        self._cache.pop(tf, None)
                self._forming[tf] = Candle(self.symbol, self.source, tf, bucket,
                    tick.bid, tick.bid, tick.bid, tick.bid, 1,
                    partial_start=prior is None or interrupted, gap_detected=interrupted)
            else:
                self._forming[tf] = replace(bar, high=max(bar.high, tick.bid), low=min(bar.low, tick.bid),
                                           close=tick.bid, quote_count=bar.quote_count+1,
                                           gap_detected=bar.gap_detected or interrupted)
        self._last_tick, self._last_observed_ms = tick, observed_at_ms
        return IngestResult(True, 'GAP_RESET' if interrupted else 'ACCEPTED', gap if interrupted else 0)

    def _window(self, seconds):
        rows = list(self._ticks)
        if not rows:
            return WindowFeatures(seconds, False)
        cutoff = rows[-1].at_ms-seconds*1000
        anchors = [i for i, row in enumerate(rows) if row.at_ms <= cutoff]
        if not anchors:
            return WindowFeatures(seconds, False, len(rows))
        rows = rows[anchors[-1]:]
        elapsed = (rows[-1].at_ms-rows[0].at_ms)/1000
        if elapsed <= 0:
            return WindowFeatures(seconds, False, len(rows))
        midcut = rows[-1].at_ms-seconds*500
        half = [i for i, row in enumerate(rows) if row.at_ms <= midcut]
        acceleration = None
        early_velocity = late_velocity = 0
        if half:
            middle = rows[half[-1]]
            early_s = (middle.at_ms-rows[0].at_ms)/1000
            late_s = (rows[-1].at_ms-middle.at_ms)/1000
            if early_s > 0 and late_s > 0:
                early_velocity = (middle.mid-rows[0].mid)/early_s
                late_velocity = (rows[-1].mid-middle.mid)/late_s
                acceleration = (late_velocity-early_velocity)/((early_s+late_s)/2)
        move = rows[-1].mid-rows[0].mid
        path = sum(abs(b.mid-a.mid) for a, b in zip(rows, rows[1:]))
        return WindowFeatures(seconds, True, len(rows), rows[0].at_ms, rows[-1].at_ms, move,
                              move/elapsed, acceleration, move/path if path else 0,
                              median(t.spread for t in rows), max(t.spread for t in rows), path,
                              abs(early_velocity) > 0 and (early_velocity*late_velocity < 0 or abs(late_velocity) < .35*abs(early_velocity)))

    @staticmethod
    def _usable_tail(rows):
        tail = []
        for row in reversed(rows):
            if not row.usable or (tail and row.end_ms != tail[-1].open_ms):
                break
            tail.append(row)
        return list(reversed(tail))

    def snapshot(self, as_of_ms):
        integer(as_of_ms, 'SNAPSHOT_TIME_INVALID', 1)
        if as_of_ms < self._last_observed_ms:
            raise ValueError('HISTORICAL_SNAPSHOT_NOT_SUPPORTED')
        if as_of_ms < self._seed_end_ms:
            raise ValueError('SNAPSHOT_BEFORE_SEEDED_CONTEXT')
        quote_age = as_of_ms-self._last_tick.at_ms if self._last_tick else None
        fresh = quote_age is not None and quote_age <= self.config.max_quote_age_ms
        quality = []
        if not self._last_tick:
            quality.append('NO_TICKS')
        elif not fresh:
            quality.append('STALE_QUOTE')
        windows = tuple(self._window(n) for n in (5, 15, 30))
        # Compare with prior observations, so the current spike cannot set its own baseline.
        prior_spreads = [t.spread for t in self._ticks if self._last_tick and
                         self._last_tick.at_ms-30_000 <= t.at_ms < self._last_tick.at_ms]
        baseline = median(prior_spreads) if len(prior_spreads) >= 2 else None
        spread_spike = bool(self._last_tick and baseline is not None and
                            self._last_tick.spread > self.config.spread_spike_multiple*max(baseline, self.config.price_tick))
        if spread_spike:
            quality.append('SPREAD_SPIKE')
        if not windows[-1].available:
            quality.append('TICK_WINDOW_WARMUP_OR_TRUNCATED')
        frames = []
        shock = False
        for tf in FRAMES:
            completed = tuple(self._completed[tf])
            if tf not in self._cache:
                tail = self._usable_tail(completed)
                feats = indicators(tail)
                self._cache[tf] = (tail, feats, classify_regime(tail, feats))
            tail, feats, regime = self._cache[tf]
            forming = self._forming.get(tf)
            flags = []
            if forming and forming.end_ms <= as_of_ms:
                # Clock passage alone cannot attest an uninterrupted observed interval.
                forming = None
                flags.append('CANDLE_BOUNDARY_NOT_OBSERVED')
            if not completed or as_of_ms-completed[-1].end_ms >= tf:
                flags.append('CLOSED_CONTEXT_STALE_OR_MISSING')
                regime = 'UNAVAILABLE'
            if len(tail) < 50:
                flags.append('INDICATOR_WARMUP')
            if forming and not forming.usable:
                flags.append('DEVELOPING_INTERVAL_PARTIAL_OR_GAPPED')
            active = forming if forming and forming.usable else None
            prior_atr = feats.atr14
            bar_shock = bool(active and prior_atr and prior_atr > 0 and
                             active.high-active.low > self.config.shock_atr_multiple*prior_atr)
            if bar_shock:
                flags.append('DEVELOPING_CANDLE_SHOCK')
            if tf == FRAMES[0] and prior_atr and prior_atr > 0 and windows[0].available:
                if abs(windows[0].move) > self.config.velocity_shock_atr_multiple*prior_atr:
                    flags.append('TICK_VELOCITY_SHOCK'); shock = True
            shock = shock or bar_shock or regime == 'SHOCK'
            frames.append(FrameSnapshot(tf, completed, forming, len(tail), feats,
                                       structure(tail, active, prior_atr, self.config.price_tick), regime,
                                       candle_shape(forming) if forming else None, tuple(flags)))
        if shock:
            quality.append('VOLATILITY_SHOCK')
        return MarketSnapshot(VERSION, self.symbol, self.source, as_of_ms, self._last_tick, quote_age,
                              windows, tuple(frames), spread_spike, shock, tuple(quality),
                              tuple(sorted(self._rejected.items())), len(self._ticks))
