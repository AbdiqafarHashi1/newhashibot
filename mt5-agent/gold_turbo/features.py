"""Causal trailing features. Thresholds are research defaults, not calibrated edge.

EMA: SMA seed then exponential smoothing. ATR/RSI/ADX: Wilder smoothing.
Bollinger: 20-bar population deviation. Quote VWAP: trailing typical BID price
weighted by quote counts, NOT traded volume or a broker execution VWAP.
"""
from dataclasses import dataclass
import math
from statistics import median
from typing import Optional, Tuple
from .contracts import Candle


@dataclass(frozen=True)
class CandleShape:
    signed_body: float
    body_fraction: float
    upper_wick: float
    lower_wick: float
    rejection: str


def candle_shape(bar):
    span = bar.high - bar.low
    upper = bar.high - max(bar.open, bar.close)
    lower = min(bar.open, bar.close) - bar.low
    rejection = 'NONE'
    if span > 0:
        if lower / span >= .5 and lower > abs(bar.close - bar.open):
            rejection = 'LOWER_WICK'
        elif upper / span >= .5 and upper > abs(bar.close - bar.open):
            rejection = 'UPPER_WICK'
    return CandleShape(bar.close - bar.open, abs(bar.close-bar.open)/span if span else 0,
                       upper, lower, rejection)


@dataclass(frozen=True)
class Indicators:
    ema20: Optional[float]
    ema50: Optional[float]
    atr14: Optional[float]
    rsi14: Optional[float]
    adx14: Optional[float]
    quote_vwap20: Optional[float]
    bollinger_mid20: Optional[float]
    bollinger_upper20: Optional[float]
    bollinger_lower20: Optional[float]
    efficiency20: Optional[float]
    trend_atr: Optional[float]
    relative_atr: Optional[float]
    compression_ratio: Optional[float]


def _ema(values, n):
    if len(values) < n:
        return None
    value = sum(values[:n]) / n
    for row in values[n:]:
        value += 2 / (n+1) * (row-value)
    return value


def _wilder(values, n):
    if len(values) < n:
        return []
    value = sum(values[:n]) / n
    result = [value]
    for row in values[n:]:
        value += (row-value) / n
        result.append(value)
    return result


def indicators(rows):
    close = [r.close for r in rows]
    ema20, ema50 = _ema(close, 20), _ema(close, 50)
    tr, gain, loss, plus, minus = [], [], [], [], []
    for prior, row in zip(rows, rows[1:]):
        tr.append(max(row.high-row.low, abs(row.high-prior.close), abs(row.low-prior.close)))
        delta = row.close-prior.close
        gain.append(max(delta, 0)); loss.append(max(-delta, 0))
        up, down = row.high-prior.high, prior.low-row.low
        plus.append(up if up > down and up > 0 else 0)
        minus.append(down if down > up and down > 0 else 0)
    atrs, gains, losses = _wilder(tr, 14), _wilder(gain, 14), _wilder(loss, 14)
    atr = atrs[-1] if atrs else None
    rsi = None
    if gains:
        rsi = 50.0 if gains[-1] == losses[-1] == 0 else 100.0 if losses[-1] == 0 else 100-100/(1+gains[-1]/losses[-1])
    dx = []
    for a, p, m in zip(atrs, _wilder(plus, 14), _wilder(minus, 14)):
        dx.append(100 * abs(p-m)/(p+m) if a > 0 and p+m > 0 else 0)
    adx = _wilder(dx, 14)
    mid = deviation = vwap = efficiency = baseline = compression = None
    if len(rows) >= 20:
        recent = rows[-20:]
        mid = sum(close[-20:])/20
        deviation = math.sqrt(sum((p-mid)**2 for p in close[-20:])/20)
        count = sum(r.quote_count for r in recent)
        if count > 0 and all(r.quote_count > 0 for r in recent):
            vwap = sum((r.high+r.low+r.close)/3*r.quote_count for r in recent)/count
    if len(rows) >= 21:
        travel = sum(abs(b-a) for a, b in zip(close[-21:], close[-20:]))
        efficiency = abs(close[-1]-close[-21])/travel if travel else 0.0
    if len(rows) >= 50:
        reference = tr[-49:-14]
        baseline = median(reference) if reference else None
        spans = [r.high-r.low for r in rows[-50:]]
        typical = median(spans)
        compression = (sum(spans[-5:])/5)/typical if typical > 0 else None
    return Indicators(ema20, ema50, atr, rsi, adx[-1] if adx else None, vwap, mid,
                      mid+2*deviation if mid is not None else None,
                      mid-2*deviation if mid is not None else None, efficiency,
                      (ema20-ema50)/atr if ema50 is not None and atr and atr > 0 else None,
                      atr/baseline if atr is not None and baseline and baseline > 0 else None,
                      compression)


