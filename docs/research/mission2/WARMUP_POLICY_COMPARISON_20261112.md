# Warm-up and entry-policy comparison — 12 November 2026

Completed diagnostic replay of 17–24 February 2025. This period was already observed; it is not a new untouched holdout. Ten native Binance spot symbols, January–February history, $1,000 initial capital and 0.5% stop-distance sizing risk. Fees, spread and slippage use the documented scenario profile. No strategy parameters or production risk limits were changed.

| Entry policy | Confirmed signals | Authorized entries | Closed | Equity return | Profit factor | Conservative drawdown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| COMBINED | 78 | 29 | 26 | -2.477% | 0.549 | 4.976% |
| IMMEDIATE_ONLY | 86 | 30 | 28 | -2.649% | 0.568 | 3.979% |
| CONDITIONAL_ONLY | 2 | 0 | 0 | 0.000% | undefined | 0.000% |

## Findings

- Combined and immediate-only portfolios lost after costs in this week. More immediate entries did not establish a positive edge.
- Conditional-only produced two confirmed signals and no authorized spot entries. A zero return here means no account trades occurred; it is not a profitable strategy result. Inspect the actual account rejection reasons before interpreting inactivity.
- The immediate-only account rejected 43 short setups because this is long-only spot. Of the remaining account policy blocks, seven identify the position-count rule and six identify insufficient margin. The legacy LOW_CONFIDENCE code must not be interpreted as six confidence-filter rejections.
- Both Binance and Bybit account policies were replayed separately. Identical results under this scenario do not provide native Bybit historical fill evidence: both policies see the same Binance spot candles and hypothetical specifications.
- Additional history resolves the declared 4h warm-up deficiency for this cohort, but it does not supply the longer daily history required by daily strategies. The combined headline metrics remain the same as the earlier provisional February screen.

## Concrete strategy work still required

1. Inspect each conditional strategy’s admitted watches, original trigger, invalidation and expiry against the stored candle sequence; distinguish a never-touched trigger from a later failed confirmation.
2. Use the selected-study gross/net and exit breakdown to isolate entry losses versus fee drag; predeclare one bounded strategy change before testing it.
3. Replay long and short execution against native derivatives history separately from spot; retain actual margin and position-rule diagnostics.
4. Test longer independent periods and adverse costs. These three overlapping policy portfolios are not three independent market samples.
5. Obtain genuine broker Forex/Gold and native Bybit execution data, then complete hosted full-account worker jobs and the connected demo/payment/Telegram journeys.

## Reproduction and provenance

Shared engine/runner SHA-256: `8610af4f18e34220bedf32e580b2ccee1bb00701f9061081c8f1df7e9d70ce36`.

Thirty cached archives were verified byte-for-byte and decoded against their ZIP contents; this cohort uses the twenty January/February archives. Integrity metadata is in `DATA_INTEGRITY_20261112.json`. Source manifests and assumptions are retained in the compact published studies. Raw market archives and restart ledgers are not shipped to the website.

```sh
node --import tsx scripts/research/run-frequency-audit.ts symbols=BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,LINKUSDT,AVAXUSDT,LTCUSDT months=2025-01,2025-02 start=2025-02-17T00:00:00Z end=2025-02-24T00:00:00Z entry=COMBINED partition=OBSERVED_WARMUP_DIAGNOSTIC providers=BINANCE,BYBIT data=.tmp/mission2/data out=.tmp/mission2/current-validation-combined.json
```

Repeat with `entry=IMMEDIATE_ONLY` and `entry=CONDITIONAL_ONLY`, keeping all other inputs fixed and using distinct output paths. No publication, broker credentials, orders or strategy promotion is authorized by research.
