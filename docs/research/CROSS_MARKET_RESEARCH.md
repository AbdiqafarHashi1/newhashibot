# Forex Personal/Prop and crypto leverage research

This continuation starts from merged PR #261. It does not activate production trading or promote failed configurations.

The Forex implementation now shares all six production evaluators with replay, forwards canonical calibration parameters in production, and respects supported hourly primary timeframes instead of relabeling hourly bars as 15-minute bars. The London breakout uses the current day's Asian range and the DST-aware London opening. Forex timezone formatters are reused without changing calendar rules. New semantic strategy-role routing remains behind the strategy's explicit adaptation marker.

The crypto 5-minute campaign uses separate March/June/September 2026 development/validation/holdout files from the official Binance futures archive. It includes MicroScalper's closed 15-minute context, bounded parameter candidates, conservative protection simulation and estimated costs. The selected combined configuration failed promotion. `CRYPTO_LEVERAGE_2026-10-18.json` contains the complete protocol, configurations, outcomes, source hashes and account scenarios. No live leverage cap changed.

| September scenario | Ending return | Trades before modeled stop |
|---|---:|---:|
| 10x, 0.5% stop-risk sizing | -9.53% | 35 |
| 20x, 0.5% stop-risk sizing | -9.53% | 35 |
| 10x, 95% margin utilization | -14.12% | 3 |
| 20x, 95% margin utilization | -12.21% | 2 |

These are research scenarios capped by an explicit 10% total-loss rule, not a claim about maximum achievable portfolio return. Liquidation uses a hypothetical isolated-margin model with OHLC as a proxy for mark price and assumed 0.5% maintenance margin; native exchange tiers, collateral and mark-price certification are absent. Fees/slippage/funding are explicit estimates. Larger leverage cannot multiply profit when risk-based position size stays unchanged. Aggressive margin use intentionally increases position risk and is not enabled in production.

A shared optional cost-payoff gate rejects candidates whose configured estimated round-trip cost exceeds the projected 50% TP1 / 50% final-target payoff, or a declared minimum net payoff. Production and replay read the same configuration fields. No estimated cost is silently invented for an unconfigured provider.

Forex uses separately labeled public indicative Yahoo OHLC, not executable broker bid/ask data or a new live scanner feed. Gold XAUUSD history is unavailable from that source; gold futures are not substituted. Personal and Prop simulations use distinct risk/leverage policies. Repeated Prop scenarios use custom assumed 10% / 5% targets, UTC reset, 5% firm daily loss, 10% total loss and 1% internal daily entry lock. They are not FTMO/FundedNext certification; news and broker-specific restrictions are unverified. Only complete chronological 30-day windows count, and overlapping starts are disclosed. The Forex campaign completed: 89,268 indicative bars across EURUSD, GBPUSD, USDJPY, AUDUSD and USDCAD, 15-minute/hourly datasets, with 21 profile evaluations. All evaluated settings failed promotion; London lacked sufficient development trades, and Gold remains blocked by missing exact XAUUSD history. The hourly strategies supplied 300 overlapping custom challenge windows: zero passes and 300 incomplete attempts. These are not independent trials or completed challenge failures.

The final chronological combined scanner diagnostic processes both timeframes together, with cross-timeframe symbol reservations and actual simulated exits. It produced 202 trades, profit factor 0.7367, Personal return -5.58%, and Prop return -2.37% over the shared October 1–16 period. That period is too short for a complete 30-day challenge and has already been examined; it is not new unseen promotion evidence. Results are in `FOREX_COMBINED_SCANNER_2026-10-18.json`; individual frozen configurations and source identities are in `FOREX_PERSONAL_PROP_2026-10-18.json`.

Individual quote-level evaluations are pinned to commit `51125077719fa1561c7b277619b2ede565b1a3ac`; 18 cached stage results were checked for exact equality. Account results were revalued using the recorded current account-model hash after adding a pre-entry remaining-total-loss budget check. This does not change frozen signals or strategy parameters. Account simulations use R-based approximations rather than native MT5 currency conversion/lot sizing. Daily equity checks use trade-level adverse-excursion proxies, not a certified intraday firm equity timeline.

Research processes now take an exclusive workspace lock and publish reports atomically. After an interrupted process, verify the recorded PID is no longer running before manually removing a stale lock. The preserved data archive contains 141,684 Forex/crypto candles and manifests; its SHA-256 is `de2dc767027b705ba7db72ecf89d0e0d80c5e99e60596b59795743fe73104ae2`. These historical inputs are not a replacement for an uninterrupted MT5/VPS production feed.

Run the offline tools from the repository root:

```sh
python3 scripts/research/import-forex-history.py --output .tmp/cross-market/forex
cp scripts/research/cross-market-protocol.json .tmp/cross-market/protocol.json
node --import tsx scripts/research/forex-personal-prop-campaign.ts .tmp/cross-market/forex .tmp/cross-market/forex-results.json
```

Crypto archive download commands follow `import-binance-archive.py --help`: use BTCUSDT/ETHUSDT, futures/um, 5m, months 2026-03, 2026-06 and 2026-09. Then run `crypto-leverage-campaign.ts <directory> <report.json>`. Forex research caches are keyed by full shared-engine source, runner source, configuration, stage and source manifest identities. Historical source queries roll over time; reproduce recorded results against the recorded raw source hashes rather than assuming a fresh `60d` query is the same dataset.

After a frozen signal campaign, account-only revaluation and the chronological diagnostic can be run with:

```sh
node --import tsx scripts/research/revalue-account-scenarios.ts forex .tmp/cross-market/forex-results.json
node --import tsx scripts/research/forex-chronological-scanner.ts .tmp/cross-market/forex .tmp/cross-market/forex-chronological-results.json
```

No strategy was promoted, production leverage increased, deployment performed, or live order placed. Supabase activation, native broker/demo connections, Gold data and authenticated payment/Telegram/UI verification remain necessary; passing software checks does not establish profitable trading.