@dataclass(frozen=True)
class Pivot:
    kind: str
    price: float
    pivot_open_ms: int
    confirmed_at_ms: int


@dataclass(frozen=True)
class Structure:
    support: Optional[float]
    resistance: Optional[float]
    support_reactions: int
    resistance_reactions: int
    last_closed_event: str
    developing_event: str
    pivots: Tuple[Pivot, ...]
    swing_direction: str


def price_event(bar, support, resistance, tolerance):
    if bar is None or support is None or resistance is None:
        return 'UNAVAILABLE'
    shape = candle_shape(bar)
    if bar.high > resistance+tolerance and bar.close < resistance-tolerance:
        return 'FAILED_BREAKOUT_HIGH'
    if bar.low < support-tolerance and bar.close > support+tolerance:
        return 'FAILED_BREAKOUT_LOW'
    if bar.close > resistance+tolerance:
        return 'BREAKOUT_UP_CANDIDATE' if shape.body_fraction >= .5 else 'UPPER_LEVEL_TEST'
    if bar.close < support-tolerance:
        return 'BREAKOUT_DOWN_CANDIDATE' if shape.body_fraction >= .5 else 'LOWER_LEVEL_TEST'
    if bar.low <= support+tolerance and shape.rejection == 'LOWER_WICK':
        return 'SUPPORT_REJECTION'
    if bar.high >= resistance-tolerance and shape.rejection == 'UPPER_WICK':
        return 'RESISTANCE_REJECTION'
    return 'INSIDE_RANGE'


def structure(rows, forming, atr, price_tick):
    tolerance = max(price_tick, (atr or 0)*.15)
    def bounds(bars):
        return (min(r.low for r in bars), max(r.high for r in bars)) if len(bars) >= 3 else (None, None)
    prior = rows[:-1][-20:]
    support, resistance = bounds(prior)
    live_support, live_resistance = bounds(rows[-20:])
    pivots = []
    for i in range(2, len(rows)-2):
        window = rows[i-2:i+3]
        bar = rows[i]
        if all(bar.high > r.high for j, r in enumerate(window) if j != 2):
            pivots.append(Pivot('HIGH', bar.high, bar.open_ms, rows[i+2].end_ms))
        if all(bar.low < r.low for j, r in enumerate(window) if j != 2):
            pivots.append(Pivot('LOW', bar.low, bar.open_ms, rows[i+2].end_ms))
    highs = [p.price for p in pivots if p.kind == 'HIGH'][-2:]
    lows = [p.price for p in pivots if p.kind == 'LOW'][-2:]
    direction = 'UNAVAILABLE'
    if len(highs) == len(lows) == 2:
        direction = 'UP' if highs[1] > highs[0] and lows[1] > lows[0] else 'DOWN' if highs[1] < highs[0] and lows[1] < lows[0] else 'MIXED'
    return Structure(live_support, live_resistance,
                     sum(abs(r.low-live_support) <= tolerance for r in rows[-20:]) if live_support is not None else 0,
                     sum(abs(r.high-live_resistance) <= tolerance for r in rows[-20:]) if live_resistance is not None else 0,
                     price_event(rows[-1] if rows else None, support, resistance, tolerance),
                     price_event(forming, live_support, live_resistance, tolerance), tuple(pivots[-16:]), direction)


def classify_regime(rows, features):
    """Same broad families as adaptive-market/v1; independently versioned local math."""
    if len(rows) < 50 or features.trend_atr is None or features.relative_atr is None or features.compression_ratio is None:
        return 'UNAVAILABLE'
    last = rows[-1]
    if features.relative_atr > 2.5 or (last.high-last.low)/features.atr14 > 3.5:
        return 'SHOCK'
    if features.compression_ratio < .55:
        return 'COMPRESSION'
    if features.efficiency20 >= .25 and abs(features.trend_atr) >= .6:
        return 'TREND_UP' if features.trend_atr > 0 else 'TREND_DOWN'
    if features.efficiency20 < .2 and abs(features.trend_atr) < .6:
        return 'RANGE'
    return 'TRANSITION'
