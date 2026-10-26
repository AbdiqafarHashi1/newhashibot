# Python signal-only framework

Implemented in `hashibot_strategies.py`. NumPy and the Python standard library only. No Redis, ZeroMQ, broker orders, account routing, credentials, network clients or Telegram sends. Importing it has no operational side effects.

**This file is not the active TypeScript scanner.** These five strategies are new research hypotheses. No historical/forward performance, rolling PF>1, signal-mode certification or launch permission is claimed. Do not run a second independent scanner or publish directly from this module. Production adoption must reuse canonical strategy registration, arbitration, immutable signal commit and publication, with tested parity and genuine evidence. Existing PhaseD/E/F execution authorities remain untouched.

The prior1,552-line execution implementation is preserved byte-for-byte at `legacy/hashibot_execution_strategies.py` (SHA256 `6d582658a587a3328eb8257886a9597a14514ce59dfbcb3d71c7173b79b1aa58`). It is historical reference, not imported by the new module. This preservation explains the apparent large replacement; prior implementation was not erased.

## Input and output

Python3.11+ and NumPy (`pip install -r requirements-signals.txt`). Candles are NumPy arrays:

```python
# Columns: UTC open epoch seconds, open, high, low, close, volume,
# optional actual buyer-initiated executed volume in the SAME volume units.
ctx = SignalContext(
    ticker="BTCUSDT", market="CRYPTO", bars=closed_5m_array,
    h1=closed_hourly_array, asof=candle_close_epoch,
    source="YOUR_VERIFIED_SOURCE", seconds=300,
    instrument="PERPETUAL", funding=verified_8h_funding_observation,
)
evaluation = CVDDivergenceEngine().evaluate(ctx)
if evaluation.payload is not None:
    tracker = VirtualSignalTracker()
    signal_id = tracker.register(evaluation)
    # Feed each subsequent CLOSED candle in order; no orders are submitted.
else:
    print(evaluation.reasons)
```

Each nonempty `generate(ctx)` result has exactly:

```python
{"ticker": str, "strategy": str, "action": "BUY" or "SELL",
 "entry": float, "sl": float, "tp": float,
 "signal_intensity": float, "regime": str}
```

`signal_intensity` is fixed rule strength, **not a calibrated success probability**. Use `evaluate()` when tracking: its separate metadata retains generation time, timeframe, entry kind and ATR. The strict dictionary alone cannot express OTE limit semantics. No implicit market fill is assumed for a limit signal.

## Global rules and explicit conflict resolution

- Wilder ATR14 with14 true-range seed and closed bars. Forex SL1.5ATR/TP3ATR; Crypto SL2ATR/TP4ATR. Initial nominal RR2. Actual next-open/limit fills can change realized geometry; invalid gap entries cancel virtually.
- "Trailing TP bracket" is ambiguous. Implemented semantics: Crypto has the displayed fixed4ATR target **plus a protective stop ratcheting4 initial ATR behind favorable completed closes**, never loosening its original stop. Amendments apply on the next candle. This is not a silently moving or unreachable TP. Stop-first collision ordering and no same-bar optimistic trail are tested.
- Session opposite-side, EMA baseline, H4 structural swing and next HVN are room constraints. They must provide at least the mandatory ATR target distance; otherwise reject `STRUCTURAL_ROOM_BELOW_ATR_TARGET`. They do not override global ATR/RR. These simultaneous constraints can produce few or zero candidates.
- Every candidate must align with two confirmed H1 higher-high/higher-low or lower-high/lower-low pivots. Mixed/unknown blocks. This intentionally also constrains contrarian setups; it does not guarantee better returns.
- Perpetual funding must be a fresh observed fraction per8h, with source and timestamp. Default crowding threshold +/-0.0005 (five basis points), configurable, not empirically optimized. Positive extremes block buys; negative extremes block sells. Missing, future, stale, malformed or non8h evidence blocks. Explicit SPOT skips funding only; do not mislabel perpetual data as SPOT.
- Forex requires a source-backed news calendar covering the entire -60/+60-minute window and explicit currency exposure. High-impact relevant events at either boundary block. Missing/stale/incomplete calendar blocks. No calendar API is fabricated.
- Active signals close virtually after12 own-timeframe bars without SL/TP/earlier exit. Pending limits separately expire after12 unfilled bars. Thus5m means60minutes; H4 means48hours. Stops, target, CVD-flat exit and temporal exit have explicit precedence.
- Native, ordered, contiguous, closed, current OHLCV only. No duplicate/gap filling, naive local timestamps or retrospective fills. Evaluate at the exact completed signal candle boundary. Missing tracking bars require reconciliation rather than silently advancing time.

