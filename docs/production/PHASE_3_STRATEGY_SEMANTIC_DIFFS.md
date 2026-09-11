# Phase 3 strategy semantic freeze

No parameter was tuned and no profitability/certification claim is made.

| Strategy | Old browser behavior | Old scanner behavior | Chosen canonical behavior | Expected impact / tests |
|---|---|---|---|---|
| LondonBreakout / `forex.london-breakout` | `evaluators.ts`: fixed recent Asian slice, wick filter, browser EMA/ATR/RSI, 07–10 UTC, configurable R values. | `forex-research-strategies.ts` through a “certify” wrapper: session-aware range, body/extension/ATR gates, instrument rounding, score 82. | Existing production behavior, version 1.0.0, now reached through `CANONICAL_STRATEGIES`. Canonical indicators are calculated from the canonical closed market view. | Historical browser entries can change. Golden tests freeze deterministic/no-lookahead behavior; existing forex production suite freezes production provenance. |
| NYContinuation / `forex.new-york-continuation` | Fixed 12–16 UTC EMA pullback and displacement, score 90. | Session/trend/session-move/ATR continuation gates, score 80. | Existing production behavior through canonical registry. | Browser result count/price can change; no parameter compensation. |
| FXTrendPullback / `forex.trend-pullback` | EMA cross, permissive prior wick proximity, RSI 48/52, ATR 1.1 stop, TP 2R/3.8R, score 90. | Canonical session, trend/pullback depth, momentum, swing-aware stop, TP 1.2R/2.1R, score 84. | Existing production behavior through canonical registry. | Material browser performance difference expected and intentional. Replay/live trace equality is tested. |
| GoldVolatilityBreakout / `gold.volatility-breakout` | 16-bar box and configurable ATR/R targets. | Dedicated production gold evaluator with MT5 metadata/event/false-break filters. | Dedicated production evaluator behind canonical registry. | Browser results can change; existing bidirectional gold fixtures retained. |

## Indicator differences

- Browser EMA seeded with an SMA, matching `emaRootV1`; canonical engine owns it now for migrated strategies.
- Browser RSI used a simple trailing-period gain/loss average and returned 50 for short history. The root implementation is deliberately retained as production truth; insufficient warm-up is now a structured no-trade before evaluation.
- Browser ATR used a trailing simple average; root `atrRootV1` is production truth. Canonical market-view close filtering is now applied before calculation.
- Browser evaluators inferred the most recent candle from array position. Canonical behavior filters every timeframe by `open + width <= asOf`.

## Not migrated

CryptoMicroScalper, CryptoCompressionBreakout, CryptoSwingContinuation, CryptoReversalExhaustion, CryptoMomentumBreakout, FXMicroScalper, SessionORB, and MacroYieldDifferential remain dual-owned/research-only or require a production semantic selection. Their old browser branches remain active and are not presented as canonical.
