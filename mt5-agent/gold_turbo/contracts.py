"""Immutable, broker-independent inputs for local Gold Turbo research.

Prices use account/broker quote units. Candle OHLC uses BID, never an invented
mid/ask path. Quote counts are not exchange trade volume. All clocks are UTC ms.
"""
from dataclasses import dataclass
import math
from typing import Optional

VERSION = 'gold-turbo-intelligence/v1'
FRAMES = (60_000, 300_000, 900_000)


def integer(value, name, minimum=0):
    if type(value) is not int or value < minimum:
        raise ValueError(name)


def positive(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError(name)


def identity(symbol, source):
    if symbol != 'XAUUSD' or not isinstance(source, str) or not source.strip() or len(source) > 128:
        raise ValueError('GOLD_SOURCE_IDENTITY_REQUIRED')


@dataclass(frozen=True)
class Tick:
    symbol: str
    source: str
    at_ms: int
    bid: float
    ask: float
    sequence: Optional[int] = None

    def __post_init__(self):
        identity(self.symbol, self.source)
        integer(self.at_ms, 'TICK_TIME_INVALID', 1)
        positive(self.bid, 'BID_INVALID')
        positive(self.ask, 'ASK_INVALID')
        if self.ask < self.bid:
            raise ValueError('CROSSED_QUOTE')
        if self.sequence is not None:
            integer(self.sequence, 'SEQUENCE_INVALID')

    @property
    def mid(self):
        return self.bid + (self.ask - self.bid) / 2

    @property
    def spread(self):
        return self.ask - self.bid


@dataclass(frozen=True)
class Candle:
    symbol: str
    source: str
    timeframe_ms: int
    open_ms: int
    open: float
    high: float
    low: float
    close: float
    quote_count: int
    origin: str = 'LOCAL_OBSERVED_TICKS'
    partial_start: bool = False
    gap_detected: bool = False

    def __post_init__(self):
        identity(self.symbol, self.source)
        integer(self.timeframe_ms, 'FRAME_INVALID', 1)
        integer(self.open_ms, 'CANDLE_TIME_INVALID')
        integer(self.quote_count, 'QUOTE_COUNT_INVALID')
        if self.timeframe_ms not in FRAMES or self.open_ms % self.timeframe_ms:
            raise ValueError('FRAME_OR_ALIGNMENT_INVALID')
        for value in (self.open, self.high, self.low, self.close):
            positive(value, 'OHLC_INVALID')
        if self.low > min(self.open, self.close) or self.high < max(self.open, self.close):
            raise ValueError('OHLC_ORDER_INVALID')
        if self.origin not in ('LOCAL_OBSERVED_TICKS', 'BROKER_COMPLETED_BAR'):
            raise ValueError('CANDLE_ORIGIN_INVALID')
        if type(self.partial_start) is not bool or type(self.gap_detected) is not bool:
            raise ValueError('CANDLE_QUALITY_INVALID')

    @property
    def end_ms(self):
        return self.open_ms + self.timeframe_ms

    @property
    def usable(self):
        return not self.partial_start and not self.gap_detected


@dataclass(frozen=True)
class IntelligenceConfig:
    max_ticks: int = 20_000
    retained_tick_ms: int = 120_000
    max_candles_per_frame: int = 512
    max_quote_age_ms: int = 2_000
    max_tick_gap_ms: int = 3_000
    price_tick: float = 0.01
    spread_spike_multiple: float = 3.0
    shock_atr_multiple: float = 3.0
    velocity_shock_atr_multiple: float = 2.0

    def __post_init__(self):
        for name in ('max_ticks', 'retained_tick_ms', 'max_candles_per_frame',
                     'max_quote_age_ms', 'max_tick_gap_ms'):
            integer(getattr(self, name), 'CONFIG_INTEGER_INVALID:' + name, 1)
        if not 32 <= self.max_ticks <= 1_000_000 or not 64 <= self.max_candles_per_frame <= 10_000:
            raise ValueError('CONFIG_MEMORY_BOUNDS_INVALID')
        if self.retained_tick_ms < 30_000 + self.max_tick_gap_ms:
            raise ValueError('TICK_RETENTION_TOO_SHORT')
        for name in ('price_tick', 'spread_spike_multiple', 'shock_atr_multiple', 'velocity_shock_atr_multiple'):
            positive(getattr(self, name), 'CONFIG_NUMBER_INVALID:' + name)
        if self.spread_spike_multiple <= 1:
            raise ValueError('SPREAD_SPIKE_MULTIPLE_INVALID')


def tick_from_mt5(symbol, source, row):
    """Require real millisecond time; a seconds timestamp cannot validate micro speed.

    Input is a normalized Python mapping, not a raw numpy rates record.
    MT5 bid/ask flags and trade volume are intentionally not inferred. A broker
    suffix is resolved by the existing client before assigning canonical symbol.
    """
    return Tick(symbol, source, row['time_msc'],
                row['bid'], row['ask'], row.get('sequence'))


def candle_from_mt5(symbol, source, timeframe_ms, row, observed_at_ms):
    integer(observed_at_ms, 'OBSERVATION_TIME_INVALID', 1)
    integer(row['time'], 'BROKER_BAR_TIME_INVALID')
    result = Candle(symbol, source, timeframe_ms, row['time'] * 1000,
                    row['open'], row['high'], row['low'], row['close'], row.get('tick_volume', 0),
                    origin='BROKER_COMPLETED_BAR')
    if result.end_ms > observed_at_ms:
        raise ValueError('DEVELOPING_BAR_CANNOT_SEED_CLOSED_CONTEXT')
    return result
