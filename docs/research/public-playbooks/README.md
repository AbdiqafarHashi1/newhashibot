# Public playbook research — 28 October 2026

**Four complementary qualifying strategies: NOT ACHIEVED. No promotion or deployment.**

This is new source-first research, not a replay of the old four-role ensemble. It adds native five-minute data, actual historical funding, separately labelled source-reference and protected versions, stop-entry and resting-limit diagnostics, and reproducible accounting tests. It does not replace the production scanner, arbitrator, signal truth or account routing. No external order or Telegram send occurs.

## Sources and fidelity

| First-person / primary source | Implemented diagnostic | Material differences / limits |
|---|---|---|
| [Reddit thread supplied by owner](https://www.reddit.com/r/Daytrading/comments/1izfkaw/) | EMA100 directional bias and previous-day sweep operationalizations | NQ/stocks are not crypto. Five-minute crypto cannot replicate the comment's one-minute NQ opening-range retest. Undefined confirmation, stops and exits require explicit choices. |
| [OANDA VWAP explanation](https://ftmo.oanda.com/blog/vwap-pullback-strategy-trade-with-volume-not-emotion/) | Deviation extension followed by VWAP pullback | Two deviations, session anchor and rearm are chosen quantifications. Hybrid uses the crypto source's ATR-stop / 2R alternative. Not an exact original-source implementation. |
| [Crypto playbook](https://obside.com/trading-guides/day-trading-crypto) | UTC opening range, VWAP, RSI2/H4 bias, quiet-range bands | ORB omits the source's 24-hour/30-day volume exclusion; full exit replaces unspecified runner. RSI timeframe unspecified: five-, fifteen-, thirty- and sixty-minute versions reported separately. Other assets extend the BTC example. Funding-contrarian setup not implemented. |
| [Alpaca article and code](https://alpaca.markets/learn/algo-trading-bitcoin-using-bollinger-bands-and-rsi) | Hourly BB20/2 + RSI14: intended Wilder, intended SMA and as-written SMA | Original code repeats entry condition in its sell branch. Pin in `source-code-pin.json`. Binance USD-M replaces Alpaca BTCUSD spot; recursive seeds differ from library initialization. No invented SL/TP in these references; they cannot be promoted as protected alerts. |
| [Linda Raschke author-hosted interview](https://lindaraschke.net/wp-content/uploads/2026/03/raschke_pt2_0304.pdf) | ADX14>30, first EMA20 pullback, stop-entry, structural stop, prior extreme target, confirmed-pivot trail | Tested 15m/30m/1h/4h. Rising ADX, pivot definition and one-source-bar order expiry are quantified interpretations, not proof of discretionary performance. |
| [TradingView author description](https://www.tradingview.com/script/75epRRh2-VWAP-ORB-Pullback-Strategy/) | Inventory only | Complete source/defaults unavailable; no exact replication claimed. |
| [Original Turtles participant site](https://www.tradingblox.com/originalturtles/originalturtlerules.htm) | Inventory only | Full PDF download returned HTTP 403. Full rules were not read or replicated. |
| [MQL5 Turtle implementation](https://www.mql5.com/en/articles/23448) | Source review only | Prose/code sizing and skipped-winner tracking need further verification. No runtime conclusion or replicated performance. |
| [FMZ ZVWAP](https://www.fmz.com/lang/en/strategy/431669), [volume breakout](https://www.fmz.com/lang/en/strategy/436608), [scalper](https://www.fmz.com/lang/en/strategy/494817) | Inventory only | Full source gated. Summary conflicts/very small targets are concerns, not full-code test results. No access restrictions bypassed. |

Eight mathematical families were examined; parameter/timeframe/execution variants are **not** counted as independent strategies. Anecdotes, promotional win rates and screenshots are not imported as evidence. Dark pools, Level 2, stock halts, options gamma and news catalysts cannot be inferred from candles.

## Data and accounting

Five assets: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT. January 2025 through September 2026: **210 vendor-checksummed monthly archives, 918,720 native five-minute candles, 9,570 historical funding records**. Each asset has 183,744 continuous candles and 1,914 funding settlements. Local ZIPs, vendor checksums, normalized JSON and manifests are preserved; committed evidence carries source URLs and hashes. Acquisition is bounded and restart-safe.

February–December 2025 is development; January–June 2026 validation; July–September 2026 later evaluation. January provides warmup. These calendar periods were already seen in prior research: **no untouched project-wide holdout claim**. Every declared variant and all five assets are retained. No post-validation asset pruning.

Market-entry base friction is 16 bps round trip, stress 24 bps, plus historical funding. These are modeled fees/spread/slippage, not verified account charges. Settlement notional uses native candle-open price, not exchange mark price. Uncertain funding-boundary payments are included; uncertain income is not credited. Stress multiplies adverse funding by 1.5, not credits.

Entries use future bars after the decision. Same-bar SL/TP ambiguity resolves stop first. Open positions remain OPEN and are disclosed separately, never forced into zero-R wins. Unprotected reference percentages are not mixed with protected risk-normalized R or claimed as portfolio returns.

The separate resting-limit experiment posts known levels only after the alert, expires after 30 minutes and requires trade-through rather than exact-touch fills. Unfilled orders do not count as participation. A gap through protection remains a loss, not a discarded sample. Maker-entry/target assumptions and all-taker stress are distinct; queue position and exchange fills remain unverified.

## Results

Pooled five-asset net PF, development / validation:

| Protected diagnostic | Development | Validation |
|---|---:|---:|
| UTC opening-range breakout | 0.170 | 0.119 |
| VWAP pullback | 0.448 | 0.418 |
| RSI2 dip, native 5m | 0.183 | 0.147 |
| Quiet-range band reversal | 0.567 | 0.478 |
| Previous-day sweep | 0.554 | 0.433 |
| H1 EMA100 / 5m reclaim | 0.462 | 0.445 |
| RSI2 protected 1h | 0.669 | 0.529 |
| ADX/EMA stop-entry 4h | 0.802 | 0.825 |
| Resting-limit band reversal | 0.650 | 0.525 |

All higher-timeframe and limit variants are in their complete summaries. None qualifies across development and validation; all protected pooled validation PFs are below 1.0. Isolated good cells are not promoted. Example: BTC intended SMA reference has development PF 1.279, validation 0.551 with an open position, then later PF 6.395 on 19 closures. Selecting only that later cell would hide failure and low sample size.

Required screening: development >=50 / validation >=30 resolved trades, net PF >=1.2, stress PF >1 and positive mean R. Four passing roles must then survive the **existing canonical arbitrator and shared cooldown/active-signal policy**, with >=1 qualified signal/day and >=70% active days. No roles passed the first screen, so no combined participation or production-arbitration approval is claimed. Lowering costs or gates after seeing results is not approval.

These diagnostics do not disprove discretionary authors or an exact implementation that was not reproduced. They show these disclosed, executable interpretations do not meet this product's requirements.

## Reproduce and verify

From repository root, with Python 3 and NumPy installed:

```sh
python3 scripts/research/public-playbooks/acquire.py ../research-data/public-playbooks
python3 scripts/research/public-playbooks/study.py ../research-data/public-playbooks
python3 scripts/research/public-playbooks/references.py ../research-data/public-playbooks
python3 scripts/research/public-playbooks/higher.py ../research-data/public-playbooks
python3 scripts/research/public-playbooks/limits.py ../research-data/public-playbooks
npm run test:public-playbooks
```

Frozen protocols specify exact mechanics, limits and source hashes. Evidence gzip files contain individual trades; companion summaries omit trade arrays. Tests independently recompute PF and cash flows, and cover causal fills, funding signs/boundaries, incomplete higher-timeframe rejection and unresolved positions. Passing software tests does not mean passing trading performance.

No production strategy was removed or replaced by a failing candidate. No new production scanner, order engine or parallel signal publisher was introduced. Genuine forward observations, provider fills, deployed database/Telegram validation and release approval remain unperformed. The remaining work is discovering and validating an edge, then porting passing rules into the existing TypeScript registry and proving canonical replay/arbitration parity. This report is not a claim that credentials alone finish Release 1.
