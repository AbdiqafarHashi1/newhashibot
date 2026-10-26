# Longer-history long/short futures trend screen

27 October 2026. A fixed 4h channel/trailing-exit hypothesis tested whether the earlier short-side problems were simply caused by short holding horizons or limited bear-market coverage. **The whole model failed its direction-specific development gate.** No threshold, asset or direction was selected after seeing the result.

## Genuine source and staged result

72 official Binance USD-M ZIP/CHECKSUM pairs, BTC/ETH, January 2020–December 2022; 13,152 native4h candles. Each monthly archive passed SHA256, interval/close-time/coverage/OHLC admission. Exact ZIP bytes and vendor checksum texts are retained in `source-snapshots.json.gz`.

| Development group | Closed | Net PF | Stressed PF |
|---|---:|---:|---:|
| Both directions, both assets | 193 | 1.209 | 1.111 |
| Long | 114 | 1.482 | 1.351 |
| Short | 79 | 0.937 | 0.869 |

BTC pooled PF1.151; ETH1.257. Neither positive pooled performance nor ETH's nominal short PF1.011 qualifies the short side: ETH short stress PF0.941, BTC short PF0.867. The fixed requirement for positive performance in each direction correctly blocks validation. **No 2023–2024 futures validation archive was acquired.** Previous spot prices for those years were already viewed by this project; no global untouched-data claim is made.

## Fixed rule and accounting

Close breaks previous55 four-hour highs/lows and agrees with EMA200. Next-open entry; initial2ATR14 protective stop, prior20bar opposite channel,3ATR favorable-close trail effective next bar. No fabricated numeric target, no fixed early breakeven or12bar cap. No samebar reentry. Stage-end liquidation at final completed close is declared, rather than reading next-stage prices.

Native perpetual data supports both directions. P&L is signed price change divided by entry (equal initial quote exposure), with 16bp roundtrip fee/spread/slippage reserve plus **3bp adverse funding per commenced8h held**. Stress is1.5 times all reserves. These are declared costs, not actual venue executions or settled funding. No funding credits are assumed. Returns are independent trade outcomes, not account/portfolio or mark-to-market drawdown. Holding-time reserve makes slow short exposure costly; changing it after seeing losses would require a separate disclosed hypothesis or genuine funding evidence.

This Python module is a bounded offline research screen; it does **not** create a new scanner, registered live strategy, signal writer, risk engine or executor. Its conditional channel/trailing exits are not connected to the production signal lifecycle. Shared EMA/ATR math is reused from the prior research module, **not claimed to be active-scanner parity**. It is a HashiBot adaptation motivated by https://arxiv.org/abs/2009.12155 , not an exact paper replication.

The direct futures REST probe returned HTTP451; the official public archive path succeeded. Downloader is resumable,6-thread bounded,20s request timeout,2MB response cap, one attempt per source per invocation. A source failure aborts rather than fabricating completion. Existing stages remain frozen by code/protocol hashes.

## Reproduction

```bash
python3 scripts/research/futures-trend-study.py /path/to/source-cache
python3 -m unittest discover -s tests/research -p 'test_futures_trend*.py'
```

Tests independently calculate long/short P&L and holding reserves, adverse gap fills, causal trails and future invariance; every193 outcome and72 native source snapshots are verified. Publication, execution and promotion remain false. Genuine forward validation NOT_RUN.

Final checks: all32 Python research tests, Phase-L/Release-1 suites, app/focused types, explicit new-file lint and build passed. Source snapshots and all193 directional outcomes are verified; these tests are not performance certification. Current-head remote CI and authenticated visual/forward/provider review remain unverified/NOT_RUN.