## Strategies

1. **SessionLiquiditySweep:** Forex5m; Asian00:00–06:00UTC full72-bar coverage, London08:00–10:00 local time (DST aware);2–5 explicit pip-size penetration and close back inside. Opposite boundary must leave ATR target room.
2. **CVDDivergenceEngine:** actual native taker-buy volume; confirmed price/CVD pivot divergence, both directions. No "whale" identity claim. `update_context` wires CVD flattening to a virtual exit when mean absolute last3 delta changes is<=10% of previous10. Missing delta never disables ordinary stop/target/time monitoring.
3. **MeanReversionExhaustion:**15:00–17:00 NewYork local time and current volume<70% prior20-bar average. Entire candle beyond the prior20-close2.5SD band, RSI2 extreme. EMA20 is the structural-room constraint.
4. **H4MarketStructureShift:** closed H4 break of confirmed swing, midpoint70.2% inside the61.8–78.6% OTE zone. Unfilled LIMIT metadata, H4 ATR and H4 tracking clock. No fill before later native price touches the limit; ambiguous fill-bar targets are not credited.
5. **VolumeProfileGapRider:** actual measured trade-volume profile; no OHLC-distributed or FX tick-volume approximation. Prior profile must end before breakout candle opens. Median-relative HVN>=1.5x and contiguous LVN<=0.5x bins; candle volume>1.5x prior20 average; next HVN provides target room. This is venue-specific volume evidence, not whole-market Forex volume.

## Validation and limitations

Run:

```bash
python3 -m unittest discover -s tests/research -p 'test_signal_framework.py' -v
python3 -m py_compile hashibot_strategies.py
```

Sixteen behavioral tests cover positive full-payload paths for all five strategies; buy/sell CVD; ATR arithmetic; news boundaries/DST; funding freshness; H1 alignment; rejected data; temporal exits; pending-limit expiry; gap cancellation; collision priority; no retroactive trailing; retries; CVD lifecycle; broker H4 UTC phase preservation; and net/rolling-PF arithmetic. Native broker H4 bars need not start at midnightUTC; their actual contiguous timestamp phase is retained. Fixtures are not market-performance evidence.

`VirtualSignalTracker` is explicitly in-memory mathematical tracking. It is not durable canonical signal truth, a broker fill simulator, a certified portfolio backtest, or a production recovery service. It reports gross price change labelled `VIRTUAL_NOT_PROVIDER_FILL`; it does not deduct invented costs. `profit_factor()` requires caller-supplied measured NET outcomes and returns undefined when there are no losses. `rolling_profit_factor()` deduplicates immutable IDs, rejects conflicts, excludes not-yet-completed evidence, applies bounded observation windows/minimum samples, and checks strict PF>1.0. Its output always has `release_approved=False`: a trailing historical metric cannot promise future profitability or authorize release.

Historical five-strategy performance: **NOT_RUN**. Real Forex/news/funding/profile coverage: **NOT_RUN**. Active-scanner integration/parity: **NOT_IMPLEMENTED** for this Python framework. Remote deployment/activation: **NOT_RUN**. A rolling PF consistently above1 cannot be assured by these formulas or any deterministic code refactor. New evidence and existing release gates remain necessary.

Final local checks:16 framework tests and Python compilation passed. The existing MT5 mock unit suite passed after installing its already-declared `python-dotenv` dependency; initial import failures were environmental, not represented as passing tests. No real broker calls occurred. The active TypeScript application was unchanged by this pass; no new app build or remote CI pass is claimed.
