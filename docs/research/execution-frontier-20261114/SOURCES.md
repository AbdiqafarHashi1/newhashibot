# Primary research and implementation sources

- Concretum author implementation, noise-area intraday momentum: https://concretumgroup.com/python-backtesting-beat-the-market-an-effective-intraday-momentum-strategy-for-the-sp500-etf-spy/ . Tested as an FX adaptation, not a SPY replication. No source-return claim is transferred to HashiBot.
- QuantConnect opening-range/stocks-in-play implementation: https://www.quantconnect.com/research/18444/opening-range-breakout-for-stocks-in-play/ . Its traded-volume stock universe is different from broker FX quotes.
- Concretum short-side filter study: https://concretumgroup.com/conditional-profitability-of-intraday-shorts/ . Adding trend/volatility filters must be tested rather than assumed beneficial.
- Freqtrade lookahead analysis: https://www.freqtrade.io/en/latest/lookahead-analysis/ and recursive analysis: https://www.freqtrade.io/en/stable/recursive-analysis/ . Motivates future-mutation and bounded-history consistency checks.
- Freqtrade protections: https://www.freqtrade.io/en/stable/plugins/ . Risk responses are distinct from evidence of predictive edge.
- Hummingbot market making: https://hummingbot.org/strategies/v1-strategies/pure-market-making/ and inventory skew: https://hummingbot.org/strategies/v1-strategies/strategy-configs/inventory-skew/ . Not transplanted into a candle-only MT5 model without order-book, fee and inventory simulation.
- AQR trend-following research: https://www.aqr.com/insights/research/journal-article/a-century-of-evidence-on-trend-following-investing . A lead for diversification/longer horizons, not a monthly-income promise.
- Gold daily forecast-to-fill preprint: https://arxiv.org/abs/2511.08571 . Daily horizons and incompletely reproduced results make its headline unsuitable as evidence for HashiBot scalping; no claimed replication.
- Exness official tick-history documentation: https://get.exness.help/hc/en-us/articles/360021547851-Tick-history . Reference server quotes may differ from actual customer broker feeds/fills. Exact archives used are in data-manifests.json.
