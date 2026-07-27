# Strategy Inventory

## Status vocabulary

- **Enabled / live-publishable:** registered with lifecycle `ENABLED`; actual evaluation also depends on `strategy_configs.enabled` and timeframe/symbol eligibility.
- **Research / shadow:** evaluated for diagnostics when eligible, explicitly excluded before arbitration and publication.
- **Configurable:** values shown are repository fallbacks; a `strategy_configs` row may override them. No database state was inspected.
- **All scanner crypto symbols:** empty `allowed_symbols` means registry eligibility does not restrict symbols; upstream scanner universe and market filters still apply.

## Authoritative inventory

| Name | Internal identifier | Version | Asset class | Markets / symbols | Timeframes | Current status | Principal dependencies | Outputs |
|---|---|---:|---|---|---|---|---|---|
| MicroScalper | `crypto.micro-scalper` | `1.0.0` | Crypto | Crypto spot/perpetual scanner universe; all scanner crypto symbols | `5m`, `15m` | Enabled, configurable, live-publishable | Binance candles; 15m candles for 5m HTF gate; EMA20/50, ATR14, RSI14, momentum/regime; registry; distance guard; arbitrator | Candidate/rejection, direction, entry band, SL, TP1/TP2, RR, score/grade, evidence, expiry |
| QuickScalp | `crypto.quick-scalp` | `1.0.0` | Crypto | Same dynamic crypto universe | `5m`, `15m` | Enabled, configurable, live-publishable | Binance candles; EMA20/50, ATR14, RSI14, momentum; registry and downstream gates | Same legacy/professional result fields |
| CompressionBreakout | `crypto.compression-breakout` | `1.0.0` | Crypto | Same dynamic crypto universe | `15m`, `1h` in evaluator (configuration may narrow) | Enabled, configurable, live-publishable | Binance candles; EMA, ATR, RSI, box/range, volume/momentum; registry and downstream gates | Same legacy/professional result fields |
| SwingContinuation | `crypto.swing-continuation` | `1.0.0` | Crypto | Same dynamic crypto universe | `15m`, `1h` in evaluator (configuration may narrow) | Enabled, configurable, live-publishable | Binance candles; EMA20/50 and slope, ATR14, RSI14, pullback/reclaim/momentum; registry and downstream gates | Same legacy/professional result fields |
| CryptoTrendPullback | `crypto.trend-pullback` | `0.1.0-research` | Crypto | Same dynamic crypto universe | `15m`, `1h` | Research/shadow; never published | Shared strategy indicators, candle freshness/validity, registry diagnostics | Normalized research candidate/rejection; fixed research evidence and expiry |
| ReversalExhaustion | `crypto.reversal-exhaustion` | `0.1.0-research` | Crypto | Same dynamic crypto universe | `15m`, `1h` | Research/shadow; never published | RSI14, ATR14, recent high/low, candle freshness/validity, registry diagnostics | Normalized research candidate/rejection |
| ForexMicroScalper | `forex.micro-scalper` | `1.0.0` | Forex (including eligible upstream Forex universe) | Fallback allowlist: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD, EURJPY, GBPJPY, XAUUSD | Active Forex plan defaults `15m`, `1h`; evaluator accepts `5m`, `15m` (see gap) | Enabled, configurable, live-publishable where scanner and evaluator overlap | Twelve Data candles; Forex pip/precision helpers; EMA20/50, ATR14, RSI14, momentum/structure; registry and downstream gates | Candidate/rejection plus pip-distance diagnostics and plan levels |
| ForexSwingContinuation | `forex.swing-continuation` | `1.0.0` | Forex (including gold if configured) | Same fallback allowlist | `15m`, `1h` | Enabled, configurable, live-publishable | Twelve Data candles; Forex helpers; EMA trend/slope, ATR/pips, RSI, pullback/reclaim; registry and downstream gates | Candidate/rejection plus pip-distance/session diagnostics and plan levels |
| London Breakout | `forex.london-breakout` | `0.1.0-research` | Forex majors | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD | `15m` | Research/shadow; never published | Forex domain context; closed candles; session/DST engine; spread and provider-budget metadata; ATR; Asian range | Normalized research candidate/rejection |
| New York Continuation | `forex.new-york-continuation` | `0.1.0-research` | Forex majors | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD | `15m`, `1h` | Research/shadow; never published | Forex context, session engine, EMA20/50 trend state, ATR, recent closed candles, spread/provider gates | Normalized research candidate/rejection |
| Forex Trend Pullback | `forex.trend-pullback` | `0.1.0-research` | Forex majors | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD | `15m`, `1h` | Research/shadow; never published | Forex context, session engine, EMA20/50, ATR, RSI14, swing structure, spread/provider gates | Normalized research candidate/rejection |
| Gold Volatility Breakout | `gold.volatility-breakout` | `0.1.0-research` | Gold / metal CFD | XAUUSD only | `15m` | Research/shadow; never published | Forex domain context and precision; liquid sessions; ATR volatility state; 30-bar range; spread/provider gates | Normalized research candidate/rejection |

## Shared input and output surfaces

All definitions consume a `StrategyEvaluationContext`: normalized symbol, market (`crypto` or `forex`), timeframe, ordered OHLCV candles, shared indicator snapshot, and evaluation timestamp. The snapshot exposes EMA20, EMA50, ATR14, RSI14, recent high/low, average volume, body size, ATR percent, compression ratio, momentum score, volatility state, and regime. Individual live evaluators may recompute indicators from candles.

The registry wraps the legacy result in a `ProfessionalStrategyResult`: immutable identity/version, market/symbol/timeframe, `BUY`/`SELL`/`NO_TRADE`, rejection reasons, confidence, grade, entry range, stop, TP1, TP2, RR, expiry, evidence, diagnostics, and the complete legacy payload. It does **not** yet carry sizing, leverage, order instructions, protection/management policy, provenance IDs, or reporting correlation IDs.

## Non-strategies deliberately excluded

`TrendContinuation` in manual-signal UI defaults, `Manual`, ICT labels, arbitrator market preferences, risk profiles, and browser-only backtest evaluators are not active scanner strategy definitions. `ForexProviderGate` is an operational rejection record rather than a trade strategy. Nothing under `v2/` was inspected as active-runtime evidence.

