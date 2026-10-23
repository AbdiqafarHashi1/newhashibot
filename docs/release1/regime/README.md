# Smaller regime-aware strategy rebuild — NOT CERTIFIED

23 October 2026, EAT. Implementation and research changes remain in integration PR#269. None promoted, none published, no live trading.

## What changed

Three specialist hypotheses replace the idea that every strategy should trade every condition:

- **Continuation (1h):** volatility-normalized trend and path efficiency, closed 4h agreement, pullback/reclaim or compression expansion, extension and shock rejection.
- **Range rejection (1h):** balanced conditions, prior channel-edge rejection, RSI recovery, room to the opposite boundary, structural protective stop and a cost/risk ceiling.
- **Channel breakout (4h):** accepted 55-bar channel break, closed 12h context and a larger cost/funding reserve.

The classifier rejects stale, missing, gapped, malformed and unfinished bars. Higher-timeframe aggregates require every constituent bar and a completed close. Rule-completeness grade/score is explicitly **not a probability**. The generic qualification and canonical arbitration path are reused in the final benchmark. No paid publication or entitlement gate was weakened.

All three definitions now have lifecycle **DISABLED**, publication mode SHADOW, certification RESEARCH, and enabled=false. Historical counterfactual replay can still reproduce them through the existing approved registry; it does not grant production permission. Existing legacy implementations and Release2 architecture are retained for historical reproducibility, while measured-release gates continue to exclude uncertified strategies.

## Real evidence

Downloaded36 official Binance USD-M archive files (BTCUSDT/ETHUSDT, January2025–June2026), verified their published SHA256 checksums, normalized and admitted26,208 hourly bars, and derived complete4h bars. Exact URLs, raw and normalized hashes appear in [frozen-candidates.json](frozen-candidates.json). Forty-five transitive local source modules are hashed before any validation/holdout evaluation.

The table describes independent pooled signal outcomes across the two instruments, not concurrent portfolio performance. PF uses net trade P/L after modeled costs. Every per-instrument and regime metric—including sample/trade counts, win rate, expectancy, modeled net return and realized drawdown—is in [development-final.json](development-final.json) and [development-metrics.csv](development-metrics.csv).

| Strategy | Variant | Trades | Win rate | Net PF | Expectancy R |
|---|---|---:|---:|---:|---:|
| continuation | base | 412 | 36.7% | 0.676 | -0.225 |
| continuation | wider | 378 | 39.7% | 0.765 | -0.150 |
| continuation | shorter | 431 | 34.3% | 0.664 | -0.218 |
| range-rejection | base | 87 | 33.3% | 0.501 | -0.377 |
| range-rejection | wider | 90 | 36.7% | 0.617 | -0.268 |
| range-rejection | shorter | 85 | 29.4% | 0.513 | -0.337 |
| channel-breakout | base | 50 | 38.0% | 0.643 | -0.229 |
| channel-breakout | wider | 50 | 38.0% | 0.649 | -0.224 |
| channel-breakout | shorter | 50 | 32.0% | 0.633 | -0.237 |

These losses reject the candidates at development. Validation and holdout were deliberately **not run or downloaded** for them. No rejected candidate is being rescued by searching the untouched period.

A prior range prototype produced BTC-only PF1.67 on14 trades; ETH lost money and the combined sample was26. That exploratory cell is retained in [development-hourly.json](development-hourly.json), not promoted, not independent evidence, and not a reason to sell signals.

## Assumptions and exposure ledger

Next-open market entry; one active signal per symbol within each independent scenario; stop-first ambiguity; 50% TP1/final exits; static protective stop after TP1; no leverage optimization; no positions extending beyond the split boundary;48-bar maximum holding period. Costs are20.5bps for1h models (10 fees+2 spread+4 slippage+4.5 funding reserve),40bps for4h (same fees/spread/slippage+24 funding reserve). These reserves are assumptions, not actual historical funding or executable book evidence. The pipeline supports1.5x cost stress before historical acceptance.

- Six initial exploratory evaluations raced incomplete downloads (28/36 archives). They are explicitly invalid as a full-period selection and preserved in [exploratory-v1-incomplete-development.json](exploratory-v1-incomplete-development.json). No validation was examined.
- Six full-period initial hourly evaluations followed, then three4h and three earlier-entry range variants. Negative evidence is retained in development-hourly/four-hour/fast-range JSON files. These are exploratory snapshots of earlier source versions, not current-engine certification.
- Nine final configurations were rerun against the current canonical qualification/arbitration path. Total development evaluations:27; complete-period evaluations:21; final current-engine cases:9. This is disclosed multiple testing, not27 independent discoveries.
- Parameters and engine hashes are frozen before later stages. Development requires>=30 resolved trades, PF>=1.2, positive net expectancy, drawdown<=10% at0.5%/trade and positive expectancy on each instrument. Validation additionally requires cost-stress survival and a positive lower block-bootstrap expectancy bound. One-use holdout requires a passing validation manifest; consumption is recorded before performance is computed. Passing historical screens would still require forward observation and the canonical measured-release authority.

No new independent Bybit, Forex or Gold result is inferred from these tests. Two direct Dukascopy availability probes (monthly bars and documented hourly ticks) returned HTTP503; no failed response was treated as price data. Existing Forex results still use indicative data. Reliable broker/cost history and new strategy hypotheses remain research work, not missing-credential fixes.

## Reproduce safely

```sh
python3 scripts/release1/regime/download-binance.py --phase development --output work/regime/development
node --import tsx scripts/release1/regime/certify.ts develop work/regime/development work/regime/development.json work/regime/frozen.json
npm run test:release1
```

Never overwrite the checked-in research manifest casually after viewing later data. The current frozen manifest denies validation because development failed, and denies holdout acquisition without approved validation. Tests confirm these refusals occur before loading missing validation data or requesting held-out prices. Source downloads are read-only and never contact trading/payment APIs.

Primary references: [official Binance archive schema/checksums](https://github.com/binance/binance-public-data); [time-series momentum research](https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum), which concerns much longer horizons and does **not** validate these intraday implementations.

## Verdict

**NOT CERTIFIED / NOT READY FOR PAID SIGNAL ACTIVATION.** The code for this research iteration is implemented and tested. The requested profitable, shippable strategy has not been established. Better classification alone did not create an edge, and the failed candidates stay disabled.
