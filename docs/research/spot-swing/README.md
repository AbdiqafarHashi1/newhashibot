# BTC/ETH long-or-cash swing research — 27 October 2026

**Positive historical research leads, not certified live strategies.** Actual instrument is SPOT. No shorts, funding, leverage, forced intraday exits or claimed perp execution. Unsupported markets are cash/no-entry, not guaranteed bear-market profits.

Primary motivation: [Rozario et al., A Decade of Evidence of Trend Following Investing in Cryptocurrencies](https://arxiv.org/abs/2009.12155), and [the authors' public code](https://github.com/Globe-Research/bittrends). Their paper concerns trend following; the exact fixed channel/EMA/ATR rules here are HashiBot adaptations, not replication of its headline returns. Source family is different from short-horizon futures scalp tests.

## Declared before acquisition

Two models, both on BTC and ETH:

- **Channel20/10:** completed daily close breaks previous20 daily highs above EMA200. Next-open long entry; prior10-day low and protective/trailing stop govern exit.
- **EMA20/50:** EMA20>EMA50 and close>EMA200 permit next-open long entry. Next-open exit after trend/regime loss, or protective/trailing stop. Reentry requires a later daily signal after exit.

Initial2WilderATR14 protection;3ATR trail from previously completed closes; no retrospective same-bar trail. **No fixed TP or12-bar cap**: this is a separately declared swing research profile, not a silent change to the Python framework or existing scanner. Equal-notional trade returns deduct26bps round trip (20 spot fees,2 spread,4 slippage), stressed39bps. No funding because these are actual spot data. These reserves are not measured fills.

Calendar stages and frequency-specific **research** gates were fixed in `spot-swing-protocol.json`:2018–2021 development;2022–2024 validation; later2025–June2026 is explicitly reused diagnostic data. Each stage starts flat with causally earlier history as warmup, and has a declared virtual stage-end liquidation at the last close, with modeled costs. No next-stage open is read to liquidate the preceding stage.

Development requires30 pooled trades, positive asset evidence and net PF>=1.2. Validation requires50 pooled trades, at least10 per asset, positive asset means and stressed mean. Only successful earlier stages may acquire/evaluate later stages. These are research admission checks, **not** replacements for release/forward-certification gates. No global project-wide untouched claim is made.

## Actual results

| Model | Development closed | Development net PF | Validation closed | Validation net PF | Validation stress PF |
|---|---:|---:|---:|---:|---:|
| Channel20/10 | 39 | 2.733 | 30 | 1.683 | 1.633 |
| EMA20/50 regime | 58 | 2.722 | 46 | 1.995 | 1.924 |

| Validation model | Asset | Closed trades | Net PF | Stress PF |
|---|---|---:|---:|---:|
| Channel | BTC | 17 | 1.952 | 1.896 |
| Channel | ETH | 13 | 1.332 | 1.290 |
| EMA | BTC | 23 | 2.527 | 2.441 |
| EMA | ETH | 23 | 1.442 | 1.387 |

Both fail the **50-trade validation sample** requirement. Do not combine overlapping models'30+46 outcomes to manufacture76 independent observations. The later diagnostic stage remains **BLOCKED_PREVIOUS_STAGE** and its spot data was not fetched. Do not say four more trades will necessarily qualify the EMA model: new losses could alter its metrics. The slow sample cannot be replaced by synthetic fixtures or counted mark-to-market days.

## Data quality and reproducibility

Official public Binance SPOT daily REST responses are retained with URL, row count and raw SHA256. They are authenticated-origin HTTPS responses, **not vendor-checksummed archives**. Source counts, ordering, UTC cadence, OHLCV and native close times are validated. REST acquisition is capped at8 pages per asset/stage; no credentials or trade endpoint is used.

`source-snapshots.json.gz` preserves all8 exact REST response bodies (5,114 native daily rows before warmup exclusions), URLs and SHA256 so the research is recoverable even if vendor history is later revised. The source bundle is not a claim that every raw bar was admitted: early nonstandard closes and warmup reset remain explicit.

An early2018 native response had a nonstandard close timestamp during indicator warmup. Its raw data was retained; the prefix through that record was explicitly excluded and indicator warmup restarted. No candle was repaired or filled. A nonstandard close after the initial warmup or in later stages blocks the experiment. This exclusion was based on source structure, not P&L. See source metadata `nonstandardCloses`/`warmupResetAfter`.

One NumPy bar-count value initially prevented JSON serialization. Its cast was corrected, and exit evidence now distinguishes candle identity from when an intraday outcome becomes known (bar close). These output-bookkeeping corrections produced **identical complete logged metrics** for every stage/model on rerun from cached native responses; no trading parameter or decision changed. Protocol/hash freeze is checked before each new stage; source metadata and trades remain in `evidence.json.gz`.

```bash
python3 scripts/research/spot-swing-study.py /path/spot-daily-cache
python3 -m unittest discover -s tests/research -p 'test_spot_swing.py' -v
```

## What remains

This is an independent research simulator for a **long/cash daily exit policy**, not current scanner parity or account execution. Existing entry payloads require numeric targets; these models use trend/trailing exits, so inserting an arbitrary fixed TP would invalidate the tested rules. Integration must explicitly model that lifecycle through the sole canonical signal/publication authority, with parity and release review. Nothing is registered live here.

Reported PF uses equal-notional completed trade returns, not mark-to-market portfolio equity. No account capital, drawdown/Prop pass, independent venue fill, live latency or forward profitability conclusion is claimed. BTC/ETH and the two trend models are correlated. Low trade counts, changing regimes, stage-boundary effects and heavy-tailed winners remain material limitations. No strategy is established for every condition or rolling window.

Posthoc risk diagnostics are retained separately in `risk-diagnostics.json`, tied to the exact evidence hash and never used to tune rules. Both models had two losing closed trades in2022. Channel validation PF was2.391 in2023 and1.659 in2024; EMA1.177 and3.012 respectively. Minimum rolling10-closed-outcome PF was0.775 for Channel and0 for EMA. Thus **neither consistently holds rolling PF above1**. These are realized-trade diagnostics, not annual mark-to-market account returns; cross-asset observations and model cases are correlated.

Positive development and validation are genuine progress beyond the failed intraday variants, but **not launch approval**. Remaining: adequate independent evidence, live-equivalent lifecycle/engine parity, portfolio/concentration risk, venue costs and forward observation. Existing altcoin evidence/release gates remain intact. No deployment, SQL, schedules, Telegram messages, payments or provider orders.

Verification includes indicator/payoff oracles, no-retroactive/future-data mutation tests, stage-gated acquisition tests, source-anomaly handling and independent trade arithmetic. Tests retain173 scenario trades across development/validation/models (not173 independent market trades), and verify the blocked later stage. Real provider fills, full scanner lifecycle parity and new-head visual review remain NOT_RUN.
