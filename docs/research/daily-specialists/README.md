# Additional crypto research — 28 October 2026

**Release 1 remains unqualified. No new live strategy, release promotion, migration, deployment, schedule, message or provider order.** This pass tested four new fixed daily spot hypotheses and a predeclared six-asset extension of the previously positive slow EMA model. Every failure is retained. No parameter grid, losing-asset deletion or threshold reduction followed the results.

## What changed in the decision

The original BTC/ETH EMA20/50 long-or-cash model remains a useful lead. Its dynamic daily regime/trailing exit must not be replaced by an arbitrary fixed TP just to satisfy the scanner's existing numerical target contract. The fixed-bracket adaptation below demonstrates that mismatch: it passed older development/validation and failed the later check. **It was not enabled.**

| Original two-asset model | Closed trades | Net PF | Stress PF |
|---|---:|---:|---:|
| 2018–2021 development |58|2.7222|2.6753|
| 2022–2024 validation |46|1.9950|1.9241|
| Jan 2025–Sep 2026 corroboration |25|1.9060|1.8278|

The original 50-outcome validation requirement still failed at46; this report does not retrospectively change that gate, silently combine stages to declare a pass, or treat25 later observations as abundant independent evidence. Its original BTC/ETH scope existed before the later six-asset extension; the table is not created by removing that extension's losers. The two assets and their trades remain correlated. Six-asset screening is reported in full below.

These are pooled equal-notional closed trade returns, **not** portfolio/account returns, mark-to-market drawdown or demonstrated provider fills. Older stage-end liquidation is explicitly virtual and retained from the original model. The actual instrument is SPOT: no shorts, leverage, borrow fees or perpetual funding are invented. Base costs26bps, stressed39bps are declared reserves, not observed fills.

## Four fixed additional hypotheses

Three were frozen together before evaluation: bull-market RSI2 dip, rejected Bollinger selloff, and55-day breakout. The fourth is a separately disclosed later adaptation of the previously positive EMA model to a numerical bracket; it is not hidden as part of the original three.

| Hypothesis | Development closed / net PF | Validation closed / net PF | Later check |
|---|---|---|---|
| Bull RSI2 dip |54 /1.553|46 /0.568|Blocked after validation failure |
| Rejected selloff |21 /1.453|Blocked: development sample/asset failure|Blocked |
| Slow55-day breakout |41 /2.713|27 /1.833|Blocked: validation sample failure |
| EMA20/50 +2ATR stop/6ATR target/30-day cap |75 /2.630|51 /1.621|26 /0.990, stress0.964; rejected |

The bracket model's recent dates were frozen before acquiring those actual SPOT daily responses. Equivalent calendar futures prices had already been researched extensively. This is chronological new-instrument corroboration, **not project-wide untouched holdout**. Earlier calendars were previously observed in other hypotheses. All trials are exploratory and subject to multiple-testing/selection bias; a new rule's nominal chronological split does not erase project history.

All bracket arithmetic uses actual next-open entry, signed entry-to-original-stop risk, explicit costs, stop-first collisions, gap rejection, full target, no BE/partial/trailing, and the declared maximum holding period. Insufficient end-of-stage horizons remain OPEN. No same-bar reentry. The fixed-bracket candidate is not equivalent to the original trailing model and its numbers must not be attached to that model.

## Does more asset coverage solve it?

The unchanged original EMA model was checked across a **predeclared** BTC/ETH/BNB/SOL/XRP/LINK scope. Liquid contemporary assets are a disclosed survivorship-biased universe, not historical point-in-time selection.

| Six-asset scope | Closed trades | Net PF | Stress PF | Screen |
|---|---:|---:|---:|---|
| 2018–2021 |154|2.8409|2.8005|Passed this research screen |
| 2022–2024 |150|1.8860|1.8377|Passed this research screen |
| Jan 2025–Sep 2026 |81|1.0365|1.0071|Failed PF and asset evidence |

Recent net PF by asset: BTC1.156,ETH2.657,BNB2.172,SOL0.797,XRP0.378,LINK1.031. SOL and XRP remain included. **The broader scope was rejected; no automatic watchlist expansion.** The recent small margin would be particularly vulnerable to higher costs and different fills. More symbols cannot be assumed to improve quality or guarantee one alert per day.

## Data, checks and reproducibility

Official public Binance market-data-only HTTPS GET responses are retained in `watchlist-source-responses.json.gz`, with origin URLs and SHA256 in the full evidence. These REST sources do not have vendor ZIP checksums and are not described as checksummed archives. Acquisition is bounded to4pages per asset/stage,1000rows/page,25-second timeout,2MB/body, three concurrent public reads. No account credentials or trade API.

Initial prelisting gaps are disclosed; later cadence gaps fail admission. The early2018 nonstandard close prefix is retained raw and excluded structurally, with indicator warmup restarted. No candle is repaired. New daily-specialist rules require250bars; the explicitly referenced original EMA model uses its unchanged200bar warmup. A free-text250/200 inconsistency in the new watchlist protocol's source paragraph was corrected to match the referenced original model; rerun from the same cache produced identical trades and metrics. No trading parameter changed.

Frozen source hashes guard every final study; future shared-code work must preserve snapshots or create a new study rather than relabel past evidence. The source responses cover all new studies' underlying BTC/ETH data as well as the wider watchlist. **385 six-asset scenario trades** are retained; other overlapping hypothesis trades must not be added as independent market observations.

```sh
python3 scripts/research/daily-specialists/study.py /path/spot-daily
python3 scripts/research/daily-specialists/ema-bracket.py /path/spot-daily
python3 scripts/research/daily-specialists/recent.py /path/spot-daily
python3 scripts/research/daily-specialists/watchlist.py /path/spot-watchlist
python3 -m unittest discover -s tests/research -p 'test_daily_specialists.py' -v
```

Final local checks:43 Python research tests, application typecheck, production build and explicit lint for the two affected UI modules passed. Published-head CI is checked separately; no full remote verification claim.

Tests independently reconcile341 bracket outcome calculations and385 original-trend trade calculations, reproduce pooled/per-asset metrics, verify raw source hashes, retain losing assets, enforce blocked failed stages, and test RSI oracles and future-prefix invariance. These are offline tests, not deployed Auth/PostgREST/RLS/concurrency or genuine forward evidence. No browser visual review was performed in this pass.

## Operator access and unresolved implementation

Backtest Lab → Calibration now exposes the positive two-asset lead, the failed broader scope, the rejected bracket comparison and complete downloadable trade evidence. Existing four-role replay/private paper controls are preserved. This read-only evidence panel does not claim the new model is already runnable through the fixed-target scanner.

**Concrete gap:** the original profitable historical model's target-free, daily regime/trailing lifecycle is not connected to the canonical scanner/replay/Telegram tracking contract. No dummy TP, fabricated RR or alternate production signal writer was introduced to conceal that gap. It needs an explicit versioned lifecycle, full-path parity, fresh paper observation and release review. Existing four-role definitions remain disabled. Research evidence alone does not complete Release1, and Release2 live execution remains disabled.

Primary motivation: [Liu/Tsyvinski, Risks and Returns of Cryptocurrency](https://www.nber.org/papers/w24877) discusses cryptocurrency momentum; [AQR, Time Series Momentum](https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum) concerns longer-horizon momentum. Those findings motivate hypotheses, not a guarantee for HashiBot. [Official Binance market-data-only API](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md) supplies public price history. Existing original slow-spot research links its separate trend-following paper and explicitly distinguishes its own rule adaptations from paper replication.
