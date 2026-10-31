# Directional extension — separate comparative hypothesis

`protocol.json` was declared after the original ten-asset long-only result. The parent report remains unchanged. This tests one bearish mirror, not a parameter grid or four new independent strategies.

Build and run `study.ts` from repository root using the already verified ten-asset caches. Native data and costs are unchanged; both long and short gates use the same closed hourly BTC and alt prefixes. Mutually exclusive BTC-return signs prevent simultaneous opposing relative-momentum candidates. Existing active-symbol locks prevent flipping an open alert. Direction-adjusted ranking gives a more negative relative return higher short-side strength, without changing scores into probabilities.

`fixture.ts` searches chronological native January2025 candles for the first real short setup and preserves its exact source prefix and future path. The endpoint/store/runtime tests do not stub a winning candidate or send any provider order.

The ranked scanner prepares only the current candle-close batch. This lets bounded workers persist progress and resume inside a batch instead of recomputing an entire long history before their first checkpoint. Existing profiles retain legacy ordering.

The new mixed-timeframe profiles freeze `observationEnd` in their outcome assumptions. A partial daily/intraday candle cannot prove a stop or target beyond the requested end. A next-open regime exit may use its known open, while insufficient exit evidence stays OPEN. Missing expected entry bars are not silently replaced by later fills. Existing historical reports are retained against their exact source snapshots.

This is an observed-calendar research comparison using the single registry/arbitrator/selection lifecycle. It does not grant publication, account execution or live strategy approval. Range coverage and distinct-family evidence remain separate requirements.
