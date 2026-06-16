# Expiry Reduction Engine

| Strategy | Max Bars | Max Minutes | No-entry Timeout | Early Cancel | Momentum Failure | Vol Collapse | Trend Failure |
|---|---:|---:|---:|---|---|---|---|
| QuickScalp | 9×5m / 4×15m | 45 / 60 | 3 / 2 bars | cancel if volume/impulse fails | exit if directional momentum flips | exit if ATR% < 0.12 | exit if EMA20 alignment lost |
| MicroScalper | 24 | 120 / 360 | 4 bars | cancel when HTF/RSI invalidates | exit if pressure fails | cancel under min ATR% | exit if EMA alignment lost |
| CompressionBreakout | 48 | 720 / 2880 | 6 bars | cancel failed breakout retest | exit failed expansion | cancel if expansion < 1.05 | exit back inside box |
| SwingContinuation | 96 | 1440 / 5760 | 8 bars | cancel reclaim failure | exit momentum divergence | reduce if ATR collapses | exit trend/reclaim failure |
| ForexMicroScalper | 48 | 720 / 2880 | 4 bars | cancel on session/spread degradation | exit momentum loss | cancel dead session | exit EMA/session trend loss |
| ForexSwingContinuation | 96 | 1440 / 5760 | 8 bars | cancel news/session invalidation | exit continuation failure | reduce dead session | exit trend failure |

Expired signals now require explicit reason metadata and must reduce strategy confidence/future arbitrator weighting via expiry risk.
