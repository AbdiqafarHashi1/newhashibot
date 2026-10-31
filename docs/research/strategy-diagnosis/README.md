# Fixed strategy diagnosis — 26 October 2026

This is historical DEVELOPMENT diagnosis, not a new untouched validation or permission to sell signals. It replaces speculation about why the strategies fail with a fixed all-results comparison. No production strategy configuration, schedule, message or order was activated.

## Scope and protocol

90 official Binance USD-M archive/checksum pairs provide 262,080 native 15-minute candles across BTC, ETH, BNB, SOL and XRP, January 2025–June 2026. Each asset has 52,416 observations. All dates were already examined during earlier research. The study uses one declared repository-default candidate configuration for each of MicroScalper, QuickScalp, CompressionBreakout and SwingContinuation, then the combined pipeline. These are not claimed to be the current remote database configuration or frozen promoted releases.

The same production registry, qualification, canonical arbitration, indicator and scanner-selection modules evaluate the data. Batches carry active-signal and cooldown state forward; they do not reset trading state each month. A regression compares batched and continuous replay and requires every decision to match. There are 25 baseline cases and 1,309,050 candidate-cycles, not that many independent market observations.

Outcomes use next-open entry, existing signal geometry, 50% TP1, early breakeven, conservative same-bar stop ordering, the strategy's maximum holding period and declared fees/spread/slippage/funding reserves totalling 20.5 basis points. An unresolved final holding period remains OPEN. Metrics are independent signal outcomes; simultaneous scenarios and assets are not portfolio-netted. Funding and fill costs are assumptions, not actual provider execution evidence.

## What the evidence says

The pooled baseline net profit factors are approximately 0.342 MicroScalper, 0.044 QuickScalp, 0.650 CompressionBreakout, 0.640 SwingContinuation and 0.581 combined; use `summary.json` for exact recorded values. Most configurations lack positive gross expectancy. SwingContinuation is near break-even before costs and negative afterward. Increasing leverage cannot repair these observed R-multiple economics.

The exit comparison was explicitly declared **after observing partial baseline results**. It is a disclosed sequential development hypothesis, not a prespecified untouched experiment. It keeps exactly the same selected entries and tests two alternatives: retain the original stop with half TP1, or retain it and exit fully at the final target. Every asset, strategy and alternative is retained. No asset or regime is filtered based on profit.

Removing early breakeven and changing partial exits improves the observed numbers, but every pooled alternative remains negative after declared costs. Full-final-target net PF is approximately 0.606 MicroScalper, 0.512 QuickScalp, 0.713 CompressionBreakout, 0.749 SwingContinuation and 0.716 combined. These are 50 alternative cases on overlapping selections, not independent confirmations. Small positive cells cannot be promoted as new strategies.

The practical conclusion is that cosmetic tuning and risk/leverage changes are insufficient. Entry selection and the economic horizon require further research. The published [time-series momentum research](https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum) studies substantially longer horizons across diversified traditional futures; it motivates investigating slower, cost-aware hypotheses, but does not establish an edge for HashiBot or prove that an intraday crypto adaptation works. No new slower hypothesis is certified by this report.

Native 15-minute Forex and Gold coverage is still missing. This report does not call untested Forex strategies failures or substitute hourly data for missing intraday observations.

## Accounting corrections

The audit found two defects and added 50 independently calculated signed-payoff checks:

- A path shorter than a declared maximum holding period could incorrectly be marked TIMEOUT when `closeAtHorizon` was enabled. It now remains OPEN until an actual stop/target or complete horizon is observed.
- A 100% TP1 exit could remain open after the whole position had been sold. It now closes immediately at TP1.

These corrections do not erase the previous losses: the main older studies used 50% TP1 with complete required future paths. Historical reports remain frozen against their earlier code hashes. The new diagnosis uses the corrected engine. Prior evidence is not silently rewritten as current certification.

## Inspect and reproduce

The existing Backtest Lab's **Calibration** workspace displays the measured table and both exit alternatives. It provides downloads of `baseline.json.gz` and `exits.json.gz`, containing all cases, source hashes, settings, individual outcomes and cash flows. Gzip reduces repetitive generated JSON; it does not remove losing cases. `summary.json` records both compressed and uncompressed SHA-256 hashes. No customer data or secrets are included.

```bash
python3 scripts/research/cost-aware/download.py /tmp/native-crypto
node --import tsx scripts/research/strategy-diagnosis.ts /tmp/native-crypto /tmp/baseline.json
node --import tsx scripts/research/exit-diagnosis.ts /tmp/native-crypto /tmp/baseline.json /tmp/exits.json
node --import tsx scripts/research/export-diagnosis.ts /tmp/baseline.json /tmp/exits.json
npm run test:phase-l
npm run test:phase-m
npm run test:release1
```

Run the same commit for exact source hashes. The exporter refuses changed source or mismatched baseline lineage. The archive tests recompute metrics and reconcile every resolved outcome against cash flows. No raw source dataset is substituted with fixtures.

Real forward profitability, full Forex/Gold coverage, provider orders, Telegram delivery and production activation remain unverified. The research does not justify launching paid signals yet.
