# Published-research-inspired BTC/ETH tests — 27 October 2026

These are new hypotheses, **not altcoin transfers or exact paper replications**. All six prespecified cases are retained. Full source access was not available for every paper, so parameter choices here are explicitly HashiBot adaptations, not claims that we reproduced the authors' methods or returns.

Primary research reviewed:

- [Shen, Urquhart & Wang, Bitcoin intraday time series momentum](https://research.birmingham.ac.uk/en/publications/bitcoin-intraday-time-series-momentum/): describes intraday predictability conditioned on market trading time/volume. The accepted manuscript access was denied; our causal volume clock and filters are independent specifications.
- [Xue & Zhou, Diagnostic expectations and cryptocurrency returns](https://www.sciencedirect.com/science/article/pii/S0165188926001612): publisher-indexed abstract describes hourly reversal and expectations-based overshooting. Full text returned403. Our extreme-move/flow rule is not the published regression or exact strategy.
- [Cao, Zhai & Luo, Anatomy of cryptocurrency perpetual futures returns](https://www.research.ed.ac.uk/en/publications/anatomy-of-cryptocurrency-perpetual-futures-returns/): identifies basis/price-volume information in perpetual returns. It does not validate our funding-price-disagreement direction rule.

## Six fixed cases

| Hypothesis | BTC resolved / net PF | ETH resolved / net PF |
|---|---|---|
| Volume-clock momentum | 61 /0.361 | 107 /0.412 |
| Filtered hourly overreaction | 0 /undefined | 0 /undefined |
| Funding-price disagreement | 31 /0.474 | 23 /0.517 |

No candidate qualified. **Zero overreaction signals is inconclusive**, not proof that the paper's hourly-reversal finding is false. Every filter was fixed before this experiment's returns were computed. They were not loosened after seeing zero signals.

36 existing official Binance USD-M candle archives and36 newly acquired official funding archives were SHA256-verified against their vendor CHECKSUM files. This supplies104,832 genuine15m candles and3,276 actual funding records. Native calculation times, rates and intervals are preserved; non8h observations are not rescaled. Funding rules require90 causally earlier8h records, interval continuity and explicit calendar lookback. Original raw archives/manifests are reproducible via the acquisition script.

Volume clock is selected from mean volume over the preceding30 completed UTC dates, never return rankings. First-session features are known before the last30min entry. Overreaction uses previous-hour returns, native executed taker volume and prior240-hour distributions. Funding signals use an archived settled record at the first15m boundary after its calculation time. This assumes availability by that boundary; **archive calculation time is not verified API first-observation time**, so actual live dissemination latency remains untested.

All candidates use110 closed native15m candles, research WilderATR14 stop2ATR/target4ATR, next-open entry, conservative collision handling, the existing canonical arbitrator/outcome engine and fixed2/4/12-bar horizons. This is entry-feasibility research, **not full active-scanner registry/selection-policy parity**. The active TypeScript ATR uses trailing-simple-average smoothing; this research explicitly uses the separately requested Wilder smoothing, so no parity claim is made.

Declared costs are19bps round trip (10 fees,2 spread,4 slippage,3 funding reserve), stressed1.5x with identical entries and paths. Actual funding data is an input feature; its historical payments are **not** presented as simulated fills/carry P&L. Reserve costs are not observed venue executions. Independent outcomes can overlap across experiments and assets; no portfolio/account/Prop performance is implied.

ETH session momentum has gross PF1.144 but net PF0.412. Its R-weighted break-even flat cost is only2.49bps under these assumptions. BTC's corresponding break-even is0.03bps. These diagnostics explain cost sensitivity; they do not authorize lower fictional fees. Funding variants lose even before costs. Sources, rejection counts, all candidates/outcomes, cash flows and code hashes remain in `evidence.json.gz`; `summary.json` supplies metrics and archive hashes.

## Unfiltered hourly diagnostic

After the filtered rule produced zero candidates, a **separately disclosed descriptive diagnostic** was specified in `hourly-reversal-diagnostic-protocol.json`. It uses all26,206 paired hourly observations, without ATR/volume/flow filters. The next-hour fade sign is fixed, not fitted to the regression. Flat lag returns have zero exposure/fees. See `../hourly-reversal-diagnostic/` for the complete paired rows.

| Asset | Lag-return coefficient | Newey-West lag4 t diagnostic | Fade gross PF | Fade net PF |
|---|---:|---:|---:|---:|
| BTC | -0.0108 | -0.687 | 1.005 | 0.307 |
| ETH | 0.0144 | 1.148 | 0.956 | 0.430 |

These estimates do not establish economically tradeable hourly reversal here. This is descriptive reused-development analysis, not a fitted out-of-sample model, canonical strategy, or a contradiction of all other studies/markets. Normal t diagnostics are approximate and not a correction for the wider strategy search history.

Reproduce:

```bash
python3 scripts/research/download-native-funding.py /path/native-funding
node --import tsx scripts/research/literature-btc-eth-study.ts /path/native-crypto /path/native-funding
python3 scripts/research/hourly-reversal-diagnostic.py /path/native-crypto
node --import tsx tests/phaseL/literatureResearch.test.ts
node --import tsx tests/phaseL/literatureEvidence.test.ts
```

All prices were previously examined development dates; funding acquisition does not make the candle interval untouched. No failed hypothesis was promoted, no July–September rescue test or October acquisition performed, and the earlier positive altcoin evidence remains unchanged. No orders, external messages, SQL, schedules, deployment or live activation.

`funding-snapshots.json.gz` preserves all36 original funding ZIP archives, vendor CHECKSUM text, normalized native records and manifests. It contains no credentials. The report's444 resolved base/stress cash flows and the diagnostic's26,206 paired hourly rows are independently reconciled by retained tests. The separate daily spot study is documented under `../spot-swing/`; its inputs and exit model must not be confused with these intraday futures cases.
