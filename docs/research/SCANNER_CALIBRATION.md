# Scanner calibration and market-policy research — 18 October 2026

**Result: REJECTED_NOT_FOR_PROMOTION. No strategy parameters or adaptive policy were enabled or deployed.**

The completed offline campaign uses 36 checksum-verified Binance USDT perpetual futures datasets: BTCUSDT and ETHUSDT, 15-minute and hourly bars, 64,800 source candles in total. All four crypto production evaluators were tested: MicroScalper, QuickScalp, CompressionBreakout and SwingContinuation. Unsupported strategy/timeframe combinations remain excluded. Forex and 5-minute performance are not certified by this campaign.

## Method

Development: January, June, September and December 2023. Validation: February and April 2024. Frozen holdout: August and November 2025, February 2026. These are sampled months, not a contiguous portfolio history or prospective demo results. The protocol was written before reading new strategy outcomes. The original protocol prose says 200 warmup bars; implementation used 110 closed trailing bars from the beginning of development to match production. That deviation is explicitly retained in the result rather than rewriting the original protocol hash.

Twelve fixed development trials: base/balanced/wide protection parameters × original/+6 confidence thresholds × existing/adaptive arbitration. All strategy parameter values are in the report. The six nonadaptive trials are controls; only the six adaptive trials were eligible for the requested adaptive candidate. Selection uses development expectancy with at least 30 resolved trades. The selected candidate was serialized and SHA-256 hashed before validation/holdout evaluation. No retuning followed either held-out result. All twelve development trials lost after costs. The best nonadaptive control also lost (profit factor 0.687); the selected adaptive candidate did not outperform it on development (0.655). Adaptation is not presumed to improve returns.

The shared pipeline now reuses production market-context scoring, role/identity/freshness weighting, qualification, no-trade rules, MicroScalper runtime overrides and the root arbitrator. Earlier replay used confidence alone; those earlier results were not full scanner parity. Crypto production now requests 111 source bars and retains up to 110 admitted closed bars, matching the campaign's rolling window. The same window is used by server replay, multi-dataset replay and the command-line replay runner. Single-dataset runs retain their explicitly disclosed independent-signal accounting; the campaign enforces one active signal per symbol across both timeframes.

Hourly outcomes resolve against real 15-minute observations, not interpolated paths. TP1 uses 50% quantity; the runner uses breakeven and conservative same-candle TP1/BE ordering. Holding-limit and final-dataset exits close remaining quantity at the observed close. All trades resolve; timeouts and overlapping candidates are not quietly omitted. Same-time cross-timeframe candidates rank by the shared score, with stable candidate IDs breaking ties. Capacity is not reused until an exit bar has closed.

Base modeled round-trip costs: 10 bps fees, 2 bps spread, 4 bps slippage and a 4 bps funding reserve. Stress doubles all four. Funding is a reserve, not recovered exchange funding history. Results use fixed R units and do not simulate compounded equity, margin, multi-asset portfolio correlation or per-customer Phase-D sizing.

## Frozen candidate results

Candidate: `calibration-wide-score0-adaptive`.

| Split | Resolved trades | Net expectancy | Profit factor |
|---|---:|---:|---:|
| Development | 373 | -0.2219R | 0.6553 |
| Validation | 182 | -0.1469R | 0.7560 |
| Holdout | 270 | -0.2719R | 0.5564 |
| Holdout, doubled costs | 270 | -0.4497R | 0.3971 |

The promotion gate requires at least 30 resolved validation and holdout trades, profit factor >= 1.10, expectancy >= 0.02R in both, and positive stressed holdout returns. This candidate failed. Regime and per-strategy breakdowns, every development trial, complete configuration and dataset source hashes are in `SCANNER_CALIBRATION_2026-10-18.json`. `SCANNER_FROZEN_CANDIDATE_2026-10-18.json` records the pre-validation selection hash.

## Market-aware implementation

A shared trailing-data observer measures path efficiency, trend spread in ATR units, relative ATR against earlier true ranges, and current-bar shock size. It distinguishes up/down trends, compression, range, transition and shocks. Candidate gates abstain on invalid evidence/shocks and reject unsuitable continuation or countertrend candidates. Existing scoring also accounts for expansion, overextension, liquidity, pullback/reclaim quality and strategy role. Classification is scale-normalized and never uses future bars.

These new candidate gates are **opt-in**, not activated by this losing study. Research passes an explicit adaptive-policy flag. Production requires the owner's strategy configuration marker `params.market_adaptation_enabled = 1`; otherwise it retains the existing production policy. Failed campaign output never sets that marker. All decisions retain market-policy version and context evidence, including NO_TRADE. An owner can inspect the logic and failed results without silently changing customer trading behavior.

For 5-minute MicroScalper, runtime higher-timeframe confirmation now admits only 15-minute candles closed at the decision boundary. Replay derives 15-minute context only from complete aligned groups of three genuine closed 5-minute bars. Missing groups are dropped, never filled. This wiring has causal/gap tests, but real 5-minute performance needs its own declared calibration campaign. Forex needs real MT5 broker history and remains uncalibrated by these crypto results.

## Reproduce

```sh
python3 scripts/research/prepare-calibration.py --output .tmp/scanner-calibration
node --import tsx scripts/research/calibrate-scanner.ts .tmp/scanner-calibration .tmp/scanner-calibration/results.json
```

The preparation command downloads official public archives and verifies published SHA-256 checksums. No Supabase, API credentials, payments, messaging or trade execution is involved. Reproduction of the already reported holdout is deterministic verification, not a new untouched holdout. Further strategy research must reserve new unseen periods before attempting another promotion.
