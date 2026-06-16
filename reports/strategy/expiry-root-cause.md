# Expiry Root Cause Analysis

Every expired signal must be classified as one of: momentum failure, volatility collapse, invalidation ignored, stale setup, no-entry timeout, target unrealistic, strategy mismatch, or regime mismatch.

## Heatmap dimensions
- Strategy × timeframe.
- Strategy × symbol.
- Strategy × market regime.
- Symbol group × regime.

## Classification rules
| Cause | Evidence |
|---|---|
| momentum failure | momentum score decays below strategy threshold before TP1 |
| volatility collapse | ATR percentile or ATR% falls below strategy minimum |
| invalidation ignored | price closes beyond invalidation before expiry |
| stale setup | entry not reached within no-entry timeout bars |
| no-entry timeout | waiting signal exceeds strategy timeout without fill |
| target unrealistic | TP1 distance exceeds realized expected move bucket |
| strategy mismatch | market preferred strategy differs from selected strategy |
| regime mismatch | range/chop accepted by trend or impulse strategy |

## Expiry by strategy/timeframe/symbol/regime
Populate from expired `signals` and `score_breakdown.expiry_metadata`; never estimate missing production results.
