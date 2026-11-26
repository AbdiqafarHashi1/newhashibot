# Work period 2: local shared intelligence

Status: implemented and functionally tested with synthetic fixtures. No historical performance, broker connectivity, demo readiness or profitability claim. The existing daemon is not yet wired to this module; that remains work period 6. No existing strategy, order, cloud publisher or account settings were modified.

## Delivered

- `mt5-agent/gold_turbo/contracts.py`: frozen XAUUSD bid/ask tick, BID candle and configuration contracts, with strict timestamps, provenance, alignment and OHLC validation. Adapters accept normalized Python broker mappings and require real millisecond tick time.
- `intelligence.py`: bounded ordered tick storage and 5/15/30-second movement, velocity, acceleration, signed directional persistence, path length, spread statistics and exhaustion candidates. Source mismatch, stale/future quotes, clock reversal, duplicates and out-of-order updates have explicit rejection reasons. Optional sequence numbers distinguish otherwise identical updates within one millisecond; without a sequence, identical timestamp/bid/ask observations are conservatively deduplicated.
- M1/M5/M15 developing and completed candles from observed BID ticks. The first local interval is partial. Gaps invalidate affected intervals and reset micro windows. Missing periods are not filled. Clock passage without an observed boundary does not certify a completed candle.
- Atomic closed-broker-bar bootstrap/refresh restores candle context after startup/reconnect. It never restores a missing tick path or micro-window history. Previously returned snapshots remain immutable. Strategies should consume `frame.usable_completed`, not assume all retained `completed` bars are valid.
- `features.py`: body/wicks, support/resistance and reaction counts, causally confirmed swings, failed breaks/rejections and breakout candidates; EMA20/50, Wilder ATR14/RSI14/ADX14, Bollinger20, efficiency, trend/range/compression/transition/shock evidence. Developing candles cannot rewrite completed-bar indicators. Swing pivots become visible only after two subsequent completed bars.
- Spread-spike, developing-candle shock and tick-movement shock flags. Missing history/quotes are explicit quality states. These are intelligence flags, not the daily-loss locks, news protection or shock cooldown state machine planned for later periods.
- `estimate_cost`: current observed spread plus explicit round-trip commission/slippage assumptions, in XAUUSD quote-price units. Unknown cost components remain unknown. Future spread/fills and account-currency conversion are not fabricated.

## Semantics and limits for the next engines

Snapshots are current-state observations, not historical queries. Instance ownership is one symbol/feed and one serialized writer. Broker history can seed candle indicators but cannot seed velocity or acceleration. Memory bounds are configurable; truncation that removes required window coverage makes that window unavailable.

Candles and structural levels use BID prices; tick movements use midpoint. The quote-count-weighted typical-price proxy is deliberately named `quote_vwap20`: it is not traded-volume VWAP. It is unknown if any of its twenty bars lacks a positive quote count. No entry engine is required to wait for every indicator: feature availability is separate from strategy-specific admission.

Indicator calculations are defined over the retained contiguous usable history. Regime families follow the existing adaptive-market vocabulary, but this is a separately versioned implementation with explicit Wilder smoothing; byte-for-byte TypeScript classifier parity is not claimed. Research thresholds have not been optimized or profitability-qualified. Breakout/exhaustion classifications are observable candidates, not proof of a future move.

Local tick continuity uses configurable gap/staleness thresholds (default 3s/2s). A quiet market or slow reader may therefore be marked insufficient rather than interpreted as continuous data. The actual MT5 history reader, broker specifications, authorization envelope and responsive daemon integration remain period 6 work. The module performs no network I/O and sends no gold ticks to Supabase.

## Targeted verification

```bash
PYTHONPATH=mt5-agent python3 -m unittest discover -s mt5-agent/tests -p 'test_gold_turbo_intelligence.py' -v
python3 -m compileall -q mt5-agent/gold_turbo
git diff --check
```

41 deterministic tests passed. Coverage includes exact candle boundaries, M5/M15 rollover, gap and memory truncation, clock/source rejection, causal seed/refresh, immutable snapshots, known indicator/velocity/acceleration values, swing confirmation, rejection versus breakout, regime categories, shock detection, spread spikes and cost-sensitive net movement. Synthetic fixtures establish software behavior only; they are not fresh trading backtests. No data downloads, optimization sweeps or full-repository suites were run.

## Next: number 3

Implement distinct Micro and Momentum evaluators consuming these snapshots. Preserve immutable strategy/entry-model/rejection diagnostics. Return research decisions and protected proposed exits, not provider orders. Separate observed evidence from risk authorization, sizing and execution, which remain later integration steps. All five Turbo engines remain in scope and demo-only.
