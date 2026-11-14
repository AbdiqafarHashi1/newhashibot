"""Exact Gold demo management. Only native closed M15 bars determine ATR."""
import math
from datetime import datetime, timezone

POLICY = dict(version='gold-atr-trailing/v1', strategyId='gold.rsi-trailing-15-48-1.5-5-h96',
              timeframe='15m', atrPeriod=14, triggerR=2, distanceAtr=1,
              minimumLockedR=.5, maximumHoldingSeconds=86400)


def validate_policy(value):
    if not isinstance(value, dict) or value != POLICY or any(isinstance(v, bool) for v in value.values()):
        raise RuntimeError('FROZEN_ATR_TRAILING_POLICY_REQUIRED')


def closed_atr(market, now):
    """A zero/current bar and stale quotes cannot tighten a stop."""
    if not isinstance(market, dict):
        return None
    try:
        quote_at = datetime.fromisoformat(market['last_update_at'].replace('Z', '+00:00')).timestamp()
        if not 0 <= now - quote_at <= 60:
            return None
        rows = sorted((b for b in market['candles'] if b['timeframe'] == '15m'
                       and datetime.fromisoformat(b['open_time'].replace('Z', '+00:00')).timestamp() + 900 <= now),
                      key=lambda b: b['open_time'])[-15:]
        if len(rows) != 15:
            return None
        times = [datetime.fromisoformat(b['open_time'].replace('Z', '+00:00')).timestamp() for b in rows]
        if not 0 <= now - (times[-1] + 900) < 900 or any(b-a != 900 for a, b in zip(times, times[1:])):
            return None
        total = 0
        for i, b in enumerate(rows):
            if not all(isinstance(b[k], (int, float)) and not isinstance(b[k], bool) and math.isfinite(b[k]) and b[k] > 0 for k in ('open', 'high', 'low', 'close')):
                return None
            if b['low'] > min(b['open'], b['close']) or b['high'] < max(b['open'], b['close']):
                return None
            if i:
                previous = rows[i-1]['close']
                total += max(b['high']-b['low'], abs(b['high']-previous), abs(b['low']-previous))
        return total / 14 if total > 0 else None
    except (KeyError, TypeError, ValueError, OverflowError):
        return None


def next_stop(side, entry, initial_distance, best, current_stop, atr, tick):
    if side not in (1, -1) or not all(math.isfinite(v) and v > 0 for v in (entry, initial_distance, current_stop, atr, tick)) or not math.isfinite(best) or best < 0:
        raise RuntimeError('ATR_TRAILING_INPUT_INVALID')
    if best < 2 * initial_distance:
        return current_stop
    raw = entry + side * max(.5 * initial_distance, best - atr)
    target = (math.floor(raw/tick+1e-8) if side == 1 else math.ceil(raw/tick-1e-8)) * tick
    return target if side * (target-current_stop) > .5 * tick else current_stop
