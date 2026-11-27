"""Regime applicability precedes hypothetical reward geometry, not learned odds."""
from .strategy_contracts import context_direction, frame_at


def regime_fit(snapshot, decision, now_ms):
    """Ordinal suitability. Never a probability or a measured return estimate."""
    side=1 if decision.decision=='LONG' else -1
    model=decision.entry_model or ''
    m5=frame_at(snapshot,300_000,now_ms)
    m15=frame_at(snapshot,900_000,now_ms)
    range_model=model.startswith('RANGE_') or model in ('FAILED_BREAK_OR_RANGE','SUPPORT_RESISTANCE_REJECTION','M5_SUPPORT_RESISTANCE_REJECTION')
    if range_model:return 2 if m5 and m5.regime=='RANGE' else 0
    if model.startswith('TREND_'):
        return 2 if m15 and m15.regime==('TREND_UP' if side==1 else 'TREND_DOWN') else 0
    if model in ('STRONG_CANDLE_CONTINUATION','STRONG_CANDLE_RETEST_CONTINUATION','COMPRESSION_BREAKOUT','SESSION_BREAKOUT','SIMPLE_PULLBACK','MICRO_PERSISTENT_BURST','MICRO_PULLBACK_RESUME'):
        return 1 if m5 and context_direction(m5)==side else 0
    if model in ('MICRO_REJECTION','MICRO_EXHAUSTION_REVERSAL'):
        return 1 if m5 and m5.regime in ('RANGE','TRANSITION') else 0
    return 0
